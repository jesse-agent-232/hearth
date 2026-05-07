import { test, expect } from '@playwright/test';

// Helper: set localStorage prefs before navigation
async function setPrefs(page, prefs) {
	await page.goto('/');
	await page.evaluate((p) => localStorage.setItem('landing_prefs', JSON.stringify(p)), prefs);
}

// Helper: open Configure modal from dashboard
async function openConfigure(page) {
	await page.locator('.user-menu button').first().click();
	await page.locator('button', { hasText: 'Configure' }).click();
	await page.waitForSelector('h3:has-text("Configure")');
}

// Helper: wait for SvelteKit client hydration — the style[data-sveltekit] tag
// is removed once the client-side JS takes over from SSR
async function waitForHydration(page) {
	await page.waitForFunction(
		() => document.querySelector('style[data-sveltekit]') === null,
		{ timeout: 10000 }
	);
}

// ── Welcome Screen ──────────────────────────────────────────────

test.describe('Welcome screen', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.evaluate(() => localStorage.clear());
		await page.goto('/');
		await page.waitForSelector('text=Welcome');
		await waitForHydration(page);
	});

	test('renders brand name', async ({ page }) => {
		await expect(page.locator('text=My Homelab')).toBeVisible();
	});

	test('shows login button', async ({ page }) => {
		const loginBtn = page.locator('button', { hasText: /Login/i });
		await expect(loginBtn).toBeVisible();
	});

	test('login button is disabled until privacy terms accepted', async ({ page }) => {
		const loginBtn = page.locator('button', { hasText: /Login/i });
		await expect(loginBtn).toBeDisabled();

		await page.locator('input[type="checkbox"]').check();
		await expect(loginBtn).toBeEnabled();
	});

	test('privacy terms toggle expands content', async ({ page }) => {
		await page.locator('button[type="button"]', { hasText: 'Privacy & Terms' }).click();
		await expect(page.locator('.onboarding-privacy-md')).toBeVisible({ timeout: 5000 });
	});
});

// ── Registration Link ───────────────────────────────────────────

test.describe('Registration link', () => {
	test('shows registration link when enabled', async ({ page }) => {
		await page.goto('/');
		await page.evaluate(() => localStorage.clear());
		await page.goto('/');
		await page.waitForSelector('text=Welcome');

		const regLink = page.locator('a', { hasText: 'Register' });
		await expect(regLink).toBeVisible();
		const href = await regLink.getAttribute('href');
		expect(href).toBeTruthy();
	});
});

// ── Dashboard (logged in via ?user=demo) ────────────────────────

test.describe('Dashboard', () => {
	test.beforeEach(async ({ page }) => {
		await setPrefs(page, { onboarded: true, name: 'demo', username: 'demo', passwordVerified: true });
		await page.goto('/?user=demo');
		await page.waitForSelector('.app-tile', { timeout: 10000 });
	});

	test('widget surface renders app tiles', async ({ page }) => {
		const tiles = page.locator('.grid-stack-item .app-tile');
		const count = await tiles.count();
		expect(count).toBeGreaterThan(0);
	});

	test('search bar is visible', async ({ page }) => {
		const searchForm = page.locator('form').filter({ has: page.locator('input[name="q"]') });
		await expect(searchForm).toBeVisible();
	});

	test('app icons are rendered as links', async ({ page }) => {
		const appLink = page.locator('a[target="_blank"] img').first();
		await expect(appLink).toBeVisible();
	});
});

// ── Configure Modal ─────────────────────────────────────────────

test.describe('Configure modal', () => {
	test.beforeEach(async ({ page }) => {
		await setPrefs(page, { onboarded: true, name: 'demo', username: 'demo', passwordVerified: true });
		await page.goto('/?user=demo');
		await page.waitForSelector('.app-tile', { timeout: 10000 });
		await openConfigure(page);
	});

	test('shows Configure header', async ({ page }) => {
		await expect(page.locator('h3', { hasText: 'Configure' })).toBeVisible();
	});

	test('shows icon style pills', async ({ page }) => {
		for (const label of ['Colored', 'White', 'Grayed']) {
			await expect(page.locator('button', { hasText: label })).toBeVisible();
		}
	});

	test.skip('shows app toggle switches', async ({ page }) => {
		// TODO: per-app visibility now lives inside the dashboard's edit-mode tray
		// (drag a tile off → goes to tray, click in tray → re-place). Rewrite
		// this assertion against the new UX in a follow-up.
	});
});

// ── Icon Style Switching ────────────────────────────────────────

test.describe('Icon style', () => {
	test('switching styles changes icon src attributes', async ({ page }) => {
		await setPrefs(page, { onboarded: true, name: 'demo', username: 'demo', passwordVerified: true });
		await page.goto('/?user=demo');
		await page.waitForSelector('.app-tile', { timeout: 10000 });

		// Default icon style is 'white' — mono icons use simpleicons CDN
		const firstIcon = page.locator('a[target="_blank"] img').first();
		const defaultSrc = await firstIcon.getAttribute('src');
		expect(defaultSrc).toContain('simpleicons');

		// Switch to Colored via Configure
		await openConfigure(page);
		await page.locator('button', { hasText: 'Colored' }).click();
		// Close modal via the X button inside the modal
		const modal = page.locator('div.fixed.inset-0.bg-surface-overlay');
		await modal.locator('button:has-text("×")').click();
		await modal.waitFor({ state: 'hidden', timeout: 5000 });

		const coloredSrc = await firstIcon.getAttribute('src');
		expect(coloredSrc).toContain('selfhst/icons');

		// Switch to Grayed
		await openConfigure(page);
		await page.locator('button', { hasText: 'Grayed' }).click();
		const modal2 = page.locator('div.fixed.inset-0.bg-surface-overlay');
		await modal2.locator('button:has-text("×")').click();
		await modal2.waitFor({ state: 'hidden', timeout: 5000 });

		const grayedSrc = await firstIcon.getAttribute('src');
		expect(grayedSrc).toContain('simpleicons');
	});
});

// ── Custom Bookmarks ────────────────────────────────────────────

test.describe('Custom bookmarks', () => {
	test.beforeEach(async ({ page }) => {
		await setPrefs(page, { onboarded: true, name: 'demo', username: 'demo', passwordVerified: true });
		await page.goto('/?user=demo');
		await page.waitForSelector('.app-tile', { timeout: 10000 });
		await openConfigure(page);
		// Bookmarks lives in its own tab now.
		await page.locator('button:visible', { hasText: 'Bookmarks' }).first().click();
		await page.waitForTimeout(200);
	});

	test('add bookmark form appears and works', async ({ page }) => {
		await page.locator('button >> text=Add bookmark').click();

		await page.locator('input[placeholder="Name"]').fill('Test Bookmark');
		await page.getByPlaceholder('URL (e.g. github.com)').fill('https://example.com');

		await page.locator('button').filter({ hasText: /^Add$/ }).click();

		await expect(page.locator('span.truncate', { hasText: 'Test Bookmark' })).toBeVisible();
	});

	test('can delete a bookmark', async ({ page }) => {
		await page.locator('button >> text=Add bookmark').click();
		await page.locator('input[placeholder="Name"]').fill('Delete Me');
		await page.getByPlaceholder('URL (e.g. github.com)').fill('https://example.com');
		await page.locator('button').filter({ hasText: /^Add$/ }).click();

		await expect(page.locator('span.truncate', { hasText: 'Delete Me' })).toBeVisible();

		const row = page.locator('div.flex.items-center').filter({ hasText: 'Delete Me' });
		await row.locator('button[title="Remove"]').click();

		await expect(page.locator('span.truncate', { hasText: 'Delete Me' })).not.toBeVisible();
	});
});

// ── Onboarding ──────────────────────────────────────────────────

test.describe('Onboarding', () => {
	test.beforeEach(async ({ page }) => {
		// Set passwordVerified so the password gate doesn't block onboarding
		await setPrefs(page, { passwordVerified: true });
		await page.goto('/?user=demo');
		await page.waitForSelector('h2:has-text("Welcome, demo")', { timeout: 10000 });
		await waitForHydration(page);
	});

	test('first slide renders with welcome message', async ({ page }) => {
		await expect(page.locator('h2', { hasText: 'Welcome, demo' })).toBeVisible();
		await expect(page.locator('.fixed.inset-0 span', { hasText: 'My Homelab' }).first()).toBeVisible();
	});

	test('next button advances slides', async ({ page }) => {
		await page.locator('button', { hasText: 'Next' }).click();
		await expect(page.locator('h2', { hasText: 'Your Services' })).toBeVisible({ timeout: 5000 });
	});

	test('back button goes to previous slide', async ({ page }) => {
		await page.locator('button', { hasText: 'Next' }).click();
		await expect(page.locator('h2', { hasText: 'Your Services' })).toBeVisible({ timeout: 5000 });

		await page.locator('button', { hasText: 'Back' }).click();
		await expect(page.locator('h2', { hasText: 'Welcome, demo' })).toBeVisible({ timeout: 5000 });
	});

	test('dot indicators navigate between slides', async ({ page }) => {
		const dots = page.locator('.flex.gap-1\\.5 button');
		await expect(dots).toHaveCount(5);

		await dots.nth(2).click();
		await expect(page.locator('h2', { hasText: 'Private by Design' })).toBeVisible({ timeout: 10000 });
	});

	test('can navigate through all slides', async ({ page }) => {
		await expect(page.locator('h2', { hasText: 'Welcome, demo' })).toBeVisible();

		await page.locator('button', { hasText: 'Next' }).click();
		await expect(page.locator('h2', { hasText: 'Your Services' })).toBeVisible({ timeout: 5000 });

		await page.locator('button', { hasText: 'Next' }).click();
		await expect(page.locator('h2', { hasText: 'Private by Design' })).toBeVisible({ timeout: 5000 });

		await page.locator('button', { hasText: 'Next' }).click();
		await expect(page.locator('h2', { hasText: 'Stay Safe Online' })).toBeVisible({ timeout: 5000 });

		await page.locator('button', { hasText: 'Next' }).click();
		await expect(page.locator('h2', { hasText: 'Local Weather' })).toBeVisible({ timeout: 5000 });

		await expect(page.locator('button', { hasText: 'Next' })).toBeDisabled();
	});
});
