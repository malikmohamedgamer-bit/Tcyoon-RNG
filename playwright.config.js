import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // the 5-minute soak only runs when asked for by name (`npm run test:soak`)
  testIgnore: process.argv.some((a) => a.includes('soak')) ? [] : ['**/soak.spec.js'],
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5199',
    viewport: { width: 1280, height: 720 },
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'] },
  },
  webServer: { command: 'node scripts/serve.js', url: 'http://localhost:5199/', env: { PORT: '5199' }, reuseExistingServer: true, timeout: 20_000 },
});
