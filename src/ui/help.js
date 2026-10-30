// Help panel: searchable articles + glossary. All numbers come from sim/help.js (generated from real data).
import { esc } from './dom.js';
import { articles, searchHelp, helpIndex } from '../sim/help.js';
import { glossaryEntries } from '../sim/glossary.js';

export function createHelpPanel(ctx) {
  const { ui } = ctx;
  const ART = articles();
  const GLOSS = glossaryEntries();
  const INDEX = helpIndex();
  const table = (t) => `<table class="odds"><thead><tr>${t.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  return {
    id: 'help',
    label: 'Help',
    icon: '?',
    view() {
      const q = ui.helpQ || '';
      const hits = searchHelp(q, INDEX);
      const hitArt = new Set(hits.filter((h) => h.kind === 'article').map((h) => h.id));
      const hitTerm = new Set(hits.filter((h) => h.kind === 'term').map((h) => h.id));
      const arts = ART.filter((a) => hitArt.has(a.id))
        .map((a, i) => `<details ${q || i === 0 ? 'open' : ''} data-help="${a.id}"><summary>${esc(a.title)}</summary>${a.paras.map((p) => `<p>${esc(p)}</p>`).join('')}${a.table ? table(a.table) : ''}</details>`)
        .join('');
      const terms = GLOSS.filter((g) => hitTerm.has(g.id))
        .map((g) => `<dt>${esc(g.name)}</dt><dd>${esc(g.text)}${g.long ? ` <span class="muted">${esc(g.long)}</span>` : ''}</dd>`)
        .join('');
      return `<h2>? Help</h2>
      <label>Search the help <input type="search" data-act="help-q" data-fid="help-q" value="${esc(q)}" placeholder="Try: luck, rebirth, fuse, blocked" aria-label="Search the help"></label>
      <div role="status" class="muted" aria-live="polite">${q ? `${hits.length} result${hits.length === 1 ? '' : 's'} for “${esc(q)}”` : `${ART.length} articles and ${GLOSS.length} terms`}</div>
      ${arts ? `<h3>Articles</h3>${arts}` : ''}
      ${terms ? `<h3>Glossary</h3><dl class="gloss">${terms}</dl>` : ''}
      ${!arts && !terms ? '<p class="msg">Nothing matches. Try a shorter word such as “luck” or “rebirth”.</p>' : ''}
      <p class="muted">Tip: hover, focus or tap any underlined word in the game to see what it means. The tutorial can be replayed from Settings.</p>`;
    },
    act(name, el) {
      if (name === 'help-q') {
        ui.helpQ = el.value;
        ctx.refreshAll();
      }
    },
  };
}
