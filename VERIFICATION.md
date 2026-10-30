# Verification

What was checked, how, and what the result was. Everything marked **PASS** below was run in this repository on the final code
(output copied from the runs; commands are in the README). Anything I could not check is listed under
[What could not be verified](#what-could-not-be-verified) and in the [requirements review](#requirements-review).

## Final run (one command chain on the final commit)

| Check | Command | Result |
|---|---|---|
| Lint | `npx eslint .` | no findings |
| Unit tests | `npm test` | 217 tests, 217 pass, 0 fail (M9; the follow-up final run is 304/304, see F9 below) |
| End-to-end | `npx playwright test` | 56 passed (M9; headless Chromium, SwiftShader WebGL, ~1.3 min; the follow-up final run is 114 passed, see F9 below) |
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

## F3 — Clarity features
| What | How tested | Result |
|---|---|---|
| Tooltip ids used in the UI, every item type, mutation (incl. generated), rarity (tiers 0 … 10^9) and every stat of every item template at tiers 0/3/9/40 resolve | `tests/glossary.test.js` | PASS |
| Hover, keyboard focus, Esc, aria-describedby; touch tap toggle and tap-away; focus survives a re-render | `e2e/f3-clarity.spec.js` | PASS |
| Income breakdown adds up to the real income exactly; multipliers ordered with sources; blocked items reported | `tests/explain.test.js`, e2e | PASS |
| Help search (AND of words), rarity table and rebirth example computed from real data | `tests/glossary.test.js`, e2e | PASS |
| Undo: place/move/swap/pick up/sell/sell duplicates, 20 s expiry, 10-action limit, no XP/money farming, cleared by rebirth | `tests/undo.test.js` (8), e2e (key Z and chip) | PASS |
| Progressive disclosure rules, unlock events once, tutorial reveal, old saves, Advanced UI | `tests/disclosure.test.js`, e2e | PASS |
| Friendly numbers, larger text on phones | `tests/bignum.test.js`, e2e | PASS |
| Whole e2e suite after F3 | 74 + 1 passed (the boss test was fixed, see BUGS #35) | PASS |
Not verified: that the explanations are *clear to a new player* (nobody but me has read them); screen-reader output of the tooltips and the income list; that Tab order through item lists is comfortable (stat labels in long lists are deliberately not tab stops).

## F4 — Unlockable game speed
| What | How tested | Result |
|---|---|---|
| Rules from data, endless generated speeds, requirement text, locked option listing | `tests/speed.test.js` | PASS |
| A locked speed cannot be chosen (disabled option, direct set refused, clamped on load), slow speeds always available | `tests/speed.test.js`, `e2e/f4-speed.spec.js` | PASS |
| Pure scaling in the loop (0.5x-4x correct, 64x bounded steps per frame) | `tests/speed.test.js` | PASS |
| In a real browser at 2x: sim time ~2x real time, playtime stays real-time, HUD button appears at level 10 and cycles, save reloads at 2x | `e2e/f4-speed.spec.js` | PASS |
| Offline progress identical at every speed (unit: 0.5x ... 64x; e2e: hour away at 1x vs 0.5x) and saves independent of speed | `tests/speed.test.js`, e2e | PASS |
Not verified: how very high speeds (hundreds of x) *feel* or perform on a real device; I only checked the per-frame step bound in the loop test and that the simulation stays finite.

## F5 — Redesign
| What | How tested | Result |
|---|---|---|
| No emoji in the interface: 11 panels x 5 themes (+ the skip dialog) | `e2e/f5-design.spec.js` | PASS (found and fixed 3 leaks, BUGS #38-#40) |
| Every icon named in the data and in endless generated content resolves to a drawn SVG; UI source has no emoji | `tests/icons.test.js` | PASS |
| Fonts ship with the game, nothing is requested from another origin, each theme resolves its own display font | `e2e/f5-design.spec.js` | PASS |
| WCAG contrast per theme, normal and high contrast: text >= 7, muted >= 4.5, accent text >= 4.5, accent UI >= 3, status colours >= 4.5, focus ring >= 3 | `e2e/f5-design.spec.js`, `tests/a11y.test.js` (all 60 region accents) | PASS (after fixing BUGS #37) |
| 3 px focus ring on the menu in every theme; reduced motion removes the panel slide | `e2e/f5-design.spec.js` | PASS |
| Phone, tablet, desktop x 5 themes: no horizontal overflow, Roll button on screen, unobstructed, all menu/Roll targets >= 44 px; 160% text on a phone | `e2e/f5-design.spec.js` | PASS |
| Visual review loop (4 rounds) with before/after screenshots | `docs/design-review.md`, `docs/compare-*.png` | done by me only |
Not verified / honest: whether it *looks good* is my judgment from software-rendered headless screenshots; no designer or player reviewed it (see the weak-points list in `docs/design-review.md`: the 3D scene is untouched, stacked messages can crowd a phone, icons are plain). Real devices, other browsers and font rendering on other platforms were not checked.

## F6 — Index
| What | How tested | Result |
|---|---|---|
| Discovery recording (template, rarity, mutations, weapons, practice items ignored, refinery, monsters with counts, bosses and wins), only the first time is an event | `tests/index.test.js` | PASS |
| Silhouettes reveal only a hint; the hidden name is not in the page | `tests/index.test.js`, `e2e/f6-index.spec.js` | PASS |
| Endless content: 30,000 generated mutations + 5,000 bosses + 2,000 rarities listed in < 1 s, described lazily; hostile saves capped (50,000 per section) and sanitised | `tests/index.test.js` | PASS |
| Virtualisation in the browser: 20,000 mutations -> about 15 rows and < 900 DOM nodes in the panel; scrolling to the middle shows entries around #10,000; aria-setsize/posinset | `e2e/f6-index.spec.js` | PASS |
| Search and every filter in the UI, announced result count | `e2e/f6-index.spec.js` | PASS |
| Completion rewards: not before reached, exactly once, persisted, `all` reward, dock badge | `tests/index.test.js`, e2e | PASS |
| Save/load and backfill of old saves (silent) | `tests/index.test.js` | PASS |
Not verified: the Index with a real player's long-term save (only synthetic data up to 30,000 entries); screen-reader reading of a virtualised list (semantics are set, nothing was listened to); how the completion rewards feel in the economy (they are small and one-time, not run through the economy simulator).

## F7 — Roll animation and cutscenes
| What | How tested | Result |
|---|---|---|
| Reel lands exactly on its result (50 seeds x 2 modes), decelerates monotonically, ticks thin out, skip lands too | `tests/reveal.test.js` | PASS |
| The animation can never change an outcome (game RNG untouched, next roll identical) | `tests/reveal.test.js` | PASS |
| Cutscene level formula: monotone in rarity, falls with luck, finite up to tier 10^15, caps by setting, first-time lift | `tests/reveal.test.js` | PASS |
| Deterministic timeline; each text/sting/burst once; <= 4 s; curves 0 at both ends | `tests/reveal.test.js` | PASS |
| Flash rule: <= 3 flashes in any second for every level (schedule), and measured in the browser in a real cutscene | `tests/reveal.test.js`, `e2e/f7-reveal.spec.js` | PASS |
| Reduced motion: static reel, no blur, no flashes/particles/camera, <= 1.6 s card | tests + e2e | PASS |
| Queueing: 30 results during a scene -> one summary, one cutscene; auto-roll quick only, no overlay | tests + e2e | PASS |
| Skip at every stage (Esc, Enter, click, Space), item never lost, camera/lights restored | e2e | PASS |
| 25 cutscenes + 40 auto reveals: GPU audit (geometries, textures, tracked counts) and DOM unchanged | e2e | PASS |
Not verified: how it *feels* (timing, weight, the sting sounds were never heard), on a real GPU or phone; screen-reader behaviour of the announcements; that the camera push and particle burst look good in all themes (I looked at one cutscene in the Factory theme only).

## F8 — Hosting, versioning, live checks
| What | How tested | Result |
|---|---|---|
| Staged site has no absolute paths, every referenced file exists, bad version / cname refused | `tests/stamp.test.js` | PASS |
| Staged site served under `/Tcyoon-RNG/` by a server that behaves like Pages (immutable `v/<version>/` folder, 404 page): every request 200, fonts, OG image, a roll works, nothing requested outside the base | `e2e/subpath.spec.js` | PASS |
| Save moves between two origins (export on one, import on the other) | `e2e/subpath.spec.js` | PASS |
| "New version available" banner appears when `version.json` changes; update check logic (interval, focus, dev off) | `e2e/subpath.spec.js`, `tests/updates.test.js` | PASS |
| Live-smoke spec (`e2e/live/smoke.spec.js`) | validated against a local server that mimics the hosted layout | PASS locally; **never run against the real URL** |
| Workflow files | YAML parsed; run on GitHub for commit `9a6a6de` on `main` (run 41137575634), job results read through the GitHub API: `test` success, `e2e` success (about 4.6 min on the runner), `deploy` **failure**, `smoke-live` skipped | partly verified |
| Deploy to GitHub Pages | the `deploy` job was refused in 1 s with no steps and no runner (Pages source is probably "Deploy from a branch" and the `github-pages` environment only allows the default branch; inferred, not proven: the job log was not downloadable, 404) | **FAILED / blocked, BUGS.md #43** |
| Live URL | `curl` from the sandbox: `CONNECT tunnel failed, response 403` (network policy blocks `github.io`) | **not verified** |

Not verified: that the site works at `https://malikmohamedgamer-bit.github.io/Tcyoon-RNG/` (never fetched), the daily scheduled workflow (never ran), a custom domain, the update banner on a real deploy, cache behaviour on real Pages/CDN headers. `main` was created by me from the feature branch (it points at the F8 commit); no PR, no force-push, no history rewrite.

## F9 — New-player run, soak, final numbers
| What | How tested | Result |
|---|---|---|
| A brand-new player follows only what the interface shows (tutorial spotlight, tips, dialogs, status bar) to the first rebirth; browser clock jump = "closed laptop lid" for offline progress; no internal hooks used | `e2e/f9-new-player.spec.js` (3 consecutive runs: 3 passed, 2.1 min) | PASS |
| That spec never touches `window.__game` or the tutorial-skipping helper | `tests/newplayer-meta.test.js` | PASS |
| 5-minute random-input soak including rolls (1/10/100), reveals, Index, Help | `SOAK_MINUTES=5 npx playwright test e2e/soak.spec.js` | **PASS** (2 passed, 5.5 min): 1,512 actions; heap 7.0 → 11.2 MB (flattening); geometries/textures/programs 21/2/6 → 69/6/12, flat from sample 13; DOM nodes 240–1,192; reveal overlay at most 134 nodes and empties to < 10 when idle; 0 console errors; no NaN/Infinity/undefined text; frame counter strictly increasing; level 23 / region 18 at the end |
| Final lint | `npm run lint` | no findings |
| Final unit tests | `npm test` | 304 tests, 304 pass, 0 fail |
| Final end-to-end (without the soak file) | `npx playwright test --grep-invert soak` | 114 passed (5.7 min) |

Earlier F9 soak runs: run 1 failed on my own new assertion (reveal DOM 136 > 120); run 2 passed every real assertion (1,540 actions, heap 6.8 → 11.3 MB) and failed only on a same-task DOM count (BUGS.md #42). Both were test-code problems, not game bugs. Not re-run after the final soak: the 30-day economy simulation (the `--quick` runs and CI's Standard and Relaxed runs are on the final sim code).

## Requirements review: the follow-up prompt (6 jobs)
"Done" = implemented and covered by a test or run listed in this file. Everything judged by taste is marked as my judgement only.

| Job / requirement | Status | Evidence / honest gap |
|---|---|---|
| 1. Interactive tutorial in the real game, <= 20-word steps, spotlight, auto-advance | Done | `tests/tutorial.test.js` (word limit), `f1-tutorial`, `f2-tutorial-walk` (all 16 steps with real clicks) |
| 1. Skippable with "Are you sure?", 3 choices, default focus Keep learning, replay, resume, never traps keyboard/touch | Done | `f1-tutorial`; touch trap not tested on a real phone |
| 1. Assists, small rewards exactly once, one-time tips + Tips seen + off switch, reduced motion | Done | `tests/tutorial.test.js`, `tests/tips.test.js`, e2e; BUGS #30–32 |
| 2. First-run Relaxed/Standard with exact README differences tested by simulators | Done | `npm run sim:* -- --difficulty relaxed` pass; honest note: enemy HP -15% does not change the beatable wave |
| 2. Progressive disclosure + Advanced UI | Done | `tests/disclosure.test.js`, `f3-clarity` |
| 2. Data-driven tooltips, "Why is my income this?", searchable Help with glossary/rarity table/rebirth example/formulas | Done | `tests/glossary.test.js`, `tests/explain.test.js` (lines add up exactly), `f3-clarity`; screen-reader reading not tested |
| 2. Blocked actions say why with one-click fix; undo for place/move/sell | Done | `tests/undo.test.js` (8), `f3-clarity` |
| 2. Friendly numbers, larger text on small screens | Done | unit + `f5-design` (160% text) |
| 2. UI-only new-player e2e to first rebirth | Done | `f9-new-player` |
| 3. Speed starts 1x, faster speeds unlocked by data rules (endless), locked options shown with requirement, sim-only, slow never locked | Done | `tests/speed.test.js`, `f4-speed` |
| 4. Index: silhouettes + hints, details, search/filter, completion %, rewards once, virtualised, tested | Done | `tests/index.test.js` (30,000 entries < 1 s), `f6-index` (20,000 → ~15 rows) |
| 4. Redesign: design brief first, five distinct themes, code-drawn icons, no emoji, shipped fonts, hierarchy, responsive, accessible, before/after screenshots at three sizes in every theme, review loop | Done (judgement partly mine) | `docs/design.md`, `docs/design-review.md`, `f5-design` measures contrast/targets/overflow; whether it "no longer looks AI-made" is **my opinion only**; weak spots listed in `docs/design-review.md` (3D scene untouched, Sci-Fi/Space similar, dense panels) |
| 5. Slot reel decided before animation, cosmetic only, tick sounds; x10/x100 multi-reel + summary; auto-roll short; cutscenes by tier (formula for endless); first-time Index flourish; skippable; settings; reduced motion; <= 3 flashes/s; captions; screen-reader announce; pure state machines; dispose 3D; soak with many rolls | Done | `tests/reveal.test.js` (15), `f7-reveal` (12), soak; sounds never heard, feel unjudged |
| 6. Verify sub-path works | Done | `subpath.spec.js` |
| 6. Merge feature branch into main | **Partial** | `main` created from the F8 commit via the GitHub tools; later commits are on the feature branch only; no PR (nothing to compare at that moment) |
| 6. Enable Pages with source GitHub Actions | **Not done** | no tool for repository settings; exact clicks in README "One-time setup" |
| 6. CI job smoke-testing the LIVE URL after each deploy + daily workflow | Written, **never run live** | `pages.yml` `smoke-live` was skipped (deploy failed); `smoke-daily.yml` never ran |
| 6. Versioning, update notice, stale-cache prevention | Done locally | `tests/stamp.test.js`, `tests/updates.test.js`, `subpath.spec.js`; not seen on real Pages/CDN |
| 6. Saves explained, Export, gentle reminders, local save imports into hosted version | Done | `subpath.spec.js` cross-origin import |
| 6. 404 page, social tags, code-drawn favicon, README on deploying/custom domains, honest static-hosting docs | Done | files + README "Hosting" |
| 6. Report live URL only after fetching it | **Not possible** | the sandbox cannot reach `github.io`; no live URL is claimed |
| Process: 9 milestones each with lint, unit, e2e, screenshots, CHANGELOG + VERIFICATION, commit, push | Done | commits `3f2ab60` … `90d9f52`; F9 docs finished in the final commit |
| Process: bugs in BUGS.md with proof; old tests changed only for intended UI change, and said so | Done | BUGS #30–43; changed tests listed in CHANGELOG F3/F5/F6/F7 |
