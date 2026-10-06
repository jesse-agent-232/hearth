// Mealie integration adapter.
//
// Surfaces:
//   - searchProviders.recipes — searches recipes by name, description and
//     ingredients
//
// Auth is a per-user API token sent as a bearer token.

const ITEM_ID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

/** @type {import('./_types.js').IntegrationAdapter} */
const adapter = {
	id: 'mealie',
	name: 'Mealie',
	icon: 'di:mealie',
	shortcut: 'r',
	description: 'Recipe manager — search your recipes',

	configSchema: [
		{
			key: 'url',
			type: 'url',
			label: 'Mealie URL',
			required: true,
			placeholder: 'https://mealie.example.com',
			help: 'Base URL of your Mealie server',
			fromOperatorDefault: 'default_url'
		},
		{
			key: 'apiKey',
			type: 'secret',
			label: 'API Token',
			required: true,
			help: '1. Click your **profile** → **API Tokens**\n2. Name a token and click **Generate**\n3. Copy the token — it is shown once',
			helpUrl: { baseKey: 'url', path: '/user/profile/api-tokens', label: 'Open Mealie API tokens' }
		}
	],

	async test({ config, fetch }) {
		if (!config?.url || !config?.apiKey) {
			return { ok: false, message: 'URL and API token are required' };
		}
		try {
			const me = await self(config, fetch);
			if (me.error) return { ok: false, message: me.error };
			return { ok: true, message: `Signed in as ${me.username || 'Mealie user'}` };
		} catch (err) {
			return { ok: false, message: `Connection failed: ${err.message}` };
		}
	},

	searchProviders: {
		recipes: {
			label: 'Recipes',
			mode: 'inline',
			async query({ config, query, limit, fetch }) {
				if (!config?.url || !config?.apiKey) return { results: [] };
				const trimmed = (query || '').trim();
				if (!trimmed) return { results: [] };

				const base = stripTrailingSlash(config.url);
				const params = new URLSearchParams({
					search: trimmed,
					page: '1',
					perPage: String(Math.min(limit || 10, 25))
				});
				// Recipe links carry the user's group slug, which only /users/self has.
				const [res, me] = await Promise.all([
					fetch(`${base}/api/recipes?${params}`, { headers: authHeaders(config) }),
					self(config, fetch)
				]);
				if (!res.ok) {
					throw new Error(`Mealie search failed: ${res.status}`);
				}
				const group = encodeURIComponent(me?.groupSlug || 'home');
				const items = ((await res.json())?.items || []).filter((r) => r?.slug);
				return {
					results: items.map((recipe) => ({
						id: String(recipe.id || recipe.slug),
						title: recipe.name || 'Untitled',
						subtitle: (recipe.description || '').slice(0, 120),
						thumbnail:
							recipe.image && ITEM_ID.test(recipe.id || '')
								? `/api/integrations/mealie/proxy/image/${recipe.id}`
								: undefined,
						href: `${base}/g/${group}/r/${encodeURIComponent(recipe.slug)}`,
						meta: { kind: 'recipe' }
					}))
				};
			}
		}
	},

	proxy: {
		image: {
			defaultCacheControl: 'private, max-age=86400',
			async fetch({ config, params, fetch }) {
				const id = params.path?.[0];
				if (!id || !ITEM_ID.test(id)) {
					return new Response('Invalid recipe id', { status: 400 });
				}
				return fetch(`${stripTrailingSlash(config.url)}/api/media/recipes/${id}/images/min-original.webp`, {
					headers: authHeaders(config)
				});
			}
		}
	},

	widgets: {}
};

function stripTrailingSlash(url) {
	return url.endsWith('/') ? url.slice(0, -1) : url;
}

function authHeaders(config) {
	return {
		Authorization: `Bearer ${config.apiKey}`,
		accept: 'application/json'
	};
}

async function self(config, fetch) {
	const res = await fetch(`${stripTrailingSlash(config.url)}/api/users/self`, { headers: authHeaders(config) });
	if (!res.ok) {
		if (res.status === 401 || res.status === 403) return { error: 'API token rejected — check that it is valid' };
		return { error: `Server returned ${res.status} ${res.statusText}` };
	}
	return res.json();
}

export default adapter;
