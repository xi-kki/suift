# Suift

**A calm orbit game on Sui.** Turn the light, gather the glow, peel back hidden art, and mint the mandala you draw.

▶ Play: https://xi-kki.github.io/suift/ (Sui testnet)

## How it plays
- Tap / Space to reverse the orbit. Gather orbs; avoid coral shards.
- Turn away just before a shard → **perfect fit** (snap sound, bonus).
- Tempo rises gently every 15s. Calm mode = 3 breaths; Zen = no ending.

## Oddly satisfying, by design
| Feeling | In Suift |
|---|---|
| Perfect fit | near-miss turn → low "thunk" + click + gold ripple |
| Peeling film | each orb peels the film off a hidden aurora, layer by layer |
| Ripples | every tap ripples from the ball and the ring |
| Colour sorting | collected hues settle into a sorted rainbow bar |
| Domino chain | combo makes orbs pulse in sequence; notes climb the scale |
| Always in key | all sound is generated in C-major pentatonic, no wrong notes |
| Symmetry | every orb adds a petal to an 8-fold mandala at the centre |
| Soft failure | the ball dissolves into particles and re-forms; no harsh game-over |

Haptics on mobile, `prefers-reduced-motion` respected, `M` mutes.

## On-chain (Sui testnet)
- Package: `0xf103b5b54a6de40e5efaa77a205e327776bd29e4be18cff76748fdee87e04701`
- Leaderboard (shared): `0x82b6ec776d4eb15fcfa1e11225c704d0f489e1f47810d43e936c237b7a1d5219`
- `submit_run` → keeps each player's best on a sorted top-20 board, emits `RunSubmitted`, returns a `Mandala` NFT (SVG on-chain, Display v2 via `display_registry`).
- Scores are client-reported (casual testnet game) and bounded by sanity checks.

## Dev
```
npm i && npm run dev          # game
cd move/suift && sui move test   # 6 Move tests
node test/chain.test.mjs <mandalaId>   # reads live board + NFT display
```
Stack: Vite, vanilla canvas, Web Audio, `@mysten/dapp-kit-core` (web components), `@mysten/sui` gRPC client, Move 2024.
