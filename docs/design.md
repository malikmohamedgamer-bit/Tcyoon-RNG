# Design brief

Written before the redesign. The "before" screenshots (`docs/before/`) show why: five themes that differ only in the 3D floor
colour, the same dark rounded boxes everywhere, emoji for icons, system fonts, six identical stat cards, and a Roll button that is just
one of many buttons inside a panel.

## Goals
1. **One clear primary action.** The Roll button is always on screen, large, and visually unlike every other control.
2. **Strong hierarchy.** Money is the biggest number on screen; then income; then everything else. Panels are for decisions, not decoration.
3. **Five different worlds.** Switching the theme changes the whole interface (fonts, panel construction, button shape, icon stroke,
   decoration), not just a tint. Remixed regions (region 6, 7, …) keep the base theme's construction and shift its accent hue.
4. **Accessible by construction.** Text contrast ≥ 4.5:1, UI boundaries ≥ 3:1, a 3 px focus ring with 2 px offset in every theme, targets ≥ 44 px,
   motion only where it carries meaning and none under reduced motion, rarity never by colour alone.
5. **No external requests.** Fonts are shipped as files in `vendor/fonts/`, icons are drawn in code (`src/ui/icons.js`).

## What to avoid
* System fonts as the look (the UI font is a chosen face; system fonts are only the last fallback).
* The default "dark rounded rectangle with a 1 px border and a drop shadow" repeated for every element.
* Purple/blue gradients, gradient text, glassmorphism blur as decoration, neon-on-everything.
* Emoji as icons (they change per platform and cannot be themed). Unicode rarity symbols are drawn as SVG shapes too.
* Grids of identical cards with identical shadows: cards differ by rarity (border weight/style, not only colour) and by role.
* Centring everything. Numbers are right-aligned or tabular; labels are left-aligned; the primary action is the only centred element.

## Scales (all themes)
| Token | Values |
|---|---|
| Spacing (`--s1`…`--s7`) | 4 · 8 · 12 · 16 · 24 · 32 · 48 px (× text-size setting) |
| Type (`--t1`…`--t7`) | 12 · 14 · 16 · 18 · 22 · 28 · 40 px; body 16 px; numbers use tabular figures |
| Radius | per theme: factory 2 · steampunk 10 · space 4 · sci-fi 0 (chamfered) · pixel 0 (stepped) |
| Elevation | none, `raised` (buttons), `float` (panels, tooltips, dialogs): one shadow recipe per theme |
| Motion | 120 ms ease-out for hover/press, 220 ms for panels sliding in, reels and cutscenes have their own timers (F7). Everything stops under reduced motion. Nothing flashes more than 3 times per second. |
| Targets | ≥ 44 × 44 px; dock buttons 56 px on touch |

## Colour tokens (set per theme in `src/ui/themes.css`)
`--bg` (behind the 3D view), `--panel`, `--panel-2` (inset surfaces), `--panel-hi` (raised), `--line`, `--text`, `--muted`, `--accent`, `--accent-text`
(text on the accent, computed for contrast), `--good`, `--bad`, `--focus`. High-contrast mode overrides all of them with black, white and yellow.
The accent comes from the region theme's palette unless the player picked an accent colour.

## Layout
* **Desktop (≥ 900 px):** status plate top-left (money large, then income, level bar, luck …); a **left rail** of icon+label menu buttons;
  the open panel on the right; the **Roll button bottom-centre**, with ×10 and auto-roll beside it.
* **Tablet (640–899 px):** the rail becomes a bottom bar; panel on the right, narrower.
* **Phone (< 640 px):** status plate on two lines; the open panel is a bottom sheet (≤ 55% of the height); the **Roll button sits above the bottom bar,
  full width**; menu bar scrolls horizontally if the Advanced UI shows many entries. Text is 12% larger by default.
* Empty states always say what to do next with one button ("Your backpack is empty. Press Roll.").

## Icons
One hand-drawn set, 24 × 24 grid, stroke based (stroke width, cap and join come from the theme: factory square/miter 2.4, steampunk round 2,
space round 1.5 with a faint glow, sci-fi miter 2 (cut corners), pixel crisp-edged 3). Icons exist for the menu, status chips, the 8 item types and
every item shape, mutations, monsters, bosses, currencies, rarity shapes and actions. Data files name icons by id; legacy emoji ids resolve through a table
so generated content never falls back to an emoji.

## Theme personalities
| Theme | Feels like | Fonts | Panels | Buttons | Signature details | Accent |
|---|---|---|---|---|---|---|
| **Factory** | a foundry control room | Barlow Condensed (display, uppercase, tracked), Atkinson Hyperlegible (text) | brushed-steel slab, 2 px edge, rivets in the corners | stamped plate with a bevel, hazard-stripe edge on the primary button | hazard stripes, rivets, stencil numbers | safety orange |
| **Steampunk** | a brass instrument case | IM Fell DW Pica (display, small caps), Atkinson Hyperlegible | dark leather with a double brass border, inner shadow | brass plate, pressed-in when active | gauge-style bars with tick marks, rivets | brass |
| **Space** | a spaceship HUD | Orbitron (display), Atkinson Hyperlegible | translucent navy with a thin cyan line and corner brackets | outlined with a faint glow, filled when active | scan-line header, tick-mark rules | cyan |
| **Sci-Fi** | a clean neon lab | Chakra Petch (display), Atkinson Hyperlegible | flat charcoal slab with chamfered corners and a neon bar on the left edge | chamfered flat plate, neon underline | cut corners, neon bar | lime |
| **Pixel** | an 8-bit arcade menu | Silkscreen (display), Atkinson Hyperlegible | chunky 4 px stepped border, hard offset shadow | stepped border that presses down 2 px | no radius, hard shadows, crisp icons | arcade yellow |

## Rarity in the UI
Name + shape icon + border weight/style are always shown (colour is a fourth cue). The colour-blind setting adds border *styles*. Higher rarity bands get thicker
borders, never only different hues.

## Review loop (how this was checked)
Screenshots of the same screen in every theme at phone (390 × 780), tablet (820 × 1100) and desktop (1366 × 768) were taken before (`docs/before/`) and after
(`docs/after/`), compared, and fixed over several rounds (the rounds and what was still weak are listed in `docs/design-review.md`). What still looks weak is stated there, not hidden.
