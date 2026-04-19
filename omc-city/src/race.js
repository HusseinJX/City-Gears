import * as THREE from 'three';

const LAPS = 2;
const TW = 9;
const CP_TIGHT = 3.5;       // perpendicular to gate — must physically cross line
const CP_WIDE  = 7.5;       // parallel to gate — across road width
const WP_STEP = 7;
const WP_ADVANCE_DIST = 7;

const AI_COLORS = [0xe03535, 0x30b840, 0x2868d8, 0xe08020];
const AI_SPEEDS = [31, 29, 30, 28];
const AI_TURN_RATE = 3.2;
const AI_COL_R = 1.1;

// ─────────────────────────────────────────────────────────────────
// Route — L-shaped loop using 3 X and 3 Z grid positions
// Creates an interesting non-rectangular track with 7 turns
// ─────────────────────────────────────────────────────────────────
function pickCoords(xAxis, zAxis) {
  const n = xAxis.length, m = zAxis.length;
  const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const midI = Math.floor(n / 2);
  const midJ = Math.floor(m / 2);

  const i1 = cl(midI, 2, n - 3);                // center x — matches spawn x
  const i2 = cl(i1 + 2, i1 + 1, n - 2);         // east side
  const i3 = cl(i2 + 1, i2 + 1, n - 2);         // far east side
  const i0 = cl(i1 - 2, 1, i1 - 1);             // west side

  const j2 = cl(midJ + 1, midJ + 1, m - 2);     // south (start)
  const j1 = cl(j2 - 1, 1, j2 - 1);             // mid z
  const j0 = cl(j1 - 1, 1, j1 - 1);             // north

  return {
    x0: xAxis[i0], x1: xAxis[i1], x2: xAxis[i2], x3: xAxis[i3],
    z0: zAxis[j0], z1: zAxis[j1], z2: zAxis[j2],
  };
}

// L-shaped loop: S/F at (x1,z2), wide eastern section + notch in NW corner
// All left turns: E → N → W(partial) → S(short) → W → S → E back to start
function buildCorners(c) {
  return [
    { x: c.x1, z: c.z2 },  // 0 S/F      → going east
    { x: c.x3, z: c.z2 },  // 1 SE        → turn north (long east straight)
    { x: c.x3, z: c.z0 },  // 2 NE far    → turn west (full north straight)
    { x: c.x2, z: c.z0 },  // 3 N notch   → turn south (notch creates L)
    { x: c.x2, z: c.z1 },  // 4 mid notch → turn west
    { x: c.x0, z: c.z1 },  // 5 NW mid    → turn south
    { x: c.x0, z: c.z2 },  // 6 SW        → turn east
    { x: c.x1, z: c.z2 },  // 7 back to S/F
  ];
}

// Dense waypoints with pre-corner approach points to prevent corner-cutting
function buildWaypoints(corners) {
  const pts = [];
  const PAD = 6;
  for (let i = 0; i < corners.length - 1; i++) {
    const a = corners[i], b = corners[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const dist = Math.hypot(dx, dz);
    const ux = dx / dist, uz = dz / dist;
    const approachDist = Math.max(0, dist - PAD);
    const steps = Math.max(1, Math.floor(approachDist / WP_STEP));
    for (let j = 0; j < steps; j++) {
      pts.push({ x: a.x + ux * approachDist * j / steps, z: a.z + uz * approachDist * j / steps });
    }
    pts.push({ x: b.x - ux * PAD, z: b.z - uz * PAD });
    pts.push({ x: b.x, z: b.z });
  }
  pts.push({ ...corners[0] });
  return pts;
}

// 6 checkpoints (S/F = index 0, one per major straight)
// spanZ=true  → gate spans Z axis, car travels E/W → tight on X, wide on Z
// spanZ=false → gate spans X axis, car travels N/S → tight on Z, wide on X
function buildCheckpointPositions(corners) {
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
  return [
    { ...corners[0],               spanZ: true  },  // 0 S/F            (going east)
    { ...mid(corners[0], corners[1]), spanZ: true  },  // 1 east segment
    { ...mid(corners[1], corners[2]), spanZ: false },  // 2 north segment
    { ...mid(corners[2], corners[3]), spanZ: true  },  // 3 west notch top
    { ...mid(corners[4], corners[5]), spanZ: true  },  // 4 west straight
    { ...mid(corners[5], corners[6]), spanZ: false },  // 5 south straight
  ];
}

// ─────────────────────────────────────────────────────────────────
// Checkpoint gate visuals
// ─────────────────────────────────────────────────────────────────
const GATE_COLORS  = [0x00ffbb, 0x00aaff, 0xff7700, 0xffdd00, 0xff44cc];
const GATE_PASSED  = 0x888888;

function buildGate(scene, cp, idx) {
  // Track legs: 1=going east (EW), 2=going north (NS), 3=going west (EW),
  //             4=going west (EW), 5=going south (NS)
  // EW travel → gate spans NS (spanZ=true); NS travel → gate spans EW (spanZ=false)
  const spanZ = (idx === 1 || idx === 3 || idx === 4);
  const colorHex = GATE_COLORS[idx - 1];
  const halfW = TW / 2 + 2;
  const postH = 8;
  const meshes = [];

  const postGeo = new THREE.CylinderGeometry(0.35, 0.4, postH, 8);

  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, new THREE.MeshLambertMaterial({
      color: colorHex,
      emissive: new THREE.Color(colorHex).multiplyScalar(0.35),
    }));
    post.position.set(
      spanZ ? cp.x       : cp.x + s * halfW,
      postH / 2,
      spanZ ? cp.z + s * halfW : cp.z,
    );
    scene.add(post);
    meshes.push(post);
  }

  const barLen = TW + 4;
  const bar = new THREE.Mesh(
    spanZ ? new THREE.BoxGeometry(0.7, 0.8, barLen) : new THREE.BoxGeometry(barLen, 0.8, 0.7),
    new THREE.MeshLambertMaterial({ color: colorHex, emissive: new THREE.Color(colorHex).multiplyScalar(0.5), transparent: true, opacity: 0.92 }),
  );
  bar.position.set(cp.x, postH + 0.4, cp.z);
  scene.add(bar);
  meshes.push(bar);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.8, 0.28, 8, 24),
    new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: new THREE.Color(colorHex).multiplyScalar(0.9), transparent: true, opacity: 0.82 }),
  );
  ring.position.set(cp.x, postH - 0.6, cp.z);
  if (!spanZ) ring.rotation.y = Math.PI / 2;
  scene.add(ring);

  const allMeshes = [...meshes, ring];
  for (const m of allMeshes) m.visible = false;

  function setColor(passed) {
    for (const m of meshes) {
      m.material.color.setHex(passed ? GATE_PASSED : colorHex);
      if (passed) m.material.emissive.setScalar(0);
      else m.material.emissive.set(new THREE.Color(colorHex).multiplyScalar(0.35));
    }
    ring.material.color.setHex(passed ? 0x44ff88 : 0xffffff);
    if (passed) ring.material.emissive.setHex(0x44ff88);
    else ring.material.emissive.set(new THREE.Color(colorHex).multiplyScalar(0.9));
  }

  function setVisible(v) { for (const m of allMeshes) m.visible = v; }

  return { setColor, setVisible };
}

// ─────────────────────────────────────────────────────────────────
// Pink path markers (visible only during race)
// ─────────────────────────────────────────────────────────────────
function buildPathMarkers(scene, waypoints, corners) {
  const markers = [];
  const INTERVAL = 4;
  const mat = new THREE.MeshBasicMaterial({ color: 0xff1aaa, side: THREE.DoubleSide });

  // Arrow triangle shape
  const shape = new THREE.Shape();
  shape.moveTo(0, 2.0);       // tip
  shape.lineTo(1.2, -1.2);
  shape.lineTo(0.4, -0.7);
  shape.lineTo(0.4, -2.0);
  shape.lineTo(-0.4, -2.0);
  shape.lineTo(-0.4, -0.7);
  shape.lineTo(-1.2, -1.2);
  shape.closePath();
  const arrowGeo = new THREE.ShapeGeometry(shape);

  function addArrow(x, z, dx, dz) {
    if (Math.hypot(dx, dz) < 0.01) return;
    const grp = new THREE.Group();
    grp.rotation.y = Math.atan2(dx, dz);
    grp.position.set(x, 0.07, z);
    const mesh = new THREE.Mesh(arrowGeo, mat.clone());
    mesh.rotation.x = Math.PI / 2;
    grp.add(mesh);
    grp.visible = false;
    scene.add(grp);
    markers.push(grp);
  }

  // Regular arrows along the track
  const n = waypoints.length;
  for (let i = 0; i < n - 1; i += INTERVAL) {
    const curr = waypoints[i];
    const next = waypoints[Math.min(i + 2, n - 1)];
    addArrow(curr.x, curr.z, next.x - curr.x, next.z - curr.z);
  }

  // Always place arrows at each corner (turn markers)
  if (corners) {
    for (let ci = 0; ci < corners.length - 1; ci++) {
      const prev = ci > 0 ? corners[ci - 1] : corners[0];
      const curr = corners[ci];
      const next = corners[ci + 1];
      // Direction of travel approaching this corner
      const dx = curr.x - prev.x, dz = curr.z - prev.z;
      addArrow(curr.x, curr.z, dx, dz);
      // Also just past the corner in the new direction
      const dx2 = next.x - curr.x, dz2 = next.z - curr.z;
      const len2 = Math.hypot(dx2, dz2);
      if (len2 > 6) addArrow(curr.x + dx2/len2*4, curr.z + dz2/len2*4, dx2, dz2);
    }
  }

  return markers;
}

// ─────────────────────────────────────────────────────────────────
// Start / finish line
// ─────────────────────────────────────────────────────────────────
function buildStartLine(scene, x, z) {
  // Car goes east at start — S/F spans N/S at x
  const tiles = 8, tileH = TW / tiles, tileW = 2.4;
  for (let i = 0; i < tiles; i++) {
    const tile = new THREE.Mesh(
      new THREE.PlaneGeometry(tileW, tileH - 0.1),
      new THREE.MeshLambertMaterial({ color: i % 2 === 0 ? 0xffffff : 0x111111 }),
    );
    tile.rotation.x = -Math.PI / 2;
    tile.position.set(x, 0.04, z - TW / 2 + i * tileH + tileH / 2);
    scene.add(tile);
  }
  const poleMat = new THREE.MeshLambertMaterial({ color: 0xbbbbbb });
  const poleGeo = new THREE.CylinderGeometry(0.18, 0.18, 5.5, 8);
  for (const s of [-1, 1]) {
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(x, 2.75, z + s * (TW / 2 + 1.2));
    scene.add(pole);
  }
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, TW + 2.8),
    new THREE.MeshLambertMaterial({ color: 0xeeeeee, side: THREE.DoubleSide }),
  );
  banner.rotation.y = Math.PI / 2;
  banner.position.set(x, 5.4, z);
  scene.add(banner);
  for (const [yOff, col] of [[5.15, 0x228822], [5.55, 0xcc2222]]) {
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.35, TW + 2.8),
      new THREE.MeshLambertMaterial({ color: col }),
    );
    strip.position.set(x, yOff, z);
    scene.add(strip);
  }
}

// ─────────────────────────────────────────────────────────────────
// AI car mesh
// ─────────────────────────────────────────────────────────────────
function createAICar(color) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.65, 4.2),
    new THREE.MeshLambertMaterial({ color }),
  );
  body.position.y = 0.65;
  group.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.65, 0.6, 2.1),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(0.7) }),
  );
  cabin.position.set(0, 1.27, 0.15);
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  for (const [wx, wz] of [[-0.95, -1.4], [0.95, -1.4], [-0.95, 1.4], [0.95, 1.4]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.42, wz);
    group.add(w);
  }
  return { group, x: 0, z: 0, yaw: 0, speed: 0, color };
}

// ─────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────
export function createRaceTrack(scene, cx = 0, cz = 0, xAxis, zAxis) {
  const hasAxes = xAxis && xAxis.length >= 7 && zAxis && zAxis.length >= 6;
  let corners, startX, startZ;

  if (hasAxes) {
    const coords = pickCoords(xAxis, zAxis);
    corners = buildCorners(coords);
    startX = corners[0].x;
    startZ = corners[0].z;
  } else {
    const W = 130, H = 100, nw = 50, nh = 40;
    corners = [
      { x: cx,        z: cz + H   },  // S/F
      { x: cx + W,    z: cz + H   },  // SE
      { x: cx + W,    z: cz - H   },  // NE far
      { x: cx + nw,   z: cz - H   },  // N notch
      { x: cx + nw,   z: cz - nh  },  // mid notch
      { x: cx - W,    z: cz - nh  },  // NW mid
      { x: cx - W,    z: cz + H   },  // SW
      { x: cx,        z: cz + H   },  // back to S/F
    ];
    startX = cx; startZ = cz + H;
  }

  const waypoints = buildWaypoints(corners);
  const checkpointPositions = buildCheckpointPositions(corners);

  buildStartLine(scene, startX, startZ);

  const gates = [];
  for (let i = 1; i < checkpointPositions.length; i++) {
    gates.push(buildGate(scene, checkpointPositions[i], i));
  }

  const pathMarkers = buildPathMarkers(scene, waypoints, corners);

  return {
    waypoints, corners, checkpointPositions, gates, pathMarkers,
    startZone: { x: startX - 12, z: startZ, radius: 14 },
    startX, startZ, cx, cz,
  };
}

export function createRaceManager(scene, track, options = {}) {
  const { waypoints, checkpointPositions, gates, pathMarkers, startX, startZ } = track;
  const blocked = options.isBlocked || (() => false);
  const n = waypoints.length;
  const nCps = checkpointPositions.length;

  let raceState = 'idle';
  let countdownVal = 3;
  let countdownTimer = 0;
  let raceTime = 0;
  let finishOrder = [];

  const totalRacers = 1 + AI_COLORS.length;
  const laps  = Array(totalRacers).fill(0);
  const done  = Array(totalRacers).fill(false);
  const nextCp = Array(totalRacers).fill(1);

  const aiCars = AI_COLORS.map(createAICar);
  aiCars.forEach(car => { scene.add(car.group); car.group.position.set(0, -200, 0); });

  function setMarkersVisible(v) {
    for (const m of pathMarkers) m.visible = v;
  }

  function resetGateColors() {
    for (const g of gates) g.setColor(false);
  }

  function placeRacers(playerVehicle) {
    const grid = [
      { dx: -8,  dz: -3 }, { dx: -8,  dz:  3 },
      { dx: -16, dz: -3 }, { dx: -16, dz:  3 },
      { dx: -24, dz:  0 },
    ];
    if (playerVehicle) {
      const p = grid[0];
      playerVehicle.group.position.set(startX + p.dx, 0, startZ + p.dz);
      playerVehicle.state.yaw = -Math.PI / 2;
      playerVehicle.state.speed = 0;
      playerVehicle.group.rotation.y = -Math.PI / 2;
    }
    for (let i = 0; i < AI_COLORS.length; i++) {
      const p = grid[i + 1];
      const car = aiCars[i];
      car.x = startX + p.dx; car.z = startZ + p.dz;
      car.yaw = -Math.PI / 2; car.speed = 0; car.wpIdx = 0;
      car.group.position.set(car.x, 0, car.z);
      car.group.rotation.y = -Math.PI / 2;
    }
    for (let i = 0; i < totalRacers; i++) {
      laps[i] = 0; done[i] = false; nextCp[i] = 1;
    }
    finishOrder = [];
    resetGateColors();
  }

  function updateCheckpoints(racerIdx, x, z) {
    if (done[racerIdx]) return;
    const target = checkpointPositions[nextCp[racerIdx]];
    const dx = x - target.x, dz = z - target.z;
    const hit = target.spanZ
      ? Math.abs(dx) < CP_TIGHT && Math.abs(dz) < CP_WIDE
      : Math.abs(dz) < CP_TIGHT && Math.abs(dx) < CP_WIDE;
    if (hit) {
      if (nextCp[racerIdx] === 0) {
        laps[racerIdx]++;
        if (laps[racerIdx] >= LAPS) { done[racerIdx] = true; finishOrder.push(racerIdx); }
        nextCp[racerIdx] = 1;
        if (racerIdx === 0) resetGateColors();
      } else {
        if (racerIdx === 0) gates[nextCp[racerIdx] - 1].setColor(true);
        nextCp[racerIdx]++;
        if (nextCp[racerIdx] >= nCps) nextCp[racerIdx] = 0;
      }
    }
  }

  function updateAI(dt) {
    for (let i = 0; i < AI_COLORS.length; i++) {
      const car = aiCars[i];
      const ri = i + 1;
      if (done[ri]) continue;

      const wp = waypoints[car.wpIdx % n];
      const dx = wp.x - car.x, dz = wp.z - car.z;
      const dist = Math.hypot(dx, dz);
      if (dist < WP_ADVANCE_DIST) car.wpIdx = (car.wpIdx + 1) % n;

      const desiredYaw = Math.atan2(-dx / (dist || 1), -dz / (dist || 1));
      let yawErr = desiredYaw - car.yaw;
      while (yawErr > Math.PI) yawErr -= Math.PI * 2;
      while (yawErr < -Math.PI) yawErr += Math.PI * 2;
      car.yaw += Math.max(-AI_TURN_RATE, Math.min(AI_TURN_RATE, yawErr / dt)) * dt;

      const targetSpeed = AI_SPEEDS[i] * (1 - Math.min(0.35, Math.abs(yawErr) * 0.5));
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 2);

      const mvx = -Math.sin(car.yaw) * car.speed * dt;
      const mvz = -Math.cos(car.yaw) * car.speed * dt;
      if (!blocked(car.x + mvx, car.z, AI_COL_R)) car.x += mvx;
      else { car.yaw += 0.12; car.speed *= 0.4; }
      if (!blocked(car.x, car.z + mvz, AI_COL_R)) car.z += mvz;
      else { car.yaw -= 0.12; car.speed *= 0.4; }

      car.group.position.set(car.x, 0, car.z);
      car.group.rotation.y = car.yaw;
      updateCheckpoints(ri, car.x, car.z);
    }
  }

  function getPlayerPosition() {
    const pp = laps[0] * 100 + (nCps - nextCp[0]);
    let pos = 1;
    for (let i = 0; i < AI_COLORS.length; i++) {
      if (laps[i+1] * 100 + (nCps - nextCp[i+1]) > pp) pos++;
    }
    return pos;
  }

  return {
    start(playerVehicle) {
      if (raceState !== 'idle') return;
      placeRacers(playerVehicle);
      raceState = 'countdown';
      countdownVal = 3;
      countdownTimer = 1.0;
      raceTime = 0;
      setMarkersVisible(true);
      for (const g of gates) g.setVisible(true);
    },

    update(dt, playerVehicle) {
      if (raceState === 'idle') return;
      if (raceState === 'countdown') {
        countdownTimer -= dt;
        if (countdownTimer <= 0) {
          countdownVal--;
          if (countdownVal < 0) raceState = 'racing';
          else countdownTimer = 1.0;
        }
        return;
      }
      if (raceState === 'racing') {
        raceTime += dt;
        updateAI(dt);
        if (playerVehicle) {
          updateCheckpoints(0, playerVehicle.group.position.x, playerVehicle.group.position.z);
        }
        if (done[0] && !finishOrder.includes(0)) finishOrder.push(0);
        if (finishOrder.includes(0)) raceState = 'finished';
      }
    },

    reset() {
      raceState = 'idle';
      aiCars.forEach(car => { car.speed = 0; car.group.position.set(0, -200, 0); });
      resetGateColors();
      for (const g of gates) g.setVisible(false);
      setMarkersVisible(false);
    },

    getState() {
      const cpsDone = nextCp[0] === 0 ? nCps - 1 : nextCp[0] - 1;
      return {
        state: raceState, countdown: countdownVal, raceTime, laps,
        position: getPlayerPosition(), totalLaps: LAPS,
        finishOrder, aiCars, done, nextCp,
        cpsDone, totalCps: nCps - 1,
      };
    },

    isCountdown() { return raceState === 'countdown'; },
    aiCars,
    startZone: track.startZone,
  };
}
