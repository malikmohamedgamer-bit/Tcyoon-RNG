---
tags: [index, status]
date: 2026-10-30
status: vault complete for F1-F8; F9 docs pending (see Resume Point)
---
# Start Here
Obsidian vault for **Tcyoon-RNG**, an endless single-player 3D roll-and-place RNG tycoon (vanilla ES modules, vendored Three.js, no build step). Built from the real record: session transcript on disk, `git log`/`git show`, and the repo's own markdown. Repo: `malikmohamedgamer-bit/Tcyoon-RNG`, branch `claude/confident-wozniak-8yxhum`.

## Current status (2026-10-30, late evening UTC)
* Original game M1-M9 and follow-up F1-F8 are committed and pushed; F9 is partly done.
* **Latest evidence:** lint clean; unit **304/304**; e2e **114 passed** (5.7 min); final 5-minute soak **PASS** (1,512 actions, heap 7.0 to 11.2 MB, 0 errors); GitHub runner: `test` and `e2e` success.
* **Not done / not verified:** the GitHub Pages deploy is blocked by repository settings (bug #43) and the live URL has **never been fetched** (sandbox cannot reach `github.io`). See [[Open Issues]], [[Deploy]].
* **Next steps:** follow [[Resume Point]].

## Notes
**Prompts:** [[Original Prompt]] · [[Follow-up Prompts]]
**Story:** [[Timeline]] · [[Milestones]] · [[Decisions]] · [[Dead Ends]]
**Quality:** [[Bugs]] · [[Testing]] · [[Open Issues]]
**Reference:** [[Architecture]] · [[Formulas]] · [[Glossary]] · [[How To]] · [[Deploy]] · [[Ideas]]
**Systems:** [[Rolling]] · [[Backpack]] · [[Placement]] · [[Mutations]] · [[Levels]] · [[Rebirth and Prestige]] · [[Combat and Bosses]] · [[Offline Progress]] · [[Stores]] · [[Rewards]] · [[Game Speed]] · [[Index]] · [[Tutorial]] · [[UI Design]] · [[Slot Animation and Cutscenes]]
**Resume:** [[Resume Point]]

## Source docs in the repo
`README.md`, `CHANGELOG.md`, `BUGS.md`, `VERIFICATION.md`, `docs/design.md`, `docs/design-review.md`, screenshots in `docs/shots/`, `docs/before/`, `docs/after/`.

## Caveats about this vault
Dates are one day (2026-10-30). Times are UTC from the transcript. Statements marked *inferred* are not proven. Numbers come from outputs I read; worked formula examples were computed by hand from the formulas. No secrets or tokens are stored.
