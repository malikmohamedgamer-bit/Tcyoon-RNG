// One-time tip cards (data/tips.json). Non-modal, polite, one at a time; never steals focus.
import { esc } from './dom.js';
import { announce } from './a11y.js';

export function createTipsUI({ root, game, shell }) {
  const queue = [];
  let showing = null;
  let timer = 0;
  root.setAttribute('role', 'status');

  function next() {
    clearTimeout(timer);
    showing = queue.shift() || null;
    if (!showing) {
      root.innerHTML = '';
      return;
    }
    const t = showing;
    root.innerHTML = `<section class="tip-card" aria-label="Tip: ${esc(t.title)}">
      <b>💡 ${esc(t.title)}</b><p>${esc(t.text)}</p>
      <div class="tip-actions">${t.action ? `<button type="button" class="primary" data-tip-act="go">${esc(t.action.label)}</button>` : ''}<button type="button" data-tip-act="ok">Got it</button><button type="button" class="link" data-tip-act="off">Turn tips off</button></div></section>`;
    announce(`Tip: ${t.title}. ${t.text}`);
    timer = setTimeout(next, 25000);
  }
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tip-act]');
    if (!b || !showing) return;
    if (b.dataset.tipAct === 'go' && showing.action.panel) shell.open(showing.action.panel);
    if (b.dataset.tipAct === 'off') game.setSetting('tips', false);
    next();
  });
  return {
    push(tip) {
      queue.push(tip);
      if (!showing) next();
    },
    get showing() {
      return showing;
    },
  };
}
