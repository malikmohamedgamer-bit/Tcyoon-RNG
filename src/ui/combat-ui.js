// Combat panel (waves, gear, bosses, arena rush, manual control) and the in-fight overlay.
import { ico } from './icons.js';
import { esc } from './dom.js';
import { itemCard } from './itemcard.js';
import { buildDefenders, forecastWave, gearSlots, canFightBoss, WAVE_START_LEVEL, baseMaxHp, RUSH } from '../sim/combat.js';
import { bossDef } from '../gen/bosses.js';
import { mechanic } from '../gen/bosses.js';
import { isWeapon, itemTitle } from '../sim/items.js';
import { formatDuration } from '../core/time.js';
import { Big } from '../core/bignum.js';

export function createCombatPanel(ctx) {
  const { game, fmt, ui } = ctx;
  return {
    id: 'combat',
    label: 'Combat',
    icon: 'swords',
    view() {
      const s = game.state;
      const c = s.combat;
      const enc = s._enc;
      const defs = buildDefenders(s);
      const turrets = defs.filter((d) => d.kind === 'turret').length;
      const weapons = defs.filter((d) => d.kind === 'weapon').length;
      let dps = Big.fromNumber(0);
      for (const d of defs) dps = dps.add(d.dmg.mul(d.rof));
      const next = s.level >= WAVE_START_LEVEL ? forecastWave(s, c.wave) : null;
      const equipped = Object.values(s.items).filter((i) => i.loc === 'gear');
      const bagWeapons = s.bag.map((u) => s.items[u]).filter((i) => isWeapon(i));
      const slots = gearSlots(s);
      const boss = bossDef(c.bossIndex);
      const bcan = canFightBoss(s);
      const mechs = boss.mechanics.map((id) => `<li><b>${esc(mechanic(id).name)}</b> — ${esc(mechanic(id).text)}</li>`).join('');
      return `<h2>${ico('swords')} Combat</h2>
      ${ui.cmsg ? `<p class="msg ${ui.cmsg.kind || ''}" role="status">${esc(ui.cmsg.text)}</p>` : ''}
      ${s.level < WAVE_START_LEVEL ? `<p class="msg">Monsters start attacking at level ${WAVE_START_LEVEL}. Defence is automatic: turrets and equipped weapons fight without input.</p>` : ''}
      <p><b>Wave ${c.wave}</b> <span class="muted">· best ${c.bestWave} · ${enc ? `<b>fight in progress</b>` : s.level >= WAVE_START_LEVEL ? `next wave in ${formatDuration(Math.max(0, c.timer))}` : 'waiting'}</span><br>
      Base HP ${fmt(baseMaxHp(s))} · ${turrets} turrets · ${weapons}/${slots} weapons · defence ${fmt(dps)} dps</p>
      ${next ? `<p class="${next.win ? 'good' : 'bad'}">Forecast for wave ${c.wave}: <b>${next.win ? 'your defence should hold' : 'your defence is likely to fail'}</b> <small class="muted">(expected base damage ${next.baseDamage === Infinity ? '∞' : Math.round(Math.min(next.baseDamage, 9.99) * 100) + '%'})</small></p>` : ''}
      <div class="row2">
        <button data-act="rush" ${enc || s.level < WAVE_START_LEVEL ? 'disabled' : ''}>${ico('swords')} Arena rush (×${RUSH.slotMult} enemies, ×${RUSH.rewardMult} rewards)</button>
        ${enc ? `<button data-act="manual" aria-pressed="${enc.manual}">${enc.manual ? 'Release control (M)' : 'Take manual control (M)'}</button>` : ''}
        ${enc && enc.kind !== 'wave' ? '<button data-act="leave">Leave fight</button>' : ''}
      </div>
      <p class="muted">Manual control: WASD / arrows move, mouse aims, Shift dashes, Q nova, E shield. Weapons deal +50% damage while you control them. Never required.</p>
      <h3>${ico('trophy')} Bosses (optional — you choose when)</h3>
      <div class="card"><b>${ico(boss.icon)} ${esc(boss.name)}</b> <small class="muted">boss #${boss.n + 1} · equivalent to wave ${boss.wave} · HP ${fmt(boss.hp)}</small>
        <ul class="stats">${mechs}</ul>
        <small class="muted">Drops: a better weapon with a unique mutation, money and a free upgrade level.</small><br>
        <button class="primary" data-act="boss" ${bcan.ok ? '' : 'disabled'}>Challenge boss</button> ${bcan.ok ? '' : `<small class="bad">${esc(bcan.reason)}</small>`}</div>
      <h3>${ico('shield')} Gear (${equipped.length}/${slots})</h3>
      <div class="grid">${equipped.map((it) => itemCard(it, fmt, { actions: `<button data-act="unequip" data-uid="${it.uid}">Unequip</button>` })).join('') || '<p class="muted">No weapon equipped. Roll weapons (from level 4) and equip them from the backpack.</p>'}</div>
      ${bagWeapons.length ? `<h3>Weapons in your backpack</h3><div class="grid">${bagWeapons.map((it) => itemCard(it, fmt, { actions: `<button data-act="equip" data-uid="${it.uid}" ${equipped.length >= slots ? 'disabled' : ''}>Equip</button>` })).join('')}</div>` : ''}`;
    },
    act(name, el) {
      const uid = Number(el.dataset.uid);
      const say = (r, ok) => (ui.cmsg = r.ok ? { text: ok, kind: 'ok' } : { text: r.reason });
      switch (name) {
        case 'boss': say(game.startBoss(), 'The boss approaches!'); break;
        case 'rush': say(game.startRush(), 'Arena rush started!'); break;
        case 'manual': ctx.toggleManual(); break;
        case 'leave': game.leaveEncounter(); break;
        case 'equip': say(game.equip(uid), `Equipped ${itemTitle(game.state.items[uid])}`); break;
        case 'unequip': say(game.unequip(uid), 'Unequipped'); break;
        default:
      }
    },
  };
}

/** The always-on-screen fight overlay: base hp, enemies left, boss hp, ability buttons (touch friendly). */
export function createFightOverlay(root, ctx) {
  root.innerHTML = `<div class="fight">
    <div class="fight-top"><span data-f="title" class="chip"></span>
      <div class="bar fight-bar" role="progressbar" aria-label="Base health" aria-valuemin="0" aria-valuemax="100"><i data-f="hp"></i></div>
      <span data-f="enemies" class="chip"></span></div>
    <div class="bar boss-bar" role="progressbar" aria-label="Boss health" aria-valuemin="0" aria-valuemax="100" hidden><i data-f="boss"></i></div>
    <div class="fight-abilities" hidden>
      <button type="button" data-ab="dash" aria-label="Dash (Shift)">${ico('wind')}<small>Dash</small></button>
      <button type="button" data-ab="nova" aria-label="Nova blast (Q)">${ico('burst')}<small>Nova</small></button>
      <button type="button" data-ab="shield" aria-label="Shield (E)">${ico('shield')}<small>Shield</small></button>
      <button type="button" data-ab="manual" aria-label="Release manual control (M)">${ico('hand')}<small>Release</small></button>
    </div></div>`;
  const q = (k) => root.querySelector(`[data-f="${k}"]`);
  const ab = root.querySelector('.fight-abilities');
  const bossBar = root.querySelector('.boss-bar');
  const hpBar = root.querySelector('.fight-bar');
  root.querySelectorAll('[data-ab]').forEach((b) => {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (b.dataset.ab === 'manual') ctx.toggleManual();
      else ctx.ability(b.dataset.ab);
    });
    b.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (b.dataset.ab === 'manual') ctx.toggleManual();
        else ctx.ability(b.dataset.ab);
      }
    });
  });
  return {
    update(state) {
      const enc = state._enc;
      root.hidden = !enc;
      if (!enc) return;
      const kind = enc.kind === 'boss' ? `${ico('crown')} ${esc(enc.boss.def.name)}` : enc.kind === 'rush' ? `${ico('swords')} Arena rush · wave ${enc.wave}` : `${ico('shield')} Wave ${enc.wave}`;
      q('title').innerHTML = kind;
      const hp = Math.max(0, Math.min(1, enc.baseHp.div(enc.baseMax).toNumber()));
      q('hp').style.width = hp * 100 + '%';
      hpBar.setAttribute('aria-valuenow', String(Math.round(hp * 100)));
      q('enemies').textContent = `${enc.enemies.length + enc.queue.length} left`;
      const be = enc.bossEnemy;
      bossBar.hidden = !(enc.kind === 'boss' && be);
      if (be) {
        const f = Math.max(0, Math.min(1, be.hp.div(be.maxHp).toNumber()));
        q('boss').style.width = f * 100 + '%';
        bossBar.setAttribute('aria-valuenow', String(Math.round(f * 100)));
      }
      ab.hidden = !enc.manual;
      if (enc.manual && enc.avatar) {
        for (const k of ['dash', 'nova', 'shield']) {
          const b = root.querySelector(`[data-ab="${k}"]`);
          const cd = enc.avatar.cds[k];
          b.disabled = cd > 0;
          b.querySelector('small').textContent = cd > 0 ? `${Math.ceil(cd)}s` : k[0].toUpperCase() + k.slice(1);
        }
      }
    },
  };
}
