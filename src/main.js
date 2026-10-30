// Bootstrap: load the save, build the renderer, run the fixed-step loop.
import { createLoop } from './core/loop.js';
import { SaveManager } from './core/save.js';
import { now } from './core/time.js';
import { createRenderer } from './render/scene.js';
import { regionTheme } from './gen/themes.js';
import { createHud } from './ui/hud.js';
import { createState, serializeState, deserializeState, SAVE_VERSION, MIGRATIONS } from './sim/state.js';

const canvas = document.getElementById('view');
const save = new SaveManager({ version: SAVE_VERSION, migrations: MIGRATIONS });
const loaded = save.load();
const state = loaded.data ? deserializeState(loaded.data) : createState();

const gfx = createRenderer({ canvas, quality: state.settings.quality, pixelSize: state.settings.pixelSize });
const theme = regionTheme(state.region, state.seed);
gfx.setTheme(theme);
gfx.setBaseSide(6);

function update(dt) {
  state.playtime += dt;
  state.money = state.money.add(dt); // placeholder income until production lands (milestone 3)
}

const hud = createHud(document.getElementById('hud'), () => state);
const loop = createLoop({
  update,
  render: (alpha, dt) => {
    gfx.render(dt);
    hud.frame();
    hud.update();
  },
});
window.addEventListener('resize', () => gfx.resize());
const saveNow = () => save.save(serializeState(state, now()));
setInterval(saveNow, 10000);

window.__game = { get state() { return state; }, gfx, loop, save, theme, saveNow, gpuAudit: () => gfx.audit() };
loop.start();
