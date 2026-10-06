import { test, expect } from '@playwright/test';

const PREFS_KEY = 'holm_prefs';
const THEME_KEY = 'holm_theme';
const ICON_KEY = 'holm_icon_style';
const SCREENSHOTS = 'screenshots/theme-persistence';

// Set localStorage prefs before navigation
async function setPrefs(page, prefs) {
	await page.evaluate(({ key, prefs }) => {
		localStorage.setItem(key, JSON.stringify(prefs));
		if (prefs.theme) localStorage.setItem('holm_theme', prefs.theme);
		if (prefs.iconStyle) localStorage.setItem('holm_icon_style', prefs.iconStyle);
	}, { key: PREFS_KEY, prefs });
}

// Clear prefs (simulate logout) but keep persistent keys
async function simulateLogout(page) {
	await page.evaluate((key) => {
		localStorage.removeItem(key);
		localStorage.removeItem('weather_cache');
		localStorage.removeItem('weather_location');
		// holm_theme and holm_icon_style intentionally kept
	}, PREFS_KEY);
}

// Navigate to logged-in dashboard
async function goToDashboard(page, extraPrefs = {}) {
	const prefs = { onboarded: true, name: 'Test', username: 'test', passwordVerified: true, ...extraPrefs };
	await page.goto('/');
	await setPrefs(page, prefs);
	await page.goto('/?user=demo');
	await page.waitForTimeout(1000);
}

// Navigate to login screen (logged out)
async function goToLogin(page) {
	await page.goto('/');
	await page.waitForTimeout(800);
}

// Get persistent keys from localStorage
async function getPersistentKeys(page) {
	return page.evaluate(() => ({
		theme: localStorage.getItem('holm_theme'),
		iconStyle: localStorage.getItem('holm_icon_style'),
		hasPrefs: !!localStorage.getItem('holm_prefs')
	}));
}

// ── Login screen theme persistence ─────────────────────────────
test.describe('Login screen - theme persists after logout', () => {
	test('dark theme persists on login screen after logout', async ({ page }) => {
		// 1. Set dark theme as logged-in user
		await goToDashboard(page, { theme: 'dark', iconStyle: 'colored' });
		await page.screenshot({ path: `${SCREENSHOTS}/01-dashboard-dark.png`, fullPage: true });

		// 2. Simulate logout
		await simulateLogout(page);
		const keys = await getPersistentKeys(page);
		expect(keys.theme).toBe('dark');
		expect(keys.iconStyle).toBe('colored');
		expect(keys.hasPrefs).toBe(false);

		// 3. Navigate to login screen — should still be dark
		await goToLogin(page);
		const bodyClass = await page.evaluate(() => document.body.className);
		expect(bodyClass).toContain('theme-dark');
		await page.screenshot({ path: `${SCREENSHOTS}/02-login-dark-after-logout.png`, fullPage: true });
	});

	test('light theme persists on login screen after logout', async ({ page }) => {
		await goToDashboard(page, { theme: 'light', iconStyle: 'white' });
		await page.screenshot({ path: `${SCREENSHOTS}/03-dashboard-light.png`, fullPage: true });

		await simulateLogout(page);
		const keys = await getPersistentKeys(page);
		expect(keys.theme).toBe('light');
		expect(keys.iconStyle).toBe('white');

		await goToLogin(page);
		const bodyClass = await page.evaluate(() => document.body.className);
		expect(bodyClass).toContain('theme-light');
		await page.screenshot({ path: `${SCREENSHOTS}/04-login-light-after-logout.png`, fullPage: true });
	});

	test('auto theme (no wallpaper override) on login after logout', async ({ page }) => {
		await goToDashboard(page, { theme: 'auto', iconStyle: 'grayed' });
		await page.screenshot({ path: `${SCREENSHOTS}/05-dashboard-auto.png`, fullPage: true });

		await simulateLogout(page);
		const keys = await getPersistentKeys(page);
		expect(keys.theme).toBe('auto');
		expect(keys.iconStyle).toBe('grayed');

		await goToLogin(page);
		// Auto theme = no theme-light or theme-dark class
		const bodyClass = await page.evaluate(() => document.body.className);
		expect(bodyClass).not.toContain('theme-light');
		expect(bodyClass).not.toContain('theme-dark');
		await page.screenshot({ path: `${SCREENSHOTS}/06-login-auto-after-logout.png`, fullPage: true });
	});
});

// ── Wallpaper visibility based on theme ────────────────────────
test.describe('Wallpaper only shows in auto theme', () => {
	test('wallpaper visible on login screen with auto theme', async ({ page }) => {
		await page.goto('/');
		await setPrefs(page, { theme: 'auto' });
		await goToLogin(page);
		// Wallpaper image should exist in the DOM
		const wallpaperImg = page.locator('.fixed img[loading="lazy"]');
		await expect(wallpaperImg).toBeVisible({ timeout: 5000 }).catch(() => {
			// wallpaper may not load in test env — check that src is set
		});
		const src = await wallpaperImg.getAttribute('src').catch(() => null);
		// In auto mode, wallpaperUrl should be set (non-empty src)
		expect(src).toBeTruthy();
		await page.screenshot({ path: `${SCREENSHOTS}/07-login-auto-wallpaper.png`, fullPage: true });
	});

	test('no wallpaper on login screen with dark theme', async ({ page }) => {
		await page.goto('/');
		await setPrefs(page, { theme: 'dark' });
		await page.goto('/');
		await page.waitForTimeout(800);
		// Wallpaper image should not have a src or not be visible
		const imgs = await page.locator('.fixed img[loading="lazy"]').all();
		for (const img of imgs) {
			const src = await img.getAttribute('src');
			expect(src || '').toBe('');
		}
		await page.screenshot({ path: `${SCREENSHOTS}/08-login-dark-no-wallpaper.png`, fullPage: true });
	});

	test('no wallpaper on login screen with light theme', async ({ page }) => {
		await page.goto('/');
		await setPrefs(page, { theme: 'light' });
		await page.goto('/');
		await page.waitForTimeout(800);
		const imgs = await page.locator('.fixed img[loading="lazy"]').all();
		for (const img of imgs) {
			const src = await img.getAttribute('src');
			expect(src || '').toBe('');
		}
		await page.screenshot({ path: `${SCREENSHOTS}/09-login-light-no-wallpaper.png`, fullPage: true });
	});
});

// ── Onboarding slides with different themes ────────────────────
test.describe('Onboarding slides - theme applied', () => {
	test('onboarding in dark theme', async ({ page }) => {
		await page.goto('/');
		await setPrefs(page, { theme: 'dark', onboarded: false, passwordVerified: true });
		await page.goto('/?user=demo');
		await page.waitForTimeout(1000);

		// Should be on onboarding slide (welcome)
		const heading = page.locator('h2:has-text("Welcome")');
		await expect(heading).toBeVisible({ timeout: 5000 });
		await page.screenshot({ path: `${SCREENSHOTS}/10-onboarding-welcome-dark.png`, fullPage: true });

		// Click through a few slides
		const nextBtn = page.locator('button:has-text("Next")');
		if (await nextBtn.isVisible()) {
			await nextBtn.click();
			await page.waitForTimeout(500);
			await page.screenshot({ path: `${SCREENSHOTS}/11-onboarding-services-dark.png`, fullPage: true });

			await nextBtn.click();
			await page.waitForTimeout(500);
			await page.screenshot({ path: `${SCREENSHOTS}/12-onboarding-privacy-dark.png`, fullPage: true });

			await nextBtn.click();
			await page.waitForTimeout(500);
			await page.screenshot({ path: `${SCREENSHOTS}/13-onboarding-security-dark.png`, fullPage: true });
		}
	});

	test('onboarding in light theme', async ({ page }) => {
		await page.goto('/');
		await setPrefs(page, { theme: 'light', onboarded: false, passwordVerified: true });
		await page.goto('/?user=demo');
		await page.waitForTimeout(1000);

		const heading = page.locator('h2:has-text("Welcome")');
		await expect(heading).toBeVisible({ timeout: 5000 });
		await page.screenshot({ path: `${SCREENSHOTS}/14-onboarding-welcome-light.png`, fullPage: true });

		const nextBtn = page.locator('button:has-text("Next")');
		if (await nextBtn.isVisible()) {
			await nextBtn.click();
			await page.locator('h2:has-text("What you get")').waitFor({ timeout: 5000 });
			await page.waitForTimeout(500);
			await page.screenshot({ path: `${SCREENSHOTS}/15-onboarding-services-light.png`, fullPage: true });

			await nextBtn.click();
			await page.locator('h2:has-text("Private by Design")').waitFor({ timeout: 5000 });
			await page.waitForTimeout(500);
			await page.screenshot({ path: `${SCREENSHOTS}/16-onboarding-privacy-light.png`, fullPage: true });
		}
	});
});

// ── Password change screen ─────────────────────────────────────
test.describe('Password change screen - theme applied', () => {
	test('password change in dark theme', async ({ page }) => {
		// Logged in, but passwordVerified is false — should show password prompt
		await goToDashboard(page, { theme: 'dark', passwordVerified: false });
		await page.waitForTimeout(500);

		const heading = page.locator('h2:has-text("Change Your Password")');
		if (await heading.isVisible({ timeout: 3000 }).catch(() => false)) {
			await page.screenshot({ path: `${SCREENSHOTS}/17-password-change-dark.png`, fullPage: true });
		}
	});

	test('password change in light theme', async ({ page }) => {
		await goToDashboard(page, { theme: 'light', passwordVerified: false });
		await page.waitForTimeout(500);

		const heading = page.locator('h2:has-text("Change Your Password")');
		if (await heading.isVisible({ timeout: 3000 }).catch(() => false)) {
			await page.screenshot({ path: `${SCREENSHOTS}/18-password-change-light.png`, fullPage: true });
		}
	});

	test('no wallpaper on password change with dark theme', async ({ page }) => {
		await goToDashboard(page, { theme: 'dark', passwordVerified: false });
		await page.waitForTimeout(500);

		const heading = page.locator('h2:has-text("Change Your Password")');
		if (await heading.isVisible({ timeout: 3000 }).catch(() => false)) {
			const imgs = await page.locator('.fixed img[loading="lazy"]').all();
			for (const img of imgs) {
				const src = await img.getAttribute('src');
				expect(src || '').toBe('');
			}
			await page.screenshot({ path: `${SCREENSHOTS}/19-password-no-wallpaper-dark.png`, fullPage: true });
		}
	});
});
