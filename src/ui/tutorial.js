// Tutorial overlay: spotlight + one-sentence card for the current step (state machine: sim/tutorial.js).
// The overlay never blocks input (the dim is visual only, pointer-events: none), it never steals focus,
// and the card is ordinary tab-able content, so keyboard and touch users are never trapped.
import { esc, choiceDialog } from './dom.js';
import { announce } from './a11y.js';
import { typeOf } from '../sim/items.js';
import { DIRS } from '../sim/production.js';
import { STEPS, STUCK_SECONDS } from '../sim/tutorial.js';

export function createTutorialUI({ game, shell, placement, gfx, root }) {
  root.innerHTML = `
    <div class="tut-dim" hidden></div>
    <div class="tut-ring" hidden></div>
    <section class="tut-card" role="region" aria-label="Tutorial" hidden>
      <div class="tut-head"><span class="tut-count"></span><span class="tut-dots" aria-hidden="true"></span></div>
      <p class="tut-text"></p>
      <div class="tut-actions"><button type="button" class="primary" data-tut-act="ack" hidden>Got it</button><button type="button" data-tut-act="step" hidden>Skip this step</button><button type="button" class="link" data-tut-act="skip">Skip tutorial</button></div>
    </section>
    <button type="button" class="tut-resume" data-tut-act="resume" hidden>▶ Resume tutorial</button>`;
  const $ = (s) => root.querySelector(s);
  const dim = $('.tut-dim');
  const ring = $('.tut-ring');
  const card = $('.tut-card');
  const resume = $('.tut-resume');
  let shownId = null;
  let asking = false;

  // ---------------------------------------------------------------- targets
  const q = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    // a target inside a scrolling panel must be on screen: scroll it into view (never smooth: reduced-motion safe)
    const box = el.closest('.panel');
    if (box) {
      const b = box.getBoundingClientRect();
      const e = el.getBoundingClientRect();
      if (e.top < b.top || e.bottom > b.bottom) el.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && !el.closest('[hidden]') ? r : null;
  };
  const dockRect = (id) => q(`#dock [data-panel="${id}"]`);
  const state = () => game.state;
  const free = (x, y) => !Object.values(state().items).some((it) => it.loc === 'placed' && it.x === x && it.y === y);
  const inside = (x, y) => x >= 0 && y >= 0 && x < state().base.side && y < state().base.side;
  const firstFree = (prefer = []) => {
    for (const [x, y] of prefer) if (inside(x, y) && free(x, y)) return [x, y];
    for (let y = 0; y < state().base.side; y++) for (let x = 0; x < state().base.side; x++) if (free(x, y)) return [x, y];
    return null;
  };
  const tileRect = (cell) => {
    if (!cell) return null;
    const c = gfx.cellToScreen(cell[0], cell[1]);
    const n = gfx.cellToScreen(cell[0] + 1, cell[1]);
    const d = Math.max(44, Math.hypot(n.x - c.x, n.y - c.y) * 1.1);
    return { left: c.x - d / 2, top: c.y - d / 2, width: d, height: d };
  };
  const tileFor = (type) => {
    if (type === 'seller') {
      const dr = Object.values(state().items).filter((it) => it.loc === 'placed' && typeOf(it) === 'dropper').pop();
      if (dr) {
        const [dx, dy] = DIRS[dr.dir || 0];
        return firstFree([[dr.x + dx, dr.y + dy]]);
      }
    }
    if (type === 'turret') return firstFree([[3, 3], [3, 2], [2, 3]]);
    return firstFree([[1, 1], [2, 2], [0, 0]]);
  };
  const placeTarget = (type) => {
    if (placement.state.placing != null) return tileRect(tileFor(type));
    const uid = state().bag.find((u) => typeOf(state().items[u]) === type);
    const btn = uid != null && q(`#panels [data-act="place"][data-uid="${uid}"]`);
    return btn || (shell.openId === 'backpack' ? null : dockRect('backpack')); // panel open but not drawn yet: no vague highlight
  };
  const TARGETS = {
    roll: () => q('#panels [data-tut="roll"]') || dockRect('roll'),
    'dock:backpack': () => dockRect('backpack'),
    'dock:refinery': () => dockRect('refinery') || dockRect('settings'),
    'dock:rebirth': () => dockRect('rebirth') || dockRect('settings'),
    'dock:settings': () => dockRect('settings'),
    'place:dropper': () => placeTarget('dropper'),
    'place:seller': () => placeTarget('seller'),
    'place:turret': () => placeTarget('turret'),
    'chip:income': () => q('#hud [data-chip="income"]'),
    'chip:luck': () => q('#hud [data-chip="luck"]') || q('#hud'),
    'buy:cheapest': () => q('#panels [data-act="buy-up"]:not([disabled])') || (shell.openId === 'shop' ? q('#panels h2') : dockRect('shop')),
    'item:first': () => q('#panels article.item') || dockRect('backpack'),
    fuse: () => q('#panels [data-tut="fuse"]') || dockRect('backpack'),
    sell: () => q('#panels [data-act="sell"]') || dockRect('backpack'),
    base: () => tileRect([Math.floor(state().base.side / 2), Math.floor(state().base.side / 2)]),
  };

  // ---------------------------------------------------------------- skip confirmation
  async function askSkip() {
    if (asking) return;
    asking = true;
    const sum = game.tutorial.summary();
    const topics = sum.topics.slice(0, 8).map((t) => `<li>${esc(t)}</li>`).join('');
    const more = sum.topics.length > 8 ? `<li>…and ${sum.topics.length - 8} more</li>` : '';
    const choice = await choiceDialog({
      title: 'Skip the tutorial?',
      html: `<p>You will miss a quick tour of:</p><ul>${topics}${more}</ul>
        ${sum.rewardCount ? `<p>It also gives ${sum.rewardCount} small starter reward${sum.rewardCount > 1 ? 's' : ''} (a few free rolls and some starter money) that you would not get.</p>` : ''}
        <p class="muted">You can replay it any time from <b>Settings → Help and tutorial</b>.</p>`,
      choices: [
        { id: 'keep', label: 'Keep learning', primary: true },
        { id: 'later', label: 'Skip for now' },
        { id: 'never', label: "Skip and don't ask again" },
      ],
      focus: 'keep',
      escape: 'keep',
    });
    asking = false;
    if (choice === 'later' || choice === 'never') {
      game.tutorial.skip({ forever: choice === 'never' });
      announce(choice === 'never' ? 'Tutorial skipped. You can replay it from Settings.' : 'Tutorial paused. Use Resume tutorial to continue.');
      shownId = null;
    }
    update(true);
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tut-act]');
    if (!b) return;
    switch (b.dataset.tutAct) {
      case 'ack':
        game.tutorial.ack();
        break;
      case 'step':
        game.tutorial.skipStep();
        break;
      case 'skip':
        askSkip();
        break;
      case 'resume':
        game.tutorial.resume();
        shownId = null;
        break;
      default:
    }
    update(true);
  });

  // ---------------------------------------------------------------- per-frame
  let acc = 1;
  function update(force = false, dt = 0) {
    acc += dt;
    if (!force && acc < 0.1) return;
    acc = 0;
    const tut = state().tutorial;
    resume.hidden = tut.status !== 'paused';
    const step = tut.status === 'active' ? STEPS[tut.step] : null;
    if (!step) {
      dim.hidden = ring.hidden = card.hidden = true;
      shownId = null;
      return;
    }
    if (shownId !== step.id) {
      shownId = step.id;
      announce(`Tutorial step ${tut.step + 1} of ${STEPS.length}. ${step.text}`);
      if (step.panel && shell.openId !== step.panel) shell.open(step.panel);
    }
    $('.tut-count').textContent = `Step ${tut.step + 1} of ${STEPS.length}`;
    $('.tut-dots').innerHTML = STEPS.map((_, i) => `<i class="${i < tut.step ? 'done' : i === tut.step ? 'now' : ''}"></i>`).join('');
    $('.tut-text').textContent = step.text;
    $('[data-tut-act="ack"]').hidden = step.done.kind !== 'ack';
    $('[data-tut-act="step"]').hidden = !(tut.t >= STUCK_SECONDS && step.done.kind !== 'ack');
    card.hidden = false;
    card.dataset.step = step.id; // the ring below is positioned for this step (tests wait on it)
    const r = (TARGETS[step.target] || (() => null))();
    if (r) {
      ring.hidden = dim.hidden = false;
      const pad = 6;
      Object.assign(ring.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
      // keep the card away from the spotlight: the other vertical half of the screen
      const mid = r.top + r.height / 2;
      card.dataset.pos = mid < window.innerHeight / 2 ? 'bottom' : 'top';
    } else {
      ring.hidden = dim.hidden = true;
      card.dataset.pos = 'top';
    }
  }

  return { update, askSkip, get asking() { return asking; } };
}
