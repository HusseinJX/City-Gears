import * as THREE from 'three';
import { CONFIG } from './config.js';
import {
  makeWindowTexture, makeRoadTexture, makeSidewalkTexture,
  makeSignTexture, makeAwningTexture,
} from './textures.js';

// Build a realistic procedural city:
//   - non-uniform block grid (blocks have varied widths/depths)
//   - block types: tower (single tall building), park (trees + fountain),
//     restaurant (awnings + signs + small buildings), mixed (varied heights)
//   - sidewalks around every block, asphalt streets with lane markings
// Returns { group, obstacles, blocks, totalSize, origin, cell, shops,
//           buildingAABBs, spawn }
export function createCity(scene) {
  const C = CONFIG.city;
  const group = new THREE.Group();
  group.name = 'city';
  scene.add(group);

  // ---------- Generate non-uniform axis positions ----------
  // Each entry is a road centerline. Block i spans between positions[i] and
  // positions[i+1] (minus the sidewalk margin on either side for the road).
  function genAxis() {
    const positions = [0];
    let p = 0;
    // Grow outward to +extent/2
    while (p < C.extent / 2) {
      const blockSize = C.minBlockSize + Math.random() * (C.maxBlockSize - C.minBlockSize);
      p += blockSize + C.roadWidth;
      positions.push(p);
    }
    // And outward to -extent/2
    p = 0;
    while (p > -C.extent / 2) {
      const blockSize = C.minBlockSize + Math.random() * (C.maxBlockSize - C.minBlockSize);
      p -= blockSize + C.roadWidth;
      positions.unshift(p);
    }
    return positions;
  }

  const xAxis = genAxis();
  const zAxis = genAxis();

  const cityMinX = xAxis[0] - C.roadWidth;
  const cityMaxX = xAxis[xAxis.length - 1] + C.roadWidth;
  const cityMinZ = zAxis[0] - C.roadWidth;
  const cityMaxZ = zAxis[zAxis.length - 1] + C.roadWidth;
  const sizeX = cityMaxX - cityMinX;
  const sizeZ = cityMaxZ - cityMinZ;
  const totalSize = Math.max(sizeX, sizeZ);

  // ---------- Asphalt base covering everything ----------
  const asphalt = new THREE.Mesh(
    new THREE.PlaneGeometry(sizeX + 60, sizeZ + 60),
    new THREE.MeshLambertMaterial({ color: 0x2c2c32 })
  );
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.position.set((cityMinX + cityMaxX) / 2, 0.005, (cityMinZ + cityMaxZ) / 2);
  asphalt.receiveShadow = true;
  group.add(asphalt);

  // ---------- Road stripes ----------
  // Horizontal streets along X at every zAxis line
  for (const z of zAxis) {
    const len = sizeX;
    const t = makeRoadTexture(1);
    t.rotation = Math.PI / 2;
    t.center.set(0.5, 0.5);
    t.repeat.set(1, len / C.roadWidth);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(len, C.roadWidth),
      new THREE.MeshLambertMaterial({ map: t })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set((cityMinX + cityMaxX) / 2, 0.015, z);
    m.receiveShadow = true;
    group.add(m);
  }
  // Vertical streets along Z at every xAxis line
  for (const x of xAxis) {
    const len = sizeZ;
    const t = makeRoadTexture(1);
    t.repeat.set(1, len / C.roadWidth);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(C.roadWidth, len),
      new THREE.MeshLambertMaterial({ map: t })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.015, (cityMinZ + cityMaxZ) / 2);
    m.receiveShadow = true;
    group.add(m);
  }

  // ---------- Curved boulevards ----------
  // Strip the straight grid of its monotony by adding curved roads on top of
  // the asphalt. These sit slightly above the base asphalt so they read as
  // proper lanes, and they're placed outside the building footprint so they
  // don't clip into structures.
  function addCurvedPath(pathFn, samples, width) {
    let prev = pathFn(0);
    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      const pt = pathFn(t);
      const dx = pt.x - prev.x;
      const dz = pt.z - prev.z;
      const len = Math.hypot(dx, dz);
      if (len > 0.01) {
        const mx = (prev.x + pt.x) / 2;
        const mz = (prev.z + pt.z) / 2;
        const angle = Math.atan2(dx, dz);
        const tex = makeRoadTexture(1);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(1, Math.max(1, len / width));
        const wrapper = new THREE.Group();
        const plane = new THREE.Mesh(
          new THREE.PlaneGeometry(width, len + 0.35),
          new THREE.MeshLambertMaterial({ map: tex })
        );
        plane.rotation.x = -Math.PI / 2;
        plane.receiveShadow = true;
        wrapper.add(plane);
        wrapper.rotation.y = angle;
        wrapper.position.set(mx, 0.018, mz);
        group.add(wrapper);
      }
      prev = pt;
    }
  }

  // Big elliptical ring boulevard hugging the outside of the city grid.
  const ringCx = (cityMinX + cityMaxX) / 2;
  const ringCz = (cityMinZ + cityMaxZ) / 2;
  const ringRx = sizeX / 2 + 14;
  const ringRz = sizeZ / 2 + 14;
  addCurvedPath((t) => {
    const theta = t * Math.PI * 2;
    return { x: ringCx + ringRx * Math.cos(theta), z: ringCz + ringRz * Math.sin(theta) };
  }, 96, C.roadWidth);

  // ---------- Shared resources ----------
  const sidewalkTex = makeSidewalkTexture(4);

  const windowTexCache = new Map();
  function getWindowTex(color) {
    if (!windowTexCache.has(color)) {
      windowTexCache.set(color, makeWindowTexture(color, {
        cols: 4 + (color & 7),
        rows: 6 + ((color >> 3) & 7),
        size: 256,
      }));
    }
    return windowTexCache.get(color);
  }

  const awningTexCache = new Map();
  function getAwningTex(color) {
    if (!awningTexCache.has(color)) {
      awningTexCache.set(color, makeAwningTexture(color));
    }
    return awningTexCache.get(color);
  }

  const blocks = [];
  const obstacles = [];
  const buildingAABBs = [];

  // ---------- Per-block content ----------
  for (let i = 0; i < xAxis.length - 1; i++) {
    for (let j = 0; j < zAxis.length - 1; j++) {
      const bMinX = xAxis[i] + C.roadWidth / 2;
      const bMaxX = xAxis[i + 1] - C.roadWidth / 2;
      const bMinZ = zAxis[j] + C.roadWidth / 2;
      const bMaxZ = zAxis[j + 1] - C.roadWidth / 2;
      const width = bMaxX - bMinX;
      const depth = bMaxZ - bMinZ;
      if (width < 6 || depth < 6) continue;  // too thin
      const cx = (bMinX + bMaxX) / 2;
      const cz = (bMinZ + bMaxZ) / 2;

      // Sidewalk slab
      const sw = new THREE.Mesh(
        new THREE.BoxGeometry(width, C.sidewalkHeight, depth),
        new THREE.MeshLambertMaterial({ map: sidewalkTex.clone() })
      );
      sw.material.map.repeat.set(width / 4, depth / 4);
      sw.material.map.needsUpdate = true;
      sw.position.set(cx, C.sidewalkHeight / 2, cz);
      sw.receiveShadow = true;
      group.add(sw);

      // Pick type
      const r = Math.random();
      let type;
      if (r < C.towerChance) type = 'tower';
      else if (r < C.towerChance + C.parkChance) type = 'park';
      else if (r < C.towerChance + C.parkChance + C.restaurantChance) type = 'restaurant';
      else type = 'mixed';

      blocks.push({
        x: cx, z: cz, width, depth,
        size: Math.min(width, depth) - C.sidewalkWidth * 2,
        type,
      });

      // Interior area where buildings can live (minus sidewalks)
      const innerW = width - C.sidewalkWidth * 2;
      const innerD = depth - C.sidewalkWidth * 2;

      if (type === 'park') {
        addPark(group, cx, cz, innerW, innerD, obstacles, buildingAABBs);
      } else if (type === 'tower') {
        addTower(group, cx, cz, innerW, innerD, getWindowTex, obstacles, buildingAABBs);
      } else if (type === 'restaurant') {
        addRestaurantRow(group, cx, cz, innerW, innerD, getWindowTex, getAwningTex, obstacles, buildingAABBs);
      } else {
        addMixed(group, cx, cz, innerW, innerD, getWindowTex, obstacles, buildingAABBs);
      }
    }
  }

  const shops = generateShops(group, blocks);

  // Spawn at the intersection closest to city center, offset onto a sidewalk
  // so the character doesn't start inside a road.
  const midX = xAxis[Math.floor(xAxis.length / 2)];
  const midZ = zAxis[Math.floor(zAxis.length / 2)];
  const spawn = {
    x: midX,
    z: midZ + C.roadWidth * 0.55, // just south of the intersection centerline
  };

  // For legacy compatibility (camera raycast, old code paths)
  const avgCell = (sizeX + sizeZ) / (xAxis.length + zAxis.length - 2);

  return {
    group, obstacles, blocks, totalSize,
    origin: Math.min(cityMinX, cityMinZ),
    cell: avgCell,
    shops, buildingAABBs,
    spawn,
    xAxis, zAxis,
  };
}

// ---------- Block type: PARK ----------
function addPark(group, cx, cz, w, d, obstacles, AABBs) {
  // Green lawn patch
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 0.96, d * 0.96),
    new THREE.MeshLambertMaterial({ color: 0x5a8a3e })
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(cx, CONFIG.city.sidewalkHeight + 0.01, cz);
  grass.receiveShadow = true;
  group.add(grass);

  // Central fountain
  const fountainBase = new THREE.Mesh(
    new THREE.CylinderGeometry(Math.min(w, d) * 0.18, Math.min(w, d) * 0.2, 0.4, 24),
    new THREE.MeshLambertMaterial({ color: 0xaaaab0 })
  );
  fountainBase.position.set(cx, CONFIG.city.sidewalkHeight + 0.2, cz);
  fountainBase.castShadow = true;
  fountainBase.receiveShadow = true;
  group.add(fountainBase);

  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(Math.min(w, d) * 0.15, Math.min(w, d) * 0.15, 0.06, 24),
    new THREE.MeshLambertMaterial({ color: 0x5fa8c8, emissive: 0x223a5a, emissiveIntensity: 0.4 })
  );
  water.position.set(cx, CONFIG.city.sidewalkHeight + 0.42, cz);
  group.add(water);

  const spout = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.12, 0.8, 10),
    new THREE.MeshLambertMaterial({ color: 0xbbbbbb })
  );
  spout.position.set(cx, CONFIG.city.sidewalkHeight + 0.85, cz);
  group.add(spout);

  // Scatter trees
  const n = 4 + Math.floor(Math.random() * 4);
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.24, 1.6, 8);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4a30 });
  const leafGeo = new THREE.SphereGeometry(1.3, 10, 8);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3e9a44 });
  for (let i = 0; i < n; i++) {
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.8;
    trunk.castShadow = true;
    t.add(trunk);
    const leaves = new THREE.Mesh(leafGeo, leafMat);
    leaves.position.y = 2.4;
    leaves.scale.setScalar(0.8 + Math.random() * 0.6);
    leaves.castShadow = true;
    t.add(leaves);
    const rx = (Math.random() - 0.5) * (w * 0.8);
    const rz = (Math.random() - 0.5) * (d * 0.8);
    // Keep away from fountain
    if (Math.hypot(rx, rz) < Math.min(w, d) * 0.28) continue;
    t.position.set(cx + rx, CONFIG.city.sidewalkHeight, cz + rz);
    group.add(t);
  }
}

// ---------- Block type: TOWER ----------
function addTower(group, cx, cz, w, d, getWindowTex, obstacles, AABBs) {
  // One tall building with stepped setbacks
  const base = Math.min(w, d) * 0.8;
  const totalH = 32 + Math.random() * 20;       // 32-52m
  const color = CONFIG.buildingColors[Math.floor(Math.random() * CONFIG.buildingColors.length)];

  // Build 2-4 stacked sections, each slightly smaller than the one below
  const tiers = 2 + Math.floor(Math.random() * 3);
  let hSoFar = 0;
  let curW = base;
  let curD = base;
  for (let t = 0; t < tiers; t++) {
    const tierH = (totalH / tiers) * (0.7 + Math.random() * 0.6);
    const mesh = makeBuildingMesh(curW, tierH, curD, color, getWindowTex);
    mesh.position.set(cx, CONFIG.city.sidewalkHeight + hSoFar + tierH / 2, cz);
    group.add(mesh);
    obstacles.push(mesh);
    if (t === 0) {
      AABBs.push({
        minX: cx - curW / 2, maxX: cx + curW / 2,
        minZ: cz - curD / 2, maxZ: cz + curD / 2,
      });
    }
    hSoFar += tierH;
    curW *= 0.78;
    curD *= 0.78;
  }

  // Rooftop antenna
  const ant = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.12, 4, 6),
    new THREE.MeshLambertMaterial({ color: 0x888892 })
  );
  ant.position.set(cx, CONFIG.city.sidewalkHeight + hSoFar + 2, cz);
  group.add(ant);
}

// ---------- Block type: MIXED ----------
function addMixed(group, cx, cz, w, d, getWindowTex, obstacles, AABBs) {
  // Subdivide block into a small grid and put a building in each cell.
  const cols = w > 36 ? 3 : w > 20 ? 2 : 1;
  const rows = d > 36 ? 3 : d > 20 ? 2 : 1;
  const cellW = w / cols;
  const cellD = d / rows;
  const margin = CONFIG.city.buildingMargin;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (Math.random() < 0.08) continue;   // occasional gap / courtyard
      const bw = cellW - margin * 2 - Math.random() * cellW * 0.2;
      const bd = cellD - margin * 2 - Math.random() * cellD * 0.2;
      if (bw < 3 || bd < 3) continue;
      const bx = cx - w / 2 + cellW * (c + 0.5) + (Math.random() - 0.5) * cellW * 0.15;
      const bz = cz - d / 2 + cellD * (r + 0.5) + (Math.random() - 0.5) * cellD * 0.15;
      const h = 4 + Math.random() * Math.random() * 24;  // bias toward shorter
      const color = CONFIG.buildingColors[Math.floor(Math.random() * CONFIG.buildingColors.length)];
      const mesh = makeBuildingMesh(bw, h, bd, color, getWindowTex);
      mesh.position.set(bx, CONFIG.city.sidewalkHeight + h / 2, bz);
      group.add(mesh);
      obstacles.push(mesh);
      AABBs.push({
        minX: bx - bw / 2, maxX: bx + bw / 2,
        minZ: bz - bd / 2, maxZ: bz + bd / 2,
      });

      // Rooftop feature on tall ones
      if (h > 16 && Math.random() < 0.5) addRooftopFeature(group, bx, bz, bw, bd, h);
    }
  }
}

// ---------- Block type: RESTAURANT ROW ----------
function addRestaurantRow(group, cx, cz, w, d, getWindowTex, getAwningTex, obstacles, AABBs) {
  // Line small buildings along the longer axis; each gets an awning + sign
  // on the street-facing side.
  const alongX = w >= d;
  const mainLen = alongX ? w : d;
  const crossLen = alongX ? d : w;
  const count = Math.max(2, Math.min(5, Math.floor(mainLen / 10)));
  const segLen = mainLen / count;
  const bWidth = segLen - 1.4;
  const bDepth = crossLen - 3.0;
  if (bWidth < 3 || bDepth < 3) { addMixed(group, cx, cz, w, d, getWindowTex, obstacles, AABBs); return; }

  const restCfg = CONFIG.restaurants;
  for (let i = 0; i < count; i++) {
    const along = -mainLen / 2 + segLen * (i + 0.5);
    const bx = alongX ? cx + along : cx;
    const bz = alongX ? cz : cz + along;
    const h = 5 + Math.random() * 8; // short commercial buildings
    const color = CONFIG.buildingColors[Math.floor(Math.random() * CONFIG.buildingColors.length)];
    const mesh = makeBuildingMesh(bWidth, h, bDepth, color, getWindowTex);
    mesh.position.set(bx, CONFIG.city.sidewalkHeight + h / 2, bz);
    group.add(mesh);
    obstacles.push(mesh);
    AABBs.push({
      minX: bx - bWidth / 2, maxX: bx + bWidth / 2,
      minZ: bz - bDepth / 2, maxZ: bz + bDepth / 2,
    });

    // Awning + sign on both long sides (street-facing)
    const awColor = restCfg.awningColors[Math.floor(Math.random() * restCfg.awningColors.length)];
    const awTex = getAwningTex(awColor).clone();
    awTex.repeat.set(bWidth / 2, 1);
    awTex.needsUpdate = true;
    const awMat = new THREE.MeshLambertMaterial({ map: awTex, side: THREE.DoubleSide });
    const awGeo = alongX
      ? new THREE.PlaneGeometry(bWidth * 0.95, 1.1)
      : new THREE.PlaneGeometry(bDepth * 0.95, 1.1);
    // Two awnings, one on each street-facing side
    const sides = alongX ? [-1, 1] : [-1, 1]; // along cross axis
    for (const s of sides) {
      const aw = new THREE.Mesh(awGeo, awMat);
      aw.rotation.x = -Math.PI / 4;
      if (alongX) {
        aw.position.set(bx, CONFIG.city.sidewalkHeight + 3.2, bz + s * (bDepth / 2 + 0.35));
        aw.rotation.y = s === 1 ? Math.PI : 0;
      } else {
        aw.rotation.y = s === 1 ? -Math.PI / 2 : Math.PI / 2;
        aw.position.set(bx + s * (bWidth / 2 + 0.35), CONFIG.city.sidewalkHeight + 3.2, bz);
      }
      group.add(aw);
    }

    // Sign above the awning on the street-facing side (pick longer side)
    const name = restCfg.names[Math.floor(Math.random() * restCfg.names.length)];
    const signMat = new THREE.MeshBasicMaterial({ map: makeSignTexture(name, awColor) });
    const signW = Math.min(bWidth, bDepth) * 0.85;
    const signGeo = new THREE.PlaneGeometry(signW, 0.9);
    const sign = new THREE.Mesh(signGeo, signMat);
    if (alongX) {
      sign.position.set(bx, CONFIG.city.sidewalkHeight + 4.2, bz + bDepth / 2 + 0.05);
    } else {
      sign.position.set(bx + bWidth / 2 + 0.05, CONFIG.city.sidewalkHeight + 4.2, bz);
      sign.rotation.y = Math.PI / 2;
    }
    group.add(sign);

    // Outdoor bistro table (small, on the sidewalk in front)
    if (Math.random() < 0.6) {
      addBistroTable(
        group,
        alongX ? bx : bx + (bWidth / 2 + 1.2),
        alongX ? bz + bDepth / 2 + 1.2 : bz,
      );
    }
  }
}

function addBistroTable(group, x, z) {
  const tGroup = new THREE.Group();
  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.45, 0.06, 18),
    new THREE.MeshLambertMaterial({ color: 0xf0e8d4 })
  );
  top.position.y = 0.85;
  top.castShadow = true;
  tGroup.add(top);
  const leg = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.85, 8),
    new THREE.MeshLambertMaterial({ color: 0x2a2a2e })
  );
  leg.position.y = 0.42;
  tGroup.add(leg);
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.22, 0.04, 12),
    new THREE.MeshLambertMaterial({ color: 0x2a2a2e })
  );
  base.position.y = 0.02;
  tGroup.add(base);
  tGroup.position.set(x, CONFIG.city.sidewalkHeight, z);
  group.add(tGroup);
}

// ---------- Building mesh builder ----------
function makeBuildingMesh(w, h, d, color, getWindowTex) {
  const tex = getWindowTex(color);
  const winSideX = Math.max(1, Math.round(d / 4));
  const winSideZ = Math.max(1, Math.round(w / 4));
  const winY = Math.max(1, Math.round(h / 4));

  const matSide = (uR, vR) => {
    const t = tex.clone();
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(uR, vR);
    t.needsUpdate = true;
    return new THREE.MeshLambertMaterial({ map: t });
  };
  const roof = new THREE.MeshLambertMaterial({
    color: CONFIG.roofColors[Math.floor(Math.random() * CONFIG.roofColors.length)],
  });
  const bottom = new THREE.MeshLambertMaterial({ color });
  const materials = [
    matSide(winSideX, winY),
    matSide(winSideX, winY),
    roof,
    bottom,
    matSide(winSideZ, winY),
    matSide(winSideZ, winY),
  ];
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ---------- Rooftop feature (water tower or AC boxes) ----------
function addRooftopFeature(group, bx, bz, bw, bd, h) {
  const y = CONFIG.city.sidewalkHeight + h;
  if (Math.random() < 0.5) {
    // Water tower
    const tower = new THREE.Group();
    const legMat = new THREE.MeshLambertMaterial({ color: 0x3a2a22 });
    const tankMat = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });
    for (const sx of [-0.7, 0.7]) {
      for (const sz of [-0.7, 0.7]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.6, 0.12), legMat);
        leg.position.set(sx, 0.8, sz);
        leg.castShadow = true;
        tower.add(leg);
      }
    }
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(1.0, 1.0, 1.6, 12),
      tankMat
    );
    tank.position.y = 2.4;
    tank.castShadow = true;
    tower.add(tank);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(1.05, 0.6, 12),
      new THREE.MeshLambertMaterial({ color: 0x4a3a2a })
    );
    roof.position.y = 3.5;
    tower.add(roof);
    tower.position.set(bx + (Math.random() - 0.5) * (bw * 0.3), y, bz + (Math.random() - 0.5) * (bd * 0.3));
    group.add(tower);
  } else {
    // AC box cluster
    const boxMat = new THREE.MeshLambertMaterial({ color: 0xa0a0a6 });
    const cluster = new THREE.Group();
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 1.1), boxMat);
      b.position.set((Math.random() - 0.5) * (bw * 0.5), 0.35, (Math.random() - 0.5) * (bd * 0.5));
      b.castShadow = true;
      cluster.add(b);
    }
    cluster.position.set(bx, y, bz);
    group.add(cluster);
  }
}

// ---------- Shop signs (from original, placed on block edges) ----------
function generateShops(group, blocks) {
  const shops = [];
  const cfg = CONFIG.shops;
  const sw = CONFIG.city.sidewalkWidth;

  // Prefer non-park blocks for shop signs
  const candidateBlocks = blocks.filter(b => b.type !== 'park');

  const usedBlock = new Set();
  let i = 0;
  let attempts = 0;
  while (shops.length < cfg.count && attempts < cfg.count * 20 && candidateBlocks.length > 0) {
    attempts++;
    const bIdx = Math.floor(Math.random() * candidateBlocks.length);
    if (usedBlock.has(bIdx)) continue;
    usedBlock.add(bIdx);
    const block = candidateBlocks[bIdx];

    const halfW = block.width / 2;
    const halfD = block.depth / 2;
    const edge = Math.floor(Math.random() * 4);
    const alongX = (Math.random() - 0.5) * (block.width * 0.45);
    const alongZ = (Math.random() - 0.5) * (block.depth * 0.45);

    let signPos, ownerPos, yaw;
    if (edge === 0) {
      signPos = { x: block.x + alongX, y: 3.0, z: block.z - halfD + 0.05 };
      ownerPos = { x: block.x + alongX, z: block.z - halfD - sw * 0.55 };
      yaw = Math.PI;
    } else if (edge === 1) {
      signPos = { x: block.x + halfW - 0.05, y: 3.0, z: block.z + alongZ };
      ownerPos = { x: block.x + halfW + sw * 0.55, z: block.z + alongZ };
      yaw = Math.PI / 2;
    } else if (edge === 2) {
      signPos = { x: block.x + alongX, y: 3.0, z: block.z + halfD - 0.05 };
      ownerPos = { x: block.x + alongX, z: block.z + halfD + sw * 0.55 };
      yaw = 0;
    } else {
      signPos = { x: block.x - halfW + 0.05, y: 3.0, z: block.z + alongZ };
      ownerPos = { x: block.x - halfW - sw * 0.55, z: block.z + alongZ };
      yaw = -Math.PI / 2;
    }

    const name = cfg.names[i % cfg.names.length];
    const signColor = cfg.signColors[i % cfg.signColors.length];
    const dialog = cfg.dialog[i % cfg.dialog.length];

    const signMat = new THREE.MeshBasicMaterial({ map: makeSignTexture(name, signColor) });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.9), signMat);
    sign.position.set(signPos.x, signPos.y, signPos.z);
    sign.rotation.y = yaw;
    const outX = Math.sin(yaw) * 0.02;
    const outZ = Math.cos(yaw) * 0.02;
    sign.position.x += outX;
    sign.position.z += outZ;
    group.add(sign);

    const backer = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 1.1, 0.08),
      new THREE.MeshLambertMaterial({ color: 0x2a2a2a })
    );
    backer.position.copy(sign.position);
    backer.rotation.y = yaw;
    backer.position.x -= outX * 1.5;
    backer.position.z -= outZ * 1.5;
    group.add(backer);

    shops.push({ name, dialog, signColor, facingYaw: yaw, ownerPos, signPos });
    i++;
  }
  return shops;
}
