import * as THREE from 'three';

const GX = 1200, GZ = 0;
// Room local: X -28..+28, Z 0..70, H 26
const RW = 56, RD = 70, RH = 26, WT = 1.2;

export const CITYHALL_SPAWN_X = GX;
export const CITYHALL_SPAWN_Z = GZ + 4;

export function createCityHallInterior(scene) {
  const group = new THREE.Group();
  group.position.set(GX, 0, GZ);
  scene.add(group);

  const ivory   = new THREE.MeshLambertMaterial({ color: 0xf2efe6 });
  const stone   = new THREE.MeshLambertMaterial({ color: 0xd8d3c6 });
  const floor1  = new THREE.MeshLambertMaterial({ color: 0xd6c9a4 });
  const floor2  = new THREE.MeshLambertMaterial({ color: 0xc8bfa0 });
  const gold    = new THREE.MeshLambertMaterial({ color: 0xc8a030, emissive: 0x6a4808, emissiveIntensity: 0.5 });
  const railing = new THREE.MeshLambertMaterial({ color: 0xb8922a, emissive: 0x5a4010, emissiveIntensity: 0.45 });
  const warm    = new THREE.MeshLambertMaterial({ color: 0xffe090, emissive: 0xff9010, emissiveIntensity: 1.0 });
  const winMat  = new THREE.MeshLambertMaterial({ color: 0x6a9ab8, emissive: 0x1a3a5a, emissiveIntensity: 0.35 });
  const dark    = new THREE.MeshLambertMaterial({ color: 0x3a2e1e });

  const wallMeshes = [];
  function addWall(w, h, d, x, y, z, mat = ivory) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m); wallMeshes.push(m); return m;
  }
  function box(w, h, d, x, y, z, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || ivory);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m); return m;
  }

  // ── OUTER SHELL ──────────────────────────────────────────────────
  const wallH = RH + 10;
  addWall(WT, wallH, RD + WT*2, -RW/2 - WT/2, wallH/2, RD/2);
  addWall(WT, wallH, RD + WT*2,  RW/2 + WT/2, wallH/2, RD/2);
  addWall(RW + WT*2, wallH, WT, 0, wallH/2, RD + WT/2);
  addWall(RW*0.38, RH, WT, -RW*0.31, RH/2, -WT/2);
  addWall(RW*0.38, RH, WT,  RW*0.31, RH/2, -WT/2);
  addWall(RW*0.24, RH*0.38, WT, 0, RH*0.81, -WT/2);

  // ── GROUND FLOOR ─────────────────────────────────────────────────
  const gFloor = new THREE.Mesh(new THREE.BoxGeometry(RW, 0.2, RD), floor1);
  gFloor.position.set(0, 0.1, RD/2);
  gFloor.receiveShadow = true; group.add(gFloor); wallMeshes.push(gFloor);

  // Tile grid lines
  for (let tx = -RW/2 + 4; tx <= RW/2 - 4; tx += 5) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.015, RD - 4), stone);
    l.position.set(tx, 0.215, RD/2); group.add(l);
  }
  for (let tz = 4; tz < RD; tz += 5) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(RW - 4, 0.015, 0.07), stone);
    l.position.set(0, 0.215, tz); group.add(l);
  }

  // ── COFFERED CEILING — ribs hang 0.28 below the ceiling slab ─────
  // Slab: center Y = RH+0.3, bottom face = RH. Ribs center = RH−0.14.
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(RW + WT*2, 0.6, RD + WT*2), ivory);
  ceil.position.set(0, RH + 0.3, RD/2); group.add(ceil); wallMeshes.push(ceil);

  const rotZ = 35, rotR = 13, drumH = 10;
  const cofS = 5.5;
  const ribY = RH - 0.14;
  for (let tx = -RW/2 + 3; tx <= RW/2 - 3; tx += cofS) {
    const z1 = rotZ - rotR - 1.5;
    if (z1 > 3) box(0.28, 0.28, z1 - 3, tx, ribY, (3 + z1)/2, stone);
    const z2 = rotZ + rotR + 1.5;
    if (RD - 3 > z2) box(0.28, 0.28, RD - 3 - z2, tx, ribY, (z2 + RD - 3)/2, stone);
  }
  for (let tz = 4; tz < RD - 2; tz += cofS) {
    if (Math.abs(tz - rotZ) > rotR + 1.5) box(RW - 4, 0.28, 0.28, 0, ribY, tz, stone);
  }

  // ── WAINSCOTING — dark walnut panels + stone cap molding ──────────
  const wH = 3.2;
  box(0.22, wH, RD - 4, -RW/2 + 0.11, wH/2, RD/2, dark);
  box(0.22, wH, RD - 4,  RW/2 - 0.11, wH/2, RD/2, dark);
  box(RW - 4, wH, 0.22, 0, wH/2, RD - 0.11, dark);
  box(0.42, 0.22, RD - 4, -RW/2 + 0.21, wH + 0.11, RD/2, stone);
  box(0.42, 0.22, RD - 4,  RW/2 - 0.21, wH + 0.11, RD/2, stone);
  box(RW - 4, 0.22, 0.42, 0, wH + 0.11, RD - 0.21, stone);

  // ── ROTUNDA ───────────────────────────────────────────────────────
  // Compass rose — 8 radiating arms + concentric ring, all floor-level
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(rotR * 0.82, 0.02, 1.0), stone);
    arm.position.set(0, 0.225, rotZ);
    arm.rotation.y = a;
    group.add(arm);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(rotR * 0.6, 0.18, 6, 36), stone);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 0.22, rotZ);
  group.add(ring);
  // Central medallion
  const medal = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.02, 24), stone);
  medal.position.set(0, 0.225, rotZ); group.add(medal);

  // Drum cylinder
  const drum = new THREE.Mesh(
    new THREE.CylinderGeometry(rotR + WT*0.5, rotR + WT*0.5, drumH, 28), stone);
  drum.position.set(0, RH + drumH/2, rotZ);
  group.add(drum); wallMeshes.push(drum);

  // Dome — normals flipped inward so interior is visible
  const domeGeo = new THREE.SphereGeometry(rotR, 32, 20, 0, Math.PI*2, 0, Math.PI/2);
  const dp = domeGeo.attributes.position;
  for (let i = 0; i < dp.count; i++) dp.setY(i, -Math.abs(dp.getY(i)));
  domeGeo.computeVertexNormals();
  const domeMesh = new THREE.Mesh(domeGeo, ivory);
  domeMesh.position.set(0, RH + drumH, rotZ);
  group.add(domeMesh);

  // Oculus ring + glowing disc (simulates natural skylight)
  const oc = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.5, 22), stone);
  oc.position.set(0, RH + drumH + rotR - 0.4, rotZ); group.add(oc);
  const ocGlow = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15, 1.15, 0.1, 22),
    new THREE.MeshLambertMaterial({ color: 0xfff8e0, emissive: 0xfff4c0, emissiveIntensity: 2.6 }));
  ocGlow.position.set(0, RH + drumH + rotR - 0.1, rotZ); group.add(ocGlow);

  // Colonnade — 8 columns (was 12), more open, larger drums
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const cx = Math.cos(a) * (rotR + 0.35), cz = rotZ + Math.sin(a) * (rotR + 0.35);
    const colH = RH + drumH - 0.4;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.58, colH, 14), ivory);
    col.position.set(cx, colH/2, cz); col.castShadow = true; group.add(col);
    box(1.2, 0.5, 1.2, cx, colH + 0.25, cz, stone);
  }

  // ── GRAND STAIRCASE (wider, 18 steps) ─────────────────────────────
  const stairZ0 = 42, numS = 18, sH = 0.5, sD = 0.8, sW = 22;
  for (let s = 0; s < numS; s++) {
    box(sW - s*0.22, sH, sD, 0, sH*(s + 0.5), stairZ0 + sD*s, stone);
  }
  const landY = numS * sH;             // 9
  const landZ = stairZ0 + numS * sD;   // 56.4
  box(24, 0.35, 9, 0, landY + 0.17, landZ + 4, stone);

  // Side wing stairs
  for (const side of [-1, 1]) {
    for (let s = 0; s < 7; s++) {
      box(sD, sH, 6, side*(sW/2 + sD*(s + 0.5)), landY - sH*s - sH/2, landZ + 2, stone);
    }
  }

  // ── SECOND FLOOR BALCONIES ─────────────────────────────────────────
  const balY = 10, balThick = 0.4;
  for (const side of [-1, 1]) {
    const bCx = side * (RW/2 - 4.5);
    const bLen = RD - 18, bMid = (RD - 4) / 2;
    box(9, balThick, bLen, bCx, balY, bMid, ivory);
    box(9, 0.06, bLen, bCx, balY + balThick/2 + 0.03, bMid, floor2);

    // Gold railing on inner edge
    const railX = side * (RW/2 - 9.1);
    box(0.15, 1.25, bLen, railX, balY + 0.62, bMid, railing);
    for (let rz = 10; rz <= RD - 10; rz += 3.0) {
      box(0.12, 1.1, 0.12, railX, balY + 0.55, rz, railing);
    }

    // Arch-pair supports — 3 arched bays per side (reads as arched arcade, not columns)
    const px = side * (RW/2 - 8.0);
    for (const az of [12, 27, 42]) {
      // Two piers flanking the arch opening
      box(0.9, balY, 0.9, px, balY/2, az - 2.5, ivory);
      box(0.9, balY, 0.9, px, balY/2, az + 2.5, ivory);
      // Capitals
      box(1.2, 0.4, 1.2, px, balY + 0.0, az - 2.5, stone);
      box(1.2, 0.4, 1.2, px, balY + 0.0, az + 2.5, stone);
      // Arch lintel spanning the bay
      box(1.05, 0.9, 6.4, px, balY - 0.45, az, stone);
    }

    // Tall windows on upper outer wall (stone surround + glass)
    for (const wz of [8, 19, 30, 43, 56]) {
      const wx = side * (RW/2 + WT*0.3);
      box(0.14, 7.0, 4.8, wx, balY + 5.5, wz, stone); // frame surround
      box(0.12, 5.8, 3.8, wx, balY + 4.9, wz, winMat); // window glass
      // Arch cap — diamond trick: rotated box reads as arch crown at game scale
      const archtop = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.2, 3.2), stone);
      archtop.position.set(wx, balY + 9.5, wz);
      archtop.rotation.x = Math.PI / 4;
      group.add(archtop);
    }
  }

  // ── THIRD FLOOR GALLERY ────────────────────────────────────────────
  const gal3Y = 17;
  for (const side of [-1, 1]) {
    box(6.5, 0.3, RD - 24, side*(RW/2 - 3.25), gal3Y, (RD - 6)/2, stone);
    const rl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, RD - 24), railing);
    rl.position.set(side*(RW/2 - 6.6), gal3Y + 0.45, (RD - 6)/2); group.add(rl);
  }

  // ── WALL PILASTERS — 3 per side, more prominent than before ───────
  for (const side of [-1, 1]) {
    for (const pz of [8, 28, 53]) {
      const px = side * (RW/2 + WT*0.5);
      box(0.72, RH - 1, 1.6, px, (RH-1)/2, pz, ivory);
      box(1.0, 0.65, 2.0, px, RH - 0.82, pz, stone);  // capital
      box(1.0, 0.5,  2.0, px, 0.25,      pz, stone);  // plinth
    }
  }

  // ── ARCHED NICHES in back wall — dark recess + stone frame + niche light
  // The three niches read as an apse arcade and terminate the space grandly.
  for (const ax of [-14, 0, 14]) {
    box(5.5, 14, 1.6, ax, 8, RD - 0.55, dark);      // deep dark recess
    box(0.85, 14, 1.8, ax - 3.5, 8, RD - 0.45, stone); // left jamb
    box(0.85, 14, 1.8, ax + 3.5, 8, RD - 0.45, stone); // right jamb
    box(7.2, 1.6, 1.8, ax, 15.8, RD - 0.45, stone);    // arch crown
    // Niche point light — warm, contained
    const nl = new THREE.PointLight(0xffe8b0, 0.55, 15);
    nl.position.set(ax, 10, RD - 0.5); group.add(nl);
  }
  // Center niche: civic monument / stele
  box(4.2, 0.9, 1.3, 0, 0.85, RD - 1.6, stone);   // base
  box(2.5, 0.6, 1.0, 0, 1.65, RD - 1.6, stone);   // plinth
  box(1.4, 6.5, 0.75, 0, 5.15, RD - 1.6, ivory);  // stele body
  box(1.8, 0.45, 1.1, 0, 8.67, RD - 1.6, stone);  // stele cap

  // ── ENTABLATURE — 3-part: base / frieze / cornice ─────────────────
  for (const [ox, oz, w, d] of [
    [-RW/2 - WT/2, RD/2, WT + 0.4, RD],
    [ RW/2 + WT/2, RD/2, WT + 0.4, RD],
    [0, RD + WT/2, RW, WT + 0.4],
    [0, -WT/2,     RW, WT + 0.4],
  ]) {
    box(w, 0.35, d, ox, RH * 0.60, oz, stone);           // architrave
    box(w, 0.85, d, ox, RH * 0.60 + 0.60, oz, ivory);    // frieze
    box(w, 0.55, d, ox, RH - 0.27, oz, stone);           // cornice
    box(w, 0.35, d, ox, 0.7, oz, stone);                  // base molding
  }

  // ── CHANDELIERS ───────────────────────────────────────────────────
  const chandPos = [[-15,10],[15,10],[-15,26],[15,26],[0,14],[0,57]];
  for (const [cx, cz] of chandPos) {
    box(0.07, 4.5, 0.07, cx, RH - 2.8, cz, gold);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.64, 0.68, 18), gold);
    body.position.set(cx, RH - 4.2, cz); group.add(body);
    for (let li = 0; li < 8; li++) {
      const a = (li/8) * Math.PI * 2;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 7, 5), warm);
      bulb.position.set(cx + Math.cos(a)*0.7, RH - 4.55, cz + Math.sin(a)*0.7);
      group.add(bulb);
    }
  }
  // Rotunda chandelier — grander, 12 lights
  box(0.09, 9, 0.09, 0, RH + drumH - 5, rotZ, gold);
  const cBody = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.35, 0.95, 22), gold);
  cBody.position.set(0, RH + drumH - 9.4, rotZ); group.add(cBody);
  for (let li = 0; li < 12; li++) {
    const a = (li/12) * Math.PI * 2;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.17, 7, 5), warm);
    bulb.position.set(Math.cos(a)*1.55, RH + drumH - 9.95, rotZ + Math.sin(a)*1.55);
    group.add(bulb);
  }

  // ── LIGHTING ─────────────────────────────────────────────────────
  group.add(new THREE.AmbientLight(0xfff4e0, 0.7));
  const sun = new THREE.PointLight(0xffd880, 1.4, 75);
  sun.position.set(0, RH + 6, rotZ); group.add(sun);
  const p1 = new THREE.PointLight(0xffe0a0, 0.85, 40);
  p1.position.set(-14, 8, 10); group.add(p1);
  const p2 = new THREE.PointLight(0xffe0a0, 0.85, 40);
  p2.position.set(14, 8, 10); group.add(p2);
  const p3 = new THREE.PointLight(0xffd880, 0.75, 48);
  p3.position.set(0, 8, 55); group.add(p3);
  const p4 = new THREE.PointLight(0xfff0c0, 0.65, 42);
  p4.position.set(0, RH + drumH - 9, rotZ); group.add(p4);

  // ── WALL COLLISION AABBs (world space) ───────────────────────────
  const wallAABBs = [
    { minX: GX - RW/2 - WT, maxX: GX - RW/2,      minZ: GZ - WT, maxZ: GZ + RD + WT },
    { minX: GX + RW/2,      maxX: GX + RW/2 + WT,  minZ: GZ - WT, maxZ: GZ + RD + WT },
    { minX: GX - RW/2,      maxX: GX + RW/2,       minZ: GZ + RD, maxZ: GZ + RD + WT },
    { minX: GX - RW/2,      maxX: GX + RW/2,       minZ: GZ - WT, maxZ: GZ + 1.5     },
  ];

  return {
    group,
    spawnX: CITYHALL_SPAWN_X,
    spawnZ: CITYHALL_SPAWN_Z,
    wallMeshes,
    wallAABBs,
    returnShop: {
      name: 'City Hall',
      dialog: 'You are in the grand civic rotunda. The dome above dates to the classical revival era. Press F to exit to the city.',
      ownerPos: { x: GX, z: GZ + 5 },
      interactionRadius: 5.5,
      prompt: 'Press E — Exit',
      isCityHallReturn: true,
    },
    env: {
      fogColor:         0xf2efe6,
      fogDensity:       0.018,
      skyTopColor:      0xf2efe6,
      skyHorizonColor:  0xf2efe6,
      ambientColor:     0xfff8f0,
      ambientIntensity: 0.9,
      sunColor:         0xfff0d0,
    },
  };
}
