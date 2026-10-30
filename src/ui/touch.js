// Touch controls: a floating action bar for placement (rotate / pick up / sell / cancel) so the
// whole game is playable without a keyboard, and a virtual joystick for the arena. All targets
// are >= 44 px. Placement itself is tap-to-place / drag-to-move through pointer events.
export function createTouchControls({ root, placement, game, fmt, toast, touchMove, isManual }) {
  root.innerHTML = `
    <div class="touch-bar" role="toolbar" aria-label="Placement actions" hidden>
      <button type="button" data-t="rotate" aria-label="Rotate item">⟳ Rotate</button>
      <button type="button" data-t="pickup" aria-label="Pick up item">🎒 Pick up</button>
      <button type="button" data-t="sell" aria-label="Sell item">💰 Sell</button>
      <button type="button" data-t="cancel" aria-label="Cancel">✕ Cancel</button>
    </div>
    <div class="joystick" aria-hidden="true" hidden><div class="stick"></div></div>`;
  const bar = root.querySelector('.touch-bar');
  const joy = root.querySelector('.joystick');
  const stick = root.querySelector('.stick');
  const coarse = () => window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    const st = placement.state;
    switch (b.dataset.t) {
      case 'rotate':
        if (st.placing != null) st.dir = (st.dir + 1) % 4;
        else if (st.selected != null) game.rotate(st.selected);
        break;
      case 'pickup':
        if (st.selected != null) {
          const r = game.pickUp(st.selected);
          if (!r.ok) toast(r.reason);
          placement.select(null);
        }
        break;
      case 'sell':
        if (st.selected != null) {
          const r = game.sellPlaced(st.selected);
          if (r.ok) toast(`Sold for $${fmt(r.value)}`);
          placement.select(null);
        }
        break;
      default:
        placement.cancel();
    }
  });

  // virtual joystick (arena): drag inside the pad, release to stop
  let active = null;
  const rect = () => joy.getBoundingClientRect();
  const move = (e) => {
    const r = rect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = (e.clientX - cx) / (r.width / 2);
    let dy = (e.clientY - cy) / (r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    touchMove.x = dx; // screen-right
    touchMove.z = dy; // screen-down -> converted to world by the caller using the camera yaw
    stick.style.transform = `translate(${dx * 40}px, ${dy * 40}px)`;
  };
  joy.addEventListener('pointerdown', (e) => {
    active = e.pointerId;
    joy.setPointerCapture(e.pointerId);
    move(e);
    e.preventDefault();
  });
  joy.addEventListener('pointermove', (e) => {
    if (e.pointerId === active) move(e);
  });
  const end = (e) => {
    if (e.pointerId !== active) return;
    active = null;
    touchMove.x = touchMove.z = 0;
    stick.style.transform = '';
  };
  joy.addEventListener('pointerup', end);
  joy.addEventListener('pointercancel', end);

  return {
    update() {
      const st = placement.state;
      const show = coarse() || window.__forceTouch;
      bar.hidden = !(show && (st.placing != null || st.selected != null));
      joy.hidden = !(show && isManual());
    },
  };
}
