// Settings panel: display, theme/accent/skins, camera, numbers, UI layout, accessibility, sound,
// remappable controls (with conflict detection) and save export/import/reset.
import { esc, confirmDialog } from './dom.js';
import { ACTIONS, defaultBindings, keyLabel, wouldConflict } from '../core/input.js';
import { BASE_THEMES } from '../gen/themes.js';

const NUMBER_SAMPLES = { suffix: '1.23M · 4.5aa', scientific: '1.23e6 · 4.5e39', engineering: '1.23e6 · 4.5e39' };

export function createSettingsPanel(ctx) {
  const { game, ui } = ctx;
  const sel = (k, opts, cur) => `<select data-act="set" data-key="${k}" data-fid="set-${k}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const chk = (k, label, cur) => `<label class="row"><input type="checkbox" data-act="set" data-key="${k}" data-fid="set-${k}" ${cur ? 'checked' : ''}> ${esc(label)}</label>`;
  const range = (k, label, cur, min, max, step) => `<label>${esc(label)}: <b>${Number(cur).toFixed(step < 1 ? 2 : 0)}</b><input type="range" data-act="set-range" data-key="${k}" data-fid="set-${k}" min="${min}" max="${max}" step="${step}" value="${cur}" aria-label="${esc(label)}"></label>`;
  return {
    id: 'settings',
    label: 'Settings',
    icon: '⚙️',
    view() {
      const s = game.state.settings;
      const b = ctx.getBindings();
      const panelsList = ctx.panelList();
      const keyRows = Object.entries(ACTIONS)
        .map(([a, def]) => `<tr><td>${esc(def.label)}</td><td>${(b[a] || []).map((k) => `<kbd>${esc(keyLabel(k))}</kbd>`).join(' ') || '—'}</td><td><button data-act="rebind" data-id="${a}" aria-label="Rebind ${esc(def.label)}">${ui.rebinding === a ? 'Press a key…' : 'Rebind'}</button></td></tr>`)
        .join('');
      return `<h2>⚙️ Settings</h2>
      ${ui.setMsg ? `<p class="msg ${ui.setMsg.kind || ''}" role="status">${esc(ui.setMsg.text)}</p>` : ''}
      <details open><summary>Display</summary>
        ${range('pixelSize', 'Pixel size (1 = sharp)', s.pixelSize, 1, 8, 1)}
        <label>Graphics quality ${sel('quality', [['low', 'Low (fewer effects, chunkier pixels)'], ['medium', 'Medium'], ['high', 'High']], s.quality)}</label>
        <label>Number format ${sel('numberFormat', [['suffix', 'Suffixes (K, M, B … aa, ab)'], ['scientific', 'Scientific (1.23e6)'], ['engineering', 'Engineering (123e3)']], s.numberFormat)}<small class="muted"> e.g. ${NUMBER_SAMPLES[s.numberFormat]}</small></label>
        <label>Game speed ${sel('gameSpeed', [[0.5, '0.5×'], [1, '1×'], [2, '2×'], [4, '4×']], s.gameSpeed)}</label>
        <div class="row2"><button data-act="pause">${ctx.isPaused() ? '▶ Resume' : '⏸ Pause'} (P)</button></div>
      </details>
      <details><summary>Theme, colours and skins</summary>
        <label>Region theme ${sel('themeOverride', [['', 'Automatic (follows your region)'], ...BASE_THEMES.map((t) => [t.id, `${t.icon} ${t.name}`])], s.themeOverride || '')}</label>
        <label>Base floor skin ${sel('floorSkin', [['', 'Theme default'], ['plates', 'Plates'], ['rivets', 'Rivets'], ['hex', 'Hex'], ['circuit', 'Circuit'], ['checker', 'Checker']], s.floorSkin || '')}</label>
        <label>Accent colour <input type="color" data-act="set" data-key="accent" data-fid="set-accent" value="${s.accent || '#ffb020'}" aria-label="Accent colour"></label>
        <div class="row2"><button data-act="reset-accent">Reset accent</button></div>
        <p class="muted">Item skins and names: select an item on the base and use its "Name & skin" controls in the Base panel.</p>
      </details>
      <details><summary>Camera</summary>
        ${range('camera.speed', 'Camera speed', s.camera.speed, 0.25, 3, 0.05)}
        ${chk('camera.invertY', 'Invert vertical orbit', s.camera.invertY)}
        ${chk('camera.sway', 'Gentle idle camera sway (off when reduced motion is on)', s.camera.sway)}
        <div class="row2"><button data-act="reset-cam">Reset camera (Home)</button></div>
      </details>
      <details><summary>Interface layout</summary>
        <p class="muted">Show or hide menu panels and status chips.</p>
        ${panelsList.map((p) => chk('panel:' + p.id, `${p.icon} ${p.label}`, !s.hiddenPanels.includes(p.id))).join('')}
        ${Object.keys(s.hud).map((k) => chk('hud.' + k, `Status chip: ${k}`, s.hud[k])).join('')}
      </details>
      <details open><summary>Accessibility</summary>
        ${range('uiScale', 'Text size', s.uiScale, 0.8, 1.6, 0.05)}
        <label>Motion ${sel('motion', [['auto', 'Follow my device setting'], ['reduced', 'Reduced (no shake, flashes or camera sway)'], ['full', 'Full']], s.motion)}</label>
        ${chk('contrast:high', 'High contrast', s.contrast === 'high')}
        ${chk('colorblind', 'Extra colour-blind rarity cues (border styles). Rarity always also shows its name and icon.', s.colorblind)}
        ${chk('captions', 'Captions for sounds', s.captions)}
      </details>
      <details><summary>Sound</summary>
        ${chk('muted', 'Mute everything', s.muted)}
        ${chk('music', 'Ambient music', s.music)}
        ${range('volume.master', 'Master volume', s.volume.master, 0, 1, 0.05)}
        ${range('volume.sfx', 'Effects volume', s.volume.sfx, 0, 1, 0.05)}
        ${range('volume.music', 'Music volume', s.volume.music, 0, 1, 0.05)}
        <p class="muted">All sounds are synthesised in your browser. ${ctx.audioState() === 'running' ? 'Audio is running.' : 'Audio starts after your first click or key press.'}</p>
      </details>
      <details><summary>Controls (remap keys)</summary>
        <p class="muted">Click Rebind, then press the new key. A key that is already used by another action in the same context is refused.</p>
        <table class="keys"><tbody>${keyRows}</tbody></table>
        <div class="row2"><button data-act="reset-keys">Reset all keys</button></div>
      </details>
      <details><summary>Help and tutorial</summary>
        <p class="muted">Tutorial: ${ctx.tutorialStatus()}</p>
        <div class="row2"><button data-act="tut-replay">${game.state.tutorial.status === 'active' ? 'Restart the tutorial' : 'Replay the tutorial'}</button>${game.state.tutorial.status === 'paused' ? '<button data-act="tut-resume">Resume the tutorial</button>' : ''}</div>
        <p class="muted">Replaying is always safe: its rewards are only paid once.</p>
      </details>
      <details><summary>Save data</summary>
        <p class="muted">Saves live in this browser (${game.save.usingFallback ? '<b class="bad">storage unavailable: playing from memory, export your save!</b>' : 'localStorage'}). Autosaves every 10 s.</p>
        <div class="row2"><button data-act="export">Export save text</button><button data-act="save-now">Save now</button></div>
        <label>Save text <textarea data-act="save-text" data-fid="save-text" spellcheck="false" aria-label="Save text to import or copy">${esc(ui.saveText || '')}</textarea></label>
        <div class="row2"><button data-act="import">Import from text</button><button class="danger" data-act="reset-game">Reset everything…</button></div>
        ${game.save.listBackups().length ? `<p class="muted">${game.save.listBackups().length} backup(s) of unreadable saves are kept in this browser.</p>` : ''}
      </details>`;
    },
    act(name, el) {
      const msg = (text, kind = 'ok') => (ui.setMsg = { text, kind });
      switch (name) {
        case 'set':
        case 'set-range': {
          const key = el.dataset.key;
          let val = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
          if (key === 'themeOverride' || key === 'floorSkin') val = val === '' ? null : val;
          if (key === 'gameSpeed' || key === 'pixelSize') val = Number(val);
          if (key === 'contrast:high') ctx.set('contrast', val ? 'high' : 'normal');
          else if (key.startsWith('panel:')) {
            const id = key.slice(6);
            const cur = game.state.settings.hiddenPanels.filter((x) => x !== id);
            ctx.set('hiddenPanels', val ? cur : [...cur, id]);
          } else ctx.set(key, val);
          break;
        }
        case 'reset-accent': ctx.set('accent', null); break;
        case 'reset-cam': ctx.resetCamera(); break;
        case 'pause': ctx.togglePause(); break;
        case 'rebind': ui.rebinding = el.dataset.id; msg('Press the new key (Esc cancels).', ''); ctx.captureKey((code) => {
          const action = ui.rebinding;
          ui.rebinding = null;
          if (code === 'Escape') return msg('Rebind cancelled.', '');
          const clash = wouldConflict(ctx.getBindings(), action, code);
          if (clash.length) return msg(`${keyLabel(code)} is already used by: ${clash.map((c) => ACTIONS[c].label).join(', ')}. Pick another key.`, '');
          ctx.setBindings({ ...ctx.getBindings(), [action]: [code] });
          msg(`${ACTIONS[action].label} is now ${keyLabel(code)}.`);
        }); break;
        case 'tut-replay':
          game.tutorial.start({ replay: true });
          ctx.open(null);
          break;
        case 'tut-resume':
          game.tutorial.resume();
          ctx.open(null);
          break;
        case 'reset-keys': ctx.setBindings(defaultBindings()); msg('Keys reset to defaults.'); break;
        case 'export': ui.saveText = game.exportText(); msg('Save text created below. Copy it somewhere safe.'); break;
        case 'save-text': ui.saveText = el.value; break;
        case 'save-now': game.saveNow(); msg('Saved.'); break;
        case 'import': {
          const r = game.importText(ui.saveText || '');
          if (r.ok) {
            ctx.afterImport();
            msg('Save imported.');
          } else msg('Import failed: ' + r.error, '');
          break;
        }
        case 'reset-game':
          confirmDialog({ title: 'Reset everything?', html: '<p class="bad"><b>This deletes your save, items, rebirths and rewards.</b> Export your save first if you might want it back.</p>', confirmText: 'Delete everything', danger: true }).then((ok) => {
            if (!ok) return;
            game.hardReset();
            ctx.afterImport();
            ui.setMsg = { text: 'Game reset.', kind: 'ok' };
            ctx.refreshAll();
          });
          break;
        default:
      }
    },
  };
}
