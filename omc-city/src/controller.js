import * as THREE from 'three';
import { CONFIG } from './config.js';
import { playFootstep, playJump, playLand } from './audio.js';

// Input + character controller. Camera-relative WASD/arrows, sprint, jump.
//
// Returns { update(dt, characterGroup), state: { distanceWalked, isMoving, isGrounded } }
export function createController(cameraRig, opts = {}) {
  const keys = new Set();
  const baseY = CONFIG.city.sidewalkHeight;
  const isBlocked = opts.isBlocked || (() => false);
  const collisionRadius = opts.collisionRadius ?? 0.35;

  const state = {
    distanceWalked: 0,
    lastFootstepDistance: 0,
    isMoving: false,
    facing: 0,
    yVel: 0,
    isGrounded: true,
  };

  // Allow main.js to register an "interact" handler (E key).
  let interactCb = () => {};
  function onInteract(cb) { interactCb = cb; }

  const handleKey = (e, down) => {
    const k = e.code;

    if (k === 'Space') {
      e.preventDefault?.();
      if (down && state.isGrounded) {
        state.yVel = CONFIG.character.jumpVelocity;
        state.isGrounded = false;
        playJump();
      }
      return;
    }

    if (k === 'KeyE') {
      // Ignore OS key-repeat so holding E doesn't toggle mount repeatedly
      if (down && !e.repeat) interactCb();
      return;
    }

    if (down) keys.add(k);
    else keys.delete(k);
  };

  window.addEventListener('keydown', (e) => handleKey(e, true));
  window.addEventListener('keyup', (e) => handleKey(e, false));
  window.addEventListener('blur', () => keys.clear());

  const moveDir = new THREE.Vector3();
  const camForward = new THREE.Vector3();
  const camRight = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  function update(dt, characterGroup) {
    let ix = 0, iz = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) iz -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) iz += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;

    const inputMag = Math.hypot(ix, iz);
    state.isMoving = inputMag > CONFIG.movementDeadzone;

    if (state.isMoving) {
      ix /= inputMag;
      iz /= inputMag;

      const yaw = cameraRig.getYaw();
      camForward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      camRight.set(-camForward.z, 0, camForward.x);

      moveDir.set(0, 0, 0)
        .addScaledVector(camForward, -iz)
        .addScaledVector(camRight, ix);
      moveDir.normalize();

      const sprint = (keys.has('ShiftLeft') || keys.has('ShiftRight'))
        ? CONFIG.sprintMultiplier : 1.0;
      const speed = CONFIG.walkSpeed * sprint;
      const step = speed * dt;

      tmp.copy(moveDir).multiplyScalar(step);
      const curX = characterGroup.position.x;
      const curZ = characterGroup.position.z;
      const nextX = curX + tmp.x;
      if (!isBlocked(nextX, curZ, collisionRadius)) {
        characterGroup.position.x = nextX;
      }
      const nextZ = curZ + tmp.z;
      if (!isBlocked(characterGroup.position.x, nextZ, collisionRadius)) {
        characterGroup.position.z = nextZ;
      }

      // Only count walked distance when on the ground (no walk cycle in air)
      const actualDx = characterGroup.position.x - curX;
      const actualDz = characterGroup.position.z - curZ;
      const actualStep = Math.hypot(actualDx, actualDz);
      if (state.isGrounded && actualStep > 1e-4) {
        state.distanceWalked += actualStep;
        if (state.distanceWalked - state.lastFootstepDistance >= CONFIG.character.stepLength) {
          state.lastFootstepDistance = state.distanceWalked;
          playFootstep();
        }
      }

      const targetYaw = Math.atan2(moveDir.x, moveDir.z);
      const cur = state.facing;
      let diff = targetYaw - cur;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const lerp = 1 - Math.exp(-dt * CONFIG.turnLerp);
      state.facing = cur + diff * lerp;
      characterGroup.rotation.y = state.facing;
    }

    // Vertical physics (jump + gravity)
    state.yVel -= CONFIG.character.gravity * dt;
    characterGroup.position.y += state.yVel * dt;

    if (characterGroup.position.y <= baseY) {
      const wasAirborne = !state.isGrounded;
      characterGroup.position.y = baseY;
      state.yVel = 0;
      state.isGrounded = true;
      if (wasAirborne) playLand();
    }
  }

  // Expose raw input for vehicle controllers
  function getInput() {
    let fw = 0, turn = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) fw += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) fw -= 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) turn += 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) turn -= 1;
    const boost = keys.has('ShiftLeft') || keys.has('ShiftRight');
    return { forward: fw, turn, boost };
  }

  return { update, state, onInteract, getInput };
}
