# Bugs found and their proof of fix

A bug is marked **Fixed** only after the proof (a test or a run) was executed and passed.

| # | Found in | Bug | Proof of fix | Status |
|---|----------|-----|--------------|--------|
| 1 | M1 bignum | `a.div(b)` for two huge towers computed `a * (1/b)`; the reciprocal underflowed to 0 so `tower/tower` returned 0 instead of 1 | `tests/bignum.test.js` "numbers beyond double range" (`tower.div(tower) ≈ 1`) — failed before, passes after (div now works in log space) | Fixed |
| 2 | M1 bignum | `cmp()` returned `-0` for equal negative numbers; `Math.sign` based comparisons and `strictEqual(…,0)` broke | `tests/bignum.test.js` "comparison is a total order" and "JSON round trip" — failed before, pass after | Fixed |
| 3 | M1 rng | Restoring a saved RNG state re-ran the 12-step warm-up, so a restored stream did not continue where it stopped (would desync saved games from reproducible rolls) | `tests/rng.test.js` "state can be saved and restored mid-stream" — failed before, passes after | Fixed |
| 4 | M1 e2e | Canvas read-back in the smoke test returned a blank frame (WebGL drawing buffer is cleared after compositing) — a *test* bug, not a game bug | e2e smoke test now renders and reads in the same task; passes | Fixed (test) |
| 5 | M2 tiers | `tierFromLog(Infinity)` clamped the tier to 0 and then looped forever walking up to Infinity (hung the whole test run) | `tests/tiers.test.js` "luck has no cap" / "tierFromLog … inverse" (`tierFromLog(Infinity)` returns MAX_TIER instantly) — hung before, passes after | Fixed |
| 6 | M2 state | `deserializeState` used `num(it.uid, s.nextUid++)`; the default argument is evaluated eagerly, so every loaded item bumped `nextUid` (ids drift upward each load) | `tests/inventory.test.js` "save round trip keeps … nextUid" — failed (9 !== 5) before, passes after | Fixed |
| 7 | M2 balance | First level-up needed ~45 rolls (xp base 40) — too slow for the first minute | e2e "level up" test (80 rolls budget) failed; xp base lowered to 10, e2e passes, level 2 after ~11 rolls | Fixed |
| 8 | M3 placement | Auto-layout left a gap between the last lane item and the seller, so every lane was blocked and earned nothing | `tests/production.test.js` "autoLayout builds a working lane layout" (blocked.length 1 → 0, income > 0) — failed before, passes after | Fixed |
| 9 | M3 UI | Text input fired `change`, which re-rendered the panel between mousedown and click on "Save layout" (the click was lost); periodic refreshes also reset half-typed text | e2e "presets: save a layout… from the UI" failed before; now text fields update through `input` events without re-render, e2e passes | Fixed |
| 10 | M3 input | Default key bindings conflicted: Space = roll vs arena dash, Escape = cancel vs leave arena | `tests/input.test.js` "default bindings have no conflicts" found it; dash moved to Shift, leave-arena merged into cancel; test passes | Fixed |
