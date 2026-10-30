# Verification

What was checked, how, and what the result was. Everything marked **PASS** below was run in this repository on the final code
(output copied from the runs; commands are in the README). Anything I could not check is listed under
[What could not be verified](#what-could-not-be-verified) and in the [requirements review](#requirements-review).

## Final run (one command chain on the final commit)

| Check | Command | Result |
|---|---|---|
| Lint | `npx eslint .` | no findings |
| Unit tests | `npm test` | 217 tests, 217 pass, 0 fail |
| End-to-end | `npx playwright test` | 56 passed (headless Chromium, SwiftShader WebGL, ~1.3 min) |
| Combat simulator | `npm run sim:combat -- --quick` | 6/6 checks PASS |
| Economy simulator | `npm run sim:economy -- --quick` | 8/8 checks PASS (1 simulated day, bot) |
| Economy simulator, long | `npm run sim:economy -- --days 30` | 8/8 checks PASS, run earlier in the session (see note) |
| Random-input soak | `SOAK_MINUTES=5 npx playwright test e2e/soak.spec.js -g random-input` | PASS (5.1 min) |
| Long-numbers soak | `npx playwright test e2e/soak.spec.js -g long-numbers` | PASS (16 s) |

Note on the long simulator runs: the 5-day run (earlier milestone) and the 30-day run were started before the final `MAX_LEVEL` change in `sim/leveling.js`.
That change only affects levels above 10^12 (the 30-day run ended at level 7,680,949), so I expect identical results, but I did not
re-run the 30-day simulation after it; the `--quick` run above is on the final code.

## Simulator results (what they "prove", and what they do not)

**Economy** (`scripts/simulate-economy.js`, scripted bot, real simulation code, seed 1). 30 simulated days:
first prestige of layer 1 after 10 min, layer 2 at 50 min (4 layer-0 rebirths), layer 3 at 7 h 7 m, layer 4 at 22 h 12 m, layer 5 at 4 d 5 h, layer 6 at 14 d 17 h;
final level 7,680,949, 7 layers, all numbers finite. Checks: (1) no stalled 6 h window, (2a) layer 1 cannot be reached with fewer than 3 layer-0 rebirths,
(2b) spamming the minimum prestige is worse than playing (peak income 10^4.8 vs 10^29.9), (2c) never prestiging is worse (10^7.2 vs 10^29.9 after 1.5 days),
(3) paid rolling beats never rolling by at least 10x at every checkpoint, (4a/4b) first rebirth within 3-60 min and gaps within 30 s-6 h, (5) finite numbers.
These hold *for the scripted bot*. They show the economy has no stall, no skippable layer and no obvious exploit that the bot finds; they do not show the
game is fun or that a human cannot find another exploit. The simulator already found and I fixed six exploits/runaways (BUGS.md #13-16, #19-20).

**Combat** (`scripts/simulate-combat.js`): a tier-t build beats wave 3t (minimum margin 3 waves) and loses before wave 3t+18 (maximum overshoot 9), the beatable wave is
monotone in tier, bosses 0-4 are beatable at tier(wave)+2 and not at tier(wave)-4, hp and numbers stay finite at wave 10^8 / boss 10^6, manual play is never worse than auto and beats waves auto cannot.

## Soak test results (5 minutes, `e2e/soak.spec.js`)

1,614 random actions (panel keys, game keys, random button clicks, canvas clicks, rolls of 1/10/100, money grants, simulated fast-forwards of 5-600 s, quality switches, arena rushes, prestiges), seed fixed.
Sampled every 15 s (21 samples), `gc()` forced before each heap sample:

* console errors / page errors: **0**; text on screen containing NaN / Infinity / undefined / [object: **none** in any sample; the frame counter strictly increased between all samples (loop alive).
* JS heap: 5.4 MB at start, 10.3 MB at the end, rising slowly and flattening (10.0 → 10.3 MB over the last 4 minutes). **This is not proof of "no leak"**: it is a small slow rise over 5 minutes; a leak of a few KB per minute would not be visible. The assertion only requires the median of the second half to be less than 40 MB above the first half.
* GPU resources (geometries / textures / programs): 21/2/6 at the start, plateau at 68/6/10 from minute ~4 (growth comes from new item shapes, enemy pools and region themes the random play unlocks; it stopped growing). Assertion: bounded below 3× the early value + 60.
* DOM nodes: between 99 and 686, no upward trend.
* The run reached region 20 (20 prestiges) and level 20.

The test is the weakest link where the machine is slow: the run was executed while the 30-day economy simulation was using another CPU core.

**Long-numbers soak:** money and several prestige currencies set to towers (10^^4 – 10^^6), level 500, 12 items of tiers 3000-8500; all 9 panels opened under each of the 3 number formats with 5 simulated seconds between;
no NaN / Infinity / undefined / [object text anywhere; then 600 simulated seconds, save, export (`TRNG1.…`), reload: the game keeps running. **This test found a real freeze** (BUGS.md #29, fixed and covered by unit tests).

## Feature table

| Feature | How tested | Result | Notes |
|---|---|---|---|
| Big numbers (layers, towers, NaN/0, JSON, formats) | `tests/bignum.test.js`; long-numbers soak | PASS | MAX saturates instead of Infinity |
| Seeded RNG, save/restore, fork | `tests/rng.test.js` | PASS | |
| Save: version, migration v1→v2, corrupt backup, export/import, memory fallback | `tests/save.test.js`, `tests/migration.test.js` (fixture), e2e save + reload tests, e2e export/import | PASS | storage failures (throwing `setItem`, blocked `localStorage`) are simulated with mocks, not a real full disk |
| Fixed-step loop, pause, game speed | e2e pause test; unit | PASS | |
| 3D scene renders, pixel render target, pixel size | `m1-smoke` (non-blank canvas, resolution changes) + screenshots | PASS | judged on SwiftShader only |
| Rolling odds, luck, pity, free rolls, x10/x100/auto | `tests/tiers.test.js`, `tests/inventory.test.js`, `m2-rolling`, `m4-levels` (auto-roll) | PASS | |
| Endless tiers / rarity names / colours | `tests/tiers.test.js`, `tests/gen.test.js` | PASS | colour-blind safety = Okabe–Ito palette + name + icon; not checked with real colour-blind users |
| 8 item types, variants, hybrids, mutations | `tests/items.test.js`, `tests/shapes.test.js`, `tests/gen.test.js` | PASS | |
| Backpack limit, sell, fuse | `m2-rolling` (limit message, sell, fuse) | PASS | |
| Placement: raycast, ghost, validity, rotate, move/swap, presets, expand | `m3-placement` (9 tests) | PASS | real mouse events on the canvas |
| Production flow, blocked items, exact attribution | `tests/production.test.js` | PASS | the flow solver is exact for the steady state; I did not cross-check it against a tick-by-tick simulation (offline progress is, see below) |
| Refiners / refinery ops | `tests/refiners.test.js` | PASS | |
| Levels, mass level-ups, exactly-once rewards | `tests/leveling.test.js`, `tests/rewards.test.js` (incl. no-money-printing proof), `m4-levels` | PASS | level cap 10^12 |
| Rebirth + endless prestige layers + trees + theme per region | `tests/rebirth.test.js`, `tests/gen.test.js`, `m5-rebirth`, economy simulator | PASS | |
| Stores, boosters, rotating shop (date seed), no overspend | `tests/shop.test.js`, `m6-shop-rewards-offline` | PASS | |
| Quests (42) / achievements (14) / daily / chests, exactly once | `tests/quests.test.js`, e2e (claim once, reload) | PASS | |
| Offline progress (closed form, negative time ignored, clamp, welcome screen) | `tests/offline.test.js` (vs tick-by-tick < 1e-6, 10 years < 100 ms), e2e offline + clock-moved-back | PASS | |
| Combat: waves, turrets/weapons, damage types, specials | `tests/combat.test.js` (24), `m7-combat`, combat simulator | PASS | |
| Bosses, mechanics, drops, gating, cooldown | `tests/combat.test.js`, `m7-combat` | PASS | |
| Manual avatar, abilities, touch joystick | `tests/combat.test.js`, `m7-combat` manual test (flaky test fixed, BUGS #27), `m8` touch test | PASS | the avatar cannot be hurt (design simplification) |
| Loss penalty (small, bounded) | `tests/combat.test.js`, `m7-combat` | PASS | |
| Customization: theme override, floor skin, accent, camera, layout, number format, pixel size, quality, presets, item names/skins | `m8-customization-a11y` | PASS | |
| Settings validated on load | `tests/migration.test.js` (sanitiser) | PASS | |
| Accessibility: keyboard, remap + conflict, Esc/focus, high contrast, reduced motion, text scale, ARIA live throttle, captions, 44 px touch | `m8-customization-a11y` + `tests/input.test.js` | PASS | ARIA test checks the throttle function, not a screen reader (see below) |
| Audio: synth definitions, mute, volumes, voice cap, captions | `tests/audio.test.js` (4), `m8` captions/mute test | PASS (logic) | **not listened to** |
| Performance: instancing, pools, dispose, quality | `m3` GPU audit, `m7` effects within caps, `m8` quality-switch leak cycles, soak | PASS | measured on SwiftShader, not a real GPU |
| GitHub Pages workflow | file reviewed; steps match the commands I ran | **not run** | see below |

## What could not be verified

* **Real GPUs and frame rates.** All rendering ran on SwiftShader (software). The FPS figure in screenshots (24-61) says nothing about real hardware. GPU resource counts come from `renderer.info`, which is the best signal available but not a driver-level check.
* **Phones and tablets.** Touch behaviour was tested with Playwright's touch/mobile emulation (viewport 390×780, 44 px targets, touch bar shown, no horizontal overflow), not on a device. Multi-touch camera gestures (pinch/twist) were not exercised at all. iOS Safari quirks (audio unlock, 100vh, safe areas) are untested.
* **Browsers other than Chromium.** Firefox and Safari were not run. The code needs ES modules, import maps and JSON import attributes (`with { type: 'json' }`); older versions of those browsers will not load the game.
* **Screen readers.** Nothing was run with NVDA, JAWS or VoiceOver. I checked that the live regions exist, are written to, and are throttled; I did not hear them. Focus order was only checked as "Tab reaches several different controls".
* **Sound.** The audio is synthesised; tests check that sounds are defined, rate-limited, muted and captioned. Nobody listened to it, so loudness, annoyance and pleasantness are unknown. Headless Chromium has no audio output.
* **Fun and balance.** The simulators use a scripted bot. They prove structural properties (no stall, no skip, no printing money). Whether the pacing feels good to a person (first-hour hooks, how long prestige waits are, whether bosses feel fair) is unknown.
* **GitHub Actions / Pages deployment.** The workflow was written but never executed by GitHub from this environment; the deploy job only runs on `main`, and I only pushed to the feature branch. The steps use the same commands that pass locally.
* **Long-term soak beyond 5 minutes**, multiple tabs, and concurrent tabs writing one save (last write wins; not protected).
* **Clock tampering forward** is bounded only by the 10-year offline clamp (documented).
* **The 30-day economy run** was not repeated after the final small change (see note above).

## Requirements review

Walking through the brief item by item. "Done" means implemented *and* covered by a test or run listed above.

| Area | Status | Gap / honest note |
|---|---|---|
| Stack: vanilla ES modules, vendored pinned Three.js via import map, no build step, no backend, relative paths | Done | Three r170 vendored; import attributes need modern browsers |
| All art from code, pixel look | Done | Models are procedural shapes; "pixel" quality judged only from SwiftShader screenshots by me |
| 5 themes cycling/remixing per prestige region | Done | Remix = hue shift, prop order, sound transposition (unit-tested for determinism); not visually reviewed for every region |
| Pure simulation layer (no DOM/Three) | Done | `src/sim`, `src/gen`, `src/core` (except `audio.js`/`input.js`, which touch browser APIs but are separate) |
| Save system with schema, migrations, corrupt backup, export/import, fallback | Done | |
| Rolling: data-driven odds, endless luck, pity, free rolls, x10/x100/auto | Done | |
| 8 item types, backpack, sell, fuse | Done | |
| Grid placement with raycast + presets | Done | |
| Mutations (+ refiners), endless | Done | |
| Endless levels with generated rewards | Done | Capped at level 10^12 (needed for finite arithmetic; unreachable in play) |
| Rebirth + endless generated prestige layers (name, region/theme, tree, rule) | Done | Tiers are capped at 10^15, levels at 10^12; "endless" is endless in practice, not mathematically |
| Deterministic combat, turrets + weapons auto, manual arena, optional endless bosses, small loss penalty | Done | Manual avatar is invulnerable; enemies attack only the base |
| Rewards/quests (30+), exactly-once | Done | 42 quests, 14 achievements |
| Stores: roll / backpack / gear / luck / rotating (date seed) | Done | |
| Offline closed form, negative time ignored, absurd clamped, welcome-back | Done | Does not model oscillating wins/losses in offline waves (documented) |
| Customization: themes, accent, base skins, item skins/names, UI layout, number format, camera, pixel size, quality, presets | Done | |
| Big-number type | Done | |
| Formulas + soft caps in README | Done | README "How the game works" |
| Economy simulator and combat simulator "proving" properties | Done | For the scripted bot only |
| Instancing / pooling / dispose / quality settings / GPU audit hook | Done | `window.__game.gpuAudit()`; real-GPU behaviour unknown |
| Accessibility: keyboard, remap + conflict detection, reduced motion, high contrast, colour-blind-safe rarity (name + icon), text scale, throttled ARIA live, captions, 44 px targets, touch controls, game speed, pause, WebAudio mute/volume | Done (as tested above) | No real assistive-tech testing; panel overlaps the (wrapped) dock slightly at 1.3× text on a 720 px-high window |
| Unit tests for all pure logic | Done | `src/core/audio.js` playback and `core/loop.js` have no unit tests of their own; they are exercised through e2e and the soak |
| Playwright e2e list | Done | 56 tests: roll lands in backpack, backpack limit, sell, fuse, place, level up, wave, boss, rebirth, reward claimed once, reload persistence, offline |
| 5-minute soak + long-numbers soak | Done | heap rise discussed above |
| ESLint | Done | |
| BUGS.md with proof for every "Fixed" | Done | 29 entries; #26 proof was added but I did not run its test against the unfixed code |
| VERIFICATION.md | Done | this file |
| 9 milestones each with tests + screenshots + CHANGELOG + commit + push | Done | Milestones 5 and 6 share one commit (59f38d8); every other milestone has its own commit. Screenshots are in `docs/shots/` for M1, M2, M3, M5, M6, M7, M8 (none were taken for M4, which has no visual feature of its own beyond a toast, and none for M9) |
| GitHub Actions workflow (lint + unit tests; deploy on push to main) | Written | Never executed on GitHub (see above) |
| README with setup, controls, rules/formulas, add-by-data guides, tests/sims, Pages deploy | Done | Adding a *new boss mechanic id* or *new refinery operation* needs a small code handler (stated in README); everything else is data-only |
| File structure | Mostly | Extra files added; no separate `sim/bosses.js` (listed in README) |

## Known issues and limits (not bugs I fixed)

* Heap rises about 5 MB over a 5-minute random-input soak before flattening; not investigated further.
* The soak's random sequence is seeded and deterministic in its choices, but timings are real-time, so runs differ slightly.
* Clock set forward by a player gives offline progress up to 10 years.

---

# Follow-up project (tutorial, clarity, speed, index, redesign, reveals, hosting)

Each milestone below lists what was run on that milestone's code. "Not verified" items are repeated in the final review.

## F1 — Tutorial engine and skip confirmation
| What | How tested | Result |
|---|---|---|
| Tutorial data: unique ids, ≤ 20 words per step, valid conditions/rewards | `tests/tutorial.test.js` | PASS |
| Full walk-through with the real simulation: each of the 16 steps advances only after its action; assists provide what is missing | `tests/tutorial.test.js` | PASS |
| Rewards/assists exactly once (also on replay), skipping a step pays nothing, practice items are worth $0 | `tests/tutorial.test.js` | PASS |
| Resume after reload, legacy saves get no surprise tutorial | `tests/tutorial.test.js` | PASS |
| UI: spotlight on the Roll button, input not blocked, skip dialog (3 choices, focus on Keep learning, Esc keeps learning, Tab trapped), Skip for now → Resume survives reload, "don't ask again", replay from Settings, card reachable by Tab and not a trap, no pulse with reduced motion, step announced in the live region | `e2e/f1-tutorial.spec.js` (7 tests) | PASS |
| Existing e2e suite unchanged in meaning (helper skips the tutorial) | full `npx playwright test`: 63 passed | PASS |
Not verified: the tutorial on a real phone, with a screen reader, or how long a real first-time player needs (the "about 3 minutes" goal is unmeasured; no one has played it).

## F2 — Tutorial steps, tips, difficulty
| What | How tested | Result |
|---|---|---|
| All 16 steps playable through the real UI (clicks on the spotlighted element; rewards paid once) | `e2e/f2-tutorial-walk.spec.js` (3 consecutive full runs passed after fixing 3 real defects found by it) | PASS |
| First-run pace dialog lists the exact differences; focus on Relaxed; Standard leaves all multipliers 1 | `e2e/f2-tutorial-walk.spec.js`, `tests/difficulty.test.js` | PASS |
| Every Relaxed knob verified numerically (income ×1.15, 90 s waves incl. offline, enemy hp ×0.85, penalty ×0.5, free roll 90 s, boss time ×1.25) | `tests/difficulty.test.js` | PASS |
| Simulators in both modes | `sim:combat --quick` (+ `--difficulty relaxed`) and `sim:economy --quick` (+ `--difficulty relaxed`) | PASS (7/7 combat, 9/9 economy incl. "relaxed easier but not trivial": 9% sooner) |
| Tips: once only, suppressed in the tutorial and when off, persist, named conditions | `tests/tips.test.js`, e2e tips test | PASS |
| Speed rules, endless generation, locked speed refused, clamp, loop scaling bounded, offline identical at every speed, playtime real-time | `tests/speed.test.js` | PASS |
Honest note: the 15% enemy-health reduction does not change the highest wave a build beats in the combat simulator (15 vs 15, 23 vs 23, 33 vs 33); only the slower waves, lower penalty and boss time make Relaxed easier in combat. Whether Relaxed *feels* easier to a person is not measured.
