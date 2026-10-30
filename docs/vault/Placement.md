---
tags: [system, placement]
date: 2026-10-30
status: implemented and tested
---
# Placement
Part of [[Architecture]]. Numbers and worked examples: [[Formulas]]. Index: [[00 Start Here]].

**Files:** `src/sim/placement.js`, `production.js`, `ui/placement.js`, `ui/base.js`, `render/items.js`. **Built in:** M3 (`880620a`).

* Grid base (expandable to 32x32, then a soft-capped mega-tile bonus). Place, move/swap by drag, rotate, pick up, sell, presets, lane-based auto-layout.
* **Production** is solved exactly in one pass (functional graph): cap, add, refine, multiply, then a seller. Blocked items are flagged with the reason (loops, dead ends, generators/turrets as sinks).
* 3D: instanced meshes per shape, direction arrows, rarity gems, mutation halos, ghost (ring valid / cross invalid) with a text label; ray-cast picking.
* **Bugs:** #8 auto-layout gap before the seller; #9 re-render lost the click; #10 key clashes. e2e uses real mouse events on the canvas.
* F3 added `explainIncome` which reuses the solver and is tested to add up exactly.
