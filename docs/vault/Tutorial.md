---
tags: [system, tutorial]
date: 2026-10-30
status: implemented and tested
---
# Tutorial
Part of [[Architecture]]. Numbers: [[Formulas]]. Index: [[00 Start Here]].

**Files:** `src/sim/tutorial.js`, `data/tutorial.json`, `ui/tutorial.js`, `tips.js`, `sim/difficulty.js`, `sim/tips.js`. **Built in:** F1 (`3f2ab60`) and F2 (`c3fc7a6`).

* **16 steps**, each one sentence of at most 20 words (a test enforces this), advance by themselves when the condition holds (`statSince`, `earnedSince`, `flag`, `ack`). Runs in the real game; spotlight never blocks input or steals focus; announced to screen readers; pulse stops under reduced motion.
* **Skip** asks 'Skip the tutorial?' with *Keep learning* (default focus and Esc), *Skip for now* (Resume chip), *Skip and don't ask again*. Replay from Settings, Help and tutorial. Resumable, saved with the game; old saves never get a surprise tutorial.
* **Assists** so a step is never a dead end: roll-money top-up (once), one free roll (once), practice items (`practice:true`, worth $0), a scripted demo wave. 'Skip this step' after 20 s stuck. Rewards at three steps, exactly once per save via `tutorial.claimed`.
* **Tips**: one-time hints from `tips.json` (backpack full, first mutation, first refiner, first wave, bosses, first boss, rebirth ready, first rebirth, new layer, faster speed unlocked), not during the tutorial, off switch, 'Tips seen' page with ??? for unseen.
* **Difficulty**: first-run Relaxed/Standard dialog; six multipliers in `difficulty.json` ([[Decisions]]).
* **Evidence:** `tests/tutorial.test.js`, `e2e/f1-tutorial`, `e2e/f2-tutorial-walk` (all 16 steps with real clicks), `e2e/f9-new-player` (UI only to the first rebirth). **Bugs:** #30, #31, #32, #36. Not verified: whether a real first-time player finds it clear.
