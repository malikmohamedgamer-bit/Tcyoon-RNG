# Changelog

All notable changes, by milestone. Dates are build dates.

## M1 — Core loop, save, bignum, rng, 3D scene + pixel renderer
- `core/bignum.js`: layered big number (mantissa + exponent, exponent itself can grow into
  power-tower layers); add/sub/mul/div/pow/log/compare/floor/min/max/format; NaN-safe, saturating.
- `core/rng.js`: seeded, serialisable sfc32 generator with weighted picks, forks, state save/restore.
- `core/time.js`: injectable clock, offline-elapsed sanitiser (negative ignored, clamped to 10 years), date keys.
- `core/loop.js`: fixed-timestep loop with manual `advance()` and stall (`onGap`) hook.
- `core/save.js`: versioned localStorage saves, migrations, corrupt-save backup, checksummed text export/import, in-memory fallback.
- Three.js r170 vendored (`vendor/three`), loaded through an import map; no CDN, no build step.
- Renderer: pixelated low-res render target with nearest-neighbour upscale (setting), instanced floor,
  five themes (factory, steampunk, space, sci-fi, pixel) with seeded endless remixes, orbit/pan/zoom camera.
- `render/resources.js`: shared resource tracker + GPU audit hook (`window.__game.gpuAudit()`), unit tested.
- Tooling: ESLint flat config, node:test, Playwright (SwiftShader WebGL), Pages workflow.
- Placeholder: money ticks +1/s until production lands in M3.

## M2 — Rolling, items, backpack
- Data: `tiers.json` (12 hand tiers + endless generated tiers), `items.json` (24 templates, 8 types), `weapons.json` (7), `mutations.json` (13), `economy.json` (every tuning knob).
- `gen/tiers.js`: closed-form endless tier maths (quadratic extension), tier names/icons/colours (colour-blind safe + icon + name).
- `sim/rolling.js`: luck-scaled tier draw `P(tier >= t) = min(1, luck/odds_t)`, two-level pity, closed-form free-roll accrual, x10/x100/auto-roll unlocks, odds table.
- `sim/items.js`: item stat model (tier scaling, variants, hybrids, mutation stacking) — added as a separate module because production, combat and UI all share it.
- `sim/inventory.js`: backpack limits, sell (<= 50% of roll price), sell duplicates, fuse with documented odds + pity.
- `sim/leveling.js`: endless XP curve; `sim/economy.js`: price formulas and the single `modifiers()` hook.
- `src/game.js` (new, DOM-free controller used by UI, tests and the debug hook), `core/events.js` (transient event queue).
- UI: HUD, dock, roll panel (odds table, pity bars), backpack panel (sell, fuse with live odds, sell duplicates, bigger backpack), throttled ARIA announcements.
- Save format **v1** frozen at the end of this milestone (fixture `tests/fixtures/save-v1.json` was produced by the real v1 serializer).
- First level now takes ~11 rolls (xp base 10) so the first minute has a reward.
