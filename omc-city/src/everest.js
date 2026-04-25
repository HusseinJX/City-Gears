import * as THREE from 'three';

function xorRng(seed) {
  let s = (seed | 0) >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

// ── Height field ──────────────────────────────────────────────────────────────
function gauss(lx, lz, cx, cz, sig) {
  const dx = lx - cx, dz = lz - cz;
  return Math.exp(-(dx * dx + dz * dz) / (2 * sig * sig));
}

const PEAK_H = 95;

function terrainH(lx, lz) {
  const h = Math.max(
    PEAK_H        * gauss(lx, lz,   0, -15, 33),   // Everest summit
    PEAK_H * 0.81 * gauss(lx, lz,  25,  28, 22),   // Lhotse
    PEAK_H * 0.71 * gauss(lx, lz, -38,  20, 20),   // Nuptse
    PEAK_H * 0.61 * gauss(lx, lz, -15, -58, 18),   // Changtse (north)
    PEAK_H * 0.55 * gauss(lx, lz,  12, -38, 14),   // North Peak
    PEAK_H * 0.65 * gauss(lx, lz, -20,  -8, 16),   // West Shoulder
    PEAK_H * 0.58 * gauss(lx, lz,  14,   8, 12),   // South Col ridge
  );
  // Radial taper → 0 at edge so terrain meets flat snow ground cleanly
  const r = Math.sqrt(lx * lx + lz * lz);
  const taper = r > 78 ? Math.max(0, 1 - (r - 78) / 32) : 1;
  return h * taper * taper;
}

export function createEverest(scene) {
  const GX = 600, GZ = 0;
  const group = new THREE.Group();
  group.position.set(GX, 0, GZ);
  scene.add(group);

  // ── Snow ground ───────────────────────────────────────────────────────────
  const snowGround = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
    new THREE.MeshLambertMaterial({ color: 0xc8d8e8 })
  );
  snowGround.rotation.x = -Math.PI / 2;
  snowGround.position.y = -0.01;
  snowGround.receiveShadow = true;
  group.add(snowGround);

  // ── Mountain terrain mesh ─────────────────────────────────────────────────
  {
    const GRID = 72, HALF = 110;
    const rng = xorRng(1337);
    const pos = [], col = [], idx = [];

    for (let iz = 0; iz <= GRID; iz++) {
      for (let ix = 0; ix <= GRID; ix++) {
        const lx = -HALF + (ix / GRID) * 2 * HALF;
        const lz = -HALF + (iz / GRID) * 2 * HALF;
        const h = terrainH(lx, lz);
        const jitter = (rng() - 0.5) * Math.max(0, h * 0.055);
        pos.push(lx, h + jitter, lz);

        const t = h / PEAK_H;
        let r, g, b;
        if (t > 0.78) {
          r = 0.93 + rng() * 0.07; g = 0.95 + rng() * 0.05; b = 1.0;
        } else if (t > 0.60) {
          const s = (t - 0.60) / 0.18;
          r = 0.72 + s * 0.21; g = 0.80 + s * 0.15; b = 0.90 + s * 0.10;
        } else if (t > 0.40) {
          const s = (t - 0.40) / 0.20;
          if (rng() < s * 0.65) { r = 0.85; g = 0.88; b = 0.93; }
          else { r = 0.38 + s * 0.14 + rng()*0.04; g = 0.40 + s * 0.14; b = 0.46 + s * 0.14; }
        } else if (t > 0.20) {
          r = 0.28 + rng() * 0.09; g = 0.30 + rng() * 0.08; b = 0.35 + rng() * 0.09;
        } else if (t > 0.05) {
          r = 0.42 + rng() * 0.07; g = 0.44 + rng() * 0.06; b = 0.50 + rng() * 0.06;
        } else {
          r = 0.78 + rng() * 0.06; g = 0.82 + rng() * 0.05; b = 0.88 + rng() * 0.05;
        }
        col.push(r, g, b);
      }
    }
    for (let iz = 0; iz < GRID; iz++) {
      for (let ix = 0; ix < GRID; ix++) {
        const a = iz * (GRID + 1) + ix;
        const b = a + 1, c = a + (GRID + 1), d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  const rng = xorRng(42);

  // ── Summit wind-plume (snow banner streaming from peak) ───────────────────
  {
    const plumeMat = new THREE.MeshLambertMaterial({
      color: 0xeef4ff, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide,
    });
    for (let i = 0; i < 6; i++) {
      const pw = 10 + i * 2.5, ph = 1.8 - i * 0.18;
      const p = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), plumeMat);
      p.position.set(8 + i * 5, PEAK_H - 2 - i * 1.8, -15 + (rng()-0.5)*3);
      p.rotation.z = -0.12 - i * 0.04;
      p.rotation.y = (rng()-0.5) * 0.3;
      group.add(p);
    }
  }

  // ── Summit glow ───────────────────────────────────────────────────────────
  {
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(4.5, 12, 9),
      new THREE.MeshBasicMaterial({
        color: 0xd8eeff, transparent: true, opacity: 0.22,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    glow.position.set(0, PEAK_H + 2, -15);
    group.add(glow);
  }

  // ── Summit flag (Nepal red) ───────────────────────────────────────────────
  {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.09, 3.0, 6),
      new THREE.MeshLambertMaterial({ color: 0xd0c0a0 })
    );
    pole.position.set(0, PEAK_H + 1.5, -15);
    group.add(pole);

    const fv = new Float32Array([
      0,0,0, 2.2,0,0, 0,1.3,0,
      0,1.3,0, 1.8,1.3,0, 0,2.8,0,
    ]);
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(fv, 3));
    fg.setIndex([0,1,2, 3,4,5]);
    fg.computeVertexNormals();
    const flag = new THREE.Mesh(fg, new THREE.MeshLambertMaterial({ color: 0xcc1122, side: THREE.DoubleSide }));
    flag.position.set(0, PEAK_H + 3.0, -15);
    group.add(flag);
  }

  // ── Ice seracs (lower glacier, visible from base) ─────────────────────────
  {
    const seracMat = new THREE.MeshLambertMaterial({
      color: 0x9ccde8, emissive: 0x081828, emissiveIntensity: 0.4,
    });
    const seracDefs = [
      [-18, 45, 7.5], [-8, 50, 6], [-28, 42, 9], [5, 48, 6.5], [18, 44, 8],
      [25, 40, 5.5], [-5, 55, 7], [12, 52, 5.5], [-15, 58, 6], [8, 58, 7],
      [-22, 35, 8.5], [30, 36, 6],
    ];
    for (const [sx, sz, sh] of seracDefs) {
      const th = terrainH(sx, sz);
      const serac = new THREE.Mesh(
        new THREE.ConeGeometry(0.85 + rng() * 0.55, sh, 5 + Math.floor(rng() * 2)),
        seracMat
      );
      serac.position.set(sx + (rng()-0.5)*2, th + sh * 0.5, sz + (rng()-0.5)*2);
      serac.rotation.y = rng() * Math.PI * 2;
      serac.rotation.z = (rng()-0.5) * 0.18;
      serac.castShadow = true;
      group.add(serac);
    }
  }

  // ── Cloud band (mountain rises above it) ──────────────────────────────────
  {
    const cloudMat = new THREE.MeshLambertMaterial({
      color: 0xdce8f8, transparent: true, opacity: 0.70, depthWrite: false,
    });
    for (let ci = 0; ci < 20; ci++) {
      const angle = (ci / 20) * Math.PI * 2 + rng() * 0.5;
      const rad = 50 + rng() * 25;
      const cy = 35 + (rng()-0.5) * 12;
      const cg = new THREE.Group();
      cg.position.set(Math.cos(angle)*rad, cy, Math.sin(angle)*rad*0.75);
      for (let pi = 0; pi < 5; pi++) {
        const pr = 5 + rng() * 7;
        const puff = new THREE.Mesh(new THREE.SphereGeometry(pr, 8, 6), cloudMat);
        puff.position.set((rng()-0.5)*14, (rng()-0.5)*4, (rng()-0.5)*10);
        cg.add(puff);
      }
      group.add(cg);
    }
  }

  // ── Base camp tents ───────────────────────────────────────────────────────
  {
    const tentPalette = [0xe8b030, 0xd03030, 0x3070d8, 0x40a840, 0xe04090, 0xf08030, 0x30c0c8];
    const tentSpots = [
      [-14, 82], [-7, 85], [0, 82], [7, 85], [13, 82],
      [-10, 90], [-3, 91], [5, 90], [11, 88],
      [-17, 88], [17, 85],
    ];
    for (let ti = 0; ti < tentSpots.length; ti++) {
      const [tx, tz] = tentSpots[ti];
      const th = terrainH(tx, tz);
      const sc = 0.85 + rng() * 0.45;
      // Dome (half-sphere)
      const tent = new THREE.Mesh(
        new THREE.SphereGeometry(1.4 * sc, 9, 7, 0, Math.PI*2, 0, Math.PI*0.52),
        new THREE.MeshLambertMaterial({ color: tentPalette[ti % tentPalette.length] })
      );
      tent.position.set(tx, th, tz);
      tent.castShadow = true;
      group.add(tent);
      // Floor slab
      const floor = new THREE.Mesh(
        new THREE.BoxGeometry(2.6*sc, 0.07, 1.9*sc),
        new THREE.MeshLambertMaterial({ color: 0x606870 })
      );
      floor.position.set(tx, th + 0.035, tz);
      floor.rotation.y = rng() * Math.PI;
      group.add(floor);
    }
  }

  // ── Prayer flags ──────────────────────────────────────────────────────────
  {
    const poleXZs = [[-9, 87], [0, 89], [9, 87]];
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x988870 });
    for (const [px, pz] of poleXZs) {
      const th = terrainH(px, pz);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.10, 5.2, 6), poleMat);
      pole.position.set(px, th + 2.6, pz);
      group.add(pole);
    }
    const flagColors = [0xf0e030, 0x3ab060, 0xd83030, 0xfafafa, 0x3a40c0];
    for (let row = 0; row < 2; row++) {
      const pA = poleXZs[row], pB = poleXZs[row + 1];
      const thA = terrainH(pA[0], pA[1]), thB = terrainH(pB[0], pB[1]);
      for (let fi = 0; fi < 13; fi++) {
        const t = fi / 12;
        const fx = pA[0] + (pB[0]-pA[0]) * t;
        const fz = pA[1] + (pB[1]-pA[1]) * t;
        const fh = (thA + (thB-thA)*t) + 4.8 - Math.sin(t*Math.PI) * 0.45;
        const pf = new THREE.Mesh(
          new THREE.PlaneGeometry(0.68, 0.52),
          new THREE.MeshLambertMaterial({ color: flagColors[fi % 5], side: THREE.DoubleSide })
        );
        pf.position.set(fx, fh, fz);
        pf.rotation.y = Math.atan2(pB[0]-pA[0], pB[1]-pA[1]);
        group.add(pf);
      }
    }
  }

  // ── Scattered rocks / boulders at base ────────────────────────────────────
  {
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x4a4e56 });
    for (let ri = 0; ri < 28; ri++) {
      const angle = rng() * Math.PI * 2;
      const rad = 15 + rng() * 70;
      const rx = Math.cos(angle) * rad;
      const rz = 40 + Math.sin(angle) * rad * 0.5;
      if (rz < 20) continue;
      const th = terrainH(rx, rz);
      const rs = 0.4 + rng() * 1.4;
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(rs, 0),
        rockMat
      );
      rock.position.set(rx, th + rs * 0.4, rz);
      rock.rotation.set(rng()*Math.PI, rng()*Math.PI, rng()*Math.PI);
      rock.castShadow = true;
      group.add(rock);
    }
  }

  // ── Mist wisps near glacier ───────────────────────────────────────────────
  {
    const mistMat = new THREE.MeshLambertMaterial({
      color: 0xe8f0f8, transparent: true, opacity: 0.28, depthWrite: false,
    });
    for (let mi = 0; mi < 10; mi++) {
      const mx = (rng()-0.5) * 80;
      const mz = 30 + rng() * 40;
      const th = terrainH(mx, mz);
      const mist = new THREE.Mesh(new THREE.SphereGeometry(5 + rng()*7, 8, 6), mistMat);
      mist.scale.set(1, 0.22, 0.9);
      mist.position.set(mx, th + 1.5, mz);
      group.add(mist);
    }
  }

  // ── Cold blue light on the peak ───────────────────────────────────────────
  const coldLight = new THREE.PointLight(0x7aabff, 0.65, 220);
  coldLight.position.set(0, 65, -20);
  group.add(coldLight);

  // ── Base camp guide (simple figure + sign) ────────────────────────────────
  const GUIDE_LX = 5, GUIDE_LZ = 97;
  {
    const th = terrainH(GUIDE_LX, GUIDE_LZ);
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xc88060 });
    const jacketMat = new THREE.MeshLambertMaterial({ color: 0xd04010 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.34, 1.05, 8), jacketMat);
    body.position.set(GUIDE_LX, th + 0.93, GUIDE_LZ);
    group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), skinMat);
    head.position.set(GUIDE_LX, th + 1.75, GUIDE_LZ);
    group.add(head);
    const hat = new THREE.Mesh(
      new THREE.ConeGeometry(0.30, 0.38, 8),
      new THREE.MeshLambertMaterial({ color: 0x101828 })
    );
    hat.position.set(GUIDE_LX, th + 2.10, GUIDE_LZ);
    group.add(hat);

    // Sign
    const signPost = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.10, 2.8, 8),
      new THREE.MeshLambertMaterial({ color: 0x806050 })
    );
    signPost.position.set(GUIDE_LX - 2.2, th + 1.4, GUIDE_LZ);
    group.add(signPost);
    const signBoard = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 0.95, 0.12),
      new THREE.MeshLambertMaterial({ color: 0x1a3a6a })
    );
    signBoard.position.set(GUIDE_LX - 2.2, th + 3.0, GUIDE_LZ);
    group.add(signBoard);
  }

  const SPAWN_Z = 105;

  return {
    group,
    x: GX, z: GZ,
    spawnX: GX,
    spawnZ: SPAWN_Z,
    returnShop: {
      name: 'Everest Base Camp',
      dialog: 'Welcome — 5,364 m above sea level. The summit of Everest at 8,849 m is the highest point on Earth. That plume of snow streaming from the peak is wind at 200 km/h. Press F to return to the city.',
      ownerPos: { x: GX + GUIDE_LX, z: GUIDE_LZ },
      interactionRadius: 6.0,
      prompt: 'Press E — Base Camp Guide',
      isEverestReturn: true,
    },
    env: {
      fogColor:         0xa0b8d4,
      fogDensity:       0.0060,
      skyTopColor:      0x060e22,
      skyHorizonColor:  0x6098c8,
      ambientColor:     0x7888b0,
      ambientIntensity: 0.70,
      sunColor:         0xfff8f0,
    },
  };
}
