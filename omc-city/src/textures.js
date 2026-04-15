// Procedural canvas-drawn textures returned as THREE.CanvasTexture.
import * as THREE from 'three';

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function finishTexture(canvas, { repeat, anisotropy = 4, srgb = true } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  if (repeat) tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = anisotropy;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// Building windows: grid of warm/dark windows on a colored facade.
export function makeWindowTexture(baseColor, options = {}) {
  const { cols = 6, rows = 10, size = 256 } = options;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');

  // Facade base
  ctx.fillStyle = '#' + baseColor.toString(16).padStart(6, '0');
  ctx.fillRect(0, 0, size, size);

  // Subtle horizontal banding for floor lines
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  for (let r = 0; r < rows; r++) {
    const y = (r / rows) * size;
    ctx.fillRect(0, y, size, 1);
  }

  // Windows
  const cellW = size / cols;
  const cellH = size / rows;
  const winW = cellW * 0.62;
  const winH = cellH * 0.55;

  for (let r = 0; r < rows; r++) {
    for (let cI = 0; cI < cols; cI++) {
      const x = cI * cellW + (cellW - winW) / 2;
      const y = r * cellH + (cellH - winH) / 2;

      const lit = Math.random() < 0.55;
      if (lit) {
        // Warm window light with slight gradient
        const grad = ctx.createLinearGradient(x, y, x, y + winH);
        grad.addColorStop(0, '#fff2b8');
        grad.addColorStop(1, '#f0c060');
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = '#1a2030';
      }
      ctx.fillRect(x, y, winW, winH);

      // Frame
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(x + 0.5, y + 0.5, winW, winH);

      // Cross mullion
      ctx.beginPath();
      ctx.moveTo(x + winW / 2, y);
      ctx.lineTo(x + winW / 2, y + winH);
      ctx.moveTo(x, y + winH / 2);
      ctx.lineTo(x + winW, y + winH / 2);
      ctx.stroke();
    }
  }

  return finishTexture(c, { repeat: [1, 1] });
}

// Road surface with center yellow dashed lane markings, repeated along length.
export function makeRoadTexture(repeatLength = 4) {
  const w = 128, h = 512;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');

  // Asphalt
  ctx.fillStyle = '#2c2c30';
  ctx.fillRect(0, 0, w, h);

  // Speckle for asphalt grain
  for (let i = 0; i < 600; i++) {
    const gx = Math.random() * w;
    const gy = Math.random() * h;
    const a = 0.03 + Math.random() * 0.08;
    ctx.fillStyle = `rgba(${180 + Math.random() * 60 | 0},${180 + Math.random() * 60 | 0},${180 + Math.random() * 60 | 0},${a})`;
    ctx.fillRect(gx, gy, 1, 1);
  }

  // Edge curbs (white-ish thin lines)
  ctx.fillStyle = '#dcdcdc';
  ctx.fillRect(2, 0, 2, h);
  ctx.fillRect(w - 4, 0, 2, h);

  // Center dashed yellow line
  ctx.fillStyle = '#f5c83a';
  const dashLen = 56;
  const dashGap = 40;
  let y = 0;
  while (y < h) {
    ctx.fillRect(w / 2 - 3, y, 6, dashLen);
    y += dashLen + dashGap;
  }

  return finishTexture(c, { repeat: [1, repeatLength] });
}

// Sidewalk: gray slabs with subtle grid pattern.
export function makeSidewalkTexture(tilesPerSide = 4) {
  const size = 256;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#9a9a9a';
  ctx.fillRect(0, 0, size, size);

  // Speckles
  for (let i = 0; i < 400; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const a = 0.04 + Math.random() * 0.1;
    ctx.fillStyle = `rgba(60,60,60,${a})`;
    ctx.fillRect(x, y, 1, 1);
  }

  // Paving slabs
  ctx.strokeStyle = 'rgba(50,50,50,0.55)';
  ctx.lineWidth = 2;
  const tile = size / tilesPerSide;
  for (let i = 0; i <= tilesPerSide; i++) {
    const p = i * tile;
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
  }

  return finishTexture(c, { repeat: [1, 1] });
}

// Cartoon face for character: skin background, two eyes, smile.
export function makeFaceTexture(skinColor) {
  const size = 256;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#' + skinColor.toString(16).padStart(6, '0');
  ctx.fillRect(0, 0, size, size);

  // Hair band on top
  ctx.fillStyle = '#3a2a1a';
  ctx.fillRect(0, 0, size, size * 0.18);

  // Side hair
  ctx.fillRect(0, 0, size * 0.08, size * 0.5);
  ctx.fillRect(size * 0.92, 0, size * 0.08, size * 0.5);

  // Eyes (whites + pupils)
  const eyeY = size * 0.45;
  const eyeR = size * 0.07;
  const pupilR = eyeR * 0.55;
  const eyeOffsetX = size * 0.22;

  for (const ex of [size / 2 - eyeOffsetX, size / 2 + eyeOffsetX]) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex, eyeY, eyeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(ex, eyeY, pupilR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Smile
  ctx.strokeStyle = '#7a2a2a';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(size / 2, size * 0.62, size * 0.16, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();

  // Nose dot
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.arc(size / 2, size * 0.55, size * 0.018, 0, Math.PI * 2);
  ctx.fill();

  return finishTexture(c, { repeat: [1, 1] });
}

// Striped awning texture: diagonal/vertical stripes on a base color.
export function makeAwningTexture(baseColor) {
  const w = 256, h = 64;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#' + baseColor.toString(16).padStart(6, '0');
  ctx.fillRect(0, 0, w, h);
  // Off-white vertical stripes
  ctx.fillStyle = 'rgba(245,240,220,0.95)';
  const stripeW = 20;
  for (let x = 0; x < w; x += stripeW * 2) {
    ctx.fillRect(x, 0, stripeW, h);
  }
  // Scalloped bottom edge
  ctx.fillStyle = '#' + baseColor.toString(16).padStart(6, '0');
  ctx.beginPath();
  const scallops = 12;
  const sw = w / scallops;
  ctx.moveTo(0, h);
  for (let i = 0; i < scallops; i++) {
    const cx = (i + 0.5) * sw;
    ctx.quadraticCurveTo(cx, h - 10, (i + 1) * sw, h);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
  // Highlight
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(255,255,255,0.18)');
  grad.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  return finishTexture(c, { repeat: [1, 1] });
}

// Shop storefront sign: solid color background with the shop's name.
export function makeSignTexture(text, bgColorHex) {
  const w = 512, h = 128;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#' + bgColorHex.toString(16).padStart(6, '0');
  ctx.fillRect(0, 0, w, h);

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(255,255,255,0.22)');
  grad.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, w - 8, h - 8);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 58px -apple-system, Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowOffsetY = 3;
  ctx.fillText(text, w / 2, h / 2 + 3);
  ctx.shadowColor = 'transparent';

  return finishTexture(c, { repeat: [1, 1] });
}

// Sky gradient texture used as scene.background.
export function makeSkyTexture(topHex, horizonHex) {
  const w = 16, h = 256;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#' + topHex.toString(16).padStart(6, '0'));
  grad.addColorStop(0.65, '#' + topHex.toString(16).padStart(6, '0'));
  grad.addColorStop(1, '#' + horizonHex.toString(16).padStart(6, '0'));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
