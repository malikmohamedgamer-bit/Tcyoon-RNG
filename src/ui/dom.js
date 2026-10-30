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
  // collapsible sections keep their open/closed state across re-renders (keyed by summary text)
  el._open ||= new Map();
  for (const d of el.querySelectorAll('details')) {
    const k = d.querySelector('summary')?.textContent;
    if (k) el._open.set(k, d.open);
  }
  el._html = html;
  el.innerHTML = html;
  for (const d of el.querySelectorAll('details')) {
    const k = d.querySelector('summary')?.textContent;
    if (k && el._open.has(k)) d.open = el._open.get(k);
  }
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
    // text fields are handled by 'input' (no re-render), see textInput below
    if (t && (t.tagName === 'SELECT' || (t.tagName === 'INPUT' && t.type !== 'text'))) handler(t.dataset.act, t, e);
  });
}

/** Live-update text fields without re-rendering the panel (which would drop focus/typing). */
export function textInput(root, handler) {
  root.addEventListener('input', (e) => {
    const t = e.target.closest('[data-act]');
    if (t && (t.type === 'text' || t.tagName === 'TEXTAREA')) handler(t.dataset.act, t, e);
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

/**
 * Modal confirmation dialog (focus is moved into it, Tab is trapped, Esc cancels).
 * Resolves true on confirm, false on cancel. `html` is trusted markup built by the caller.
 */
export function confirmDialog({ title, html, confirmText = 'Confirm', cancelText = 'Cancel', danger = false }) {
  const root = document.getElementById('modal-root');
  const prev = document.activeElement;
  return new Promise((resolve) => {
    root.innerHTML = `<div class="backdrop"><div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" aria-describedby="dlg-body">
      <h2 id="dlg-title">${esc(title)}</h2><div id="dlg-body">${html}</div>
      <div class="row2" style="margin-top:.8rem"><button type="button" data-no>${esc(cancelText)}</button><button type="button" class="${danger ? 'danger' : 'primary'}" data-yes>${esc(confirmText)}</button></div></div></div>`;
    const yes = root.querySelector('[data-yes]');
    const no = root.querySelector('[data-no]');
    const close = (v) => {
      root.innerHTML = '';
      document.removeEventListener('keydown', onKey, true);
      if (prev && prev.focus) prev.focus();
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(false);
      } else if (e.key === 'Tab') {
        const f = [no, yes];
        const i = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    yes.addEventListener('click', () => close(true));
    no.addEventListener('click', () => close(false));
    no.focus();
  });
}

/**
 * Modal dialog with any number of choices. `focus` is the id of the choice that gets keyboard focus
 * (the safe default); Esc picks `escape` (default: the focus choice). Tab is trapped, focus returns afterwards.
 * Resolves with the chosen id.
 */
export function choiceDialog({ title, html, choices, focus, escape }) {
  const root = document.getElementById('modal-root');
  const prev = document.activeElement;
  return new Promise((resolve) => {
    root.innerHTML = `<div class="backdrop"><div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" aria-describedby="dlg-body">
      <h2 id="dlg-title">${esc(title)}</h2><div id="dlg-body">${html}</div>
      <div class="choices">${choices.map((c) => `<button type="button" class="${c.primary ? 'primary' : ''}" data-choice="${esc(c.id)}">${esc(c.label)}</button>`).join('')}</div></div></div>`;
    const btns = [...root.querySelectorAll('[data-choice]')];
    const close = (v) => {
      root.innerHTML = '';
      document.removeEventListener('keydown', onKey, true);
      if (prev && prev.focus) prev.focus();
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(escape || focus);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const i = btns.indexOf(document.activeElement);
        btns[(i + (e.shiftKey ? -1 : 1) + btns.length) % btns.length].focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    for (const b of btns) b.addEventListener('click', () => close(b.dataset.choice));
    (btns.find((b) => b.dataset.choice === focus) || btns[0]).focus();
  });
}
