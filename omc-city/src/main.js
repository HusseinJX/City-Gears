import * as THREE from 'three';
import { CONFIG, MAPBOX_TOKEN } from './config.js';
import { metersToLngLat, lngLatToMeters } from './geo.js';
import { createGameLayer } from './mapbox-layer.js';
import { createCharacter } from './character.js';
import { createController } from './controller.js';
import { createNPCs } from './npcs.js';
import { createMotorcycle } from './motorcycle.js';
import { createCar } from './car.js';
import {
  attachAudioUnlock, playDialogOpen,
  startEngine, stopEngine, setEngineThrottle,
  playGearShift,
} from './audio.js';

// mapboxgl is loaded as a global via the <script> tag in index.html.
mapboxgl.accessToken = MAPBOX_TOKEN;

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/standard',
  center: [-122.4020, 37.7935],
  zoom: 19.5,
  pitch: 75,
  bearing: 0,
  antialias: true,
});

map.on('load', () => {
  // 3D terrain
  map.addSource('mapbox-dem', {
    type: 'raster-dem',
    url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
    tileSize: 512,
  });
  map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.0 });

  // ── Synthetic city data ──────────────────────────────────────────────────
  // NPCs walk on a grid of fake blocks around SF center (game meters).
  const syntheticBlocks = [];
  for (let i = -4; i <= 4; i++) {
    for (let j = -4; j <= 4; j++) {
      syntheticBlocks.push({
        x: i * 80, z: j * 90,
        width: 60, depth: 70,
      });
    }
  }

  // Shop owners scattered across the grid.
  const syntheticShops = CONFIG.shops.names.map((name, i) => ({
    name,
    dialog: CONFIG.shops.dialog[i % CONFIG.shops.dialog.length],
    signColor: CONFIG.shops.signColors[i % CONFIG.shops.signColors.length],
    ownerPos: { x: (i % 6 - 2.5) * 80, z: (Math.floor(i / 6) - 1) * 90 },
    facingYaw: 0,
  }));

  const cityInfo = {
    blocks: syntheticBlocks,
    shops: syntheticShops,
    obstacles: [],
    buildingAABBs: [],
    streetPolylines: [],
    spawn: { x: 0, z: 0 },
  };

  // Disable Mapbox controls that conflict with the game.
  map.dragPan.disable();
  map.scrollZoom.disable();
  map.doubleClickZoom.disable();
  map.keyboard.disable();

  // ── Terrain helpers ───────────────────────────────────────────────────────
  // Returns actual elevation (meters above sea level) at a game-meter position.
  function getGroundY(x, z) {
    try {
      const [lon, lat] = metersToLngLat(x, z);
      const elev = map.queryTerrainElevation([lon, lat], { exaggerated: false });
      return elev != null ? elev : 0;
    } catch (_) { return 0; }
  }

  // ── Building collision ────────────────────────────────────────────────────
  // Load footprints from sf.json (same OSM data Mapbox renders) — reliable,
  // works off-screen, no dependency on what tiles are currently visible.

  let buildingFootprints = []; // rings of [x, z] game-meter coords

  fetch('./src/data/sf.json')
    .then(r => r.json())
    .then(sfData => {
      const rings = [];
      for (const w of sfData.ways || []) {
        if (!w.tags?.building) continue;
        const nodes = w.nodes;
        if (!nodes || nodes.length < 3) continue;
        rings.push(nodes.map(n => [n.x, n.z]));
      }
      buildingFootprints = rings;

      // Spawn (0,0) may be inside a building — find the closest road node that is clear.
      if (isBlocked(character.group.position.x, character.group.position.z)) {
        const prefer = new Set(['primary', 'secondary', 'tertiary', 'residential']);
        let best = null, bestDist = Infinity;
        for (const w of sfData.ways || []) {
          if (!w.tags?.highway || !prefer.has(w.tags.highway) || !w.nodes) continue;
          for (const n of w.nodes) {
            if (isBlocked(n.x, n.z)) continue;
            const d = n.x * n.x + n.z * n.z;
            if (d < bestDist) { bestDist = d; best = n; }
          }
        }
        if (best) {
          character.group.position.x = best.x;
          character.group.position.z = best.z;
        }
      }
    })
    .catch(() => {});

  function pointInRing(px, pz, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, zi] = ring[i], [xj, zj] = ring[j];
      if ((zi > pz) !== (zj > pz) && px < (xj - xi) * (pz - zi) / (zj - zi) + xi)
        inside = !inside;
    }
    return inside;
  }

  // Test center + 4 cardinal offsets so the character can't clip corners.
  const isBlocked = (x, z, r = 0.4) => {
    const pts = r > 0
      ? [[x, z], [x + r, z], [x - r, z], [x, z + r], [x, z - r]]
      : [[x, z]];
    for (const [px, pz] of pts) {
      for (const ring of buildingFootprints) {
        if (pointInRing(px, pz, ring)) return true;
      }
    }
    return false;
  };

  // ── Mouse-look ────────────────────────────────────────────────────────────
  // Left-drag anywhere on the map canvas rotates the bearing.
  {
    let dragging = false, lastX = 0;
    const mc = map.getCanvas();
    mc.addEventListener('mousedown', (e) => { if (e.button === 0) { dragging = true; lastX = e.clientX; } });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX; lastX = e.clientX;
      if (playerMode === 'walk') {
        walkBearing += dx * 0.005; // rotate walk camera directly
      } else {
        map.setBearing(map.getBearing() - dx * 0.3);
      }
    });
    window.addEventListener('mouseup', () => { dragging = false; });
    window.addEventListener('blur',    () => { dragging = false; });
  }

  // ── Camera ────────────────────────────────────────────────────────────────
  let cameraBearing = 0;
  let walkBearing = 0; // radians; auto-follows character facing in walk mode
  const fakeCameraRig = {
    getYaw: () => playerMode === 'drive'
      ? -map.getBearing() * Math.PI / 180
      : walkBearing,
  };

  // ── Game objects ─────────────────────────────────────────────────────────
  const character = createCharacter();
  character.group.position.set(0, CONFIG.city.sidewalkHeight, 0);

  const controller = createController(fakeCameraRig, { isBlocked });

  // NPCs: createNPCs expects a scene to call .add() on.
  // Capture the group via a proxy so we can add it to the Three.js layer scene.
  let npcGroup = null;
  const sceneProxy = { add: (g) => { npcGroup = g; } };
  const npcs = createNPCs(sceneProxy, cityInfo, syntheticShops, { isBlocked });

  const motorcycle = createMotorcycle({ isBlocked });
  motorcycle.group.position.set(2, 0, -3.0);
  motorcycle.state.yaw = 0;
  motorcycle.group.rotation.y = 0;

  const car = createCar({ isBlocked });
  car.group.position.set(4.5, 0, -4.5);
  car.state.yaw = 0;
  car.group.rotation.y = 0;

  const vehicles = [motorcycle, car];

  // ── Mapbox custom layer ───────────────────────────────────────────────────
  const gameLayer = createGameLayer(map, { character, motorcycle, car, npcGroup });
  map.addLayer(gameLayer);

  attachAudioUnlock(map.getCanvas());

  // ── Minimap ───────────────────────────────────────────────────────────────
  const minimapCanvas = document.getElementById('minimap');
  const mmCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;
  const MM_SIZE = 160;
  const MM_R = MM_SIZE / 2;
  const MM_WORLD_RANGE = 120;

  function worldToMM(wx, wz, cx, cz) {
    return {
      sx: MM_R + (wx - cx) * (MM_R / MM_WORLD_RANGE),
      sy: MM_R + (wz - cz) * (MM_R / MM_WORLD_RANGE),
    };
  }

  function drawMinimap(playerX, playerZ) {
    if (!mmCtx) return;
    mmCtx.clearRect(0, 0, MM_SIZE, MM_SIZE);

    mmCtx.save();
    mmCtx.beginPath();
    mmCtx.arc(MM_R, MM_R, MM_R, 0, Math.PI * 2);
    mmCtx.clip();

    mmCtx.fillStyle = '#1e2028';
    mmCtx.fillRect(0, 0, MM_SIZE, MM_SIZE);

    // Shop dots
    for (const shop of syntheticShops) {
      const { sx, sy } = worldToMM(shop.ownerPos.x, shop.ownerPos.z, playerX, playerZ);
      if (sx < 0 || sx > MM_SIZE || sy < 0 || sy > MM_SIZE) continue;
      mmCtx.beginPath();
      mmCtx.arc(sx, sy, 3.5, 0, Math.PI * 2);
      mmCtx.fillStyle = '#ffd28a';
      mmCtx.fill();
    }

    // Player dot (center)
    mmCtx.beginPath();
    mmCtx.arc(MM_R, MM_R, 5, 0, Math.PI * 2);
    mmCtx.fillStyle = '#4af0a0';
    mmCtx.fill();
    mmCtx.strokeStyle = '#fff';
    mmCtx.lineWidth = 1.5;
    mmCtx.stroke();

    mmCtx.restore();

    mmCtx.beginPath();
    mmCtx.arc(MM_R, MM_R, MM_R - 1, 0, Math.PI * 2);
    mmCtx.strokeStyle = 'rgba(255,255,255,0.3)';
    mmCtx.lineWidth = 1.5;
    mmCtx.stroke();
  }

  // ── HUD elements ─────────────────────────────────────────────────────────
  const hudFps        = document.getElementById('hud-fps');
  const hudPos        = document.getElementById('hud-pos');
  const hudPrompt     = document.getElementById('hud-prompt');
  const hudGear       = document.getElementById('hud-gear');
  const hudGearVal    = document.getElementById('hud-gear-val');
  const hudTach       = document.getElementById('hud-tach');
  const hudTachCover  = document.getElementById('hud-tach-cover');
  const hudTachGear   = document.getElementById('hud-tach-gear');
  const hudRpmNum     = document.getElementById('hud-rpm-num');
  const hudSpeedNum   = document.getElementById('hud-speed-num');
  const hudShiftLight = document.getElementById('hud-shift-light');
  const hudLugLight   = document.getElementById('hud-lug-light');
  const hudStall      = document.getElementById('hud-stall');
  const dialogBox     = document.getElementById('dialog');
  const dialogName    = document.getElementById('dialog-name');
  const dialogText    = document.getElementById('dialog-text');
  const dialogSaleHint = document.getElementById('dialog-sale-hint');
  const saleIframeWrap = document.getElementById('sale-iframe-wrap');
  const saleIframe    = document.getElementById('sale-iframe');
  const saleIframeClose = document.getElementById('sale-iframe-close');
  const saleIframeTitle = document.getElementById('sale-iframe-title');
  const SALE_URL = 'http://localhost:8788/business/132';

  let currentNearShop = null;
  let dialogOpen = false;
  let saleAvailable = false;

  function closeSaleIframe() {
    if (saleIframeWrap) saleIframeWrap.style.display = 'none';
    if (saleIframe) saleIframe.src = 'about:blank';
  }
  function openSaleIframe(shopName) {
    if (!saleIframeWrap || !saleIframe) return;
    if (saleIframeTitle) saleIframeTitle.textContent = `${shopName} — Sale`;
    saleIframe.src = SALE_URL;
    saleIframeWrap.style.display = 'block';
  }
  if (saleIframeClose) saleIframeClose.addEventListener('click', closeSaleIframe);

  let playerMode = 'walk';   // 'walk' | 'drive'
  let currentVehicle = null;

  function openDialog(shop) {
    if (!shop || dialogOpen) return;
    dialogOpen = true;
    if (dialogName) dialogName.textContent = shop.name;
    if (dialogText) dialogText.textContent = `"${shop.dialog}"`;
    if (dialogBox) dialogBox.style.display = 'block';
    saleAvailable = true;
    if (dialogSaleHint) dialogSaleHint.style.display = 'block';
    playDialogOpen();
  }
  function closeDialog() {
    dialogOpen = false;
    saleAvailable = false;
    if (dialogBox) dialogBox.style.display = 'none';
    if (dialogSaleHint) dialogSaleHint.style.display = 'none';
    closeSaleIframe();
  }

  function distSq(ax, az, bx, bz) {
    const dx = ax - bx, dz = az - bz;
    return dx * dx + dz * dz;
  }

  function nearestMountableVehicle() {
    let best = null, bestSq = Infinity;
    for (const v of vehicles) {
      const dsq = distSq(
        character.group.position.x, character.group.position.z,
        v.group.position.x, v.group.position.z
      );
      const mr = v.mountDistance;
      if (dsq < mr * mr && dsq < bestSq) { best = v; bestSq = dsq; }
    }
    return best;
  }

  let dismountHintUntil = 0;

  function mountVehicle(v) {
    playerMode = 'drive';
    currentVehicle = v;
    v.state.yaw = v.group.rotation.y;
    v.state.steer = 0;
    v.setGear(1);
    character.setPose('sit');
    // Seed cameraBearing from current map bearing so no jump at mount
    cameraBearing = -map.getBearing() * Math.PI / 180;
    startEngine();
    dismountHintUntil = performance.now() + 2500;
  }

  function dismountVehicle() {
    const v = currentVehicle;
    if (!v) return;
    playerMode = 'walk';
    character.setPose('walk');
    v.group.rotation.z = 0;
    const side = v.kind === 'car' ? 2.0 : 1.2;
    const sideYaw = v.state.yaw + Math.PI / 2;
    character.group.position.set(
      v.group.position.x + Math.sin(sideYaw) * side,
      CONFIG.city.sidewalkHeight,
      v.group.position.z + Math.cos(sideYaw) * side
    );
    character.group.rotation.y = v.state.yaw + Math.PI;
    v.state.speed = 0;
    v.state.steer = 0;
    walkBearing = v.state.yaw; // sync walk camera to vehicle direction, no jump
    stopEngine();
    currentVehicle = null;
  }

  controller.onInteract(() => {
    if (dialogOpen) { closeDialog(); return; }
    if (playerMode === 'drive') { dismountVehicle(); return; }
    const nearV = nearestMountableVehicle();
    if (nearV) { mountVehicle(nearV); return; }
    if (currentNearShop) openDialog(currentNearShop);
  });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && dialogOpen) closeDialog();
    if (e.code === 'KeyF' && dialogOpen && saleAvailable && !e.repeat) {
      openSaleIframe(dialogName ? dialogName.textContent : 'Shop');
    }
    if (playerMode === 'drive' && currentVehicle && !e.repeat) {
      const gearMap = { Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4, Digit5: 5, Digit6: 6, Digit7: 7 };
      const g = gearMap[e.code];
      if (g != null) {
        const sameGear = g === currentVehicle.state.gear;
        if (!sameGear || (currentVehicle.state.stalled && g === 1)) {
          currentVehicle.setGear(g);
          playGearShift();
        }
      }
    }
  });

  // ── Game loop ────────────────────────────────────────────────────────────
  let fpsAccumTime = 0, fpsAccumFrames = 0;
  const clock = new THREE.Clock();
  const shopRadius = CONFIG.interaction.radius;

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);

    if (playerMode === 'walk' || !currentVehicle) {
      controller.update(dt, character.group);
      // Snap y to real terrain so character sits on SF streets, not sea level.
      // Reset yVel so the controller's gravity doesn't fight the snap.
      character.group.position.y = getGroundY(character.group.position.x, character.group.position.z);
      controller.state.yVel = 0;
      controller.state.isGrounded = true;
      character.update(dt, controller.state.distanceWalked, controller.state.isMoving);
      // cameraBearing not set here — walk mode reads map.getBearing() via fakeCameraRig
    } else {
      const v = currentVehicle;
      const input = controller.getInput();
      v.drive(dt, input);

      // Snap vehicle to terrain
      v.group.position.y = getGroundY(v.group.position.x, v.group.position.z);

      // Sync character to vehicle seat
      character.group.position.x = v.group.position.x;
      character.group.position.z = v.group.position.z;
      character.group.position.y = v.group.position.y + v.seatHeight;
      character.group.rotation.y = v.state.yaw + Math.PI;
      character.update(dt, 0, false);

      // Camera follows vehicle yaw (smooth)
      const dyaw = v.state.yaw - cameraBearing;
      const wrap = ((dyaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      cameraBearing += wrap * (1 - Math.exp(-dt * v.cameraFollowLerp));

      // Engine audio
      const rpmFrac = v.state.stalled ? 0 : Math.max(0, Math.min(1,
        (v.state.rpm - v.cfg.idleRpm) / (v.cfg.redlineRpm - v.cfg.idleRpm)
      ));
      setEngineThrottle(rpmFrac);
    }

    npcs.update(dt);

    // Shop proximity (walk mode only)
    let nearShop = null;
    if (playerMode === 'walk' && !dialogOpen) {
      const px = character.group.position.x;
      const pz = character.group.position.z;
      let bestSq = shopRadius * shopRadius;
      for (const shop of syntheticShops) {
        const dx = shop.ownerPos.x - px;
        const dz = shop.ownerPos.z - pz;
        const dsq = dx * dx + dz * dz;
        if (dsq < bestSq) { bestSq = dsq; nearShop = shop; }
      }
    }

    currentNearShop = nearShop;

    // Follow camera via Mapbox.
    const viewBearing = playerMode === 'drive' ? cameraBearing : walkBearing;
    const LOOK_AHEAD  = playerMode === 'drive' ? 20 : 8;
    const centerX = character.group.position.x - Math.sin(viewBearing) * LOOK_AHEAD;
    const centerZ = character.group.position.z - Math.cos(viewBearing) * LOOK_AHEAD;
    const [lon, lat] = metersToLngLat(centerX, centerZ);

    character.group.visible = true;

    if (playerMode === 'drive') {
      map.jumpTo({
        center: [lon, lat],
        pitch: 75,
        zoom: 19.5,
        bearing: -cameraBearing * (180 / Math.PI),
      });
    } else {
      // GTA over-shoulder: camera behind and above, bearing driven by walkBearing.
      map.jumpTo({ center: [lon, lat], pitch: 65, zoom: 20.5, bearing: -walkBearing * 180 / Math.PI });
    }

    // ── HUD updates ────────────────────────────────────────────────────────
    let promptMsg = null;
    if (!dialogOpen) {
      if (playerMode === 'drive') {
        if (performance.now() < dismountHintUntil) promptMsg = 'Press E to get out';
      } else if (nearShop) {
        promptMsg = `Press E to talk to ${nearShop.name}`;
      } else {
        const nearV = nearestMountableVehicle();
        if (nearV) {
          promptMsg = nearV.kind === 'car'
            ? 'Press E to drive the car'
            : 'Press E to ride the motorcycle';
        }
      }
    }

    if (hudPrompt) {
      if (promptMsg) { hudPrompt.textContent = promptMsg; hudPrompt.style.display = 'block'; }
      else hudPrompt.style.display = 'none';
    }

    if (playerMode === 'drive' && currentVehicle) {
      const v = currentVehicle;
      if (hudGear) hudGear.style.display = 'block';
      if (hudTach) hudTach.style.display = 'block';
      const g = v.state.gear;
      const gLabel = g === 7 ? 'R' : String(g);
      if (hudGearVal) hudGearVal.textContent = gLabel;
      if (hudTachGear) hudTachGear.textContent = g === 7 ? 'REVERSE' : `GEAR ${g}`;

      const rpmPct = Math.max(0, Math.min(1, v.state.rpm / (v.cfg.redlineRpm + 500)));
      if (hudTachCover) hudTachCover.style.width = `${(1 - rpmPct) * 100}%`;
      if (hudRpmNum) hudRpmNum.textContent = `${Math.round(v.state.rpm)} rpm`;
      if (hudSpeedNum) {
        const kmh = Math.abs(v.state.speed) * 3.6 * 4;
        hudSpeedNum.textContent = `${Math.round(kmh)} km/h`;
      }

      const nearRedline = !v.state.stalled && v.state.rpm >= v.cfg.shiftLightRpm && g < 6 && g !== 7;
      if (hudShiftLight) hudShiftLight.style.display = nearRedline ? 'block' : 'none';

      const isLugging = !v.state.stalled
        && v.state.rpm < v.cfg.lugWarnRpm
        && g >= v.cfg.stallGearMin && g <= 6
        && Math.abs(v.state.speed) > 0.2;
      if (hudLugLight) hudLugLight.style.display = (isLugging && !nearRedline) ? 'block' : 'none';

      if (hudStall) hudStall.style.display = v.state.stalled ? 'block' : 'none';
    } else {
      if (hudGear) hudGear.style.display = 'none';
      if (hudTach) hudTach.style.display = 'none';
      if (hudShiftLight) hudShiftLight.style.display = 'none';
      if (hudLugLight) hudLugLight.style.display = 'none';
      if (hudStall) hudStall.style.display = 'none';
    }

    drawMinimap(character.group.position.x, character.group.position.z);

    fpsAccumTime += dt;
    fpsAccumFrames += 1;
    if (fpsAccumTime >= 0.5) {
      if (hudFps) hudFps.textContent = `FPS: ${(fpsAccumFrames / fpsAccumTime).toFixed(0)}`;
      fpsAccumTime = 0;
      fpsAccumFrames = 0;
    }

    if (hudPos) {
      const p = character.group.position;
      hudPos.textContent = `X: ${p.x.toFixed(1)}  Z: ${p.z.toFixed(1)}`;
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
});
