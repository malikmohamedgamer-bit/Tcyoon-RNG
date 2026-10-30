---
tags: [deploy, hosting]
date: 2026-10-30
status: code done; live deployment BLOCKED (not verified)
---
# Deploy (GitHub Pages)
Back to [[00 Start Here]]. Related: [[Open Issues]], [[Testing]], [[How To]]. Built in F8 (`9a6a6de`).

## What exists
* `scripts/stamp.js` stages the site without a build into an immutable `v/<version>/` folder, rewrites `index.html`, writes `version.json`, `404.html`, `.nojekyll`, optional `CNAME`. `scripts/serve.js` can serve a staged folder under a base path and returns `404.html` like Pages.
* `src/version.js`, `src/core/updates.js`: 'A new version is available - Reload' banner (check 20 s after start, every 10 min, on tab focus; saves before reloading). `index.html` reloads once if a cached page points at files a newer deploy removed.
* `.github/workflows/pages.yml`: jobs `test` (lint, unit, both simulators Standard and Relaxed), `e2e`, `deploy` (stamp + official Pages actions, only on `main`), `smoke-live` (opens the LIVE URL). `.github/workflows/smoke-daily.yml` runs daily at 05:17 UTC and opens an issue on failure. `e2e/live/smoke.spec.js` + `playwright.live.config.js` (`npm run smoke:live`, `LIVE_URL=...`).
* Social meta tags, `assets/og.png` drawn by code (`npm run og`), SVG favicon, README sections on custom domain (`CUSTOM_DOMAIN` variable writes a CNAME) and any other static host. Saves explained in README and Settings (per browser and per web address), export/import, backup reminders (30 min play, first rebirth, level 75).

## Evidence that is real
* `e2e/subpath.spec.js`: the staged site under `/Tcyoon-RNG/` with a Pages-like server: every request 200 from the versioned folder, fonts, OG image, roll works, 404, nothing outside the base, save import across two origins, version banner. `tests/stamp.test.js`: no absolute paths, every referenced file exists.
* The live-smoke spec was validated against a local server that mimics the hosted layout.
* GitHub Actions on `main` (run 1, commit `9a6a6de`): the `test` job **passed** (completed, success); the e2e job passed per my earlier check.

## What failed (bug #43, open)
* `main` did not exist. With the GitHub tools I created it from the feature branch (same SHA `9a6a6de`): no PR was possible (no diff), no force-push, no history rewrite (authorised by the prompt).
* The `deploy` job was refused in about 1 second (created 22:22:54, completed 22:22:55Z) with no steps and no runner (`runner_id: 0`). Cause (inferred, not proven): Pages source is 'Deploy from a branch' and the `github-pages` environment only allows the default branch (the feature branch). Job log download returned 404.
* I have no tool to change repository Pages or environment settings.

## What you must click (also in README 'One-time setup')
1. Settings, Pages, Build and deployment, Source: **GitHub Actions**.
2. Settings, Environments, `github-pages`, Deployment branches and tags: allow `main` (or make `main` the default branch).
3. Re-run the workflow (Actions, CI and Pages, Re-run all jobs).
4. For me to verify the live URL: allow `github.io` under the environment's Network access (the sandbox proxy returned `CONNECT tunnel failed, response 403`; `curl` to `https://malikmohamedgamer-bit.github.io/Tcyoon-RNG/` gave code 000).

## Honest status
The live URL has **never been fetched** by me, so I do not claim it works.
