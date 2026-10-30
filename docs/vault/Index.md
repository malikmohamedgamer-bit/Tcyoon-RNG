---
tags: [system, index]
date: 2026-10-30
status: implemented and tested
---
# Index
Part of [[Architecture]]. Numbers: [[Formulas]]. Index: [[00 Start Here]].

**Files:** `src/sim/index.js`, `data/index.json`, `ui/indexbook.js`. **Built in:** F6 (`b6ae1de`).

* Sections: items, rarities (endless), mutations (endless), weapons, monsters, bosses (endless). Discovery is recorded where things enter the game (`addToBag`, refiners, encounters), never for practice items.
* Silhouettes show '???' and a hint; the hidden name is not in the page. Search plus filters (found/missing, first-found theme, item type, best rarity). Completion % counts only the reference sets, bonus entries never exceed 100%.
* **Virtualised**: 20,000 mutations give about 15 rows and < 900 DOM nodes; unit test lists 30,000 mutations + 5,000 bosses + 2,000 rarities in < 1 s; saves capped at 50,000 per section and sanitised.
* Rewards at 25/50/75/100% per section + all sections, claimed once (ledger). First-time find triggers a flourish ([[Slot Animation and Cutscenes]]). Old saves backfilled silently.
* **Tests:** `tests/index.test.js` (10), `e2e/f6-index.spec.js` (7). Not verified: screen-reader behaviour of the virtualised list.
