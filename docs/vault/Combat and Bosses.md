---
tags: [system, combat]
date: 2026-10-30
status: implemented and tested
---
# Combat and Bosses
Part of [[Architecture]]. Numbers and worked examples: [[Formulas]]. Index: [[00 Start Here]].

**Files:** `src/sim/combat.js`, `gen/monsters.js`, `gen/bosses.js`, `data/enemies.json`, `bosses.json`, `weapons.json`, `render/enemies.js`, `effects.js`, `ui/combat-ui.js`. **Built in:** M7 (`4b8fce7`).

* Pure, deterministic, seeded. Turrets on the grid plus equipped weapons fire automatically; five damage types with resistances; crit, splash, chain, pierce, slow, burn.
* Waves every 60 s from level 4 (start to start, bug #22). Optional arena rush (2x enemies, 2.5x reward). Manual control `M` (move, aim, fire, dash, nova, shield; +50% damage; avatar invulnerable by design).
* Bosses endless, seeded, 2 mechanics (+1 every 5 bosses); drops weapon, money, a free upgrade level.
* Losing costs `min(2% of money, 30 s income)`.
* **Simulator:** 6/6 checks; bosses beatable at tier(wave)+2, not at tier(wave)-4; finite at wave 10^8 / boss 10^6.
* **Bugs:** #21 forecast vs reality (66/90 then >= 90%), #22 timer, #23 dash 0||-1. F1 adds a scripted demo wave for the tutorial (no penalty, no progress).
