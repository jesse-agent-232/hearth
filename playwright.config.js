import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: 'tests',
	// *.test.js files are node:test unit tests (npm test), not Playwright specs.
	testMatch: '**/*.spec.js',
	timeout: 30000,
	use: {
		baseURL: 'http://localhost:5173',
		headless: true
	},
	projects: [
		{ name: 'chromium', use: { browserName: 'chromium' } }
	]
});
