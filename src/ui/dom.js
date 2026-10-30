// Small DOM helpers: HTML escaping, focus-preserving patching, event delegation, formatting.
import { Big } from '../core/bignum.js';

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function makeFmt(getSettings) {
  return (b, digits = 2) => {
    const st = getSettings() || {};
    return Big.from(b).format({ mode: st.numberFormat || 'suffix', digits });
  };
}

/**
 * Replace el.innerHTML only if it changed, and put keyboard focus back on the element
 * that had it (matched by data-fid, or by data-act + data-uid) so re-rendering a live
 * panel never steals or loses focus.
 */
export function patchHtml(el, html) {
  if (el._html === html) return false;
  const active = document.activeElement;
  let fid = null;
  let selStart = null;
  if (active && el.contains(active)) {
    fid = active.getAttribute('data-fid') || (active.dataset.act ? `${active.dataset.act}|${active.dataset.uid || ''}|${active.dataset.id || ''}` : null);
    if (active.selectionStart != null) selStart = active.selectionStart;
  }
  el._html = html;
  el.innerHTML = html;
  if (fid) {
    const next = [...el.querySelectorAll('[data-fid],[data-act]')].find(
      (n) => (n.getAttribute('data-fid') || `${n.dataset.act}|${n.dataset.uid || ''}|${n.dataset.id || ''}`) === fid,
    );
    if (next) {
      next.focus({ preventScroll: true });
      if (selStart != null && next.setSelectionRange) {
        try {
          next.setSelectionRange(selStart, selStart);
        } catch {
          /* not a text input */
        }
      }
    }
  }
  return true;
}

/** Delegate clicks (and changes) on [data-act] descendants to handler(act, element, event). */
export function delegate(root, handler) {
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t || !root.contains(t) || t.disabled || t.tagName === 'INPUT' || t.tagName === 'SELECT') return;
    handler(t.dataset.act, t, e);
  });
  root.addEventListener('change', (e) => {
    const t = e.target.closest('[data-act]');
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) handler(t.dataset.act, t, e);
  });
}

export function toast(text, ms = 3200) {
  const root = document.getElementById('toasts');
  if (!root) return;
  while (root.children.length >= 4) root.firstChild.remove();
  const d = document.createElement('div');
  d.className = 'toast';
  d.textContent = text;
  root.appendChild(d);
  setTimeout(() => d.remove(), ms);
}
