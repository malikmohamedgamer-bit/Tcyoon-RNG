---
tags: [system, rebirth]
date: 2026-10-30
status: implemented and tested
---
# Rebirth and Prestige
Part of [[Architecture]]. Numbers and worked examples: [[Formulas]]. Index: [[00 Start Here]].

**Files:** `src/sim/rebirth.js`, `gen/layers.js`, `data/rebirth.json`, `ui/rebirth.js`. **Built in:** M5 (`59f38d8`).

* Layers 0-2 hand-made, layers >= 3 generated (name, currency, effect, threshold `100*4^(k-1)`, tree of 12 incl. an endless sink, rule). Layer 50,000 uses the same Big maths.
* Resets money, items, base, shop upgrades and lower layers' currency; keeps level/XP, claimed rewards, counts. Each prestige advances the **region** with a remixed theme.
* **Economy simulator evidence:** first prestige of layer 1 after 10 min, layer 2 at 50 min, layer 3 at 7 h 7 m, layer 4 at 22 h 12 m, layer 5 at 4 d 5 h, layer 6 at 14 d 17 h (30 simulated days); spamming the minimum prestige peaks at 10^4.8 vs 10^29.9 when playing; never prestiging gives 10^7.2.
* The Help article has a worked example computed from the real formulas ([[Tutorial]], F3). The UI-only new-player e2e (`e2e/f9-new-player.spec.js`) plays to the first rebirth using only clicks and keys.
