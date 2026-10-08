import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 3100);
const dbUrl = process.env.E2E_DATABASE_URL ?? 'postgres://valora:valora@localhost:5432/valora_e2e';
const localChromium = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    launchOptions: existsSync(localChromium) ? { executablePath: localChromium } : {},
  },
  webServer: {
    // Requires `npm run build` first. Uses test fixtures (never real listings) and no AI key.
    command: 'node dist/server/db/migrate.js && node dist/server/index.js',
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      NODE_ENV: 'test',
      PORT: String(port),
      DATABASE_URL: dbUrl,
      ENABLE_FIXTURE_PROVIDER: 'true',
      ENABLE_POSTCODES_IO: 'false',
      ENABLE_LAND_REGISTRY: 'false',
      ENABLE_PLANNING_DATA: 'false',
      DISABLE_RATE_LIMIT: 'true',
      WORKER_POLL_MS: '300',
      LOG_LEVEL: 'warn',
    },
  },
});
