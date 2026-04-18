import * as THREE from 'three';
import { CONFIG } from './config.js';

function hash01(id) {
  const s = Math.sin(id * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function seededHeight(id) {
  return 8 + hash01(id) * 10; // 8-18 m
}

function buildingColor(id) {
  const p = CONFIG.buildingColors;
  return p[Math.floor(hash01(id + 13) * p.length) % p.length];
}

function roofColor(id) {
  const p = CONFIG.roofColors;
  return p[Math.floor(hash01(id + 91) * p.length) % p.length];
}

// Build building meshes using the ACTUAL OSM polygon footprints (ExtrudeGeometry).
// This fixes the AABB-overlap-covers-roads problem while keeping AABBs for collision.
export function buildBuildings(group, sfData, getWindowTex) {
  const buildingAABBs = [];
  const ways = sfData.ways || [];

  // Material cache by color hex value — one material per color to keep GPU state low.
  const matCache = new Map();
  function getMat(color) {
    if (!matCache.has(color)) {
      matCache.set(color, new THREE.MeshLambertMaterial({ color }));
    }
    return matCache.get(color);
  }

  for (const w of ways) {
    if (!w.tags || !w.tags.building) continue;
    const nodes = w.nodes;
    if (!nodes || nodes.length < 3) continue;

    // Compute AABB for collision (conservative; actual mesh uses real polygon).
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const n of nodes) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.z < minZ) minZ = n.z;
      if (n.z > maxZ) maxZ = n.z;
    }
    if (maxX - minX < 2 || maxZ - minZ < 2) continue;

    // Height from tags.
    let h;
    const hTag = w.tags.height;
    const lv   = w.tags['building:levels'];
    if (hTag != null && !Number.isNaN(parseFloat(hTag))) {
      h = parseFloat(hTag);
    } else if (lv != null && !Number.isNaN(parseInt(lv))) {
      h = parseInt(lv) * 3.5;
    } else {
      h = seededHeight(w.id);
    }
    h = Math.max(4, Math.min(200, h));

    // Build THREE.Shape from the polygon.
    // We map footprint (x, z) → shape (x, -z) so that after rotateX(-PI/2) the
    // building sits in XZ with height going up in +Y.
    const pts = nodes.map(n => new THREE.Vector2(n.x, -n.z));

    // Ensure CCW winding (Three.js requirement for filled outer shapes).
    const area = THREE.ShapeUtils.area(pts);
    if (area < 0) pts.reverse();

    // Deduplicate consecutive duplicate points (OSM polygons close on the first node).
    const deduped = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const prev = deduped[deduped.length - 1];
      if (Math.abs(pts[i].x - prev.x) > 0.01 || Math.abs(pts[i].y - prev.y) > 0.01) {
        deduped.push(pts[i]);
      }
    }
    if (deduped.length < 3) continue;

    let geo;
    try {
      const shape = new THREE.Shape(deduped);
      geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
    } catch (e) {
      // Degenerate polygon — fall back to AABB box.
      const bw = maxX - minX, bd = maxZ - minZ;
      geo = new THREE.BoxGeometry(bw, h, bd);
      geo.translate((minX + maxX) / 2, h / 2, (minZ + maxZ) / 2);
    }

    const color = buildingColor(w.id);
    const mesh  = new THREE.Mesh(geo, getMat(color));
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    buildingAABBs.push({ minX, maxX, minZ, maxZ });
  }

  return { buildingAABBs };
}
