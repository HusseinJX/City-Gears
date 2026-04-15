import * as THREE from 'three';
import { CONFIG } from './config.js';
import { makeSkyTexture } from './textures.js';

export function createEnvironment(scene, renderer) {
  // Sky background gradient
  scene.background = makeSkyTexture(CONFIG.skyTopColor, CONFIG.skyHorizonColor);

  // Fog matches the warm horizon for smooth blend
  scene.fog = new THREE.FogExp2(CONFIG.skyHorizonColor, CONFIG.fogDensity);

  // Ambient light
  scene.add(new THREE.AmbientLight(CONFIG.ambientColor, CONFIG.ambientIntensity));

  // Hemisphere fill for soft top/bottom variation
  const hemi = new THREE.HemisphereLight(CONFIG.skyTopColor, CONFIG.groundColor, 0.35);
  scene.add(hemi);

  // Directional sunlight
  const sun = new THREE.DirectionalLight(CONFIG.sunColor, CONFIG.sunIntensity);
  sun.position.set(80, 140, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const d = 80;
  sun.shadow.camera.left = -d;
  sun.shadow.camera.right = d;
  sun.shadow.camera.top = d;
  sun.shadow.camera.bottom = -d;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 350;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);

  // Ground plane (large, sits below sidewalks)
  const groundSize = Math.max(800, CONFIG.city.blocks * (CONFIG.city.blockSize + CONFIG.city.roadWidth) * 2);
  const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize);
  const groundMat = new THREE.MeshLambertMaterial({ color: CONFIG.groundColor });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);

  if (renderer) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  return { sun, ground };
}
