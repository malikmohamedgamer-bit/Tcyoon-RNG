---
tags: [open, status]
date: 2026-10-30
status: current
---
# Open issues
Back to [[00 Start Here]]. Evidence: [[Testing]], [[Deploy]], [[Bugs]].

## Blocking the follow-up goal (JOB 6)
1. **Pages is not enabled and the deploy is refused** (bug #43). Needs: Settings, Pages, Source: GitHub Actions; Settings, Environments, `github-pages`, allow `main`; re-run. I cannot change repository settings with my tools.
2. **Live URL never fetched.** The sandbox proxy blocks `github.io`. Until the host is allowed (environment Network access) and the deploy works, `smoke-live` has never run and I cannot report a live URL. The expected address by convention is `https://malikmohamedgamer-bit.github.io/Tcyoon-RNG/`; **unverified**.
3. `main` exists only because I created it from the feature branch (same SHA as the F8 commit). Later feature commits are not on `main`; merging them needs a PR or a fast-forward by the owner (no force-push or history rewrite was done or will be).

## Not verified (cannot do from this environment)
Real GPUs/frame rates; phones; Firefox and Safari; screen readers; audible sound; whether the tutorial, redesign, cutscenes are clear, good-looking and fun to real players.

## Known weak spots (my own list)
* 3D scene art untouched by the redesign; Sci-Fi and Space themes close; dense panels (Settings, Rebirth, Combat); plain icons; stacked toasts; tablet portrait space; Pixel small text (`docs/design-review.md`).
* Tiers capped at 10^15 and levels at 10^12 (finite arithmetic), so 'endless' is practically endless, not literal.
* Manual combat avatar invulnerable by design. Offline waves do not model oscillating win/loss.
* Clock moved forward gives up to 10 years of offline progress. Two tabs writing one save: last write wins.
* The 30-day economy simulation was not re-run after the level cap change; `--quick` was.
* Heap rises ~4 MB over a 5-minute soak and flattens; not proof of no leak.
* `#26` regression test was not run against the unfixed code.

## Remaining work (see [[Resume Point]])
Only the final summary to the user. VERIFICATION.md (F8, F9, requirements review), CHANGELOG F9 and the BUGS #42 proof were written after the soak passed.

## Soak result for the record
The final F9 5-minute soak **passed** (1,512 actions, heap 7.0 to 11.2 MB flat, 0 errors). Full e2e **114 passed**, unit **304/304**, lint clean. Details in [[Testing]].
