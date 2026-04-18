# Plan: Authentic San Francisco Rebuild

Repo: `~/City-Gears`
App root: `~/City-Gears/omc-city`
Live Netlify: https://city-gears-1776232519.netlify.app
Local servers: game on `:8787` (python http.server), whatslocal proxy on `:8788` (node `~/City-Gears/proxy.mjs`).

Goal: replace procedural city with real San Francisco layout + terrain + iconic landmarks, keeping existing art style, characters, vehicles, NPCs, dialog, minimap, and WhatsLocal iframe integration intact.

---

## Tier 1 — Real street grid & building footprints (OpenStreetMap)

### T1.1 Area & coordinate system
- Window: **1.5 km × 1.5 km centered on Financial District** (37.7935 °N, −122.4020 °W).
- Local equirectangular projection around the center:
  - `x = (lon − lon0) * 111320 * cos(lat0 * π/180)`
  - `z = -(lat − lat0) * 110540` (negated so north points to `-Z`, matching Three.js convention used elsewhere)
- Origin of local meters = SF center point = game world (0, 0).

### T1.2 One-time data fetch
- New script: `scripts/fetch-sf.mjs` (run once, commit result).
- Overpass API (no key):
  ```
  [out:json][timeout:60];
  (
    way["highway"](bbox);
    way["building"](bbox);
    way["amenity"](bbox);
    way["shop"](bbox);
    way["leisure"](bbox);
    way["natural"="water"](bbox);
  );
  out geom;
  ```
- Project every node's lat/lon to local meters.
- Trim tags (keep only `highway`, `building`, `building:levels`, `height`, `name`, `shop`, `amenity`, `leisure`, `natural`).
- Write `src/data/sf.json` (~3-8 MB). Commit so Netlify deploy has no runtime fetch.

### T1.3 Street renderer — `src/sf-streets.js`
- For each highway way: polyline of projected vertices.
- Extrude each segment as a rectangle oriented along the segment; widths by `highway` tag:
  - motorway/trunk → 12m
  - primary → 10m
  - secondary → 8m
  - tertiary → 7m
  - residential → 6m
  - service → 4m
  - footway/path → 2m (sidewalk color only)
- Merge into one (or a few) BufferGeometry for performance. Intersections just overlap.
- Reuse existing `makeRoadTexture`; UV scale along segment length.

### T1.4 Building renderer — `src/sf-buildings.js`
- For each building way: polygon footprint (array of 2D pts).
- Height resolution order:
  1. `height` tag — parse float meters.
  2. `building:levels` × 3.5m.
  3. Deterministic seeded-random 8–18m (seed = OSM id so it's stable between loads).
- Extrude polygon via `ExtrudeGeometry` or manual walls + top quad.
- Reuse window textures from `src/textures.js`.
- Register AABB for every building into `buildingAABBs` (existing physics/collision system uses this).
- Merge buildings into batched meshes by height bucket (short / mid / tall) to keep draw calls low.

### T1.5 Base ground & parks
- Replace current asphalt plane with a single large ground quad covering the area (grey asphalt color).
- `leisure=park` / `leisure=garden` → green polygons on top.
- `natural=water` → blue polygons (low z-fight offset).

### T1.6 Shops from OSM
- Iterate OSM nodes/ways with `shop=*` or `amenity in {restaurant, cafe, bar, pub}`.
- Pick `name` tag; skip if no name.
- Owner position = the point on the building footprint nearest to the closest highway polyline.
- Signs face outward from that nearest-road direction (compute `yaw` from edge normal).
- Output an array matching the current `shops` shape:
  ```
  { name, dialog, signColor, facingYaw, ownerPos, signPos }
  ```
- Dialog: cycle existing `CONFIG.shops.dialog` strings (or keep static). This keeps F→WhatsLocal integration untouched.

### T1.7 Minimap adaptation
- Replace the xAxis/zAxis grid drawing in `main.js` `drawMinimap` with street polylines.
- Iterate each highway polyline, draw `lineTo` for each segment projected to minimap space.
- Shops & player dot unchanged.

### T1.8 Drop-in replacement of `createCity`
- Keep signature: `createCity(scene)` returns
  `{ group, obstacles, blocks, totalSize, origin, cell, shops, buildingAABBs, spawn, xAxis, zAxis }`.
- `xAxis`/`zAxis` can be empty arrays or bounding box min/max — minimap now uses polylines.
- `main.js` line 30 call site needs no change.
- Delete procedural block types (tower / park / restaurant / mixed) — all dead code after swap.

### ✅ Checkpoint 1
Walk SF streets, real buildings visible, real SF shop names in dialogs, minimap shows authentic grid. Commit & deploy.

---

## Tier 2 — Terrain & iconic landmarks

### T2.1 Elevation data fetch
- New script: `scripts/fetch-sf-dem.mjs`.
- **AWS Terrain Tiles** (free, no key): `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`
  - Terrarium PNG encoding: `height_m = (R * 256 + G + B / 256) - 32768`
  - Use z=14 or z=15 covering the bbox (a handful of tiles).
- Stitch tiles → bilinear resample to a regular grid over the local-meters bbox.
- Save as `src/data/sf-heightmap.bin` (Float32Array). Header JSON (`sf-heightmap.json`): bbox, resolution, width, height. Commit both.

### T2.2 Terrain mesh — `src/sf-terrain.js`
- `PlaneGeometry` subdivided to match heightmap resolution (e.g., 256×256 or 512×512).
- Vertex Y = bilinear sample of heightmap.
- Simple lambert material; optional vertex-color ramp (green low, grey high) for subtle hillshade feel.
- Export helper `getGroundHeightAt(x, z)` used by everything else.

### T2.3 Snap everything to terrain
- **Buildings**: compute `minY = min(getGroundHeightAt over footprint)`; place building so base sits at `minY - 1.5m` (sunk slightly so back-of-slope side isn't floating).
- **Streets**: resample each polyline every ~2m; set Y = `getGroundHeightAt + 0.08` per sample. Rebuild each segment as a small ribbon that follows the slope (Lombard will actually curve down the hill).
- **Character**: replace constant `sidewalkHeight` usage in `main.js`, `character.js`, `controller.js` with `getGroundHeightAt(px, pz)`.
- **NPCs**: same — sample terrain per pedestrian per frame.
- **Shops / signs**: Y = `getGroundHeightAt(ownerPos) + 3m`.
- **Spawn**: snap to terrain.

### T2.4 Vehicle physics on slopes
- In `vehicle-physics.js` / `motorcycle.js` / `car.js`:
  - Sample terrain at front + rear axle positions each tick.
  - Compute pitch = `atan2(frontY - rearY, wheelbase)`; apply to vehicle group.
  - Compute slope along facing direction; add gravity acceleration `g * sin(slope)` along forward axis (slows uphill, speeds downhill).
- Keep it arcade — no suspension, no roll on camber.

### T2.5 Camera terrain clip prevention
- In `camera.js`, add terrain to the raycast obstacle list so the third-person camera doesn't sink below ground on hills.

### T2.6 Iconic landmarks
- New file: `src/data/landmarks.js`. Each entry:
  ```
  { lat, lon, yaw, factory: (THREE) => Mesh }
  ```
- Builds (hand-modeled parametric, stylized to match existing art):
  - **Transamerica Pyramid**: 4-sided tapered pyramid, 260m, with short winged shoulders at ~35m floor.
  - **Salesforce Tower**: tapered octagon cylinder, 326m, wider base.
  - **Ferry Building**: long rectangular base + central clock tower (cube + pyramid top).
  - **Coit Tower**: short fluted cylinder with top ring; placed on Telegraph Hill (terrain from T2.3 provides elevation).
  - **Painted Ladies**: row of 6 colored Victorian boxes — reuse `makeBuildingMesh`-style with a fixed palette.
- Render AFTER T1.4 buildings; any OSM building whose AABB overlaps a landmark footprint is deleted before render (pre-pass filter by proximity to landmark lat/lon).

### T2.7 Polish
- Spawn at Ferry Building plaza facing Transamerica.
- Minimap: tint by elevation (lighter = higher) using same heightmap.
- HUD attribution: small text bottom-right above minimap: `© OpenStreetMap contributors` (ODbL requirement).

### ✅ Checkpoint 2
Hills working, Lombard snakes, Coit on Telegraph Hill, Transamerica + Salesforce + Ferry Building on skyline, camera behaves on hills. Commit & deploy.

---

## Risks & mitigations

1. **Performance with ~1000+ buildings** — merge into ≤5 batched meshes by height bucket; accept coarse shading.
2. **Building-on-slope clipping** — sinking base by ~1.5m hides float/gap; acceptable arcade compromise.
3. **OSM licensing (ODbL)** — attribution in HUD is mandatory. Don't skip.
4. **Area scale** — 1.5km² is a middle-ground chosen for perf + icon density. Tune up to 2km if needed.
5. **Diagonal streets (Market)** — polygon building footprints handle angle naturally; shops on Market need the "nearest road edge normal" yaw computation in T1.6.
6. **NPCs stuck on polygon walls** — existing `isBlocked` w/ AABBs will prevent clipping but NPCs may hug corners. Acceptable v1.

---

## Decisions locked during planning (revisit if needed)

| # | Question | Default |
|---|----------|---------|
| 1 | Area slice | Financial District + Telegraph Hill + Embarcadero |
| 2 | Size | 1.5 km × 1.5 km |
| 3 | Keep procedural fallback? | **Delete** — clean rewrite |
| 4 | Commit data files (`sf.json`, `sf-heightmap.bin`) | **Yes** — Netlify-safe, no runtime fetch |
| 5 | Attribution | Small HUD text bottom-right |

User still needs to confirm these before T1.2 is kicked off.

---

## Execution order (concrete checkpoints)

1. T1.2 Fetch & commit OSM data → inspect JSON, confirm bbox & counts look right.
2. T1.3 Streets render → load page, SF road mesh visible, player still at flat Y=0.
3. T1.4 Buildings render → blocky SF visible.
4. T1.6 Shops adapted → real SF shop names, F→WhatsLocal still works.
5. T1.7 Minimap adapted → real streets.
6. T1.8 Replace `createCity` → delete procedural code, player spawn.
7. **Commit + deploy Tier 1 ✓**
8. T2.1 DEM fetch → heightmap committed.
9. T2.2 Terrain mesh renders under the flat city → temporarily looks broken.
10. T2.3 Snap everything to terrain → hills appear.
11. T2.4 Vehicle physics on slopes.
12. T2.5 Camera terrain raycast.
13. T2.6 Landmarks.
14. T2.7 Polish + attribution.
15. **Commit + deploy Tier 2 ✓**

Time estimate: Tier 1 ~8-12h, Tier 2 ~10-14h.

---

## Files that will be added

- `scripts/fetch-sf.mjs`
- `scripts/fetch-sf-dem.mjs`
- `omc-city/src/data/sf.json`
- `omc-city/src/data/sf-heightmap.bin`
- `omc-city/src/data/sf-heightmap.json`
- `omc-city/src/data/landmarks.js`
- `omc-city/src/sf-streets.js`
- `omc-city/src/sf-buildings.js`
- `omc-city/src/sf-terrain.js`

## Files that will be modified

- `omc-city/src/city.js` — reduced to glue that pulls from the new SF modules (or fully deleted, with `createCity` moved to a new file).
- `omc-city/src/main.js` — `drawMinimap` swap, spawn position, terrain height for character.
- `omc-city/src/character.js`, `controller.js`, `camera.js`, `motorcycle.js`, `car.js`, `vehicle-physics.js`, `npcs.js` — replace `CONFIG.city.sidewalkHeight` usage with `getGroundHeightAt`.
- `omc-city/index.html` — OSM attribution element.

## Files that will be deleted / emptied

- All procedural helpers in `city.js`: `addPark`, `addTower`, `addMixed`, `addRestaurantRow`, `generateShops`, etc.

---

## Pick-up checklist for next session

1. Confirm the 5 decisions above.
2. Start at T1.2: write `scripts/fetch-sf.mjs`, run it, commit `src/data/sf.json`.
3. Verify game still loads (data file unused yet).
4. Proceed sequentially through the execution order.
