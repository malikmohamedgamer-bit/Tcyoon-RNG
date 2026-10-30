// Zero-dependency static file server for `npm run dev` and the Playwright e2e run.
// Serves the repository root. PORT env var overrides the default 5173.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ROOT_DIR serves another folder (a staged site); BASE_PATH serves it under a sub-path like GitHub project pages (/<repo>/).
const root = process.env.ROOT_DIR ? resolve(process.env.ROOT_DIR) : resolve(fileURLToPath(new URL('..', import.meta.url)));
const base = (process.env.BASE_PATH || '').replace(/\/$/, '');
const port = Number(process.env.PORT) || 5173;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (base) {
        if (p !== base && !p.startsWith(base + '/')) throw new Error('outside the base path'); // like GitHub Pages: nothing exists outside /<repo>/
        p = p.slice(base.length) || '/';
      }
      if (p.endsWith('/')) p += 'index.html';
      const file = normalize(join(root, p));
      if (!file.startsWith(root)) {
        res.writeHead(403).end('forbidden');
        return;
      }
      const st = await stat(file);
      if (!st.isFile()) throw new Error('not a file');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch {
      try {
        const page = await readFile(join(root, '404.html')); // Pages serves the site's 404.html
        res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }).end(page);
      } catch {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      }
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createServer().listen(port, () => console.log(`Tcyoon RNG dev server: http://localhost:${port}/`));
}
