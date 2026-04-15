import * as THREE from 'three';
import { CONFIG } from './config.js';

// Wandering pedestrians + shop-owner NPCs.
// Pedestrians are each pinned to one block and walk its sidewalk perimeter,
// so they never step onto the street.

function makePerson(shirtColor, pantsColor, hatColor = null) {
  const g = new THREE.Group();
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xf3c8a4 });
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirtColor });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pantsColor });

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, 0.3), pantsMat);
  legs.position.y = 0.45;
  legs.castShadow = true;
  g.add(legs);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.65, 0.32), shirtMat);
  torso.position.y = 1.22;
  torso.castShadow = true;
  g.add(torso);

  const armGeo = new THREE.BoxGeometry(0.13, 0.6, 0.14);
  for (const sx of [-0.32, 0.32]) {
    const arm = new THREE.Mesh(armGeo, shirtMat);
    arm.position.set(sx, 1.2, 0);
    arm.castShadow = true;
    g.add(arm);
  }

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), skinMat);
  head.position.y = 1.74;
  head.castShadow = true;
  g.add(head);

  if (hatColor !== null) {
    const hat = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.08, 0.38),
      new THREE.MeshLambertMaterial({ color: hatColor })
    );
    hat.position.y = 1.95;
    hat.castShadow = true;
    g.add(hat);
  }

  return g;
}

export function createNPCs(scene, cityInfo, shops, opts = {}) {
  const group = new THREE.Group();
  group.name = 'npcs';
  scene.add(group);

  const isBlocked = opts.isBlocked || (() => false);
  const pedRadius = 0.3;

  const peds = [];
  const baseY = CONFIG.city.sidewalkHeight;

  // Parameterize the sidewalk perimeter of a (possibly rectangular) block.
  // s is an arc-length parameter in [0, perim). s increases clockwise around
  // the block starting from the top-left corner of the sidewalk.
  function perimParams(block) {
    const sw = CONFIG.city.sidewalkWidth;
    const halfW = block.width / 2 - sw / 2;   // x-coord of vertical sidewalk centerlines
    const halfD = block.depth / 2 - sw / 2;   // z-coord of horizontal sidewalk centerlines
    const insetW = Math.max(0.5, halfW - 0.5); // walk range on top/bottom edges
    const insetD = Math.max(0.5, halfD - 0.5); // walk range on left/right edges
    const edgeW = 2 * insetW;
    const edgeD = 2 * insetD;
    return { halfW, halfD, insetW, insetD, edgeW, edgeD, perim: 2 * edgeW + 2 * edgeD };
  }

  function perimToXZ(block, s) {
    const { halfW, halfD, insetW, insetD, edgeW, edgeD, perim } = perimParams(block);
    let acc = ((s % perim) + perim) % perim;
    if (acc < edgeW)            return { x: block.x - insetW + acc,           z: block.z - halfD };
    acc -= edgeW;
    if (acc < edgeD)            return { x: block.x + halfW,                   z: block.z - insetD + acc };
    acc -= edgeD;
    if (acc < edgeW)            return { x: block.x + insetW - acc,            z: block.z + halfD };
    acc -= edgeW;
    return                      { x: block.x - halfW,                          z: block.z + insetD - acc };
  }

  // Try several start angles before giving up so we don't spawn inside a prop.
  function pickFreeStart(block) {
    const { perim } = perimParams(block);
    for (let i = 0; i < 8; i++) {
      const s = Math.random() * perim;
      const p = perimToXZ(block, s);
      if (!isBlocked(p.x, p.z, pedRadius)) return { s, x: p.x, z: p.z };
    }
    const s = Math.random() * perim;
    const p = perimToXZ(block, s);
    return { s, x: p.x, z: p.z };
  }

  // Wandering pedestrians — one block each, walking its perimeter.
  for (let i = 0; i < CONFIG.npcs.pedestrians; i++) {
    const shirt = CONFIG.npcs.colors[Math.floor(Math.random() * CONFIG.npcs.colors.length)];
    const pants = 0x222230 + Math.floor(Math.random() * 0x202020);
    const p = makePerson(shirt, pants);
    const block = cityInfo.blocks[Math.floor(Math.random() * cityInfo.blocks.length)];
    const start = pickFreeStart(block);
    p.position.set(start.x, baseY, start.z);
    p.userData.block = block;
    p.userData.s = start.s;
    p.userData.dir = Math.random() < 0.5 ? 1 : -1;
    p.userData.speed = CONFIG.npcs.speedMin + Math.random() * (CONFIG.npcs.speedMax - CONFIG.npcs.speedMin);
    p.userData.bobPhase = Math.random() * Math.PI * 2;
    p.userData.stuck = 0;
    group.add(p);
    peds.push(p);
  }

  // Shop owners — stand at their shop (unchanged)
  const owners = [];
  for (const shop of shops) {
    const shirt = 0xeeeeee;
    const pants = 0x202028;
    const hat = shop.signColor;
    const p = makePerson(shirt, pants, hat);
    p.position.set(shop.ownerPos.x, baseY, shop.ownerPos.z);
    p.rotation.y = shop.facingYaw;
    p.userData.bobPhase = Math.random() * Math.PI * 2;
    p.userData.basePosY = baseY;
    group.add(p);
    owners.push(p);
    shop.ownerMesh = p;
  }

  function update(dt) {
    for (const p of peds) {
      const block = p.userData.block;
      const nextS = p.userData.s + p.userData.dir * p.userData.speed * dt;
      const next = perimToXZ(block, nextS);
      if (!isBlocked(next.x, next.z, pedRadius)) {
        const dx = next.x - p.position.x;
        const dz = next.z - p.position.z;
        p.position.x = next.x;
        p.position.z = next.z;
        p.userData.s = nextS;
        p.userData.stuck = 0;
        if (Math.abs(dx) + Math.abs(dz) > 0.001) {
          p.rotation.y = Math.atan2(dx, dz);
        }
      } else {
        // Flip direction and nudge past the obstacle next frame.
        p.userData.dir *= -1;
        p.userData.stuck += dt;
        if (p.userData.stuck > 1.5) {
          // Teleport to a fresh free slot on the same block if wedged.
          const fresh = pickFreeStart(block);
          p.userData.s = fresh.s;
          p.position.x = fresh.x;
          p.position.z = fresh.z;
          p.userData.stuck = 0;
        }
      }
      p.userData.bobPhase += dt * 7;
      p.position.y = baseY + Math.abs(Math.sin(p.userData.bobPhase)) * 0.07;
    }

    for (const o of owners) {
      o.userData.bobPhase += dt * 1.6;
      o.scale.y = 1 + Math.sin(o.userData.bobPhase) * 0.025;
    }
  }

  return { update, peds, owners };
}
