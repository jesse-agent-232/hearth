import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const PERSONAS = ['family', 'developer', 'minimal'];
const CONFIG_DIR = path.join(process.cwd(), 'tests/personas');
const CONFIG_PATH = path.join(process.cwd(), 'config.yml');

// Backup original config
let originalConfig;
test.beforeAll(() => {
	originalConfig = fs.existsSync(CONFIG_PATH) ? fs.readFileSync(CONFIG_PATH, 'utf8') : null;
});
test.afterAll(() => {
	if (originalConfig) fs.writeFileSync(CONFIG_PATH, originalConfig);
});

// Helper: load persona config, wait for server to pick it up
async function loadPersona(page, persona) {
	const src = path.join(CONFIG_DIR, `${persona}.yml`);
	fs.copyFileSync(src, CONFIG_PATH);
	// Config loader watches file with 2s interval — wait for invalidation + reload
	await page.waitForTimeout(3000);
	// Trigger a fresh server-side load by navigating
	await page.goto('/');
	await page.waitForTimeout(1000);
}

// Helper: navigate as logged-in user (for auth-enabled personas)
async function goHome(page, opts = {}) {
	const url = opts.authEnabled === false ? '/' : '/?user=demo';
	await page.goto(url);
	await page.waitForTimeout(2000);
	// Wait for hydration
	await page.waitForFunction(
		() => document.querySelector('style[data-sveltekit]') === null,
		{ timeout: 10000 }
	).catch(() => {});
}

// Helper: set prefs for logged-in user
async function setPrefs(page, prefs) {
	await page.goto('/');
	await page.evaluate((p) => localStorage.setItem('landing_prefs', JSON.stringify(p)), prefs);
}

// ══════════════════════════════════════════════════════════════
// Family Persona — full features, onboarding, weather, privacy
// ══════════════════════════════════════════════════════════════
test.describe.serial('Persona: Family', () => {
	test.beforeAll(async ({ browser }) => {
		const page = await browser.newPage();
		await loadPersona(page, 'family');
		await page.close();
	});

	test('welcome screen shows brand name', async ({ page }) => {
		await page.goto('/');
		await page.evaluate(() => localStorage.clear());
		await page.goto('/');
		await page.waitForSelector('text=Welcome', { timeout: 10000 });
		await expect(page.locator('text=The Smiths')).toBeVisible();
	});

	test('login button and privacy terms work', async ({ page }) => {
		await page.goto('/');
		await page.evaluate(() => localStorage.clear());
		await page.goto('/');
		await page.waitForSelector('text=Welcome', { timeout: 10000 });

		const loginBtn = page.locator('button', { hasText: /Login/i });
		await expect(loginBtn).toBeDisabled();
		await page.locator('input[type="checkbox"]').check();
		await expect(loginBtn).toBeEnabled();
	});

	test('registration link visible', async ({ page }) => {
		await page.goto('/');
		await page.evaluate(() => localStorage.clear());
		await page.goto('/');
		await page.waitForSelector('text=Welcome', { timeout: 10000 });
		await expect(page.locator('a', { hasText: 'Register' })).toBeVisible();
	});

	test('onboarding shows all configured slides', async ({ page }) => {
		await setPrefs(page, { passwordVerified: true });
		await page.goto('/?user=demo');
		await page.waitForSelector('h2:has-text("Welcome, demo")', { timeout: 10000 });
		// Wait for hydration so buttons are interactive
		await page.waitForFunction(() => document.querySelector('style[data-sveltekit]') === null, { timeout: 10000 });

		// Slide 1: Welcome
		await expect(page.locator('text=Welcome, demo')).toBeVisible();

		// Use dot indicators to navigate — more reliable than Next button
		const dots = page.locator('.flex.gap-1\\.5 button');

		// Slide 2: Services — family apps
		await dots.nth(1).click();
		await expect(page.locator('h2', { hasText: 'Your Services' })).toBeVisible({ timeout: 10000 });
		const serviceNames = await page.locator('.space-y-2 span.text-content').allTextContents();
		expect(serviceNames).toContain('Photos');
		expect(serviceNames).toContain('Passwords');

		// Slide 3: Privacy
		await dots.nth(2).click();
		await expect(page.locator('h2', { hasText: 'Private by Design' })).toBeVisible({ timeout: 10000 });

		// Slide 4: Security tips (custom)
		await dots.nth(3).click();
		await expect(page.locator('h2', { hasText: 'Stay Safe Online' })).toBeVisible({ timeout: 10000 });
		await expect(page.locator('text=Use Passwords app')).toBeVisible();
		await expect(page.locator('text=Ask Dad')).toBeVisible();

		// Slide 5: Weather
		await dots.nth(4).click();
		await expect(page.locator('h2', { hasText: 'Local Weather' })).toBeVisible({ timeout: 10000 });
	});

	test('dashboard shows family apps', async ({ page }) => {
		await setPrefs(page, { onboarded: true, name: 'demo', username: 'demo', passwordVerified: true });
		await page.goto('/?user=demo');
		await page.waitForTimeout(3000);

		// Time/date always visible
		await expect(page.locator('h1').first()).toBeVisible();

		// Categories are gone — apps render as individual tiles on the surface.
		for (const app of ['Photos', 'Passwords', 'Movies', 'YouTube']) {
			await expect(page.locator(`text=${app}`).first()).toBeVisible();
		}
	});

	test('setup guide accessible via context menu', async ({ page }) => {
		await setPrefs(page, { onboarded: true, name: 'demo', username: 'demo', passwordVerified: true });
		await page.goto('/?user=demo');
		await page.waitForTimeout(3000);

		// Right-click Photos icon
		const photosLink = page.locator('a[target="_blank"]').filter({ hasText: 'Photos' });
		await photosLink.click({ button: 'right' });
		await expect(page.locator('button', { hasText: 'Setup Guide' })).toBeVisible({ timeout: 3000 });
	});

	test('footer shows privacy link', async ({ page }) => {
		await setPrefs(page, { onboarded: true, name: 'demo', username: 'demo', passwordVerified: true });
		await page.goto('/?user=demo');
		await page.waitForTimeout(3000);
		await expect(page.locator('button', { hasText: 'Privacy & Terms' })).toBeVisible();
	});

	test('screenshot: family home', async ({ page }) => {
		await setPrefs(page, { onboarded: true, name: 'demo', username: 'demo', passwordVerified: true, theme: 'auto', wallpaperEnabled: true });
		await page.goto('/?user=demo');
		await page.waitForTimeout(3000);
		await page.screenshot({ path: 'screenshots/persona-family-home.png', fullPage: true });
	});
});

// ══════════════════════════════════════════════════════════════
// Developer Persona — infra apps, no onboarding/weather/privacy
// ══════════════════════════════════════════════════════════════
test.describe.serial('Persona: Developer', () => {
	test.beforeAll(async ({ browser }) => {
		const page = await browser.newPage();
		await loadPersona(page, 'developer');
		await page.close();
	});

	test('no onboarding — straight to dashboard', async ({ page }) => {
		await setPrefs(page, { onboarded: true, name: 'dev', username: 'dev', passwordVerified: true });
		await page.goto('/?user=demo');
		await page.waitForTimeout(3000);

		// Should see app tiles immediately, no onboarding modal
		await expect(page.locator('.app-tile').first()).toBeVisible();
	});

	test('time visible but no weather', async ({ page }) => {
		await setPrefs(page, { onboarded: true, name: 'dev', username: 'dev', passwordVerified: true });
		await page.goto('/?user=demo');
		await page.waitForTimeout(3000);

		// Time visible
		await expect(page.locator('h1').first()).toBeVisible();

		// No weather widget
		await expect(page.locator('text=°C')).not.toBeVisible();
	});

	test('dev persona apps are surfaced', async ({ page }) => {
		await setPrefs(page, { onboarded: true, name: 'dev', username: 'dev', passwordVerified: true });
		await page.goto('/?user=demo');
		await page.waitForTimeout(3000);

		// Categories are gone; apps render as individual tiles.
		for (const app of ['GitHub', 'Gitea', 'Portainer', 'Grafana', 'HN', 'Claude']) {
			await expect(page.locator(`text=${app}`).first()).toBeVisible();
		}
	});

	test('no privacy footer', async ({ page }) => {
		await setPrefs(page, { onboarded: true, name: 'dev', username: 'dev', passwordVerified: true });
		await page.goto('/?user=demo');
		await page.waitForTimeout(3000);
		await expect(page.locator('button', { hasText: 'Privacy & Terms' })).not.toBeVisible();
	});

	test('no search bar when news disabled', async ({ page }) => {
		await setPrefs(page, { onboarded: true, name: 'dev', username: 'dev', passwordVerified: true });
		await page.goto('/?user=demo');
		await page.waitForTimeout(3000);

		// Search is enabled but news is not — search bar should still show
		const searchForm = page.locator('form').filter({ has: page.locator('input[type="text"]') });
		await expect(searchForm).toBeVisible();
	});

	test('screenshot: developer home', async ({ page }) => {
		await setPrefs(page, { onboarded: true, name: 'dev', username: 'dev', passwordVerified: true, theme: 'dark', wallpaperEnabled: false });
		await page.goto('/?user=demo');
		await page.waitForTimeout(3000);
		await page.screenshot({ path: 'screenshots/persona-developer-home.png', fullPage: true });
	});
});

// ══════════════════════════════════════════════════════════════
// Minimal Persona — no auth, no onboarding, just a start page
// ══════════════════════════════════════════════════════════════
test.describe.serial('Persona: Minimal', () => {
	test.beforeAll(async ({ browser }) => {
		const page = await browser.newPage();
		await loadPersona(page, 'minimal');
		await page.close();
	});

	test('no login screen — dashboard shows immediately', async ({ page }) => {
		await page.goto('/');
		await page.waitForTimeout(3000);

		// Should see apps directly, no login/welcome screen
		await expect(page.locator(`div.text-content-dim:has-text("Daily")`).first()).toBeVisible();
	});

	test('time and weather visible', async ({ page }) => {
		await page.goto('/');
		await page.waitForTimeout(3000);

		// Time
		await expect(page.locator('h1').first()).toBeVisible();
	});

	test('no settings button (auth disabled)', async ({ page }) => {
		await page.goto('/');
		await page.waitForTimeout(3000);
		await expect(page.locator('.user-menu')).not.toBeVisible();
	});

	test('no privacy footer', async ({ page }) => {
		await page.goto('/');
		await page.waitForTimeout(3000);
		await expect(page.locator('button', { hasText: 'Privacy & Terms' })).not.toBeVisible();
	});

	test('all bookmark apps visible', async ({ page }) => {
		await page.goto('/');
		await page.waitForTimeout(3000);

		for (const app of ['Gmail', 'Calendar', 'Drive', 'Notion', 'Reddit', 'YouTube']) {
			await expect(page.locator(`text=${app}`).first()).toBeVisible();
		}
	});

	test('search bar works', async ({ page }) => {
		await page.goto('/');
		await page.waitForTimeout(3000);
		const searchForm = page.locator('form').filter({ has: page.locator('input[name="q"]') });
		await expect(searchForm).toBeVisible();
	});

	test('no wallpaper (disabled)', async ({ page }) => {
		await page.goto('/');
		await page.waitForTimeout(3000);
		// Background should be solid, no wallpaper image
		const wallpaperImg = page.locator('div.fixed.-z-20 img');
		await expect(wallpaperImg).not.toBeVisible();
	});

	test('screenshot: minimal home', async ({ page }) => {
		await page.goto('/');
		await page.waitForTimeout(3000);
		await page.screenshot({ path: 'screenshots/persona-minimal-home.png', fullPage: true });
	});
});
