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
