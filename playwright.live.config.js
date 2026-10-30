// Smoke test of the LIVE site (after every deploy and once a day). Usage: LIVE_URL=https://user.github.io/repo/ npm run smoke:live
import { defineConfig } from '@playwright/test';

const url = process.env.LIVE_URL;
if (!url) throw new Error('Set LIVE_URL to the address of the deployed game, e.g. https://user.github.io/repo/');
export default defineConfig({
  testDir: './e2e/live',
  timeout: 90_000,
  retries: 1,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: url.endsWith('/') ? url : url + '/',
    viewport: { width: 1280, height: 720 },
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
});
