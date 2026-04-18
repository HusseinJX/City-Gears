#!/usr/bin/env node
// Fetch SF Financial District OSM data via Overpass API and project to local meters.
// Writes omc-city/src/data/sf.json.
// Usage: node scripts/fetch-sf.mjs

import { writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, '..', 'omc-city', 'src', 'data', 'sf.json');

// SF Financial District bbox (1.5km x 1.5km)
const CENTER_LAT = 37.7935;
const CENTER_LON = -122.4020;
const SOUTH = 37.78671;
const WEST  = -122.41052;
const NORTH = 37.80029;
const EAST  = -122.39348;

const KEEP_TAGS = new Set([
  'highway', 'building', 'building:levels', 'height',
  'name', 'shop', 'amenity', 'leisure', 'natural',
]);

const QUERY = `
[out:json][timeout:60];
(
  way["highway"](${SOUTH},${WEST},${NORTH},${EAST});
  way["building"](${SOUTH},${WEST},${NORTH},${EAST});
  way["leisure"](${SOUTH},${WEST},${NORTH},${EAST});
  way["natural"="water"](${SOUTH},${WEST},${NORTH},${EAST});
  way["shop"](${SOUTH},${WEST},${NORTH},${EAST});
  way["amenity"](${SOUTH},${WEST},${NORTH},${EAST});
  node["shop"](${SOUTH},${WEST},${NORTH},${EAST});
  node["amenity"](${SOUTH},${WEST},${NORTH},${EAST});
);
out geom;
`.trim();

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
];

function projLatLon(lat, lon) {
  const lat0 = CENTER_LAT;
  const lon0 = CENTER_LON;
  const x = (lon - lon0) * 111320 * Math.cos(lat0 * Math.PI / 180);
  const z = -(lat - lat0) * 110540;
  return { x: +x.toFixed(2), z: +z.toFixed(2) };
}

function trimTags(tags) {
  if (!tags) return undefined;
  const out = {};
  let any = false;
  for (const [k, v] of Object.entries(tags)) {
    if (KEEP_TAGS.has(k)) { out[k] = v; any = true; }
  }
  return any ? out : undefined;
}

async function fetchOverpass(body) {
  let lastErr;
  for (const url of ENDPOINTS) {
    try {
      console.log(`  [overpass] trying ${url}`);
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(body),
      });
      if (!r.ok) { lastErr = new Error(`${url} -> HTTP ${r.status}`); continue; }
      return await r.json();
    } catch (e) {
      lastErr = e;
      console.warn(`  [overpass] failed: ${e.message}`);
    }
  }
  throw lastErr || new Error('All Overpass endpoints failed');
}

async function main() {
  console.log('Fetching SF Financial District OSM data from Overpass...');
  console.log(`  bbox: S=${SOUTH} W=${WEST} N=${NORTH} E=${EAST}`);
  const json = await fetchOverpass(QUERY);
  const elements = json.elements || [];
  console.log(`  received ${elements.length} elements`);

  const ways = [];
  const nodes = [];

  for (const el of elements) {
    if (el.type === 'way') {
      const geom = el.geometry;
      if (!geom || geom.length < 2) continue;
      const tags = trimTags(el.tags);
      if (!tags) continue;
      const projected = geom.map(g => projLatLon(g.lat, g.lon));
      ways.push({ id: el.id, tags, nodes: projected });
    } else if (el.type === 'node') {
      const tags = trimTags(el.tags);
      if (!tags) continue;
      if (el.lat == null || el.lon == null) continue;
      const { x, z } = projLatLon(el.lat, el.lon);
      nodes.push({ id: el.id, x, z, tags });
    }
  }

  console.log(`  ways: ${ways.length}, standalone nodes: ${nodes.length}`);

  await mkdir(dirname(OUT_PATH), { recursive: true });
  const out = {
    meta: {
      center: { lat: CENTER_LAT, lon: CENTER_LON },
      bbox: { south: SOUTH, west: WEST, north: NORTH, east: EAST },
      fetchedAt: new Date().toISOString(),
    },
    ways,
    nodes,
  };
  await writeFile(OUT_PATH, JSON.stringify(out));
  const s = await stat(OUT_PATH);
  console.log(`Wrote ${OUT_PATH} (${(s.size / 1024).toFixed(1)} KB)`);
}

main().catch(err => { console.error(err); process.exit(1); });
