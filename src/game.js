import * as sfx from './audio.js';
import { drawMandala, FOLD } from './mandala.js';

// Suift: a circular labyrinth. The ball orbits a lane; tap to slip through a gap
// in the wall below. Reach the glowing heart before the timer runs out.
const TAU = Math.PI * 2;
const norm = (a) => ((a % TAU) + TAU) % TAU;
const signed = (from, to) => { const d = norm(to - from); return d > Math.PI ? d - TAU : d; };
const adist = (a, b) => Math.abs(signed(a, b));
const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch {} };
const rnd = (a, b) => a + Math.random() * (b - a);
const ease = (t) => 1 - Math.pow(1 - t, 3);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const START_TIME = 50;
const CLEAR_BONUS = (lvl) => 7 + Math.min(lvl, 5);

export class Game {
  constructor(canvas, hooks) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.hooks = hooks; // { onHud, onEnd, onToast }
    this.mandalaCanvas = document.createElement('canvas');
    this.artCanvas = document.createElement('canvas');
    this.t = 0;
    this.layerHue = 220;
    this.resize();
    addEventListener('resize', () => { this.resize(); if (this.maze) this.layout(); });
    this.idle();
    requestAnimationFrame((ts) => this.loop(ts));
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = innerWidth, h = innerHeight;
    Object.assign(this, { dpr, w, h });
    this.c.width = w * dpr; this.c.height = h * dpr;
    this.c.style.width = w + 'px'; this.c.style.height = h + 'px';
    this.cx = w / 2; this.cy = h / 2 - (h > w ? h * 0.03 : 0);
    this.R = Math.min(w * 0.44, h * 0.36, 360);
    this.paintArt(this.layerHue);
    if (this.petals?.length) this.renderMandala();
  }

  paintArt(hue) {
    const s = Math.ceil(this.R * 2.3 * this.dpr);
    const a = this.artCanvas; a.width = a.height = s;
    const g = a.getContext('2d'), c = s / 2;
    for (let i = 0; i < 11; i++) {
      const ang = (i / 11) * TAU + hue * 0.1, d = s * (0.1 + (i % 3) * 0.1);
      const x = c + Math.cos(ang) * d, y = c + Math.sin(ang) * d;
      const grd = g.createRadialGradient(x, y, 0, x, y, s * 0.3);
      grd.addColorStop(0, `hsla(${hue + i * 14},55%,60%,0.15)`);
      grd.addColorStop(1, `hsla(${hue + i * 14},55%,40%,0)`);
      g.fillStyle = grd; g.fillRect(0, 0, s, s);
    }
    g.globalCompositeOperation = 'destination-in';
    const m = g.createRadialGradient(c, c, 0, c, c, s * 0.45);
    m.addColorStop(0, 'rgba(0,0,0,.8)'); m.addColorStop(0.8, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = m; g.fillRect(0, 0, s, s);
  }

  idle() {
    this.state = 'idle';
    this.level = 1;
    this.petals = []; this.parts = []; this.ripples = []; this.floaters = []; this.trail = [];
    this.build(2, true);
  }

  // ---------- labyrinth generation ----------
  build(level, demo = false) {
    const rings = Math.min(6, 2 + Math.floor(level / 2)); // 2,3,3,4,4,5,5,6
    const rot = 0.1 + Math.min(level, 10) * 0.03;
    const walls = [], lanes = [];
    for (let k = 0; k < rings; k++) {
      const nGaps = level <= 2 ? 2 : k === 0 && level < 6 ? 2 : 1;
      const base = rnd(0, TAU);
      walls.push({
        phi: rnd(0, TAU),
        spin: (k % 2 ? -1 : 1) * rot * rnd(0.75, 1.25),
        gaps: Array.from({ length: nGaps }, (_, i) => base + (i * TAU) / nGaps),
        glow: 0,
      });
      const nSpokes = level === 1 ? 0 : level <= 3 ? (k % 2 ? 1 : 0) : Math.min(2, 1 + Math.floor(k / 2));
      lanes.push({
        phi: rnd(0, TAU),
        spin: (k % 2 ? 1 : -1) * rot * rnd(0.5, 0.9), // differs from wall so gaps drift between sections
        spokes: Array.from({ length: nSpokes }, (_, i) => (i * TAU) / Math.max(1, nSpokes) + rnd(-0.4, 0.4)),
        orbs: [],
      });
    }
    this.maze = { rings, walls, lanes, demo };
    this.layout();
    for (let k = 0; k < rings; k++) {
      const n = demo ? 0 : 1 + (k < 2 ? 1 : 0);
      for (let i = 0; i < n; i++) this.maze.lanes[k].orbs.push({ a: rnd(0, TAU), hue: (this.layerHue + rnd(0, 160)) % 360, born: this.t });
    }
    this.ball = { lane: 0, a: -Math.PI / 2, dir: 1, r: this.laneR[0], drop: null };
    this.dropsThisLevel = 0;
    this.buildT = 1;
  }

  layout() {
    const { rings } = this.maze;
    this.goalR = this.R * 0.15;
    this.gap = (this.R - this.goalR) / rings;
    this.laneR = Array.from({ length: rings }, (_, k) => this.R - k * this.gap);
    this.wallR = this.laneR.map((r) => r - this.gap / 2);
    this.br = Math.max(5, Math.min(9, this.gap * 0.22));
    if (this.ball && !this.ball.drop) this.ball.r = this.laneR[Math.min(this.ball.lane, rings - 1)] ?? this.goalR;
  }

  gapHalf(k) {
    // angular half-width; never narrower than the ball + margin
    const r = this.wallR[k];
    const base = Math.max(0.12, 0.36 - this.level * 0.025);
    return Math.max(base, (this.br * 1.9) / r);
  }
  spokeHalf(k) { return 3 / this.laneR[k]; }

  // ---------- game flow ----------
  start(mode) {
    this.mode = mode;
    this.state = 'play';
    this.level = 1; this.score = 0; this.perfects = 0; this.cleared = 0;
    this.combo = 0; this.timeLeft = START_TIME; this.elapsed = 0; this.lastSec = START_TIME;
    this.petals = []; this.collected = []; this.parts = []; this.ripples = []; this.floaters = []; this.trail = [];
    this.layerHue = 200 + rnd(0, 60); this.paintArt(this.layerHue); this.peel = 0; this.peelEase = 0;
    this.speedMul = 1;
    this.build(1);
    sfx.padLevel(0.55);
    this.hud();
  }

  laneSpeed(k) {
    const lin = 150 * this.speedMul; // px/s along the lane
    return Math.min(3.4, lin / this.laneR[k]);
  }

  tap() {
    if (this.state !== 'play') return;
    const b = this.ball;
    if (b.drop || this.pause > 0 || b.lane >= this.maze.rings) return;
    if (this.lock > 0) { this.bump = 1; return; } // still settling after a rushed tap
    const k = b.lane, w = this.maze.walls[k];
    const half = this.gapHalf(k);
    const bx = this.cx + Math.cos(b.a) * b.r, by = this.cy + Math.sin(b.a) * b.r;
    let best = Infinity;
    for (const ga of w.gaps) best = Math.min(best, adist(b.a, ga + w.phi));
    const usable = half - (this.br * 0.9) / this.wallR[k];
    if (best <= usable) {
      const perfect = best <= usable * 0.35;
      b.drop = { from: b.r, to: k + 1 < this.maze.rings ? this.laneR[k + 1] : 0, t: 0, perfect };
      this.dropsThisLevel++;
      this.peel = Math.min(1, this.dropsThisLevel / this.maze.rings);
      if (perfect) {
        this.combo++; this.perfects++;
        this.addScore(25 + 5 * Math.min(this.combo, 6), bx, by, 'perfect!');
        sfx.snap(); buzz([8, 30, 8]);
        this.ripples.push({ x: bx, y: by, r: 2, life: 1, snap: true });
        this.timeLeft += 1;
        this.floaters.push({ x: bx, y: by + 18, text: '+1s', life: 1 });
      } else {
        this.combo = 0;
        this.addScore(10, bx, by);
        sfx.orb(2 + k); buzz(6);
      }
      w.glow = 1;
      this.petals.push({ a: ((norm(b.a) / TAU) * FOLD) % 1, r: Math.min(1, k / 5 + rnd(0, 0.15)), s: perfect ? 0.9 : 0.45, hue: perfect ? 45 : this.layerHue });
      this.renderMandala();
    } else {
      // rushed tap: gap locks for one breath, which teaches waiting over spamming
      this.combo = 0;
      this.lock = 0.6;
      this.rushed = (this.rushed || 0) + 1;
      sfx.tick(); buzz(3);
      this.ripples.push({ x: bx, y: by, r: 3, life: 0.6, hue: this.layerHue });
      this.bump = 1;
    }
    this.hud();
  }

  addScore(n, x, y, label) {
    this.score += n;
    this.floaters.push({ x, y, text: label ? `${label} +${n}` : `+${n}`, life: 1 });
  }

  hud() {
    this.hooks.onHud?.({
      score: this.score, level: this.level, time: this.mode === 'zen' ? null : Math.max(0, this.timeLeft),
      combo: this.combo, collected: this.collected, perfects: this.perfects,
    });
  }

  reachGoal() {
    const lvl = this.level;
    this.cleared++;
    const bonus = CLEAR_BONUS(lvl);
    this.addScore(100 * lvl, this.cx, this.cy - 10, `level ${lvl} done`);
    if (this.mode !== 'zen') { this.timeLeft += bonus; this.floaters.push({ x: this.cx, y: this.cy + 26, text: `+${bonus}s`, life: 1.2 }); }
    sfx.peelDone(); buzz([10, 40, 10, 40, 20]);
    for (let i = 0; i < 70; i++) {
      const k = rnd(0, TAU), v = rnd(40, 220);
      this.parts.push({ x: this.cx, y: this.cy, vx: Math.cos(k) * v, vy: Math.sin(k) * v, life: 1.4, hue: (this.layerHue + rnd(-30, 60)) % 360, s: rnd(1, 3) });
    }
    this.ripples.push({ x: this.cx, y: this.cy, r: this.goalR, life: 1.2, hue: this.layerHue, ring: true });
    // petals ring for the bloom
    for (let i = 0; i < 3; i++) this.petals.push({ a: rnd(0, 1), r: 0.2 + i * 0.25, s: 1, hue: (this.layerHue + i * 30) % 360 });
    this.renderMandala();
    this.prevArt = this.cloneArt(); this.revealFlash = 1;
    this.layerHue = (this.layerHue + 70) % 360; this.paintArt(this.layerHue);
    this.peel = 0; this.peelEase = 0;
    this.level++;
    this.speedMul *= 1.06;
    this.hooks.onToast?.(`level ${this.level}`);
    sfx.levelUp(this.level);
    this.pause = 1.1;
    this.hud();
  }

  end() {
    if (this.state !== 'play') return;
    this.state = 'over';
    sfx.padLevel(0.25);
    this.hooks.onEnd?.({ score: this.score, laps: this.cleared, perfects: this.perfects, petals: this.petals.slice(), level: this.level, time: this.elapsed });
  }
  finishZen() { this.end(); }

  // ---------- simulation ----------
  update(dt) {
    this.t += dt;
    for (const r of this.ripples) { r.r += dt * (r.ring ? 120 : r.snap ? 160 : 110); r.life -= dt * 0.9; }
    this.ripples = this.ripples.filter((r) => r.life > 0);
    for (const p of this.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; p.life -= dt * 0.7; }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const f of this.floaters) { f.y -= dt * 26; f.life -= dt * 0.8; }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    this.bump = Math.max(0, (this.bump || 0) - dt * 3);
    this.lock = Math.max(0, (this.lock || 0) - dt);
    this.revealFlash = Math.max(0, (this.revealFlash || 0) - dt * 0.7);
    this.buildT = Math.max(0, (this.buildT || 0) - dt * 1.4);

    const m = this.maze;
    for (const w of m.walls) { w.phi += w.spin * dt; w.glow = Math.max(0, w.glow - dt * 2); }
    for (const l of m.lanes) l.phi += l.spin * dt;

    if (this.state === 'idle') { this.ball.a += dt * 0.7; this.pushTrail(); return; }
    if (this.state !== 'play') return;

    if (this.pause > 0) {
      this.pause -= dt;
      if (this.pause <= 0) this.build(this.level);
      return;
    }

    this.elapsed += dt;
    if (this.mode !== 'zen') {
      this.timeLeft -= dt;
      const s = Math.ceil(this.timeLeft);
      if (s !== this.lastSec) { this.lastSec = s; this.hud(); if (s <= 5 && s > 0) sfx.tick(); }
      if (this.timeLeft <= 0) { this.timeLeft = 0; this.hud(); this.end(); return; }
    }

    const b = this.ball;
    if (b.drop) {
      b.drop.t += dt / 0.28;
      const e = ease(Math.min(1, b.drop.t));
      b.r = b.drop.from + (b.drop.to - b.drop.from) * e;
      if (b.drop.t >= 1) {
        b.drop = null;
        b.lane++;
        if (b.lane >= m.rings) { b.r = 0; this.reachGoal(); return; }
        b.r = this.laneR[b.lane];
      }
      this.pushTrail();
      return;
    }

    const k = b.lane, lane = m.lanes[k];
    const step = this.laneSpeed(k) * b.dir * dt;
    const prev = b.a;
    b.a = norm(b.a + step);
    // spokes: bounce softly
    const ballAng = this.br / this.laneR[k];
    for (const sa of lane.spokes) {
      const s = norm(sa + lane.phi);
      const lim = ballAng + this.spokeHalf(k);
      const d0 = signed(prev, s), d = signed(b.a, s);
      const crossed = Math.abs(d0) < 0.5 && Math.sign(d0) !== Math.sign(d) && Math.sign(d0) === b.dir;
      if ((Math.abs(d) < lim && Math.sign(d) === b.dir) || crossed) {
        const side = Math.sign(d0) || b.dir; // stay on the side we came from
        b.dir *= -1;
        b.a = norm(s - side * (lim + 0.005));
        sfx.tick(); buzz(3);
        const bx = this.cx + Math.cos(b.a) * b.r, by = this.cy + Math.sin(b.a) * b.r;
        this.ripples.push({ x: bx, y: by, r: 3, life: 0.5, hue: 20 });
        break;
      }
    }
    // gap alignment telegraph
    const w = m.walls[k], half = this.gapHalf(k), usable = half - (this.br * 0.9) / this.wallR[k];
    this.aligned = w.gaps.some((ga) => adist(b.a, ga + w.phi) <= usable);
    // orbs
    lane.orbs = lane.orbs.filter((o) => {
      if (adist(o.a, b.a) > ballAng + 0.05 && adist(o.a, prev) > ballAng + 0.05) return true;
      const bx = this.cx + Math.cos(b.a) * b.r, by = this.cy + Math.sin(b.a) * b.r;
      this.addScore(15, bx, by);
      if (this.mode !== 'zen') { this.timeLeft += 1; }
      this.collected.push(o.hue);
      sfx.orb(5 + this.collected.length % 7); buzz(6);
      this.petals.push({ a: ((norm(o.a) / TAU) * FOLD) % 1, r: Math.min(1, this.petals.length / 40 + rnd(0, 0.25)), s: 0.6, hue: o.hue });
      this.renderMandala();
      for (let i = 0; i < 14; i++) {
        const q = rnd(0, TAU), v = rnd(30, 100);
        this.parts.push({ x: bx, y: by, vx: Math.cos(q) * v, vy: Math.sin(q) * v, life: 1, hue: o.hue, s: rnd(1.5, 3.5) });
      }
      this.ripples.push({ x: bx, y: by, r: 6, life: 0.8, hue: o.hue });
      this.hud();
      return false;
    });
    this.pushTrail();
  }

  pushTrail() {
    this.trail.push({ x: Math.cos(this.ball.a) * this.ball.r, y: Math.sin(this.ball.a) * this.ball.r, t: this.t });
    while (this.trail.length && this.t - this.trail[0].t > 0.4) this.trail.shift();
  }

  cloneArt() {
    const c = document.createElement('canvas'); c.width = this.artCanvas.width; c.height = this.artCanvas.height;
    c.getContext('2d').drawImage(this.artCanvas, 0, 0); return c;
  }

  renderMandala() {
    const m = this.mandalaCanvas, s = Math.ceil(this.R * 1.6 * this.dpr);
    m.width = m.height = s;
    drawMandala(m.getContext('2d'), this.petals, s / 2, s / 2, s / 2 / 110);
  }

  // ---------- render ----------
  draw() {
    const g = this.g, { w, h, cx, cy, dpr } = this;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.75);
    bg.addColorStop(0, '#151821'); bg.addColorStop(1, '#090a0e');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);

    // peeled art: a wedge that grows with each ring you pass
    if (this.state !== 'idle') {
      const art = this.artCanvas, size = art.width / dpr;
      if (this.prevArt && this.revealFlash > 0) {
        g.globalAlpha = this.revealFlash * 0.9;
        g.drawImage(this.prevArt, cx - size / 2, cy - size / 2, size, size);
        g.globalAlpha = 1;
      }
      this.peelEase += (this.peel * TAU - this.peelEase) * 0.08;
      if (this.peelEase > 0.01) {
        g.save();
        g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, size / 2, -Math.PI / 2, -Math.PI / 2 + this.peelEase); g.closePath(); g.clip();
        g.drawImage(art, cx - size / 2, cy - size / 2, size, size);
        g.restore();
      }
    }

    // mandala breathing in the heart
    if (this.petals.length) {
      const m = this.mandalaCanvas, s = m.width / dpr;
      g.save(); g.translate(cx, cy); g.rotate(reduced ? 0 : this.t * 0.05);
      const k = this.state === 'play' ? 0.3 : 1;
      g.scale(k, k); g.globalAlpha = this.state === 'over' ? 0.3 : this.state === 'play' ? 0.55 : 0.8;
      g.drawImage(m, -s / 2, -s / 2, s, s);
      g.restore(); g.globalAlpha = 1;
    }

    const mz = this.maze;
    const appear = 1 - (this.buildT || 0);
    const scaleIn = 0.9 + 0.1 * ease(appear);

    // goal: soft glowing heart
    const pulse = 1 + Math.sin(this.t * 2) * 0.06;
    const gr = this.goalR * scaleIn * pulse;
    const gg = g.createRadialGradient(cx, cy, 0, cx, cy, gr * 1.8);
    gg.addColorStop(0, `hsla(${this.layerHue},80%,85%,.55)`); gg.addColorStop(0.5, `hsla(${this.layerHue},70%,70%,.18)`); gg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gg; g.beginPath(); g.arc(cx, cy, gr * 1.8, 0, TAU); g.fill();
    g.strokeStyle = `hsla(${this.layerHue},70%,85%,.35)`; g.lineWidth = 1;
    g.beginPath(); g.arc(cx, cy, gr * 0.55, 0, TAU); g.stroke();

    // lane guides
    g.lineWidth = 1;
    for (let k = 0; k < mz.rings; k++) {
      g.strokeStyle = `rgba(242,237,228,${0.04 * appear})`;
      g.beginPath(); g.arc(cx, cy, this.laneR[k] * scaleIn, 0, TAU); g.stroke();
    }

    // walls with gaps
    const curLane = this.ball.drop ? -1 : this.ball.lane;
    g.lineCap = 'round';
    for (let k = 0; k < mz.rings; k++) {
      const wl = mz.walls[k], r = this.wallR[k] * scaleIn, half = this.gapHalf(k);
      const gaps = wl.gaps.map((ga) => norm(ga + wl.phi)).sort((a, b) => a - b);
      const active = k === curLane && this.state === 'play';
      const ready = active && this.aligned && !(this.lock > 0);
      g.lineWidth = 3;
      g.strokeStyle = `rgba(242,237,228,${(active ? 0.55 : 0.28) * appear + wl.glow * 0.3 + (active ? this.bump * 0.3 : 0)})`;
      for (let i = 0; i < gaps.length; i++) {
        const a0 = gaps[i] + half, a1 = (i + 1 < gaps.length ? gaps[i + 1] : gaps[0] + TAU) - half;
        if (a1 > a0) { g.beginPath(); g.arc(cx, cy, r, a0, a1); g.stroke(); }
      }
      // gap lips: glow gold when the ball is lined up => "now"
      for (const ga of gaps) {
        for (const e of [ga - half, ga + half]) {
          const x = cx + Math.cos(e) * r, y = cy + Math.sin(e) * r;
          g.fillStyle = ready ? 'rgba(255,230,170,.95)' : `rgba(242,237,228,${0.45 * appear})`;
          g.beginPath(); g.arc(x, y, ready ? 3.2 : 2.2, 0, TAU); g.fill();
        }
        if (ready) {
          const gl = g.createRadialGradient(cx + Math.cos(ga) * r, cy + Math.sin(ga) * r, 0, cx + Math.cos(ga) * r, cy + Math.sin(ga) * r, 26);
          gl.addColorStop(0, 'rgba(255,230,170,.35)'); gl.addColorStop(1, 'rgba(255,230,170,0)');
          g.fillStyle = gl; g.beginPath(); g.arc(cx + Math.cos(ga) * r, cy + Math.sin(ga) * r, 26, 0, TAU); g.fill();
        }
      }
      // spokes
      const lane = mz.lanes[k];
      g.strokeStyle = `rgba(255,160,140,${0.8 * appear})`; g.lineWidth = 4;
      for (const sa of lane.spokes) {
        const a = sa + lane.phi, r0 = (this.laneR[k] + this.gap / 2 - 3) * scaleIn, r1 = (this.wallR[k] + 3) * scaleIn;
        g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke();
      }
      // orbs
      lane.orbs.forEach((o, i) => {
        const x = cx + Math.cos(o.a) * this.laneR[k] * scaleIn, y = cy + Math.sin(o.a) * this.laneR[k] * scaleIn;
        const grow = Math.min(1, (this.t - o.born) / 0.5);
        const rr = (3.5 + Math.sin(this.t * 4 + i) * 0.8) * grow;
        const og = g.createRadialGradient(x, y, 0, x, y, rr * 4);
        og.addColorStop(0, `hsla(${o.hue},80%,80%,.5)`); og.addColorStop(1, `hsla(${o.hue},80%,60%,0)`);
        g.fillStyle = og; g.beginPath(); g.arc(x, y, rr * 4, 0, TAU); g.fill();
        g.fillStyle = `hsl(${o.hue},75%,82%)`; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
      });
    }

    // timer: a thin arc around everything that unwinds
    if (this.state === 'play' && this.mode !== 'zen') {
      const frac = Math.min(1, this.timeLeft / START_TIME);
      const rr = this.R + 22;
      g.lineWidth = 2; g.lineCap = 'round';
      g.strokeStyle = 'rgba(242,237,228,.07)'; g.beginPath(); g.arc(cx, cy, rr, 0, TAU); g.stroke();
      g.strokeStyle = this.timeLeft < 10 ? `rgba(255,160,140,${0.6 + 0.3 * Math.sin(this.t * 6)})` : 'rgba(255,240,215,.55)';
      g.beginPath(); g.arc(cx, cy, rr, -Math.PI / 2, -Math.PI / 2 + frac * TAU); g.stroke();
    }

    // ripples
    for (const r of this.ripples) {
      g.strokeStyle = r.snap ? `rgba(255,230,170,${r.life * 0.7})` : `hsla(${r.hue},60%,80%,${r.life * 0.35})`;
      g.lineWidth = r.snap ? 2 : 1;
      g.beginPath(); g.arc(r.x, r.y, r.r, 0, TAU); g.stroke();
    }
    for (const p of this.parts) {
      g.fillStyle = `hsla(${p.hue},70%,78%,${Math.min(1, p.life)})`;
      g.beginPath(); g.arc(p.x, p.y, p.s * Math.min(1, p.life), 0, TAU); g.fill();
    }

    // ball + trail
    const b = this.ball;
    if (this.pause > 0 && this.state === 'play') { /* ball merged into the heart */ } else {
      for (let i = 1; i < this.trail.length; i++) {
        const p0 = this.trail[i - 1], p1 = this.trail[i], k = i / this.trail.length;
        g.strokeStyle = `rgba(255,246,232,${k * 0.35})`; g.lineWidth = 1 + k * this.br * 0.8; g.lineCap = 'round';
        g.beginPath(); g.moveTo(cx + p0.x * scaleIn, cy + p0.y * scaleIn); g.lineTo(cx + p1.x * scaleIn, cy + p1.y * scaleIn); g.stroke();
      }
      const x = cx + Math.cos(b.a) * b.r * scaleIn, y = cy + Math.sin(b.a) * b.r * scaleIn;
      const glow = g.createRadialGradient(x, y, 0, x, y, this.br * 4);
      glow.addColorStop(0, 'rgba(255,240,215,.5)'); glow.addColorStop(1, 'rgba(255,240,215,0)');
      g.fillStyle = glow; g.beginPath(); g.arc(x, y, this.br * 4, 0, TAU); g.fill();
      g.fillStyle = '#fff8ee'; g.beginPath(); g.arc(x, y, this.br, 0, TAU); g.fill();
    }

    g.textAlign = 'center'; g.font = '500 13px "Inter Tight", system-ui, sans-serif';
    for (const f of this.floaters) { g.fillStyle = `rgba(255,246,232,${f.life * 0.85})`; g.fillText(f.text, f.x, f.y - 22); }
  }

  loop(ts) {
    const dt = Math.min(0.05, (ts - (this.last || ts)) / 1000);
    this.last = ts;
    this.update(dt);
    this.draw();
    requestAnimationFrame((t) => this.loop(t));
  }
}
