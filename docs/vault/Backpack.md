---
tags: [system, backpack]
date: 2026-10-30
status: implemented and tested
---
# Backpack
Part of [[Architecture]]. Numbers and worked examples: [[Formulas]]. Index: [[00 Start Here]].

**Files:** `src/sim/inventory.js`, `ui/backpack.js`. **Built in:** M2.

* Slots `20 + 8n + floor(n^1.4)`; full backpack blocks rolls and says so (with a one-click fix after F3).
* **Sell** is capped at 50% of the creation-level roll price (bugs #13, #14). **Sell duplicates** and **fuse** (3-10 items, documented odds + pity).
* Practice items from the tutorial are worth $0 and cannot be sold for money ([[Tutorial]]).
* Undo for sell and sell-duplicates, with the anti-farming rule (see [[Decisions]]).
* **Bug:** #6 `nextUid` drift on load (eager default argument).
