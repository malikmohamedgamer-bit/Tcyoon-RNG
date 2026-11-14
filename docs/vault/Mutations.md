---
tags:
  - system
  - mutations
  - project/tcyoon-rng
  - type/note
  - status/implemented-and-tested
date: 2026-10-30
status: implemented and tested
project: tcyoon-rng
created: 2026-10-30
updated: 2026-10-30
---
# Mutations
Part of [[Architecture]]. Numbers and worked examples: [[Formulas]]. Index: [[00 Start Here]].

**Files:** `src/sim/mutations.js`, `refiners.js`, `gen/mutations.js`, `data/mutations.json`, `data/refiners.json`. **Built in:** M2/M3.

- Data-driven: chance, min tier, group (one per group), effects, item types. Luck raises chance (capped). Slots `1 + floor(tier/4)`, level up to 5. Beyond the list `gen/mutations.js` makes endless `g:<stage>` mutations.
- **Refinery** (money sink): re-roll, transfer, combine (same mutation: level +1, may fail). Cost = roll price x factor x (1 + 0.5 x mutations). Placed refiner items add a refine multiplier.
- Boss drops carry the unique mutation `boss:<n>`. Discovery feeds the [[Index]].

<!-- related:start -->
## Related

- [[Rewards|Rewards]]
<!-- related:end -->
