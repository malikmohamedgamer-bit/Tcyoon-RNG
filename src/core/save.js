// Persistence: versioned saves in localStorage with an in-memory fallback,
// migrations, corrupt-save backup, and checksummed text export/import.
// This module knows nothing about the game's state shape; the game supplies
// `version` and a `migrations` table ({ fromVersion: (data) => data }).

import { hash32 } from './rng.js';

export const SAVE_KEY = 'tcyoon-rng:save';
export const BACKUP_PREFIX = 'tcyoon-rng:corrupt-';
const MAX_BACKUPS = 3;

export class MemoryStorage {
  constructor() {
    this.map = new Map();
    this.kind = 'memory';
  }
  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null;
  }
  setItem(k, v) {
    this.map.set(k, String(v));
  }
  removeItem(k) {
    this.map.delete(k);
  }
  keys() {
    return [...this.map.keys()];
  }
}

/** localStorage if it works (it can throw in private mode / blocked storage), else memory. */
export function createStorage(win = globalThis) {
  try {
    const ls = win.localStorage;
    if (!ls) throw new Error('no localStorage');
    const probe = '__trng_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return {
      kind: 'localStorage',
      getItem: (k) => ls.getItem(k),
      setItem: (k, v) => ls.setItem(k, v),
      removeItem: (k) => ls.removeItem(k),
      keys: () => {
        const out = [];
        for (let i = 0; i < ls.length; i++) out.push(ls.key(i));
        return out;
      },
    };
  } catch {
    return new MemoryStorage();
  }
}

/** Apply migrations from data.v up to `version`. Returns { data, migratedFrom } or throws. */
export function migrate(data, version, migrations) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('save is not an object');
  let v = Number.isInteger(data.v) ? data.v : 1;
  if (v > version) throw new Error(`save version ${v} is newer than this game (${version})`);
  if (v < 1) throw new Error('invalid save version');
  const from = v;
  let cur = data;
  while (v < version) {
    const fn = migrations[v];
    if (!fn) throw new Error(`missing migration from v${v}`);
    cur = fn(cur);
    v += 1;
    cur.v = v;
  }
  return { data: cur, migratedFrom: from };
}

export class SaveManager {
  /**
   * @param {object} o
   * @param {number} o.version current schema version
   * @param {object} o.migrations table of migrations keyed by source version
   * @param {object} [o.storage] storage with getItem/setItem/removeItem/keys
   * @param {string} [o.key]
   */
  constructor({ version, migrations = {}, storage = createStorage(), key = SAVE_KEY }) {
    this.version = version;
    this.migrations = migrations;
    this.storage = storage;
    this.key = key;
    this.lastError = null;
    this.usingFallback = storage.kind === 'memory';
  }

  /** @returns {{data:object|null, status:'empty'|'ok'|'migrated'|'corrupt', migratedFrom?:number, backupKey?:string}} */
  load() {
    let raw;
    try {
      raw = this.storage.getItem(this.key);
    } catch (e) {
      this.lastError = e;
      return { data: null, status: 'empty' };
    }
    if (raw == null) return { data: null, status: 'empty' };
    try {
      const parsed = JSON.parse(raw);
      const { data, migratedFrom } = migrate(parsed, this.version, this.migrations);
      return { data, status: migratedFrom === this.version ? 'ok' : 'migrated', migratedFrom };
    } catch (e) {
      this.lastError = e;
      const backupKey = this.backupCorrupt(raw);
      try {
        this.storage.removeItem(this.key);
      } catch {
        /* ignore */
      }
      return { data: null, status: 'corrupt', backupKey, error: String(e.message || e) };
    }
  }

  /** Keep a copy of an unreadable save so the player (or a developer) can recover it. */
  backupCorrupt(raw) {
    const key = BACKUP_PREFIX + Date.now();
    try {
      this.storage.setItem(key, raw);
      const keys = this.storage.keys().filter((k) => k.startsWith(BACKUP_PREFIX)).sort();
      while (keys.length > MAX_BACKUPS) this.storage.removeItem(keys.shift());
      return key;
    } catch (e) {
      this.lastError = e;
      return null;
    }
  }

  listBackups() {
    return this.storage.keys().filter((k) => k.startsWith(BACKUP_PREFIX)).sort();
  }

  save(data) {
    const payload = { ...data, v: this.version };
    try {
      this.storage.setItem(this.key, JSON.stringify(payload));
      return true;
    } catch (e) {
      // quota / blocked storage: keep playing from memory, surface the error
      this.lastError = e;
      if (!(this.storage instanceof MemoryStorage)) {
        this.storage = new MemoryStorage();
        this.usingFallback = true;
        try {
          this.storage.setItem(this.key, JSON.stringify(payload));
        } catch {
          /* ignore */
        }
      }
      return false;
    }
  }

  wipe() {
    try {
      this.storage.removeItem(this.key);
    } catch {
      /* ignore */
    }
  }

  // ------------------------------------------------------------ export / import
  exportText(data) {
    return encodeExport({ ...data, v: this.version });
  }

  /** @returns {{ok:true,data:object,migratedFrom:number}|{ok:false,error:string}} */
  importText(text) {
    try {
      const parsed = decodeExport(text);
      const { data, migratedFrom } = migrate(parsed, this.version, this.migrations);
      return { ok: true, data, migratedFrom };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  }
}

// "TRNG1." + base64(utf8 json) + "." + checksum(hex)
export function encodeExport(obj) {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  return `TRNG1.${b64}.${hash32(json).toString(16)}`;
}

export function decodeExport(text) {
  const t = String(text || '').trim();
  const parts = t.split('.');
  if (parts.length !== 3 || parts[0] !== 'TRNG1') throw new Error('not a Tcyoon RNG export');
  let json;
  try {
    const bin = atob(parts[1]);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    json = new TextDecoder().decode(bytes);
  } catch {
    throw new Error('export text is damaged (bad encoding)');
  }
  if (hash32(json).toString(16) !== parts[2]) throw new Error('export text is damaged (checksum mismatch)');
  return JSON.parse(json);
}
