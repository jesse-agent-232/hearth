import { test } from '@playwright/test';

// Helper: set prefs and navigate to dashboard
async function goToDashboard(page, extraPrefs = {}) {
	const prefs = { onboarded: true, name: 'demo', username: 'demo', passwordVerified: true, ...extraPrefs };
	await page.goto('/');
	await page.evaluate((p) => localStorage.setItem('landing_prefs', JSON.stringify(p)), prefs);
	await page.goto('/?user=demo');
	await page.waitForSelector('.app-tile', { timeout: 10000 });
	// Wait for hydration
	await page.waitForFunction(() => document.querySelector('style[data-sveltekit]') === null, { timeout: 10000 });
}

async function openConfigure(page) {
	await page.locator('.user-menu button').first().click();
	await page.locator('button', { hasText: 'Configure' }).click();
	await page.waitForSelector('h3:has-text("Configure")');
}

// ── Dark theme (default) screenshots ────────────────────────────
test.describe('Dark theme screenshots', () => {
	test('home', async ({ page }) => {
		await goToDashboard(page, { theme: 'dark', wallpaperEnabled: false });
		await page.waitForTimeout(500);
		await page.screenshot({ path: 'screenshots/dark-home.png', fullPage: true });
	});

	test('configure modal', async ({ page }) => {
		await goToDashboard(page, { theme: 'dark', wallpaperEnabled: false });
		await openConfigure(page);
		await page.waitForTimeout(300);
		await page.screenshot({ path: 'screenshots/dark-configure.png' });
	});

	test('setup guide', async ({ page }) => {
		await goToDashboard(page, { theme: 'dark', wallpaperEnabled: false });
		// Long-press an app to open context menu, then click Setup Guide
		const appLink = page.locator('a[target="_blank"]').first();
		const box = await appLink.boundingBox();
		if (box) {
			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
			await page.mouse.down();
			await page.waitForTimeout(600);
			await page.mouse.up();
			// Look for "Setup Guide" in the context menu
			const guideBtn = page.locator('button', { hasText: 'Setup Guide' });
			if (await guideBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
				await guideBtn.click();
				await page.waitForTimeout(300);
				await page.screenshot({ path: 'screenshots/dark-setup-guide.png' });
			}
		}
	});

	test('privacy terms', async ({ page }) => {
		await goToDashboard(page, { theme: 'dark', wallpaperEnabled: false });
		await page.locator('button', { hasText: 'Privacy & Terms' }).click();
		await page.waitForTimeout(300);
		await page.screenshot({ path: 'screenshots/dark-terms.png' });
	});
});

// ── Light theme screenshots ─────────────────────────────────────
test.describe('Light theme screenshots', () => {
	test('home', async ({ page }) => {
		await goToDashboard(page, { theme: 'light', wallpaperEnabled: false });
		await page.waitForTimeout(500);
		await page.screenshot({ path: 'screenshots/light-home.png', fullPage: true });
	});

	test('configure modal', async ({ page }) => {
		await goToDashboard(page, { theme: 'light', wallpaperEnabled: false });
		await openConfigure(page);
		await page.waitForTimeout(300);
		await page.screenshot({ path: 'screenshots/light-configure.png' });
	});

	test('setup guide', async ({ page }) => {
		await goToDashboard(page, { theme: 'light', wallpaperEnabled: false });
		const appLink = page.locator('a[target="_blank"]').first();
		const box = await appLink.boundingBox();
		if (box) {
			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
			await page.mouse.down();
			await page.waitForTimeout(600);
			await page.mouse.up();
			const guideBtn = page.locator('button', { hasText: 'Setup Guide' });
			if (await guideBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
				await guideBtn.click();
				await page.waitForTimeout(300);
				await page.screenshot({ path: 'screenshots/light-setup-guide.png' });
			}
		}
	});

	test('privacy terms', async ({ page }) => {
		await goToDashboard(page, { theme: 'light', wallpaperEnabled: false });
		await page.locator('button', { hasText: 'Privacy & Terms' }).click();
		await page.waitForTimeout(300);
		await page.screenshot({ path: 'screenshots/light-terms.png' });
	});
});
