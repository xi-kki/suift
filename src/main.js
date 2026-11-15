import { Game } from './game.js';
import * as sfx from './audio.js';
import { mandalaSVG } from './mandala.js';
import * as chain from './chain.js';

const $ = (id) => document.getElementById(id);
const store = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};
const short = (a) => a.slice(0, 6) + '…' + a.slice(-4);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const screens = ['intro', 'how', 'over'];
const show = (id) => screens.forEach((s) => ($(s).hidden = s !== id));
const fmt = (t) => { const s = Math.max(0, Math.ceil(t)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

let toastT;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200);
}

let lastRun = null;
const game = new Game($('stage'), {
  onHud(h) {
    $('score').textContent = h.score;
    $('combo').textContent = h.combo >= 2 ? `×${Math.min(h.combo, 6)}` : '';
    $('timer').textContent = h.time === null ? 'zen' : fmt(h.time);
    $('timer').classList.toggle('low', h.time !== null && h.time < 10);
    $('tempo').textContent = `level ${h.level}`;
    const sorted = [...h.collected].sort((a, b) => a - b);
    const bar = $('sort');
    if (bar.childElementCount !== sorted.length) bar.innerHTML = sorted.map((hue) => `<i style="background:hsl(${hue} 70% 70%)"></i>`).join('');
  },
  onToast: toast,
  onEnd(run) {
    lastRun = run;
    $('hud').hidden = true;
    let n = run.petals.length, img = mandalaSVG(run.petals, run.score);
    while (img.length > 11500 && n > 5) { n -= 5; img = mandalaSVG(run.petals.slice(-n), run.score); }
    run.image = img;
    $('mandala').src = img;
    $('oScore').textContent = run.score;
    $('oLaps').textContent = run.laps;
    $('oPerf').textContent = run.perfects;
    const best = Number(store.get('suift.best', 0));
    $('overEyebrow').textContent = run.score > best ? 'time\x27s up · new best!' : 'time\x27s up';
    if (run.score > best) store.set('suift.best', run.score);
    const mint = $('mint'); mint.disabled = run.score <= 0; mint.hidden = false;
    setNote(run.score > 0 ? 'Saves your art and score on Sui. Free test coins: <a href="https://faucet.sui.io" target="_blank" rel="noopener">faucet.sui.io</a>' : 'Pass one ring to save your art.');
    show('over');
    setTimeout(() => $('again').focus(), 50);
  },
});
window.__game = game;

function setNote(html, cls = '') { const n = $('mintNote'); n.innerHTML = html; n.className = 'note ' + cls; }

// ---------- wallet gate ----------
let addr = null;
function renderWallet() {
  addr = chain.account();
  $('walletChip').textContent = addr ? short(addr) : 'Connect wallet';
  $('walletChip').classList.toggle('on', !!addr);
  $('gateConnect').hidden = !!addr;
  $('modes').hidden = !addr;
  $('gateNote').innerHTML = addr
    ? `Ready, ${short(addr)}`
    : 'At the end, you can save your art on Sui.';
}
chain.onAccount(renderWallet);

function openPicker() {
  const list = chain.wallets();
  $('pickerErr').textContent = '';
  $('pickerList').innerHTML = list.length
    ? list.map((w, i) => `<li><button data-w="${i}"><img src="${esc(w.icon)}" alt="" width="32" height="32"/><span>${esc(w.name)}</span></button></li>`).join('')
    : '<li class="none">No wallet found.</li>';
  $('picker').hidden = false;
  $('pickerList').querySelector('button')?.focus();
}
const closePicker = () => ($('picker').hidden = true);
chain.onWallets(() => { if (!$('picker').hidden) openPicker(); });

$('pickerList').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-w]');
  if (!btn) return;
  const w = chain.wallets()[Number(btn.dataset.w)];
  $('pickerErr').className = 'picker-msg';
  $('pickerErr').textContent = `Opening ${w.name}… say yes in your wallet.`;
  try {
    await chain.connect(w);
    closePicker();
    toast('connected');
  } catch (err) {
    console.error('connect failed', err);
    const msg = String(err?.message || err);
    $('pickerErr').className = 'picker-msg err';
    $('pickerErr').textContent = /reject|denied|cancel|closed/i.test(msg)
      ? 'You said no in the wallet. Try again any time.'
      : /popup/i.test(msg) ? 'Your browser blocked the wallet window. Allow pop-ups, then try again.'
      : `Could not connect: ${msg.slice(0, 160)}`;
  }
});
$('pickerClose').addEventListener('click', closePicker);
$('picker').addEventListener('click', (e) => { if (e.target.id === 'picker') closePicker(); });
$('gateConnect').addEventListener('click', (e) => { e.stopPropagation(); openPicker(); });
$('walletChip').addEventListener('click', (e) => {
  e.stopPropagation();
  if (!addr) return openPicker();
  $('walletMenu').hidden = !$('walletMenu').hidden;
});
$('disconnect').addEventListener('click', async (e) => {
  e.stopPropagation(); $('walletMenu').hidden = true;
  await chain.disconnect(); toast('wallet disconnected');
});
document.addEventListener('click', () => ($('walletMenu').hidden = true));

// ---------- flow ----------
function begin(mode) {
  if (!chain.account()) { show('intro'); openPicker(); return; }
  if (store.get('suift.seenHow', '0') !== '1') { showHow(mode); return; }
  sfx.initAudio();
  show(null);
  $('board').hidden = true;
  $('hud').hidden = false;
  $('zenEnd').hidden = mode !== 'zen';
  game.start(mode);
  store.set('suift.mode', mode);
  coach();
}

let howMode = 'calm';
function showHow(mode = 'calm') {
  howMode = mode;
  $('board').hidden = true;
  $('howGo').innerHTML = mode === 'zen' ? 'Relax' : 'Play';
  show('how');
}
$('openHow').addEventListener('click', (e) => { e.stopPropagation(); showHow(); });
$('howBack').addEventListener('click', (e) => { e.stopPropagation(); show('intro'); });
$('howGo').addEventListener('click', (e) => { e.stopPropagation(); store.set('suift.seenHow', '1'); begin(howMode); });

function coach() {
  const runs = Number(store.get('suift.runs', 0)); store.set('suift.runs', runs + 1);
  if (runs >= 2) return;
  [[500, 'tap when the gap turns gold'], [5000, 'get to the middle'], [10000, 'beat the clock']]
    .forEach(([t, msg]) => setTimeout(() => game.state === 'play' && toast(msg), t));
}

document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); begin(b.dataset.mode); }));
$('again').addEventListener('click', (e) => { e.stopPropagation(); begin(store.get('suift.mode', 'calm')); });
$('menu').addEventListener('click', (e) => { e.stopPropagation(); game.idle(); show('intro'); });
$('zenEnd').addEventListener('click', (e) => { e.stopPropagation(); game.finishZen(); });

// input: tap anywhere on the stage
addEventListener('pointerdown', (e) => {
  if (game.state !== 'play') return;
  if (e.target.closest?.('button, input, a, .board, .picker')) return;
  e.preventDefault();
  game.tap();
}, { passive: false });
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Escape') closePicker();
  if (e.code === 'Space' || e.code === 'Enter') {
    if (game.state === 'play') { e.preventDefault(); game.tap(); }
    else if (!$('over').hidden && e.code === 'Space') { e.preventDefault(); begin(store.get('suift.mode', 'calm')); }
  }
  if (e.code === 'KeyM') toggleMute();
});

function toggleMute() {
  const m = !sfx.isMuted(); sfx.setMuted(m);
  $('mute').classList.toggle('muted', m); store.set('suift.muted', m ? '1' : '0');
}
$('mute').addEventListener('click', (e) => { e.stopPropagation(); toggleMute(); });
if (store.get('suift.muted', '0') === '1') { sfx.setMuted(true); $('mute').classList.add('muted'); }

const nameEl = $('name');
nameEl.value = store.get('suift.name', '');
nameEl.addEventListener('input', () => store.set('suift.name', nameEl.value));
document.addEventListener('visibilitychange', () => { if (document.hidden) sfx.padLevel(0); else if (game.state === 'play') sfx.padLevel(0.55); });

// ---------- leaderboard ----------
async function renderBoard() {
  $('boardSub').textContent = 'reading the chain…';
  try {
    const b = await chain.fetchBoard();
    const me = chain.account();
    $('boardSub').textContent = `${b.total} game${b.total === 1 ? '' : 's'} saved`;
    $('boardList').innerHTML = b.entries.length
      ? b.entries.map((e) => `<li class="${e.player === me ? 'me' : ''}"><span class="who">${esc(e.name || 'unnamed')}<small>${short(e.player)} · level ${e.laps} · ${e.perfects} perfect</small></span><span class="pts">${e.score}</span></li>`).join('')
      : '<li class="empty"><span class="who">No one yet. Be the first!</span></li>';
  } catch (err) {
    console.error(err);
    $('boardSub').textContent = 'Could not reach Sui testnet. Try again shortly.';
  }
}
$('openBoard').addEventListener('click', (e) => { e.stopPropagation(); $('board').hidden = false; renderBoard(); });
$('closeBoard').addEventListener('click', (e) => { e.stopPropagation(); $('board').hidden = true; });

$('mint').addEventListener('click', async (e) => {
  e.stopPropagation();
  if (!lastRun) return;
  if (!chain.account()) { openPicker(); return; }
  const btn = $('mint'); btn.disabled = true;
  setNote('Say yes in your wallet…');
  try {
    const digest = await chain.submitRun({
      name: (nameEl.value || 'unnamed').trim(),
      score: lastRun.score, laps: lastRun.laps, perfects: lastRun.perfects, image: lastRun.image,
    });
    setNote(`Saved! · <a href="${chain.txUrl(digest)}" target="_blank" rel="noopener">see it</a>`, 'ok');
    sfx.peelDone();
    btn.hidden = true; lastRun = null;
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    const msg = String(err?.message || err);
    setNote(/reject|denied|cancel/i.test(msg) ? 'You said no. Your art is still here.'
      : /gas|balance|insufficient/i.test(msg) ? 'Not enough test coins. Get free ones at <a href="https://faucet.sui.io" target="_blank" rel="noopener">faucet.sui.io</a>, then retry.'
      : `Could not save: ${esc(msg).slice(0, 160)}`, 'err');
  }
});

renderWallet();
