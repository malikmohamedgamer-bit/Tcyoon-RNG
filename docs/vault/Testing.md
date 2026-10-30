---
tags: [testing, verification]
date: 2026-10-30
status: final numbers recorded 23:0x UTC; see Open Issues for gaps
---
# Testing
Every command, what it proves, and what could not be verified. Repo copies: README "Testing", `VERIFICATION.md`. Back to [[00 Start Here]].

## Commands and latest real results
| Command | Proves | Latest result |
|---|---|---|
| `npm run lint` (`eslint .`) | style and obvious errors; ignores `.site-e2e/**`, `_site/**` | clean (`.scratch/lint-final.out`) |
| `npm test` (`node --test`) | pure logic: bignum, rng, save, tiers, items, production, rebirth, combat, offline, tutorial, difficulty, tips, speed, explain, undo, disclosure, glossary, icons, a11y, index, reveal, updates, stamp | **304 tests, 304 pass, 0 fail** |
| `npx playwright test --grep-invert soak` | real browser behaviour (headless Chromium, SwiftShader WebGL): all milestones, design/contrast checks, tutorial walk, Index, reveals, staged sub-path site, UI-only new-player run | **114 passed (5.7 min)** |
| `SOAK_MINUTES=5 npx playwright test e2e/soak.spec.js` | no errors, no NaN text, bounded heap/GPU/DOM, frame loop alive under random input including rolls, reveals, Index, Help; plus long-numbers soak | see below, **2 passed (5.5 min)** |
| `npm run sim:economy -- --quick` / `--days 30` | scripted bot: no stall, no skippable layer, no obvious exploit, rolling pays, timing bounds, finite numbers | 8/8 PASS (30 days: final level 7,680,949, 7 layers; run before the last level-cap change, not re-run) |
| `npm run sim:combat -- --quick` | tier-t build beats wave ~3t, loses before 3t+18, bosses in band, finite numbers, manual >= auto | 6/6 PASS |
| `--difficulty relaxed` on both | Relaxed passes every check; Relaxed easier but not trivial | PASS; third layer 9% sooner (5 h 56 m vs 6 h 30 m) |
| `npm run smoke:live` (`LIVE_URL=...`) | the deployed site works | **never run against the real URL** |
| GitHub Actions run 1 on `main` | CI on a clean runner | test success, e2e success, deploy failed (setup), smoke-live skipped ([[Deploy]]) |

## Soak results (the three F9 runs and the original)
* Original M9 soak: 1,614 actions, heap 5.4 to 10.3 MB, GPU 21/2/6 to 68/6/10, DOM 99-686, level 20 / region 20.
* F9 run 1: failed on my own assertion (reveal DOM 136 > 120, bug #42). Run 2: all real assertions passed (1,540 actions, heap 6.8 to 11.3 MB), failed only on my same-task DOM count.
* **F9 run 3 (final, PASS):** 1,512 actions in 5 min, 21 samples. Heap MB `7.0 9.1 9.5 9.7 10.0 10.2 10.3 10.4 10.5 10.8 10.8 10.8 10.9 11.1 11.3 11.2 11.4 11.2 11.1 11.3 11.2` (flattens). DOM nodes 240 to 1192. Geometries/textures/programs `21/2/6` to `69/6/12` and flat from sample 13. Level 23, region 18 at end. Reveal DOM nodes `3 21 23 133 19 3 66 3 29 134 23 8 43 118 130 31 43 30 3 3 23` (< 200, empties to < 10 when idle). 0 console errors, no NaN/Infinity text, frame counter strictly increasing.
* Heap caveat: a small rise over 5 minutes is not proof of 'no leak'.

## What each e2e spec family covers
`m1-smoke`, `m2-rolling`, `m3-placement` (9), `m4-levels`, `m5-rebirth`, `m6-shop-rewards-offline`, `m7-combat`, `m8-customization-a11y` (16), `f1-tutorial`, `f2-tutorial-walk` (16 steps by real clicks), `f3-clarity`, `f4-speed`, `f5-design` (no emoji, no external request, contrast, focus ring, 44 px, no overflow, 160% text), `f6-index` (virtualisation 20,000), `f7-reveal` (12), `f9-new-player` (UI only to the first rebirth; repeat-each=3 passed in 2.1 min), `subpath`, `soak`, `live/smoke` (not in the default run).

## Could not be verified
* **Real GPUs and frame rates** (SwiftShader only). **Phones/tablets** (emulation only). **Firefox/Safari** (only Chromium). **Screen readers** (live regions exist and are throttled; nothing listened to). **Audible sound** (synthesised, captioned, never heard). **Taste and fun** (my judgement; simulators prove structure only).
* **The live URL**: never fetched. **Pages deploy**: blocked by settings.
* Long-term (> 5 min) soak, concurrent tabs, clock moved forward (bounded only by the 10-year clamp).
