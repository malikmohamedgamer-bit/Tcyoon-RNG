// Rewards panel: daily reward, playtime rewards, level milestones, rotating chests, quests, achievements.
import { ico } from './icons.js';
import { esc } from './dom.js';
import { allTasks, taskProgress, dailyStatus, playtimeList, milestoneList, chestSlots } from '../sim/quests.js';
import { describeReward } from '../sim/rewards.js';
import { formatDuration, now } from '../core/time.js';

export function createRewardsPanel(ctx) {
  const { game, ui } = ctx;
  const rowFor = (e) => e;
  void rowFor;
  return {
    id: 'rewards',
    label: 'Rewards',
    icon: 'gift',
    badge() {
      const s = game.state;
      const t = Date.now();
      return allTasks(s).filter((x) => taskProgress(s, x).done && !taskProgress(s, x).claimed).length + (dailyStatus(s, t).available ? 1 : 0) + chestSlots(s, t).filter((c) => !c.claimed).length;
    },
    view() {
      const s = game.state;
      const t = now();
      const daily = dailyStatus(s, t);
      const pt = playtimeList(s).filter((e) => !e.claimed).slice(0, 3);
      const ms = milestoneList(s).filter((e) => !e.claimed).slice(0, 3);
      const chests = chestSlots(s, t);
      const tasks = allTasks(s)
        .map((x) => ({ x, p: taskProgress(s, x) }))
        .sort((a, b) => Number(b.p.done && !b.p.claimed) - Number(a.p.done && !a.p.claimed) || Number(a.p.claimed) - Number(b.p.claimed) || b.p.ratio - a.p.ratio);
      const taskHtml = (kind) =>
        tasks
          .filter(({ x }) => x.kind === kind)
          .map(
            ({ x, p }) => `<li class="quest ${p.claimed ? 'muted' : ''}"><div><b>${esc(x.name)}</b> <small class="muted">${esc(x.desc || '')}</small><br>
              <small>${Math.min(p.value, p.target).toLocaleString('en-US', { maximumFractionDigits: 0 })} / ${p.target.toLocaleString('en-US')} · ${esc(describeReward(x.reward))}</small>
              <div class="bar" role="progressbar" aria-label="${esc(x.name)} progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.floor(p.ratio * 100)}"><i style="width:${p.ratio * 100}%"></i></div></div>
              <button data-act="claim-task" data-id="${esc(x.id)}" ${p.done && !p.claimed ? 'class="primary"' : 'disabled'}>${p.claimed ? `Claimed ${ico('check')}` : p.done ? 'Claim' : 'In progress'}</button></li>`,
          )
          .join('');
      return `<h2>${ico('gift')} Rewards</h2>
      ${ui.rwMsg ? `<p class="msg ${ui.rwMsg.kind || ''}" role="status">${esc(ui.rwMsg.text)}</p>` : ''}
      <div class="card"><b>${ico('calendar')} Daily reward</b> <span class="muted">streak ${s.rewards.daily.streak}${daily.available ? ` → ${daily.nextStreak}` : ''}</span><br>
        <button data-act="claim-daily" ${daily.available ? 'class="primary"' : 'disabled'}>${daily.available ? 'Claim today\'s reward' : 'Claimed — come back tomorrow'}</button></div>
      <details open><summary>${ico('box')} Rotating chests <small class="muted">(rotate every 6 h)</small></summary><div class="row2">${chests
        .map((c) => `<button data-act="open-chest" data-id="${c.slot}" ${c.claimed ? 'disabled' : 'class="primary"'}>${ico(c.icon)} ${esc(c.name)}${c.claimed ? ico('check') : ''}</button>`)
        .join('')}</div></details>
      <details open><summary>⏱️ Playtime rewards <small class="muted">(${formatDuration(s.playtime)} played)</small></summary><ul class="plain">${pt
        .map((e) => `<li class="quest"><span>${formatDuration(e.seconds)} <small class="muted">${esc(describeReward(e.reward))}</small></span><button data-act="claim-pt" data-id="${e.id}" ${e.ready ? 'class="primary"' : 'disabled'}>${e.ready ? 'Claim' : 'Locked'}</button></li>`)
        .join('')}</ul></details>
      <details><summary>${ico('trophy')} Level milestones</summary><ul class="plain">${ms
        .map((e) => `<li class="quest"><span>Level ${e.level} chest <small class="muted">${esc(describeReward(e.reward))}</small></span><button data-act="claim-ms" data-id="${e.id}" ${e.ready ? 'class="primary"' : 'disabled'}>${e.ready ? 'Claim' : 'Locked'}</button></li>`)
        .join('')}</ul></details>
      <details open><summary>${ico('scroll')} Quests</summary><ul class="plain quests">${taskHtml('quest')}</ul></details>
      <details><summary>${ico('medal')} Achievements</summary><ul class="plain quests">${taskHtml('achievement')}</ul></details>`;
    },
    act(name, el) {
      const id = el.dataset.id;
      const say = (r, okText) => (ui.rwMsg = r.ok ? { text: `${okText}${r.given ? ': ' + r.given.text : ''}`, kind: 'ok' } : { text: r.reason });
      switch (name) {
        case 'claim-task': say(game.claimTask(id), 'Quest reward claimed'); break;
        case 'claim-daily': say(game.claimDaily(), 'Daily reward claimed'); break;
        case 'claim-pt': say(game.claimPlaytime(id), 'Playtime reward claimed'); break;
        case 'claim-ms': say(game.claimMilestone(id), 'Milestone claimed'); break;
        case 'open-chest': say(game.openChest(Number(id)), 'Chest opened'); break;
        default:
      }
    },
  };
}
