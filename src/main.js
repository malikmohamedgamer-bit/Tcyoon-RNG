// Browser shell: wires the DOM-free game to the renderer, UI, loop, input, audio and settings.
import { createLoop } from './core/loop.js';
import { drain } from './core/events.js';
import { createAudio } from './core/audio.js';
import { createInput, defaultBindings } from './core/input.js';
import { formatDuration } from './core/time.js';
import { createGame } from './game.js';
import { createRenderer } from './render/scene.js';
import { attachPointerControls } from './render/camera.js';
import { regionTheme, themeById } from './gen/themes.js';
import { isWeapon } from './sim/items.js';
import { makeFmt, toast, confirmDialog, choiceDialog, esc } from './ui/dom.js';
import { announce, applyA11y, prefersReducedMotion } from './ui/a11y.js';
import { createShell } from './ui/hud.js';
import { createRollPanel } from './ui/roll.js';
import { createBackpackPanel } from './ui/backpack.js';
import { createBasePanel } from './ui/base.js';
import { createShopPanel } from './ui/shop.js';
import { createRewardsPanel } from './ui/rewards.js';
import { createCombatPanel, createFightOverlay } from './ui/combat-ui.js';
import { createRefineryPanel } from './ui/refinery.js';
import { createRebirthPanel } from './ui/rebirth.js';
import { createSettingsPanel } from './ui/settings.js';
import { createPlacement } from './ui/placement.js';
import { createTouchControls } from './ui/touch.js';
import { createTutorialUI } from './ui/tutorial.js';
import { effectiveSpeed } from './sim/speed.js';
import { createTipsUI } from './ui/tips.js';
import { MODES } from './sim/difficulty.js';

const canvas = document.getElementById('view');
const game = createGame();
const gs = () => game.state;
const settings = () => gs().settings;
const fmt = makeFmt(settings);
const ui = { recent: [], selected: new Set(), msg: null, bmsg: null };

// ------------------------------------------------------------------ audio + captions
function caption(text) {
  const box = document.getElementById('captions');
  if (!box || !text) return;
  while (box.children.length >= 3) box.firstChild.remove();
  const s = document.createElement('span');
  s.textContent = text;
  box.appendChild(s);
  setTimeout(() => s.remove(), 2200);
}
const audio = createAudio({ getSettings: settings, onCaption: caption });
const play = (name, o) => audio.play(name, o);
const unlockOnce = () => {
  audio.unlock();
  if (settings().music) audio.startMusic();
  window.removeEventListener('pointerdown', unlockOnce, true);
  window.removeEventListener('keydown', unlockOnce, true);
};
window.addEventListener('pointerdown', unlockOnce, true);
window.addEventListener('keydown', unlockOnce, true);

// ------------------------------------------------------------------ renderer, input
const gfx = createRenderer({ canvas, quality: settings().quality, pixelSize: settings().pixelSize, reducedMotion: prefersReducedMotion(settings()) });
gfx.setBaseSide(gs().base.side);
gfx.onFightEvents = (evs) => {
  for (const e of evs) {
    if (e.k === 'shot') play('shot');
    else if (e.k === 'kill') play('kill');
    else if (e.k === 'nova') play('nova');
  }
};

const getBindings = () => ({ ...defaultBindings(), ...(settings().bindings || {}) });
const input = createInput(window, { getBindings, getContext: () => (gs()._enc && gs()._enc.manual ? 'arena' : 'base') });
const touchMove = { x: 0, z: 0 };
const flags = { dash: false, nova: false, shield: false };
const aim = { x: 0, z: -10 };

const placement = createPlacement({ canvas, gfx, game, input, toast, announce, fmt, play, onChange: () => shell && shell.refresh() });
attachPointerControls(canvas, gfx.cam, { shouldIgnore: (e) => placement.claim(e) });
const setAim = (e) => {
  const c = gfx.pickCell(e.clientX, e.clientY);
  if (c) {
    aim.x = c.wx;
    aim.z = c.wz;
  }
};
canvas.addEventListener('pointermove', setAim);
canvas.addEventListener('pointerdown', setAim); // tap to aim on touch screens

// ------------------------------------------------------------------ settings application
let themeKey = '';
function activeTheme() {
  const s = settings();
  const base = s.themeOverride ? themeById(s.themeOverride, gs().seed) : regionTheme(gs().region, gs().seed);
  return s.floorSkin ? { ...base, id: `${base.id}+${s.floorSkin}`, floor: s.floorSkin } : base;
}
function syncTheme() {
  const s = settings();
  const key = `${gs().region}|${gs().seed}|${s.themeOverride}|${s.floorSkin}`;
  if (key === themeKey) return;
  themeKey = key;
  const theme = activeTheme();
  gfx.setTheme(theme);
  audio.setFlavour(theme.sfx);
}

function applySettings() {
  const s = settings();
  applyA11y(s);
  const reduced = prefersReducedMotion(s);
  gfx.setReducedMotion(reduced);
  gfx.cam.sway = s.camera.sway && !reduced;
  gfx.cam.invertY = s.camera.invertY;
  gfx.cam.speed = s.camera.speed;
  gfx.setQuality(s.quality);
  gfx.setPixelSize(s.pixelSize);
  loop.speed = effectiveSpeed(gs());
  audio.applyVolumes();
  if (s.music && audio.state === 'running') audio.startMusic();
  else if (!s.music) audio.stopMusic();
  shell.applyLayout(s);
  syncTheme();
}

// ------------------------------------------------------------------ panels
const ctx = {
  game,
  fmt,
  ui,
  placement,
  refreshAll: () => {
    shell.update(game.income);
    shell.refresh();
  },
  open: (id) => shell.open(id),
  toggleManual: () => {
    const enc = gs()._enc;
    if (!enc) {
      toast('Manual control is available during a fight');
      return;
    }
    game.setManual(!enc.manual);
    announce(enc.manual ? 'Manual control on. Move with WASD or the joystick, aim with the mouse or by tapping.' : 'Manual control off. Your defences fight automatically.');
  },
  ability: (name) => {
    flags[name] = true;
  },
  placeButton: (it) => (it.loc === 'bag' && !isWeapon(it) ? `<button data-act="place" data-uid="${it.uid}">Place</button>` : ''),
  backpackAct: (name, el) => {
    if (name === 'place') {
      placement.start(Number(el.dataset.uid));
      if (window.innerWidth < 720) shell.open(null);
    }
  },
  // settings panel hooks
  set: (path, value) => {
    game.setSetting(path, value);
    applySettings();
    shell.refresh();
  },
  tutorialStatus: () => ({ new: 'not started', active: 'in progress', paused: 'paused', skipped: 'skipped', done: `finished (${gs().tutorial.completed}×)` })[gs().tutorial.status] || 'unknown',
  getBindings,
  setBindings: (b) => {
    game.setSetting('bindings', b);
    shell.refresh();
  },
  captureKey: (cb) => {
    const h = (e) => {
      if (['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(e.code)) return;
      e.preventDefault();
      e.stopPropagation();
      window.removeEventListener('keydown', h, true);
      cb(e.code);
      shell.refresh();
    };
    window.addEventListener('keydown', h, true);
  },
  panelList: () => panels.filter((p) => p.id !== 'settings'),
  isPaused: () => loop.paused,
  togglePause: () => togglePause(),
  resetCamera: () => gfx.cam.reset(),
  audioState: () => audio.state,
  afterImport: () => {
    themeKey = '';
    placement.cancel();
    gfx.setBaseSide(gs().base.side);
    applySettings();
    shell.update(game.income);
  },
};
const panels = [createRollPanel(ctx), createBackpackPanel(ctx), createBasePanel(ctx), createShopPanel(ctx), createRewardsPanel(ctx), createCombatPanel(ctx), createRefineryPanel(ctx), createRebirthPanel(ctx), createSettingsPanel(ctx)];
const shell = createShell({ game, fmt, panels, onOpen: (id) => id && game.tutorial.flag('panel:' + id) });
const tutorialUI = createTutorialUI({ game, shell, placement, gfx, root: document.getElementById('tutorial') });
// the tutorial's "inspect" step: the player looked at (clicked or focused) an item card
document.getElementById('panels').addEventListener('click', (e) => {
  if (e.target.closest('article.item')) game.tutorial.flag('inspect');
});
const tipsUI = createTipsUI({ root: document.getElementById('tips'), game, shell });
const fight = createFightOverlay(document.getElementById('arena-ui'), ctx);
const touch = createTouchControls({ root: document.getElementById('touch-root'), placement, game, fmt, toast, touchMove, isManual: () => !!(gs()._enc && gs()._enc.manual) });

function togglePause() {
  loop.paused = !loop.paused;
  toast(loop.paused ? 'Paused (P to resume)' : 'Resumed');
  announce(loop.paused ? 'Game paused' : 'Game resumed');
  shell.refresh();
}

for (const [action, id] of [['panelRoll', 'roll'], ['panelBackpack', 'backpack'], ['panelBase', 'base'], ['panelShop', 'shop'], ['panelRebirth', 'rebirth'], ['panelCombat', 'combat'], ['panelRewards', 'rewards'], ['panelSettings', 'settings']]) input.on(action, () => shell.toggle(id));
input.on('manual', () => ctx.toggleManual());
input.on('dash', () => (flags.dash = true));
input.on('nova', () => (flags.nova = true));
input.on('shield', () => (flags.shield = true));
input.on('pause', togglePause);
input.on('roll', () => {
  const r = game.roll(1);
  if (r.blocked) play('error');
  shell.refresh();
});
input.on('roll10', () => {
  game.roll(10);
  shell.refresh();
});
input.on('resetCam', () => gfx.cam.reset());
input.on('cancel', () => {
  const enc = gs()._enc;
  if (enc && enc.manual) game.setManual(false);
  else if (placement.cancel()) return; // leaves placing / deselects first
  else if (shell.openId) shell.open(null); // then Escape closes the open panel
});

// ------------------------------------------------------------------ per-frame helpers
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

function handleEvents() {
  for (const e of drain(gs())) {
    switch (e.type) {
      case 'roll':
        if (e.big) {
          toast(`${e.title}!`);
          announce(`Big roll: ${e.title}`);
          play('bigRoll', { tier: e.tier });
        } else play('roll', { tier: e.tier });
        break;
      case 'level':
        toast(`Level ${e.level}!`);
        announce(`Level up! You are now level ${e.level}`);
        play('levelUp');
        break;
      case 'levelReward':
        toast(`Level ${e.level} reward: ${e.text}`, 5000);
        play('reward');
        break;
      case 'fightStart':
        play(e.kind === 'boss' ? 'boss' : 'waveStart');
        announce(e.kind === 'boss' ? 'Boss fight started' : `Wave ${e.wave} is coming`);
        break;
      case 'wave':
        if (e.win) {
          announce(`Wave ${e.wave} defended`);
          play('waveWin');
        } else {
          toast(`Wave ${e.wave} lost${e.lost && !e.lost.isZero() ? ` (−$${fmt(e.lost)})` : ''}`);
          announce(`Wave ${e.wave} lost. The base was damaged.`);
          play('waveLose');
        }
        break;
      case 'boss':
        toast(e.win ? `Boss defeated: ${e.name}!` : `${e.name} won this time`, 5000);
        announce(e.win ? `Boss defeated: ${e.name}` : `Boss fight lost: ${e.name}`, { urgent: true });
        play(e.win ? 'waveWin' : 'waveLose');
        break;
      case 'prestige':
        toast(`Region ${e.region + 1} reached!`, 4000);
        announce(`Prestige complete. Welcome to region ${e.region + 1}`, { urgent: true });
        play('prestige');
        break;
      case 'daily':
      case 'questDone':
        toast(e.type === 'daily' ? `Daily reward: ${e.text}` : `Quest complete: ${e.name}`, 4000);
        play('reward');
        break;
      case 'sold':
        play('sell');
        break;
      case 'placed':
        play('place');
        break;
      case 'bought':
        play('buy');
        break;
      case 'toast':
        toast(e.text);
        break;
      case 'tip':
        tipsUI.push(e);
        break;
      case 'tutorialAssist':
        toast(e.text, 4500);
        announce(e.text);
        break;
      case 'tutorialReward':
        toast(`Tutorial reward: ${e.text}`, 4500);
        play('reward');
        announce(`Tutorial reward: ${e.text}`);
        break;
      case 'tutorialDone':
        toast('Tutorial complete! Replay it any time from Settings.', 5000);
        announce('Tutorial complete.', { urgent: true });
        play('levelUp');
        break;
      case 'blocked':
        announce('Backpack is full. Rolls are blocked.', { urgent: true });
        play('error');
        break;
      case 'fuse':
        toast(e.success ? `Fusion success: ${e.title}` : 'Fusion failed');
        play(e.success ? 'reward' : 'error');
        break;
      default:
    }
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

// ------------------------------------------------------------------ loop
let uiAcc = 0;
const loop = createLoop({
  update: (dt, realDt) => {
    const enc = gs()._enc;
    if (enc && enc.manual) {
      // camera-relative movement: keys and joystick
      const yaw = gfx.cam.yaw;
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);
      const f = (input.isDown('moveUp') ? 1 : 0) - (input.isDown('moveDown') ? 1 : 0) - touchMove.z;
      const r = (input.isDown('moveRight') ? 1 : 0) - (input.isDown('moveLeft') ? 1 : 0) + touchMove.x;
      game.manualInput = { mx: fx * f + rx * r, mz: fz * f + rz * r, ax: aim.x, az: aim.z, dash: flags.dash, nova: flags.nova, shield: flags.shield };
    } else game.manualInput = null;
    game.step(dt, realDt);
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
    tutorialUI.update(false, dt);
    touch.update();
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
if (window.matchMedia) window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', applySettings);

window.__game = {
  game,
  set: (path, value) => ctx.set(path, value),
  get state() {
    return gs();
  },
  gfx,
  audio,
  cellScreen: (x, y) => gfx.cellToScreen(x, y),
  loop,
  shell,
  placement,
  input,
  applySettings,
  debug: game.debug,
  saveNow: () => game.saveNow(),
  gpuAudit: () => gfx.audit(),
  tutorialUI,
  tipsUI,
};

shell.open('roll');
applySettings();
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

/** First run: choose a pace (Relaxed or Standard; the exact differences come from data/difficulty.json), then the tutorial starts. */
async function firstRun() {
  if (gs().tutorial.status !== 'new') return;
  if (gs().difficulty === null) {
    const m = MODES.relaxed.mods;
    const pct = (x) => `${Math.round(Math.abs(x - 1) * 100)}%`;
    const choice = await choiceDialog({
      title: 'Choose your pace',
      html: `<p>You can change this any time in Settings.</p>
        <p><b>Relaxed</b>: ${esc(MODES.relaxed.tagline)} Concretely: waves every ${Math.round(60 * m.wavePace)} s instead of 60 s, enemies with ${pct(m.enemyHp)} less health, lost waves cost ${pct(m.lossPenalty)} less, ${pct(m.income)} more income, free rolls every ${Math.round(120 * m.freeRollInterval)} s instead of 120 s and ${pct(m.bossTime)} more time against bosses.</p>
        <p><b>Standard</b>: ${esc(MODES.standard.tagline)}</p>`,
      choices: [{ id: 'relaxed', label: 'Relaxed (recommended for new players)', primary: true }, { id: 'standard', label: 'Standard' }],
      focus: 'relaxed',
      escape: 'relaxed',
    });
    game.setDifficulty(choice);
    game.saveNow();
  }
  if (gs().tutorial.status === 'new') game.tutorial.start(); // begin the guided tutorial
}
firstRun();
