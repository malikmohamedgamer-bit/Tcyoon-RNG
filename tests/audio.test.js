import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOUNDS, soundDef, soundLength, createAudio } from '../src/core/audio.js';
import { BASE_THEMES, regionTheme } from '../src/gen/themes.js';

const flavour = (t) => ({ wave: t.sfx.wave, base: t.sfx.base, scale: t.sfx.scale });

test('every sound has a caption (except the silent UI tick), a category and note events', () => {
  for (const [name, def] of Object.entries(SOUNDS)) {
    assert.ok(def.cat === 'sfx', name);
    if (name !== 'ui' && name !== 'tick') assert.match(def.caption, /^\[.+\]$/, name); // the UI click and the reel tick have no caption on purpose (it would spam)
    const ev = soundDef(name, { tier: 3, flavour: flavour(BASE_THEMES[0]) });
    assert.ok(ev.length >= 1, name);
    for (const e of ev) {
      assert.ok(e.dur > 0 && e.dur < 2, `${name} dur`);
      assert.ok(e.gain > 0 && e.gain <= 0.4, `${name} gain`);
      assert.ok(e.noise || (Number.isFinite(e.freq) && e.freq >= 15 && e.freq < 12000), `${name} freq ${e.freq}`);
      assert.ok(e.t >= 0 && e.t < 1.5);
    }
    assert.ok(soundLength(ev) < 2);
  }
});

test('sound design is deterministic and themed: different regions sound different, same region sounds the same', () => {
  const a = soundDef('levelUp', { tier: 0, flavour: flavour(regionTheme(0)) });
  const b = soundDef('levelUp', { tier: 0, flavour: flavour(regionTheme(0)) });
  const c = soundDef('levelUp', { tier: 0, flavour: flavour(regionTheme(2)) });
  const d = soundDef('levelUp', { tier: 0, flavour: flavour(regionTheme(7, 5)) }); // a remixed region
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.map((e) => e.freq), c.map((e) => e.freq));
  assert.notDeepEqual(c.map((e) => e.freq), d.map((e) => e.freq));
  assert.notEqual(a[0].wave === c[0].wave && a[0].freq === c[0].freq, true);
});

test('big rolls get longer, richer fanfares as the tier rises (rarity is audible too)', () => {
  const f = flavour(BASE_THEMES[1]);
  const low = soundDef('bigRoll', { tier: 0, flavour: f });
  const high = soundDef('bigRoll', { tier: 30, flavour: f });
  assert.ok(high.length > low.length);
  for (const tier of [0, 5, 40, 1e9, -3, NaN]) for (const e of soundDef('roll', { tier, flavour: f })) assert.ok(Number.isFinite(e.freq));
});

test('createAudio: muted or no AudioContext means no voices, never throws; captions still work when enabled', () => {
  const caps = [];
  const settings = { muted: true, captions: true, volume: { master: 1, sfx: 1, music: 1 } };
  const audio = createAudio({ getSettings: () => settings, onCaption: (c) => caps.push(c) });
  assert.equal(audio.play('sell'), false); // muted: not played...
  assert.deepEqual(caps, ['[coin chime]']); // ...but captioned (so the info is not lost for deaf players)
  settings.muted = false;
  assert.equal(audio.play('sell'), false); // Node has no AudioContext: safe no-op
  assert.equal(audio.unlock(), false);
  settings.captions = false;
  audio.play('roll');
  assert.equal(caps.length, 2);
  assert.equal(audio.play('nope'), false);
  audio.dispose();
});
