---
tags: [system, stores]
date: 2026-10-30
status: implemented and tested
---
# Stores
Part of [[Architecture]]. Numbers and worked examples: [[Formulas]]. Index: [[00 Start Here]].

**Files:** `src/sim/shop.js`, `data/shop.json`, `ui/shop.js`. **Built in:** M6.

* Upgrade shop (roll / gear / luck), price `baseK x rollPrice x growth^level`, endless; timed boosters (same booster extends, never stacks); backpack tiers; daily rotating shop seeded by date.
* Every purchase goes through `trySpend`; money never goes negative. F3: 'Need $X more (about N s of income)' under every unaffordable item.
* **Bugs (tests):** #18 e2e clicked the wrong $200 button.
