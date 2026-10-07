// Nextcloud integration adapter.
//
// Surfaces:
//   - searchProviders.files — searches files via OCS Unified Search API
//

/** @type {import('./_types.js').IntegrationAdapter} */
const adapter = {
	id: 'nextcloud',
	name: 'Nextcloud',
	icon: 'di:nextcloud',
	shortcut: 'f',
	description: 'File storage with search',

	configSchema: [
		{
			key: 'url',
			type: 'url',
			label: 'Nextcloud URL',
			required: true,
			placeholder: 'https://cloud.example.com',
			help: 'Base URL of your Nextcloud server',
			fromOperatorDefault: 'default_url'
		},
		{
			key: 'username',
			type: 'text',
			label: 'Username',
			required: true,
			placeholder: 'your-username'
		},
		{
			key: 'appPassword',
			type: 'secret',
			label: 'App Password',
			required: true,
			help: '1. Open **Settings → Security**\n2. Scroll to **Devices & Sessions**\n3. Enter a name and click **Create new app password**\n4. Copy the generated password',
			helpUrl: { baseKey: 'url', path: '/settings/user/security', label: 'Open security settings' }
		}
	],

	async test({ config, fetch }) {
		if (!config?.url || !config?.username || !config?.appPassword) {
			return { ok: false, message: 'URL, username, and app password are required' };
		}
		const base = stripTrailingSlash(config.url);
		try {
			const res = await fetch(`${base}/ocs/v2.php/cloud/user?format=json`, {
				method: 'GET',
				headers: ocsHeaders(config)
			});
			if (!res.ok) {
				if (res.status === 401) {
					return { ok: false, message: 'Authentication failed — check username and app password' };
				}
				return { ok: false, message: `Server returned ${res.status} ${res.statusText}` };
			}
			const data = await res.json();
			const displayName = data?.ocs?.data?.displayname || data?.ocs?.data?.['display-name'] || config.username;
			return { ok: true, message: `Connected as ${displayName}` };
		} catch (err) {
			return { ok: false, message: `Connection failed: ${err.message}` };
		}
	},

	searchProviders: {
		files: {
			label: 'Files',
			mode: 'inline',
			async query({ config, query, limit, fetch }) {
				if (!config?.url || !config?.username || !config?.appPassword) return { results: [] };
				const trimmed = (query || '').trim();
				if (!trimmed) return { results: [] };

				const base = stripTrailingSlash(config.url);
				const params = new URLSearchParams({
					term: trimmed,
					limit: String(Math.min(limit || 10, 25)),
					format: 'json'
				});
				const res = await fetch(
					`${base}/ocs/v2.php/search/providers/files/search?${params}`,
					{
						method: 'GET',
						headers: ocsHeaders(config)
					}
				);
				if (!res.ok) {
					throw new Error(`Nextcloud search failed: ${res.status}`);
				}
				const data = await res.json();
				const entries = data?.ocs?.data?.entries || [];
				return {
					results: entries.map((entry, i) => ({
						id: entry.resourceUrl || String(i),
						title: entry.title || 'Untitled',
						subtitle: entry.subline || '',
						thumbnail: entry.thumbnailUrl
							? `/api/integrations/nextcloud/proxy/thumbnail/${encodeURIComponent(btoa(entry.thumbnailUrl))}`
							: null,
						href: entry.resourceUrl || base,
						meta: { kind: 'file' }
					}))
				};
			}
		}
	},

	proxy: {
		thumbnail: {
			defaultCacheControl: 'private, max-age=3600',
			async fetch({ config, params, fetch }) {
				const id = params.path?.[0];
				if (!id) return new Response('Missing thumbnail reference', { status: 400 });
				// The ID is a base64-encoded upstream thumbnail URL
				let upstreamUrl;
				try {
					upstreamUrl = atob(id);
				} catch {
					return new Response('Invalid thumbnail reference', { status: 400 });
				}
				// Resolve relative URLs and validate the target is on the configured host
				const base = stripTrailingSlash(config.url);
				if (upstreamUrl.startsWith('/')) {
					upstreamUrl = base + upstreamUrl;
				} else if (!upstreamUrl.startsWith(base)) {
					return new Response('Thumbnail URL not on configured Nextcloud host', { status: 403 });
				}
				return fetch(upstreamUrl, {
					method: 'GET',
					headers: basicAuthHeader(config)
				});
			}
		}
	},

	widgets: {}
};

function stripTrailingSlash(url) {
	return url.endsWith('/') ? url.slice(0, -1) : url;
}

function basicAuthHeader(config) {
	const creds = btoa(`${config.username}:${config.appPassword}`);
	return { Authorization: `Basic ${creds}` };
}

function ocsHeaders(config) {
	return {
		...basicAuthHeader(config),
		'OCS-APIRequest': 'true',
		accept: 'application/json'
	};
}

export default adapter;
