import * as THREE from 'three';
import { CONFIG } from './config.js';
import { makeFaceTexture } from './textures.js';

// Builds a stylized humanoid out of primitive geometry.
// Returns: { group, update(dt, distanceWalked, isMoving) }
export function createCharacter() {
  const C = CONFIG.character;
  const root = new THREE.Group();
  root.name = 'character';

  const skinMat = new THREE.MeshLambertMaterial({ color: C.skin });
  const shirtMat = new THREE.MeshLambertMaterial({ color: C.shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: C.pants });
  const shoesMat = new THREE.MeshLambertMaterial({ color: C.shoes });
  const hairMat = new THREE.MeshLambertMaterial({ color: C.hair });

  const enableShadows = (mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = false;
  };

  // Proportions (units; total ~1.8 tall when standing)
  const torsoH = 0.6;
  const torsoW = 0.45;
  const torsoD = 0.28;
  const pelvisH = 0.18;
  const upperLegH = 0.42;
  const lowerLegH = 0.4;
  const footH = 0.08;
  const armUpperH = 0.32;
  const armLowerH = 0.3;
  const handH = 0.1;
  const headSize = 0.36;

  // ---------- Legs ----------
  function makeLeg(side) {
    const hipPivot = new THREE.Group();
    hipPivot.position.set(side * 0.12, 0, 0);

    const upperLeg = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, upperLegH, 0.2),
      pantsMat
    );
    upperLeg.position.y = -upperLegH / 2;
    enableShadows(upperLeg);
    hipPivot.add(upperLeg);

    const kneePivot = new THREE.Group();
    kneePivot.position.y = -upperLegH;
    hipPivot.add(kneePivot);

    const lowerLeg = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, lowerLegH, 0.18),
      pantsMat
    );
    lowerLeg.position.y = -lowerLegH / 2;
    enableShadows(lowerLeg);
    kneePivot.add(lowerLeg);

    const foot = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, footH, 0.3),
      shoesMat
    );
    foot.position.y = -lowerLegH - footH / 2 + 0.01;
    foot.position.z = 0.06;
    enableShadows(foot);
    kneePivot.add(foot);

    return { hipPivot, kneePivot };
  }

  // ---------- Arms ----------
  function makeArm(side) {
    const shoulderPivot = new THREE.Group();
    shoulderPivot.position.set(side * (torsoW / 2 + 0.08), torsoH / 2 - 0.06, 0);

    const upperArm = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, armUpperH, 0.16),
      shirtMat
    );
    upperArm.position.y = -armUpperH / 2;
    enableShadows(upperArm);
    shoulderPivot.add(upperArm);

    const elbowPivot = new THREE.Group();
    elbowPivot.position.y = -armUpperH;
    shoulderPivot.add(elbowPivot);

    const lowerArm = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, armLowerH, 0.15),
      skinMat
    );
    lowerArm.position.y = -armLowerH / 2;
    enableShadows(lowerArm);
    elbowPivot.add(lowerArm);

    const hand = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, handH, 0.16),
      skinMat
    );
    hand.position.y = -armLowerH - handH / 2;
    enableShadows(hand);
    elbowPivot.add(hand);

    return { shoulderPivot, elbowPivot };
  }

  // ---------- Body root pivot (handles bob) ----------
  const bodyRoot = new THREE.Group();
  // Position the hips so feet sit at y=0
  const hipY = footH + lowerLegH + upperLegH;
  bodyRoot.position.y = hipY;
  root.add(bodyRoot);

  // Pelvis box
  const pelvis = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, pelvisH, 0.26),
    pantsMat
  );
  pelvis.position.y = pelvisH / 2;
  enableShadows(pelvis);
  bodyRoot.add(pelvis);

  // Torso (slight scale animated for breathing)
  const torsoGroup = new THREE.Group();
  torsoGroup.position.y = pelvisH;
  bodyRoot.add(torsoGroup);

  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(torsoW, torsoH, torsoD),
    shirtMat
  );
  torso.position.y = torsoH / 2;
  enableShadows(torso);
  torsoGroup.add(torso);

  // Neck
  const neck = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.08, 0.14),
    skinMat
  );
  neck.position.y = torsoH + 0.04;
  enableShadows(neck);
  torsoGroup.add(neck);

  // Head with face texture
  const headPivot = new THREE.Group();
  headPivot.position.y = torsoH + 0.08;
  torsoGroup.add(headPivot);

  const faceTex = makeFaceTexture(CONFIG.character.skin);
  const headMaterials = [
    skinMat,        // +x
    skinMat,        // -x
    hairMat,        // +y top
    skinMat,        // -y bottom
    new THREE.MeshLambertMaterial({ map: faceTex }), // +z front (face)
    hairMat,        // -z back
  ];
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(headSize, headSize, headSize),
    headMaterials
  );
  head.position.y = headSize / 2;
  enableShadows(head);
  headPivot.add(head);

  // Hair tuft on top
  const tuft = new THREE.Mesh(
    new THREE.BoxGeometry(headSize * 0.95, 0.06, headSize * 0.95),
    hairMat
  );
  tuft.position.y = headSize + 0.03;
  enableShadows(tuft);
  headPivot.add(tuft);

  // Arms attach to torso group so they bob with body
  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);
  torsoGroup.add(leftArm.shoulderPivot);
  torsoGroup.add(rightArm.shoulderPivot);

  // Legs attach to bodyRoot at pelvis level
  const leftLeg = makeLeg(-1);
  const rightLeg = makeLeg(1);
  // hip pivot sits at top of upper leg, which is bodyRoot.y + 0 (since bodyRoot is at hipY)
  leftLeg.hipPivot.position.y = 0;
  rightLeg.hipPivot.position.y = 0;
  bodyRoot.add(leftLeg.hipPivot);
  bodyRoot.add(rightLeg.hipPivot);

  // Counter-rotate head so it stays level when body bobs/rotates slightly:
  // We don't need extra logic here — bobbing is positional, not rotational.

  // Animation state
  const state = {
    bodyBaseY: hipY,
    elapsed: 0,
    pose: 'walk', // 'walk' | 'sit'
  };

  function setPose(p) { state.pose = p; }

  function update(dt, distanceWalked, isMoving) {
    state.elapsed += dt;

    if (state.pose === 'sit') {
      // Seated pose: thighs horizontal, shins vertical down, leaning forward.
      const lerp = 1 - Math.exp(-dt * 12);
      const lerpTo = (pivot, axis, target) => {
        pivot.rotation[axis] += (target - pivot.rotation[axis]) * lerp;
      };
      lerpTo(leftLeg.hipPivot,  'x', -Math.PI / 2.1);
      lerpTo(rightLeg.hipPivot, 'x', -Math.PI / 2.1);
      lerpTo(leftLeg.kneePivot, 'x',  Math.PI / 2.4);
      lerpTo(rightLeg.kneePivot,'x',  Math.PI / 2.4);
      lerpTo(leftArm.shoulderPivot, 'x', -0.95);
      lerpTo(rightArm.shoulderPivot,'x', -0.95);
      lerpTo(leftArm.elbowPivot,  'x', 0.5);
      lerpTo(rightArm.elbowPivot, 'x', 0.5);
      // Drop the body a bit so butt sits at seat height
      const sitY = state.bodyBaseY - 0.55;
      bodyRoot.position.y += (sitY - bodyRoot.position.y) * lerp;
      torsoGroup.scale.set(1, 1, 1);
      // Slight forward lean
      torsoGroup.rotation.x += (0.25 - torsoGroup.rotation.x) * lerp;
      return;
    } else {
      // Ensure torso is upright in non-sit modes
      if (torsoGroup.rotation.x !== 0) {
        const lerp = 1 - Math.exp(-dt * 10);
        torsoGroup.rotation.x += (0 - torsoGroup.rotation.x) * lerp;
      }
    }

    if (isMoving) {
      const phase = distanceWalked * CONFIG.character.walkFrequency;
      const sin = Math.sin(phase);
      const sin2 = Math.sin(phase * 2);

      // Legs swing opposite phases
      leftLeg.hipPivot.rotation.x = sin * CONFIG.character.walkLegAmplitude * 0.5;
      rightLeg.hipPivot.rotation.x = -sin * CONFIG.character.walkLegAmplitude * 0.5;

      // Knees bend slightly on the forward swing
      leftLeg.kneePivot.rotation.x = Math.max(0, sin) * 0.8;
      rightLeg.kneePivot.rotation.x = Math.max(0, -sin) * 0.8;

      // Arms counter-swing
      leftArm.shoulderPivot.rotation.x = -sin * CONFIG.character.walkArmAmplitude * 0.6;
      rightArm.shoulderPivot.rotation.x = sin * CONFIG.character.walkArmAmplitude * 0.6;

      // Slight elbow bend
      leftArm.elbowPivot.rotation.x = 0.3 + Math.max(0, sin) * 0.4;
      rightArm.elbowPivot.rotation.x = 0.3 + Math.max(0, -sin) * 0.4;

      // Body bob: peaks twice per stride
      bodyRoot.position.y = state.bodyBaseY + Math.abs(sin2) * CONFIG.character.walkBobAmplitude;

      // Reset breathing scale
      torsoGroup.scale.set(1, 1, 1);
    } else {
      // Idle: gentle breathing scale on torso, arms hang
      const b = Math.sin(state.elapsed * CONFIG.character.breathingFrequency) * CONFIG.character.breathingAmplitude;
      torsoGroup.scale.set(1 + b * 0.4, 1 + b, 1 + b * 0.4);

      // Lerp limbs back to neutral
      const lerp = 1 - Math.exp(-dt * 8);
      leftLeg.hipPivot.rotation.x += (0 - leftLeg.hipPivot.rotation.x) * lerp;
      rightLeg.hipPivot.rotation.x += (0 - rightLeg.hipPivot.rotation.x) * lerp;
      leftLeg.kneePivot.rotation.x += (0 - leftLeg.kneePivot.rotation.x) * lerp;
      rightLeg.kneePivot.rotation.x += (0 - rightLeg.kneePivot.rotation.x) * lerp;
      leftArm.shoulderPivot.rotation.x += (0 - leftArm.shoulderPivot.rotation.x) * lerp;
      rightArm.shoulderPivot.rotation.x += (0 - rightArm.shoulderPivot.rotation.x) * lerp;
      leftArm.elbowPivot.rotation.x += (0.15 - leftArm.elbowPivot.rotation.x) * lerp;
      rightArm.elbowPivot.rotation.x += (0.15 - rightArm.elbowPivot.rotation.x) * lerp;

      bodyRoot.position.y += (state.bodyBaseY - bodyRoot.position.y) * lerp;
    }
  }

  return {
    group: root,
    update,
    setPose,
    height: hipY + pelvisH + torsoH + 0.08 + headSize, // approximate
  };
}
