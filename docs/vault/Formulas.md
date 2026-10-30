---
tags: [formulas, reference]
date: 2026-10-30
status: matches README "How the game works" as of F9
---
# Formulas
Every scaling formula and soft cap, with a worked example. Constants live in `src/data/*.json`; the prose copy is the README section "How the game works". Worked numbers below were computed by me with plain arithmetic from these formulas (not read from the game), except where marked *from a test or run*. Back to [[00 Start Here]]. Systems: [[Rolling]], [[Levels]], [[Rebirth and Prestige]], [[Combat and Bosses]].

## Rolling
* **Draw.** `u` uniform in (0,1]; tier = highest `t` with `odds_t <= luck / u`. So `P(tier >= t) = min(1, luck / odds_t)`. Example: a "1 in 1,000" tier at luck 1 has probability 0.1%; at luck 10 it is 1%.
* **Luck** `= (1 + 0.03*(level-1)) * upgrades * boosters * reward luck * prestige/tree * generator auras`. Level 21: 1.6x, level 101: 4.0x from level alone.
* **Pity** (two levels): after 30 rolls with no "1 in 8" or better, the next is guaranteed one; after 200 rolls, a "1 in 120" or better. Scales with luck; an upgrade can reduce it (floor 10%).
* **Roll price** `= 10 * (1 + (L-1)/10)^3`. L=1: $10; L=5: $27.4; L=11: $80; L=31: $640; L=101: $13,310. Polynomial on purpose (bug #19).
* **Free rolls:** one per 120 s (Relaxed: 90 s), cap 3. Unlocks: x10 at level 5, x100 at 15, auto-roll at 3 (one roll per 0.6 s when affordable and the backpack has room).
* **Tiers beyond the 12 hand-made:** `log10(odds)` and `log10(value)` extended by a quadratic, up to tier 10^15 (soft limit, see [[Open Issues]]).

## Backpack and selling
* **Slots** `= 20 + 8n + floor(n^1.4)` for backpack tier n, price `400 * 3.2^n`. n=1: 29 slots for $1,280; n=2: 38 for $4,096; n=5: 69 for $134,218.
* **Sell value** `= roll price at the item's creation level * min(50%, 4%*(1+tier) + 10%*mutations)`. Tier 0, no mutation: 4%; tier 3: 16%; tier 3 + 1 mutation: 26%; tier 20 + 2 mutations: capped at 50%. The cap proves "roll then sell" never prints money (test in `tests/rewards.test.js`).
* **Fuse** 3-10 items (`economy.json` `fuse`): success `= min(90%, 30% + 10%*(n-3) + 15% if all items share one template) + pity`, pity +5% per failure up to +30% (`fuseChance` in `src/sim/inventory.js`). Examples: 3 mixed items 30%; 5 mixed 50%; 5 of the same template 65%; 10 of the same template 30+70+15 = 115% capped at 90%.

## Item stats
`V` = tier value. Exponents: rate `V^0.25`, value `V^0.75`, throughput cap `V^0.3`, flat add `V^0.9`, damage `V`.
* **Soft cap for multiplier-type stats** (multiplier, refiner, seller bonus, generator aura, luck, xp): `1 + base*(1 + log10(V)/2)^2`. With base 1: V=10 gives 3.25, V=10^6 gives 17, V=10^12 gives 50. Without it, stacking power-law multipliers outgrew rebirth (bug #15).
* **Mega-tile bonus** (base larger than the max grid): `1 + 1.5*(1 - 0.97^mega)`, asymptote 2.5x. mega=10: 1.39 (about +39%); mega=100: 2.43.
* **Mutation slots** `= 1 + floor(tier/4)`, level up to 5, one per group per item. **Hybrid** secondary effect at 40% strength; **variant** stats x0.8 to x1.3.

## Production (exact)
Along a path each item applies, in order: throughput cap, flat add, refine, multiply; a seller cashes out. Functional graph, so income is solved in one pass and is constant while nothing changes (which makes offline closed-form).

## Levels
* `xpForLevel(L) = 25 * 1.16^(L-1) * (1 + L/4)`. L=1: 31.2 XP; L=2: 43.5; L=10: 332.8; L=30: 15,726.8. (`economy.json`: base 25, growth 1.16, levelLinear 4, rollXp 1, sellXp 0.5, tierBonus 0.25.)
* Rewards: money `(0.5 + L/50)` roll prices, plus free rolls, slots, luck (additive), expansions, gear slots, tier items relative to luck (`typicalTier(luck)+1..2`). Consumables divided by XP multiplier. >64 level-ups resolved in closed form. `MAX_LEVEL = 1e12`.

## Rebirth
* **Threshold:** layer 0 needs 1,000,000 run money; layers 1 and 2 need 100 and 400; generated layers `100*4^(k-1)` (k=3: 1,600; k=4: 6,400; k=5: 25,600).
* **Gain** `= floor((R/threshold)^0.5) * (1 + 0.15*total_{k+1}^0.6)`. Example: R = $4M at threshold $1M gives 2; R = 9M with 100 of the next currency gives 3 * 10.13 = 30.
* **Multiplier** `= 1 + a*total^b`, b about 0.7 (diminishing returns). Tree: 12 nodes per layer, cost `cost*growth^level`.

## Combat
* Wave every 60 s from level 4 (start to start; Relaxed 90 s). Enemy HP `= 12 * V((w-1)/3) * template hp` (Relaxed x0.85). Attack on base removes `dpsFrac` of max HP per second.
* Boss n = equivalent wave `8 + 5n`, HP x30, 2 mechanics (+1 every 5 bosses). Loss penalty `min(2% of money, 30 s of income)` (Relaxed x0.5).
* *From the combat simulator:* a tier-t build beats wave 3t (min margin 3 waves) and loses before 3t+18 (max overshoot 9).

## Offline
`money += income/s * seconds`, split at booster expiries; negative elapsed ignored; clamp 10 years; welcome-back after >= 20 s. Tested vs tick-by-tick, relative error < 1e-6 (*from `tests/offline.test.js`*).

## Shop
Upgrade price `baseK * rollPrice * growth^level`. Rotating shop (date seed): 3 items at 80% of expected roll cost, 2 half-price boosters, 1 half-price upgrade. Example from the first shop screenshot: a Legendary item at $2.4K = 0.8 x $10 x 300.

## Game speed
Speed multiplies simulated time only. Fixed step `0.05 s`; above 4x the step grows to `(speed/4)*0.05 s` so work per frame stays bounded: 8x: 0.1 s, 16x: 0.2 s, 64x: 0.8 s. Combat is sub-stepped at <= 0.1 s. Unlocks: 2x L10, 4x L30, 8x first rebirth, then 2^k needs `k-2` rebirths from 16x on.

## Reveal and cutscenes
`surprise = log10(odds of tier) - log10(your luck)`. Flash >= 1.7 (about 1 in 50), short >= 3.0 (1 in 1,000), full >= 4.5 (1 in 30,000). Example: a 1-in-1,000 tier is "short" at luck 1 (3.0), but only 2.0 (a flash) at luck 10. Reel: spin 0.5 s, decelerate 1.1 s (quick: 0.1 s + 0.3 s). Cutscene lengths: flash 0.9 s, short 2.4 s, full up to 4 s. Flash veil: 28% white for 110 ms, at least 0.4 s apart, so at most 3 per second.

## Index completion
Reference sets: 27 item templates, 12 hand-made rarities, hand-made mutations, weapons, monsters, first 10 bosses. Rewards at 25/50/75/100% per section plus all-sections.
