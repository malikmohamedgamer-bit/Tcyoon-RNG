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

const canvas = document.getElementById('view');
const game = createGame();
const gs = () => game.state;
const fmt = makeFmt(() => gs().settings);
const ui = { recent: [], selected: new Set(), msg: null, bmsg: null };

const gfx = createRenderer({ canvas, quality: gs().settings.quality, pixelSize: gs().settings.pixelSize });
gfx.setTheme(regionTheme(gs().region, gs().seed));
gfx.setBaseSide(6);
attachPointerControls(canvas, gfx.cam);

const ctx = { game, fmt, ui, open: (id) => shell.open(id) };
const panels = [createRollPanel(ctx), createBackpackPanel(ctx)];
const shell = createShell({ game, fmt, panels });

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

let uiAcc = 0;
const loop = createLoop({
  update: (dt) => game.step(dt),
  render: (alpha, dt) => {
    gfx.render(dt);
    shell.frame();
    handleEvents();
    uiAcc += dt;
    if (uiAcc >= 0.25) {
      uiAcc = 0;
      shell.update();
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
  loop,
  shell,
  debug: game.debug,
  saveNow: () => game.saveNow(),
  gpuAudit: () => gfx.audit(),
};
shell.open('roll');
shell.update();
loop.start();
