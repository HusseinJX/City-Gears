// Custom Three.js layer that plugs into Mapbox GL JS.
// All game objects are placed in Three.js "local" coordinates = game meters
// (x east, y up, z south from SF_CENTER). A single scene transform converts
// those to Mapbox Mercator coordinates each frame.

import * as THREE from 'three';
import { SF_CENTER } from './geo.js';

export function createGameLayer(map, gameObjects) {
  // gameObjects: { character, motorcycle, car, npcGroup }

  let camera, scene, renderer, sceneTransform;

  return {
    id: 'game-layer',
    type: 'custom',
    renderingMode: '3d',

    onAdd(map, gl) {
      camera = new THREE.Camera();
      scene  = new THREE.Scene();

      // Lights for game objects (Mapbox lights the base map; we light game meshes).
      const amb = new THREE.AmbientLight(0xffffff, 0.6);
      const sun = new THREE.DirectionalLight(0xffffff, 1.0);
      sun.position.set(0, 70, 100);
      scene.add(amb, sun);

      if (gameObjects.character)  scene.add(gameObjects.character.group);
      if (gameObjects.motorcycle) scene.add(gameObjects.motorcycle.group);
      if (gameObjects.car)        scene.add(gameObjects.car.group);
      if (gameObjects.npcGroup)   scene.add(gameObjects.npcGroup);

      // Pre-compute scene transform: game meters → Mapbox Mercator.
      // mapboxgl is available as a global via the <script> tag.
      const mc = mapboxgl.MercatorCoordinate.fromLngLat(
        [SF_CENTER.lon, SF_CENTER.lat], 0
      );
      const scale = mc.meterInMercatorCoordinateUnits();

      // Rotate 90° around X to go from Three.js (Y-up) to Mercator (Y-south).
      // Combined effect: Three.js (x, y, z) → Mercator (x_east, z_south, y_up).
      const rotX = new THREE.Matrix4().makeRotationAxis(
        new THREE.Vector3(1, 0, 0), Math.PI / 2
      );
      sceneTransform = new THREE.Matrix4()
        .makeTranslation(mc.x, mc.y, mc.z)
        .scale(new THREE.Vector3(scale, -scale, scale))
        .multiply(rotX);

      renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      });
      renderer.autoClear = false;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    },

    render(gl, args) {
      // Extract the WVP matrix from Mapbox's render args.
      // Mapbox v2 passes a flat Float64Array; v3 passes an object.
      let rawMatrix;
      if (args instanceof Float64Array || Array.isArray(args)) {
        rawMatrix = args;
      } else if (args && args.defaultProjectionData) {
        rawMatrix = args.defaultProjectionData.mainMatrix;
      } else if (args && args.modelViewProjectionMatrix) {
        rawMatrix = args.modelViewProjectionMatrix;
      }
      if (!rawMatrix || !sceneTransform) return;

      // Build final camera matrix: Mapbox WVP × scene-to-Mercator transform.
      const m = new THREE.Matrix4().fromArray(Array.from(rawMatrix));
      camera.projectionMatrix = m.multiply(sceneTransform);
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

      renderer.resetState();
      renderer.clearDepth(); // discard building depth so game objects always draw on top
      renderer.render(scene, camera);
      map.triggerRepaint();
    },
  };
}
