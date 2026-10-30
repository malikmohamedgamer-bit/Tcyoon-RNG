// Browser shell: wires the DOM-free game to the renderer, UI, loop and input.
import { createLoop } from './core/loop.js';
import { drain } from './core/events.js';
import { createGame } from './game.js';
import { createRenderer } from './render/scene.js';
import { regionTheme } from './gen/themes.js';
import { makeFmt, toast } from './ui/dom.js';
import { createShell } from './ui/hud.js';
import { createRollPanel } from './ui/roll.js';
import { createBackpackPanel } from './ui/backpack.js';
import { announce } from './ui/a11y.js';
import { attachPointerControls } from './render/camera.js';
import { createInput, defaultBindings } from './core/input.js';
import { createBasePanel } from './ui/base.js';
import { createRefineryPanel } from './ui/refinery.js';
import { createPlacement } from './ui/placement.js';
import { isWeapon } from './sim/items.js';

const canvas = document.getElementById('view');
const game = createGame();
const gs = () => game.state;
const fmt = makeFmt(() => gs().settings);
const ui = { recent: [], selected: new Set(), msg: null, bmsg: null };

const gfx = createRenderer({ canvas, quality: gs().settings.quality, pixelSize: gs().settings.pixelSize });
gfx.setTheme(regionTheme(gs().region, gs().seed));
gfx.setBaseSide(gs().base.side);

const bindings = defaultBindings();
const input = createInput(window, { getBindings: () => bindings, getContext: () => 'base' });
const placement = createPlacement({
  canvas,
  gfx,
  game,
  input,
  toast,
  announce,
  fmt,
  onChange: () => shell && shell.refresh(),
});
attachPointerControls(canvas, gfx.cam, { shouldIgnore: (e) => placement.claim(e) });

const ctx = {
  game,
  fmt,
  ui,
  placement,
  open: (id) => shell.open(id),
  placeButton: (it) => (it.loc === 'bag' && !isWeapon(it) ? `<button data-act="place" data-uid="${it.uid}">Place</button>` : ''),
  backpackAct: (name, el) => {
    if (name === 'place') {
      placement.start(Number(el.dataset.uid));
      if (window.innerWidth < 720) shell.open(null);
    }
  },
};
const panels = [createRollPanel(ctx), createBackpackPanel(ctx), createBasePanel(ctx), createRefineryPanel(ctx)];
const shell = createShell({ game, fmt, panels });
panels.forEach((p, i) => input.on(`panel${['Roll', 'Backpack', 'Base'][i] || ''}`, () => shell.toggle(p.id)));
input.on('roll', () => { game.roll(1); shell.refresh(); });

function handleEvents() {
  for (const e of drain(gs())) {
    if (e.type === 'roll' && e.big) {
      toast(`${e.title}!`);
      announce(`Big roll: ${e.title}`);
    } else if (e.type === 'level') {
      toast(`Level ${e.level}!`);
      announce(`Level up! You are now level ${e.level}`);
    } else if (e.type === 'toast') toast(e.text);
    else if (e.type === 'blocked') announce('Backpack is full. Rolls are blocked.', { urgent: true });
    else if (e.type === 'fuse') toast(e.success ? `Fusion success: ${e.title}` : 'Fusion failed');
  }
}

function pollCameraKeys(dt) {
  const k = 520 * dt;
  if (input.isDown('panLeft')) gfx.cam.panBy(-k, 0);
  if (input.isDown('panRight')) gfx.cam.panBy(k, 0);
  if (input.isDown('panUp')) gfx.cam.panBy(0, -k);
  if (input.isDown('panDown')) gfx.cam.panBy(0, k);
  if (input.isDown('orbitLeft')) gfx.cam.orbitBy(-120 * dt, 0);
  if (input.isDown('orbitRight')) gfx.cam.orbitBy(120 * dt, 0);
  if (input.isDown('zoomIn')) gfx.cam.zoomBy(Math.exp(-1.2 * dt));
  if (input.isDown('zoomOut')) gfx.cam.zoomBy(Math.exp(1.2 * dt));
}
input.on('resetCam', () => gfx.cam.reset());

let uiAcc = 0;
const loop = createLoop({
  update: (dt) => game.step(dt),
  render: (alpha, dt) => {
    gfx.render(dt, gs());
    placement.validate();
    pollCameraKeys(dt);
    shell.frame();
    handleEvents();
    uiAcc += dt;
    if (uiAcc >= 0.25) {
      uiAcc = 0;
      gfx.setBaseSide(gs().base.side);
      shell.update(game.income);
      shell.refresh();
    }
  },
});
window.addEventListener('resize', () => gfx.resize());
setInterval(() => game.saveNow(), 10000);
window.addEventListener('pagehide', () => game.saveNow());
window.addEventListener('beforeunload', () => game.saveNow());

window.__game = {
  game,
  get state() {
    return gs();
  },
  gfx,
  cellScreen: (x, y) => gfx.cellToScreen(x, y),
  loop,
  shell,
  placement,
  input,
  debug: game.debug,
  saveNow: () => game.saveNow(),
  gpuAudit: () => gfx.audit(),
};
shell.open('roll');
shell.update(game.income);
loop.start();
