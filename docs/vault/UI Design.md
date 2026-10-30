---
tags: [system, design]
date: 2026-10-30
status: implemented and tested
---
# UI Design
Part of [[Architecture]]. Numbers: [[Formulas]]. Index: [[00 Start Here]].

**Files:** `docs/design.md` (written before code), `docs/design-review.md`, `src/ui/style.css`, `themes.css`, `icons.js`, `fonts.css`, `vendor/fonts`. **Built in:** F5 (`fc506c8`, 81 files).

* Goals: one clear primary action (persistent Roll button), strong hierarchy (money largest), five different worlds, accessible by construction, no external requests.
* Themes: Factory (hazard stripes, rivets, Barlow Condensed), Steampunk (brass double border, IM Fell DW Pica), Space (HUD brackets, Orbitron), Sci-Fi (chamfered neon, Chakra Petch), Pixel (stepped borders, Silkscreen). Body text Atkinson Hyperlegible. Fonts 268 KB self-hosted.
* About 90 hand-drawn SVG icons on a 24 grid, legacy emoji ids resolve to SVG; tests scan the UI source and every panel in every theme for emoji.
* Layout: desktop left rail; tablet bottom bar; phone bottom sheet with full-width Roll above the bar; text 12% larger on phones.
* Review loop: before/after screenshots at 390x780, 820x1100, 1366x768 in all five themes (`docs/before/`, `docs/after/`, `docs/compare-*.png`), four rounds. Measured checks in `e2e/f5-design.spec.js` (text >= 7:1, muted >= 4.5:1, accent text >= 4.5:1, UI >= 3:1, 3 px focus ring, targets >= 44 px, no horizontal overflow, 160% text).
* **Honest weak spots** (from `design-review.md`): 3D scene untouched, stacked toasts, plain icons, Sci-Fi vs Space similar, dense panels (Settings, Rebirth, Combat), tablet portrait wastes space, Pixel small text. Judged only by me from software-rendered screenshots.
