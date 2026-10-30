---
tags: [prompt]
date: 2026-10-30
status: verbatim
---
# Follow-up prompts, in order
Previous: [[Original Prompt]]. Index: [[00 Start Here]]. Genuine human messages only; hook and monitor notifications are not prompts (see [[Timeline]]).

## 1. Project continuation (tutorial, clarity, speed, Index, redesign, reveals, hosting), 2026-10-30 20:19 UTC
Led to the F1-F9 work in [[Milestones]].

~~~~text
You are continuing an existing project: the endless single-player RNG tycoon game
in this repo (Tcyoon-RNG, branch claude/confident-wozniak-8yxhum). Read README.md,
VERIFICATION.md, BUGS.md and CHANGELOG.md first, run the existing tests to
confirm the starting state, take screenshots of the current UI, then do the five
jobs below. Keep the same standards as before: pure simulation layer, data-driven
content, tests for logic, Playwright e2e, ESLint, no build step, relative paths
only, accessibility, and honest docs.

Context: the player feedback is that the game is confusing to get the hang of, and
that the UI looks generic and "AI-made". Fixing both is the main goal.

JOB 1: INTERACTIVE TUTORIAL
A new player must understand the game in about 3 minutes without reading anything.
1. A first-run guided tutorial inside the real game (no video, no wall of text).
   Each step makes the player do the thing, then advances automatically: roll once,
   open the backpack, place the item, watch money rise, buy the first upgrade, use
   a free roll, learn rarity/luck/mutations, watch a wave and the defence, see
   what rebirth is (shown early as "what's coming"), and learn fuse and sell.
   Each step spotlights the exact button or tile, with one plain sentence (max 20
   words).
2. Skippable at any step, but SKIPPING ASKS "ARE YOU SURE?". The confirmation says
   in plain words what they will miss, offers "Keep learning", "Skip for now" and
   "Skip and don't ask again", and tells them the tutorial can be replayed from
   Settings and Help at any time. The default focus is on "Keep learning".
3. Resumable after a reload, replayable, and never traps keyboard or touch users.
   If a step cannot be completed (for example no money), the tutorial gives the
   player what is needed (a scripted starter roll or bonus money, documented).
4. Small tutorial rewards, granted exactly once, tested.
5. One-time contextual tips for each new system (backpack full, first mutation, first
   refiner, first boss, first rebirth, first prestige layer). Tips are data-driven
   JSON, listed on a "Tips seen" page, and can be turned off.
6. Accessible: keyboard operable, screen-reader announcements for each step,
   reduced motion (no pulsing highlights), touch and desktop, text scale.

JOB 2: EASIER TO UNDERSTAND
1. Progressive disclosure: a simple default UI that shows only the systems the
   player has unlocked, with an "Advanced UI" setting that shows everything.
2. A first-run choice between "Relaxed" and "Standard" difficulty. Relaxed is
   documented in the README with exact differences (for example slower waves, more
   forgiving penalties, a bit more income) and is tested by the simulators.
3. Plain-language labels and a tooltip or tap-popover on every stat, item type,
   rarity, mutation and number. Tooltips are data-driven and keyboard reachable.
4. "Why is my income this?": click income to see each item's contribution and
   every multiplier in order as a simple list.
5. A searchable in-game Help page: how the game works, a glossary, rarity table with
   odds, rebirth and prestige explained with an example, formulas in plain words.
6. Clear feedback: every blocked action says why and offers the fix in one click
   where possible. Undo for placing, moving and selling (short window, documented).
7. Friendly default number format and larger default text on small screens.
8. A "new player" e2e that follows only what the UI tells it (no internal test
   hooks) and reaches the first rebirth, to prove the guidance works.

JOB 3: GAME SPEED IS UNLOCKED, NOT GIVEN
1. Speed starts at 1x. Higher speeds (2x, 4x, 8x, and further, endless) are unlocked
   through progress (levels, upgrades or rebirth-tree purchases), with the unlock
   rules in data and shown in the UI ("Unlocks at level 10").
2. A speed selector shows locked options as locked, with the requirement. Speed
   affects the simulation only, never saves or the real clock. Offline
   progress is unaffected and not double-counted.
3. Keep the old accessibility "slower game speed" option available to everyone
   (slow speeds are never locked), and tell the player about the difference.
4. Tests: unlock rules, pure speed scaling, that saves and offline math stay
   correct at every speed, and an e2e that proves a locked speed cannot be chosen.

JOB 4: INDEX (COLLECTION BOOK) AND UI REDESIGN
1. Index: a collection book of everything the player has discovered: item types,
   rarities, mutations, weapons, monsters and bosses. Undiscovered entries show as
   silhouettes with "???" and a hint. Each discovered entry shows its picture,
   rarity, description, the odds, how many were found, and the first time found.
   Search, filter by type/rarity/theme, and a completion percentage per section.
   Completion rewards are granted exactly once. The Index must work with endless
   generated content (paged, virtualized lists, no huge DOM) and be tested.
2. UI redesign. The current UI looks generic. Do a real art-direction pass:
   - Write a short design brief in docs/design.md before changing anything:
     each theme's personality, type scale, spacing scale, colour tokens, panel
     and button styles, icon style, motion rules, and what to avoid.
   - Avoid the generic look: no default system fonts and plain rounded boxes, no
     random purple/blue gradients, no emoji used as icons, no
     identical card grids with the same shadow. Use hand-drawn code icons (inline SVG
     or canvas), a consistent icon set, and a distinctive look per theme (factory:
     riveted metal, steampunk: brass and gauges, space: glowing HUD, sci-fi:
     clean neon panels, pixel: chunky pixel UI). Fonts must be shipped as files
     or built from CSS so there is no external request.
   - Strong hierarchy: one clear primary action on screen (the roll button), readable
     numbers, clear grouping, good empty states, and consistent spacing.
   - Responsive from phone to desktop, and still accessible (contrast ratios,
     focus rings, reduced motion, text scale).
   - Review the result with screenshots at phone, tablet and desktop sizes in every
     theme, before and after, in a visual review loop. Fix what looks wrong and
     keep the before/after screenshots in docs/. Be honest about what still looks weak.

JOB 5: SLOT-MACHINE ROLL ANIMATION AND RARE CUTSCENES
1. Roll animation: every roll plays a slot-machine style reel spin that decelerates
   and lands on the result. The result is decided by the seeded roll BEFORE the
   animation starts; the animation is purely cosmetic and can never change an
   outcome. Tick sounds as it slows, and a satisfying stop.
2. x10 and x100 rolls show a fast multi-reel version and a summary; the best item
   is highlighted. Auto-roll uses a short version so it does not slow the game.
3. Rare cutscenes, by tier. The rarer the item, the bigger the moment: a short
   camera move, lighting change, particles, themed text and a sound sting. Define
   tiers in data (for example: none, flash, short cutscene, full cutscene) and make
   it work for endlessly generated rarities by formula. Include a one-time "first
   time you found this" flourish tied to the Index.
4. Always skippable (tap or key), with a setting to change cutscene length or turn
   cutscenes off. Never block the game for more than a few seconds, never lose
   the item if the player skips, and queue them sensibly when many rare items come
   at once (show only the best, summarize the rest).
5. Accessibility and safety: a reduced-motion version (no spinning blur or camera
   shake), no flashing more than 3 times per second, captions for the sounds, and a
   screen-reader announcement of the result.
6. Make animations and cutscenes pure state machines driven by the fixed-step
   timer, so they are testable in Node and in e2e (deterministic skip and
   fast-forward hooks). Dispose every temporary 3D object. The soak test must
   include many rolls and cutscenes.

JOB 6: ONLINE 24/7 (free static hosting)
1. Target: GitHub Pages deployed by GitHub Actions. Verify that the site works from a
   sub-path (https://<user>.github.io/<repo>/): no absolute paths anywhere.
2. Merge the feature branch into main so the deploy workflow runs. (I authorize
   merging into main for this. Open a PR and merge it if that is safer, but do not
   force-push or rewrite history.) Enable Pages with source "GitHub Actions" using
   the GitHub tools or the gh CLI if available. If you cannot enable it, tell me
   the exact clicks instead of guessing.
3. After every deploy, a CI job smoke-tests the LIVE URL with Playwright (loads,
   canvas renders, no console errors, a roll works, the save writes) and fails
   loudly if it does not. Add a daily scheduled workflow that does the same. Report
   the live URL in the final summary only after you fetched it and saw it work.
4. Versioning: add a version string and an "A new version is available, reload"
   notice. Prevent stale cached files from breaking the game on static hosting.
5. Saves: explain in the README and in the game that saves live in the player's
   browser for that web address. Make Export Save easy to find, remind gently after
   major progress, and make sure a local save imports into the hosted version.
6. Add a 404 page, social preview meta tags, a favicon from code, and a README section
   on deploying and custom domains.
7. State honestly in the docs that this is static hosting: always reachable, and
   progress while the tab is closed comes from offline progress, not a server.

RULES
- Show output before claiming something works. Say clearly what could not be run or
  verified. Never mark a feature verified without evidence.
- Work in milestones with a commit and push after each:
  (1) tutorial engine, skip confirmation, data
  (2) tutorial steps, tips, Relaxed mode
  (3) tooltips, income breakdown, Help, feedback, undo, simple/advanced UI
  (4) unlockable game speed
  (5) design brief and UI redesign (all themes, screenshot review loop)
  (6) Index
  (7) slot animation and rare cutscenes
  (8) hosting, CI smoke tests, versioning, docs, live-URL verification
  (9) new-player e2e, soak with animations, bug fixes, VERIFICATION.md,
      requirements review against this whole prompt
  After each: lint, unit tests, e2e, headless-browser screenshots, update
  CHANGELOG and VERIFICATION.md, commit, push.
- Add any bug found to BUGS.md with proof of fix. Do not break existing tests; if an
  intended UI change breaks an old test, fix the test and say so.
- Final summary: what works, what is partial, what could not be verified (real GPUs,
  phones, other browsers, screen readers, audible sound, taste and fun), and the
  live URL.
~~~~

## 2. Vault request (this note set), 2026-10-30 ~23:01 UTC
Not yet in the on-disk transcript when the vault was started, so quoted from the message as received.

~~~~text
Do NOT stop or restart the soak run that is in progress. Leave it running.

1. First write docs/vault/Resume Point.md (max 25 lines) from git log and git status: the
   current milestone and step, the background run in progress (its command and how to check
   its result), what you will do with that result, and the unfinished items in order.
   Commit and push.

2. While the soak runs, build an Obsidian vault in docs/vault/ from the REAL record, not from
   memory or the compaction summary. Sources, in order:
   a. Your session transcript on disk:
      find /root/.claude/projects -name "*.jsonl" -printf "%T@ %s %p\n" | sort -n | tail
      Do not read it whole. Write a small script in the scratchpad that extracts my messages,
      your replies, commands, test and soak results, errors and decisions into chunks of
      about 200 KB, and read one chunk at a time.
   b. git log --stat and git show for each milestone commit.
   c. The markdown files in the repo (README, CHANGELOG, BUGS, VERIFICATION, docs/).
   Work chunk by chunk, and after each chunk write or extend the matching notes, then
   commit and push, so nothing is lost if you compact.

   Make markdown notes with [[wiki-links]] and YAML front matter (tags, date, status):
   - 00 Start Here.md: index of every note, current status, next steps (link to Resume Point)
   - Original Prompt.md and every follow-up prompt, verbatim, in order
   - Timeline.md: everything that happened in order, with dates and commits
   - Decisions.md: each decision, the reason, and alternatives rejected, including my answers
   - Architecture.md, and one note per system (rolling, backpack, placement, mutations,
     levels, rebirth and prestige, combat and bosses, offline progress, stores, rewards,
     game speed, index, tutorial, UI design, slot animation and cutscenes)
   - Formulas.md: every scaling formula and soft cap with worked examples
   - Milestones.md: for each milestone what was built, files touched, how it was verified,
     real numbers from the output, and the commit
   - Bugs.md, Dead Ends.md (what failed and why), Testing.md (every command and what it
     proves, and what could not be verified), How To.md, Deploy.md, Glossary.md,
     Open Issues.md, Ideas.md
   Quote real outputs and numbers where useful. Do not include secrets or tokens. Do not
   change any game code.

3. Then check the soak result and CONTINUE exactly from Resume Point.md: finish the
   remaining docs and milestones with the same standards as before. Add the soak result to
   the vault (Testing.md and Open Issues.md) and update 00 Start Here.md.

Keep messages short.
~~~~

## Interruptions that were not prompts
* `[Request interrupted by user for tool use]` (23:00 UTC): I had been waiting in a long shell loop for test results; the user stopped that tool call. Nothing was changed by it.
* Stop-hook feedback, repeated ("uncommitted changes ... commit and push"): automated; each time resolved by committing and pushing.
