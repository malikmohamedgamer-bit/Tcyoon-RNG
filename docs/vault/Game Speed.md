---
tags: [system, speed]
date: 2026-10-30
status: implemented and tested
---
# Game Speed
Part of [[Architecture]]. Numbers and worked examples: [[Formulas]]. Index: [[00 Start Here]].

**Files:** `src/sim/speed.js`, `unlock.js`, `data/speed.json`, `core/loop.js`, `ui/hud.js`, `ui/settings.js`. **Built in:** engine F2 (`c3fc7a6`), UI F4 (`52e503c`).

* Starts at 1x. 0.5x and 0.75x never locked. 2x at level 10, 4x at level 30, 8x after the first rebirth, then 16x, 32x, 64x ... forever (2^k needs k-2 rebirths from 16x).
* HUD Speed button appears with the first faster speed; Settings lists locked options with the requirement. A locked speed is refused in `game.setSetting` and clamped when loading a save.
* Speed affects the simulation only: saves, real clock, offline progress never see it; playtime counts real seconds. Step growth above 4x (see [[Formulas]]).
* Older M8 setting allowed 0.5x-4x freely; test that expected `gameSpeed: 3` was changed ([[Decisions]]).
* A tip announces a newly unlocked speed (`tips.json`).
