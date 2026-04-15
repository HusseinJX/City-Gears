import * as THREE from 'three';

// Shared drivetrain used by both the motorcycle and the car.
// Consumes a cfg with: engineTorque, idle/stall/redline rpm, gearRatios[6],
// reverseGearRatio, finalDriveRatio, wheelRadius, torqueCurve, brakeAccel,
// autoReverseAccel/autoReverseMaxSpeed, coastDrag, boostMultiplier, turnRate,
// steerResponse, collisionRadius, maxSpeed, maxReverseSpeed, stallGearMin,
// engineInertia, restartRpm. The visual hook lets the caller spin wheels,
// rotate handlebars/steering wheels, and lean/roll the chassis.

export function createVehicleState(cfg) {
  return {
    speed: 0, yaw: 0, steer: 0,
    gear: 1,
    rpm: cfg.idleRpm,
    targetRpm: cfg.idleRpm,
    stalled: false,
    stallTimer: 0,
    shiftFlash: 0,
    lastGearChangeTime: 0,
  };
}

export function createDrive({ group, state, cfg, isBlocked, onVisualTick }) {
  const blocked = isBlocked || (() => false);

  function torqueAtRpm(rpm) {
    const c = cfg.torqueCurve;
    if (rpm <= c[0][0]) return c[0][1];
    for (let i = 1; i < c.length; i++) {
      const [r1, t1] = c[i];
      if (rpm <= r1) {
        const [r0, t0] = c[i - 1];
        const k = (rpm - r0) / (r1 - r0);
        return t0 + (t1 - t0) * k;
      }
    }
    return 0;
  }

  function rpmFromSpeed(speed, gearIdx) {
    const ratio = gearIdx === 7
      ? Math.abs(cfg.reverseGearRatio)
      : cfg.gearRatios[gearIdx - 1];
    const wheelRot = Math.abs(speed) / cfg.wheelRadius;
    return wheelRot * ratio * cfg.finalDriveRatio * 60 / (2 * Math.PI);
  }

  function setGear(g) {
    const clamped = Math.max(1, Math.min(7, g | 0));
    const prev = state.gear;
    state.gear = clamped;
    if (state.stalled && clamped === 1) {
      state.stalled = false;
      state.stallTimer = 0;
      state.rpm = cfg.restartRpm;
    }
    if (prev !== clamped) {
      state.lastGearChangeTime = performance.now();
      state.shiftFlash = 1.0;
    }
  }

  const fwd = new THREE.Vector3();

  function drive(dt, input) {
    const gear = state.gear;
    const isReverse = gear === 7;
    const rawRpm = rpmFromSpeed(state.speed, gear);

    if (state.stalled) {
      state.speed *= Math.exp(-1.2 * dt);
      state.targetRpm = 0;
      state.rpm += (state.targetRpm - state.rpm) * (1 - Math.exp(-dt * 4));
    } else if (isReverse) {
      state.targetRpm = Math.max(cfg.idleRpm, rawRpm);
      if (input.forward < 0) {
        const tq = torqueAtRpm(state.targetRpm);
        const boost = input.boost ? cfg.boostMultiplier : 1.0;
        const ratio = Math.abs(cfg.reverseGearRatio);
        const accel = cfg.engineTorque * tq * ratio * 0.6;
        state.speed -= accel * -input.forward * boost * dt;
      } else if (input.forward > 0) {
        state.speed += cfg.brakeAccel * input.forward * dt;
        if (state.speed > 0) state.speed = 0;
      } else {
        state.speed *= Math.exp(-cfg.coastDrag * dt);
      }
      if (state.speed < -cfg.maxReverseSpeed) state.speed = -cfg.maxReverseSpeed;
      if (state.speed > 0) state.speed = 0;
    } else {
      const ratio = cfg.gearRatios[gear - 1];
      const targetRpm = Math.max(cfg.idleRpm, rawRpm);
      state.targetRpm = targetRpm;

      if (gear >= cfg.stallGearMin && rawRpm > 0 && rawRpm < cfg.stallRpm) {
        state.stallTimer += dt;
        if (state.stallTimer > 0.55) {
          state.stalled = true;
          state.stallTimer = 0;
          state.speed *= 0.4;
        }
      } else {
        state.stallTimer = Math.max(0, state.stallTimer - dt * 1.5);
      }

      if (!state.stalled) {
        const tq = torqueAtRpm(targetRpm);
        const boost = input.boost ? cfg.boostMultiplier : 1.0;
        const accel = cfg.engineTorque * tq * ratio;

        if (input.forward > 0) {
          state.speed += accel * input.forward * boost * dt;
        } else if (input.forward < 0) {
          if (state.speed > 0.15) {
            state.speed -= cfg.brakeAccel * -input.forward * dt;
            if (state.speed < 0) state.speed = 0;
          } else {
            state.speed -= cfg.autoReverseAccel * -input.forward * dt;
            if (state.speed < -cfg.autoReverseMaxSpeed) state.speed = -cfg.autoReverseMaxSpeed;
          }
        } else {
          const rpmRatio = Math.max(0, (targetRpm - cfg.idleRpm) / (cfg.redlineRpm - cfg.idleRpm));
          const engineBrake = 0.8 + rpmRatio * 2.5;
          state.speed -= Math.sign(state.speed) * engineBrake * dt;
          if (Math.abs(state.speed) < 0.05) state.speed = 0;
          state.speed *= Math.exp(-cfg.coastDrag * dt);
        }

        if (targetRpm > cfg.redlineRpm + 200) {
          const maxSpeedThisGear = (cfg.redlineRpm + 200) * cfg.wheelRadius * 2 * Math.PI
            / (60 * ratio * cfg.finalDriveRatio);
          if (state.speed > maxSpeedThisGear) state.speed = maxSpeedThisGear;
        }
      }

      const lerp = 1 - Math.exp(-dt * cfg.engineInertia);
      state.rpm += (state.targetRpm - state.rpm) * lerp;
    }

    const steerLerp = 1 - Math.exp(-dt * cfg.steerResponse);
    state.steer += (input.turn - state.steer) * steerLerp;

    const speedFactor = Math.min(1, Math.abs(state.speed) / cfg.maxSpeed);
    const steerDir = state.speed < 0 ? -1 : 1;
    state.yaw += state.steer * cfg.turnRate * speedFactor * steerDir * dt;

    fwd.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
    const dx = fwd.x * state.speed * dt;
    const dz = fwd.z * state.speed * dt;

    const r = cfg.collisionRadius;
    const nx = group.position.x + dx;
    if (!blocked(nx, group.position.z, r)) {
      group.position.x = nx;
    } else {
      state.speed *= 0.2;
    }
    const nz = group.position.z + dz;
    if (!blocked(group.position.x, nz, r)) {
      group.position.z = nz;
    } else {
      state.speed *= 0.2;
    }

    group.rotation.y = state.yaw;

    state.shiftFlash = Math.max(0, state.shiftFlash - dt * 3.0);

    if (onVisualTick) onVisualTick(dt, speedFactor);

    if (!Number.isFinite(state.speed)) state.speed = 0;
    if (!Number.isFinite(state.yaw)) state.yaw = 0;
    if (!Number.isFinite(state.rpm)) state.rpm = cfg.idleRpm;
    if (!Number.isFinite(group.position.x)) group.position.x = 0;
    if (!Number.isFinite(group.position.z)) group.position.z = 0;
  }

  return { drive, setGear };
}
