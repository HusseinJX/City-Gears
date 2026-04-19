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
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const centerRoadI = Math.floor(xAxis.length / 2);
  const centerRoadJ = Math.floor(zAxis.length / 2);
  const forcedParkI = clamp(centerRoadI - 1, 0, xAxis.length - 2);
  const forcedParkJ = clamp(centerRoadJ - 1, 0, zAxis.length - 2);
  const facilityI = clamp(centerRoadI, 0, xAxis.length - 2);
  const facilityJ = clamp(centerRoadJ - 1, 0, zAxis.length - 2);
  let spawnParkBlock = null;
  let spaceFacilityBlock = null;

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
      if (i === forcedParkI && j === forcedParkJ) type = 'park';
      if (i === facilityI && j === facilityJ) type = 'spaceFacility';

      const block = {
        x: cx, z: cz, width, depth,
        size: Math.min(width, depth) - C.sidewalkWidth * 2,
        type,
      };
      blocks.push(block);
      if (type === 'park' && i === forcedParkI && j === forcedParkJ) spawnParkBlock = block;
      if (type === 'spaceFacility') spaceFacilityBlock = block;

      // Interior area where buildings can live (minus sidewalks)
      const innerW = width - C.sidewalkWidth * 2;
      const innerD = depth - C.sidewalkWidth * 2;

      if (type === 'park') {
        addPark(group, cx, cz, innerW, innerD, obstacles, buildingAABBs);
      } else if (type === 'spaceFacility') {
        addSpaceFacilityBlock(group, cx, cz, innerW, innerD);
      } else if (type === 'tower') {
        addTower(group, cx, cz, innerW, innerD, getWindowTex, obstacles, buildingAABBs);
      } else if (type === 'restaurant') {
        addRestaurantRow(group, cx, cz, innerW, innerD, getWindowTex, getAwningTex, obstacles, buildingAABBs);
      } else {
        addMixed(group, cx, cz, innerW, innerD, getWindowTex, obstacles, buildingAABBs);
      }
    }
  }

  // Spawn at the intersection closest to city center, offset onto a sidewalk
  // so the character doesn't start inside a road.
  const midX = xAxis[Math.floor(xAxis.length / 2)];
  const midZ = zAxis[Math.floor(zAxis.length / 2)];
  const spawn = {
    x: midX,
    z: midZ + C.roadWidth * 0.55, // just south of the intersection centerline
  };

  const shops = generateShops(group, blocks);
  shops.push(addSpaceAgeVisionAttraction(group, spawnParkBlock, spawn));
  const rocket = addRocketLaunchSite(group, spaceFacilityBlock, spawn);
  const airplaneLandmark = addAirplaneBuilding(group, spawnParkBlock, spawn, buildingAABBs);
  if (airplaneLandmark.shop) shops.push(airplaneLandmark.shop);

  // For legacy compatibility (camera raycast, old code paths)
  const avgCell = (sizeX + sizeZ) / (xAxis.length + zAxis.length - 2);

  return {
    group, obstacles, blocks, totalSize,
    origin: Math.min(cityMinX, cityMinZ),
    cell: avgCell,
    shops, buildingAABBs, rocket, airplaneLandmark,
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

function makeSpaceAgeVisionTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  grad.addColorStop(0, '#0b1024');
  grad.addColorStop(0.45, '#1f7a8c');
  grad.addColorStop(1, '#2a2f7f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(118,247,255,0.95)';
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowOffsetY = 4;
  ctx.font = 'bold 58px -apple-system, Helvetica, Arial, sans-serif';
  ctx.fillText('SPACE AGE', canvas.width / 2, 76);
  ctx.font = 'bold 48px -apple-system, Helvetica, Arial, sans-serif';
  ctx.fillText('VISION', canvas.width / 2, 134);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function makeCrowdPerson(shirtColor, pantsColor, hatColor = null) {
  const g = new THREE.Group();
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xf3c8a4 });
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirtColor });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pantsColor });

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.85, 0.28), pantsMat);
  legs.position.y = 0.425;
  legs.castShadow = true;
  g.add(legs);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.62, 0.3), shirtMat);
  torso.position.y = 1.16;
  torso.castShadow = true;
  g.add(torso);

  const armGeo = new THREE.BoxGeometry(0.12, 0.55, 0.13);
  for (const sx of [-0.29, 0.29]) {
    const arm = new THREE.Mesh(armGeo, shirtMat);
    arm.position.set(sx, 1.16, 0);
    arm.castShadow = true;
    g.add(arm);
  }

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), skinMat);
  head.position.y = 1.68;
  head.castShadow = true;
  g.add(head);

  if (hatColor !== null) {
    const hat = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.08, 0.36),
      new THREE.MeshLambertMaterial({ color: hatColor })
    );
    hat.position.y = 1.9;
    hat.castShadow = true;
    g.add(hat);
  }

  return g;
}

function addSpaceAgeVisionAttraction(group, parkBlock, spawn) {
  const baseY = CONFIG.city.sidewalkHeight;
  const anchor = parkBlock || {
    x: spawn.x - 8.5,
    z: spawn.z - 8.5,
    width: 18,
    depth: 18,
  };
  const targetX = anchor.x;
  const targetZ = anchor.z - anchor.depth * 0.18;
  const signX = anchor.x - anchor.width * 0.22;
  const signZ = anchor.z - anchor.depth * 0.36;
  const yaw = Math.atan2(targetX - signX, targetZ - signZ);

  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(Math.min(10, anchor.width * 0.42), 0.14, Math.min(5.2, anchor.depth * 0.24)),
    new THREE.MeshLambertMaterial({ color: 0x26323a })
  );
  platform.position.set(targetX, baseY + 0.02, targetZ);
  platform.castShadow = true;
  platform.receiveShadow = true;
  group.add(platform);

  const signMat = new THREE.MeshBasicMaterial({
    map: makeSpaceAgeVisionTexture(),
    side: THREE.DoubleSide,
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 1.35), signMat);
  sign.position.set(signX, baseY + 3.25, signZ);
  sign.rotation.y = yaw;
  group.add(sign);

  const postMat = new THREE.MeshLambertMaterial({ color: 0x1d2028 });
  for (const sx of [-2.25, 2.25]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.15, 0.18), postMat);
    post.position.set(signX + Math.cos(yaw) * sx, baseY + 1.62, signZ - Math.sin(yaw) * sx);
    post.castShadow = true;
    group.add(post);
  }

  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, 1.8, 16),
    new THREE.MeshLambertMaterial({ color: 0x76f7ff, emissive: 0x174c55, emissiveIntensity: 0.7 })
  );
  glow.position.set(targetX + 3.2, baseY + 0.95, targetZ - 1.4);
  glow.castShadow = true;
  group.add(glow);

  const crowdGroup = new THREE.Group();
  crowdGroup.name = 'space-age-vision-crowd';
  const colors = [0x5a8ad8, 0xd85a8a, 0x5ad88a, 0xd8c05a, 0xa85ad8, 0x5ad8d8];
  const offsets = [
    [-2.7, -1.9], [-1.6, -2.35], [-0.5, -2.1], [0.8, -2.45], [1.9, -1.9],
    [-3.1, -0.6], [-1.95, -0.85], [-0.8, -0.55], [0.45, -0.95], [1.55, -0.55], [2.65, -0.85],
    [-2.45, 0.65], [-1.2, 0.45], [0.15, 0.55], [1.45, 0.35], [2.55, 0.6],
  ];
  const crowdMarkers = offsets.map(([ox, oz]) => ({ x: targetX + ox, z: targetZ + oz }));
  offsets.forEach(([ox, oz], i) => {
    const person = makeCrowdPerson(colors[i % colors.length], 0x202028 + (i % 3) * 0x101010, i % 4 === 0 ? 0x76f7ff : null);
    person.position.set(targetX + ox, baseY + 0.08, targetZ + oz);
    person.rotation.y = Math.atan2(signX - person.position.x, signZ - person.position.z);
    person.scale.setScalar(1.25);
    crowdGroup.add(person);
  });
  group.add(crowdGroup);

  return {
    name: 'Space Age Vision',
    dialog: 'A crowd gathers around the Space Age Vision sign. They are sharing demos, futures, and strange new worlds.',
    signColor: 0x1f7a8c,
    facingYaw: yaw,
    ownerPos: { x: targetX, z: targetZ },
    signPos: { x: signX, y: baseY + 3.25, z: signZ },
    prompt: 'Press E for Space Age Vision info',
    siteUrl: 'https://spaceagevision.world',
    siteLabel: 'spaceagevision.world',
    siteTitle: 'Space Age Vision',
    minimapColor: '#76f7ff',
    crowdMarkers,
    interactionRadius: 5.5,
  };
}

function addSpaceFacilityBlock(group, cx, cz, w, d) {
  const baseY = CONFIG.city.sidewalkHeight;
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.94, 0.16, d * 0.94),
    new THREE.MeshLambertMaterial({ color: 0x3d444a })
  );
  slab.position.set(cx, baseY + 0.035, cz);
  slab.castShadow = true;
  slab.receiveShadow = true;
  group.add(slab);

  const stripeMat = new THREE.MeshLambertMaterial({ color: 0xf0d36a });
  for (const side of [-1, 1]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(w * 0.72, 0.05, 0.18), stripeMat);
    stripe.position.set(cx, baseY + 0.14, cz + side * d * 0.34);
    group.add(stripe);
  }

  const buildingMat = new THREE.MeshLambertMaterial({ color: 0x7d8d96 });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x2f3a44 });
  const hangar = new THREE.Mesh(new THREE.BoxGeometry(w * 0.34, 3.0, d * 0.22), buildingMat);
  hangar.position.set(cx - w * 0.25, baseY + 1.55, cz + d * 0.22);
  hangar.castShadow = true;
  hangar.receiveShadow = true;
  group.add(hangar);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.36, 0.35, d * 0.24), roofMat);
  roof.position.set(hangar.position.x, baseY + 3.25, hangar.position.z);
  roof.castShadow = true;
  group.add(roof);

  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0xb9c2c8 })
  );
  dish.position.set(cx + w * 0.28, baseY + 1.7, cz + d * 0.25);
  dish.rotation.x = -Math.PI * 0.25;
  dish.castShadow = true;
  group.add(dish);

  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.1, 4.0, 8),
    new THREE.MeshLambertMaterial({ color: 0xb9c2c8 })
  );
  antenna.position.set(cx + w * 0.37, baseY + 2.0, cz - d * 0.28);
  group.add(antenna);
}

function addRocketLaunchSite(group, facilityBlock, spawn) {
  const baseY = CONFIG.city.sidewalkHeight;
  const x = facilityBlock ? facilityBlock.x : spawn.x + 8.5;
  const z = facilityBlock ? facilityBlock.z - facilityBlock.depth * 0.12 : spawn.z - 11.0;
  const siteGroup = new THREE.Group();
  siteGroup.name = 'rocket-launch-site';
  siteGroup.position.set(x, baseY, z);

  const rocket = new THREE.Group();
  rocket.name = 'launch-rocket';
  siteGroup.add(rocket);

  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(3.0, 3.4, 0.35, 24),
    new THREE.MeshLambertMaterial({ color: 0x2b333a })
  );
  pad.position.y = 0.18;
  pad.castShadow = true;
  pad.receiveShadow = true;
  siteGroup.add(pad);

  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xf3f5f7 });
  const stripeMat = new THREE.MeshLambertMaterial({ color: 0xe64242 });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x76d8ff, emissive: 0x123845, emissiveIntensity: 0.45 });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.92, 6.0, 28), bodyMat);
  body.position.y = 3.65;
  body.castShadow = true;
  rocket.add(body);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.84, 1.7, 28), stripeMat);
  nose.position.y = 7.5;
  nose.castShadow = true;
  rocket.add(nose);

  const window = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 10), glassMat);
  window.scale.z = 0.18;
  window.position.set(0, 4.55, -0.86);
  rocket.add(window);

  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.84, 0.94, 0.46, 28), stripeMat);
  stripe.position.y = 2.45;
  rocket.add(stripe);

  const finMat = new THREE.MeshLambertMaterial({ color: 0xd72e2e });
  for (let i = 0; i < 3; i++) {
    const angle = i * Math.PI * 2 / 3;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.45, 1.2), finMat);
    fin.position.set(Math.sin(angle) * 1.0, 1.25, Math.cos(angle) * 1.0);
    fin.rotation.y = angle;
    fin.castShadow = true;
    rocket.add(fin);
  }

  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.75, 3.4, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0, depthWrite: false })
  );
  flame.name = 'rocket-flame';
  flame.position.y = -0.65;
  flame.rotation.x = Math.PI;
  rocket.add(flame);

  const plume = new THREE.Mesh(
    new THREE.ConeGeometry(1.35, 7.0, 28),
    new THREE.MeshBasicMaterial({ color: 0xff8a24, transparent: true, opacity: 0, depthWrite: false })
  );
  plume.name = 'rocket-plume';
  plume.position.y = -2.8;
  plume.rotation.x = Math.PI;
  rocket.add(plume);

  const smokeGroup = new THREE.Group();
  smokeGroup.name = 'rocket-smoke-cloud';
  const smokeMat = new THREE.MeshLambertMaterial({ color: 0xc8c6bc, transparent: true, opacity: 0 });
  const smokePuffs = [];
  const puffOffsets = [
    [-2.7, 0, -0.6], [-1.7, 0, -2.1], [0.2, 0, -2.6], [2.0, 0, -1.9], [2.8, 0, 0.2],
    [1.6, 0, 1.9], [-0.5, 0, 2.5], [-2.4, 0, 1.5], [-3.2, 0, 0.6], [0.4, 0, 0.4],
  ];
  puffOffsets.forEach(([px, py, pz], i) => {
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(0.75 + (i % 3) * 0.2, 16, 10),
      smokeMat.clone()
    );
    puff.position.set(px, 0.65 + py + (i % 2) * 0.25, pz);
    puff.scale.set(0.2, 0.16, 0.2);
    puff.castShadow = false;
    puff.receiveShadow = false;
    smokeGroup.add(puff);
    smokePuffs.push(puff);
  });
  siteGroup.add(smokeGroup);

  const gantry = new THREE.Group();
  const gantryMat = new THREE.MeshLambertMaterial({ color: 0x313943 });
  for (const gx of [-1.85, 1.85]) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.18, 4.4, 0.18), gantryMat);
    tower.position.set(gx, 2.25, 1.9);
    tower.castShadow = true;
    gantry.add(tower);
  }
  for (let y = 0.9; y <= 4.1; y += 0.8) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.12, 0.12), gantryMat);
    rail.position.set(0, y, 1.9);
    rail.castShadow = true;
    gantry.add(rail);
  }
  siteGroup.add(gantry);

  group.add(siteGroup);

  return {
    group: siteGroup,
    rocket,
    flame,
    plume,
    smokePuffs,
    x,
    z,
    radius: 5.8,
    launchUrl: 'https://expanse-runner-3d-spacegame.netlify.app',
  };
}

// ---------- Shop signs (from original, placed on block edges) ----------
function generateShops(group, blocks) {
  const shops = [];
  const cfg = CONFIG.shops;
  const sw = CONFIG.city.sidewalkWidth;

  // Prefer non-park blocks for shop signs
  const candidateBlocks = blocks.filter(b => b.type !== 'park' && b.type !== 'spaceFacility');

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

// ---------- Airplane landmark (kiosk + plane inside existing park) ----------
function addAirplaneBuilding(group, block, spawn, AABBs) {
  const C = CONFIG.city;
  // Place in the opposite corner of the spawn park from the Space Age Vision sign
  const x = block ? block.x + block.width * 0.25 : spawn.x + 10;
  const z = block ? block.z + block.depth * 0.25 : spawn.z + 10;
  const base = C.sidewalkHeight;

  // Kiosk — small 4×4 base, 2.8 tall
  const kioskW = 4, kioskD = 4, kioskH = 4.5;
  const kioskMat = new THREE.MeshLambertMaterial({ color: 0xe8dfc8 });
  const kiosk = new THREE.Mesh(new THREE.BoxGeometry(kioskW, kioskH, kioskD), kioskMat);
  kiosk.position.set(x, base + kioskH / 2, z);
  kiosk.castShadow = true;
  kiosk.receiveShadow = true;
  group.add(kiosk);

  // Kiosk roof overhang
  const kioskRoof = new THREE.Mesh(
    new THREE.BoxGeometry(kioskW + 1.2, 0.25, kioskD + 1.2),
    new THREE.MeshLambertMaterial({ color: 0x4a5560 })
  );
  kioskRoof.position.set(x, base + kioskH + 0.12, z);
  group.add(kioskRoof);

  // Kiosk window strip
  const kwMat = new THREE.MeshLambertMaterial({ color: 0x9dd4f0, emissive: 0x0a2030, emissiveIntensity: 0.4 });
  for (const s of [-1, 1]) {
    const kw = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.0, 0.08), kwMat);
    kw.position.set(x, base + kioskH * 0.62, z + s * (kioskD / 2 + 0.04));
    group.add(kw);
  }

  AABBs.push({ minX: x - kioskW / 2, maxX: x + kioskW / 2, minZ: z - kioskD / 2, maxZ: z + kioskD / 2 });

  // ---- Airplane on top of kiosk ----
  const planeY = base + kioskH + 0.25;
  const pg = new THREE.Group();
  pg.position.set(x, planeY, z);
  group.add(pg);

  const whiteMat  = new THREE.MeshLambertMaterial({ color: 0xeef1f5 });
  const blueMat   = new THREE.MeshLambertMaterial({ color: 0x1a3ea0 });
  const glassMat  = new THREE.MeshLambertMaterial({ color: 0x8adcf8, emissive: 0x0a2840, emissiveIntensity: 0.6 });
  const engineMat = new THREE.MeshLambertMaterial({ color: 0xa8acb4 });
  const darkMat   = new THREE.MeshLambertMaterial({ color: 0x14181e });
  const strutMat  = new THREE.MeshLambertMaterial({ color: 0x888e98 });

  // ── Fuselage: LatheGeometry for proper taper ──
  const fusePts = [
    new THREE.Vector2(0,    0),     // tail tip
    new THREE.Vector2(0.48, 0.7),
    new THREE.Vector2(0.72, 2.2),
    new THREE.Vector2(0.88, 4.5),   // rear cabin
    new THREE.Vector2(0.95, 7.0),   // main cabin
    new THREE.Vector2(0.95, 9.5),
    new THREE.Vector2(0.85,11.0),   // forward shoulder
    new THREE.Vector2(0.62,12.2),   // nose taper
    new THREE.Vector2(0.26,13.1),
    new THREE.Vector2(0,   13.6),   // nose tip
  ];
  const fuseGeo = new THREE.LatheGeometry(fusePts, 18);
  fuseGeo.rotateZ(-Math.PI / 2);
  fuseGeo.translate(-6.8, 0, 0);
  const fuselage = new THREE.Mesh(fuseGeo, whiteMat);
  fuselage.position.set(0, 1.0, 0);
  fuselage.castShadow = true;
  pg.add(fuselage);

  // ── Blue cheatline stripe (both sides) ──
  for (const s of [-1, 1]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.38, 0.06), blueMat);
    stripe.position.set(-0.5, 1.62, s * 0.96);
    pg.add(stripe);
  }

  // ── Cockpit windows (angled tinted panels near nose) ──
  for (const [wx, wz, ry] of [
    [5.2,  0.55, -0.45],
    [5.2, -0.55,  0.45],
    [5.6,  0.28, -0.25],
    [5.6, -0.28,  0.25],
  ]) {
    const cw = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.55, 0.06), glassMat);
    cw.position.set(wx, 1.55, wz);
    cw.rotation.y = ry;
    pg.add(cw);
  }

  // ── Passenger windows ──
  for (let wi = -3.8; wi <= 3.0; wi += 1.35) {
    for (const s of [-1, 1]) {
      const pw = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.44, 0.06), glassMat);
      pw.position.set(wi, 1.68, s * 0.96);
      pg.add(pw);
    }
  }

  // ── Swept wings (custom BufferGeometry trapezoid) ──
  function makeWingGeo(side) {
    // side: 1 = right (+Z), -1 = left (-Z)
    const span = 8.5 * side;
    const sweep = 2.8; // tip leading edge swept back
    const rc = 3.0;    // root chord
    const tc = 1.6;    // tip chord
    const th = 0.22;   // thickness
    const v = new Float32Array([
      // top:  root-lead(0), root-trail(1), tip-trail(2), tip-lead(3)
       0.3, th/2, 0,               // 0 root leading
      -rc+0.3, th/2, 0,            // 1 root trailing
      -sweep-tc+0.3, th/2, span,   // 2 tip trailing
      -sweep+0.3, th/2, span,      // 3 tip leading
      // bottom
       0.3,-th/2, 0,               // 4
      -rc+0.3,-th/2, 0,            // 5
      -sweep-tc+0.3,-th/2, span,   // 6
      -sweep+0.3,-th/2, span,      // 7
    ]);
    const idx = [
      0,1,2, 0,2,3,    // top
      4,6,5, 4,7,6,    // bottom
      0,4,5, 0,5,1,    // root cap
      3,7,6, 3,6,2,    // tip cap
      0,3,7, 0,7,4,    // leading edge
      1,5,6, 1,6,2,    // trailing edge
    ];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }
  for (const side of [1, -1]) {
    const wing = new THREE.Mesh(makeWingGeo(side), whiteMat);
    wing.position.set(0, 0.62, 0);
    wing.castShadow = true;
    pg.add(wing);
    // Winglet
    const wl = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.6, 0.8), blueMat);
    wl.position.set(-2.5, 1.42, side * 8.5);
    pg.add(wl);
  }

  // ── Engine nacelles hung under wings (2 per side) ──
  for (const [ex, ez] of [[-0.8, 3.8], [-2.6, 6.0], [-0.8,-3.8], [-2.6,-6.0]]) {
    // Pylon strut
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.7, 0.55), strutMat);
    pylon.position.set(ex, 0.18, ez);
    pg.add(pylon);
    // Nacelle body
    const nacPts = [
      new THREE.Vector2(0,    0),
      new THREE.Vector2(0.36, 0.15),
      new THREE.Vector2(0.44, 0.6),
      new THREE.Vector2(0.44, 1.8),
      new THREE.Vector2(0.38, 2.5),
      new THREE.Vector2(0.28, 2.9),
      new THREE.Vector2(0,    3.0),
    ];
    const nacGeo = new THREE.LatheGeometry(nacPts, 12);
    nacGeo.rotateZ(-Math.PI / 2);
    nacGeo.translate(-1.5, 0, 0);
    const nac = new THREE.Mesh(nacGeo, engineMat);
    nac.position.set(ex, -0.22, ez);
    nac.castShadow = true;
    pg.add(nac);
    // Inlet ring
    const inlet = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.06, 8, 14), darkMat);
    inlet.rotation.y = Math.PI / 2;
    inlet.position.set(ex + 1.5, -0.22, ez);
    pg.add(inlet);
    // Dark intake cavity
    const cavity = new THREE.Mesh(new THREE.CircleGeometry(0.38, 12), darkMat);
    cavity.rotation.y = Math.PI / 2;
    cavity.position.set(ex + 1.46, -0.22, ez);
    pg.add(cavity);
  }

  // ── Vertical tail fin (swept, tapered) ──
  {
    const sweep = 1.4;
    const h = 3.8, baseC = 2.8, topC = 1.0, th = 0.26;
    const v = new Float32Array([
      // front:  base-bot(0), base-top(1), tip-top(2), tip-bot — reuse as swept shape
       0,    0,   -th/2,  // 0 base leading bottom
       0,    0,    th/2,  // 1 base leading top-edge (Z axis is fin width here)
      -baseC,0,   -th/2,  // 2 base trailing bottom
      -baseC,0,    th/2,  // 3 base trailing top-edge
      -sweep, h,  -th/2,  // 4 tip leading bottom
      -sweep, h,   th/2,  // 5 tip leading top-edge
      -sweep-topC,h,-th/2,// 6 tip trailing bottom
      -sweep-topC,h, th/2,// 7 tip trailing top-edge
    ]);
    // Faces: left(-Z), right(+Z), leading, trailing, base, tip
    const idx = [
      0,4,6, 0,6,2,   // left face
      1,3,7, 1,7,5,   // right face
      0,1,5, 0,5,4,   // leading edge
      2,6,7, 2,7,3,   // trailing edge
      0,2,3, 0,3,1,   // base cap
      4,5,7, 4,7,6,   // tip cap
    ];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const fin = new THREE.Mesh(geo, blueMat);
    fin.position.set(-4.5, 1.0, 0);
    fin.castShadow = true;
    pg.add(fin);
  }

  // ── Horizontal stabilizers (smaller swept wing geo) ──
  function makeStabGeo(side) {
    const span = 3.5 * side, sweep = 0.9, rc = 1.5, tc = 0.7, th = 0.16;
    const v = new Float32Array([
       0.2, th/2, 0,  -rc+0.2, th/2, 0,  -sweep-tc+0.2, th/2, span,  -sweep+0.2, th/2, span,
       0.2,-th/2, 0,  -rc+0.2,-th/2, 0,  -sweep-tc+0.2,-th/2, span,  -sweep+0.2,-th/2, span,
    ]);
    const idx = [0,1,2,0,2,3, 4,6,5,4,7,6, 0,4,5,0,5,1, 3,7,6,3,6,2, 0,3,7,0,7,4, 1,5,6,1,6,2];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }
  for (const side of [1, -1]) {
    const stab = new THREE.Mesh(makeStabGeo(side), whiteMat);
    stab.position.set(-5.2, 0.82, 0);
    pg.add(stab);
  }

  // ── Travel agent NPC beside the kiosk ──
  const agentX = x - kioskW / 2 - 1.6;
  const agentZ = z;
  const agent = makeCrowdPerson(0x1e4db8, 0x1a1a2e, null);
  agent.position.set(agentX, base + 0.08, agentZ);
  agent.rotation.y = Math.PI / 4; // faces toward kiosk
  agent.scale.setScalar(1.1);
  group.add(agent);

  const shop = {
    name: 'Airport Info Agent',
    dialog: 'Welcome! This is City Airport — home of our famous display aircraft. Press F to explore travel destinations around the city.',
    ownerPos: { x: agentX, z: agentZ },
    interactionRadius: 4.0,
    prompt: 'Press E to talk to the Airport Agent',
    isTravelAgent: true,
  };

  return { x, z, shop };
}
