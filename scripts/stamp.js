// Stages the static site for deployment. No build step and no bundling: files are copied, and every deploy lives in its own
// folder (v/<version>/) that is never overwritten, so a browser that cached an older index.html always finds a complete,
// consistent set of files (or a 404, which index.html recovers from by reloading). Root files: index.html (rewritten to point
// at the versioned folder), 404.html, version.json, assets, .nojekyll.
// Usage: node scripts/stamp.js --version 1.0.0-abc1234 --out _site [--site-url https://user.github.io/repo/] [--cname game.example.com]
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const version = arg('version', `${pkg.version}-local`);
const out = resolve(arg('out', '_site'));
const siteUrl = arg('site-url', '');
if (!/^[A-Za-z0-9._+-]+$/.test(version)) throw new Error('version may only contain letters, digits and . _ + -');

rmSync(out, { recursive: true, force: true });
const dir = join(out, 'v', version);
mkdirSync(dir, { recursive: true });
for (const d of ['src', 'vendor']) cpSync(d, join(dir, d), { recursive: true });
if (existsSync('assets')) cpSync('assets', join(out, 'assets'), { recursive: true });

writeFileSync(join(dir, 'src/version.js'), `// stamped by scripts/stamp.js\nexport const VERSION = ${JSON.stringify(version)};\n`);

let html = readFileSync('index.html', 'utf8');
html = html.replaceAll('./src/', `./v/${version}/src/`).replaceAll('./vendor/', `./v/${version}/vendor/`);
if (siteUrl) {
  const base = siteUrl.endsWith('/') ? siteUrl : siteUrl + '/';
  html = html.replace('content="./assets/og.png"', `content="${base}assets/og.png"`).replace('</head>', `  <meta property="og:url" content="${base}">\n  <link rel="canonical" href="${base}">\n</head>`);
}
writeFileSync(join(out, 'index.html'), html);
writeFileSync(join(out, '404.html'), readFileSync('404.html', 'utf8'));
writeFileSync(join(out, 'version.json'), JSON.stringify({ version, built: new Date().toISOString() }) + '\n');
writeFileSync(join(out, '.nojekyll'), '');
const cname = arg('cname', '');
if (cname) {
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(cname)) throw new Error('--cname must be a domain name');
  writeFileSync(join(out, 'CNAME'), cname + '\n'); // GitHub Pages custom domain
}
console.log(`staged ${version} -> ${out} (site files in v/${version}/)`);
