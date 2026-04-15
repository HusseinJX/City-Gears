import * as THREE from 'three';
import { CONFIG } from './config.js';

// Third-person follow camera with mouse-look (pointer lock) and obstacle anti-clip.
// Returns: { camera, update(dt, characterGroup, obstacles), yaw, pitch }
export function createCameraRig(domElement) {
  const cfg = CONFIG.camera;
  const camera = new THREE.PerspectiveCamera(cfg.fov, window.innerWidth / window.innerHeight, cfg.near, cfg.far);

  const state = {
    yaw: 0,
    pitch: -0.15,
    currentPos: new THREE.Vector3(0, cfg.height, cfg.distance),
    currentTarget: new THREE.Vector3(),
    pointerLocked: false,
  };

  // ---------- Pointer lock + mouse look ----------
  domElement.addEventListener('click', () => {
    if (!state.pointerLocked) {
      try {
        const p = domElement.requestPointerLock?.();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (_) { /* unsupported env — ignore */ }
    }
  });

  document.addEventListener('pointerlockchange', () => {
    state.pointerLocked = document.pointerLockElement === domElement;
  });

  document.addEventListener('mousemove', (e) => {
    if (!state.pointerLocked) return;
    state.yaw -= e.movementX * cfg.mouseSensitivity;
    state.pitch -= e.movementY * cfg.mouseSensitivity;
    if (state.pitch < cfg.minPitch) state.pitch = cfg.minPitch;
    if (state.pitch > cfg.maxPitch) state.pitch = cfg.maxPitch;
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  const ray = new THREE.Raycaster();
  const tmpDir = new THREE.Vector3();
  const desiredPos = new THREE.Vector3();
  const targetPos = new THREE.Vector3();

  function update(dt, characterGroup, obstacles) {
    // Target sits a bit above character pivot (head/chest height)
    targetPos.set(
      characterGroup.position.x,
      characterGroup.position.y + cfg.lookHeight,
      characterGroup.position.z
    );

    // Compute desired offset from target based on yaw/pitch
    const cosP = Math.cos(state.pitch);
    const sinP = Math.sin(state.pitch);
    const sinY = Math.sin(state.yaw);
    const cosY = Math.cos(state.yaw);

    let distance = cfg.distance;

    // Direction from target to camera (behind character relative to yaw)
    tmpDir.set(sinY * cosP, -sinP, cosY * cosP);

    // Anti-clip: raycast from target outward along tmpDir for `distance`
    if (obstacles && obstacles.length) {
      ray.set(targetPos, tmpDir);
      ray.far = distance + 0.2;
      const hits = ray.intersectObjects(obstacles, false);
      if (hits.length > 0) {
        distance = Math.max(cfg.minDistance, hits[0].distance - 0.3);
      }
    }

    desiredPos.copy(targetPos).addScaledVector(tmpDir, distance);

    // Smooth lerp toward desired position and target
    const posLerp = 1 - Math.exp(-dt * cfg.positionLerp);
    const tgtLerp = 1 - Math.exp(-dt * cfg.targetLerp);
    state.currentPos.lerp(desiredPos, posLerp);
    state.currentTarget.lerp(targetPos, tgtLerp);

    camera.position.copy(state.currentPos);
    camera.lookAt(state.currentTarget);
  }

  return {
    camera,
    update,
    getYaw: () => state.yaw,
    getPitch: () => state.pitch,
    state,
  };
}
