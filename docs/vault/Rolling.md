---
tags: [system, rolling]
date: 2026-10-30
status: implemented and tested
---
# Rolling
Part of [[Architecture]]. Numbers and worked examples: [[Formulas]]. Index: [[00 Start Here]].

**Files:** `src/sim/rolling.js`, `gen/tiers.js`, `data/tiers.json`. **Built in:** M2 (`ba80302`); free-roll stat and `auto` flag added in F7.

* Tier draw is a closed-form inverse of `P(tier >= t) = min(1, luck/odds_t)`, done in log space so luck is endless. Two pity levels (30 rolls for 1-in-8, 200 for 1-in-120).
* x10 unlocks at level 5, x100 at 15, auto-roll at 3 (one roll per 0.6 s, only when affordable and there is room). One free roll per 120 s, cap 3.
* The outcome is decided **before** any animation ([[Slot Animation and Cutscenes]]).
* **Bugs:** #5 `tierFromLog(Infinity)` looped forever (found when a test file timed out); #19 exponential roll price punished rolling.
* **Tests:** `tests/tiers.test.js`, `tests/inventory.test.js`, e2e `m2-rolling`.
