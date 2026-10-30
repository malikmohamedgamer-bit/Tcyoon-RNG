---
tags: [system, levels]
date: 2026-10-30
status: implemented and tested
---
# Levels
Part of [[Architecture]]. Numbers and worked examples: [[Formulas]]. Index: [[00 Start Here]].

**Files:** `src/sim/leveling.js`, `rewards.js`, `data/rewards.json`. **Built in:** M4; closed forms in M5/M6; cap in M9.

* `xpForLevel(L) = 25*1.16^(L-1)*(1+L/4)`. Rewards: hand-written for 2-20 with gaps, then a documented generator forever.
* **Exactly once** via the ledger `rewards.levelClaimed`, also across reloads.
* >64 level-ups resolve in closed form (10^300 XP in < 200 ms; bug #20). **`MAX_LEVEL = 1e12`** after the tower-XP freeze (bug #29: the test is killed by a 20 s timeout on the old code).
* **No money printing**: proof test rolls + sells + rewards never net a profit at any XP multiplier or luck (bug #13).
