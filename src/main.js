import { Game } from './game.js';
import * as sfx from './audio.js';
import { mandalaSVG } from './mandala.js';

const $ = (id) => document.getElementById(id);
const store = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

let toastT;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2400);
}

let lastRun = null;
const game = new Game($('stage'), {
  onHud(h) {
    $('score').textContent = h.score;
    $('combo').textContent = h.combo >= 2 ? `×${Math.min(h.combo, 8)}` : '';
    $('lives').textContent = h.lives === Infinity ? 'zen' : '●'.repeat(h.lives) + '○'.repeat(Math.max(0, 3 - h.lives));
    $('tempo').textContent = `tempo ${h.level}`;
    // colour sort: collected hues settle into a rainbow
    const sorted = [...h.collected].sort((a, b) => a - b);
    const bar = $('sort');
    if (bar.childElementCount !== sorted.length) {
      bar.innerHTML = sorted.map((hue) => `<i style="background:hsl(${hue} 70% 70%)"></i>`).join('');
    }
  },
  onToast: toast,
  onEnd(run) {
    lastRun = run;
    $('hud').hidden = true;
    $('zenEnd').hidden = true;
    let n = run.petals.length, img = mandalaSVG(run.petals, run.score);
    while (img.length > 11500 && n > 5) { n -= 5; img = mandalaSVG(run.petals.slice(-n), run.score); }
    run.image = img;
    $('mandala').src = img;
    $('oScore').textContent = run.score;
    $('oLaps').textContent = run.laps;
    $('oPerf').textContent = run.perfects;
    $('overEyebrow').textContent = run.score > Number(store.get('suift.best', 0)) ? 'a new stillness · personal best' : 'your orbit';
    if (run.score > Number(store.get('suift.best', 0))) store.set('suift.best', run.score);
    const mint = $('mint'); mint.disabled = run.score <= 0; mint.hidden = false;
    setNote(run.score > 0 ? 'Testnet · one signature · free test SUI from <a href="https://faucet.sui.io" target="_blank" rel="noopener">faucet.sui.io</a>' : 'Gather at least one glow to mint a mandala.');
    $('over').hidden = false;
  },
});

window.__game = game;

function setNote(html, cls = '') { const n = $('mintNote'); n.innerHTML = html; n.className = 'note ' + cls; }

function begin(mode) {
  // first visit: show rules once before the first run
  if (store.get('suift.seenHow', '0') !== '1') { showHow(mode); return; }
  sfx.initAudio();
  $('how').hidden = true;
  $('intro').hidden = true; $('over').hidden = true; $('board').hidden = true;
  $('hud').hidden = false;
  $('zenEnd').hidden = mode !== 'zen';
  game.start(mode);
  store.set('suift.mode', mode);
  coach(mode);
}

document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); begin(b.dataset.mode); }));
$('again').addEventListener('click', (e) => { e.stopPropagation(); begin(store.get('suift.mode', 'calm')); });
$('zenEnd').addEventListener('click', (e) => { e.stopPropagation(); game.finishZen(); });

// input: anywhere on stage
const turn = (e) => {
  if (game.state !== 'play') return;
  if (e.target.closest && e.target.closest('button, input, a, mysten-dapp-kit-connect-button, .board')) return;
  e.preventDefault();
  game.tap();
};
addEventListener('pointerdown', turn, { passive: false });
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
    e.preventDefault();
    if (game.state === 'play') game.tap();
    else if (!$('intro').hidden && e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') begin('calm');
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

// pause audio-heavy loop feel when hidden
document.addEventListener('visibilitychange', () => { if (document.hidden) sfx.padLevel(0); else if (game.state === 'play') sfx.padLevel(0.55); });

// ---- chain (lazy: game is fully playable before the wallet SDK loads) ----
let chain;
const loadChain = () => (chain ??= import('./chain.js').then((m) => {
  // create the web component only once the kit exists (it reads .instance on connect)
  const btn = document.createElement('mysten-dapp-kit-connect-button');
  btn.id = 'connect';
  btn.instance = m.dAppKit;
  btn.innerHTML = '<span>Connect</span>';
  $('connectSlot').replaceWith(btn);
  m.onAccount(() => { if (!$('board').hidden) renderBoard(); });
  return m;
}));
(window.requestIdleCallback || setTimeout)(() => loadChain());

const short = (a) => a.slice(0, 6) + '…' + a.slice(-4);
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function renderBoard() {
  const m = await loadChain();
  $('boardSub').textContent = 'reading the chain…';
  try {
    const b = await m.fetchBoard();
    const me = m.account();
    $('boardSub').textContent = `${b.total} orbit${b.total === 1 ? '' : 's'} traced on Sui testnet`;
    $('boardList').innerHTML = b.entries.length
      ? b.entries.map((e) => `<li class="${e.player === me ? 'me' : ''}"><span class="who">${esc(e.name || 'unnamed')}<small>${short(e.player)} · ${e.laps} laps · ${e.perfects} perfect</small></span><span class="pts">${e.score}</span></li>`).join('')
      : '<li class="empty"><span class="who">No orbits yet. Be the first stillness.</span></li>';
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
  const m = await loadChain();
  if (!m.account()) {
    setNote('Connect a Sui wallet (top right) to mint. Testnet only.', 'err');
    $('connect').shadowRoot?.querySelector('button')?.click();
    return;
  }
  const btn = $('mint'); btn.disabled = true;
  setNote('Waiting for your signature…');
  try {
    const digest = await m.submitRun({
      name: (nameEl.value || 'unnamed').trim(),
      score: lastRun.score, laps: lastRun.laps, perfects: lastRun.perfects, image: lastRun.image,
    });
    setNote(`Minted. Your mandala lives on Sui · <a href="${m.txUrl(digest)}" target="_blank" rel="noopener">view transaction</a>`, 'ok');
    sfx.peelDone();
    btn.hidden = true;
    lastRun = null;
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    const msg = String(err?.message || err);
    setNote(/reject|denied|cancel/i.test(msg) ? 'Signature cancelled. Your mandala is still here.' : `Could not mint: ${esc(msg).slice(0, 140)}`, 'err');
  }
});

// ---- how to play ----
let howMode = 'calm';
function showHow(mode = 'calm') {
  howMode = mode;
  $('intro').hidden = true; $('board').hidden = true;
  $('howGo').innerHTML = mode === 'zen' ? 'Begin <span>zen</span>' : 'Begin <span>three breaths</span>';
  $('how').hidden = false;
}
$('openHow').addEventListener('click', (e) => { e.stopPropagation(); showHow(); });
$('howBack').addEventListener('click', (e) => { e.stopPropagation(); $('how').hidden = true; $('intro').hidden = false; });
$('howGo').addEventListener('click', (e) => { e.stopPropagation(); store.set('suift.seenHow', '1'); begin(howMode); });

// in-game coaching for the first runs: short, timed, then never again
function coach(mode) {
  const runs = Number(store.get('suift.runs', 0)); store.set('suift.runs', runs + 1);
  if (runs >= 2) return;
  const tips = [[600, 'tap to turn'], [4500, 'pass through the glow'], [9000, 'coral blinks, then settles'], [14000, 'turn just before coral: perfect fit']];
  tips.forEach(([t, msg]) => setTimeout(() => { if (game.state === 'play' && game.mode === mode) toast(msg); }, t));
}
