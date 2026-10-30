// Tooltips / tap popovers for every [data-tip="id"] element (ids resolve through sim/glossary.js).
// Hover or keyboard focus shows it, a tap toggles it on touch screens, Esc closes it. It is a real
// role="tooltip" element wired with aria-describedby, so screen readers announce it with the focused term.
import { tipFor } from '../sim/glossary.js';
import { esc } from './dom.js';

export function createTooltips({ root = document.body } = {}) {
  const tip = document.createElement('div');
  tip.id = 'tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  root.appendChild(tip);
  let current = null;
  let timer = 0;
  let shownAt = 0;

  function place(target) {
    const r = target.getBoundingClientRect();
    tip.style.left = '0px';
    tip.style.top = '0px';
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    let x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    let y = r.bottom + 8;
    if (y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 8);
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
    x = y = 0;
  }
  function show(target) {
    const info = tipFor(target.dataset.tip);
    if (!info) return;
    if (current && current !== target) current.removeAttribute('aria-describedby');
    current = target;
    tip.innerHTML = `<b>${esc(info.title)}</b><span>${esc(info.text)}</span>`;
    tip.hidden = false;
    shownAt = performance.now();
    target.setAttribute('aria-describedby', 'tooltip');
    place(target);
  }
  function hide() {
    clearTimeout(timer);
    tip.hidden = true;
    if (current) current.removeAttribute('aria-describedby');
    current = null;
  }
  const targetOf = (e) => (e.target.closest ? e.target.closest('[data-tip]') : null);

  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const t = targetOf(e);
    if (!t) return;
    clearTimeout(timer);
    timer = setTimeout(() => show(t), 220);
  });
  document.addEventListener('pointerout', (e) => {
    if (e.pointerType === 'touch') return;
    const t = targetOf(e);
    if (t) hide();
  });
  document.addEventListener('focusin', (e) => {
    const t = targetOf(e);
    if (t) show(t);
  });
  document.addEventListener('focusout', (e) => {
    if (targetOf(e)) hide();
  });
  // touch / click: tap a term to toggle its popover; tapping anywhere else closes it
  document.addEventListener('click', (e) => {
    const t = targetOf(e);
    if (!t) return hide();
    if (e.pointerType === 'mouse' || e.detail === 0) return; // mouse hover and keyboard focus already handle it
    // a tap on a focusable term focuses it (which shows the popover) and then clicks: that click must not toggle it off
    if (current === t && !tip.hidden) {
      if (performance.now() - shownAt > 400) hide();
    } else show(t);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !tip.hidden) hide();
    else if ((e.key === 'Enter' || e.key === ' ') && document.activeElement && document.activeElement.dataset && document.activeElement.dataset.tip && document.activeElement.tagName === 'SPAN') {
      e.preventDefault();
      show(document.activeElement);
    }
  });
  // scrolling (also the scroll a focus causes) moves the popover with its term; it closes only if the term scrolled away
  window.addEventListener('scroll', () => {
    if (!current || tip.hidden) return;
    const r = current.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) hide();
    else place(current);
  }, true);
  window.addEventListener('resize', hide);
  return { show, hide, get visible() { return !tip.hidden; }, get current() { return current; } };
}
