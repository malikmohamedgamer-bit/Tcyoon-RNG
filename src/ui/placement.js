// Placement controller: ghost preview, click/tap to place, drag to move/swap, rotate,
// sell, pick up. Ray casting against the grid plane is done by gfx.pickCell().
// Validity is shown by shape (ring vs cross) and text, never by colour alone.
import { canPlace, itemAt } from '../sim/placement.js';
import { itemTitle } from '../sim/items.js';
import { DIR_NAMES } from '../sim/production.js';

export function createPlacement({ canvas, gfx, game, input, toast, announce, fmt, play, onChange }) {
  const label = document.createElement('div');
  label.id = 'ghost-label';
  label.setAttribute('aria-hidden', 'true');
  label.hidden = true;
  document.getElementById('app').appendChild(label);

  const st = { placing: null, dir: 0, selected: null, hover: null, drag: null, down: null };
  const side = () => game.state.base.side;
  const cellAt = (e) => {
    const c = gfx.pickCell(e.clientX, e.clientY);
    return c && c.inside ? c : null;
  };

  function showLabel(text, e) {
    label.hidden = !text;
    if (!text) return;
    label.textContent = text;
    label.style.left = Math.min(e.clientX + 14, window.innerWidth - 220) + 'px';
    label.style.top = e.clientY + 14 + 'px';
  }

  function refreshGhost(e) {
    const s = game.state;
    const movingUid = st.drag && st.drag.active ? st.drag.uid : st.placing;
    if (movingUid == null || !st.hover) {
      gfx.items.clearGhost();
      return;
    }
    const it = s.items[movingUid];
    if (!it) {
      gfx.items.clearGhost();
      return;
    }
    const chk = canPlace(s, movingUid, st.hover.x, st.hover.y, { swap: true });
    gfx.items.setGhost({ tpl: it.tpl, x: st.hover.x, y: st.hover.y, dir: st.drag?.active ? it.dir || 0 : st.dir, valid: chk.ok, side: side() });
    const verb = st.drag && st.drag.active ? (chk.swap ? 'Swap here' : 'Move here') : 'Place here';
    showLabel(chk.ok ? `✔ ${verb} · facing ${DIR_NAMES[st.drag?.active ? it.dir || 0 : st.dir]} (R rotates)` : `✖ ${chk.reason}`, e);
  }

  function select(uid) {
    st.selected = uid;
    const it = uid != null ? game.state.items[uid] : null;
    if (it && it.loc === 'placed') gfx.items.setSelection(it.x, it.y, side());
    else gfx.items.setSelection(null);
    onChange && onChange();
  }

  function start(uid) {
    const it = game.state.items[uid];
    if (!it || it.loc !== 'bag') return false;
    st.placing = uid;
    st.dir = it.dir || 0;
    select(null);
    toast(`Placing ${itemTitle(it)} — click or tap a tile (R rotates, Esc cancels)`);
    announce('Placing mode. Click or tap a tile on the base to place the item.');
    onChange && onChange();
    return true;
  }
  function cancel() {
    const was = st.placing != null || st.drag || st.selected != null;
    st.placing = null;
    st.drag = null;
    gfx.items.clearGhost();
    showLabel('');
    select(null);
    return was;
  }

  function tryPlace(uid, cell) {
    const r = game.place(uid, cell.x, cell.y, st.placing === uid ? st.dir : undefined);
    if (!r.ok) {
      toast(r.reason);
      announce(r.reason);
      play && play('error');
      return false;
    }
    if (r.swapped) announce('Swapped items');
    return true;
  }

  const onMove = (e) => {
    st.hover = cellAt(e);
    if (st.down && !st.drag) {
      if (Math.hypot(e.clientX - st.down.x, e.clientY - st.down.y) > 8 && st.down.uid != null) st.drag = { uid: st.down.uid, active: true };
    }
    if (st.placing != null || (st.drag && st.drag.active)) refreshGhost(e);
    else if (st.hover) {
      const it = itemAt(game.state, st.hover.x, st.hover.y);
      if (it) {
        const p = game.state._p?.perItem.get(it.uid);
        showLabel(`${itemTitle(it)}${p && p.type === 'dropper' ? ` · $${fmt(p.out)}/s` : ''}${p?.blocked ? ' · ⚠ blocked' : ''}`, e);
      } else showLabel('');
    } else showLabel('');
  };
  const onDown = (e) => {
    if (e.button !== 0) return;
    const c = cellAt(e);
    const it = c ? itemAt(game.state, c.x, c.y) : null;
    st.down = { x: e.clientX, y: e.clientY, uid: it && st.placing == null ? it.uid : null, cell: c };
  };
  const onUp = (e) => {
    const down = st.down;
    st.down = null;
    if (e.button !== 0 || !down) return;
    const c = cellAt(e);
    if (st.drag && st.drag.active) {
      const uid = st.drag.uid;
      st.drag = null;
      gfx.items.clearGhost();
      showLabel('');
      if (c && (c.x !== game.state.items[uid]?.x || c.y !== game.state.items[uid]?.y)) {
        if (tryPlace(uid, c)) select(uid);
      }
      onChange && onChange();
      return;
    }
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return; // it was a camera pan
    if (st.placing != null) {
      if (!c) {
        toast('Outside your base');
        return;
      }
      const uid = st.placing;
      if (tryPlace(uid, c)) {
        st.placing = null;
        gfx.items.clearGhost();
        showLabel('');
        select(uid);
        announce(`Placed at column ${c.x + 1}, row ${c.y + 1}`);
      }
      onChange && onChange();
      return;
    }
    const it = c ? itemAt(game.state, c.x, c.y) : null;
    select(it ? it.uid : null);
  };
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointerleave', () => {
    if (!st.drag) {
      gfx.items.clearGhost();
      showLabel('');
    }
  });

  input.on('rotate', () => {
    if (st.placing != null) {
      st.dir = (st.dir + 1) % 4;
      toast(`Facing ${DIR_NAMES[st.dir]}`, 900);
    } else if (st.selected != null) {
      game.rotate(st.selected);
      onChange && onChange();
    }
  });
  input.on('sellSel', () => {
    if (st.selected != null) {
      const r = game.sellPlaced(st.selected);
      if (r.ok) toast(`Sold for $${fmt(r.value)}`);
      select(null);
    }
  });
  input.on('pickUp', () => {
    if (st.selected != null) {
      const r = game.pickUp(st.selected);
      if (!r.ok) toast(r.reason);
      select(null);
    }
  });

  return {
    start,
    cancel,
    select,
    claim(e) {
      if (e.button !== 0 || e.shiftKey || st.placing != null) return false;
      const c = cellAt(e);
      return !!(c && itemAt(game.state, c.x, c.y));
    },
    get state() {
      return st;
    },
    /** Called every frame: drop selection if the selected item moved away. */
    validate() {
      const it = st.selected != null ? game.state.items[st.selected] : null;
      if (st.selected != null && (!it || it.loc !== 'placed')) select(null);
      else if (it) gfx.items.setSelection(it.x, it.y, side());
      if (st.placing != null && game.state.items[st.placing]?.loc !== 'bag') {
        st.placing = null;
        gfx.items.clearGhost();
      }
    },
  };
}
