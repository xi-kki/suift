// Mandala built from collected orbs: each orb = one petal, mirrored N-fold.
export const FOLD = 8;

export function petalPath(p) {
  // p: { a (0..1 local angle), r (0..1 radius), s (size), hue }
  const ang = p.a * (Math.PI * 2 / FOLD);
  const r = 18 + p.r * 72;
  const x = Math.cos(ang) * r, y = Math.sin(ang) * r;
  const len = 8 + p.s * 18, w = 3 + p.s * 6;
  const ux = Math.cos(ang), uy = Math.sin(ang), vx = -uy, vy = ux;
  const tx = x + ux * len, ty = y + uy * len;
  const c1x = x + ux * len * 0.5 + vx * w, c1y = y + uy * len * 0.5 + vy * w;
  const c2x = x + ux * len * 0.5 - vx * w, c2y = y + uy * len * 0.5 - vy * w;
  return { x, y, tx, ty, c1x, c1y, c2x, c2y };
}

export function drawMandala(g, petals, cx, cy, scale, rot = 0, alpha = 1) {
  g.save();
  g.translate(cx, cy);
  g.rotate(rot);
  g.scale(scale, scale);
  g.globalCompositeOperation = 'lighter';
  for (let k = 0; k < FOLD; k++) {
    g.save();
    g.rotate((k * Math.PI * 2) / FOLD);
    for (const p of petals) {
      const q = petalPath(p);
      g.fillStyle = `hsla(${p.hue},70%,68%,${0.32 * alpha})`;
      g.strokeStyle = `hsla(${p.hue},80%,80%,${0.55 * alpha})`;
      g.lineWidth = 0.6;
      g.beginPath();
      g.moveTo(q.x, q.y);
      g.quadraticCurveTo(q.c1x, q.c1y, q.tx, q.ty);
      g.quadraticCurveTo(q.c2x, q.c2y, q.x, q.y);
      g.fill();
      g.stroke();
    }
    g.restore();
  }
  g.restore();
}

const f = (n) => Math.round(n * 10) / 10;

// Compact SVG data URI (one petal group, reused FOLD times via <use>).
export function mandalaSVG(petals, score) {
  const ps = petals.slice(-70);
  const paths = ps
    .map((p) => {
      const q = petalPath(p);
      return `<path d="M${f(q.x)} ${f(q.y)}Q${f(q.c1x)} ${f(q.c1y)} ${f(q.tx)} ${f(q.ty)}Q${f(q.c2x)} ${f(q.c2y)} ${f(q.x)} ${f(q.y)}" fill="hsl(${Math.round(p.hue)} 70% 68%/.35)" stroke="hsl(${Math.round(p.hue)} 80% 80%/.6)"/>`;
    })
    .join('');
  const uses = Array.from({ length: FOLD - 1 }, (_, k) => `<use href="#p" transform="rotate(${((k + 1) * 360) / FOLD})"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-120 -120 240 240"><rect x="-120" y="-120" width="240" height="240" fill="#0c0e13"/><circle r="104" fill="none" stroke="#f2ede4" stroke-opacity=".12"/><g stroke-width=".6" style="mix-blend-mode:screen"><g id="p">${paths}</g>${uses}</g><circle r="5" fill="#fff6e8"/><text y="114" text-anchor="middle" font-family="Georgia,serif" font-size="8" fill="#f2ede4" fill-opacity=".5">suift · ${score}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg).replace(/%20/g, ' ').replace(/%3D/g, '=').replace(/%3A/g, ':').replace(/%2F/g, '/').replace(/%22/g, "'");
}
