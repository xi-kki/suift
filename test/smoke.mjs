import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
const srv = spawn('npx', ['vite', 'preview', '--port', '4317', '--strictPort'], { shell: true });
await new Promise((r) => setTimeout(r, 2500));
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--autoplay-policy=no-user-gesture-required'] });
const out = process.argv[2] || 'test';
const errs = [];
for (const vp of [{ width: 1280, height: 800, n: 'desk' }, { width: 390, height: 844, n: 'mob', isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]) {
  const p = await browser.newPage();
  p.on('pageerror', (e) => errs.push(vp.n + ' pageerror ' + e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push(vp.n + ' console ' + m.text()));
  await p.setViewport(vp);
  const t0 = Date.now();
  await p.goto('http://localhost:4317/suift/', { waitUntil: 'networkidle0' });
  console.log(vp.n, 'load ms', Date.now() - t0);
  await p.screenshot({ path: `${out}/${vp.n}-intro.png` });
  await p.click('[data-mode="calm"]');
  // play: tap every 700ms for 20s
  for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 3000)); await p.keyboard.press("Space"); }
  await p.screenshot({ path: `${out}/${vp.n}-play.png` });
  const st = await p.evaluate(() => ({ score: document.getElementById('score').textContent, tempo: document.getElementById('tempo').textContent, lives: document.getElementById('lives').textContent, over: !document.getElementById('over').hidden }));
  console.log(vp.n, JSON.stringify(st));
  // force end and check mandala
  await p.evaluate(() => window.__game?.end());
  await new Promise((r) => setTimeout(r, 1800));
  const img = await p.evaluate(() => ({ len: document.getElementById('mandala').src.length, over: !document.getElementById('over').hidden }));
  console.log(vp.n, 'end', JSON.stringify(img));
  await p.screenshot({ path: `${out}/${vp.n}-over.png` });
  await p.evaluate(() => document.getElementById('openBoard').click());
  await p.evaluate(() => { document.getElementById('over').hidden = true; document.getElementById('board').hidden = false; document.getElementById('openBoard').click(); });
  await new Promise((r) => setTimeout(r, 4000));
  console.log(vp.n, 'board', await p.evaluate(() => document.getElementById('boardSub').textContent));
  await p.screenshot({ path: `${out}/${vp.n}-board.png` });
  const ow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  console.log(vp.n, 'overflowX', ow);
  await p.close();
}
console.log('ERRORS', errs.length ? errs.join('\n') : 'none');
await browser.close(); srv.kill(); process.exit(0);
