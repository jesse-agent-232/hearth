// Apps module — builds the flat app catalog and setup guides from config data.
// On the server, config is loaded from YAML. On the client, it's passed via page data.

let warnedOnLegacyShape = false;

// Accept both the new flat shape (apps: [{id, name, ...}]) and the legacy
// nested shape (apps: [{category, items: [...]}]). The legacy shape is
// flattened with a one-time warning so existing operator configs keep loading.
function normalizeAppsInput(appsConfig) {
	if (!Array.isArray(appsConfig)) return [];
	if (appsConfig.length === 0) return [];
	const first = appsConfig[0];
	if (first && Array.isArray(first.items)) {
		if (!warnedOnLegacyShape) {
			warnedOnLegacyShape = true;
			console.warn(
				"[holm] config: nested 'category/items' apps shape is deprecated. " +
					'Flatten apps: into a single list. The category labels are silently ignored.'
			);
		}
		return appsConfig.flatMap((c) => (Array.isArray(c?.items) ? c.items : []));
	}
	return appsConfig;
}

export function buildAppsFromConfig(appsConfig) {
	const items = normalizeAppsInput(appsConfig);

	const apps = items.map((item) => ({
		id: item.id,
		name: item.name,
		url: item.url,
		icon: resolveIcon(item.icon, item.icon_mono, item.brandColor, item.brandFg, item.brandExplicit),
		selfHosted: item.self_hosted || false,
		adminOnly: item.admin_only || false,
		default: item.default_visible !== false,
		ios: item.app_store?.ios || null,
		android: item.app_store?.android || null,
		extension: item.browser_extension || null,
		subtitle: item.setup_guide?.subtitle || null,
		tags: Array.isArray(item.tags) ? item.tags : []
	}));

	const setupGuides = {};
	for (const item of items) {
		if (item.setup_guide) {
			setupGuides[item.name] = {
				title: `${item.name} Setup`,
				subtitle: item.setup_guide.subtitle || item.name,
				steps: item.setup_guide.steps || []
			};
		}
	}

	return { apps, setupGuides };
}

// Served through Holm's own cache (routes/api/icon), not the CDNs directly.
const DI_CDN = '/api/icon/di';
const SI_CDN = '/api/icon/si';

// dashboard-icons slug → simpleicons slug (for names that differ)
const diToSimpleIcon = {
	'claude-ai': 'claude',
	'google-drive': 'googledrive',
	'google-maps': 'googlemaps',
	'apple-music': 'applemusic',
	'proton-mail': 'protonmail',
	'visual-studio-code': 'visualstudiocode',
	'paperless-ngx': 'paperlessngx',
	'uptime-kuma': 'uptimekuma',
};

// Resolve a single icon string to a URL
function resolveUrl(str) {
	if (!str) return null;
	if (str.startsWith('http') || str.startsWith('/')) return str;
	const name = str.replace(/^(di|si|sh):/, '');
	const prefix = str.match(/^(di|si|sh):/)?.[1] || 'di';
	if (prefix === 'si') return `${SI_CDN}/${diToSimpleIcon[name] || name}`;
	return `${DI_CDN}/${name}.svg`;
}

export function resolveIcon(icon, iconMono, brandColor, brandFg, brandExplicit) {
	if (!icon) return { colored: null, mono: null, hasMono: false, brandColor: null, brandFg: null, brandExplicit: false };

	// Object format: { colored: "url", mono: "url" }
	if (typeof icon === 'object') {
		return { colored: icon.colored || null, mono: icon.mono || icon.colored || null, hasMono: !!icon.mono, fallback: null, brandColor: brandColor || null, brandFg: brandFg || null, brandExplicit: !!brandExplicit };
	}

	// Full URL or absolute path
	if (icon.startsWith('http') || icon.startsWith('/')) {
		const mono = iconMono ? resolveUrl(iconMono) : null;
		return { colored: icon, mono: mono || icon, hasMono: !!iconMono, fallback: null, brandColor: brandColor || null, brandFg: brandFg || null, brandExplicit: !!brandExplicit };
	}

	const name = icon.replace(/^(di|si|sh):/, '');
	const colored = resolveUrl(icon);

	// Mono: explicit icon_mono > Simple Icons fallback
	let mono, hasMono;
	if (iconMono) {
		mono = resolveUrl(iconMono);
		hasMono = true;
	} else {
		const siSlug = diToSimpleIcon[name] || name;
		mono = `${SI_CDN}/${siSlug}`;
		hasMono = true; // SI may or may not have it — handleIconError covers failures
	}

	return {
		colored,
		mono,
		hasMono,
		fallback: colored,
		brandColor: brandColor || null,
		brandFg: brandFg || null,
		brandExplicit: !!brandExplicit
	};
}
