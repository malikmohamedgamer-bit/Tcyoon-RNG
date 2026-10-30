---
tags: [dead-ends]
date: 2026-10-30
status: complete
---
# Dead ends
What failed or was abandoned, and why. Back to [[00 Start Here]]. Related: [[Bugs]], [[Decisions]].

## Economy simulator
* **Whole-run simulator took too long** (2-hour run profiled first). Per-rebirth probes and exploit baselines were the cost: the never-prestige baseline ran auto-layout over a huge base at every decision. Fix: coarser decision interval for baselines, probe only the first 8 rebirths then every 8th, run long jobs in the background.
* **Manual state restore after each probe hung**; replaced by a serialize/deserialize clone (safer, and it exercises the save path).
* **First luck fix was not enough**: hoard seed 5 still reached 10^5582. Reproduced and inspected the state instead of guessing; a second runaway (stacking and power-law multipliers) was found. After the fixes the seed plateaued at ~10^4.6 income after 4 h.
* An edit of mine silently removed the 'no stall' and 'layer 1 cannot be skipped' checks; restored.
* **Relaxed income-peak check** was meaningless in an exponential economy (10^5.4); replaced by time to the third prestige layer.

## Tests that lied
* Canvas read-back blank (#4), unload handler overwrote the faked offline timestamp (#17), wrong `$200` button (#18), flaky `bag0+1` assumptions (#27, #35), races with panel re-renders (the tutorial button detached; fixed by measuring both rects in one `evaluate`), captions race (#41), soak assertion too tight and ordered first (#42), `page.clock.fastForward('504:00:00')` rejected (only numbers, mm:ss, hh:mm:ss) so I pass milliseconds.
* A `git stash` used to prove a regression test did nothing (the fix was already committed); proved instead by temporarily removing the tier check (7 pass / 1 fail).

## Docs written from memory
* My first README had wrong claims (layer threshold, drag buttons, save key, damage type, mutation slots); the first VERIFICATION.md draft had claims about commit history, a missing M4 screenshot, a production-vs-tick comparison I had not run and an invented known issue. Caught by re-checking against the repo.
* Today's vault: my first fuse example in [[Formulas]] used the wrong rule (`identical` is a flat +15% when all items share a template); corrected after reading `fuseChance`.

## Process slips
* M4: ESLint failed, which skipped the docs step in a chained command while the commit still went through; follow-up commit.
* Sound: `note()` took scale degrees but some sounds passed semitone-sized values, giving a 4 Hz boss growl; the audio test caught it.

## Hosting
* **Could not verify the live URL**: sandbox proxy blocks `github.io` (CONNECT 403). **Could not enable Pages**: no tool for repository settings. `main` did not exist; created from the feature branch. See [[Deploy]].
* Waiting in a long shell loop for test results was interrupted by the user (23:00); I should use background monitors instead of blocking loops.

## Not tried
Firefox/Safari runs, real GPUs, phones, screen readers: see [[Testing]].
