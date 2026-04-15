import * as THREE from 'three';
import { CONFIG } from './config.js';

// Scatter procedural props across sidewalks only.
// `cityInfo` comes from createCity(): { blocks, cell, origin, totalSize }
export function createProps(scene, cityInfo) {
  const group = new THREE.Group();
  group.name = 'props';
  scene.add(group);

  const { blocks } = cityInfo;
  const sidewalkY = CONFIG.city.sidewalkHeight;
  const sw = CONFIG.city.sidewalkWidth;

  // Obstacle circles (x, z, r) collected as props are placed so the walker
  // and motorcycle collide with them instead of passing through.
  const obstacles = [];

  // Build re-usable shared geometries / materials
  const trunkGeo = new THREE.CylinderGeometry(0.15, 0.2, 1.2, 8);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4a30 });
  const leavesGeo = new THREE.ConeGeometry(1.0, 2.4, 8);
  const leavesMat = new THREE.MeshLambertMaterial({ color: 0x3a8a3a });

  const lampPoleGeo = new THREE.CylinderGeometry(0.08, 0.1, 4.5, 8);
  const lampPoleMat = new THREE.MeshLambertMaterial({ color: 0x222226 });
  const lampBulbGeo = new THREE.SphereGeometry(0.28, 12, 8);
  const lampBulbMat = new THREE.MeshStandardMaterial({
    color: 0xfff2c0,
    emissive: 0xffd070,
    emissiveIntensity: 1.4,
    roughness: 0.5,
  });

  const benchSeatGeo = new THREE.BoxGeometry(1.5, 0.1, 0.45);
  const benchLegGeo = new THREE.BoxGeometry(0.08, 0.4, 0.4);
  const benchBackGeo = new THREE.BoxGeometry(1.5, 0.5, 0.08);
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x6e4a2c });

  const trashGeo = new THREE.CylinderGeometry(0.3, 0.32, 0.9, 12);
  const trashMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2e });
  const trashLidGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.06, 12);
  const trashLidMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1e });

  const hydrantBodyGeo = new THREE.CylinderGeometry(0.2, 0.22, 0.6, 10);
  const hydrantTopGeo = new THREE.CylinderGeometry(0.18, 0.2, 0.18, 10);
  const hydrantCapGeo = new THREE.SphereGeometry(0.12, 8, 6);
  const hydrantMat = new THREE.MeshLambertMaterial({ color: 0xc83a2a });

  function makeMesh(geo, mat) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  // Pick a point on the centerline of one sidewalk strip — strictly on the
  // sidewalk band of the chosen block, never on the street.
  function randomEdgePoint() {
    const block = blocks[Math.floor(Math.random() * blocks.length)];
    const halfW = block.width / 2 - sw / 2;    // vertical sidewalk centerlines (east/west)
    const halfD = block.depth / 2 - sw / 2;    // horizontal sidewalk centerlines (north/south)
    const alongW = (Math.random() - 0.5) * Math.max(1, block.width - sw * 2 - 2);
    const alongD = (Math.random() - 0.5) * Math.max(1, block.depth - sw * 2 - 2);
    const edge = Math.floor(Math.random() * 4);
    if (edge === 0) return { x: block.x + alongW, z: block.z - halfD };
    if (edge === 1) return { x: block.x + halfW, z: block.z + alongD };
    if (edge === 2) return { x: block.x + alongW, z: block.z + halfD };
    return { x: block.x - halfW, z: block.z + alongD };
  }

  // Pick a sidewalk corner (still strictly on the sidewalk, not in the street).
  function randomCornerPoint() {
    const block = blocks[Math.floor(Math.random() * blocks.length)];
    const halfW = block.width / 2 - sw / 2;
    const halfD = block.depth / 2 - sw / 2;
    const cx = (Math.random() < 0.5 ? -1 : 1) * halfW;
    const cz = (Math.random() < 0.5 ? -1 : 1) * halfD;
    return { x: block.x + cx, z: block.z + cz };
  }

  // Trees
  for (let i = 0; i < CONFIG.props.trees; i++) {
    const t = new THREE.Group();
    const trunk = makeMesh(trunkGeo, trunkMat);
    trunk.position.y = 0.6;
    t.add(trunk);
    const leaves = makeMesh(leavesGeo, leavesMat);
    leaves.position.y = 1.2 + 1.2;
    t.add(leaves);
    const p = randomCornerPoint();
    t.position.set(p.x, sidewalkY, p.z);
    t.rotation.y = Math.random() * Math.PI * 2;
    group.add(t);
    obstacles.push({ x: p.x, z: p.z, r: 0.9 });
  }

  // Streetlights
  for (let i = 0; i < CONFIG.props.streetlights; i++) {
    const l = new THREE.Group();
    const pole = makeMesh(lampPoleGeo, lampPoleMat);
    pole.position.y = 4.5 / 2;
    l.add(pole);
    const bulb = new THREE.Mesh(lampBulbGeo, lampBulbMat);
    bulb.position.y = 4.5 + 0.1;
    l.add(bulb);
    const p = randomEdgePoint();
    l.position.set(p.x, sidewalkY, p.z);
    group.add(l);
    obstacles.push({ x: p.x, z: p.z, r: 0.25 });
  }

  // Benches
  for (let i = 0; i < CONFIG.props.benches; i++) {
    const b = new THREE.Group();
    const seat = makeMesh(benchSeatGeo, benchMat);
    seat.position.y = 0.45;
    b.add(seat);
    const back = makeMesh(benchBackGeo, benchMat);
    back.position.set(0, 0.7, -0.18);
    b.add(back);
    for (const sx of [-0.6, 0.6]) {
      const leg = makeMesh(benchLegGeo, benchMat);
      leg.position.set(sx, 0.2, 0);
      b.add(leg);
    }
    const p = randomEdgePoint();
    b.position.set(p.x, sidewalkY, p.z);
    b.rotation.y = Math.random() * Math.PI * 2;
    group.add(b);
    obstacles.push({ x: p.x, z: p.z, r: 0.8 });
  }

  // Trash cans
  for (let i = 0; i < CONFIG.props.trashCans; i++) {
    const tc = new THREE.Group();
    const body = makeMesh(trashGeo, trashMat);
    body.position.y = 0.45;
    tc.add(body);
    const lid = makeMesh(trashLidGeo, trashLidMat);
    lid.position.y = 0.93;
    tc.add(lid);
    const p = randomEdgePoint();
    tc.position.set(p.x, sidewalkY, p.z);
    group.add(tc);
    obstacles.push({ x: p.x, z: p.z, r: 0.4 });
  }

  // Fire hydrants
  for (let i = 0; i < CONFIG.props.fireHydrants; i++) {
    const h = new THREE.Group();
    const body = makeMesh(hydrantBodyGeo, hydrantMat);
    body.position.y = 0.3;
    h.add(body);
    const top = makeMesh(hydrantTopGeo, hydrantMat);
    top.position.y = 0.69;
    h.add(top);
    const cap = makeMesh(hydrantCapGeo, hydrantMat);
    cap.position.y = 0.84;
    h.add(cap);
    for (const sx of [-0.22, 0.22]) {
      const sc = new THREE.Mesh(hydrantCapGeo, hydrantMat);
      sc.castShadow = true;
      sc.position.set(sx, 0.45, 0);
      h.add(sc);
    }
    const p = randomEdgePoint();
    h.position.set(p.x, sidewalkY, p.z);
    group.add(h);
    obstacles.push({ x: p.x, z: p.z, r: 0.3 });
  }

  return { group, obstacles };
}
