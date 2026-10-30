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
import { createRebirthPanel } from './ui/rebirth.js';
import { createShopPanel } from './ui/shop.js';
import { createCombatPanel, createFightOverlay } from './ui/combat-ui.js';
import { createRewardsPanel } from './ui/rewards.js';
import { confirmDialog, esc } from './ui/dom.js';
import { formatDuration } from './core/time.js';
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
const input = createInput(window, { getBindings: () => bindings, getContext: () => (gs()._enc && gs()._enc.manual ? 'arena' : 'base') });
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
  refreshAll: () => { shell.update(game.income); shell.refresh(); },
  game,
  fmt,
  ui,
  placement,
  open: (id) => shell.open(id),
  toggleManual: () => {
    const enc = gs()._enc;
    if (!enc) {
      toast('Manual control is available during a fight');
      return;
    }
    game.setManual(!enc.manual);
    announce(enc.manual ? 'Manual control on. Move with WASD, aim with the mouse.' : 'Manual control off. Your defences fight automatically.');
  },
  ability: (name) => { flags[name] = true; },
  placeButton: (it) => (it.loc === 'bag' && !isWeapon(it) ? `<button data-act="place" data-uid="${it.uid}">Place</button>` : ''),
  backpackAct: (name, el) => {
    if (name === 'place') {
      placement.start(Number(el.dataset.uid));
      if (window.innerWidth < 720) shell.open(null);
    }
  },
};
const panels = [createRollPanel(ctx), createBackpackPanel(ctx), createBasePanel(ctx), createShopPanel(ctx), createRewardsPanel(ctx), createCombatPanel(ctx), createRefineryPanel(ctx), createRebirthPanel(ctx)];
const touchMove = { x: 0, z: 0 };
const flags = { dash: false, nova: false, shield: false };
const aim = { x: 0, z: -10 };
canvas.addEventListener('pointermove', (e) => {
  const c = gfx.pickCell(e.clientX, e.clientY);
  if (c) {
    aim.x = c.wx;
    aim.z = c.wz;
  }
});
const shell = createShell({ game, fmt, panels });
for (const [action, id] of [['panelRoll', 'roll'], ['panelBackpack', 'backpack'], ['panelBase', 'base'], ['panelShop', 'shop'], ['panelRebirth', 'rebirth'], ['panelCombat', 'combat'], ['panelRewards', 'rewards']]) input.on(action, () => shell.toggle(id));
input.on('manual', () => ctx.toggleManual());
input.on('dash', () => (flags.dash = true));
input.on('nova', () => (flags.nova = true));
input.on('shield', () => (flags.shield = true));
input.on('pause', () => {
  loop.paused = !loop.paused;
  toast(loop.paused ? 'Paused (P to resume)' : 'Resumed');
  announce(loop.paused ? 'Game paused' : 'Game resumed');
});
const fight = createFightOverlay(document.getElementById('arena-ui'), ctx);
input.on('roll', () => { game.roll(1); shell.refresh(); });

let fightCam = null;
function syncFightCam() {
  const enc = gs()._enc;
  if (enc && !fightCam) {
    fightCam = { dist: gfx.cam.dist };
    gfx.cam.dist = Math.max(gfx.cam.dist, 34);
  } else if (!enc && fightCam) {
    gfx.cam.dist = fightCam.dist;
    fightCam = null;
  }
}

let themeRegion = gs().region;
function syncTheme() {
  if (gs().region !== themeRegion || gs().seed !== themeSeed) {
    themeRegion = gs().region;
    themeSeed = gs().seed;
    gfx.setTheme(regionTheme(themeRegion, themeSeed));
  }
}
let themeSeed = gs().seed;

function handleEvents() {
  for (const e of drain(gs())) {
    if (e.type === 'roll' && e.big) {
      toast(`${e.title}!`);
      announce(`Big roll: ${e.title}`);
    } else if (e.type === 'level') {
      toast(`Level ${e.level}!`);
      announce(`Level up! You are now level ${e.level}`);
    } else if (e.type === 'wave') {
      if (e.win) announce(`Wave ${e.wave} defended`);
      else {
        toast(`Wave ${e.wave} lost${e.lost && !e.lost.isZero() ? ` (−$${fmt(e.lost)})` : ''}`);
        announce(`Wave ${e.wave} lost. The base was damaged.`);
      }
    } else if (e.type === 'boss') {
      toast(e.win ? `Boss defeated: ${e.name}!` : `${e.name} won this time`, 5000);
      announce(e.win ? `Boss defeated: ${e.name}` : `Boss fight lost: ${e.name}`, { urgent: true });
    } else if (e.type === 'prestige') {
      toast(`Region ${e.region + 1} reached!`, 4000);
      announce(`Prestige complete. Welcome to region ${e.region + 1}`, { urgent: true });
    } else if (e.type === 'levelReward') {
      toast(`Level ${e.level} reward: ${e.text}`, 5000);
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
  update: (dt) => {
    const enc = gs()._enc;
    if (enc && enc.manual) {
      const yaw = gfx.cam.yaw;
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);
      const f = (input.isDown('moveUp') ? 1 : 0) - (input.isDown('moveDown') ? 1 : 0);
      const r = (input.isDown('moveRight') ? 1 : 0) - (input.isDown('moveLeft') ? 1 : 0);
      game.manualInput = { mx: fx * f + rx * r + (touchMove.x || 0), mz: fz * f + rz * r + (touchMove.z || 0), ax: aim.x, az: aim.z, dash: flags.dash, nova: flags.nova, shield: flags.shield };
    } else game.manualInput = null;
    game.step(dt);
    flags.dash = flags.nova = flags.shield = false;
  },
  render: (alpha, dt) => {
    gfx.render(dt, gs());
    placement.validate();
    pollCameraKeys(dt);
    shell.frame();
    handleEvents();
    syncTheme();
    syncFightCam();
    fight.update(gs());
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
loop.onGap = (gapSeconds) => {
  game.catchUp(Date.now() - gapSeconds * 1000);
  showWelcome();
};

/** Welcome-back screen: what you earned while away (closed-form offline progress). */
async function showWelcome() {
  const w = game.welcome;
  game.welcome = null;
  if (!w) return;
  const notes = [];
  if (w.negative) notes.push('Your clock appears to have moved backwards, so no offline progress was counted.');
  if (w.clamped) notes.push('You were away for more than 10 years (or your clock jumped far ahead): offline progress is capped at 10 years.');
  await confirmDialog({
    title: 'Welcome back!',
    html: `<p>You were away for <b>${esc(formatDuration(w.seconds))}</b>.</p>
      <ul><li>💰 Earned <b>$${esc(fmt(w.money))}</b></li><li>🎟️ Free rolls gained: <b>${w.freeRolls}</b></li>${w.boostersExpired ? `<li>🧪 ${w.boostersExpired} booster(s) ran out</li>` : ''}${w.waves ? `<li>🛡️ ${esc(w.waves.text)}</li>` : ''}</ul>${notes.map((n) => `<p class="muted">${esc(n)}</p>`).join('')}`,
    confirmText: 'Continue',
    cancelText: 'Close',
  });
}
if (game.welcome) showWelcome();
loop.start();
