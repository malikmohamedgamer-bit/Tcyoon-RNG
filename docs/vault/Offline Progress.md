---
tags: [system, offline]
date: 2026-10-30
status: implemented and tested
---
# Offline Progress
Part of [[Architecture]]. Numbers and worked examples: [[Formulas]]. Index: [[00 Start Here]].

**Files:** `src/sim/offline.js`. **Built in:** M6.

* Closed form: income x time split at booster expiries, free-roll accrual to the cap, booster countdown, waves by expected value.
* Negative elapsed (clock back) ignored and says so; elapsed clamped to 10 years; welcome-back screen after >= 20 s.
* Tested against tick-by-tick (error < 1e-6) and speed (10 years in < 100 ms). Identical at every game speed (F4 test).
* In the UI-only new-player e2e a Playwright `page.clock` fast-forward acts as 'closed laptop lid'.
* Limit: moving the clock **forward** is only bounded by the 10-year clamp ([[Open Issues]]).
