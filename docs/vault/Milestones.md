---
tags: [milestones]
date: 2026-10-30
status: M1-M9 and F1-F9 done; live deploy blocked
---
# Milestones
What was built, how it was verified, real numbers, commit. Back to [[00 Start Here]]. Chronology in [[Timeline]]; commands in [[Testing]]; per-system notes are linked from [[Architecture]].

## Part 1 (original prompt)
### M1 `8247209` core loop, save, bignum, rng, 3D scene, pixel renderer
Built `core/bignum.js` (layered number), `rng.js` (sfc32, save/restore), `time.js`, `loop.js` (fixed step), `save.js` (versioned, corrupt backup, checksummed export), vendored Three r170, `render/resources.js` (GPU audit), five themes, instanced floor. Verified: 36 core tests, then 42 with resources/themes; ESLint; first e2e smoke (non-blank canvas). Found and fixed bugs #1-4. 37 files, +3,973 lines.

### M2 `ba80302` rolling, items, backpack
`gen/tiers.js` (endless tier maths), `sim/rolling.js`, `items.js`, `inventory.js`, `leveling.js`, `economy.js`, `game.js` (DOM-free controller), HUD/roll/backpack panels. Save v1 frozen with a fixture from the real serializer (`tests/fixtures/save-v1.json`). Verified: 86 tests after the `tierFromLog(Infinity)` hang fix (#5, #6, #7). First level takes ~11 rolls (xp base 10). See [[Rolling]], [[Backpack]], [[Levels]].

### M3 `880620a` placement, production, refiners, mutations
`sim/production.js` (exact one-pass flow solver), `placement.js`, `refiners.js`, save v2 with v1 migration, instanced 3D items, input with conflict detection. 115 tests; e2e for real mouse placement, rotate, drag-move, sell, GPU-leak check over repeated re-layout. Bugs #8-10. See [[Placement]], [[Mutations]].

### M4 `5b4cb04`, `d2889f4` level rewards
`sim/rewards.js`: hand-written rewards plus a documented generator for every level; ledger `rewards.levelClaimed` for exactly-once. Bugs #11, #12. An ESLint failure skipped the docs step while the commit still went through, so a follow-up commit fixed lint and docs. See [[Levels]].

### M5 + M6 `59f38d8` rebirth, shops, quests, offline, combat core (one commit, 52 files, +4,965 lines)
Rebirth with endless generated layers, `scripts/simulate-economy.js` + `scripts/lib/bot.js`, shops with a date-seeded rotating shop, 42 quests + 14 achievements, closed-form offline. Simulator results: after the fixes, **8/8 economy checks pass over 5 simulated days**, later also over **30 simulated days** (final level 7,680,949, 7 layers). The simulator found bugs #13-16, #19, #20. See [[Rebirth and Prestige]], [[Stores]], [[Rewards]], [[Offline Progress]].

### M7 `4b8fce7` combat, weapons, bosses
`sim/combat.js` pure and deterministic, endless monsters and bosses, `scripts/simulate-combat.js` (6/6 checks, in 1.2 s). Unit tests rose from ~115 to **205**; six failing combat tests were fixed one by one. Bugs #21-23. See [[Combat and Bosses]].

### M8 `53731fe` customization, accessibility, touch, audio
WebAudio synthesis with a caption for every sound, Settings, touch bar and joystick, ARIA live throttle. **55 e2e pass** (40 earlier + 15 new) before the commit; a 16th test was added for #26. Bugs #24-28. 30 files, +1,316 lines.

### M9 `0bf0419`, `0677e83`, `bae9fcc` soak, bug fixes, docs
Random-input soak (5 min) and long-numbers soak; the latter found the freeze #29. README written, then checked against the code and corrected (layer threshold is `100*4^(k-1)`, left-drag pans, save key, mutation slots). VERIFICATION.md first draft contained claims from memory (commit history, a missing M4 screenshot, an unverified production-vs-tick comparison, an invented known issue); I verified and corrected them before committing. Final: lint clean, **217 unit, 56 e2e**, both simulators `--quick` pass.

## Part 2 (follow-up prompt)
### F1 `3f2ab60` tutorial engine
47 files, +1,037. Pure state machine, 16 data steps (<= 20 words, enforced by a test), spotlight, skip dialog with three choices, practice items worth $0, demo wave. **63 e2e** pass. See [[Tutorial]].
### F2 `c3fc7a6` steps, tips, difficulty, speed engine
All 16 steps walked with real clicks (`f2-tutorial-walk`). Bugs #30-32. Relaxed vs Standard measured: third prestige layer **356 vs 390 min** in the first run, later reported as 5 h 56 m vs 6 h 30 m (9% sooner). See [[Tutorial]], [[Game Speed]].
### F3 `3d3af58` clarity
55 files, +1,636. Tooltips, "Why is my income this?", Help, undo, disclosure, friendly numbers. **264 unit.** Bugs #33, #34, #36, #35 (test). Changed old tests listed in [[Decisions]].
### F4 `52e503c` game speed
Unlock rules in data (2x L10, 4x L30, 8x first rebirth, then 16x, 32x ... forever). See [[Game Speed]].
### F5 `fc506c8` redesign
81 files, +1,808 / -279. Design brief first. Fonts 268 KB, ~90 icons, five themes, four review rounds. **89 e2e + 271 unit.** Bugs #37-40. See [[UI Design]].
### F6 `b6ae1de` Index
**96 e2e + 281 unit.** 20,000 mutations render about 15 rows and under 900 DOM nodes. See [[Index]].
### F7 `462c386` reel and cutscenes
25 files, +1,247. **109 e2e + 296 unit**; flash rate <= 3/s measured in the browser; 25 cutscenes + 40 auto reveals leave GPU audit and DOM unchanged. See [[Slot Animation and Cutscenes]].
### F8 `9a6a6de` hosting
29 files. Staged sub-path site e2e, update banner, workflows, live-smoke spec. See [[Deploy]].
### F9 `58646bd`, `90d9f52`, then docs commit
UI-only new-player e2e to the first rebirth; soak extended with rolls, reveals, Index, Help. Third 5-minute soak PASS. Final counts: **304 unit pass, lint clean, 114 e2e passed (5.7 min)**; soak PASS ([[Testing]]).
