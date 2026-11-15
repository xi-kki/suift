import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
const url = process.argv[3] || null;
const srv = url ? null : spawn('npx vite preview --port 4320 --strictPort', { shell: true });
if (srv) await new Promise((r) => setTimeout(r, 2500));
const target = url || 'http://localhost:4320/suift/';
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
const errs = [];
for (const vp of [{ width: 1280, height: 800, n: 'desk' }, { width: 390, height: 844, n: 'mob', isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]) {
  const ctx = await b.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport(vp);
  p.on('pageerror', (e) => errs.push(vp.n + ' ' + e.message));
  p.on('console', (m) => m.type() === 'error' && !/slush|ERR_FAILED|metadata/i.test(m.text()) && errs.push(vp.n + ' ' + m.text()));
  await p.goto(target, { waitUntil: 'domcontentloaded' }); await new Promise((r) => setTimeout(r, 2000));
  // real user path: click Play -> rules -> Play, then real taps (no __game access)
  await p.click('[data-mode="calm"]'); await new Promise((r) => setTimeout(r, 800));
  const how = await p.evaluate(() => !document.getElementById('how').hidden);
  if (how) { await p.click('#howGo'); await new Promise((r) => setTimeout(r, 800)); }
  const playing = await p.evaluate(() => !document.getElementById('hud').hidden);
  for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 300)); if (vp.isMobile) await p.touchscreen.tap(195, 420); else await p.mouse.click(640, 400); }
  const st = await p.evaluate(() => ({ score: document.getElementById('score').textContent, timer: document.getElementById('timer').textContent, level: document.getElementById('tempo').textContent }));
  console.log(vp.n, 'rulesShown', how, 'playing', playing, JSON.stringify(st));
  await p.screenshot({ path: process.argv[2] + `/real-${vp.n}.png` });
  await ctx.close();
}
console.log('ERRORS', errs.join('|') || 'none'); await b.close(); srv?.kill(); process.exit(0);
