---
tags: [glossary]
date: 2026-10-30
status: current
---
# Glossary
Terms as used in the game and in these notes. In-game wording lives in `src/data/glossary.json`. Back to [[00 Start Here]].

* **Tier / rarity:** the quality level of a roll result (12 hand-made: Common ... Omega; endless generated beyond). Value multiplies production and price. See [[Rolling]].
* **Luck:** multiplier on the chance of reaching a tier; endless, computed in log space.
* **Pity:** guaranteed good result after a streak of misses (30 rolls for 1-in-8, 200 for 1-in-120).
* **Free roll:** a roll granted every 120 s (Relaxed 90 s), stored up to a cap.
* **Variant / hybrid:** random stat tilt (x0.8 to x1.3) / a secondary effect at 40% strength.
* **Mutation:** a modifier on an item (chance, group, level up to 5); endless generated ones exist. See [[Mutations]].
* **Refinery:** money sink that re-rolls, transfers or combines mutations. **Refiner:** a placed flow item that adds a refine multiplier.
* **Fuse:** merge 3-10 items into one with a documented chance ([[Formulas]]).
* **Dropper / conveyor / multiplier / seller / upgrader / generator / turret:** the 8 item types; units flow from droppers, along conveyors, through multipliers, to a seller. **Generator:** aura (luck or xp) for neighbours.
* **Flow / blocked:** the path units take; an item is blocked if it cannot pass units on (loop, dead end).
* **Mega tile:** base cells beyond the 32x32 maximum, giving a soft-capped bonus.
* **Rebirth / prestige layer / region:** resets a run for permanent bonuses; layer k has a currency and tree; each prestige moves to the next region with a remixed theme. See [[Rebirth and Prestige]].
* **Ledger:** saved record that makes a reward pay exactly once.
* **Practice item:** tutorial-only item worth $0 ([[Tutorial]]).
* **Relaxed / Standard:** the two pace modes. **Advanced UI:** shows every panel from the start. **Progressive disclosure:** panels unlock with progress.
* **Index:** the collection book ([[Index]]). **Silhouette:** undiscovered entry shown as '???'.
* **Reel / cutscene / surprise:** the roll animation, the rare full-screen scene, and `log10(odds) - log10(luck)` that chooses its level ([[Slot Animation and Cutscenes]]).
* **Soak:** long random-input test. **GPU audit:** counts of geometries, textures and programs tracked by `Resources`.
* **Stamp:** `scripts/stamp.js`, stages the site into an immutable `v/<version>/` folder ([[Deploy]]).
* **Closed form:** a formula that jumps directly to the result instead of looping (offline, mass level-ups).
* **Big number:** layered number with saturation; `10^^4` means a tower of exponents.
