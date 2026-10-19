const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests', timeout: 40000, fullyParallel: true, workers: 2,
  use: { baseURL: 'http://127.0.0.1:4173/beoydi-worldpick/', trace: 'retain-on-failure' },
  webServer: { command: 'npm run preview', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined } } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'], launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined } } },
    { name: 'iphone-webkit', use: { ...devices['iPhone 13'] } },
  ],
});
