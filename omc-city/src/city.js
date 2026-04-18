import * as THREE from 'three';
import { CONFIG } from './config.js';
import { makeWindowTexture, makeSignTexture } from './textures.js';
import { buildStreets } from './sf-streets.js';
import { buildBuildings } from './sf-buildings.js';

// Load SF OSM data at module-load time (browser fetch). createCity awaits this.
let _sfData = null;
const _sfDataPromise = (async () => {
  const r = await fetch('./src/data/sf.json');
  if (!r.ok) throw new Error(`Failed to fetch sf.json: ${r.status}`);
  _sfData = await r.json();
  return _sfData;
})();

// Returns same shape as legacy procedural city so main.js / npcs.js / props.js keep working.
export async function createCity(scene) {
  const sfData = await _sfDataPromise;

  const group = new THREE.Group();
  group.name = 'city';
  scene.add(group);

  // ---- Large flat ground (asphalt) ----
  const GROUND = 2000;
  const asphalt = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND, GROUND),
    new THREE.MeshLambertMaterial({ color: 0x2c2c32 })
  );
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.position.y = 0.005;
  asphalt.receiveShadow = true;
  group.add(asphalt);

  // Window texture cache (shared by buildings + shops)
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

  // ---- Streets ----
  const { streetPolylines } = buildStreets(group, sfData);

  // ---- Buildings ----
  const { buildingAABBs } = buildBuildings(group, sfData, getWindowTex);

  // ---- Shops from OSM shop/amenity data ----
  const shops = generateShopsFromOSM(group, sfData);

  // Find a spawn on a road that isn't inside any building.
  const spawn = findFreeSpawn(sfData, buildingAABBs);

  const totalSize = 1500;
  const origin = -750;
  const cell = 50;

  // Synthesize block descriptors from building footprints so npcs.js (which
  // walks sidewalk perimeters of "blocks") still has something to walk around.
  const blocks = [];
  for (const b of buildingAABBs) {
    const width = b.maxX - b.minX;
    const depth = b.maxZ - b.minZ;
    if (width < 6 || depth < 6) continue;
    blocks.push({
      x: (b.minX + b.maxX) / 2,
      z: (b.minZ + b.maxZ) / 2,
      width: width + 3,   // small padding so NPCs walk on the adjacent sidewalk, not inside
      depth: depth + 3,
      size: Math.min(width, depth),
      type: 'mixed',
    });
  }

  return {
    group,
    obstacles: [],
    blocks,
    totalSize,
    origin,
    cell,
    shops,
    buildingAABBs,
    spawn,
    // Minimap reads streetPolylines instead of axis lists.
    xAxis: [],
    zAxis: [],
    streetPolylines,
  };
}

// Pick the closest-to-center highway node that clears all building AABBs.
function findFreeSpawn(sfData, buildingAABBs) {
  const R = 1.5; // clearance radius
  function blocked(x, z) {
    for (const b of buildingAABBs) {
      if (x > b.minX - R && x < b.maxX + R && z > b.minZ - R && z < b.maxZ + R) return true;
    }
    return false;
  }

  // Prefer primary/secondary roads close to city center.
  const prefer = new Set(['primary', 'secondary', 'tertiary', 'residential']);
  let best = null;
  let bestDist = Infinity;
  for (const w of sfData.ways || []) {
    const hwy = w.tags && w.tags.highway;
    if (!hwy || !prefer.has(hwy) || !w.nodes) continue;
    for (const n of w.nodes) {
      if (blocked(n.x, n.z)) continue;
      const dist = Math.sqrt(n.x * n.x + n.z * n.z);
      if (dist < bestDist) { bestDist = dist; best = n; }
    }
  }
  return best ? { x: best.x, z: best.z } : { x: -14.3, z: -43.2 };
}

function wayCentroid(nodes) {
  let sx = 0, sz = 0;
  for (const n of nodes) { sx += n.x; sz += n.z; }
  return { x: sx / nodes.length, z: sz / nodes.length };
}

function generateShopsFromOSM(group, sfData) {
  const cfg = CONFIG.shops;
  const shops = [];

  // Collect candidates: OSM points and ways with shop/amenity AND a name
  const candidates = [];
  for (const n of sfData.nodes || []) {
    const t = n.tags || {};
    if (!t.name) continue;
    if (!t.shop && !t.amenity) continue;
    candidates.push({ name: t.name, x: n.x, z: n.z });
  }
  for (const w of sfData.ways || []) {
    const t = w.tags || {};
    if (!t.name) continue;
    if (!t.shop && !t.amenity) continue;
    if (!w.nodes || w.nodes.length === 0) continue;
    const c = wayCentroid(w.nodes);
    candidates.push({ name: t.name, x: c.x, z: c.z });
  }

  // Deterministic-ish shuffle by hashing name, then take up to cfg.count.
  candidates.sort((a, b) => {
    const ha = hashStr(a.name + a.x);
    const hb = hashStr(b.name + b.x);
    return ha - hb;
  });

  const limit = Math.min(cfg.count, candidates.length);
  for (let i = 0; i < limit; i++) {
    const c = candidates[i];
    const signColor = cfg.signColors[i % cfg.signColors.length];
    const dialog = cfg.dialog[i % cfg.dialog.length];
    const yaw = 0;

    const ownerPos = { x: c.x, z: c.z };
    const signPos = { x: c.x, y: 3.0, z: c.z };

    const signMat = new THREE.MeshBasicMaterial({ map: makeSignTexture(c.name, signColor) });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.9), signMat);
    sign.position.set(signPos.x, signPos.y, signPos.z);
    sign.rotation.y = yaw;
    group.add(sign);

    const backer = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 1.1, 0.08),
      new THREE.MeshLambertMaterial({ color: 0x2a2a2a })
    );
    backer.position.copy(sign.position);
    backer.rotation.y = yaw;
    group.add(backer);

    shops.push({ name: c.name, dialog, signColor, facingYaw: yaw, ownerPos, signPos });
  }

  return shops;
}

function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
