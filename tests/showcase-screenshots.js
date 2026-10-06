// Showcase screenshot generator
// Captures all personas across themes, icon styles, devices
// Includes: dashboard, welcome, onboarding, configure modal

import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs';
import { spawn } from 'child_process';

const OUT = 'screenshots/showcase';
const PORT = 5174;
const BASE = `http://localhost:${PORT}`;
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = {
	desktop: { width: 1440, height: 900 },
	mobile: { width: 390, height: 844 },
};

const PERSONAS = [
	{
		name: 'homelab',
		config: 'tests/showcase-config.yml',
		user: { name: 'Alex', username: 'alex' },
	},
	{
		name: 'family',
		config: 'tests/personas/family.yml',
		user: { name: 'Sam', username: 'sam' },
	},
	{
		name: 'startup',
		config: 'tests/personas/developer.yml',
		user: { name: 'Dev', username: 'dev' },
	},
];

const THEMES = ['dark', 'light'];
const ICON_STYLES = ['colored', 'white', 'grayed'];

// ── Helpers ──────────────────────────────────────────

function createConfig(configPath, { auth = false, news = false } = {}) {
	const tmpPath = configPath.replace('.yml', '.screenshot-tmp.yml');
	let content = readFileSync(configPath, 'utf-8');
	if (!auth) content = content.replace(/auth:\s*\n\s*enabled:\s*true/, 'auth:\n  enabled: false');
	if (!news) content = content.replace(/news:\s*\n\s*enabled:\s*true/, 'news:\n  enabled: false');
	writeFileSync(tmpPath, content);
	return tmpPath;
}

function startServer(configPath) {
	return new Promise((resolve, reject) => {
		const server = spawn('node', ['node_modules/.bin/vite', 'dev', '--host', '0.0.0.0', '--port', String(PORT)], {
			env: { ...process.env, CONFIG_PATH: configPath, NODE_OPTIONS: '--max-old-space-size=256' },
			cwd: process.cwd(),
			stdio: 'pipe'
		});
		const timeout = setTimeout(() => reject(new Error('Server startup timeout')), 30000);
		server.stdout.on('data', (data) => {
			if (data.toString().includes('ready in')) { clearTimeout(timeout); resolve(server); }
		});
		server.stderr.on('data', () => {});
		server.on('error', (err) => { clearTimeout(timeout); reject(err); });
	});
}

function makePrefs(user, overrides = {}) {
	return { onboarded: true, passwordVerified: true, enabledWidgets: ['weather', 'search'], ...user, ...overrides };
}

async function setupPage(browser, vp, prefs) {
	const page = await browser.newPage({ viewport: VIEWPORTS[vp] });
	await page.route('**/api/prefs', route => {
		route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ prefs }) });
	});
	await page.addInitScript((p) => localStorage.setItem('holm_prefs', JSON.stringify(p)), prefs);
	return page;
}

async function waitForDashboard(page) {
	await page.waitForSelector('.app-tile', { timeout: 15000 }).catch(() => {});
	// Wait for all icon images to load
	await page.waitForFunction(() => {
		const imgs = document.querySelectorAll('.app-icon-wrap img');
		return imgs.length > 0 && [...imgs].every(img => img.complete && img.naturalHeight > 0);
	}, { timeout: 15000 }).catch(() => {});
	// Wait for weather to load (if present)
	await page.waitForSelector('.animate-fade-in .tabular-nums', { timeout: 8000 }).catch(() => {});
	await page.waitForTimeout(500);
	// Dismiss install prompt
	const dismiss = page.locator('.fixed.bottom-0 button').last();
	if (await dismiss.isVisible({ timeout: 500 }).catch(() => false)) {
		await dismiss.click();
		await page.waitForTimeout(300);
	}
}

async function shot(page, name) {
	const path = `${OUT}/${name}.png`;
	await page.screenshot({ path, fullPage: false });
	console.log(`  ✓ ${name}.png`);
}

function cleanupTmpConfigs() {
	for (const dir of ['tests', 'tests/personas']) {
		try {
			for (const f of readdirSync(dir)) {
				if (f.endsWith('.screenshot-tmp.yml')) unlinkSync(`${dir}/${f}`);
			}
		} catch {}
	}
}

// ── Main ──────────────────────────────────────────

async function run() {
	const browser = await chromium.launch({ args: ['--no-sandbox'] });

	for (const persona of PERSONAS) {
		console.log(`\n━━ ${persona.name.toUpperCase()} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

		// ════════════════════════════════════════════
		// DASHBOARD (auth disabled for clean shots)
		// ════════════════════════════════════════════
		console.log('📸 Dashboard\n');
		const dashConfig = createConfig(persona.config, { auth: false, news: false });
		let server;
		try { server = await startServer(dashConfig); } catch (e) { console.error(`  ✗ ${e.message}`); continue; }
		await new Promise(r => setTimeout(r, 2000));

		for (const vp of Object.keys(VIEWPORTS)) {
			for (const theme of THEMES) {
				for (const iconStyle of ICON_STYLES) {
					const prefs = makePrefs(persona.user, { theme, iconStyle, wallpaperEnabled: false });
					const page = await setupPage(browser, vp, prefs);
					await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
					await waitForDashboard(page);
					await shot(page, `dashboard-${persona.name}-${vp}-${theme}-${iconStyle}`);
					await page.close();
				}
				// Wallpaper variant (colored only)
				const wpPrefs = makePrefs(persona.user, { theme, iconStyle: 'colored', wallpaperEnabled: true, wallpaperId: 1 });
				const wpPage = await setupPage(browser, vp, wpPrefs);
				await wpPage.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
				await waitForDashboard(wpPage);
				await wpPage.waitForTimeout(3000);
				await shot(wpPage, `dashboard-${persona.name}-${vp}-${theme}-wallpaper`);
				await wpPage.close();
			}
		}

		// ════════════════════════════════════════════
		// CONFIGURE MODAL
		// ════════════════════════════════════════════
		console.log('\n⚙️  Configure\n');
		for (const vp of Object.keys(VIEWPORTS)) {
			const prefs = makePrefs(persona.user, { theme: 'dark', iconStyle: 'colored', wallpaperEnabled: false });
			const page = await setupPage(browser, vp, prefs);
			await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
			await waitForDashboard(page);
			// Click the settings button (gear or user initial)
			const menuBtn = page.locator('.user-menu > button').first();
			if (await menuBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
				await menuBtn.click();
				await page.waitForTimeout(500);
				// Find and click Configure
				const configBtn = page.locator('button:has-text("Configure")').first();
				if (await configBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
					await configBtn.click();
					await page.waitForTimeout(1500);
					await shot(page, `configure-${persona.name}-${vp}`);
				} else {
					console.log(`  - configure not available for ${persona.name}-${vp}`);
				}
			}
			await page.close();
		}

		// ════════════════════════════════════════════
		// SEARCH
		// ════════════════════════════════════════════
		console.log('\n🔍 Search\n');
		for (const vp of Object.keys(VIEWPORTS)) {
			const prefs = makePrefs(persona.user, { theme: 'dark', iconStyle: 'colored', wallpaperEnabled: false });
			const page = await setupPage(browser, vp, prefs);
			await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
			await waitForDashboard(page);
			const searchInput = page.locator('input[placeholder*="Search"]');
			if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
				await searchInput.fill('cl');
				await page.waitForTimeout(600);
				await shot(page, `search-${persona.name}-${vp}`);
			}
			await page.close();
		}

		server.kill();
		await new Promise(r => setTimeout(r, 1000));

		// ════════════════════════════════════════════
		// WELCOME + ONBOARDING (auth enabled)
		// ════════════════════════════════════════════
		const rawConfig = readFileSync(persona.config, 'utf-8');
		const hasAuth = /auth:\s*\n\s*enabled:\s*true/.test(rawConfig);
		if (hasAuth) {
			console.log('\n🔐 Welcome\n');
			const authConfig = createConfig(persona.config, { auth: true, news: false });
			let authServer;
			try { authServer = await startServer(authConfig); } catch (e) { console.error(`  ✗ ${e.message}`); continue; }
			await new Promise(r => setTimeout(r, 2000));

			for (const vp of Object.keys(VIEWPORTS)) {
				for (const theme of THEMES) {
					const page = await browser.newPage({ viewport: VIEWPORTS[vp] });
					await page.addInitScript((t) => {
						localStorage.setItem('holm_prefs', JSON.stringify({ theme: t, wallpaperEnabled: true, wallpaperId: 1 }));
					}, theme);
					await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
					await page.waitForSelector('text=Welcome', { timeout: 10000 }).catch(() => {});
					await page.waitForTimeout(2500);
					await shot(page, `welcome-${persona.name}-${vp}-${theme}`);
					await page.close();
				}
			}

			authServer.kill();
			await new Promise(r => setTimeout(r, 1000));
		}

		// ════════════════════════════════════════════
		// ONBOARDING (auth disabled, onboarded=false)
		// ════════════════════════════════════════════
		const hasOnboarding = /onboarding:\s*\n\s*enabled:\s*true/.test(rawConfig);
		if (hasOnboarding) {
			console.log('\n🎓 Onboarding\n');
			// Need auth enabled for onboarding to show, but we fake the session
			const onbConfig = createConfig(persona.config, { auth: true, news: false });
			let onbServer;
			try { onbServer = await startServer(onbConfig); } catch (e) { console.error(`  ✗ ${e.message}`); continue; }
			await new Promise(r => setTimeout(r, 2000));

			for (const vp of Object.keys(VIEWPORTS)) {
				// Onboarding shows when logged in + not onboarded
				// We need to fake being logged in — set auth cookies
				const page = await browser.newPage({ viewport: VIEWPORTS[vp] });
				await page.addInitScript(() => {
					localStorage.setItem('holm_prefs', JSON.stringify({
						theme: 'dark', onboarded: false, wallpaperEnabled: true, wallpaperId: 1,
						name: 'Alex', username: 'alex', firstLoginAt: new Date().toISOString()
					}));
				});
				// Set auth cookies to fake a session
				await page.context().addCookies([
					{ name: 'auth_name', value: 'Alex', domain: 'localhost', path: '/' },
					{ name: 'auth_username', value: 'alex', domain: 'localhost', path: '/' },
					{ name: 'session', value: 'fake', domain: 'localhost', path: '/' },
				]);
				await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
				await page.waitForTimeout(3000);
				await shot(page, `onboarding-${persona.name}-${vp}`);
				await page.close();
			}

			onbServer.kill();
			await new Promise(r => setTimeout(r, 1000));
		}
	}

	cleanupTmpConfigs();
	await browser.close();
	console.log(`\n✅ All screenshots saved to ${OUT}/\n`);
}

run().catch(console.error);
