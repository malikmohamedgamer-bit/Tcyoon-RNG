---
tags: [timeline, history]
date: 2026-10-30
status: complete up to F9 (in progress at the end)
---
# Timeline
Everything happened on **2026-10-30** (UTC times from the transcript and `git log`). Branch `claude/confident-wozniak-8yxhum`. Index: [[00 Start Here]]. Details per milestone: [[Milestones]]. Bugs: [[Bugs]].

## Part 1: the original game (prompt: [[Original Prompt]])
| Time | What happened | Commit |
|---|---|---|
| 13:19 | Original prompt arrives. Environment checked: empty repo on the feature branch, Node 22.22, npm 10.9, Playwright 1.63 with Chromium, npm works through the proxy. | |
| 13:24 | Scaffold; Three.js r170 vendored as one 690 KB file (no CDN, no build). Core modules: `bignum`, `rng`, `time`, `loop`, `save`. | |
| 13:26 | First two real bugs found by tests: `div` of towers returned 0, `cmp` returned `-0` ([[Bugs]] #1, #2). 18 bignum tests pass; RNG restore bug (#3); 36/36 core tests. | |
| 13:31 | M1 done: pixel render target, five themes, scene. Canvas read-back blank = test bug (#4). | `8247209` M1 |
| 13:36 | Task list for nine milestones created. `tierFromLog(Infinity)` hang found and fixed (#5); 86 tests. | |
| 13:45 | M2: rolling, items, mutations, backpack, fuse, levels, roll/backpack UI. v1 save fixture captured from the real serializer. | `ba80302` |
| 13:53 | M3: placement, production solver, refinery, v1 to v2 migration, instanced items. Input conflict detector found two default-key clashes (#10). 115 tests. | `880620a` |
| 13:55 | M4: level rewards (hand-written plus generated), exactly-once ledger. | `5b4cb04`, `d2889f4` |
| 13:57 to 15:14 | M5 and M6 together: rebirth, endless layers, **economy simulator** which found four exploits (#13-16), then #19 (rolling punished itself); shops, quests, rewards, closed-form offline. Long runs done in the background while M6 tests were written. | `59f38d8` |
| 15:14 to 15:20 | M7: combat, weapons, bosses, combat simulator (found #21-23). | `4b8fce7` |
| 15:25 | **Context compaction #1** (during M8). | |
| 15:39 | M8: customization, accessibility, touch, audio. All 55 e2e pass before commit; #24-28. | `53731fe` |
| 15:45 | M9: the long-numbers soak found a real freeze (#29); 5-minute soak passed. | `0bf0419` |
| 16:02 to 16:05 | Final verification run; I corrected several claims in VERIFICATION.md that I had written from memory. 217 unit, 56 e2e. | `0677e83`, `bae9fcc` |
| 16:05 | Final summary of part 1: all nine milestones pushed, no PR opened. | |

## Part 2: follow-up project (prompt: [[Follow-up Prompts]], section 1)
| Time | What happened | Commit |
|---|---|---|
| 20:19 | Follow-up prompt arrives (six jobs, nine milestones F1-F9). Starting state confirmed: lint clean, 217 unit tests. Baseline "before" screenshots at phone/tablet/desktop in five themes. | |
| 20:29 | F1: tutorial engine, skip dialog, practice items, difficulty groundwork. 63 e2e pass. | `3f2ab60` |
| 20:34 to 20:49 | F2: tips (bug #30), 16 tutorial steps walked by real clicks (#31, #32), speed engine, Relaxed/Standard. | `c3fc7a6` |
| 21:03 to 21:16 | F3: tooltips, income breakdown, Help, undo, progressive disclosure, friendly numbers (#33, #34, #36). 264 unit. | `3d3af58` |
| 21:20 | F4: unlockable game speed, HUD button. | `52e503c` |
| 21:21 to 21:47 | F5: design brief written first, fonts, 90 icons, new CSS and five themes, four review rounds (#37-40). 89 e2e + 271 unit. | `fc506c8` |
| 21:48 to 21:56 | F6: Index. 96 e2e + 281 unit. | `b6ae1de` |
| 21:57 to 22:10 | F7: reel and cutscene state machines, 3D flourish. 109 e2e + 296 unit. | `462c386` |
| 22:10 to 22:21 | F8: sub-path audit, `stamp` script, update banner, workflows, live-smoke spec validated against a local hosted-layout server. | `9a6a6de` |
| 22:21 to 22:26 | `main` created from the feature branch with the GitHub tools; CI `test` and `e2e` passed on GitHub; `deploy` was refused before any step (see [[Deploy]], bug #43). Sandbox proxy blocks `github.io`. | |
| 22:27 | F9 (part): UI-only new-player e2e to first rebirth; soak extended (#41, #42). | `58646bd`, `90d9f52` |
| 22:49 | **Context compaction #2.** | |
| 22:56 | Third 5-minute soak PASS (see [[Testing]]). Lint clean, unit 304/304. | |
| 23:00 | I waited in a long shell loop; the user interrupted the tool call. Stop-hook asked to commit. | |
| 23:01 | Vault requested ([[Follow-up Prompts]], section 2). Resume Point written. | `32b2bfc`, `eeaa469` |

Not prompts: the repeated "Stop hook feedback" messages (resolved each time by committing and pushing) and the monitor/background-task notifications.
