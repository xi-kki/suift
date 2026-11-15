import * as sfx from './audio.js';
import { drawMandala, FOLD } from './mandala.js';

const TAU = Math.PI * 2;
const angDist = (a, b) => { let d = ((a - b) % TAU + TAU) % TAU; return d > Math.PI ? TAU - d : d; };
const signedAng = (a, b) => { let d = ((b - a) % TAU + TAU) % TAU; return d > Math.PI ? d - TAU : d; };
const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch {} };
const lerp = (a, b, t) => a + (b - a) * t;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Game {
  constructor(canvas, hooks) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.hooks = hooks; // { onHud, onEnd, onToast }
    this.mandalaCanvas = document.createElement('canvas');
    this.artCanvas = document.createElement('canvas');
    this.running = false;
    this.t = 0;
    this.resize();
    addEventListener('resize', () => this.resize());
    this.idle();
    requestAnimationFrame((ts) => this.loop(ts));
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = innerWidth, h = innerHeight;
    this.dpr = dpr; this.w = w; this.h = h;
    this.c.width = w * dpr; this.c.height = h * dpr;
    this.c.style.width = w + 'px'; this.c.style.height = h + 'px';
    this.cx = w / 2; this.cy = h / 2 + (h > w ? -h * 0.02 : 0);
    this.R = Math.min(w, h) * (w < 600 ? 0.36 : 0.3);
    this.paintArt();
  }

  // the hidden artwork revealed by peeling — a soft generative aurora per layer
  paintArt(seedHue = this.layerHue ?? 210) {
    const s = Math.ceil(this.R * 2.4 * this.dpr);
    const a = this.artCanvas; a.width = a.height = s;
    const g = a.getContext('2d');
    const c = s / 2;
    // soft aurora: many wide blobs spread across the whole disc
    for (let i = 0; i < 11; i++) {
      const ang = (i / 11) * TAU + seedHue * 0.1;
      const d = s * (0.12 + (i % 3) * 0.1);
      const x = c + Math.cos(ang) * d, y = c + Math.sin(ang) * d;
      const grd = g.createRadialGradient(x, y, 0, x, y, s * 0.3);
      grd.addColorStop(0, `hsla(${seedHue + i * 14},55%,60%,0.16)`);
      grd.addColorStop(1, `hsla(${seedHue + i * 14},55%,40%,0)`);
      g.fillStyle = grd; g.fillRect(0, 0, s, s);
    }
    // fine concentric grain, like rings in sand
    g.strokeStyle = `hsla(${seedHue},60%,85%,0.05)`; g.lineWidth = 1;
    for (let r = s * 0.06; r < s * 0.46; r += s * 0.018) { g.beginPath(); g.arc(c, c, r, 0, TAU); g.stroke(); }
    g.globalCompositeOperation = 'destination-in';
    const m = g.createRadialGradient(c, c, 0, c, c, s * 0.42);
    m.addColorStop(0, 'rgba(0,0,0,.7)'); m.addColorStop(0.75, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = m; g.fillRect(0, 0, s, s);
  }

  idle() {
    this.state = 'idle';
    this.ball = { a: -Math.PI / 2, dir: 1, alive: true };
    this.speed = 0.9;
    this.orbs = []; this.shards = []; this.parts = []; this.ripples = []; this.floaters = [];
    this.petals = [];
    this.collected = [];
    this.trail = [];
  }

  start(mode) {
    this.mode = mode; // 'calm' | 'zen'
    this.state = 'play';
    this.ball = { a: -Math.PI / 2, dir: 1, alive: true, reform: 0, inv: 1.2 };
    this.base = 1.55; this.mult = 1; this.level = 1; this.levelT = 0;
    this.score = 0; this.laps = 0; this.lapAcc = 0; this.perfects = 0;
    this.combo = 0; this.comboT = 0; this.step = 0;
    this.lives = mode === 'zen' ? Infinity : 3;
    this.orbs = []; this.shards = []; this.parts = []; this.ripples = []; this.floaters = [];
    this.petals = []; this.collected = []; this.trail = [];
    this.peel = 0; this.layer = 0; this.layerHue = 200 + Math.random() * 60; this.paintArt(this.layerHue);
    this.spawnT = 0.6; this.shardT = 2.2;
    this.elapsed = 0;
    sfx.padLevel(0.55);
    this.hud();
  }

  tap() {
    if (this.state !== 'play' || !this.ball.alive) return;
    this.ball.dir *= -1;
    sfx.tick(); buzz(4);
    const bx = this.cx + Math.cos(this.ball.a) * this.R, by = this.cy + Math.sin(this.ball.a) * this.R;
    this.ripples.push({ x: bx, y: by, r: 4, life: 1, hue: this.layerHue });
    if (!reduced) this.ripples.push({ x: this.cx, y: this.cy, r: this.R * 0.92, life: 0.6, hue: this.layerHue, ring: true });
    // perfect fit: turning away just before a shard
    for (const s of this.shards) {
      if (s.fade < 1 || s.used) continue;
      const ahead = signedAng(this.ball.a, s.a) * -this.ball.dir; // >0 => shard was ahead (before flip)
      const gap = angDist(this.ball.a, s.a) - s.half;
      if (ahead > 0 && gap > 0 && gap < 0.2) {
        s.used = true;
        this.perfects++;
        this.addScore(25, bx, by, 'perfect fit');
        sfx.snap(); buzz([8, 30, 8]);
        this.ripples.push({ x: bx, y: by, r: 2, life: 1, hue: 45, snap: true });
        this.snapFlash = 1;
        break;
      }
    }
  }

  addScore(n, x, y, label) {
    this.score += n;
    this.floaters.push({ x, y, text: label ? `${label} +${n}` : `+${n}`, life: 1 });
    this.hud();
  }

  hud() {
    this.hooks.onHud?.({
      score: this.score, level: this.level, lives: this.lives, laps: this.laps,
      perfects: this.perfects, combo: this.combo, collected: this.collected, mult: this.mult, peel: this.peel,
    });
  }

  freeAngle(minFromBall = 1.1) {
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * TAU;
      if (angDist(a, this.ball.a) < minFromBall) continue;
      if (this.shards.some((s) => angDist(a, s.a) < s.half + 0.35)) continue;
      if (this.orbs.some((o) => angDist(a, o.a) < 0.35)) continue;
      return a;
    }
    return null;
  }

  update(dt) {
    this.t += dt;
    for (const r of this.ripples) { r.r += dt * (r.ring ? 40 : r.snap ? 160 : 110); r.life -= dt * (r.ring ? 1.1 : 0.9); }
    this.ripples = this.ripples.filter((r) => r.life > 0);
    for (const p of this.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; p.life -= dt * 0.7; }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const f of this.floaters) { f.y -= dt * 26; f.life -= dt * 0.8; }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    this.snapFlash = Math.max(0, (this.snapFlash || 0) - dt * 2.5);

    if (this.state === 'idle') { this.ball.a += dt * 0.6; this.pushTrail(); return; }
    if (this.state !== 'play') return;

    this.elapsed += dt;
    // gentle speed-up every 15s
    this.levelT += dt;
    if (this.levelT >= 15) {
      this.levelT = 0; this.level++; this.mult *= 1.06;
      sfx.levelUp(this.level);
      this.hooks.onToast?.(`tempo ${this.level}`);
      this.ripples.push({ x: this.cx, y: this.cy, r: this.R * 0.4, life: 1, hue: this.layerHue, ring: true });
      this.hud();
    }

    const b = this.ball;
    if (b.inv > 0) b.inv -= dt;
    if (!b.alive) {
      b.reform -= dt;
      if (b.reform <= 0) { b.alive = true; b.inv = 1.6; }
      return;
    }
    const w = this.base * this.mult * b.dir;
    b.a = (b.a + w * dt + TAU) % TAU;
    this.lapAcc += Math.abs(w * dt);
    if (this.lapAcc >= TAU) { this.lapAcc -= TAU; this.laps++; this.hud(); }
    this.pushTrail();

    // combo decay
    if (this.combo > 0) { this.comboT -= dt; if (this.comboT <= 0) { this.combo = 0; this.step = 0; this.hud(); } }

    // spawns
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.orbs.length < 3) {
      const a = this.freeAngle(0.9);
      if (a !== null) this.orbs.push({ a, born: this.t, hue: (this.layerHue + Math.random() * 160) % 360 });
      this.spawnT = 1.1 + Math.random() * 0.8;
    }
    const maxShards = Math.min(1 + Math.floor(this.level / 2), 5);
    this.shardT -= dt;
    if (this.shardT <= 0 && this.shards.length < maxShards) {
      const a = this.freeAngle(1.4);
      if (a !== null) this.shards.push({ a, half: 0.11 + Math.random() * 0.05, fade: 0, life: 7 + Math.random() * 4 });
      this.shardT = Math.max(1.2, 3.2 - this.level * 0.15);
    }
    for (const s of this.shards) { s.fade = Math.min(1, s.fade + dt / 0.9); s.life -= dt; }
    this.shards = this.shards.filter((s) => s.life > 0);

    // collisions
    const bx = this.cx + Math.cos(b.a) * this.R, by = this.cy + Math.sin(b.a) * this.R;
    const hitA = 13 / this.R;
    this.orbs = this.orbs.filter((o) => {
      if (angDist(o.a, b.a) > hitA + 0.03) return true;
      this.combo++; this.comboT = 2.6; this.step++;
      const pts = 10 * Math.min(this.combo, 8);
      this.addScore(pts, bx, by);
      sfx.orb(this.step); buzz(6);
      this.collected.push(o.hue);
      this.petals.push({
        a: ((o.a / TAU) * FOLD) % 1, r: Math.min(1, this.petals.length / 40 + Math.random() * 0.25),
        s: Math.min(1, 0.25 + this.combo / 8), hue: o.hue,
      });
      this.renderMandala();
      for (let i = 0; i < 14; i++) {
        const k = Math.random() * TAU, v = 30 + Math.random() * 70;
        this.parts.push({ x: bx, y: by, vx: Math.cos(k) * v, vy: Math.sin(k) * v, life: 1, hue: o.hue, s: 1.5 + Math.random() * 2 });
      }
      this.ripples.push({ x: bx, y: by, r: 6, life: 0.8, hue: o.hue });
      // peel the film a little
      this.peel += 1 / 18;
      if (this.peel >= 1) {
        this.peel = 0; this.layer++;
        sfx.peelDone();
        this.hooks.onToast?.('layer revealed');
        this.revealFlash = 1;
        this.layerHue = (this.layerHue + 70) % 360;
        this.prevArt = this.cloneArt();
        this.paintArt(this.layerHue);
      }
      return false;
    });
    this.revealFlash = Math.max(0, (this.revealFlash || 0) - dt * 0.7);

    if (b.inv <= 0) {
      for (const s of this.shards) {
        if (s.fade < 1) continue;
        if (angDist(s.a, b.a) < s.half + hitA * 0.6) { this.soften(bx, by); break; }
      }
    }
  }

  cloneArt() {
    const c = document.createElement('canvas'); c.width = this.artCanvas.width; c.height = this.artCanvas.height;
    c.getContext('2d').drawImage(this.artCanvas, 0, 0); return c;
  }

  soften(bx, by) {
    const b = this.ball;
    sfx.soften(); buzz(30);
    for (let i = 0; i < 40; i++) {
      const k = Math.random() * TAU, v = 20 + Math.random() * 90;
      this.parts.push({ x: bx, y: by, vx: Math.cos(k) * v, vy: Math.sin(k) * v, life: 1.4, hue: 30, s: 1 + Math.random() * 2.5 });
    }
    this.combo = 0; this.step = 0;
    this.shards = this.shards.filter((s) => angDist(s.a, b.a) > 0.9);
    if (this.mode === 'zen') { b.inv = 1.4; this.hud(); return; }
    this.lives--;
    this.hud();
    if (this.lives <= 0) { this.end(); return; }
    b.alive = false; b.reform = 1.3;
  }

  end() {
    this.state = 'over';
    sfx.padLevel(0.25);
    this.hooks.onEnd?.({ score: this.score, laps: this.laps, perfects: this.perfects, petals: this.petals.slice(), level: this.level, time: this.elapsed });
  }

  finishZen() { if (this.state === 'play') this.end(); }

  pushTrail() {
    this.trail.push({ a: this.ball.a, t: this.t });
    while (this.trail.length && this.t - this.trail[0].t > 0.45) this.trail.shift();
  }

  renderMandala() {
    const m = this.mandalaCanvas; const s = Math.ceil(this.R * 1.6 * this.dpr);
    m.width = m.height = s;
    const g = m.getContext('2d');
    drawMandala(g, this.petals, s / 2, s / 2, (s / 2) / 110);
  }

  draw() {
    const g = this.g, { w, h, cx, cy, R, dpr } = this;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // background
    const bg = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.75);
    bg.addColorStop(0, '#151821'); bg.addColorStop(1, '#090a0e');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);

    // peeled artwork (revealed wedge with curled edge)
    if (this.state !== 'idle') {
      const art = this.artCanvas, size = art.width / dpr;
      if (this.prevArt && this.revealFlash > 0) {
        g.globalAlpha = 0.55 + this.revealFlash * 0.4;
        g.drawImage(this.prevArt, cx - size / 2, cy - size / 2, size, size);
        g.globalAlpha = 1;
      }
      const ang = this.peelEase = lerp(this.peelEase || 0, this.peel * TAU, 0.08);
      if (ang > 0.01) {
        g.save();
        g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, size / 2, -Math.PI / 2, -Math.PI / 2 + ang); g.closePath(); g.clip();
        g.drawImage(art, cx - size / 2, cy - size / 2, size, size);
        g.restore();
        // the curling edge of the film
        const ea = -Math.PI / 2 + ang;
        const grd = g.createLinearGradient(cx, cy, cx + Math.cos(ea) * R * 1.2, cy + Math.sin(ea) * R * 1.2);
        grd.addColorStop(0, 'rgba(255,248,236,0)'); grd.addColorStop(1, 'rgba(255,248,236,.28)');
        g.strokeStyle = grd; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(ea) * R * 1.18, cy + Math.sin(ea) * R * 1.18); g.stroke();
      }
    }

    // mandala in the heart, slowly breathing
    if (this.petals.length) {
      const m = this.mandalaCanvas, s = m.width / dpr;
      const breathe = 1 + Math.sin(this.t * 0.8) * 0.015;
      g.save(); g.translate(cx, cy); g.rotate(reduced ? 0 : this.t * 0.05); g.scale(breathe, breathe);
      g.globalAlpha = this.state === 'over' ? 0.35 : 0.9;
      g.drawImage(m, -s / 2, -s / 2, s, s);
      g.restore(); g.globalAlpha = 1;
    }

    // ring
    g.lineWidth = 1.25;
    g.strokeStyle = `rgba(242,237,228,${0.14 + (this.snapFlash || 0) * 0.3})`;
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
    g.strokeStyle = 'rgba(242,237,228,.05)';
    g.beginPath(); g.arc(cx, cy, R + 14, 0, TAU); g.stroke();
    g.beginPath(); g.arc(cx, cy, R - 14, 0, TAU); g.stroke();

    // ripples
    for (const r of this.ripples) {
      g.strokeStyle = r.snap ? `rgba(255,230,170,${r.life * 0.7})` : `hsla(${r.hue},60%,80%,${r.life * 0.35})`;
      g.lineWidth = r.snap ? 2 : 1;
      g.beginPath(); g.arc(r.x, r.y, r.r, 0, TAU); g.stroke();
    }

    // shards — soft rounded arcs that fade in (telegraphed)
    for (const s of this.shards) {
      const a = Math.min(s.fade, Math.min(1, s.life / 0.8));
      const pulse = s.fade < 1 ? 0.35 + 0.25 * Math.sin(this.t * 10) : 1;
      g.lineCap = 'round';
      g.strokeStyle = `rgba(255,160,140,${a * 0.85 * pulse})`;
      g.lineWidth = s.fade < 1 ? 4 : 10;
      g.shadowColor = 'rgba(255,140,120,.55)'; g.shadowBlur = 14;
      g.beginPath(); g.arc(cx, cy, R, s.a - s.half, s.a + s.half); g.stroke();
      g.shadowBlur = 0;
    }

    // orbs — domino glow travels through them when on a combo
    this.orbs.forEach((o, i) => {
      const x = cx + Math.cos(o.a) * R, y = cy + Math.sin(o.a) * R;
      const grow = Math.min(1, (this.t - o.born) / 0.5);
      const chain = this.combo >= 2 ? 0.5 + 0.5 * Math.sin(this.t * 6 - i * 1.4) : 0.3;
      const r = (5 + chain * 2) * grow;
      const grd = g.createRadialGradient(x, y, 0, x, y, r * 4);
      grd.addColorStop(0, `hsla(${o.hue},80%,80%,.55)`); grd.addColorStop(1, `hsla(${o.hue},80%,60%,0)`);
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, r * 4, 0, TAU); g.fill();
      g.fillStyle = `hsl(${o.hue},75%,82%)`; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    });

    // particles
    for (const p of this.parts) {
      g.fillStyle = `hsla(${p.hue},70%,78%,${Math.min(1, p.life)})`;
      g.beginPath(); g.arc(p.x, p.y, p.s * Math.min(1, p.life), 0, TAU); g.fill();
    }

    // ball trail + ball
    const b = this.ball;
    if (b.alive) {
      for (let i = 1; i < this.trail.length; i++) {
        const p0 = this.trail[i - 1], p1 = this.trail[i];
        const k = i / this.trail.length;
        g.strokeStyle = `rgba(255,246,232,${k * 0.35})`; g.lineWidth = 2 + k * 5; g.lineCap = 'round';
        g.beginPath(); g.arc(cx, cy, R, p0.a, p1.a, signedAng(p0.a, p1.a) < 0); g.stroke();
      }
      const x = cx + Math.cos(b.a) * R, y = cy + Math.sin(b.a) * R;
      const blink = b.inv > 0 && this.state === 'play' ? 0.55 + 0.45 * Math.sin(this.t * 18) : 1;
      const grd = g.createRadialGradient(x, y, 0, x, y, 34);
      grd.addColorStop(0, `rgba(255,240,215,${0.5 * blink})`); grd.addColorStop(1, 'rgba(255,240,215,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, 34, 0, TAU); g.fill();
      g.fillStyle = `rgba(255,248,238,${blink})`; g.beginPath(); g.arc(x, y, 9, 0, TAU); g.fill();
    } else {
      // reforming: particles converge
      const x = cx + Math.cos(b.a) * R, y = cy + Math.sin(b.a) * R;
      const k = 1 - Math.max(0, b.reform) / 1.3;
      for (let i = 0; i < 10; i++) {
        const ang = i / 10 * TAU + this.t * 2, d = (1 - k) * 40;
        g.fillStyle = `rgba(255,246,232,${0.3 + k * 0.6})`;
        g.beginPath(); g.arc(x + Math.cos(ang) * d, y + Math.sin(ang) * d, 2, 0, TAU); g.fill();
      }
    }

    // floating labels
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
