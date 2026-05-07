import { test, expect } from '@playwright/test';

async function setPrefs(page, prefs) {
	await page.goto('/');
	await page.evaluate((p) => localStorage.setItem('hearth_prefs', JSON.stringify(p)), prefs);
}

async function waitForHydration(page) {
	await page.waitForFunction(
		() => document.querySelector('style[data-sveltekit]') === null,
		{ timeout: 10000 }
	);
}

test.describe('Widget surface', () => {
	test.beforeEach(async ({ page }) => {
		await setPrefs(page, { onboarded: true, name: 'demo', username: 'demo', passwordVerified: true });
		await page.goto('/?user=demo');
		await waitForHydration(page);
		await page.waitForSelector('.grid-stack', { timeout: 10000 });
		await page.waitForTimeout(800);
	});

	test('grid-stack container renders', async ({ page }) => {
		await expect(page.locator('.grid-stack')).toBeVisible();
	});

	test('default-visible apps render as individual tiles on a fresh user', async ({ page }) => {
		// At least one app tile renders. Specific names depend on the loaded
		// config.yml, so we assert the structure rather than a label.
		const tiles = page.locator('.grid-stack-item .app-tile');
		const count = await tiles.count();
		expect(count).toBeGreaterThan(0);
	});

	test('each grid-stack-item is one app tile', async ({ page }) => {
		const items = page.locator('.grid-stack-item');
		const count = await items.count();
		for (let i = 0; i < count; i++) {
			await expect(items.nth(i).locator('.app-tile')).toBeVisible();
		}
	});

	test('widgetLayout is persisted in prefs', async ({ page }) => {
		const layout = await page.evaluate(() => {
			const raw = localStorage.getItem('hearth_prefs');
			const p = raw ? JSON.parse(raw) : {};
			return p.widgetLayout;
		});
		expect(Array.isArray(layout)).toBe(true);
		expect(layout.length).toBeGreaterThan(0);
		for (const inst of layout) {
			expect(inst.instanceId).toBeTruthy();
			expect(inst.type).toBe('app');
			expect(typeof inst.w).toBe('number');
			expect(typeof inst.h).toBe('number');
			expect(inst.config?.appId).toBeTruthy();
		}
	});

	test('edit mode swaps in the app tray', async ({ page }) => {
		await page.locator('button', { hasText: /^edit$/i }).click();
		await expect(page.locator('.app-tray')).toBeVisible({ timeout: 4000 });
		await page.locator('button', { hasText: 'Done' }).click();
		await expect(page.locator('.app-tray')).not.toBeVisible();
	});
});

test.describe('Widget surface migration', () => {
	test('legacy categoryLayout / gridLayouts are stripped on first load', async ({ page }) => {
		await page.goto('/');
		await page.evaluate(() => {
			localStorage.setItem(
				'hearth_prefs',
				JSON.stringify({
					onboarded: true,
					name: 'demo',
					username: 'demo',
					passwordVerified: true,
					recentApps: ['photos'],
					categoryLayout: [{ id: 'storage', label: 'Storage', appIds: ['photos'] }],
					gridLayouts: { 12: [{ id: 'storage', x: 0, y: 0, w: 6, h: 2 }] },
					dashboardView: 'grouped'
				})
			);
		});
		await page.goto('/?user=demo');
		await waitForHydration(page);
		await page.waitForSelector('.grid-stack', { timeout: 10000 });
		// Wait for migration to flush through the debounced prefs.update.
		await page.waitForTimeout(1500);

		const after = await page.evaluate(() => {
			const raw = localStorage.getItem('hearth_prefs');
			return raw ? JSON.parse(raw) : {};
		});
		expect(Array.isArray(after.widgetLayout)).toBe(true);
		expect(after.categoryLayout).toBeUndefined();
		expect(after.gridLayouts).toBeUndefined();
		expect(after.dashboardView).toBeUndefined();
	});
});
