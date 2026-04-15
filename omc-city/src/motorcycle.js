import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createVehicleState, createDrive } from './vehicle-physics.js';

// Cartoon motorcycle built from primitives. Physics come from vehicle-physics.js
// so the motorcycle and car share an identical drivetrain.
export function createMotorcycle(opts = {}) {
  const cfg = CONFIG.motorcycle;
  const group = new THREE.Group();
  group.name = 'motorcycle';

  const isBlocked = opts.isBlocked || (() => false);

  // Frame
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.45, 1.6),
    new THREE.MeshLambertMaterial({ color: cfg.frameColor })
  );
  frame.position.y = 0.7;
  frame.castShadow = true;
  group.add(frame);

  // Fuel tank (just in front of the seat)
  const tank = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.3, 0.55),
    new THREE.MeshLambertMaterial({ color: cfg.tankColor })
  );
  tank.position.set(0, 1.0, -0.1);
  tank.castShadow = true;
  group.add(tank);

  // Seat (rear of bike)
  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.15, 0.7),
    new THREE.MeshLambertMaterial({ color: 0x1a1a1a })
  );
  seat.position.set(0, 1.02, 0.3);
  seat.castShadow = true;
  group.add(seat);

  // Handlebars at the front
  const handlebars = new THREE.Group();
  handlebars.position.set(0, 1.15, -0.55);
  const bar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.7, 10),
    new THREE.MeshLambertMaterial({ color: 0x2a2a2a })
  );
  bar.rotation.z = Math.PI / 2;
  handlebars.add(bar);
  const grips = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.06, 0.06),
    new THREE.MeshLambertMaterial({ color: 0x151515 })
  );
  handlebars.add(grips);
  group.add(handlebars);

  // Headlight at the very front (-Z)
  const headlight = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 14, 12),
    new THREE.MeshLambertMaterial({ color: 0xfff4c0, emissive: 0xffee99, emissiveIntensity: 0.9 })
  );
  headlight.position.set(0, 1.0, -0.88);
  group.add(headlight);

  // Wheels — front at -Z, rear at +Z
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x101010 });
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.22, 16);
  const frontWheel = new THREE.Mesh(wheelGeo, wheelMat);
  frontWheel.rotation.z = Math.PI / 2;
  frontWheel.position.set(0, 0.42, -0.85);
  frontWheel.castShadow = true;
  group.add(frontWheel);
  const rearWheel = new THREE.Mesh(wheelGeo, wheelMat);
  rearWheel.rotation.z = Math.PI / 2;
  rearWheel.position.set(0, 0.42, 0.85);
  rearWheel.castShadow = true;
  group.add(rearWheel);

  // Exhaust pipe runs along the rear (+Z)
  const exhaust = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 0.9, 8),
    new THREE.MeshLambertMaterial({ color: 0xb0b0b0 })
  );
  exhaust.rotation.x = Math.PI / 2;
  exhaust.position.set(0.24, 0.55, 0.75);
  group.add(exhaust);

  const state = createVehicleState(cfg);

  const { drive, setGear } = createDrive({
    group, state, cfg, isBlocked,
    onVisualTick: (dt, speedFactor) => {
      const spin = state.speed / cfg.wheelRadius;
      frontWheel.rotation.x += spin * dt;
      rearWheel.rotation.x += spin * dt;
      handlebars.rotation.y = state.steer * 0.45;
      // Lean into the turn (top tilts toward the turn direction).
      group.rotation.z = state.steer * speedFactor * 0.12;
    },
  });

  return {
    group, state, drive, setGear,
    maxSpeed: cfg.maxSpeed,
    seatHeight: cfg.seatHeight,
    mountDistance: cfg.mountDistance,
    cameraFollowLerp: cfg.cameraFollowLerp,
    cfg,
    kind: 'motorcycle',
  };
}
