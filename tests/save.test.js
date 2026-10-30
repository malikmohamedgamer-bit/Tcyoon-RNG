import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SaveManager, MemoryStorage, createStorage, migrate, encodeExport, decodeExport, SAVE_KEY, BACKUP_PREFIX } from '../src/core/save.js';

const migrations = {
  1: (d) => ({ ...d, gold: d.money, money: undefined }),
  2: (d) => ({ ...d, extra: true }),
};
const mk = (storage = new MemoryStorage()) => new SaveManager({ version: 3, migrations, storage });

test('empty storage -> status empty', () => {
  assert.equal(mk().load().status, 'empty');
});

test('save then load round trips and stamps the version', () => {
  const m = mk();
  assert.ok(m.save({ gold: 5 }));
  const r = m.load();
  assert.equal(r.status, 'ok');
  assert.equal(r.data.gold, 5);
  assert.equal(r.data.v, 3);
});

test('old versions migrate through every step', () => {
  const st = new MemoryStorage();
  st.setItem(SAVE_KEY, JSON.stringify({ v: 1, money: 9 }));
  const r = mk(st).load();
  assert.equal(r.status, 'migrated');
  assert.equal(r.migratedFrom, 1);
  assert.equal(r.data.gold, 9);
  assert.equal(r.data.extra, true);
  assert.equal(r.data.v, 3);
});

test('a save newer than the game is refused (and backed up), not overwritten silently', () => {
  const st = new MemoryStorage();
  st.setItem(SAVE_KEY, JSON.stringify({ v: 99 }));
  const m = mk(st);
  const r = m.load();
  assert.equal(r.status, 'corrupt');
  assert.ok(r.backupKey.startsWith(BACKUP_PREFIX));
  assert.equal(m.listBackups().length, 1);
});

test('corrupt JSON is backed up and the live key cleared', () => {
  const st = new MemoryStorage();
  st.setItem(SAVE_KEY, '{not json');
  const m = mk(st);
  const r = m.load();
  assert.equal(r.status, 'corrupt');
  assert.equal(st.getItem(r.backupKey), '{not json');
  assert.equal(st.getItem(SAVE_KEY), null);
});

test('only the 3 newest corrupt backups are kept', () => {
  const st = new MemoryStorage();
  const m = mk(st);
  for (let i = 0; i < 6; i++) {
    st.setItem(BACKUP_PREFIX + (1000 + i), 'x');
    m.backupCorrupt('y' + i);
  }
  assert.ok(m.listBackups().length <= 3);
});

test('export/import round trip including unicode, and tamper detection', () => {
  const m = mk();
  const text = m.exportText({ gold: 12, name: 'Tcyoon 🎲 ñ' });
  assert.ok(text.startsWith('TRNG1.'));
  const r = m.importText(text);
  assert.ok(r.ok);
  assert.equal(r.data.name, 'Tcyoon 🎲 ñ');
  assert.equal(r.data.v, 3);
  const parts = text.split('.');
  parts[1] = parts[1].slice(0, -4) + 'AAAA';
  assert.equal(m.importText(parts.join('.')).ok, false);
  assert.equal(m.importText('hello').ok, false);
  assert.equal(m.importText('').ok, false);
  assert.throws(() => decodeExport('TRNG1.!!!.0'));
});

test('import of an old export migrates it', () => {
  const m = mk();
  const text = encodeExport({ v: 1, money: 4 });
  const r = m.importText(text);
  assert.ok(r.ok);
  assert.equal(r.data.gold, 4);
});

test('storage that throws on write falls back to memory and keeps working', () => {
  const bad = { kind: 'localStorage', getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem() {}, keys: () => [] };
  const m = mk(bad);
  assert.equal(m.save({ gold: 1 }), false);
  assert.equal(m.usingFallback, true);
  assert.equal(m.load().data.gold, 1);
});

test('createStorage falls back to memory when localStorage is unavailable or throws', () => {
  assert.equal(createStorage({}).kind, 'memory');
  const throwing = { get localStorage() { throw new Error('blocked'); } };
  assert.equal(createStorage(throwing).kind, 'memory');
  const fake = new Map();
  const ok = { localStorage: { setItem: (k, v) => fake.set(k, v), getItem: (k) => fake.get(k) ?? null, removeItem: (k) => fake.delete(k), key: (i) => [...fake.keys()][i], get length() { return fake.size; } } };
  assert.equal(createStorage(ok).kind, 'localStorage');
});

test('migrate() rejects non-objects and missing steps', () => {
  assert.throws(() => migrate(null, 2, {}));
  assert.throws(() => migrate([], 2, {}));
  assert.throws(() => migrate({ v: 1 }, 2, {}), /missing migration/);
});
