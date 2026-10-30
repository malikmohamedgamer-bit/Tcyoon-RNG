---
tags: [decisions]
date: 2026-10-30
status: complete
---
# Decisions
Format: decision, reason, alternatives rejected. The user did not answer any question during the session (no clarifying question was asked); the only user inputs are the prompts in [[Original Prompt]] and [[Follow-up Prompts]]. Decisions the prompt itself made are marked **(prompt)**. Back to [[00 Start Here]].

## Stack and structure
* **No build step, vanilla ES modules, Three r170 vendored as one file, import map (prompt).** Reason: static hosting and no dependencies. Rejected: CDN (the prompt forbids external requests for the final design), bundler.
* **Pure simulation layer (prompt).** `src/sim`, `src/gen`, `src/core` never touch the DOM or Three, so Node tests, simulators and offline progress use the same code. Rejected: logic in UI handlers.
* **Closed-form maths wherever a loop could be huge**: exact one-pass production solver, offline progress, mass level-ups, tier from log-odds. Reason: endless numbers (bug #20, #29 proved loops freeze).
* **Layered Big number** with saturation instead of Infinity, NaN to 0, x/0 = 0.

## Economy decisions (all made after the simulator showed a problem)
* Sell value capped at 50% of the roll price and priced at the level the item was **created** (bug #14).
* Multiplier-type stats use a polylog soft cap `1 + base*(1 + log10(V)/2)^2` instead of a power law (bug #15). Alternative rejected: lowering numbers only; the simulator still showed runaway.
* Level-reward luck additive, generator stacking additive; reward items tiered relative to luck (bugs #15, #16).
* Roll price polynomial `10*(1+(L-1)/10)^3` instead of exponential (bug #19).
* Levels capped at 10^12 (bug #29). Rejected: infinite levels (cannot be represented exactly).
* The manual-combat avatar is invulnerable (enemies only attack the base): a deliberate simplification, documented.

## UX decisions in the follow-up
* **Tutorial inside the real game**, steps advance by themselves, assists instead of dead ends; practice items worth $0 so replay cannot farm. Rejected: a separate sandbox or scripted video.
* **Skip dialog default focus on "Keep learning"** (prompt) with Esc mapped to it.
* **Relaxed mode = six named multipliers only** (income x1.15, waves 90 s, enemy hp x0.85, loss x0.5, free roll 90 s, boss time x1.25) so the README table can be tested by the simulators. I reported honestly that only waves/penalty/boss time/income give real relief (enemy hp does not change the beatable wave).
* **Speed starts at 1x; slow speeds never locked; fast speeds unlocked by rules in data**, shared with disclosure in `sim/unlock.js`. Locked speeds are refused in the simulation, not only the UI.
* **Friendly number format as default** (`12,345`, then K/M/B/aa), larger text on phones by default.
* **Advanced UI toggle** (progressive disclosure): new players see six panels; e2e helper turns Advanced UI on so older tests keep meaning.
* **Undo anti-farming rule**: a sale can be undone only if you can pay back and have not levelled up since; XP taken back.
* **Redesign**: write `docs/design.md` first (prompt), themes differ in construction (not tints), icons drawn in code, fonts shipped, persistent Roll button.
* **Reveal**: outcome decided by the seeded roll first; animation has its own RNG; pure state machines on the fixed-step timer. Cutscene level by `surprise = log10(odds) - log10(luck)` so it works for endless rarities and shrinks as luck grows.
* **Index** virtualised, built from light descriptors described lazily; rewards through a ledger.

## Hosting decisions
* **Immutable `v/<version>/` folders + rewritten `index.html`** (stale-cache prevention), `version.json`, update banner that saves before reloading.
* **Merge into `main`**: authorised by the prompt. I used the GitHub tools to create `main` from the feature branch (`main` did not exist). No PR was possible (nothing to compare), no force-push, no history rewrite.
* **Not claiming the live URL works**: the sandbox proxy blocks `github.io`; the deploy job was refused. Reported as unverified.

## Process decisions
* Changed old tests only where the UI change was intended, and listed each in the CHANGELOG: `input.test.js` rebinding key (KeyZ is now Undo), default number format `friendly`, ghost label asserts the icon, `Auto-roll Lv 3` text, rebirth button name "Buy 1", audio caption test exempts the tick, speed test ignores `index` timestamps, disclosure test includes Index.
* Never marked something verified without evidence; corrected my own VERIFICATION.md draft (see [[Milestones]] M9).
* Replaced a meaningless income-ratio check for Relaxed (10^5.4 in an exponential economy) with a time-based one.
* The soak assertion for reveal DOM was loosened to 200 nodes and moved last, because a 30-result summary legitimately has ~140 nodes (#42).
