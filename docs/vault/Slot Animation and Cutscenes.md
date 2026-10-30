---
tags: [system, reveal]
date: 2026-10-30
status: implemented and tested
---
# Slot Animation and Cutscenes
Part of [[Architecture]]. Numbers: [[Formulas]]. Index: [[00 Start Here]].

**Files:** `src/sim/reveal.js`, `data/cutscenes.json`, `ui/reveal.js`, `render/reveal3d.js`, `core/audio.js`. **Built in:** F7 (`462c386`).

* Outcome first: `doRoll` decides and stores the item, then the reveal plays. The reveal has its own RNG for filler symbols; a unit test proves the game RNG state and next roll are identical with and without animation.
* Pure state machines (reel, batch, cutscene, manager) driven by the fixed-step loop, with skip and fast-forward hooks. x10/x100: up to five mini-reels then a summary highlighting the best; auto-roll uses the quick version and never a full-screen cutscene; several results during a scene become one summary.
* Cutscene level by `surprise = log10(odds) - log10(luck)` (flash >= 1.7, short >= 3.0, full >= 4.5), first Index find lifted to at least a flash. Camera push-in, tint, particle burst, sting, themed text per region.
* Safety: <= 3 flashes/s (measured in the browser), reduced motion = still card <= 1.6 s, captions for stop and stings, result announced once. 3D objects created in `begin()`, disposed in `end()`.
* **Evidence:** `tests/reveal.test.js` (15), `e2e/f7-reveal.spec.js` (12; 25 cutscenes + 40 auto reveals leave GPU audit and DOM unchanged). Soak runs rolls and reveals (reveal DOM nodes sampled: max 134). **Bug:** #41 (test).
* Not verified: how it feels; the stings were never heard.
