import { getIntegrationsConfig } from '../config.js';

// Planka integration adapter.
//
// Surfaces:
//   - searchProviders.cards — searches cards by name across all accessible boards
//
// Planka API keys are admin-only — individual users can't create them.
// The operator provides the shared key via config.yml (default_api_key).
// This integration is gated with admin_only: true so only admins see it.
//
// Planka has no search API, so we fetch all cards from all boards and
// filter by name locally. Card counts are typically small (<500).

// Simple TTL cache: key → { cards, expiresAt }
const cardCache = new Map();
const DEFAULT_CACHE_TTL_MS = 5 * 60_000; // 5 minutes

function getCacheTtl() {
	const ttl = (getIntegrationsConfig() || {}).planka?.cache_ttl;
	if (typeof ttl === 'number' && ttl > 0) return ttl * 1000;
	return DEFAULT_CACHE_TTL_MS;
}

function getCachedCards(cacheKey) {
	const entry = cardCache.get(cacheKey);
	if (entry && Date.now() < entry.expiresAt) return entry.cards;
	return null;
}

function setCachedCards(cacheKey, cards) {
	cardCache.set(cacheKey, { cards, expiresAt: Date.now() + getCacheTtl() });
}

// One crawl per cacheKey at a time: keystrokes arriving while the cache is
// cold join the crawl already running instead of each starting their own.
const inFlight = new Map();

function loadCards(cacheKey, base, config, fetch) {
	let pending = inFlight.get(cacheKey);
	if (!pending) {
		pending = fetchAllCards(base, config, fetch)
			.then((cards) => {
				setCachedCards(cacheKey, cards);
				return cards;
			})
			.finally(() => inFlight.delete(cacheKey));
		inFlight.set(cacheKey, pending);
	}
	return pending;
}

/** @type {import('./_types.js').IntegrationAdapter} */
const adapter = {
	id: 'planka',
	name: 'Planka',
	icon: 'di:planka',
	shortcut: 'p',
	description: 'Kanban boards with card search',

	configSchema: [
		{
			key: 'url',
			type: 'url',
			label: 'Planka URL',
			required: true,
			placeholder: 'https://planka.example.com',
			help: 'Base URL of your Planka server',
			fromOperatorDefault: 'default_url'
		},
		{
			key: 'apiKey',
			type: 'secret',
			label: 'API Key',
			required: true,
			help: 'Ask your administrator to create an API key for you in Planka settings.'
		}
	],

	async test({ config, fetch }) {
		if (!config?.url || !config?.apiKey) {
			return { ok: false, message: 'URL and API key are required' };
		}
		const base = stripTrailingSlash(config.url);
		try {
			const res = await fetch(`${base}/api/projects`, {
				method: 'GET',
				headers: authHeaders(config)
			});
			if (!res.ok) {
				if (res.status === 401) {
					return { ok: false, message: 'API key rejected — contact your administrator' };
				}
				return { ok: false, message: `Server returned ${res.status} ${res.statusText}` };
			}
			const data = await res.json();
			const projects = data?.items || [];
			return { ok: true, message: `Connected — ${projects.length} project${projects.length !== 1 ? 's' : ''} accessible` };
		} catch (err) {
			return { ok: false, message: `Connection failed: ${err.message}` };
		}
	},

	searchProviders: {
		cards: {
			label: 'Cards',
			mode: 'inline',
			async query({ config, query, limit, fetch }) {
				if (!config?.url || !config?.apiKey) return { results: [] };
				const trimmed = (query || '').trim().toLowerCase();
				if (!trimmed) return { results: [] };

				const base = stripTrailingSlash(config.url);
				const cacheKey = `${config.url}:${config.apiKey}`;

				const allCards = getCachedCards(cacheKey) || (await loadCards(cacheKey, base, config, fetch));

				// Filter by name, exclude closed cards
				const matches = allCards
					.filter((c) => !c.isClosed && c.name.toLowerCase().includes(trimmed))
					.slice(0, Math.min(limit || 10, 25));

				return {
					results: matches.map((card) => {
						const parts = [card.boardName, card.listName].filter(Boolean).join(' › ');
						const extras = [];
						if (card.dueDate) {
							const d = new Date(card.dueDate);
							extras.push(`Due ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`);
						}
						if (card.commentsTotal > 0) {
							extras.push(`${card.commentsTotal} comment${card.commentsTotal !== 1 ? 's' : ''}`);
						}
						const subtitle = extras.length ? `${parts}  ·  ${extras.join(' · ')}` : parts;
						return {
							id: String(card.id),
							title: card.name,
							subtitle,
							href: `${base}/cards/${card.id}`,
							tags: card.labelNames || [],
							meta: { kind: 'card' }
						};
					})
				};
			}
		}
	},

	widgets: {}
};

async function fetchAllCards(base, config, fetch) {
	const projRes = await fetch(`${base}/api/projects`, {
		method: 'GET',
		headers: authHeaders(config)
	});
	if (!projRes.ok) throw new Error(`Planka projects failed: ${projRes.status}`);
	const projects = (await projRes.json())?.items || [];

	const projFetches = projects.map(async (proj) => {
		const res = await fetch(`${base}/api/projects/${proj.id}`, {
			method: 'GET',
			headers: authHeaders(config)
		});
		if (!res.ok) return [];
		const data = await res.json();
		return (data?.included?.boards || []).map((b) => ({ ...b, projectName: proj.name }));
	});
	const allBoards = (await Promise.all(projFetches)).flat();

	const boardFetches = allBoards.map(async (board) => {
		const res = await fetch(`${base}/api/boards/${board.id}`, {
			method: 'GET',
			headers: authHeaders(config)
		});
		if (!res.ok) return [];
		const data = await res.json();
		const cards = data?.included?.cards || [];
		const lists = data?.included?.lists || [];
		const labels = data?.included?.labels || [];
		const cardLabels = data?.included?.cardLabels || [];
		const listMap = new Map(lists.map((l) => [l.id, l]));
		const labelMap = new Map(labels.map((l) => [l.id, l.name]));
		const cardLabelsMap = new Map();
		for (const cl of cardLabels) {
			const name = labelMap.get(cl.labelId);
			if (!name) continue;
			const arr = cardLabelsMap.get(cl.cardId) || [];
			arr.push(name);
			cardLabelsMap.set(cl.cardId, arr);
		}
		return cards
			.filter((c) => listMap.get(c.listId)?.type === 'active')
			.map((c) => ({
				...c,
				boardName: board.name,
				listName: listMap.get(c.listId)?.name || null,
				labelNames: cardLabelsMap.get(c.id) || []
			}));
	});

	return (await Promise.all(boardFetches)).flat();
}

function stripTrailingSlash(url) {
	return url.endsWith('/') ? url.slice(0, -1) : url;
}

function authHeaders(config) {
	return {
		'X-Api-Key': config.apiKey,
		accept: 'application/json'
	};
}

export default adapter;
