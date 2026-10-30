import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function stage(version, extra = []) {
  const out = mkdtempSync(join(tmpdir(), 'trng-site-'));
  execFileSync('node', ['scripts/stamp.js', '--version', version, '--out', out, ...extra], { stdio: 'pipe' });
  return out;
}
const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));

test('the staged site: versioned folder, rewritten index.html, 404, version.json, stamped version.js, nothing else changed', () => {
  const out = stage('1.2.3-abc1234', ['--site-url', 'https://example.github.io/repo']);
  const v = join(out, 'v', '1.2.3-abc1234');
  assert.ok(existsSync(join(v, 'src/main.js')) && existsSync(join(v, 'vendor/three/three.module.min.js')) && existsSync(join(v, 'vendor/fonts')));
  assert.match(readFileSync(join(v, 'src/version.js'), 'utf8'), /VERSION = "1\.2\.3-abc1234"/);
  const html = readFileSync(join(out, 'index.html'), 'utf8');
  assert.ok(html.includes('./v/1.2.3-abc1234/src/main.js') && html.includes('./v/1.2.3-abc1234/src/ui/style.css') && html.includes('./v/1.2.3-abc1234/vendor/three/three.module.min.js'));
  assert.ok(!html.includes('"./src/') && !html.includes('"./vendor/'), 'no unversioned file reference is left');
  assert.ok(html.includes('content="https://example.github.io/repo/assets/og.png"') && html.includes('rel="canonical" href="https://example.github.io/repo/"'));
  assert.equal(JSON.parse(readFileSync(join(out, 'version.json'), 'utf8')).version, '1.2.3-abc1234');
  assert.ok(existsSync(join(out, '404.html')) && existsSync(join(out, '.nojekyll')) && existsSync(join(out, 'assets/og.png')));
});

test('no absolute path anywhere in the shipped site (it must work from /<repo>/): html, css and js', () => {
  const out = stage('abs-check');
  for (const f of walk(out).filter((p) => /\.(html|css|js)$/.test(p) && !p.includes('three.module.min.js'))) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/(?:src|href)=["'](\/[^/"'][^"']*)["']|url\(\s*["']?(\/[^/"')][^"')]*)|(?:import|fetch)\s*\(\s*["'](\/[^/"'][^"']*)["']/g)) {
      assert.fail(`${f.replace(out, '')}: absolute path ${m[1] || m[2] || m[3]}`);
    }
  }
});

test('every file the staged index.html and style sheets reference exists in the staged site', () => {
  const out = stage('refs');
  const html = readFileSync(join(out, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href|content)="(\.\/[^"]+)"/g)].map((m) => m[1]).filter((r) => !r.includes('#'));
  assert.ok(refs.length >= 4, refs.join());
  for (const r of refs) assert.ok(existsSync(join(out, r)), r);
  const css = readFileSync(join(out, 'v/refs/src/ui/style.css'), 'utf8');
  assert.ok(css.includes('@import url("./fonts.css")'));
  const fonts = readFileSync(join(out, 'v/refs/src/ui/fonts.css'), 'utf8');
  for (const m of fonts.matchAll(/url\("([^"]+)"\)/g)) assert.ok(existsSync(join(out, 'v/refs/src/ui', m[1])), m[1]);
});

test('bad version strings are refused (they become folder names)', () => {
  assert.throws(() => execFileSync('node', ['scripts/stamp.js', '--version', '../evil', '--out', mkdtempSync(join(tmpdir(), 'x-'))], { stdio: 'pipe' }));
});

test('--cname writes a CNAME file for a custom domain and refuses anything that is not a domain', () => {
  const out = stage('cname-1', ['--cname', 'game.example.com']);
  assert.equal(readFileSync(join(out, 'CNAME'), 'utf8').trim(), 'game.example.com');
  assert.ok(!existsSync(join(stage('no-cname'), 'CNAME')));
  assert.throws(() => execFileSync('node', ['scripts/stamp.js', '--version', 'x', '--out', mkdtempSync(join(tmpdir(), 'x-')), '--cname', 'evil/../x'], { stdio: 'pipe' }));
});
