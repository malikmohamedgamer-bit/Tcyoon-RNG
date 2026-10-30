// Synthesised WebAudio sound: no audio files. `soundDef()` is a PURE function that turns a sound
// name + context (tier, theme flavour) into note events, so sound design is unit-testable in Node;
// `createAudio()` plays those events through WebAudio with mute, per-channel volume, a voice cap,
// rate limiting for noisy sounds and a caption hook (every sound has a text caption).
//
// Theme flavour (data/themes.json `sfx`): wave shape, base frequency, scale (semitones) and a noise
// style, so every region sounds different; remixed regions transpose/permute it.

export const SOUNDS = {
  roll: { caption: '[dice rattle]', cat: 'sfx', limit: 4 },
  bigRoll: { caption: '[rare item fanfare]', cat: 'sfx' },
  sell: { caption: '[coin chime]', cat: 'sfx' },
  place: { caption: '[item placed]', cat: 'sfx' },
  error: { caption: '[error buzz]', cat: 'sfx' },
  buy: { caption: '[purchase click]', cat: 'sfx' },
  levelUp: { caption: '[level up jingle]', cat: 'sfx' },
  reward: { caption: '[reward chime]', cat: 'sfx' },
  prestige: { caption: '[rebirth sweep]', cat: 'sfx' },
  waveStart: { caption: '[war horn: wave incoming]', cat: 'sfx' },
  waveWin: { caption: '[victory fanfare]', cat: 'sfx' },
  waveLose: { caption: '[defeat drone]', cat: 'sfx' },
  boss: { caption: '[low boss growl]', cat: 'sfx' },
  shot: { caption: '[shot]', cat: 'sfx', limit: 6 },
  kill: { caption: '[enemy defeated]', cat: 'sfx', limit: 5 },
  nova: { caption: '[nova blast]', cat: 'sfx' },
  ui: { caption: '', cat: 'sfx', limit: 10 },
};

const semitone = (base, n) => base * Math.pow(2, n / 12);
/** note(i): the i-th degree of the region's scale (negative = lower octaves). */
const pick = (scale, i) => scale[((i % scale.length) + scale.length) % scale.length] + 12 * Math.floor(i / scale.length);

/**
 * Note events for a sound. Each event: { t (start s), dur, freq, wave, gain, slide? (target freq), noise? }.
 * @param {string} name key of SOUNDS
 * @param {{tier?:number, flavour:{wave:string, base:number, scale:number[]}}} ctx
 */
export function soundDef(name, ctx) {
  const f = ctx.flavour;
  const tier = Math.max(0, Math.min(40, ctx.tier || 0));
  const note = (i) => semitone(f.base, pick(f.scale, i));
  const ev = (t, dur, freq, o = {}) => ({ t, dur, freq, wave: o.wave || f.wave, gain: o.gain ?? 0.25, slide: o.slide, noise: !!o.noise });
  switch (name) {
    case 'roll':
      return [ev(0, 0.05, note(2 + (tier % 4)), { gain: 0.18 }), ev(0.05, 0.07, note(4 + (tier % 5)), { gain: 0.2 })];
    case 'bigRoll': {
      const n = 3 + Math.min(5, Math.floor(tier / 3));
      return Array.from({ length: n }, (_, i) => ev(i * 0.07, 0.16, note(i * 2 + 4), { gain: 0.22 }));
    }
    case 'sell':
      return [ev(0, 0.06, note(7), { wave: 'square', gain: 0.15 }), ev(0.06, 0.14, note(11), { wave: 'square', gain: 0.15 })];
    case 'place':
      return [ev(0, 0.09, note(-2), { wave: 'triangle', gain: 0.3, slide: note(-5) })];
    case 'error':
      return [ev(0, 0.14, note(-3), { wave: 'sawtooth', gain: 0.2 }), ev(0.12, 0.16, note(-4), { wave: 'sawtooth', gain: 0.2 })];
    case 'buy':
      return [ev(0, 0.04, note(5), { wave: 'square', gain: 0.12 }), ev(0.05, 0.08, note(9), { wave: 'square', gain: 0.12 })];
    case 'levelUp':
      return [0, 2, 4, 7, 9].map((k, i) => ev(i * 0.08, 0.2, note(k + 5), { gain: 0.22 }));
    case 'reward':
      return [ev(0, 0.12, note(9), { gain: 0.2 }), ev(0.1, 0.2, note(14), { gain: 0.2 })];
    case 'prestige':
      return [ev(0, 0.9, note(-5), { wave: 'sawtooth', gain: 0.18, slide: note(7) }), ev(0.6, 0.5, note(5), { gain: 0.2 })];
    case 'waveStart':
      return [ev(0, 0.35, note(-2), { wave: 'sawtooth', gain: 0.22 }), ev(0.4, 0.5, note(-2), { wave: 'sawtooth', gain: 0.22 })];
    case 'waveWin':
      return [0, 4, 7, 12].map((k, i) => ev(i * 0.1, 0.25, note(k), { gain: 0.22 }));
    case 'waveLose':
      return [ev(0, 0.6, note(-5), { wave: 'sawtooth', gain: 0.22, slide: note(-8) })];
    case 'boss':
      return [ev(0, 0.8, note(-8), { wave: 'sawtooth', gain: 0.3, slide: note(-10) }), ev(0.1, 0.7, note(-7), { wave: 'square', gain: 0.12 })];
    case 'shot':
      return [ev(0, 0.05, note(6 + (tier % 3)), { wave: 'square', gain: 0.06, slide: note(0) })];
    case 'kill':
      return [ev(0, 0.1, 0, { noise: true, gain: 0.1 })];
    case 'nova':
      return [ev(0, 0.5, note(-5), { wave: 'sawtooth', gain: 0.25, slide: note(4) }), ev(0, 0.35, 0, { noise: true, gain: 0.12 })];
    default:
      return [ev(0, 0.03, note(4), { wave: 'sine', gain: 0.1 })];
  }
}

/** Total duration of a sound in seconds. */
export const soundLength = (events) => events.reduce((m, e) => Math.max(m, e.t + e.dur), 0);

const MAX_VOICES = 14;

export function createAudio({ getSettings, onCaption } = {}) {
  let ac = null;
  let master = null;
  let sfxBus = null;
  let musicBus = null;
  let voices = 0;
  let flavour = { wave: 'square', base: 130, scale: [0, 3, 5, 7, 10], noise: 'clank' };
  const lastPlay = new Map();
  const stats = { played: 0, dropped: 0, captions: 0 };
  let musicTimer = null;
  let musicStep = 0;
  let noiseBuf = null;

  const st = () => (getSettings ? getSettings() : {}) || {};
  const vol = () => st().volume || { master: 0.7, sfx: 1, music: 0.35 };

  function ensure() {
    if (ac) return ac;
    const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctor) return null;
    try {
      ac = new Ctor();
    } catch {
      return null;
    }
    master = ac.createGain();
    sfxBus = ac.createGain();
    musicBus = ac.createGain();
    sfxBus.connect(master);
    musicBus.connect(master);
    master.connect(ac.destination);
    applyVolumes();
    return ac;
  }

  function applyVolumes() {
    if (!ac) return;
    const v = vol();
    const muted = !!st().muted;
    master.gain.value = muted ? 0 : v.master;
    sfxBus.gain.value = v.sfx;
    musicBus.gain.value = v.music;
  }

  function noise() {
    if (noiseBuf) return noiseBuf;
    noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.3), ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let x = 12345;
    for (let i = 0; i < d.length; i++) {
      x = (x * 1664525 + 1013904223) >>> 0; // deterministic noise, no Math.random
      d[i] = (x / 4294967296) * 2 - 1;
    }
    return noiseBuf;
  }

  function schedule(events, bus, t0) {
    for (const e of events) {
      if (voices >= MAX_VOICES) {
        stats.dropped++;
        return;
      }
      const start = t0 + e.t;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, e.gain), start + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, start + e.dur);
      let src;
      if (e.noise) {
        src = ac.createBufferSource();
        src.buffer = noise();
      } else {
        src = ac.createOscillator();
        src.type = e.wave;
        src.frequency.setValueAtTime(e.freq, start);
        if (e.slide) src.frequency.exponentialRampToValueAtTime(Math.max(20, e.slide), start + e.dur);
      }
      src.connect(g);
      g.connect(bus);
      voices++;
      src.onended = () => {
        voices--;
      };
      src.start(start);
      src.stop(start + e.dur + 0.02);
    }
  }

  const api = {
    stats,
    setFlavour(f) {
      if (f) flavour = f;
    },
    get state() {
      return ac ? ac.state : 'none';
    },
    /** Must be called from a user gesture at least once (browser autoplay policy). */
    unlock() {
      const c = ensure();
      if (c && c.state === 'suspended') c.resume();
      return !!c;
    },
    applyVolumes,
    play(name, { tier = 0 } = {}) {
      const def = SOUNDS[name];
      if (!def) return false;
      // captions are independent of whether sound is audible
      if (st().captions && def.caption && onCaption) {
        onCaption(def.caption);
        stats.captions++;
      }
      if (st().muted) return false;
      if (def.limit) {
        const now = (globalThis.performance ? performance.now() : Date.now()) / 1000;
        const arr = (lastPlay.get(name) || []).filter((t) => now - t < 1);
        if (arr.length >= def.limit) {
          stats.dropped++;
          return false;
        }
        arr.push(now);
        lastPlay.set(name, arr);
      }
      const c = ensure();
      if (!c || c.state !== 'running') return false;
      schedule(soundDef(name, { tier, flavour }), sfxBus, c.currentTime + 0.01);
      stats.played++;
      return true;
    },
    /** A very quiet generative loop in the region's scale. */
    startMusic() {
      if (musicTimer || !ensure()) return;
      musicTimer = setInterval(() => {
        if (!ac || ac.state !== 'running' || st().muted || vol().music <= 0) return;
        const n = pick(flavour.scale, [0, 2, 4, 1, 3, 5, 2, 0][musicStep++ % 8]);
        schedule([{ t: 0, dur: 1.6, freq: semitone(flavour.base / 2, n), wave: 'sine', gain: 0.12, noise: false }], musicBus, ac.currentTime + 0.02);
      }, 1800);
    },
    stopMusic() {
      clearInterval(musicTimer);
      musicTimer = null;
    },
    dispose() {
      api.stopMusic();
      if (ac) ac.close();
      ac = null;
    },
  };
  return api;
}
