import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.TEST_BASE_URL ?? 'http://localhost:5173';

export default defineConfig({
	testDir: './tests',
	timeout: 30_000,
	retries: process.env.CI ? 2 : 0,
	use: {
		baseURL,
		headless: true,
		trace: 'on-first-retry'
	},
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }
	],
	// Start dev server automatically when not pointing at a live URL
	webServer: process.env.TEST_BASE_URL
		? undefined
		: {
				command: 'pnpm dev',
				url: 'http://localhost:5173',
				reuseExistingServer: !process.env.CI,
				timeout: 60_000
			}
});
