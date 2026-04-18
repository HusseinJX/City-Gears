# Plan: Mapbox GL JS Integration

Repo: `~/City-Gears`
App root: `~/City-Gears/omc-city`
Live Netlify: https://city-gears-1776232519.netlify.app
Local servers: game on `:8787` (python http.server from `omc-city/`), whatslocal proxy on `:8788` (node `~/City-Gears/proxy.mjs`).

## Goal

Replace the custom Three.js OSM city renderer with **Mapbox GL JS** as the base world renderer. Mapbox handles terrain, streets, and 3D buildings (real SF data). A **custom Three.js layer** injected into Mapbox's WebGL context renders the character, vehicles, NPCs, and props on top.

---

## Current state of the repo (after SF_REBUILD_PLAN.md Tier 1)

Files that exist and will be **kept** (game logic — do not touch):
- `omc-city/src/character.js` — character mesh + pose system
- `omc-city/src/controller.js` — WASD/mouse input, `isBlocked` collision
- `omc-city/src/camera.js` — third-person camera rig (will be adapted, not deleted)
- `omc-city/src/motorcycle.js` + `car.js` + `vehicle-physics.js` — drivetrain model
- `omc-city/src/npcs.js` — pedestrian + shop-owner NPCs
- `omc-city/src/audio.js` — engine sounds, dialog SFX
- `omc-city/src/config.js` — CONFIG (tweak values only, no structural change)
- `omc-city/src/textures.js` — makeSignTexture, makeWindowTexture (sign still used)
- `omc-city/src/props.js` — trees, streetlights, benches (keep but simplify placement)

Files that will be **replaced / heavily modified**:
- `omc-city/src/main.js` — full rewrite around Mapbox
- `omc-city/src/city.js` — deleted; city = Mapbox layers
- `omc-city/src/sf-streets.js` — deleted; streets = Mapbox
- `omc-city/src/sf-buildings.js` — deleted; buildings = Mapbox fill-extrusion
- `omc-city/src/environment.js` — sky/fog/sun replaced by Mapbox style (delete or stub)
- `omc-city/index.html` — add Mapbox GL JS + CSS, restructure canvas setup
- `omc-city/src/data/sf.json` — no longer needed at runtime (keep for reference)

New files:
- `omc-city/src/mapbox-layer.js` — custom Three.js layer that plugs into Mapbox
- `omc-city/src/geo.js` — coordinate utilities (lat/lon ↔ Mercator ↔ game meters)

---

## Architecture

```
index.html
  └── Mapbox GL JS map  (div#map, fills viewport)
        ├── Mapbox layers: satellite/streets + terrain + 3D buildings
        └── custom layer: 'game-layer'  (Three.js scene)
              ├── character mesh
              ├── motorcycle mesh
              ├── car mesh
              ├── NPC meshes
              └── props (signs, streetlights, etc.)
```

The Mapbox map IS the scene. Three.js renders only the game objects — no sky, no ground plane, no buildings, no roads.

---

## Coordinate system

SF center: `37.7935°N, -122.4020°W` — same as SF_REBUILD_PLAN.md.

**Game meters** (local equirectangular, same projection as before):
```
x = (lon - lon0) * 111320 * cos(lat0 * π/180)
z = -(lat - lat0) * 110540
```
Origin (0, 0) = SF center.

**Mapbox Mercator** for custom layer rendering:
```js
import mapboxgl from 'mapbox-gl';
const mc = mapboxgl.MercatorCoordinate.fromLngLat([lon, lat], altitudeMeters);
// mc.x, mc.y, mc.z  — used to build the Three.js model matrix
```

`geo.js` exports:
```js
export const SF_CENTER = { lat: 37.7935, lon: -122.4020 };

// Game meters → [lon, lat]
export function metersToLngLat(x, z) { ... }

// [lon, lat] → game meters
export function lngLatToMeters(lon, lat) { ... }

// Build a Three.js Matrix4 that places a game-meter position
// into Mapbox's Mercator coordinate space (used in the custom layer render fn).
export function gameToMercatorMatrix(x, z, elevationMeters, map) { ... }
```

---

## Mapbox setup

### API key
The Mapbox public token goes in `omc-city/src/config.js`:
```js
export const MAPBOX_TOKEN = 'your-mapbox-token'; // fill in before running
```

Never commit the real token to git — add a placeholder and a comment. The user pastes their own key.

### Map style
Use `'mapbox://styles/mapbox/standard'` for photorealistic 3D buildings + terrain.

Alternatives (if performance is poor):
- `'mapbox://styles/mapbox/streets-v12'` — classic streets, no photo textures
- Custom style with only the layers we need

### 3D terrain
```js
map.addSource('mapbox-dem', {
  type: 'raster-dem',
  url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
  tileSize: 512,
});
map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.0 });
```

### 3D buildings (if Standard style doesn't include them)
```js
map.addLayer({
  id: '3d-buildings',
  source: 'composite',
  'source-layer': 'building',
  type: 'fill-extrusion',
  minzoom: 15,
  paint: {
    'fill-extrusion-color': '#aaa',
    'fill-extrusion-height': ['get', 'height'],
    'fill-extrusion-base': ['get', 'min_height'],
    'fill-extrusion-opacity': 0.9,
  },
});
```

---

## `omc-city/src/mapbox-layer.js`

This file implements `CustomLayerInterface` and owns the Three.js scene for game objects.

```js
import * as THREE from 'three';
import { gameToMercatorMatrix, metersToLngLat } from './geo.js';

export function createGameLayer(map, gameObjects) {
  // gameObjects = { character, motorcycle, car, npcs, props }

  let camera, scene, renderer;

  return {
    id: 'game-layer',
    type: 'custom',
    renderingMode: '3d',

    onAdd(map, gl) {
      camera = new THREE.Camera();
      scene  = new THREE.Scene();

      // Ambient + directional light (Mapbox handles sun for the base map;
      // we add our own lights for the Three.js game objects).
      const amb = new THREE.AmbientLight(0xffffff, 0.6);
      const sun = new THREE.DirectionalLight(0xffffff, 1.0);
      sun.position.set(0, 70, 100);
      scene.add(amb, sun);

      // Add all game meshes.
      scene.add(
        gameObjects.character.group,
        gameObjects.motorcycle.group,
        gameObjects.car.group,
        ...gameObjects.npcs,
        ...gameObjects.props,
      );

      renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      });
      renderer.autoClear = false;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    },

    render(gl, mercatorMatrix) {
      // mercatorMatrix: Mapbox's world-view-projection matrix (column-major Float64).
      // Build a Three.js Matrix4 from it and hand to camera.
      const m = new THREE.Matrix4().fromArray(mercatorMatrix);

      // Position every game object in Mercator space.
      // Each object has a .gamePos = { x, z } in game meters.
      // We compute its Mercator model matrix and premultiply with m.
      // (See gameToMercatorMatrix in geo.js.)
      // Character:
      updateMercatorPosition(gameObjects.character, map, m, camera);
      // ... same for other objects

      camera.projectionMatrix = m;
      renderer.resetState();
      renderer.render(scene, camera);
      map.triggerRepaint();
    },
  };
}
```

**Key insight**: `mercatorMatrix` from Mapbox already encodes the map's view + projection. We don't need our own camera math — we just set the Three.js `camera.projectionMatrix` to that matrix and position objects in Mercator space.

Each game object's position is computed once per frame as a Mercator coordinate offset from the map origin. See Mapbox's official Three.js custom layer example for the exact matrix math.

---

## Camera

The Mapbox camera replaces `createCameraRig`. Instead of orbiting around the character in Three.js, we call:

```js
map.easeTo({
  center: metersToLngLat(char.x, char.z),
  pitch: 60,         // degrees from vertical
  bearing: -yaw * (180 / Math.PI),  // follow character facing
  zoom: 17.5,
  duration: 0,       // instant (per-frame)
});
```

This gives a fixed ~60° overhead follow camera. The character always stays in frame.

Optionally, mouse drag on the map rotates `bearing` for freelook (Mapbox handles this natively — just enable `dragRotate`).

**Third-person distance** is controlled by `zoom` (17.5 ≈ ~60m view width — tune to taste).

---

## `omc-city/src/main.js` (rewrite outline)

```js
import mapboxgl from 'mapbox-gl';
import * as THREE from 'three';
import { MAPBOX_TOKEN, CONFIG } from './config.js';
import { metersToLngLat, lngLatToMeters } from './geo.js';
import { createGameLayer } from './mapbox-layer.js';
import { createCharacter } from './character.js';
import { createController } from './controller.js';
import { createNPCs } from './npcs.js';
import { createMotorcycle } from './motorcycle.js';
import { createCar } from './car.js';
import { attachAudioUnlock, ... } from './audio.js';

mapboxgl.accessToken = MAPBOX_TOKEN;

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/standard',
  center: [-122.4020, 37.7935],
  zoom: 17.5,
  pitch: 60,
  bearing: 0,
  antialias: true,
});

map.on('load', () => {
  // Add terrain
  map.addSource('mapbox-dem', { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512 });
  map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.0 });

  // Create game objects (Three.js meshes, no scene.add yet)
  const character  = createCharacter();
  const motorcycle = createMotorcycle({ isBlocked });
  const car        = createCar({ isBlocked });
  const npcs       = createNPCs(null, cityInfo, shops, { isBlocked });

  // Spawn position: Sacramento & Montgomery (~spawn from SF_REBUILD_PLAN)
  const spawnLngLat = [-122.4028, 37.7938]; // tune to a street
  const [spawnX, spawnZ] = lngLatToMeters(...spawnLngLat);
  character.gamePos = { x: spawnX, z: spawnZ, y: 0 };

  // Collision: query Mapbox terrain for ground height
  function getGroundY(x, z) {
    const ll = metersToLngLat(x, z);
    return map.queryTerrainElevation(ll) || 0;
  }

  // isBlocked: for Tier 1 just return false (buildings stop the camera view naturally).
  // Proper collision via Mapbox building query can be added in Tier 2.
  function isBlocked(x, z, r) { return false; }

  // Build and add custom game layer
  const gameLayer = createGameLayer(map, { character, motorcycle, car, npcs });
  map.addLayer(gameLayer);

  // Controller (WASD)
  const controller = createController(null, { isBlocked });

  // Game loop
  const clock = new THREE.Clock();
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    controller.update(dt, character.gamePos);
    character.update(dt, ...);
    // snap Y to terrain
    character.gamePos.y = getGroundY(character.gamePos.x, character.gamePos.z);
    // update Mapbox camera to follow
    map.easeTo({
      center: metersToLngLat(character.gamePos.x, character.gamePos.z),
      pitch: 60,
      zoom: 17.5,
      duration: 0,
    });
    // HUD, dialog, vehicle logic...
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
});
```

---

## `omc-city/index.html` changes

Replace `<canvas id="gameCanvas">` with a div:
```html
<div id="map" style="position:fixed;top:0;left:0;width:100%;height:100%;"></div>
```

Add Mapbox GL JS:
```html
<link href="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css" rel="stylesheet" />
<script src="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js"></script>
```

Add to importmap (for Three.js custom layer):
```json
{
  "imports": {
    "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
    "mapbox-gl": "https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js"
  }
}
```

(Note: Mapbox GL JS is not an ES module — import it via `<script>` tag and use the global `mapboxgl`.)

---

## Controller changes needed

`controller.js` currently takes a Three.js `Object3D` and sets `.position` on it. For the Mapbox version, the character's position lives in `gamePos = { x, z, y }` (game meters).

Option A: Pass a proxy object that looks like a THREE.Group:
```js
const charProxy = {
  position: { x: spawnX, y: 0, z: spawnZ },
  rotation: { y: 0 },
};
controller.update(dt, charProxy);
character.group.rotation.y = charProxy.rotation.y;
character.gamePos = { x: charProxy.position.x, z: charProxy.position.z };
```

Option B: Modify controller.js to work on a plain `{x, z, yaw}` state object.

**Option A is simpler** — no changes to controller.js.

---

## NPC changes needed

`npcs.js` uses `cityInfo.blocks` to spawn NPCs on sidewalk perimeters. With no city info from OSM parsing, we need to supply synthetic blocks around the spawn area.

Quick approach: generate a grid of fake blocks around the SF center point in game meters, sized like a Financial District city block (~60×80m blocks, ~10m road gaps):

```js
const syntheticBlocks = [];
for (let i = -4; i <= 4; i++) {
  for (let j = -4; j <= 4; j++) {
    syntheticBlocks.push({
      x: i * 80, z: j * 90,
      width: 60, depth: 70,
      size: 60, type: 'mixed',
    });
  }
}
```

Pass these as `cityInfo.blocks` to `createNPCs`.

---

## Shops / dialog

Shops are no longer sourced from OSM. Use the existing `CONFIG.shops.names` + `CONFIG.shops.dialog` arrays. Place owners at hardcoded real SF locations (in game meters derived from lat/lon) or scatter them on the synthetic NPC blocks.

The WhatsLocal iframe integration (`saleIframe`, F key) is unchanged.

---

## Execution order

1. Add `MAPBOX_TOKEN` placeholder to `config.js`.
2. Write `omc-city/src/geo.js` — coordinate conversion utilities.
3. Rewrite `omc-city/index.html` — add Mapbox GL CSS/JS, replace canvas with div, update importmap.
4. Write `omc-city/src/mapbox-layer.js` — custom Three.js layer.
5. Rewrite `omc-city/src/main.js` — Mapbox map init, game loop, camera follow.
6. Delete `city.js`, `sf-streets.js`, `sf-buildings.js`, `environment.js` (or stub them).
7. Test: character spawns on SF street, can walk, camera follows, terrain height works.
8. Add NPC pedestrians (synthetic blocks).
9. Add motorcycle + car.
10. Add shops / dialog.
11. Tune camera zoom + pitch to feel like the original game.
12. **Commit + deploy.**

---

## Decisions locked

| # | Decision |
|---|----------|
| 1 | Mapbox GL JS v3.3.0 (latest stable as of plan date) |
| 2 | Style: `mapbox://styles/mapbox/standard` (photorealistic) |
| 3 | Terrain: Mapbox DEM, exaggeration 1.0 |
| 4 | Camera: `map.easeTo()` pitch=60°, zoom=17.5, bearing follows character yaw |
| 5 | Collision (Tier 1): disabled (`isBlocked` always false) — player walks through buildings |
| 6 | NPC blocks: synthetic grid, not from OSM |
| 7 | Token: in `config.js` as `MAPBOX_TOKEN`, not committed |

---

## What to tell the next session

> Read MAPBOX_PLAN.md and implement it. The user has a Mapbox token ready to paste in. Start at step 1 of the Execution order. The existing game files (character.js, controller.js, motorcycle.js, car.js, npcs.js, audio.js, config.js, textures.js, props.js) must not be broken — only main.js, city.js, index.html, and environment.js change significantly.

---

## Files that will be added

- `omc-city/src/geo.js`
- `omc-city/src/mapbox-layer.js`

## Files that will be rewritten

- `omc-city/src/main.js`
- `omc-city/index.html`
- `omc-city/src/config.js` (add MAPBOX_TOKEN)

## Files that will be deleted

- `omc-city/src/city.js`
- `omc-city/src/sf-streets.js`
- `omc-city/src/sf-buildings.js`
- `omc-city/src/environment.js`

## Files that will NOT change

- `omc-city/src/character.js`
- `omc-city/src/controller.js`
- `omc-city/src/camera.js` (may be deprecated but kept for reference)
- `omc-city/src/motorcycle.js`
- `omc-city/src/car.js`
- `omc-city/src/vehicle-physics.js`
- `omc-city/src/npcs.js`
- `omc-city/src/audio.js`
- `omc-city/src/textures.js`
- `omc-city/src/props.js`
- `omc-city/src/config.js` (only MAPBOX_TOKEN added)
