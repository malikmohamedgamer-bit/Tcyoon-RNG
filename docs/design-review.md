# Design review log

The loop: build, screenshot every theme at phone (390 x 780), tablet (820 x 1100) and desktop (1366 x 768), look, fix, repeat.
`docs/before/` is the interface before this pass, `docs/after/` the result, `docs/compare-*.png` put them side by side (top row before, bottom row after).

## Round 0 - before (see docs/before)
Five themes that differ only in the 3D floor colour. The same dark rounded boxes everywhere, emoji icons, system font, six identical chips, a Roll button that is one of many buttons
inside a panel, a menu that wraps into three rows on a phone and covers the panel.

## Round 1 - first build of the new system
Seen: the five themes already read as five places (hazard stripes and rivets, brass double borders, cyan brackets, neon chamfers, stepped pixel borders) and the Roll button dominates.
Fixed: the NEW badge overlapped rail labels (moved to the corner); IM Fell's old-style digits made "$41" read like "$4l" (numbers use the clear face in that theme).

## Round 2 - phone
Seen: the tip card covered the open panel; Orbitron and Silkscreen are wide, so the money chip, the Roll label and the menu labels overflowed; the Undo chip wrapped into a narrow column.
Fixed: tips become a banner under the status plate on phones; wide display faces get smaller sizes on phones; menu buttons are wider (the bar scrolls sideways); the Undo chip sizes to its text.

## Round 3 - panels, dialogs, tutorial
Seen: first-run pace dialog was a wall of text; phones started with a panel covering the base.
Fixed: the pace dialog lists the differences as short bullets; phones and tablets start with a clear view and no panel open.

## Round 4 - measured, not eyeballed (`e2e/f5-design.spec.js`)
Found by the checks: the accent-text colour rule (from the earlier accessibility milestone) used a wrong luminance threshold and put white text on bright pink at 2.7 : 1
(fixed, BUGS.md #37); a tier symbol appeared as plain text in the shop (BUGS.md #38); two data icons had no drawing (BUGS.md #39); the rebirth buttons still printed an emoji (BUGS.md #40).
After the fixes every theme passes: text >= 7 : 1, muted >= 4.5 : 1, accent text >= 4.5 : 1, accent as UI colour >= 3 : 1, 3 px focus ring, targets >= 44 px,
no horizontal scroll and an unobstructed Roll button at all three sizes, also at 160% text.

## What still looks weak (honest list)
* **The 3D scene is untouched.** The floating props around the base are the old placeholder look; the new UI sits in front of the same low-poly scene.
  Of the five themes the 3D floor and props differ only by colour and prop shape; this pass did not redesign the 3D art.
* **Stacked messages.** When a tip, several unlock toasts and the Undo chip appear together (easy to provoke when levels jump), they pile up bottom-left and top-centre and on a phone
  can cover the top of the open panel for a few seconds. They are rare and short-lived in normal play, but there is no queue that spaces them out.
* **Icon quality.** The icon set is drawn by hand in code at 24 px; it is consistent but plain. Several item icons (pump, vat, mine, prism) are only recognisable with their label.
  The 8 boss icons share 4 drawings; the monster icons are abstract.
* **Sci-Fi and Space are close cousins** (dark panel, bright accent, wide display face). The chamfered corners and the left neon bar separate them, but at a glance on a small screen they are the least different pair.
* **Dense panels.** Settings, Rebirth and Combat are still long scrolling lists. They are styled, not redesigned; a real redesign would split them into tabs.
* **Tablet portrait** wastes space: the panel is 22 rem wide and the base is partly hidden behind it.
* **Pixel theme text** (Silkscreen at 12-16 px) is hard to read for long passages; it is only used for headings, labels and numbers, body text stays in Atkinson Hyperlegible.
* Not seen by anyone else: all judgments above are mine, from screenshots rendered in headless Chromium with software WebGL.
