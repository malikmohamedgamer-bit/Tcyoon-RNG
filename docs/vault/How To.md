---
tags: [howto]
date: 2026-10-30
status: current
---
# How to
Short recipes. Details in README. Back to [[00 Start Here]]. Testing: [[Testing]]. Hosting: [[Deploy]].

## Run and check
```bash
npm install
npm run dev                      # http://localhost:5173
npm run lint && npm test
npx playwright test --grep-invert soak
SOAK_MINUTES=5 npx playwright test e2e/soak.spec.js
npm run sim:economy -- --quick   # also: --days 30, --difficulty relaxed
npm run sim:combat -- --quick
```
If browsers are missing: `npx playwright install chromium` (in the Claude sandbox Chromium is pre-installed; do not reinstall Playwright).

## Add content by data only
* **Item:** add to `src/data/items.json` (template: type, shape, icon, base stats). **Mutation:** `mutations.json` (chance, min tier, group, effects, types). **Refiner:** `refiners.json`. **Weapon:** `weapons.json`. **Boss:** `bosses.json`. **Prestige layer:** hand-made layers in `rebirth.json`; layers beyond are generated from the same constants.
* **Tutorial step / tip:** `tutorial.json` (one sentence, at most 20 words; a test enforces it), `tips.json`. **Speed rule:** `speed.json`. **Glossary term:** `glossary.json` (a test checks every tooltip id used in the UI resolves). **Cutscene thresholds:** `cutscenes.json`. **Index rewards:** `index.json`.
* Any icon id used in data must resolve in `src/ui/icons.js` (`tests/icons.test.js`).

## Change a theme or font
Tokens in `src/ui/style.css`, per-theme construction in `themes.css`. Fonts: `node scripts/vendor-fonts.js` (also run by `npm run vendor`) regenerates `fonts.css`; files live in `vendor/fonts`. Design rules: `docs/design.md`.

## Save handling
Settings, Save data: export gives `TRNG1.<base64>.<hash>`; import verifies the hash. Key `tcyoon-rng:save`. A save belongs to one browser and one web address.

## Stage a hosted build locally
`node scripts/stamp.js --version 1.0.0-local --out _site` then serve with `BASE_PATH=/Tcyoon-RNG/ ROOT_DIR=_site node scripts/serve.js` (mimics Pages sub-path and 404). The e2e `subpath.spec.js` does this on port 5198.

## Check the live site (after Pages works)
`LIVE_URL=https://<user>.github.io/<repo>/ npm run smoke:live`

## Resume work after a context reset
Read [[Resume Point]], then `git log --oneline | head`, `git status`, and `.scratch/*.out` for background runs.
