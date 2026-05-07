// Style audit screenshot harness.
// Usage: node tests/widget-style-audit.mjs [round]
//   round defaults to "1". Output goes to tests/screenshots/style-audit/round-<N>/.
//
// Captures every surface called out in the audit brief at desktop (1280x800)
// and mobile (390x844). Walks the onboarding flow step by step.

import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROUND = process.argv[2] || '1';
const OUT = path.resolve(`tests/screenshots/style-audit/round-${ROUND}`);
const BASE = 'http://localhost:5173';

const VIEWPORTS = [
	{ name: 'desktop', width: 1280, height: 800 },
	{ name: 'mobile', width: 390, height: 844 }
];

await mkdir(OUT, { recursive: true });

async function shot(page, name, viewport) {
	const file = path.join(OUT, `${name}-${viewport}.png`);
	await page.screenshot({ path: file, fullPage: false });
	console.log('  →', file);
}

async function ensureDevSettled(page) {
	// Tiny breathing room for animations to finish + fonts to swap.
	await page.waitForTimeout(450);
}

async function captureLogin(page, viewport) {
	await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
	await ensureDevSettled(page);
	await shot(page, 'login', viewport);

	// Open privacy/terms expansion to capture that variant too.
	const privacyBtn = page.getByRole('button', { name: /Privacy & Terms/i });
	if (await privacyBtn.count()) {
		await privacyBtn.first().click().catch(() => {});
		await ensureDevSettled(page);
		await shot(page, 'login-privacy-expanded', viewport);
	}
}

async function captureOnboarding(page, viewport) {
	await page.goto(`${BASE}/?user=newuser`, { waitUntil: 'domcontentloaded' });
	await ensureDevSettled(page);

	// PasswordChangePrompt sits at z-200 over the onboarding modal because
	// dev-mode loads stamp firstLoginAt. Capture it once, dismiss with the
	// "I've changed my password" affordance, then walk the onboarding flow.
	const dismissPwd = page.getByRole('button', { name: /I've changed my password/i });
	if ((await dismissPwd.count()) > 0) {
		await shot(page, 'password-change-prompt', viewport);
		await dismissPwd.first().click({ timeout: 3000 }).catch(() => {});
		await ensureDevSettled(page);
	}

	// Walk the slides via the Next button until we reach the final step. We
	// detect "onboarding is over" by looking at the dot-indicators count and
	// the active dot index — once Next is missing or active dot == total - 1
	// we capture the last frame and stop.
	const MAX = 8;
	for (let i = 0; i < MAX; i++) {
		await ensureDevSettled(page);

		// Bail out if the onboarding modal is no longer rendered.
		const modalCount = await page.locator('.animate-modal-enter').count();
		if (modalCount === 0) {
			console.log(`  onboarding modal gone at step ${i + 1}, stopping`);
			break;
		}

		await shot(page, `onboarding-step-${i + 1}`, viewport);

		const nextCount = await page.getByRole('button', { name: 'Next', exact: true }).count();
		const allowCount = await page.getByRole('button', { name: /Allow Location/i }).count();

		// Final slide is the weather/permission slide — stop here.
		if (allowCount > 0) break;
		if (nextCount === 0) break;

		// Click Next — race against a short timeout so a stuck/disabled button
		// doesn't burn 30s of Playwright's default action timeout.
		await page.getByRole('button', { name: 'Next', exact: true }).first()
			.click({ timeout: 3000 })
			.catch(() => {});
	}
}

async function captureDashboard(page, viewport) {
	await page.goto(`${BASE}/?user=demo`, { waitUntil: 'domcontentloaded' });
	await ensureDevSettled(page);
	await page.waitForTimeout(800); // grid + fonts

	// Demo user trips the PasswordChangePrompt gate too. The onboarding flow
	// already captured it; here we just dismiss to reach the dashboard.
	const dismiss = page.getByRole('button', { name: /I've changed my password/i });
	if ((await dismiss.count()) > 0) {
		await dismiss.first().click({ timeout: 3000 }).catch(() => {});
		await ensureDevSettled(page);
		await page.waitForTimeout(400);
	}

	await shot(page, 'dashboard-rest', viewport);

	// Focus the search bar (palette open, no query).
	const searchInput = page.locator('.hero-search-form input').first();
	await searchInput.click().catch(() => {});
	await ensureDevSettled(page);
	await shot(page, 'dashboard-search-focused', viewport);

	// Type a query to surface results.
	await searchInput.fill('s');
	await ensureDevSettled(page);
	await shot(page, 'dashboard-search-results', viewport);

	// Clear & blur.
	await searchInput.fill('');
	await page.keyboard.press('Escape').catch(() => {});
	await page.locator('body').click({ position: { x: 10, y: 10 } }).catch(() => {});
	await ensureDevSettled(page);

	// Edit mode via the Edit chip.
	const editBtn = page.getByRole('button', { name: /Edit layout|Edit$/i }).first();
	if (await editBtn.count()) {
		await editBtn.click().catch(() => {});
		await ensureDevSettled(page);
		await shot(page, 'dashboard-edit-mode', viewport);

		// Done → leave edit mode.
		const doneBtn = page.getByRole('button', { name: /^Done$/ }).first();
		if (await doneBtn.count()) await doneBtn.click().catch(() => {});
		await ensureDevSettled(page);
	}

	// Open settings menu (gear button top-right on desktop, similar on mobile).
	const gear = page.locator('.user-menu button').first();
	if (await gear.count()) {
		await gear.click().catch(() => {});
		await ensureDevSettled(page);
		await shot(page, 'settings-menu', viewport);

		// Open Configure → ManageApps modal.
		const configure = page.getByRole('button', { name: /Configure/ }).first();
		if (await configure.count()) {
			await configure.click().catch(() => {});
			await ensureDevSettled(page);
			await page.waitForTimeout(450);
			await shot(page, 'manage-apps-appearance', viewport);

			// Try clicking Apps tab if visible.
			const appsTab = page.getByRole('button', { name: /^Apps$/ }).first();
			if (await appsTab.count()) {
				await appsTab.click().catch(() => {});
				await ensureDevSettled(page);
				await shot(page, 'manage-apps-apps', viewport);
			}

			// Close modal (× button in header).
			const closeBtn = page.locator('button[aria-label="Close"], button:has-text("×")').first();
			if (await closeBtn.count()) await closeBtn.click().catch(() => {});
			await page.keyboard.press('Escape').catch(() => {});
		}
	}
}

async function runForViewport(viewport) {
	const browser = await chromium.launch();
	const ctx = await browser.newContext({
		viewport: { width: viewport.width, height: viewport.height },
		deviceScaleFactor: 1,
		isMobile: viewport.name === 'mobile',
		hasTouch: viewport.name === 'mobile',
		userAgent:
			viewport.name === 'mobile'
				? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
				: undefined
	});
	ctx.setDefaultTimeout(4000);
	const page = await ctx.newPage();

	console.log(`\n=== ${viewport.name} (${viewport.width}x${viewport.height}) ===`);

	try {
		await captureLogin(page, viewport.name);
	} catch (e) {
		console.error('login failed:', e.message);
	}
	try {
		await captureOnboarding(page, viewport.name);
	} catch (e) {
		console.error('onboarding failed:', e.message);
	}
	try {
		await captureDashboard(page, viewport.name);
	} catch (e) {
		console.error('dashboard failed:', e.message);
	}

	await ctx.close();
	await browser.close();
}

for (const vp of VIEWPORTS) {
	await runForViewport(vp);
}

console.log(`\nDone. Screenshots in ${OUT}`);
