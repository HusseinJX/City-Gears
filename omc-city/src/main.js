import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createEnvironment } from './environment.js';
import { createCity } from './city.js';
import { createProps } from './props.js';
import { createCharacter } from './character.js';
import { createCameraRig } from './camera.js';
import { createController } from './controller.js';
import { createNPCs } from './npcs.js';
import { createMotorcycle } from './motorcycle.js';
import { createCar } from './car.js';
import {
  attachAudioUnlock, playDialogOpen,
  startEngine, stopEngine, setEngineThrottle,
  playGearShift, setMuted, setVolume, getVolumes,
  playRocketLaunch,
} from './audio.js';
import { createRaceTrack, createRaceManager } from './race.js';

function init() {
  const canvas = document.getElementById('gameCanvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();

  createEnvironment(scene, renderer);
  const cityInfo = createCity(scene);
  const propsInfo = createProps(scene, cityInfo);

  const character = createCharacter();
  scene.add(character.group);
  const spawnX = cityInfo.spawn ? cityInfo.spawn.x : 0;
  const spawnZ = cityInfo.spawn ? cityInfo.spawn.z : 0;
  character.group.position.set(spawnX, CONFIG.city.sidewalkHeight, spawnZ);

  const cameraRig = createCameraRig(canvas);

  const buildingAABBs = cityInfo.buildingAABBs || [];
  const propObstacles = propsInfo.obstacles || [];
  const isBlockedStatic = (x, z, r) => {
    for (let i = 0; i < buildingAABBs.length; i++) {
      const b = buildingAABBs[i];
      if (x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r) return true;
    }
    for (let i = 0; i < propObstacles.length; i++) {
      const o = propObstacles[i];
      const dx = x - o.x, dz = z - o.z;
      const rr = r + o.r;
      if (dx * dx + dz * dz < rr * rr) return true;
    }
    return false;
  };

  let npcs = null;
  const npcRadius = 0.35;
  const isBlocked = (x, z, r) => {
    if (isBlockedStatic(x, z, r)) return true;
    if (npcs) {
      const peds = npcs.peds;
      const rr = r + npcRadius;
      const rrSq = rr * rr;
      for (let i = 0; i < peds.length; i++) {
        const pp = peds[i].position;
        const dx = x - pp.x, dz = z - pp.z;
        if (dx * dx + dz * dz < rrSq) return true;
      }
    }
    return false;
  };

  const controller = createController(cameraRig, { isBlocked });

  npcs = createNPCs(scene, cityInfo, cityInfo.shops, { isBlocked: isBlockedStatic });

  // Motorcycle parked ahead of the spawn
  const motorcycle = createMotorcycle({ isBlocked });
  motorcycle.group.position.set(spawnX, 0, spawnZ - 3.0);
  motorcycle.state.yaw = 0;
  motorcycle.group.rotation.y = 0;
  scene.add(motorcycle.group);

  // Car parked a bit further to the side of the bike
  const car = createCar({ isBlocked });
  car.group.position.set(spawnX + 4.5, 0, spawnZ - 4.5);
  car.state.yaw = 0;
  car.group.rotation.y = 0;
  scene.add(car.group);

  const vehicles = [motorcycle, car];

  // Race track outside the city
  const raceTrack = createRaceTrack(scene, 0, 0);
  const raceManager = createRaceManager(scene, raceTrack);
  let currentNearRace = false;
  let raceActive = false;
  let raceFinishTimeout = null;

  attachAudioUnlock(canvas);

  const minimapCanvas = document.getElementById('minimap');
  const mmCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;
  const MM_SIZE = 160;
  const MM_R = MM_SIZE / 2;
  const MM_WORLD_RANGE = Math.max(90, Math.min(180, (cityInfo.totalSize || 300) * 0.35));

  function worldToMM(wx, wz, cx, cz) {
    return {
      sx: MM_R + (wx - cx) * (MM_R / MM_WORLD_RANGE),
      sy: MM_R + (wz - cz) * (MM_R / MM_WORLD_RANGE),
    };
  }

  function drawMinimap(playerX, playerZ, playerYaw) {
    if (!mmCtx) return;
    mmCtx.clearRect(0, 0, MM_SIZE, MM_SIZE);

    mmCtx.save();
    mmCtx.beginPath();
    mmCtx.arc(MM_R, MM_R, MM_R, 0, Math.PI * 2);
    mmCtx.clip();

    mmCtx.fillStyle = '#1e2028';
    mmCtx.fillRect(0, 0, MM_SIZE, MM_SIZE);

    const xAxis = cityInfo.xAxis || [];
    const zAxis = cityInfo.zAxis || [];
    const minX = xAxis.length ? xAxis[0] - CONFIG.city.roadWidth : -cityInfo.totalSize / 2;
    const maxX = xAxis.length ? xAxis[xAxis.length - 1] + CONFIG.city.roadWidth : cityInfo.totalSize / 2;
    const minZ = zAxis.length ? zAxis[0] - CONFIG.city.roadWidth : -cityInfo.totalSize / 2;
    const maxZ = zAxis.length ? zAxis[zAxis.length - 1] + CONFIG.city.roadWidth : cityInfo.totalSize / 2;

    mmCtx.strokeStyle = 'rgba(190,205,220,0.55)';
    mmCtx.lineWidth = 2;
    for (const z of zAxis) {
      const a = worldToMM(minX, z, playerX, playerZ);
      const b = worldToMM(maxX, z, playerX, playerZ);
      mmCtx.beginPath();
      mmCtx.moveTo(a.sx, a.sy);
      mmCtx.lineTo(b.sx, b.sy);
      mmCtx.stroke();
    }
    for (const x of xAxis) {
      const a = worldToMM(x, minZ, playerX, playerZ);
      const b = worldToMM(x, maxZ, playerX, playerZ);
      mmCtx.beginPath();
      mmCtx.moveTo(a.sx, a.sy);
      mmCtx.lineTo(b.sx, b.sy);
      mmCtx.stroke();
    }

    for (const shop of cityInfo.shops || []) {
      for (const marker of shop.crowdMarkers || []) {
        const { sx, sy } = worldToMM(marker.x, marker.z, playerX, playerZ);
        if (sx < 0 || sx > MM_SIZE || sy < 0 || sy > MM_SIZE) continue;
        mmCtx.beginPath();
        mmCtx.arc(sx, sy, 2.2, 0, Math.PI * 2);
        mmCtx.fillStyle = shop.minimapColor || '#ffd28a';
        mmCtx.fill();
      }

      const { sx, sy } = worldToMM(shop.ownerPos.x, shop.ownerPos.z, playerX, playerZ);
      if (sx < 0 || sx > MM_SIZE || sy < 0 || sy > MM_SIZE) continue;
      mmCtx.beginPath();
      mmCtx.arc(sx, sy, shop.crowdMarkers ? 5 : 3.5, 0, Math.PI * 2);
      mmCtx.fillStyle = shop.minimapColor || '#ffd28a';
      mmCtx.fill();
    }

    for (const v of vehicles) {
      const { sx, sy } = worldToMM(v.group.position.x, v.group.position.z, playerX, playerZ);
      if (sx < 0 || sx > MM_SIZE || sy < 0 || sy > MM_SIZE) continue;
      mmCtx.beginPath();
      mmCtx.arc(sx, sy, 3, 0, Math.PI * 2);
      mmCtx.fillStyle = v.kind === 'car' ? '#76a7ff' : '#ff6b6b';
      mmCtx.fill();
    }

    // Race track outline
    {
      const wpts = raceTrack.waypoints;
      mmCtx.strokeStyle = 'rgba(200,200,60,0.4)';
      mmCtx.lineWidth = 1;
      mmCtx.beginPath();
      for (let i = 0; i < wpts.length; i++) {
        const { sx, sy } = worldToMM(wpts[i].x, wpts[i].z, playerX, playerZ);
        if (i === 0) mmCtx.moveTo(sx, sy);
        else mmCtx.lineTo(sx, sy);
      }
      mmCtx.closePath();
      mmCtx.stroke();

      // Start zone dot
      const { sx: szx, sy: szy } = worldToMM(raceTrack.startZone.x, raceTrack.startZone.z, playerX, playerZ);
      if (szx >= 0 && szx <= MM_SIZE && szy >= 0 && szy <= MM_SIZE) {
        mmCtx.beginPath();
        mmCtx.arc(szx, szy, 3.5, 0, Math.PI * 2);
        mmCtx.fillStyle = 'rgba(255,220,50,0.7)';
        mmCtx.fill();
      }
    }

    // AI car dots (during active race)
    if (raceActive) {
      const rsAI = raceManager.getState();
      for (const car of rsAI.aiCars) {
        const { sx, sy } = worldToMM(car.x, car.z, playerX, playerZ);
        if (sx < 0 || sx > MM_SIZE || sy < 0 || sy > MM_SIZE) continue;
        mmCtx.beginPath();
        mmCtx.arc(sx, sy, 2.5, 0, Math.PI * 2);
        mmCtx.fillStyle = `#${car.color.toString(16).padStart(6, '0')}`;
        mmCtx.fill();
      }
    }

    if (cityInfo.rocket) {
      const { sx, sy } = worldToMM(cityInfo.rocket.x, cityInfo.rocket.z, playerX, playerZ);
      if (sx >= 0 && sx <= MM_SIZE && sy >= 0 && sy <= MM_SIZE) {
        mmCtx.save();
        mmCtx.translate(sx, sy);
        mmCtx.beginPath();
        mmCtx.moveTo(0, -7);
        mmCtx.lineTo(5, 5);
        mmCtx.lineTo(0, 2);
        mmCtx.lineTo(-5, 5);
        mmCtx.closePath();
        mmCtx.fillStyle = '#ff5b45';
        mmCtx.fill();
        mmCtx.strokeStyle = '#ffd28a';
        mmCtx.lineWidth = 1.5;
        mmCtx.stroke();
        mmCtx.restore();
      }
    }

    if (cityInfo.airplaneLandmark) {
      const { sx, sy } = worldToMM(cityInfo.airplaneLandmark.x, cityInfo.airplaneLandmark.z, playerX, playerZ);
      mmCtx.beginPath();
      mmCtx.arc(sx, sy, 6, 0, Math.PI * 2);
      mmCtx.fillStyle = '#60c8ff';
      mmCtx.fill();
      mmCtx.strokeStyle = '#fff';
      mmCtx.lineWidth = 1.5;
      mmCtx.stroke();
    }

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

  const hudFps = document.getElementById('hud-fps');
  const hudMute = document.getElementById('hud-mute');
  const hudPos = document.getElementById('hud-pos');
  const hudPrompt = document.getElementById('hud-prompt');
  const hudGear = document.getElementById('hud-gear');
  const hudGearVal = document.getElementById('hud-gear-val');
  const hudTach = document.getElementById('hud-tach');
  const hudTachCover = document.getElementById('hud-tach-cover');
  const hudTachGear = document.getElementById('hud-tach-gear');
  const hudRpmNum = document.getElementById('hud-rpm-num');
  const hudSpeedNum = document.getElementById('hud-speed-num');
  const hudShiftLight = document.getElementById('hud-shift-light');
  const hudLugLight = document.getElementById('hud-lug-light');
  const hudStall = document.getElementById('hud-stall');
  const dialogBox = document.getElementById('dialog');
  const dialogName = document.getElementById('dialog-name');
  const dialogText = document.getElementById('dialog-text');
  const dialogSaleHint = document.getElementById('dialog-sale-hint');
  const saleIframeWrap = document.getElementById('sale-iframe-wrap');
  const saleIframe = document.getElementById('sale-iframe');
  const saleIframeClose = document.getElementById('sale-iframe-close');
  const saleIframeTitle = document.getElementById('sale-iframe-title');
  const launchFade = document.getElementById('launch-fade');
  const hudRace = document.getElementById('race-hud');
  const hudRaceCountdown = document.getElementById('race-countdown');
  const hudRaceStats = document.getElementById('race-stats');
  const hudRaceLapVal = document.getElementById('race-lap-val');
  const hudRacePosVal = document.getElementById('race-pos-val');
  const hudRaceTimeVal = document.getElementById('race-time-val');
  const hudRaceFinish = document.getElementById('race-finish-msg');
  const DEFAULT_SITE_URL = 'http://127.0.0.1:8788/business/132';
  const DEFAULT_SITE_LABEL = 'WhatsLocal';
  const SPACE_GAME_URL = 'https://expanse-runner-3d-spacegame.netlify.app';

  let muted = localStorage.getItem('cityWalkMuted') === 'true';
  function updateMuteButton() {
    if (!hudMute) return;
    hudMute.textContent = muted ? 'SOUND' : 'MUTE';
    hudMute.setAttribute('aria-pressed', String(muted));
    hudMute.title = muted ? 'Turn sound on' : 'Mute sound';
  }
  setMuted(muted);
  updateMuteButton();
  if (hudMute) {
    hudMute.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      muted = !muted;
      localStorage.setItem('cityWalkMuted', String(muted));
      setMuted(muted);
      updateMuteButton();
    });
  }

  // Sound settings panel
  const VOLUME_CATEGORIES = [
    { key: 'engine',  label: 'Engine' },
    { key: 'ambient', label: 'Background' },
    { key: 'traffic', label: 'Traffic' },
    { key: 'sfx',     label: 'SFX' },
  ];
  const savedVolumes = JSON.parse(localStorage.getItem('cityWalkVolumes') || '{}');
  for (const { key } of VOLUME_CATEGORIES) {
    if (savedVolumes[key] != null) setVolume(key, savedVolumes[key]);
  }
  function saveVolumes() {
    localStorage.setItem('cityWalkVolumes', JSON.stringify(getVolumes()));
  }

  const soundPanel = document.getElementById('sound-panel');
  const soundPanelBtn = document.getElementById('hud-sound-settings');
  if (soundPanelBtn && soundPanel) {
    soundPanelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const open = soundPanel.style.display === 'block';
      soundPanel.style.display = open ? 'none' : 'block';
    });
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && soundPanel.style.display === 'block') {
        soundPanel.style.display = 'none';
      }
    });
    soundPanel.querySelectorAll('input[type=range]').forEach((slider) => {
      const cat = slider.dataset.cat;
      const valEl = document.getElementById(`vol-${cat}-val`);
      const stored = savedVolumes[cat];
      if (stored != null) slider.value = stored;
      const update = () => {
        if (valEl) valEl.textContent = `${Math.round(slider.value * 100)}%`;
      };
      update();
      slider.addEventListener('input', () => {
        setVolume(cat, parseFloat(slider.value));
        update();
        saveVolumes();
      });
    });
  }

  let currentNearShop = null;
  let dialogOpen = false;
  let saleAvailable = false;
  let currentDialogIsTravelAgent = false;
  let currentSiteUrl = DEFAULT_SITE_URL;
  let currentSiteLabel = DEFAULT_SITE_LABEL;
  let currentSiteTitle = 'Sale';
  let playerMode = 'walk'; // 'walk' | 'drive'
  let currentVehicle = null;
  let automaticTransmission = true;
  let currentNearRocket = false;
  let rocketState = 'idle'; // 'idle' | 'entered' | 'launching'
  let rocketLaunchStartedAt = 0;
  let rocketRedirected = false;
  const rocketBaseY = cityInfo.rocket ? cityInfo.rocket.group.position.y : 0;
  const rocketCameraTarget = new THREE.Object3D();
  const rocketWorldPos = new THREE.Vector3();
  const rocketLookTarget = new THREE.Vector3();

  function closeSaleIframe() {
    if (saleIframeWrap) saleIframeWrap.style.display = 'none';
    if (saleIframe) saleIframe.src = 'about:blank';
  }
  function openSaleIframe(shopName) {
    if (!saleIframeWrap || !saleIframe) return;
    if (saleIframeTitle) saleIframeTitle.textContent = currentSiteTitle || `${shopName} Site`;
    saleIframe.src = currentSiteUrl;
    saleIframeWrap.style.display = 'block';
  }
  if (saleIframeClose) saleIframeClose.addEventListener('click', closeSaleIframe);

  const travelPanel = document.getElementById('travel-panel');
  const travelClose = document.getElementById('travel-close');
  let travelOpen = false;

  function openTravelPanel() {
    if (!travelPanel) return;
    travelOpen = true;
    travelPanel.style.display = 'block';
  }
  function closeTravelPanel() {
    if (!travelPanel) return;
    travelOpen = false;
    travelPanel.style.display = 'none';
  }

  if (travelClose) travelClose.addEventListener('click', closeTravelPanel);

  document.querySelectorAll('.travel-dest').forEach(el => {
    el.addEventListener('click', () => {
      const dest = el.dataset.dest;
      const worldDests = new Set(['niagara', 'everest', 'serengeti', 'bahamas', 'amazon']);
      if (worldDests.has(dest)) {
        closeTravelPanel();
        closeDialog();
        const names = { niagara: 'Niagara Falls', everest: 'Mount Everest', serengeti: 'Serengeti', bahamas: 'The Bahamas', amazon: 'Amazon Rainforest' };
        const hint = document.getElementById('hud-prompt');
        if (hint) { hint.textContent = `✈️ ${names[dest]} — coming soon!`; setTimeout(() => { hint.textContent = ''; }, 3000); }
        return;
      }
      closeTravelPanel();
      closeDialog();
    });
  });

  function openDialog(shop) {
    if (!shop || dialogOpen) return;
    dialogOpen = true;
    if (dialogName) dialogName.textContent = shop.name;
    if (dialogText) dialogText.textContent = `"${shop.dialog}"`;
    if (dialogBox) dialogBox.style.display = 'block';
    currentSiteUrl = shop.siteUrl || DEFAULT_SITE_URL;
    currentSiteLabel = shop.siteLabel || DEFAULT_SITE_LABEL;
    currentSiteTitle = shop.siteTitle || `${shop.name} Sale`;
    saleAvailable = true;
    currentDialogIsTravelAgent = !!shop.isTravelAgent;
    if (dialogSaleHint) {
      dialogSaleHint.textContent = shop.isTravelAgent
        ? 'Press F for travel destinations'
        : `Press F to open ${currentSiteLabel}`;
      dialogSaleHint.style.display = 'block';
    }
    playDialogOpen();
  }
  function closeDialog() {
    dialogOpen = false;
    saleAvailable = false;
    currentDialogIsTravelAgent = false;
    currentSiteUrl = DEFAULT_SITE_URL;
    currentSiteLabel = DEFAULT_SITE_LABEL;
    currentSiteTitle = 'Sale';
    if (dialogBox) dialogBox.style.display = 'none';
    if (dialogSaleHint) dialogSaleHint.style.display = 'none';
    closeSaleIframe();
    closeTravelPanel();
  }

  function distSq(ax, az, bx, bz) {
    const dx = ax - bx, dz = az - bz;
    return dx * dx + dz * dz;
  }

  function setVehicleGear(v, gear, playSound = true) {
    if (!v || v.state.gear === gear) return false;
    v.setGear(gear);
    if (playSound) playGearShift();
    return true;
  }

  function updateAutomaticTransmission(v, input) {
    if (!v || !automaticTransmission || v.state.stalled) return;
    const gear = v.state.gear;
    const speedAbs = Math.abs(v.state.speed);

    if (gear === 7) {
      if (input.forward > 0) setVehicleGear(v, 1);
      return;
    }
    if (input.forward < 0 && speedAbs < 0.35) {
      setVehicleGear(v, 7);
      return;
    }
    if (input.forward <= 0) return;

    const rpm = v.state.rpm;
    const upshiftRpm = Math.min(v.cfg.shiftLightRpm, v.cfg.redlineRpm * 0.9);
    const downshiftRpm = Math.max(v.cfg.lugWarnRpm * 1.15, v.cfg.idleRpm * 2.1);
    if (rpm >= upshiftRpm && gear < 6) {
      setVehicleGear(v, gear + 1);
    } else if (rpm < downshiftRpm && gear > 1) {
      setVehicleGear(v, gear - 1);
    }
  }

  // Returns the nearest vehicle whose mount radius contains the character, or null.
  function nearestMountableVehicle() {
    let best = null;
    let bestSq = Infinity;
    for (const v of vehicles) {
      const dsq = distSq(
        character.group.position.x, character.group.position.z,
        v.group.position.x, v.group.position.z
      );
      const mr = v.mountDistance;
      if (dsq < mr * mr && dsq < bestSq) {
        best = v;
        bestSq = dsq;
      }
    }
    return best;
  }

  let dismountHintUntil = 0;
  function mountVehicle(v) {
    playerMode = 'drive';
    currentVehicle = v;
    automaticTransmission = true;
    v.state.yaw = v.group.rotation.y;
    v.state.steer = 0;
    v.setGear(1);
    character.setPose('sit');
    cameraRig.state.yaw = v.state.yaw;
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
    const offX = Math.sin(sideYaw) * side;
    const offZ = Math.cos(sideYaw) * side;
    character.group.position.set(
      v.group.position.x + offX,
      CONFIG.city.sidewalkHeight,
      v.group.position.z + offZ
    );
    character.group.rotation.y = v.state.yaw + Math.PI;
    v.state.speed = 0;
    v.state.steer = 0;
    stopEngine();
    currentVehicle = null;
  }

  function enterRocket() {
    if (!cityInfo.rocket || rocketState !== 'idle') return;
    closeDialog();
    closeSaleIframe();
    playerMode = 'rocket';
    rocketState = 'entered';
    character.group.visible = false;
    character.setPose('sit');
    character.group.position.set(cityInfo.rocket.x, rocketBaseY + 1.8, cityInfo.rocket.z);
    cameraRig.state.yaw = Math.PI * 0.75;
  }

  function launchRocket() {
    if (!cityInfo.rocket || rocketState !== 'entered') return;
    rocketState = 'launching';
    rocketLaunchStartedAt = performance.now();
    rocketRedirected = false;
    document.body.classList.add('launching');
    cameraRig.state.pitch = -0.52;
    cameraRig.state.yaw = Math.PI * 0.68;
    if (launchFade) {
      launchFade.style.display = 'flex';
      launchFade.style.opacity = '0';
    }
    playRocketLaunch();
  }

  controller.onInteract(() => {
    if (dialogOpen) { closeDialog(); return; }

    if (currentNearRocket && rocketState === 'idle') {
      enterRocket();
      return;
    }

    if (currentNearRace && raceManager.getState().state === 'idle' && playerMode === 'drive') {
      raceManager.start(currentVehicle);
      raceActive = true;
      return;
    }

    if (playerMode === 'drive') {
      dismountVehicle();
      return;
    }

    const nearV = nearestMountableVehicle();
    if (nearV) {
      mountVehicle(nearV);
      return;
    }

    if (currentNearShop) openDialog(currentNearShop);
  });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && (dialogOpen || travelOpen)) { closeDialog(); closeTravelPanel(); }
    if (e.code === 'KeyF' && dialogOpen && saleAvailable && !e.repeat) {
      e.preventDefault();
      if (currentDialogIsTravelAgent) {
        openTravelPanel();
      } else {
        openSaleIframe(dialogName ? dialogName.textContent : 'Shop');
      }
    }
    if (e.code === 'KeyL' && rocketState === 'entered' && !e.repeat) {
      e.preventDefault();
      launchRocket();
    }
    if (playerMode === 'drive' && currentVehicle && !e.repeat) {
      if (e.code === 'KeyT') {
        automaticTransmission = !automaticTransmission;
        return;
      }
      if (automaticTransmission && currentVehicle.state.stalled && e.code === 'Digit1') {
        setVehicleGear(currentVehicle, 1);
        return;
      }
      if (automaticTransmission) return;
      if (e.code === 'KeyW' && currentVehicle.state.gear === 7) {
        setVehicleGear(currentVehicle, 1);
        return;
      }
      if (e.code === 'KeyK') {
        const cur = currentVehicle.state.gear;
        if (cur < 6) setVehicleGear(currentVehicle, cur + 1);
        return;
      }
      if (e.code === 'KeyJ') {
        const cur = currentVehicle.state.gear;
        if (cur > 1) setVehicleGear(currentVehicle, cur - 1);
        return;
      }
      const map = { Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4, Digit5: 5, Digit6: 6, Digit7: 7 };
      const g = map[e.code];
      if (g != null) {
        const sameGear = g === currentVehicle.state.gear;
        if (!sameGear || (currentVehicle.state.stalled && g === 1)) {
          setVehicleGear(currentVehicle, g);
        }
      }
    }
  });

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  });

  function updateRaceHUD(rs) {
    if (!hudRace) return;
    if (rs.state === 'idle') { hudRace.style.display = 'none'; return; }
    hudRace.style.display = 'block';

    if (rs.state === 'countdown') {
      if (hudRaceCountdown) {
        hudRaceCountdown.textContent = rs.countdown > 0 ? String(rs.countdown) : 'GO!';
        hudRaceCountdown.style.display = 'block';
      }
      if (hudRaceStats) hudRaceStats.style.display = 'none';
    } else {
      if (hudRaceCountdown) hudRaceCountdown.style.display = 'none';
      if (hudRaceStats) hudRaceStats.style.display = 'flex';
      const lap = Math.min(rs.laps[0] + 1, rs.totalLaps);
      if (hudRaceLapVal) hudRaceLapVal.textContent = `LAP ${lap}/${rs.totalLaps}`;
      if (hudRacePosVal) hudRacePosVal.textContent = `P${rs.position}`;
      const t = rs.raceTime;
      const m = Math.floor(t / 60);
      const s = (t % 60).toFixed(1);
      if (hudRaceTimeVal) hudRaceTimeVal.textContent = `${m}:${s.padStart(4, '0')}`;
    }

    if (rs.state === 'finished') {
      const place = rs.finishOrder.indexOf(0) + 1;
      const suffix = ['st', 'nd', 'rd', 'th'][Math.min(place - 1, 3)];
      if (hudRaceFinish) {
        hudRaceFinish.textContent = `FINISHED ${place}${suffix}`;
        hudRaceFinish.style.display = 'block';
      }
    } else {
      if (hudRaceFinish) hudRaceFinish.style.display = 'none';
    }
  }

  let fpsAccumTime = 0;
  let fpsAccumFrames = 0;
  const clock = new THREE.Clock();
  const shopRadius = CONFIG.interaction.radius;

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);

    if (playerMode === 'walk') {
      controller.update(dt, character.group);
      character.update(dt, controller.state.distanceWalked, controller.state.isMoving);
    } else if (playerMode === 'drive' && currentVehicle) {
      const v = currentVehicle;
      const input = controller.getInput();
      input.allowAutoReverse = true;
      if (v.state.gear === 7 && input.forward > 0) {
        setVehicleGear(v, 1);
      }
      v.drive(dt, input);
      updateAutomaticTransmission(v, input);
      character.group.position.x = v.group.position.x;
      character.group.position.z = v.group.position.z;
      character.group.position.y = v.seatHeight;
      character.group.rotation.y = v.state.yaw + Math.PI;
      character.update(dt, 0, false);

      const dyaw = v.state.yaw - cameraRig.state.yaw;
      const wrap = ((dyaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      const followLerp = 1 - Math.exp(-dt * v.cameraFollowLerp);
      cameraRig.state.yaw += wrap * followLerp;

      const rpm = v.state.rpm;
      const idle = v.cfg.idleRpm;
      const redline = v.cfg.redlineRpm;
      const rpmFrac = v.state.stalled
        ? 0
        : Math.max(0, Math.min(1, (rpm - idle) / (redline - idle)));
      startEngine();
      setEngineThrottle(rpmFrac);
    } else if (playerMode === 'rocket' && cityInfo.rocket) {
      const rocketLocalY = cityInfo.rocket.rocket?.position.y || 0;
      character.group.position.set(
        cityInfo.rocket.x,
        rocketBaseY + rocketLocalY + 1.8,
        cityInfo.rocket.z
      );
      if (rocketState === 'launching') {
        const t = (performance.now() - rocketLaunchStartedAt) / 1000;
        const rise = Math.max(0, t - 0.35) * 10 + Math.max(0, t - 1.2) ** 2 * 8;
        if (cityInfo.rocket.rocket) {
          cityInfo.rocket.rocket.position.y = rise;
          cityInfo.rocket.rocket.rotation.z = Math.sin(t * 9) * 0.018;
        }
        if (cityInfo.rocket.flame?.material) {
          cityInfo.rocket.flame.material.opacity = Math.min(1, 0.45 + t * 0.55);
          cityInfo.rocket.flame.scale.set(1.2 + Math.sin(t * 28) * 0.18, 1.15 + Math.min(3.0, t * 0.55), 1.2);
        }
        if (cityInfo.rocket.plume?.material) {
          cityInfo.rocket.plume.material.opacity = Math.max(0.15, Math.min(0.86, 0.35 + t * 0.18));
          cityInfo.rocket.plume.scale.set(1.0 + t * 0.12, 1.0 + Math.min(3.0, t * 0.42), 1.0 + t * 0.12);
        }
        if (cityInfo.rocket.smokePuffs) {
          for (let i = 0; i < cityInfo.rocket.smokePuffs.length; i++) {
            const puff = cityInfo.rocket.smokePuffs[i];
            const spread = Math.min(4.2, 0.45 + t * 1.05 + (i % 3) * 0.28);
            const lift = Math.min(1.5, t * 0.18 + (i % 2) * 0.18);
            puff.scale.set(spread, spread * 0.62, spread);
            puff.position.y = 0.65 + lift;
            puff.material.opacity = Math.max(0, Math.min(0.7, 0.18 + t * 0.16 - Math.max(0, t - 4.2) * 0.18));
          }
        }
        if (launchFade) {
          const fade = Math.max(0, Math.min(1, (t - 6.2) / 2.1));
          launchFade.style.opacity = String(fade);
        }
        if (t > 8.8 && !rocketRedirected) {
          rocketRedirected = true;
          window.location.href = cityInfo.rocket.launchUrl || SPACE_GAME_URL;
        }
      }
    }

    npcs.update(dt);
    if (playerMode === 'rocket' && cityInfo.rocket) {
      const rocketLocalY = cityInfo.rocket.rocket?.position.y || 0;
      rocketCameraTarget.position.set(cityInfo.rocket.x, rocketBaseY + rocketLocalY + 2.8, cityInfo.rocket.z);
    }
    cameraRig.update(
      dt,
      playerMode === 'rocket' && cityInfo.rocket ? rocketCameraTarget : character.group,
      playerMode === 'rocket' ? [] : cityInfo.obstacles
    );
    if (playerMode === 'rocket' && cityInfo.rocket) {
      const t = rocketState === 'launching' ? (performance.now() - rocketLaunchStartedAt) / 1000 : 0;
      cityInfo.rocket.rocket?.getWorldPosition(rocketWorldPos);
      const pullback = Math.min(30, t * 4.8);
      const lift = Math.min(18, t * 2.4);
      cameraRig.camera.position.set(
        cityInfo.rocket.x - 18 - pullback,
        rocketBaseY + 5 + lift,
        cityInfo.rocket.z + 30 + pullback * 0.55
      );
      rocketLookTarget.set(
        rocketWorldPos.x,
        rocketWorldPos.y + 2 + Math.min(16, t * 2.4),
        rocketWorldPos.z
      );
      cameraRig.camera.lookAt(rocketLookTarget);
    }

    let nearShop = null;
    let nearRocket = false;
    if (playerMode === 'walk' && !dialogOpen) {
      const px = character.group.position.x;
      const pz = character.group.position.z;
      if (cityInfo.rocket) {
        nearRocket = distSq(px, pz, cityInfo.rocket.x, cityInfo.rocket.z) < cityInfo.rocket.radius * cityInfo.rocket.radius;
      }
      let bestSq = Infinity;
      for (const shop of cityInfo.shops) {
        const dx = shop.ownerPos.x - px;
        const dz = shop.ownerPos.z - pz;
        const dsq = dx * dx + dz * dz;
        const radius = shop.interactionRadius || shopRadius;
        if (dsq < radius * radius && dsq < bestSq) { bestSq = dsq; nearShop = shop; }
      }
    }
    currentNearRocket = nearRocket;

    // Race proximity (must be driving)
    if (playerMode === 'drive' && currentVehicle) {
      const sz = raceTrack.startZone;
      const px = currentVehicle.group.position.x;
      const pz = currentVehicle.group.position.z;
      currentNearRace = distSq(px, pz, sz.x, sz.z) < sz.radius * sz.radius;
    } else {
      currentNearRace = false;
    }

    // Update race
    if (raceActive) {
      raceManager.update(dt, playerMode === 'drive' ? currentVehicle : null);
      const rs = raceManager.getState();
      updateRaceHUD(rs);
      if (rs.state === 'finished') {
        raceActive = false;
        clearTimeout(raceFinishTimeout);
        raceFinishTimeout = setTimeout(() => {
          raceManager.reset();
          if (hudRace) hudRace.style.display = 'none';
        }, 5000);
      }
    }

    let promptMsg = null;
    if (!dialogOpen) {
      if (rocketState === 'entered') {
        promptMsg = 'Press L to launch';
      } else if (rocketState === 'launching') {
        promptMsg = 'Launching';
      } else if (playerMode === 'drive') {
        if (currentNearRace && raceManager.getState().state === 'idle') {
          promptMsg = 'Press E to start race';
        } else if (performance.now() < dismountHintUntil) {
          promptMsg = `Press E to get out · T ${automaticTransmission ? 'manual' : 'automatic'}`;
        }
      } else if (nearRocket) {
        promptMsg = 'Press E to enter the rocket';
      } else if (nearShop) {
        promptMsg = nearShop.prompt || `Press E to talk to ${nearShop.name}`;
      } else {
        const nearV = nearestMountableVehicle();
        if (nearV) {
          promptMsg = nearV.kind === 'car'
            ? 'Press E to drive the car'
            : 'Press E to ride the motorcycle';
        }
      }
    }

    if (playerMode === 'drive' && currentVehicle) {
      const v = currentVehicle;
      if (hudGear) hudGear.style.display = 'block';
      if (hudTach) hudTach.style.display = 'block';
      const g = v.state.gear;
      const gLabel = `${automaticTransmission ? 'A' : 'M'}${g === 7 ? 'R' : String(g)}`;
      if (hudGearVal) hudGearVal.textContent = gLabel;
      if (hudTachGear) {
        const mode = automaticTransmission ? 'AUTO' : 'MANUAL';
        hudTachGear.textContent = g === 7 ? `${mode} REVERSE` : `${mode} GEAR ${g}`;
      }

      const rpm = v.state.rpm;
      const redline = v.cfg.redlineRpm;
      const rpmPct = Math.max(0, Math.min(1, rpm / (redline + 500)));
      if (hudTachCover) hudTachCover.style.width = `${(1 - rpmPct) * 100}%`;
      if (hudRpmNum) hudRpmNum.textContent = `${Math.round(rpm)} rpm`;
      if (hudSpeedNum) {
        const kmh = Math.abs(v.state.speed) * 2.86;
        hudSpeedNum.textContent = `${Math.round(kmh)} km/h`;
      }

      const nearRedline = !v.state.stalled && rpm >= v.cfg.shiftLightRpm && g < 6 && g !== 7;
      if (hudShiftLight) hudShiftLight.style.display = nearRedline ? 'block' : 'none';

      const isLugging = !v.state.stalled
        && rpm < v.cfg.lugWarnRpm
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

    currentNearShop = nearShop;
    if (hudPrompt) {
      if (promptMsg) { hudPrompt.textContent = promptMsg; hudPrompt.style.display = 'block'; }
      else hudPrompt.style.display = 'none';
    }

    renderer.render(scene, cameraRig.camera);
    drawMinimap(
      character.group.position.x,
      character.group.position.z,
      playerMode === 'drive' && currentVehicle ? currentVehicle.state.yaw + Math.PI : character.group.rotation.y
    );

    fpsAccumTime += dt;
    fpsAccumFrames += 1;
    if (fpsAccumTime >= 0.5) {
      const fps = fpsAccumFrames / fpsAccumTime;
      if (hudFps) hudFps.textContent = `FPS: ${fps.toFixed(0)}`;
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
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
