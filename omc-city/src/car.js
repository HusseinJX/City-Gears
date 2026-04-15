import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createVehicleState, createDrive } from './vehicle-physics.js';

// Cartoon car built from primitives. Uses the same physics module as the
// motorcycle so the gears, rpm, stall behavior, and torque curve are identical.
export function createCar(opts = {}) {
  const cfg = CONFIG.car;
  const group = new THREE.Group();
  group.name = 'car';

  const isBlocked = opts.isBlocked || (() => false);

  // Body (main chassis)
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.7, 4.2),
    new THREE.MeshLambertMaterial({ color: cfg.bodyColor })
  );
  body.position.y = 0.7;
  body.castShadow = true;
  group.add(body);

  // Cabin (raised roof box)
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.7, 2.2),
    new THREE.MeshLambertMaterial({ color: cfg.cabinColor })
  );
  cabin.position.set(0, 1.35, 0.15);
  cabin.castShadow = true;
  group.add(cabin);

  // Windshield strip — darker, tilted slightly forward
  const windshield = new THREE.Mesh(
    new THREE.BoxGeometry(1.55, 0.55, 0.08),
    new THREE.MeshLambertMaterial({ color: 0x152030 })
  );
  windshield.position.set(0, 1.35, -0.95);
  windshield.rotation.x = -0.25;
  group.add(windshield);

  // Headlights (-Z)
  const headMat = new THREE.MeshLambertMaterial({
    color: 0xfff4c0, emissive: 0xffee99, emissiveIntensity: 0.9,
  });
  for (const sx of [-0.6, 0.6]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.1), headMat);
    hl.position.set(sx, 0.75, -2.05);
    group.add(hl);
  }

  // Taillights (+Z)
  const tailMat = new THREE.MeshLambertMaterial({
    color: 0x661010, emissive: 0xaa2020, emissiveIntensity: 0.55,
  });
  for (const sx of [-0.6, 0.6]) {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.1), tailMat);
    tl.position.set(sx, 0.75, 2.05);
    group.add(tl);
  }

  // Wheels — each front wheel lives inside a small pivot group so the front
  // pivots can turn for steering while the inner mesh rolls.
  const wheelGeo = new THREE.CylinderGeometry(cfg.wheelRadius, cfg.wheelRadius, 0.3, 16);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x101010 });
  function makeWheel(x, z, steerable) {
    const pivot = new THREE.Group();
    pivot.position.set(x, cfg.wheelRadius, z);
    const mesh = new THREE.Mesh(wheelGeo, wheelMat);
    mesh.rotation.z = Math.PI / 2;
    mesh.castShadow = true;
    pivot.add(mesh);
    group.add(pivot);
    return { pivot, mesh, steerable };
  }
  const wheels = [
    makeWheel(-0.95, -1.4, true),   // FL
    makeWheel( 0.95, -1.4, true),   // FR
    makeWheel(-0.95,  1.4, false),  // RL
    makeWheel( 0.95,  1.4, false),  // RR
  ];

  const state = createVehicleState(cfg);

  const { drive, setGear } = createDrive({
    group, state, cfg, isBlocked,
    onVisualTick: (dt) => {
      const spin = state.speed / cfg.wheelRadius;
      for (const w of wheels) {
        w.mesh.rotation.x += spin * dt;
        if (w.steerable) w.pivot.rotation.y = state.steer * 0.5;
      }
    },
  });

  return {
    group, state, drive, setGear,
    maxSpeed: cfg.maxSpeed,
    seatHeight: cfg.seatHeight,
    mountDistance: cfg.mountDistance,
    cameraFollowLerp: cfg.cameraFollowLerp,
    cfg,
    kind: 'car',
  };
}
