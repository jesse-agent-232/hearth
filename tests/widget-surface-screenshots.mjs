// One-off screenshot capture for the widget-surface rewrite.
// Run with: node tests/widget-surface-screenshots.mjs
// Assumes vite dev is up on http://localhost:5173.

import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const OUT = 'screenshots';
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = {
	desktop: { width: 1440, height: 900 },
	mobile: { width: 390, height: 844 }
};

const PREFS = {
	onboarded: true,
	name: 'Demo',
	username: 'demo',
	passwordVerified: true,
	theme: 'auto',
	iconStyle: 'colored',
	wallpaperEnabled: false,
	openInNewTab: true,
	enabledWidgets: ['weather', 'news', 'search']
};

async function setPrefs(page, overrides = {}) {
	const prefs = { ...PREFS, ...overrides };
	await page.addInitScript((p) => localStorage.setItem('holm_prefs', JSON.stringify(p)), prefs);
}

async function waitForReady(page) {
	await page.waitForSelector('.grid-stack', { timeout: 15000 });
	await page.waitForFunction(
		() => {
			const tiles = document.querySelectorAll('.app-tile');
			return tiles.length > 0;
		},
		{ timeout: 15000 }
	).catch(() => {});
	// Let GridStack init + first paint
	await page.waitForTimeout(1200);
	// Dismiss any install prompt
	const dismiss = page.locator('.fixed.bottom-0 button').last();
	if (await dismiss.isVisible({ timeout: 400 }).catch(() => false)) {
		await dismiss.click();
		await page.waitForTimeout(200);
	}
}

async function shot(page, name) {
	const path = `${OUT}/${name}.png`;
	await page.screenshot({ path, fullPage: false });
	console.log(`  ✓ ${name}.png`);
}

async function shotFull(page, name) {
	const path = `${OUT}/${name}.png`;
	await page.screenshot({ path, fullPage: true });
	console.log(`  ✓ ${name}.png (fullPage)`);
}

async function run() {
	const browser = await chromium.launch({ args: ['--no-sandbox'] });

	for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
		console.log(`\n━━ ${vpName.toUpperCase()} ━━━━━━━━━━━━━━━`);

		// 1. Default surface (fresh user, fresh prefs — page synthesizes default layout)
		{
			const ctx = await browser.newContext({ viewport: vp });
			const page = await ctx.newPage();
			await setPrefs(page);
			await page.goto(BASE + '/?user=demo', { waitUntil: 'networkidle' });
			await waitForReady(page);
			await shotFull(page, `${vpName}-01-default-surface`);
			await ctx.close();
		}

		// 2. Edit mode (tray + dotted outlines visible)
		{
			const ctx = await browser.newContext({ viewport: vp });
			const page = await ctx.newPage();
			await setPrefs(page);
			await page.goto(BASE + '/?user=demo', { waitUntil: 'networkidle' });
			await waitForReady(page);
			const editBtn = page.locator('button', { hasText: /^edit$/i }).first();
			if (await editBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
				await editBtn.click();
				await page.waitForTimeout(700);
				await shotFull(page, `${vpName}-02-edit-mode`);
				// Close-up of grid only — the overlap-outline issue lives in the grid area
				const grid = page.locator('.grid-stack');
				if (await grid.isVisible().catch(() => false)) {
					await grid.screenshot({ path: `${OUT}/${vpName}-03-edit-grid-closeup.png` });
					console.log(`  ✓ ${vpName}-03-edit-grid-closeup.png`);
				}
			}
			await ctx.close();
		}

		// 3. Edit mode with one tile removed → should put it in tray
		{
			const ctx = await browser.newContext({ viewport: vp });
			const page = await ctx.newPage();
			await setPrefs(page);
			await page.goto(BASE + '/?user=demo', { waitUntil: 'networkidle' });
			await waitForReady(page);
			const editBtn = page.locator('button', { hasText: /^edit$/i }).first();
			if (await editBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
				await editBtn.click();
				await page.waitForTimeout(500);
				const removeBtn = page.locator('.app-tile-remove').first();
				if (await removeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
					await removeBtn.click();
					await page.waitForTimeout(700);
					await shotFull(page, `${vpName}-04-edit-after-remove`);
				}
			}
			await ctx.close();
		}

		// 4. Configure modal — Appearance tab (default)
		{
			const ctx = await browser.newContext({ viewport: vp });
			const page = await ctx.newPage();
			await setPrefs(page);
			await page.goto(BASE + '/?user=demo', { waitUntil: 'networkidle' });
			await waitForReady(page);
			const settingsBtn = page.locator('.user-menu > button').first();
			if (await settingsBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
				await settingsBtn.click();
				await page.waitForTimeout(300);
				const configBtn = page.locator('button:visible', { hasText: 'Configure' }).first();
				if (await configBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
					await configBtn.click();
					await page.waitForTimeout(700);
					await shot(page, `${vpName}-05-configure-appearance`);

					// Bookmarks tab
					const bookmarksTab = page.locator('button:visible', { hasText: 'Bookmarks' }).first();
					if (await bookmarksTab.isVisible({ timeout: 1500 }).catch(() => false)) {
						await bookmarksTab.click();
						await page.waitForTimeout(400);
						await shot(page, `${vpName}-06-configure-bookmarks`);
					}

					// Widgets tab
					const widgetsTab = page.locator('button:visible', { hasText: 'Widgets' }).first();
					if (await widgetsTab.isVisible({ timeout: 1500 }).catch(() => false)) {
						await widgetsTab.click();
						await page.waitForTimeout(400);
						await shot(page, `${vpName}-07-configure-widgets`);
					}
				}
			}
			await ctx.close();
		}
	}

	await browser.close();
	console.log('\nDone.');
}

run().catch((e) => {
	console.error(e);
	process.exit(1);
});
