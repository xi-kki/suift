import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
const srv = spawn('npx vite preview --port 4318 --strictPort', { shell: true });
await new Promise((r) => setTimeout(r, 2500));
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
const out = process.argv[2]; const errs = [];
for (const vp of [{ width: 1280, height: 800, n: 'desk' }, { width: 390, height: 844, n: 'mob', isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]) {
  const p = await b.newPage(); await p.setViewport(vp);
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:4318/suift/', { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 1500));
  await p.click('[data-mode="calm"]'); await new Promise((r) => setTimeout(r, 900));
  console.log(vp.n, 'how shown', await p.evaluate(() => !document.getElementById('how').hidden), 'overflowY', await p.evaluate(() => document.getElementById('how').scrollHeight > innerHeight));
  await p.screenshot({ path: `${out}/${vp.n}-how.png` });
  await p.click('#howGo'); await new Promise((r) => setTimeout(r, 1200));
  console.log(vp.n, 'playing', await p.evaluate(() => window.__game.state), 'toast', await p.evaluate(() => document.getElementById('toast').textContent));
  await p.screenshot({ path: `${out}/${vp.n}-coach.png` });
  await p.close();
}
console.log('ERRORS', errs.join('|') || 'none'); await b.close(); srv.kill(); process.exit(0);
