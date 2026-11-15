// Generative, always-in-key audio. C major pentatonic: any tap sequence sounds musical.
const SCALE = [0, 2, 4, 7, 9];
const BASE = 261.63; // C4

let ctx, master, padGain, verb, muted = false;

function noteHz(step) {
  const oct = Math.floor(step / SCALE.length);
  const deg = SCALE[((step % SCALE.length) + SCALE.length) % SCALE.length];
  return BASE * Math.pow(2, oct + deg / 12);
}

function makeVerb() {
  const len = ctx.sampleRate * 2.4;
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  const conv = ctx.createConvolver();
  conv.buffer = buf;
  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  conv.connect(wet).connect(master);
  return conv;
}

export function initAudio() {
  if (ctx) { ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.7;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  verb = makeVerb();
  startPad();
}

function startPad() {
  padGain = ctx.createGain();
  padGain.gain.value = 0;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 600;
  padGain.connect(lp).connect(master);
  lp.connect(verb);
  [130.81, 196.0, 261.63 * 1.003].forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = i === 1 ? 'triangle' : 'sine';
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = 0.12;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07 + i * 0.03;
    const lg = ctx.createGain();
    lg.gain.value = 0.05;
    lfo.connect(lg).connect(g.gain);
    o.connect(g).connect(padGain);
    o.start(); lfo.start();
  });
}

export function padLevel(v) {
  if (!ctx) return;
  padGain.gain.setTargetAtTime(v, ctx.currentTime, 1.2);
}

function tone(freq, { dur = 0.6, type = 'sine', vol = 0.25, attack = 0.005, wet = true, glideTo } = {}) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  if (wet) g.connect(verb);
  o.start(t);
  o.stop(t + dur + 0.05);
}

// soft bell for an orb; step climbs with combo => a rising domino melody
export function orb(step) {
  const f = noteHz(step + 5);
  tone(f, { dur: 1.2, vol: 0.22 });
  tone(f * 2, { dur: 0.5, vol: 0.05, type: 'triangle' });
}

// perfect fit: low "thunk" + click, like a part snapping into its slot
export function snap() {
  tone(110, { dur: 0.18, vol: 0.5, glideTo: 70, wet: false });
  tone(1800, { dur: 0.03, vol: 0.08, type: 'square', wet: false });
  setTimeout(() => tone(noteHz(12), { dur: 1.4, vol: 0.14 }), 60);
}

export function tick() { tone(noteHz(10), { dur: 0.08, vol: 0.05, type: 'triangle', wet: false }); }

export function soften() { tone(330, { dur: 1.6, vol: 0.18, glideTo: 165 }); }

export function levelUp(level) {
  [0, 2, 4, 7].forEach((s, i) => setTimeout(() => tone(noteHz(s + 5 + (level % 3)), { dur: 1.6, vol: 0.12 }), i * 110));
}

export function peelDone() {
  [0, 4, 7, 9, 12].forEach((s, i) => setTimeout(() => tone(noteHz(s + 3), { dur: 2, vol: 0.1 }), i * 70));
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.7, ctx.currentTime, 0.1);
}
export const isMuted = () => muted;
