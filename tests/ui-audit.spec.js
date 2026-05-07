import { test } from '@playwright/test';

const VIEWPORTS = [
	{ name: 'desktop', width: 1440, height: 900 },
	{ name: 'tablet', width: 768, height: 1024 },
	{ name: 'mobile', width: 390, height: 844 },
];

const THEMES = ['dark', 'light'];
const ICON_STYLES = ['colored', 'white', 'grayed'];

async function setPrefs(page, prefs) {
	const merged = { onboarded: true, name: 'demo', username: 'demo', passwordVerified: true, ...prefs };
	await page.goto('/');
	await page.evaluate((p) => localStorage.setItem('landing_prefs', JSON.stringify(p)), merged);
}

async function goToDashboard(page, prefs = {}) {
	await setPrefs(page, prefs);
	await page.goto('/?user=demo');
	// Wait for app grid to render
	await page.waitForSelector('.app-tile', { timeout: 10000 }).catch(() => {});
	// Wait for hydration
	await page.waitForFunction(() => document.querySelector('style[data-sveltekit]') === null, { timeout: 10000 }).catch(() => {});
	// Let animations settle
	await page.waitForTimeout(800);
}

async function dismissInstallPrompt(page) {
	const dismiss = page.locator('.fixed.bottom-0 button').last();
	if (await dismiss.isVisible({ timeout: 500 }).catch(() => false)) {
		await dismiss.click();
		await page.waitForTimeout(200);
	}
}

async function openConfigure(page) {
	await dismissInstallPrompt(page);
	// Click the user menu button
	const menuBtn = page.locator('.user-menu button').first();
	await menuBtn.click({ force: true });
	await page.waitForTimeout(300);
	// Click Configure — use visible one to avoid desktop/mobile duplicate
	const configBtn = page.locator('button:visible', { hasText: 'Configure' }).first();
	await configBtn.click({ force: true });
	await page.waitForSelector('h3:has-text("Configure")', { timeout: 5000 });
	await page.waitForTimeout(400);
}

async function openSettingsMenu(page) {
	await dismissInstallPrompt(page);
	const menuBtn = page.locator('.user-menu button').first();
	await menuBtn.click({ force: true });
	await page.waitForTimeout(400);
}

function shot(viewport, theme, iconStyle, screen) {
	return `screenshots/audit/${viewport}-${theme}-${iconStyle}-${screen}.png`;
}

// ── Home Dashboard screenshots ─────────────────────────────
for (const vp of VIEWPORTS) {
	for (const theme of THEMES) {
		for (const iconStyle of ICON_STYLES) {
			test(`home: ${vp.name} / ${theme} / ${iconStyle}`, async ({ page }) => {
				await page.setViewportSize({ width: vp.width, height: vp.height });
				await goToDashboard(page, { theme, iconStyle, wallpaperEnabled: false });
				await dismissInstallPrompt(page);
				await page.screenshot({ path: shot(vp.name, theme, iconStyle, 'home'), fullPage: true });
			});
		}
	}
}

// ── Configure Modal screenshots (desktop + mobile, dark + light, colored only) ─────
for (const vp of [VIEWPORTS[0], VIEWPORTS[2]]) {
	for (const theme of THEMES) {
		test(`configure-appearance: ${vp.name} / ${theme}`, async ({ page }) => {
			await page.setViewportSize({ width: vp.width, height: vp.height });
			await goToDashboard(page, { theme, iconStyle: 'colored', wallpaperEnabled: false });
			await openConfigure(page);
			await page.screenshot({ path: shot(vp.name, theme, 'colored', 'configure-appearance') });
		});

		test(`configure-apps: ${vp.name} / ${theme}`, async ({ page }) => {
			await page.setViewportSize({ width: vp.width, height: vp.height });
			await goToDashboard(page, { theme, iconStyle: 'colored', wallpaperEnabled: false });
			await openConfigure(page);
			// Switch to Apps tab — click the visible one (sidebar on desktop, tab on mobile)
			const appsTab = page.locator('button:visible:has-text("Apps")').last();
			await appsTab.click({ force: true });
			await page.waitForTimeout(300);
			await page.screenshot({ path: shot(vp.name, theme, 'colored', 'configure-apps') });
		});

		test(`configure-widgets: ${vp.name} / ${theme}`, async ({ page }) => {
			await page.setViewportSize({ width: vp.width, height: vp.height });
			await goToDashboard(page, { theme, iconStyle: 'colored', wallpaperEnabled: false });
			await openConfigure(page);
			// Switch to Widgets tab
			const widgetsTab = page.locator('button:visible:has-text("Widgets")').last();
			await widgetsTab.click({ force: true });
			await page.waitForTimeout(300);
			await page.screenshot({ path: shot(vp.name, theme, 'colored', 'configure-widgets') });
		});
	}
}

// ── Settings Menu screenshots (desktop popup + mobile bottom sheet) ─────
for (const vp of [VIEWPORTS[0], VIEWPORTS[2]]) {
	for (const theme of THEMES) {
		test(`settings-menu: ${vp.name} / ${theme}`, async ({ page }) => {
			await page.setViewportSize({ width: vp.width, height: vp.height });
			await goToDashboard(page, { theme, iconStyle: 'colored', wallpaperEnabled: false });
			await openSettingsMenu(page);
			await page.screenshot({ path: shot(vp.name, theme, 'colored', 'settings-menu') });
		});
	}
}

// ── Setup Guide Modal (desktop dark + light) ─────
for (const theme of THEMES) {
	test(`setup-guide: desktop / ${theme}`, async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await goToDashboard(page, { theme, iconStyle: 'colored', wallpaperEnabled: false });
		await dismissInstallPrompt(page);
		// Right-click first app to open context menu
		const appLink = page.locator('a[target="_blank"]').first();
		await appLink.click({ button: 'right' });
		await page.waitForTimeout(300);
		// Click Setup Guide if available
		const guideBtn = page.locator('button', { hasText: 'Setup Guide' });
		if (await guideBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
			await guideBtn.click();
			await page.waitForTimeout(400);
			await page.screenshot({ path: shot('desktop', theme, 'colored', 'setup-guide') });
		} else {
			// Take context menu screenshot instead
			await page.screenshot({ path: shot('desktop', theme, 'colored', 'context-menu') });
		}
	});
}
