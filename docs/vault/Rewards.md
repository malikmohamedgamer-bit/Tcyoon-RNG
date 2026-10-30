---
tags: [system, rewards]
date: 2026-10-30
status: implemented and tested
---
# Rewards
Part of [[Architecture]]. Numbers and worked examples: [[Formulas]]. Index: [[00 Start Here]].

**Files:** `src/sim/rewards.js`, `quests.js`, `data/quests.json`. **Built in:** M4 (level rewards) and M6.

* 42 quests, 14 achievements, endless generated quests; daily reward with streaks; playtime rewards; level-milestone chests; 6-hour rotating chests.
* Every claim passes a ledger, so nothing is granted twice; e2e: claim once, reload, still claimed.
* Tutorial rewards (3 steps) and Index completion rewards use their own ledgers ([[Tutorial]], [[Index]]).
