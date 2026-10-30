---
tags: [architecture]
date: 2026-10-30
status: current as of F9
---
# Architecture
Back to [[00 Start Here]]. Formulas: [[Formulas]].

## Layers (dependencies only point downward)
1. `src/core/` : `bignum`, `rng`, `time`, `loop` (fixed step), `save`, `events` (transient queue plus `onEvent` hook), `input` (remappable actions, conflict detection), `audio` (WebAudio synthesis, browser), `updates` (new-version check).
2. `src/gen/` : procedural content, pure: `tiers`, `names`, `items`, `mutations`, `layers`, `themes`, `monsters`, `bosses`.
3. `src/sim/` : pure simulation, no DOM/Three/clock: `state`, `economy`, `rolling`, `items`, `inventory`, `placement`, `production`, `refiners`, `leveling`, `rewards`, `rebirth`, `shop`, `quests`, `offline`, `combat`, plus the follow-up modules `tutorial`, `difficulty`, `tips`, `speed`, `unlock`, `disclosure`, `undo`, `explain`, `glossary`, `help`, `index`, `reveal`.
4. `src/game.js` : DOM-free controller; the only thing the UI calls. Node tests, simulators and `window.__game` use it too.
5. `src/render/` : Three.js scene, instanced items, enemies, effects, camera, pixel render target, `resources` (tracking + GPU audit), `reveal3d`.
6. `src/ui/` : DOM panels, `style.css` + `themes.css`, `icons.js` (drawn SVG), tooltips, tutorial, Index, reveal overlay, roll dock.
7. `src/main.js` : wiring (input, panels, render loop, first-run dialog, update banner, `window.__game`).

## Data-driven content
All tuning and content are JSON in `src/data/` (22 files): tiers, items, weapons, mutations, economy, rebirth, shop, quests, rewards, refiners, themes, enemies, bosses, and the follow-up files tutorial, tips, difficulty, speed, disclosure, glossary, help, index, cutscenes. README has "Adding content by data only" guides for an item, mutation, refiner, weapon, boss, prestige layer.

## Key patterns
* **Fixed-step loop** `update(dt, realDt)`; speed scales `dt`, the step grows above 4x, combat is sub-stepped <= 0.1 s ([[Game Speed]]).
* **Seeded RNG everywhere** (sfc32, save/restore, `fork`): rolls, fuse, mutations, waves, bosses, rotating shop, reel fillers use separate forks.
* **Ledgers for exactly-once**: `rewards.levelClaimed`, quest/achievement claims, `tutorial.claimed`, Index rewards.
* **Layered Big numbers** with saturation.
* **Save**: key `tcyoon-rng:save`, `{version, savedAt, data}`, v2 current, additive fields (tutorial, difficulty, tips, ui, index, settings) with sanitizers and legacy backfill. Corrupt save is copied to a backup key. Export `TRNG1.<base64>.<hash>`.
* **Event hook**: `state._onEvent` feeds tips, Index and toasts without the sim knowing about the UI.
* **Disposal**: `Resources` tracks geometries/textures/programs; `gpuAudit()` is used by e2e and soaks.
* **Undo** history is in memory only; **speed unlock** rules are shared by speed and disclosure (`sim/unlock.js`).

## Testing seams
`window.__game` (state, `debug.grantMoney`/`advance`, `gpuAudit`, `reveal`, `version`, `updates`, `skipReveal`). Tests: [[Testing]].

## Per-system notes
[[Rolling]] · [[Backpack]] · [[Placement]] · [[Mutations]] · [[Levels]] · [[Rebirth and Prestige]] · [[Combat and Bosses]] · [[Offline Progress]] · [[Stores]] · [[Rewards]] · [[Game Speed]] · [[Index]] · [[Tutorial]] · [[UI Design]] · [[Slot Animation and Cutscenes]]
