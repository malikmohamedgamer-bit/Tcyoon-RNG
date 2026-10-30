---
tags: [bugs]
date: 2026-10-30
status: 42 fixed, 1 open
---
# Bugs
Source of truth: `BUGS.md` in the repo root (each row there has its proof). This note groups them and says how each was found. Back to [[00 Start Here]]. Related: [[Testing]], [[Dead Ends]], [[Open Issues]].

## Found by unit tests (written first, failing before the fix)
* **#1** bignum `tower.div(tower)` returned 0 (reciprocal underflowed). Fix: divide in log space.
* **#2** `cmp` returned `-0` for equal negatives. **#3** RNG restore re-ran the warm-up, so a restored stream did not continue.
* **#5** `tierFromLog(Infinity)` looped forever (hung the whole test run). **#6** `deserializeState` default argument bumped `nextUid` on every load.
* **#8** auto-layout left a gap before the seller so every lane earned nothing. **#10** default keys clashed (Space roll vs dash; Escape cancel vs leave arena), found by the conflict detector.
* **#11** `addXp` skipped level rewards when a call site forgot the hook. **#12** `levelReward(NaN)`.
* **#30** a tip seen at playtime 0 stored as `0` (falsy) and fired again. **#32** the fuse assist counted higher-tier belts (proof: test fails with the tier check removed, 7 pass / 1 fail). **#39** two data icons had no drawn replacement.

## Found by the simulators (the important ones: balance exploits)
* **#13 level-reward money printer** (level 264 and 10^48 money at the first bot decision); **#14 price arbitrage** (sell value used the *current* level price: 1Qa to 1.44Qa); **#15 runaway luck stacking** (10^51 luck at level 28,000; never-prestige income 10^12280 fell to a ~10^5 plateau); **#16 reward items of tier floor(L/5)** (tier 198 at level 990).
* **#19 rolling punished itself**: price grew as 1.16^level so never rolling beat rolling by day 1.5 (x10^-1.7 at 36 h). New price `10*(1+(L-1)/10)^3`; check 3 then passes (x10^10.8 at 12 h, x10^10.1 at 36 h).
* **#20** mass level-ups looped per level (millions of iterations): closed form above 64 levels, "10^300 XP is instant" (< 200 ms).
* **#21-23** combat: forecast discounted an unreachable group (66/90 agreement, now >= 90%); wave timer restarted after each fight (waves every ~90 s, offline disagreed: 8 vs 10 waves); dash with no direction went diagonally (`0 || -1`).

## Found by the soak tests
* **#29** page froze forever on the first roll with tower-sized XP multipliers (10^^4+): `levelReachable` looped on an infinite estimate. The new regression test is killed by a 20 s timeout against the old code. Fix: `MAX_LEVEL = 1e12`.

## Found by e2e and UI checks
* **#9** text input `change` re-rendered the panel between mousedown and click (click lost). **#24** `<details>` re-collapsed on every re-render. **#25** Escape did not close a panel. **#26** nickname draft leaked to the next item (proof not run against unfixed code). **#28** dock overflow at 1.3x text.
* **#31** spotlight pointed at a clipped button; **#33** tap on a focusable term showed then hid its tooltip; **#34** re-render dropped focused term; **#36** hidden dock button made the spotlight land on Settings (failed 3/3 runs, then 10 consecutive runs pass).
* **#37 contrast**: `readableOn()` used white text for luminance <= 0.4; bright pink got **2.68:1**. Threshold 0.179; test covers 11 accents and 60 regions.
* **#38** shop label printed a tier symbol as text; **#40** rebirth buttons printed an emoji. Both found by the "no emoji anywhere" scan in every theme.

## Test bugs (not game bugs, listed honestly)
#4 canvas read-back blank; #17 old page's unload handler re-saved the faked offline timestamp; #18 first "Buy $200" hit a rotating booster; #27 and #35 assumed no wave drop during a fast-forward (flaky 2 of 5 and 2 of 6); #41 captions test raced the next-frame start (36 consecutive runs pass); #42 my soak assertion (< 120 reveal nodes) was too tight (136 during a 30-result summary).

## Open
**#43** deploy refused: Pages source and environment branch rule need repository-owner changes. See [[Deploy]] and [[Open Issues]].
