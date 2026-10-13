import { defineConfig } from '@playwright/test'

const WEB_URL = 'http://localhost:5173'
const API_URL = 'http://localhost:3001'

// The tests run the real site against the real API handler and DynamoDB Local. Locally,
// `npm run dev:api` starts DynamoDB Local in Docker; in CI it is a service container.
export default defineConfig({
  testDir: 'e2e',
  // One shared board, so tests run one at a time.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command: process.env.CI ? 'node scripts/dev-api.ts' : 'npm run dev:api',
      url: `${API_URL}/state`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npx vite --port 5173 --strictPort',
      url: WEB_URL,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
})
