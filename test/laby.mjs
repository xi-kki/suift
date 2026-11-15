import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
const srv = spawn('npx vite preview --port 4319 --strictPort', { shell: true });
await new Promise((r) => setTimeout(r, 2500));
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
const out = process.argv[2]; const errs = [];
for (const vp of [{ width: 1280, height: 800, n: 'desk' }, { width: 390, height: 844, n: 'mob', isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]) {
  const p = await b.newPage(); await p.setViewport(vp);
  p.on('pageerror', (e) => errs.push(vp.n + ' ' + e.message));
  p.on('console', (m) => m.type() === 'error' && !/slush|ERR_FAILED|metadata/i.test(m.text()) && errs.push(vp.n + ' ' + m.text()));
  await p.goto('http://localhost:4319/suift/', { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 1500));
  await p.screenshot({ path: `${out}/${vp.n}-gate.png` });
  await p.click('#gateConnect'); await new Promise((r) => setTimeout(r, 600));
  console.log(vp.n, 'picker:', await p.evaluate(() => document.getElementById('pickerList').innerText.replace(/\n/g, ',')));
  await p.screenshot({ path: `${out}/${vp.n}-picker.png` });
  await p.evaluate(() => { document.getElementById('picker').hidden = true; document.getElementById('intro').hidden = true; document.getElementById('hud').hidden = false; window.__game.start('calm'); });
  // smart bot: tap when aligned (sometimes early to test bumps)
  await p.evaluate(() => { const g = window.__game; window.__bot = setInterval(() => { if (g.state === 'play' && g.aligned && !g.ball.drop && Math.random() < 0.5) g.tap(); }, 40); });
  await new Promise((r) => setTimeout(r, 9000));
  await p.screenshot({ path: `${out}/${vp.n}-laby.png` });
  await new Promise((r) => setTimeout(r, 16000));
  console.log(vp.n, JSON.stringify(await p.evaluate(() => { const g = window.__game; return { state: g.state, level: g.level, score: g.score, perfects: g.perfects, time: Math.round(g.timeLeft), rings: g.maze.rings, timer: document.getElementById('timer').textContent }; })));
  await p.screenshot({ path: `${out}/${vp.n}-laby2.png` });
  await p.close();
}
console.log('ERRORS', errs.join('|') || 'none'); await b.close(); srv.kill(); process.exit(0);
