# Bugs found and their proof of fix

A bug is marked **Fixed** only after the proof (a test or a run) was executed and passed.

| # | Found in | Bug | Proof of fix | Status |
|---|----------|-----|--------------|--------|
| 1 | M1 bignum | `a.div(b)` for two huge towers computed `a * (1/b)`; the reciprocal underflowed to 0 so `tower/tower` returned 0 instead of 1 | `tests/bignum.test.js` "numbers beyond double range" (`tower.div(tower) ≈ 1`) — failed before, passes after (div now works in log space) | Fixed |
| 2 | M1 bignum | `cmp()` returned `-0` for equal negative numbers; `Math.sign` based comparisons and `strictEqual(…,0)` broke | `tests/bignum.test.js` "comparison is a total order" and "JSON round trip" — failed before, pass after | Fixed |
| 3 | M1 rng | Restoring a saved RNG state re-ran the 12-step warm-up, so a restored stream did not continue where it stopped (would desync saved games from reproducible rolls) | `tests/rng.test.js` "state can be saved and restored mid-stream" — failed before, passes after | Fixed |
| 4 | M1 e2e | Canvas read-back in the smoke test returned a blank frame (WebGL drawing buffer is cleared after compositing) — a *test* bug, not a game bug | e2e smoke test now renders and reads in the same task; passes | Fixed (test) |
