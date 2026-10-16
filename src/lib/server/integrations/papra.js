// Papra integration adapter.
//
// Surfaces:
//   - searchProviders.documents — searches documents by name and content

/** @type {import('./_types.js').IntegrationAdapter} */
const adapter = {
	id: 'papra',
	name: 'Papra',
	icon: 'di:papra',
	shortcut: 'papra',
	description: 'Document management with full-text search',

	configSchema: [
		{
			key: 'url',
			type: 'url',
			label: 'Papra URL',
			required: true,
			placeholder: 'https://papra.example.com',
			help: 'Base URL of your Papra server',
			fromOperatorDefault: 'default_url'
		},
		{
			key: 'token',
			type: 'secret',
			label: 'API Token',
			required: true,
			help: '1. Open **your User Account → API Keys**\n2. Click **Create API Key** and select only read permissions\n3. Click **Create API Key** and copy the value',
			helpUrl: { baseKey: 'url', path: '/api-keys', label: 'Open Papra settings' }
		},
		{
			key: 'organization',
			type: 'text',
			label: 'Organization ID',
			required: true,
			help: '1. In Papra URL copy the **org_ value**'
		}
	],

	async test({ config, fetch }) {
		if (!config?.url || !config?.token || !config?.organization) {
			return { ok: false, message: 'URL, token, and organization are required' };
		}
		if (!ORG_ID.test(config.organization)) {
			return { ok: false, message: 'Organization ID should look like org_… (copy it from the Papra URL)' };
		}
		const base = stripTrailingSlash(config.url);
		try {
			const res = await fetch(`${base}/api/organizations/${encodeURIComponent(config.organization)}/documents/statistics`, {
				method: 'GET',
				headers: authHeaders(config)
			});
			if (!res.ok) {
				if (res.status === 401 || res.status === 403) {
					return { ok: false, message: 'Token rejected — check that it is a valid API token' };
				}
				return { ok: false, message: `Server returned ${res.status} ${res.statusText}` };
			}
			const data = await res.json();
			const count = data?.organizationStats?.documentsCount ?? 0;
			return { ok: true, message: `Connected — ${count} document${count !== 1 ? 's' : ''} in library` };
		} catch (err) {
			return { ok: false, message: `Connection failed: ${err.message}` };
		}
	},

	searchProviders: {
		documents: {
			label: 'Documents',
			mode: 'inline',
			async query({ config, query, limit, fetch }) {
				if (!config?.url || !config?.token || !ORG_ID.test(config?.organization || '')) return { results: [] };
				const trimmed = (query || '').trim();
				if (!trimmed) return { results: [] };

				const base = stripTrailingSlash(config.url);
				const params = new URLSearchParams({
					pageIndex: '0',
					pageSize: String(Math.min(limit || 10, 25)),
					searchQuery: trimmed
				});
				const org = encodeURIComponent(config.organization);
				const res = await fetch(`${base}/api/organizations/${org}/documents?${params}`, {
					method: 'GET',
					headers: authHeaders(config)
				});
				if (!res.ok) {
					throw new Error(`Papra search failed: ${res.status}`);
				}
				const data = await res.json();
				const items = data?.documents || [];
				return {
					results: items.map((doc) => ({
						id: String(doc.id),
						title: doc.name || `Document #${doc.id}`,
						subtitle: '',
						thumbnail: '',
						href: `${base}/organizations/${org}/documents/${encodeURIComponent(doc.id)}`,
						meta: { kind: 'document' }
					}))
				};
			}
		}
	},

	widgets: {}
};

// Papra organization IDs look like org_ followed by lowercase letters and digits.
const ORG_ID = /^org_[a-z0-9]+$/;

function stripTrailingSlash(url) {
	return url.endsWith('/') ? url.slice(0, -1) : url;
}

function authHeaders(config) {
	return {
		Authorization: `Bearer ${config.token}`,
		accept: 'application/json'
	};
}

export default adapter;
