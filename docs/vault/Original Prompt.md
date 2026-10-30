---
tags: [prompt]
date: 2026-10-30
status: verbatim
---
# Original prompt (first message of the session)
Received 2026-10-30T13:19:19.086Z (transcript line 2). Verbatim, unedited. Next: [[Follow-up Prompts]]. Index: [[00 Start Here]].

~~~~text
Build a complete, playable single-player RNG tycoon game for the browser, in the
spirit of Roblox "roll and place" tycoons, in 3D. The player rolls for random
items, places them on a 3D base, and the base earns money automatically. Money
buys more rolls, upgrades, backpack space and rebirths. Enemies attack the base,
so weapons matter. Everything is endless: levels, prestige layers, numbers, luck,
money, bosses and monsters. Work in /home/user/<repo>. Create the GitHub repo
and a feature branch, and commit and push there.

STACK
- Vanilla JS ES modules, no build step, no backend, fully single player.
- Three.js pinned and vendored (no CDN needed at runtime), loaded through an
  import map. All art is built from code (primitives, procedural textures,
  emoji/icons in the UI). No image or model files.
- Pixel look: render the 3D scene to a low-resolution target with nearest-neighbour
  upscaling (a setting). Low-poly shapes. Themes: factory, steampunk, space, sci-fi,
  pixel. Each prestige region uses one theme (palette, base floor, prop shapes,
  skybox colour, music/SFX flavour) and the themes cycle and remix forever.
- A pure simulation layer with no DOM and no Three.js, so Node can run it. The
  renderer only reads simulation state.
- localStorage saves with a schema version, migrations, a backup of corrupt saves,
  text export/import, and an in-memory fallback.
- Node test runner (or Vitest) for pure logic, Playwright for e2e, ESLint.
- npm install && npm run dev works. Relative paths only, so it deploys to GitHub
  Pages. Add a GitHub Actions workflow that runs lint and unit tests and deploys to
  Pages on push to main.

FILE STRUCTURE (adjust where a better split exists, and say why)
index.html, src/main.js,
src/core/{loop,save,input,audio,bignum,rng,time}.js,
src/sim/{economy,rolling,inventory,placement,production,mutations,refiners,
         leveling,rebirth,combat,bosses,offline,rewards,quests,shop}.js,
src/gen/{items,mutations,monsters,bosses,layers,names,themes}.js  (seeded procedural),
src/data/*.json (tiers, item templates, mutation rules, refiners, weapons, enemy
  templates, boss templates, themes, rewards, quests, shop, backpacks),
src/render/{scene,base,items,enemies,effects,camera,pixelate}.js,
src/ui/{hud,roll,backpack,shop,rebirth,combat-ui,settings,a11y,touch}.js,
tests/*.test.js, e2e/*.spec.js,
scripts/{serve,simulate-economy,simulate-combat}.js,
README.md, CHANGELOG.md, BUGS.md, VERIFICATION.md.

GAMEPLAY

1. ROLLING. Spend money to roll. Also a FREE roll every couple of minutes (the
   timer keeps running offline, rolls accumulate up to a cap that grows with
   upgrades). Each roll gives a random item: a rarity tier, a type, and zero or more
   mutations. Odds are data-driven, shown in the UI, and shaped by LUCK. Luck
   boosters are purchasable and rollable items and are endless: luck has no cap, and
   rarity tiers are generated so there is always a rarer tier above the best one.
   Auto-roll and roll-x10/x100 unlock with progress. A pity counter guarantees
   progress. All rolls are seeded and reproducible in tests.

2. ITEM TYPES (all rollable, all placeable): droppers (produce output), conveyors,
   multipliers, refiners (convert/upgrade output), sellers (turn output into money),
   upgraders, generators, turrets/defences. New types and variants are generated.

3. BACKPACK. Rolled items go into a backpack with a slot limit (not straight onto
   the base). The player chooses per item: place on the base, sell, or fuse. Backpacks
   are bought in a shop and are endless in capacity tiers. When it is full, rolls
   are blocked with a clear message and a one-click sell-duplicates option. Fuse
   N identical (or any) items into a higher-tier item under documented odds.

4. PLACEMENT. A 3D grid base. Select an item, a ghost shows on the grid (valid vs
   invalid is shown by shape/text as well as colour), click or tap to place, drag
   to move, rotate, sell and swap. Placement uses ray casting against the grid. The base grows
   (unlockable tiles) forever. Flow rule, written in the README: droppers produce,
   conveyors carry in their direction, each item on the path applies its effect in
   order, the seller cashes out. Show income per second per item and in total.
   Everything is fully customizable: layouts can be saved and loaded as presets.

5. MUTATIONS. Random modifiers on items and on produced output (for example Shiny,
   Golden, Cursed, Rainbow, and endlessly generated ones). Odds, effects and stacking
   rules are data-driven and documented. Refiners can re-roll, transfer or combine
   mutations.

6. LEVELS. Endless. XP from rolling, selling and combat. Each level-up unlocks
   slots, odds, rewards and options. Past the hand-written part, every level's
   rewards come from tested generation formulas.

7. REBIRTH AND PRESTIGE. Rebirth resets money, items and base for permanent
   multipliers and a rebirth currency spent in a rebirth tree. Then a second layer
   (prestige), a third, and so on, endlessly: layers beyond the first hand-made ones
   are generated by the same rules, each with its own theme region, names, tree and
   rules. Document every formula and soft cap.

8. COMBAT AND WEAPONS (real combat, kept deterministic and testable).
   - Weapons are rollable gear with tiers, mutations, damage types and special
     effects. Backpack and gear slots are limited.
   - Monsters attack the base in waves on a timer. Defence is automatic: turrets
     and equipped weapons fight without input, so the game stays automatic.
   - The player may also enter an ARENA to fight manually: move, aim, use weapons
     and abilities (keyboard, mouse, touch). Manual play is faster, never required.
   - Optional BOSSES: the player chooses when to fight. Bosses are generated
     endlessly with scaling stats and mechanics. They drop better weapons,
     upgrades and unique mutations.
   - Losing a wave costs a documented, small penalty (never deleting items or
     the save). Money and items are never negative or lost without a warning.
   - The combat simulation is pure and deterministic given a seed, so it can run
     in Node and be tested.

9. REWARDS AND QUESTS. Daily reward, playtime rewards, level milestones,
   achievements, 30+ quests, rotating reward chests. Every reward is granted
   exactly once. Rewards are tested.

10. STORES. Roll shop, backpack shop, gear and upgrade shop, luck boosters, and a
    rotating shop refreshed by date with a seed. Prices scale by a documented
    formula. Money never goes negative and a purchase checks the balance first.

11. OFFLINE PROGRESS (unlimited). When the game opens it computes all progress
    since the last save with CLOSED-FORM math (rate x time, free-roll accumulation,
    wave resolution by expected value), never by simulating each tick. It must stay
    fast for days, months or years away. Tests compare the closed-form result with the real
    simulation over short spans and prove they agree within a documented
    tolerance. Handle clock changes: negative elapsed time is ignored, and a time
    that is absurdly far in the future is clamped (documented). A welcome-back
    screen shows what you earned.

12. CUSTOMIZATION. Themes, accent colours, base skins, item skins/names, UI layout
    (show/hide panels), number format (suffix, scientific, engineering), camera
    options, resolution (pixel size), graphics quality, and save presets.

NUMBERS FOR AN ENDLESS GAME
- Implement a big-number type (mantissa + exponent, and an exponent that can itself
  become large) with add, sub, mul, div, pow, log, compare, floor, min/max, and
  formatting (K, M, B, ... then letters, then scientific). Unit-test overflow,
  NaN, Infinity, negative values, and JSON round trips.
- Money, rates, luck and damage can never be NaN or negative where they must not be.
- Write every scaling formula and soft cap in the README. Write an economy
  simulator (scripts/simulate-economy.js) that plays a scripted strategy for
  simulated days and proves: progress never stalls, no layer is skippable by a trivial
  exploit, rolling remains worthwhile, time-to-next-rebirth stays within the
  documented bounds, and numbers stay finite over very long runs. Write a
  combat simulator (scripts/simulate-combat.js) that proves the same for waves and
  bosses (a reasonable build can beat each tier, and difficulty never becomes
  impossible or trivial).

3D AND PERFORMANCE
- Use instanced meshes, shared geometry/materials, object pooling for enemies and
  projectiles, and a cap on live effects. Dispose everything when a scene or a
  base changes. Provide quality settings. A camera that pans, zooms and orbits the base.
- Lesson from a previous project: leaked GPU textures/geometries were found only by
  a soak test. Include a GPU-resource audit hook and test it.

ACCESSIBILITY AND INPUT
Keyboard navigation with visible focus, remappable keys with conflict detection,
reduced motion (no shake, flashes or camera sway), high contrast, colourblind-safe
rarity (rarity is also shown by name and icon, never colour alone), text scale,
ARIA live announcements for big rolls and events (throttled), captions for sounds,
44 px touch targets, touch controls for placement and the arena, no scroll/zoom
traps, game speed option, pause. Synthesized WebAudio sounds with mute and volume.

REQUIRED TESTING
1. Unit tests for all pure logic: rng, roll odds (check distributions over many
   seeded rolls), bignum, luck scaling, production flow, placement rules, backpack
   limits, fuse odds, mutations, refiners, levels, every prestige layer, combat,
   bosses, rewards (once only), shop prices, offline closed-form vs simulation, and
   save migration from a v1 fixture.
2. Playwright e2e: load, roll, item lands in backpack, place it, income rises, buy
   something and the balance drops, backpack limit blocks a roll, sell and fuse work,
   level up, a wave is defended, a boss fight is won, rebirth, a reward is granted
   once, reload keeps everything, and offline progress is applied.
3. The economy and combat simulation scripts.
4. A soak test: 5 minutes of simulated play with random inputs in a headless
   browser. Check console errors, JS heap growth, GPU resource growth, DOM node
   growth, NaN/Infinity, and the frame loop staying alive. Also a long-numbers soak
   (jump to very high layers and numbers) to check that formatting and rendering
   never break.
5. ESLint with bug-indicating warnings fixed.
6. BUGS.md: every bug found, with its proof of fix, marked Fixed only after the
   proof ran.
7. Do a requirements review against this whole prompt before the final summary and
   list any gap honestly.

RULES
- Show output before claiming something works. Say clearly when something could
  not run or be verified. Never mark a feature verified without evidence.
- VERIFICATION.md: a table of feature / how tested / result (pass, fail,
  unverified) / notes, plus a list of what could not be verified (real GPUs, real
  phones, other browsers, screen readers, audible sound, fun and balance).
- Build in 9 milestones. After each: run the tests, check in a real headless
  browser with screenshots, update CHANGELOG, commit, push.
  (1) core loop, save, bignum, rng, 3D scene + pixel renderer
  (2) rolling, items, backpack
  (3) placement, production, refiners, multipliers, mutations
  (4) levels and procedural generation
  (5) rebirth and endless prestige layers + economy simulator
  (6) stores, rewards, quests, offline progress
  (7) combat, weapons, bosses + combat simulator
  (8) customization, accessibility, touch
  (9) tests, soak, bug fixes, docs, requirements review
- Do not open a pull request unless I ask.

DELIVERABLES
npm install && npm run dev. README with setup, controls, all rules and formulas,
how to add an item, mutation, refiner, weapon, boss or prestige layer by data
only, how to run the tests and both simulators, how to deploy to GitHub Pages.
Plus VERIFICATION.md, BUGS.md, CHANGELOG.md, and a short final summary of what
works, what is partial, and what could not be verified.
~~~~
