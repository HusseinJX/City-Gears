// Procedurally-synthesized sound effects + busy-street ambience via Web Audio.
// No audio files are loaded.

let ac = null;
let ambientStarted = false;
let masterGain = null;
let engineNodes = null; // active motorcycle engine
let muted = false;

function ensure() {
  if (!ac) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ac = new C();
    masterGain = ac.createGain();
    masterGain.gain.value = muted ? 0 : 1.0;
    masterGain.connect(ac.destination);
  }
  return ac;
}

function applyMuteState() {
  if (!masterGain) return;
  const value = muted ? 0 : 1;
  if (ac && ac.state === 'running') {
    masterGain.gain.setTargetAtTime(value, ac.currentTime, 0.03);
  } else {
    masterGain.gain.value = value;
  }
}

export function setMuted(nextMuted) {
  muted = !!nextMuted;
  ensure();
  applyMuteState();
  return muted;
}

export function toggleMuted() {
  return setMuted(!muted);
}

export function isMuted() {
  return muted;
}

function isReady() {
  const c = ensure();
  return c && c.state === 'running';
}

export function attachAudioUnlock(target) {
  const unlock = () => {
    const c = ensure();
    if (!c) return;
    if (c.state === 'suspended') c.resume().catch(() => {});
    setTimeout(() => { if (c.state === 'running') startAmbient(); }, 50);
  };
  target.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

// -------------------- Footstep (deep, realistic) --------------------
export function playFootstep() {
  if (!isReady()) return;
  const c = ac;
  const t0 = c.currentTime;

  const osc = c.createOscillator();
  osc.type = 'sine';
  const base = 90 + Math.random() * 30;
  osc.frequency.setValueAtTime(base * 1.55, t0);
  osc.frequency.exponentialRampToValueAtTime(base * 0.55, t0 + 0.11);
  const oscG = c.createGain();
  oscG.gain.setValueAtTime(0.0001, t0);
  oscG.gain.linearRampToValueAtTime(0.9, t0 + 0.004);
  oscG.gain.exponentialRampToValueAtTime(0.001, t0 + 0.16);
  osc.connect(oscG).connect(masterGain);
  osc.start(t0);
  osc.stop(t0 + 0.2);

  const len = 0.08;
  const frames = Math.floor(c.sampleRate * len);
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    const t = i / frames;
    d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 6);
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 380 + Math.random() * 180;
  bp.Q.value = 1.1;
  const ng = c.createGain();
  ng.gain.value = 0.28;
  src.connect(bp).connect(ng).connect(masterGain);
  src.start(t0);

  const click = c.createBuffer(1, Math.floor(c.sampleRate * 0.02), c.sampleRate);
  const cd = click.getChannelData(0);
  for (let i = 0; i < cd.length; i++) {
    const t = i / cd.length;
    cd[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3) * 0.6;
  }
  const clickSrc = c.createBufferSource();
  clickSrc.buffer = click;
  const clickLp = c.createBiquadFilter();
  clickLp.type = 'lowpass';
  clickLp.frequency.value = 180;
  const clickG = c.createGain();
  clickG.gain.value = 0.45;
  clickSrc.connect(clickLp).connect(clickG).connect(masterGain);
  clickSrc.start(t0);
}

export function playJump() {
  if (!isReady()) return;
  const c = ac;
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(280, t0);
  osc.frequency.exponentialRampToValueAtTime(640, t0 + 0.14);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(0.22, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);
  osc.connect(g).connect(masterGain);
  osc.start(t0);
  osc.stop(t0 + 0.24);
}

export function playLand() {
  if (!isReady()) return;
  const c = ac;
  const t0 = c.currentTime;

  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, t0);
  osc.frequency.exponentialRampToValueAtTime(50, t0 + 0.18);
  const og = c.createGain();
  og.gain.setValueAtTime(0.0001, t0);
  og.gain.linearRampToValueAtTime(0.7, t0 + 0.005);
  og.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);
  osc.connect(og).connect(masterGain);
  osc.start(t0);
  osc.stop(t0 + 0.26);

  const len = 0.18;
  const frames = Math.floor(c.sampleRate * len);
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    const t = i / frames;
    d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3);
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 250;
  const g = c.createGain();
  g.gain.value = 0.4;
  src.connect(lp).connect(g).connect(masterGain);
  src.start(t0);
}

export function playDialogOpen() {
  if (!isReady()) return;
  const c = ac;
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(700, t0);
  osc.frequency.linearRampToValueAtTime(980, t0 + 0.09);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.12, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2);
  osc.connect(g).connect(masterGain);
  osc.start(t0);
  osc.stop(t0 + 0.22);
}

// -------------------- Busy street ambience --------------------
// Low rumble base + recurring passing cars + distant horns + chatter bursts.
// Each individual sound is short; there's no single constant drone.
export function startAmbient() {
  if (!isReady() || ambientStarted) return;
  ambientStarted = true;
  const c = ac;

  // Very quiet distant rumble (filtered pink noise)
  const len = 8;
  const frames = c.sampleRate * len;
  const buf = c.createBuffer(2, frames, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < frames; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 450;
  lp.Q.value = 0.5;
  const ambientGain = c.createGain();
  ambientGain.gain.setValueAtTime(0, c.currentTime);
  ambientGain.gain.linearRampToValueAtTime(0.10, c.currentTime + 2.0);
  src.connect(lp).connect(ambientGain).connect(masterGain);
  src.start();

  scheduleCarPass();
  scheduleHorn();
  scheduleChatter();
  scheduleBrake();
}

function scheduleCarPass() {
  const delay = 1.8 + Math.random() * 3.5; // every 1.8-5.3s
  setTimeout(() => {
    if (!isReady()) { scheduleCarPass(); return; }
    passingCar();
    scheduleCarPass();
  }, delay * 1000);
}

// Noise-based whoosh with a sweeping bandpass to fake a passing car
function passingCar() {
  const c = ac;
  const t0 = c.currentTime;
  const dur = 2.4 + Math.random() * 1.2;
  const frames = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 0.9;
  // Approaching -> passing -> receding: center freq rises then falls
  const peak = 420 + Math.random() * 320;
  bp.frequency.setValueAtTime(peak * 0.55, t0);
  bp.frequency.linearRampToValueAtTime(peak, t0 + dur * 0.5);
  bp.frequency.linearRampToValueAtTime(peak * 0.5, t0 + dur);
  const g = c.createGain();
  const peakGain = 0.09 + Math.random() * 0.06;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peakGain, t0 + dur * 0.45);
  g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
  src.connect(bp).connect(g).connect(masterGain);
  src.start(t0);
  src.stop(t0 + dur + 0.05);

  // Add a low engine layer for richness
  const eng = c.createOscillator();
  eng.type = 'sawtooth';
  const ef = 70 + Math.random() * 40;
  eng.frequency.setValueAtTime(ef * 0.8, t0);
  eng.frequency.linearRampToValueAtTime(ef * 1.1, t0 + dur * 0.5);
  eng.frequency.linearRampToValueAtTime(ef * 0.8, t0 + dur);
  const elp = c.createBiquadFilter();
  elp.type = 'lowpass';
  elp.frequency.value = 300;
  const eg = c.createGain();
  eg.gain.setValueAtTime(0, t0);
  eg.gain.linearRampToValueAtTime(0.035, t0 + dur * 0.5);
  eg.gain.linearRampToValueAtTime(0.0001, t0 + dur);
  eng.connect(elp).connect(eg).connect(masterGain);
  eng.start(t0);
  eng.stop(t0 + dur + 0.1);
}

function scheduleHorn() {
  const delay = 6 + Math.random() * 10;
  setTimeout(() => {
    if (!isReady()) { scheduleHorn(); return; }
    horn();
    scheduleHorn();
  }, delay * 1000);
}

function horn() {
  const c = ac;
  const t0 = c.currentTime;
  const dur = 0.25 + Math.random() * 0.4;
  const f = 240 + Math.random() * 160;
  const o1 = c.createOscillator(); o1.type = 'square'; o1.frequency.value = f;
  const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = f * 1.5;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.08, t0 + 0.04);
  g.gain.linearRampToValueAtTime(0.05, t0 + dur - 0.05);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 1400;
  o1.connect(lp); o2.connect(lp); lp.connect(g).connect(masterGain);
  o1.start(t0); o2.start(t0);
  o1.stop(t0 + dur + 0.02); o2.stop(t0 + dur + 0.02);
}

function scheduleChatter() {
  const delay = 4 + Math.random() * 9;
  setTimeout(() => {
    if (!isReady()) { scheduleChatter(); return; }
    chatter();
    scheduleChatter();
  }, delay * 1000);
}

// Bursts of formant-filtered noise to mimic distant voices
function chatter() {
  const c = ac;
  const t0 = c.currentTime;
  const bursts = 2 + Math.floor(Math.random() * 3);
  for (let b = 0; b < bursts; b++) {
    const start = t0 + b * (0.18 + Math.random() * 0.2);
    const dur = 0.12 + Math.random() * 0.18;
    const frames = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, frames, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const f1 = c.createBiquadFilter(); f1.type = 'bandpass';
    f1.frequency.value = 700 + Math.random() * 400;
    f1.Q.value = 3;
    const f2 = c.createBiquadFilter(); f2.type = 'bandpass';
    f2.frequency.value = 1400 + Math.random() * 600;
    f2.Q.value = 4;
    const g = c.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(0.04 + Math.random() * 0.03, start + 0.03);
    g.gain.linearRampToValueAtTime(0.0001, start + dur);
    src.connect(f1).connect(f2).connect(g).connect(masterGain);
    src.start(start);
    src.stop(start + dur + 0.05);
  }
}

function scheduleBrake() {
  const delay = 18 + Math.random() * 25;
  setTimeout(() => {
    if (!isReady()) { scheduleBrake(); return; }
    brakeSqueak();
    scheduleBrake();
  }, delay * 1000);
}

function brakeSqueak() {
  const c = ac;
  const t0 = c.currentTime;
  const dur = 0.35 + Math.random() * 0.35;
  const o = c.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(1400 + Math.random() * 400, t0);
  o.frequency.exponentialRampToValueAtTime(400, t0 + dur);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 6;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.03, t0 + 0.05);
  g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
  o.connect(bp).connect(g).connect(masterGain);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

// -------------------- Gear shift (clunk + metallic tick) --------------------
// Layered: a short low "thunk" body + a bandpassed noise transient for the
// metallic click of the dog-teeth engaging. Punchy, ~140ms total.
// If the AudioContext hasn't been resumed yet, we attempt resume and then
// schedule the shift — so the first press after an interaction also plays.
export function playGearShift() {
  const c = ensure();
  if (!c) return;
  if (c.state !== 'running') {
    c.resume().then(() => { if (c.state === 'running') doGearShift(); }).catch(() => {});
    return;
  }
  doGearShift();
}

function doGearShift() {
  const c = ac;
  const t0 = c.currentTime;

  // 1) Low "THUNK" body — triangle sweep for a weightier punch than a sine
  const thud = c.createOscillator();
  thud.type = 'triangle';
  thud.frequency.setValueAtTime(220, t0);
  thud.frequency.exponentialRampToValueAtTime(48, t0 + 0.11);
  const thudG = c.createGain();
  thudG.gain.setValueAtTime(0.0001, t0);
  thudG.gain.linearRampToValueAtTime(0.75, t0 + 0.005);
  thudG.gain.exponentialRampToValueAtTime(0.001, t0 + 0.16);
  thud.connect(thudG).connect(masterGain);
  thud.start(t0);
  thud.stop(t0 + 0.18);

  // 2) Metallic "snick" — short noise through a tight bandpass with strong Q
  const len = 0.06;
  const frames = Math.floor(c.sampleRate * len);
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / frames, 2);
  }
  const snick = c.createBufferSource();
  snick.buffer = buf;
  const bp1 = c.createBiquadFilter();
  bp1.type = 'bandpass';
  bp1.frequency.value = 4200;
  bp1.Q.value = 14;
  const sg = c.createGain();
  sg.gain.value = 0.65;
  snick.connect(bp1).connect(sg).connect(masterGain);
  snick.start(t0);

  // 3) Secondary detent click ~18ms later for the "ch-CLACK" feel
  const snick2 = c.createBufferSource();
  snick2.buffer = buf;
  const bp2 = c.createBiquadFilter();
  bp2.type = 'bandpass';
  bp2.frequency.value = 2400;
  bp2.Q.value = 20;
  const sg2 = c.createGain();
  sg2.gain.value = 0.45;
  snick2.connect(bp2).connect(sg2).connect(masterGain);
  snick2.start(t0 + 0.018);

  // 4) Gearbox resonance tail — brief mid sine ring for mechanical body
  const ring = c.createOscillator();
  ring.type = 'sine';
  ring.frequency.value = 330;
  const rg = c.createGain();
  rg.gain.setValueAtTime(0, t0 + 0.006);
  rg.gain.linearRampToValueAtTime(0.18, t0 + 0.016);
  rg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2);
  ring.connect(rg).connect(masterGain);
  ring.start(t0 + 0.006);
  ring.stop(t0 + 0.22);
}

// -------------------- Motorcycle engine --------------------
// Layered synth: a deep sub (0.5x) for rumble, two detuned sawtooths for body,
// and a square at 2x for bite. Amplitude LFO gives the power-stroke chug.
// Audible and clearly "a motorcycle", but below the ambience in volume.
export function startEngine() {
  if (!isReady()) return;
  if (engineNodes) return;
  const c = ac;
  const now = c.currentTime;

  // ---- oscillator stack ----
  const sub = c.createOscillator();
  sub.type = 'sawtooth';
  sub.frequency.value = 30;                   // one octave below fundamental
  const subGain = c.createGain(); subGain.gain.value = 0.55;

  const osc1 = c.createOscillator();
  osc1.type = 'sawtooth';
  osc1.frequency.value = 60;
  const osc2 = c.createOscillator();
  osc2.type = 'sawtooth';
  osc2.frequency.value = 62.8;                // detune → beating warmth
  const bodyGain = c.createGain(); bodyGain.gain.value = 0.7;

  const bite = c.createOscillator();
  bite.type = 'square';
  bite.frequency.value = 120;                 // 2x fundamental for harmonic bite
  const biteGain = c.createGain(); biteGain.gain.value = 0.18;

  // ---- tone-shaping lowpass (tracks throttle) ----
  const lpf = c.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.value = 520;
  lpf.Q.value = 1.1;

  // ---- power-stroke LFO on amplitude ----
  const lfo = c.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 9;
  const lfoDepth = c.createGain();
  lfoDepth.gain.value = 0.18;                 // modest ducking so it doesn't thump

  // Master engine gain — clearly audible
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.14, now + 0.4);   // idle loudness
  lfo.connect(lfoDepth).connect(gain.gain);

  // Routing
  sub.connect(subGain).connect(lpf);
  osc1.connect(bodyGain);
  osc2.connect(bodyGain);
  bodyGain.connect(lpf);
  bite.connect(biteGain).connect(lpf);
  lpf.connect(gain).connect(masterGain);

  sub.start(); osc1.start(); osc2.start(); bite.start(); lfo.start();
  engineNodes = { sub, osc1, osc2, bite, lfo, lfoDepth, lpf, gain, subGain, bodyGain, biteGain };
}

export function setEngineThrottle(throttle01) {
  if (!engineNodes || !isReady()) return;
  const t = Math.min(1, Math.max(0, throttle01));
  // Fundamental 60Hz idle → 170Hz at WOT. All other oscs scale off this.
  const base = 60 + t * 110;
  const cutoff = 520 + t * 1700;              // opens up the top end as revs climb
  const vol = 0.14 + t * 0.12;                // 0.14 idle → 0.26 WOT
  const lfoRate = 9 + t * 22;                 // 9Hz → 31Hz chug rate
  const biteAmt = 0.18 + t * 0.22;            // more harmonic edge at speed
  const nowT = ac.currentTime;
  const e = engineNodes;
  e.sub.frequency.setTargetAtTime(base * 0.5, nowT, 0.12);
  e.osc1.frequency.setTargetAtTime(base, nowT, 0.12);
  e.osc2.frequency.setTargetAtTime(base * 1.047, nowT, 0.12);
  e.bite.frequency.setTargetAtTime(base * 2, nowT, 0.12);
  e.biteGain.gain.setTargetAtTime(biteAmt, nowT, 0.18);
  e.lpf.frequency.setTargetAtTime(cutoff, nowT, 0.12);
  e.gain.gain.setTargetAtTime(vol, nowT, 0.18);
  e.lfo.frequency.setTargetAtTime(lfoRate, nowT, 0.15);
}

export function stopEngine() {
  if (!engineNodes || !isReady()) return;
  const nodes = engineNodes;
  engineNodes = null;
  const nowT = ac.currentTime;
  nodes.gain.gain.cancelScheduledValues(nowT);
  nodes.gain.gain.setTargetAtTime(0, nowT, 0.2);
  setTimeout(() => {
    try { nodes.sub.stop(); } catch {}
    try { nodes.osc1.stop(); } catch {}
    try { nodes.osc2.stop(); } catch {}
    try { nodes.bite.stop(); } catch {}
    try { nodes.lfo.stop(); } catch {}
  }, 800);
}
