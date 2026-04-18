import * as THREE from 'three';
import { makeRoadTexture } from './textures.js';

// Road widths by OSM highway type (meters).
const WIDTH_BY_HIGHWAY = {
  motorway: 12, trunk: 12,
  primary: 10,
  secondary: 8,
  tertiary: 7,
  residential: 6,
  service: 4,
  unclassified: 5,
  living_street: 5,
  footway: 2, path: 2, steps: 2, pedestrian: 3, cycleway: 2.5,
};

function widthForHighway(type) {
  return WIDTH_BY_HIGHWAY[type] || 6;
}

function isFootish(type) {
  return type === 'footway' || type === 'path' || type === 'steps'
    || type === 'cycleway' || type === 'pedestrian';
}

// Build 3D road geometry into `group`. All non-foot segments are merged into
// a handful of BufferGeometry objects (one per material bucket) so the scene
// has ~3 draw calls for roads instead of thousands.
export function buildStreets(group, sfData) {
  const streetPolylines = [];
  const ways = sfData.ways || [];

  // Accumulate quad vertices per bucket: 'main' (primary+) and 'local' (residential+service).
  // Each bucket → one merged mesh with one material.
  const buckets = {
    main:  { positions: [], normals: [], uvs: [], indices: [], vCount: 0 },
    local: { positions: [], normals: [], uvs: [], indices: [], vCount: 0 },
  };

  function bucketFor(hwy) {
    if (hwy === 'motorway' || hwy === 'trunk' || hwy === 'primary' || hwy === 'secondary') return 'main';
    return 'local';
  }

  for (const w of ways) {
    const hwy = w.tags && w.tags.highway;
    if (!hwy) continue;
    const width = widthForHighway(hwy);
    const foot = isFootish(hwy);

    // Track for minimap regardless of 3D geometry.
    streetPolylines.push({ nodes: w.nodes, width, highway: hwy });

    if (foot) continue;

    const bkt = buckets[bucketFor(hwy)];

    for (let i = 0; i < w.nodes.length - 1; i++) {
      const p1 = w.nodes[i];
      const p2 = w.nodes[i + 1];
      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len < 0.1) continue;

      // Perpendicular (right hand, in XZ plane)
      const px = -dz / len * width * 0.5;
      const pz =  dx / len * width * 0.5;

      // Four corners of the road quad (Y = 0.02 so it sits above ground)
      const Y = 0.02;
      // v0 = p1 + perp, v1 = p1 - perp, v2 = p2 + perp, v3 = p2 - perp
      const v = [
        [p1.x + px, Y, p1.z + pz],
        [p1.x - px, Y, p1.z - pz],
        [p2.x + px, Y, p2.z + pz],
        [p2.x - px, Y, p2.z - pz],
      ];
      const base = bkt.vCount;
      for (const [vx, vy, vz] of v) {
        bkt.positions.push(vx, vy, vz);
        bkt.normals.push(0, 1, 0);
      }
      // UV: u along width, v along length
      bkt.uvs.push(0, 0,  1, 0,  0, 1,  1, 1);
      // Two triangles: (0,1,2) and (1,3,2)
      bkt.indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      bkt.vCount += 4;
    }
  }

  // Build shared road texture + materials.
  const roadTex = makeRoadTexture(1);
  roadTex.wrapS = THREE.RepeatWrapping;
  roadTex.wrapT = THREE.RepeatWrapping;
  roadTex.repeat.set(4, 4);

  const mainMat  = new THREE.MeshLambertMaterial({ map: roadTex, color: 0x3a3a42 });
  const localMat = new THREE.MeshLambertMaterial({ map: roadTex, color: 0x2c2c34 });

  const matMap = { main: mainMat, local: localMat };

  for (const [name, bkt] of Object.entries(buckets)) {
    if (bkt.vCount === 0) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(bkt.positions, 3));
    geo.setAttribute('normal',   new THREE.Float32BufferAttribute(bkt.normals, 3));
    geo.setAttribute('uv',       new THREE.Float32BufferAttribute(bkt.uvs, 2));
    geo.setIndex(bkt.indices);
    const mesh = new THREE.Mesh(geo, matMap[name]);
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return { streetPolylines };
}

// Return polylines for minimap without building 3D meshes.
export function getStreetPolylines(sfData) {
  const out = [];
  for (const w of sfData.ways || []) {
    const hwy = w.tags && w.tags.highway;
    if (!hwy) continue;
    out.push({ nodes: w.nodes, width: widthForHighway(hwy), highway: hwy });
  }
  return out;
}
