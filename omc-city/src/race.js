import * as THREE from 'three';

// Track dimensions (all in world units, centered at cx/cz)
const HW = 248;       // half-width  (X axis)
const HH = 218;       // half-height (Z axis)
const CR = 36;        // corner radius
const TW = 14;        // track road width
const N_CORN = 12;    // arc points per corner
const LAPS = 3;
const CP_R = 28;      // checkpoint detection radius

const AI_COLORS = [0xe03535, 0x30b840, 0x2868d8, 0xe08020];
const AI_SPEEDS = [31, 29, 30, 28];  // units/sec base speed
const AI_TURN_RATE = 3.2;            // rad/sec max turn rate
const WP_ADVANCE_DIST = 12;          // switch to next waypoint when this close

// ─────────────────────────────────────────────────────────────────
// Waypoints — CCW circuit: east → north → west → south
// ─────────────────────────────────────────────────────────────────
function buildWaypoints(cx, cz) {
  const pts = [];

  function arc(ocx, ocz, r, a0, a1, n) {
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      pts.push({ x: ocx + Math.cos(a) * r, z: ocz + Math.sin(a) * r });
    }
  }

  // South straight → east
  pts.push({ x: cx, z: cz + HH });               // start/finish
  pts.push({ x: cx + HW - CR, z: cz + HH });

  // SE corner  (center: cx+HW-CR, cz+HH-CR)  PI/2 → 0
  arc(cx + HW - CR, cz + HH - CR, CR, Math.PI / 2, 0, N_CORN);

  // East straight → north
  pts.push({ x: cx + HW, z: cz + HH - CR });
  pts.push({ x: cx + HW, z: cz - HH + CR });

  // NE corner  (center: cx+HW-CR, cz-HH+CR)  0 → -PI/2
  arc(cx + HW - CR, cz - HH + CR, CR, 0, -Math.PI / 2, N_CORN);

  // North straight → west
  pts.push({ x: cx + HW - CR, z: cz - HH });
  pts.push({ x: cx - HW + CR, z: cz - HH });

  // NW corner  (center: cx-HW+CR, cz-HH+CR)  -PI/2 → -PI
  arc(cx - HW + CR, cz - HH + CR, CR, -Math.PI / 2, -Math.PI, N_CORN);

  // West straight → south
  pts.push({ x: cx - HW, z: cz - HH + CR });
  pts.push({ x: cx - HW, z: cz + HH - CR });

  // SW corner  (center: cx-HW+CR, cz+HH-CR)  PI → PI/2
  arc(cx - HW + CR, cz + HH - CR, CR, Math.PI, Math.PI / 2, N_CORN);

  // South straight back to start
  pts.push({ x: cx - HW + CR, z: cz + HH });
  pts.push({ x: cx, z: cz + HH });

  return pts;
}

// ─────────────────────────────────────────────────────────────────
// Track mesh (surface + edge lines + start/finish strip)
// ─────────────────────────────────────────────────────────────────
function buildTrackMesh(scene, waypoints) {
  const n = waypoints.length;

  // Compute averaged per-vertex perpendicular normals for smooth joins
  const leftV = [], rightV = [];
  for (let i = 0; i < n; i++) {
    const prev = waypoints[(i + n - 1) % n];
    const curr = waypoints[i];
    const next = waypoints[(i + 1) % n];

    let tx = next.x - prev.x;
    let tz = next.z - prev.z;
    const tl = Math.sqrt(tx * tx + tz * tz) || 1;
    tx /= tl; tz /= tl;

    const hw = TW / 2;
    leftV.push({ x: curr.x - tz * hw, z: curr.z + tx * hw });
    rightV.push({ x: curr.x + tz * hw, z: curr.z - tx * hw });
  }

  // Road surface
  const pos = [];
  const idx = [];
  for (let i = 0; i < n; i++) {
    pos.push(leftV[i].x, 0.02, leftV[i].z);
    pos.push(rightV[i].x, 0.02, rightV[i].z);
  }
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2, b = (i + 1) * 2;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ color: 0x2e2e36 });
  scene.add(new THREE.Mesh(geo, mat));

  // Edge lines (white)
  for (const verts of [leftV, rightV]) {
    const lpos = [];
    for (const v of verts) lpos.push(v.x, 0.04, v.z);
    const lgeo = new THREE.BufferGeometry();
    lgeo.setAttribute('position', new THREE.Float32BufferAttribute(lpos, 3));
    const lmat = new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.7, transparent: true });
    scene.add(new THREE.Line(lgeo, lmat));
  }

  // Dashed center line (yellow)
  const dashLen = 8, gapLen = 6;
  let acc = 0;
  let inDash = true;
  let dashPos = [];
  const dashGeo = new THREE.BufferGeometry();
  function flushDash() {
    if (dashPos.length >= 6 && inDash) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(dashPos, 3));
      scene.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffdd00, opacity: 0.6, transparent: true })));
    }
    dashPos = [];
  }
  for (let i = 0; i < n - 1; i++) {
    const a = waypoints[i], b = waypoints[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const segLen = Math.sqrt(dx * dx + dz * dz);
    let t = 0;
    while (t < segLen) {
      const step = Math.min(segLen - t, inDash ? dashLen - acc : gapLen - acc);
      const t0 = t / segLen, t1 = (t + step) / segLen;
      if (inDash) {
        dashPos.push(a.x + dx * t0, 0.03, a.z + dz * t0);
        dashPos.push(a.x + dx * t1, 0.03, a.z + dz * t1);
      }
      acc += step;
      t += step;
      if (inDash && acc >= dashLen) { flushDash(); inDash = false; acc = 0; }
      else if (!inDash && acc >= gapLen) { inDash = true; acc = 0; }
    }
  }
  flushDash();
}

// ─────────────────────────────────────────────────────────────────
// Start/finish line + pit marker
// ─────────────────────────────────────────────────────────────────
function buildStartLine(scene, cx, cz) {
  // Checkered tiles across start straight
  const tiles = 8, tileW = TW / tiles, tileL = 2.4;
  for (let i = 0; i < tiles; i++) {
    const x = cx - TW / 2 + i * tileW + tileW / 2;
    const color = (i % 2 === 0) ? 0xffffff : 0x111111;
    const tile = new THREE.Mesh(
      new THREE.PlaneGeometry(tileW - 0.1, tileL),
      new THREE.MeshLambertMaterial({ color })
    );
    tile.rotation.x = -Math.PI / 2;
    tile.position.set(x, 0.04, cz + HH);
    scene.add(tile);
  }

  // Start marker: a pair of poles with a banner
  const poleMat = new THREE.MeshLambertMaterial({ color: 0xbbbbbb });
  const poleGeo = new THREE.CylinderGeometry(0.18, 0.18, 5.5, 8);
  for (const sx of [-TW / 2 - 1.2, TW / 2 + 1.2]) {
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(cx + sx, 2.75, cz + HH);
    scene.add(pole);
  }
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(TW + 2.8, 1.2),
    new THREE.MeshLambertMaterial({ color: 0xeeeeee, side: THREE.DoubleSide })
  );
  banner.position.set(cx, 5.4, cz + HH);
  scene.add(banner);

  // "START / FINISH" text-like stripe (two colored strips)
  const stripMat1 = new THREE.MeshLambertMaterial({ color: 0x228822 });
  const stripMat2 = new THREE.MeshLambertMaterial({ color: 0xcc2222 });
  const stripGeo = new THREE.BoxGeometry(TW + 2.8, 0.35, 0.08);
  const s1 = new THREE.Mesh(stripGeo, stripMat1);
  s1.position.set(cx, 5.15, cz + HH);
  scene.add(s1);
  const s2 = new THREE.Mesh(stripGeo, stripMat2);
  s2.position.set(cx, 5.55, cz + HH);
  scene.add(s2);
}

function buildPitMarker(scene, cx, cz) {
  // Low platform / pit box just outside the south of the track
  const pz = cz + HH + 18;
  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(12, 0.3, 6),
    new THREE.MeshLambertMaterial({ color: 0x666666 })
  );
  platform.position.set(cx, 0.15, pz);
  scene.add(platform);

  // Sign post + board
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 4, 8),
    new THREE.MeshLambertMaterial({ color: 0x888888 })
  );
  post.position.set(cx, 2, pz - 2.5);
  scene.add(post);

  const board = new THREE.Mesh(
    new THREE.BoxGeometry(5.5, 1.2, 0.15),
    new THREE.MeshLambertMaterial({ color: 0x113388 })
  );
  board.position.set(cx, 4.3, pz - 2.5);
  scene.add(board);

  // Striped yellow/black warning edge
  for (let i = 0; i < 5; i++) {
    const color = i % 2 === 0 ? 0xffcc00 : 0x111111;
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.32, 6.1),
      new THREE.MeshLambertMaterial({ color })
    );
    strip.position.set(cx - 5.5 + i * 2.2 + 1.1, 0.32, pz);
    scene.add(strip);
  }
}

// ─────────────────────────────────────────────────────────────────
// AI car mesh
// ─────────────────────────────────────────────────────────────────
function createAICar(color) {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.65, 4.2), bodyMat);
  body.position.y = 0.65;
  group.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.65, 0.6, 2.1),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(0.7) })
  );
  cabin.position.set(0, 1.27, 0.15);
  group.add(cabin);

  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12);
  for (const [x, z] of [[-0.95, -1.4], [0.95, -1.4], [-0.95, 1.4], [0.95, 1.4]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.42, z);
    group.add(w);
  }

  return { group, x: 0, z: 0, yaw: 0, speed: 0, color };
}

// ─────────────────────────────────────────────────────────────────
// Race sector helper (for lap counting)
// ─────────────────────────────────────────────────────────────────
// Track is CCW: SE(0) → NE(1) → NW(2) → SW(3) → SE(0) = lap
function getSector(x, z, cx, cz) {
  const east = x > cx;
  const south = z > cz;
  if (east && south) return 0;   // SE
  if (east && !south) return 1;  // NE
  if (!east && !south) return 2; // NW
  return 3;                      // SW
}

// ─────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────
export function createRaceTrack(scene, cx = 0, cz = 0) {
  const waypoints = buildWaypoints(cx, cz);
  buildTrackMesh(scene, waypoints);
  buildStartLine(scene, cx, cz);
  buildPitMarker(scene, cx, cz);

  const startZone = { x: cx, z: cz + HH + 18, radius: 9 };

  return { waypoints, startZone, cx, cz };
}

export function createRaceManager(scene, track) {
  const { waypoints, cx, cz } = track;
  const n = waypoints.length;

  let raceState = 'idle';    // idle | countdown | racing | finished
  let countdownVal = 3;
  let countdownTimer = 0;
  let raceTime = 0;
  let finishOrder = [];      // racer indices (0=player) in finish order

  // Per-racer state: index 0 = player
  const totalRacers = 1 + AI_COLORS.length;
  const laps = Array(totalRacers).fill(0);
  const sector = Array(totalRacers).fill(0);
  const wpIdx = Array(totalRacers).fill(0);
  const done = Array(totalRacers).fill(false);

  // AI cars
  const aiCars = AI_COLORS.map((color, i) => createAICar(color));
  aiCars.forEach(car => {
    scene.add(car.group);
    car.group.position.set(0, -100, 0);
  });

  function placeRacers(playerVehicle) {
    // Grid: staggered 2-wide, lined up south of start line
    const gridSpacing = 8;
    const gridOffsets = [
      { dx: -3.5, dz: 0 },        // player (pos 1 = front left)
      { dx: 3.5, dz: 0 },         // AI 0   (pos 2 = front right)
      { dx: -3.5, dz: gridSpacing },  // AI 1
      { dx: 3.5, dz: gridSpacing * 2 }, // AI 2 — wait, let me recalculate
    ];

    // 5 positions: player first, then 4 AI behind
    const positions = [
      { dx: -3.5, dz: 0 },
      { dx:  3.5, dz: 8 },
      { dx: -3.5, dz: 8 },
      { dx:  3.5, dz: 16 },
      { dx: -3.5, dz: 16 },
    ];

    const startX = cx;
    const startZ = cz + HH - 6; // just behind start line (on south straight)

    if (playerVehicle) {
      playerVehicle.group.position.set(startX + positions[0].dx, 0, startZ + positions[0].dz);
      playerVehicle.state.yaw = -Math.PI / 2; // facing east
      playerVehicle.state.speed = 0;
      playerVehicle.group.rotation.y = playerVehicle.state.yaw;
    }

    for (let i = 0; i < AI_COLORS.length; i++) {
      const p = positions[i + 1];
      const car = aiCars[i];
      car.x = startX + p.dx;
      car.z = startZ + p.dz;
      car.yaw = -Math.PI / 2; // facing east
      car.speed = 0;
      car.wpIdx = 0;
      car.group.position.set(car.x, 0, car.z);
      car.group.rotation.y = car.yaw;
    }

    // Reset lap/sector state
    for (let i = 0; i < totalRacers; i++) {
      laps[i] = 0;
      sector[i] = 0;
      done[i] = false;
    }
    wpIdx[0] = 0;
  }

  function updateLapCounting(racerIdx, x, z) {
    if (done[racerIdx]) return;
    const newSector = getSector(x, z, cx, cz);
    const prev = sector[racerIdx];
    // CCW progression: 0→1→2→3→0
    if (prev === 3 && newSector === 0) {
      // Crossed start line going CCW (from SW to SE sector)
      // Only count if near enough to the south edge (z close to cz+HH)
      if (z > cz + HH * 0.6) {
        laps[racerIdx]++;
        if (laps[racerIdx] > LAPS && !done[racerIdx]) {
          done[racerIdx] = true;
          finishOrder.push(racerIdx);
        }
      }
    }
    sector[racerIdx] = newSector;
  }

  function updateAI(dt) {
    for (let i = 0; i < AI_COLORS.length; i++) {
      const car = aiCars[i];
      const racerIdx = i + 1;
      if (done[racerIdx]) continue;

      // Find nearest waypoint ahead
      const wp = waypoints[car.wpIdx % n];
      const dx = wp.x - car.x;
      const dz = wp.z - car.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < WP_ADVANCE_DIST) {
        car.wpIdx = (car.wpIdx + 1) % n;
      }

      // Desired yaw: fwd = (-sin(yaw), 0, -cos(yaw)), so yaw = atan2(-dx, -dz)
      const desiredYaw = Math.atan2(-dx / (dist || 1), -dz / (dist || 1));
      let yawErr = desiredYaw - car.yaw;
      while (yawErr > Math.PI) yawErr -= Math.PI * 2;
      while (yawErr < -Math.PI) yawErr += Math.PI * 2;
      const turn = Math.max(-AI_TURN_RATE, Math.min(AI_TURN_RATE, yawErr / dt)) * dt;
      car.yaw += turn;

      // Speed: slow down on corners, speed up on straights
      const targetSpeed = AI_SPEEDS[i] * (1 - Math.min(0.35, Math.abs(yawErr) * 0.5));
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 2);

      // Move
      car.x += -Math.sin(car.yaw) * car.speed * dt;
      car.z += -Math.cos(car.yaw) * car.speed * dt;
      car.group.position.set(car.x, 0, car.z);
      car.group.rotation.y = car.yaw;

      updateLapCounting(racerIdx, car.x, car.z);
    }
  }

  function getPlayerPosition() {
    // Position = number of racers ahead of player
    const playerProgress = laps[0] * 1000 + (sector[0] * 250);
    let position = 1;
    for (let i = 0; i < AI_COLORS.length; i++) {
      const aiProgress = laps[i + 1] * 1000 + (sector[i + 1] * 250);
      if (aiProgress > playerProgress) position++;
    }
    return position;
  }

  return {
    start(playerVehicle) {
      if (raceState !== 'idle') return;
      placeRacers(playerVehicle);
      raceState = 'countdown';
      countdownVal = 3;
      countdownTimer = 1.0;
      raceTime = 0;
      finishOrder = [];
    },

    update(dt, playerVehicle) {
      if (raceState === 'idle') return;

      if (raceState === 'countdown') {
        countdownTimer -= dt;
        if (countdownTimer <= 0) {
          countdownVal--;
          if (countdownVal < 0) {
            raceState = 'racing';
          } else {
            countdownTimer = 1.0;
          }
        }
        return;
      }

      if (raceState === 'racing') {
        raceTime += dt;
        updateAI(dt);

        // Update player lap counting
        if (playerVehicle) {
          const px = playerVehicle.group.position.x;
          const pz = playerVehicle.group.position.z;
          updateLapCounting(0, px, pz);
        }

        // Check if player finished
        if (done[0] && !finishOrder.includes(0)) {
          finishOrder.push(0);
        }
        if (finishOrder.includes(0)) {
          raceState = 'finished';
        }
      }
    },

    reset() {
      raceState = 'idle';
      aiCars.forEach(car => {
        car.speed = 0;
        car.group.position.set(0, -100, 0); // hide below ground
      });
    },

    getState() {
      return {
        state: raceState,
        countdown: countdownVal,
        raceTime,
        laps,
        position: getPlayerPosition(),
        totalLaps: LAPS,
        finishOrder,
        aiCars,
        done,
      };
    },

    aiCars,
    startZone: track.startZone,
  };
}
