import { readFileSync, statSync, watchFile } from 'fs';
import { resolve, dirname } from 'path';
import yaml from 'js-yaml';
import { marked } from 'marked';
import { getBrandColor } from './brandColors.js';

let _config = null;

// Watch config file for changes and invalidate cache
const configPath = process.env.CONFIG_PATH || 'config.yml';
try {
	watchFile(configPath, { interval: 2000 }, () => {
		console.log('[holm] Config file changed, reloading on next request');
		_config = null;
	});
} catch { /* file may not exist yet */ }

function substituteEnvVars(obj) {
	if (typeof obj === 'string') {
		return obj.replace(/\$\{(\w+)\}/g, (_, key) => process.env[key] || '');
	}
	if (Array.isArray(obj)) return obj.map(substituteEnvVars);
	if (obj && typeof obj === 'object') {
		return Object.fromEntries(
			Object.entries(obj).map(([k, v]) => [k, substituteEnvVars(v)])
		);
	}
	return obj;
}

function loadConfig() {
	if (_config) return _config;

	let raw;
	try {
		raw = readFileSync(configPath, 'utf-8');
	} catch (err) {
		console.error(`[holm] Could not read config at ${configPath}: ${err.message}`);
		console.error('[holm] Copy config.example.yml to config.yml to get started.');
		_config = getDefaults();
		return _config;
	}

	const parsed = yaml.load(raw);
	_config = substituteEnvVars(parsed);
	return _config;
}

function getDefaults() {
	return {
		branding: { name: 'Holm', short_name: 'holm', description: 'Self-hosted dashboard', logo: null, favicon: null, font: { family: 'JetBrains Mono', url: null }, theme_color: '#09090b', accent_color: '#f5b942', show_footer: true },
		auth: { enabled: false, oidc: {}, admin_usernames: [], password_change_url: null, registration: { enabled: false, url: null } },
		apps: [],
		customization: { enabled: false },
		news: { enabled: false },
		search: { enabled: true, url: 'https://www.google.com/search', param: 'q' },
		wallpapers: { enabled: false },
		weather: { enabled: false },
		onboarding: { enabled: false },
		privacy: { enabled: false },
		tips: { enabled: false },
		database: { enabled: true },
	};
}

export function getConfig() {
	return loadConfig();
}

export function getBranding() {
	return getConfig().branding || getDefaults().branding;
}

export function getAuth() {
	return getConfig().auth || getDefaults().auth;
}

// Returns the configured apps as a flat list. Tolerates both the new shape
// (apps: [{id, ...}]) and the legacy nested shape (apps: [{category, items}]) —
// the legacy form is silently flattened so existing operator configs keep
// loading. Each item is enriched in place with brand color metadata.
export function getAppsConfig() {
	const raw = getConfig().apps || [];
	const isLegacy = Array.isArray(raw) && raw.length > 0 && Array.isArray(raw[0]?.items);
	const items = isLegacy ? raw.flatMap((c) => (Array.isArray(c?.items) ? c.items : [])) : raw;
	for (const item of items) {
		const brand = getBrandColor(item.icon, item.tile_color);
		if (brand) {
			item.brandColor = brand.brandColor;
			item.brandFg = brand.brandFg;
			item.brandExplicit = !!item.tile_color;
		}
	}
	return items;
}

export function getNewsConfig() {
	return getConfig().news || { enabled: false };
}

export function getSearchConfig() {
	return getConfig().search || { enabled: true, url: 'https://www.google.com/search', param: 'q' };
}

export function getWallpaperConfig() {
	return getConfig().wallpapers || { enabled: true, source: 'gitlab', count: 326 };
}

export function getWeatherConfig() {
	return getConfig().weather || { enabled: true, default_lat: 40.7128, default_lon: -74.0060 };
}

export function getOnboardingConfig() {
	return getConfig().onboarding || { enabled: false };
}

export function getPrivacyConfig() {
	return getConfig().privacy || { enabled: false };
}

export function getTipsConfig() {
	return getConfig().tips || { enabled: false };
}

export function getIntegrationsConfig() {
	return getConfig().integrations || {};
}

// Rendered once per file version: isomorphic-dompurify runs on jsdom, which
// leaks ~110 KB per sanitize call, and this runs on every layout load.
let _privacyCache = { key: null, html: null };

async function loadPrivacyHtml(config) {
	const file = config.privacy?.file;
	if (!file) return null;
	try {
		const configPath = process.env.CONFIG_PATH || 'config.yml';
		const base = dirname(resolve(configPath));
		const path = resolve(base, file);
		const key = `${path}:${statSync(path).mtimeMs}`;
		if (_privacyCache.key === key) return _privacyCache.html;
		const md = readFileSync(path, 'utf-8');
		const { default: DOMPurify } = await import('isomorphic-dompurify');
		const html = DOMPurify.sanitize(marked.parse(md));
		_privacyCache = { key, html };
		return html;
	} catch {
		return null;
	}
}

// Returns a client-safe subset (no secrets).
// When authenticated is false, only returns what the login page needs —
// branding, auth settings, privacy (for T&C), and wallpaper flag.
// Everything else (apps, integrations, search, etc.) stays server-side.
export async function getClientConfig({ authenticated = true } = {}) {
	const config = getConfig();
	const auth = {
		enabled: config.auth?.enabled ?? false,
		registration: config.auth?.registration || { enabled: false, url: null }
	};

	if (!authenticated) {
		return {
			branding: getBranding(),
			auth,
			privacy: { ...getPrivacyConfig(), html: await loadPrivacyHtml(config) },
			wallpapers: { enabled: config.wallpapers?.enabled ?? false }
		};
	}

	return {
		branding: getBranding(),
		auth: { ...auth, password_change_url: config.auth?.password_change_url || null },
		apps: getAppsConfig(),
		customization: { enabled: config.customization?.enabled ?? false },
		news: { enabled: config.news?.enabled ?? false },
		search: getSearchConfig(),
		wallpapers: { enabled: config.wallpapers?.enabled ?? false },
		weather: { enabled: config.weather?.enabled ?? false },
		onboarding: getOnboardingConfig(),
		privacy: { ...getPrivacyConfig(), html: await loadPrivacyHtml(config) },
		tips: getTipsConfig()
	};
}
