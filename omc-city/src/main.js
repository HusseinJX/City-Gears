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
  playGearShift,
} from './audio.js';

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

  attachAudioUnlock(canvas);

  const hudFps = document.getElementById('hud-fps');
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

  let currentNearShop = null;
  let dialogOpen = false;
  let playerMode = 'walk'; // 'walk' | 'drive'
  let currentVehicle = null;

  function openDialog(shop) {
    if (!shop || dialogOpen) return;
    dialogOpen = true;
    if (dialogName) dialogName.textContent = shop.name;
    if (dialogText) dialogText.textContent = `"${shop.dialog}"`;
    if (dialogBox) dialogBox.style.display = 'block';
    playDialogOpen();
  }
  function closeDialog() {
    dialogOpen = false;
    if (dialogBox) dialogBox.style.display = 'none';
  }

  function distSq(ax, az, bx, bz) {
    const dx = ax - bx, dz = az - bz;
    return dx * dx + dz * dz;
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

  controller.onInteract(() => {
    if (dialogOpen) { closeDialog(); return; }

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
    if (e.code === 'Escape' && dialogOpen) closeDialog();
    if (playerMode === 'drive' && currentVehicle && !e.repeat) {
      const map = { Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4, Digit5: 5, Digit6: 6, Digit7: 7 };
      const g = map[e.code];
      if (g != null) {
        const sameGear = g === currentVehicle.state.gear;
        if (!sameGear || (currentVehicle.state.stalled && g === 1)) {
          currentVehicle.setGear(g);
          playGearShift();
        }
      }
    }
  });

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  });

  let fpsAccumTime = 0;
  let fpsAccumFrames = 0;
  const clock = new THREE.Clock();
  const shopRadius = CONFIG.interaction.radius;

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);

    if (playerMode === 'walk' || !currentVehicle) {
      controller.update(dt, character.group);
      character.update(dt, controller.state.distanceWalked, controller.state.isMoving);
    } else {
      const v = currentVehicle;
      const input = controller.getInput();
      v.drive(dt, input);
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
      setEngineThrottle(rpmFrac);
    }

    npcs.update(dt);
    cameraRig.update(dt, character.group, cityInfo.obstacles);

    let nearShop = null;
    if (playerMode === 'walk' && !dialogOpen) {
      const px = character.group.position.x;
      const pz = character.group.position.z;
      let bestSq = shopRadius * shopRadius;
      for (const shop of cityInfo.shops) {
        const dx = shop.ownerPos.x - px;
        const dz = shop.ownerPos.z - pz;
        const dsq = dx * dx + dz * dz;
        if (dsq < bestSq) { bestSq = dsq; nearShop = shop; }
      }
    }

    let promptMsg = null;
    if (!dialogOpen) {
      if (playerMode === 'drive') {
        if (performance.now() < dismountHintUntil) {
          promptMsg = 'Press E to get out';
        }
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

    if (playerMode === 'drive' && currentVehicle) {
      const v = currentVehicle;
      if (hudGear) hudGear.style.display = 'block';
      if (hudTach) hudTach.style.display = 'block';
      const g = v.state.gear;
      const gLabel = g === 7 ? 'R' : String(g);
      if (hudGearVal) hudGearVal.textContent = gLabel;
      if (hudTachGear) hudTachGear.textContent = g === 7 ? 'REVERSE' : `GEAR ${g}`;

      const rpm = v.state.rpm;
      const redline = v.cfg.redlineRpm;
      const rpmPct = Math.max(0, Math.min(1, rpm / (redline + 500)));
      if (hudTachCover) hudTachCover.style.width = `${(1 - rpmPct) * 100}%`;
      if (hudRpmNum) hudRpmNum.textContent = `${Math.round(rpm)} rpm`;
      if (hudSpeedNum) {
        const kmh = Math.abs(v.state.speed) * 3.6 * 4;
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
