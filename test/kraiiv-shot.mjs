import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
const p = await b.newPage(); await p.setViewport({ width: 1366, height: 900 });
await p.goto('https://kraiiv.xyz', { waitUntil: 'networkidle2', timeout: 60000 });
const H = await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { scrollTo(0, y); await new Promise(r => setTimeout(r, 250)); } return document.body.scrollHeight; });
console.log('height', H);
const out = process.argv[2];
const n = Math.ceil(H / 900);
for (let i = Math.max(0, n - 7); i < n; i++) { await p.evaluate((y) => scrollTo(0, y), i * 900); await new Promise(r => setTimeout(r, 500)); await p.screenshot({ path: `${out}/k-${i}.png` }); }
console.log('shots', n, 'from', Math.max(0, n - 7));
const imgs = await p.evaluate(() => [...document.images].map(i => i.alt + '|' + i.src.split('/').pop()).slice(-30));
console.log(imgs.join('\n'));
await b.close();
