<script>
	import { onMount, getContext, untrack } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { integrations as integrationsStore } from '$lib/stores/integrations.js';
	import { prefs } from '$lib/stores/prefs.js';
	import { TOTAL_WALLPAPERS } from '$lib/wallpaper.js';
	import { resolveIcon } from '$lib/apps.js';
	import SearchResults from './SearchResults.svelte';
	import { isMac } from './Keys.svelte';
	import { bestScore } from '$lib/launcher/match.js';
	import { recordOpen, frecencyScores } from '$lib/launcher/frecency.js';

	const siteConfig = getContext('config');
	const searchConfig = siteConfig?.search || { enabled: true, url: 'https://www.google.com/search', param: 'q' };

	let { query = $bindable(''), apps = [], onSettingsOpen = () => {} } = $props();
	let inputEl;
	let containerEl;
	// Available pixel height for the results dropdown — computed from the bar's
	// bottom edge to the viewport bottom minus a breathing gap. Recomputed on
	// open + window resize so the panel never spills past the visible area.
	let resultsMaxHeight = $state(420);
	function recomputeResultsMaxHeight() {
		if (!containerEl || typeof window === 'undefined') return;
		const rect = containerEl.getBoundingClientRect();
		const gap = 24;
		const available = window.innerHeight - rect.bottom - gap;
		resultsMaxHeight = Math.max(220, available);
	}

	// ── Provider model — unified search ───────────────────────────
	// There is no provider switcher. The form's submit target is the
	// configured web search (Enter key fires it in a new tab). Every
	// connected integration that exposes inline-mode search providers
	// AND has the user's `surfaces.search` toggle on runs automatically
	// on every keystroke; results land in the dropdown below the bar.
	//
	// This matches the iPhone Spotlight model: one box, one experience,
	// no clicks to switch contexts.

	const inlineProviders = $derived.by(() => {
		const out = [];
		for (const it of $integrationsStore.integrations) {
			if (!it.userState?.connected) continue;
			if (it.userState?.surfaces?.search === false) continue;
			if (!(it.availableSurfaces || []).includes('search')) continue;
			for (const [key, prov] of Object.entries(it.searchProviders || {})) {
				if (prov.mode !== 'inline') continue;
				out.push({
					providerId: `${it.id}:${key}`,
					integrationId: it.id,
					integrationName: it.name,
					integrationIcon: it.icon,
					providerKey: key,
					label: prov.label,
					searchUrl: it.operatorDefaults?.url || it.userState?.config?.url || null
				});
			}
		}
		return out;
	});

	const hasInlineProviders = $derived(inlineProviders.length > 0);

	// ── Bang-prefix scope (chip-style) ───────────────────────────
	// `query` holds only the user-visible text (no bang prefix once recognized).
	// `activeScope` holds the integrationId once a shortcut is recognized from input.
	let activeScope = $state(null);

	const shortcutMap = $derived.by(() => {
		const m = new Map();
		for (const it of $integrationsStore.integrations) {
			if (!it.shortcut || !it.userState?.connected) continue;
			const key = it.shortcut.toLowerCase();
			if (!m.has(key)) m.set(key, it.id);
		}
		return m;
	});

	// Called on every input event. A bang token is only promoted once it is
	// space-terminated (or Enter-terminated, handled in handleInputKeydown).
	// This avoids clobbering longer shortcuts that share a prefix (e.g. `p` vs `pk`).
	function maybePromoteScope() {
		if (activeScope) return;
		const s = (query || '').trimStart();
		if (!s.startsWith('!')) return;
		const m = s.match(/^!([a-zA-Z0-9_-]+)\s+(.*)$/);
		if (!m) return;
		const id = shortcutMap.get(m[1].toLowerCase());
		if (!id) return;
		activeScope = id;
		query = m[2];
	}

	// Shortcuts arrive with the integrations store, which can be after a
	// `?q=!jf dune` deep link set the query — promote once they do.
	$effect(() => {
		shortcutMap;
		untrack(maybePromoteScope);
	});

	const scopedProviders = $derived(
		activeScope
			? inlineProviders.filter((p) => p.integrationId === activeScope)
			: inlineProviders
	);

	const activeIntegration = $derived(
		activeScope ? $integrationsStore.integrations.find((it) => it.id === activeScope) : null
	);

	// ── Quick-action registry ────────────────────────────────────
	// Icon SVG strings are pre-rendered paths (fed into a <svg> wrapper in the row).
	const ICONS = {
		settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
		theme: '<circle cx="12" cy="12" r="5"/><path d="M12 1v2m0 18v-2M4.22 4.22l1.42 1.42m12.72 12.72-1.42-1.42M1 12h2m18 0h-2M4.22 19.78l1.42-1.42M18.36 5.64l-1.42 1.42"/>',
		icon: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
		wall: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
		logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>'
	};

	const ACTIONS = [
		{ id: 'settings', bang: 'settings', label: 'Open Configure', keywords: ['settings', 'preferences', 'integrations', 'widgets'], icon: ICONS.settings, exec: () => onSettingsOpen() },
		// manual: never auto-runs on the last keystroke; needs Enter or a click
		{ id: 'logout', bang: 'logout', label: 'Log out', keywords: ['sign out', 'logout'], icon: ICONS.logout, manual: true, exec: () => { window.location.href = '/auth/logout'; } },
		// Wallpapers only show in the Dynamic theme, so switch to it; otherwise
		// the pick is saved under Light/Dark and nothing visibly changes.
		...(siteConfig?.wallpapers?.enabled ? [{
			id: 'wall', bang: 'wall', label: 'Pick a random wallpaper', keywords: ['wallpaper', 'background', 'shuffle'], icon: ICONS.wall,
			exec: () => {
				const next = Math.floor(Math.random() * TOTAL_WALLPAPERS) + 1;
				prefs.update((p) => ({ ...p, wallpaperId: next, wallpaperEnabled: true, theme: 'auto' }));
			}
		}] : []),
		// 'auto' is the stored value; Configure calls it Dynamic, so both work.
		...[['dark', 'Dark'], ['light', 'Light'], ['auto', 'Dynamic']].map(([t, name]) => ({
			id: `theme-${t}`, bang: 'theme', arg: t, argAlias: name.toLowerCase(), label: `Theme: ${name}`, keywords: [t, name.toLowerCase(), `${t} mode`], icon: ICONS.theme,
			exec: () => prefs.update((p) => ({ ...p, theme: t }))
		})),
		...['colored', 'white', 'grayed'].map((s) => ({
			id: `icon-${s}`, bang: 'icon', arg: s, label: `Icon style: ${s[0].toUpperCase()}${s.slice(1)}`, keywords: [`${s} icons`], icon: ICONS.icon,
			exec: () => prefs.update((p) => ({ ...p, iconStyle: s }))
		}))
	];

	const matchedActions = $derived.by(() => {
		if (activeScope) return [];
		const s = (query || '').trimStart();
		if (!s.startsWith('!')) return [];
		const m = s.match(/^!([a-zA-Z0-9_-]+)(?:\s+(.*))?$/);
		if (!m) return [];
		const bang = m[1].toLowerCase();
		const argFilter = (m[2] || '').trim().toLowerCase();
		const hits = ACTIONS.filter((a) => a.bang === bang);
		if (!hits.length) return [];
		if (!argFilter) return hits;
		return hits.filter((a) => !a.arg || a.arg.includes(argFilter) || a.argAlias?.includes(argFilter));
	});

	function runAction(action) {
		try { action.exec(); } catch (err) { console.error('Action failed:', err); }
		query = '';
		activeScope = null;
		inlineOpen = false;
		inputEl?.blur();
	}

	// Lazy-load the integrations registry once on mount so the inline
	// providers list is populated without requiring focus first.
	let triedLoad = false;
	function ensureIntegrationsLoaded() {
		if (triedLoad) return;
		triedLoad = true;
		integrationsStore.load();
	}

	// ── Inline-mode search dispatch ───────────────────────────────
	// One results bucket per provider. Keyed by providerId so multiple
	// providers in the future render as separate sections in the dropdown.
	let providerResults = $state({}); // providerId → { results, loading, error }
	let inlineOpen = $state(false);
	let debounceTimer = null;
	let lastDispatched = '';
	let searchAbort = null;

	// Drop any pending or in-flight provider search so a slower, older
	// response can't land under a newer query.
	function cancelSearch() {
		clearTimeout(debounceTimer);
		searchAbort?.abort();
		searchAbort = null;
		lastDispatched = '';
	}

	// ── Rotating typed placeholder ────────────────────────────────
	// Cycles through hints so the placeholder advertises what the palette
	// can do (bangs, actions, shortcuts) without a static wall of text.
	// Pauses while the user is focused, typing, or scoped — those are
	// states where a moving placeholder would distract.
	// The scope hint uses a real shortcut from a connected integration, since
	// shortcuts are per-adapter and operator-overridable.
	const scopeHint = $derived.by(() => {
		const it = $integrationsStore.integrations.find((i) => i.shortcut && i.userState?.connected);
		return it ? `Try !${it.shortcut} to scope ${it.name}` : null;
	});
	// The server render assumes Mac; swap to Ctrl after hydration so the
	// two renders agree.
	let macKeys = $state(true);
	onMount(() => { macKeys = isMac; });
	const FIRST_HINT = 'Search apps, files, photos…';
	const PLACEHOLDER_HINTS = $derived([
		FIRST_HINT,
		...(scopeHint ? [scopeHint] : []),
		'Type a command, like “dark” or “wallpaper”',
		`Press / or ${isMac ? '⌘K' : 'Ctrl K'} anywhere to search`
	]);
	let placeholderText = $state(FIRST_HINT);

	$effect(() => {
		if (typeof document === 'undefined') return;
		if (inlineOpen || query || activeScope) return;
		let hintIndex = 0;
		let charIndex = PLACEHOLDER_HINTS[0].length;
		let phase = 'holding';
		let timeout;
		placeholderText = PLACEHOLDER_HINTS[0];

		const step = () => {
			// Reduced motion: swap whole hints instead of typing them out.
			if (prefersReducedMotion.current) {
				hintIndex = (hintIndex + 1) % PLACEHOLDER_HINTS.length;
				charIndex = PLACEHOLDER_HINTS[hintIndex].length;
				phase = 'holding';
				placeholderText = PLACEHOLDER_HINTS[hintIndex];
				timeout = setTimeout(step, 4000);
				return;
			}
			const target = PLACEHOLDER_HINTS[hintIndex];
			if (phase === 'holding') {
				phase = 'erasing';
				timeout = setTimeout(step, 1800);
			} else if (phase === 'erasing') {
				if (charIndex > 0) {
					charIndex--;
					placeholderText = target.slice(0, charIndex);
					timeout = setTimeout(step, 22);
				} else {
					phase = 'typing';
					hintIndex = (hintIndex + 1) % PLACEHOLDER_HINTS.length;
					timeout = setTimeout(step, 320);
				}
			} else if (phase === 'typing') {
				const next = PLACEHOLDER_HINTS[hintIndex];
				if (charIndex < next.length) {
					charIndex++;
					placeholderText = next.slice(0, charIndex);
					timeout = setTimeout(step, 45);
				} else {
					phase = 'holding';
					timeout = setTimeout(step, 2200);
				}
			}
		};
		timeout = setTimeout(step, 2800);
		return () => clearTimeout(timeout);
	});

	async function fireOneProvider(provider, q, signal) {
		providerResults = {
			...providerResults,
			[provider.providerId]: { ...(providerResults[provider.providerId] || {}), loading: true, error: '' }
		};
		try {
			const res = await fetch('/api/search', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ provider: provider.providerId, query: q, limit: 24 }),
				signal
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.error || `HTTP ${res.status}`);
			}
			const data = await res.json();
			if (lastDispatched !== q) return; // a newer query has overtaken us
			providerResults = {
				...providerResults,
				[provider.providerId]: {
					results: data.results || [],
					loading: false,
					error: ''
				}
			};
		} catch (err) {
			if (signal.aborted || lastDispatched !== q) return;
			providerResults = {
				...providerResults,
				[provider.providerId]: {
					results: [],
					loading: false,
					error: err.message || 'Search failed'
				}
			};
		}
	}

	// Min query length before any remote provider fetch fires. One/two-letter
	// queries are mostly people filtering local apps — fanning out to every
	// connected integration on every keystroke is noisy + expensive (and the
	// results are too broad to be useful). Matches the Raycast/Spotlight
	// pattern of "local-instant, remote-after-3-chars". Scoped queries are
	// gated by the same threshold by design — the user opted into a scope but
	// we still don't want a Planka cards fetch on "p".
	const MIN_REMOTE_QUERY_LENGTH = 3;

	function dispatchSearch(q, providers) {
		cancelSearch();
		const trimmed = (q || '').trim();
		if (trimmed.length < MIN_REMOTE_QUERY_LENGTH) {
			providerResults = {};
			return;
		}
		debounceTimer = setTimeout(() => {
			lastDispatched = trimmed;
			searchAbort = new AbortController();
			for (const provider of providers) {
				fireOneProvider(provider, trimmed, searchAbort.signal);
			}
		}, 250);
	}

	$effect(() => {
		// Bang-prefixed input is a built-in command (`!settings`, `!theme`, …) or
		// a pending scope shortcut. Either way the user is not asking integrations
		// to search — skip the dispatch entirely so we don't waste requests on
		// every keystroke until they hit space and a real query begins.
		const trimmed = (query || '').trim();
		const isBang = trimmed.startsWith('!');
		if (hasInlineProviders && !isBang) {
			dispatchSearch(query, scopedProviders);
		} else {
			cancelSearch();
			providerResults = {};
		}
	});

	// ── Launcher model ────────────────────────────────────────────
	// Everything the list shows is built here as sections of items. Each item
	// carries its own actions; actions[0] is what Enter does, actions[1] is
	// ⌘↵, and the ⌘K panel lists them all.
	const openAppsInNewTab = $derived($prefs.openInNewTab ?? true);

	// Result links come from integrations (bookmarks, files), so only follow
	// http(s): a stored `javascript:` link would otherwise run as Holm.
	function safeUrl(url) {
		try {
			const u = new URL(url, window.location.href);
			return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
		} catch {
			return null;
		}
	}

	function openUrl(raw, newTab) {
		const url = raw && safeUrl(raw);
		if (!url) return;
		if (newTab) window.open(url, '_blank', 'noopener,noreferrer');
		else window.location.href = url;
	}

	async function copyText(text) {
		try { await navigator.clipboard.writeText(text); } catch {}
	}

	function finish() {
		query = '';
		activeScope = null;
		inlineOpen = false;
		panelOpen = false;
		inputEl?.blur();
	}

	// Only app opens feed frecency: they're the only keys it ranks, and
	// one-off result opens would otherwise evict app history.
	const noteOpen = (key) => { if (key.startsWith('app:')) recordOpen(key); };

	function linkActions(key, url, newTabFirst, openLabel = 'Open') {
		const open = { label: openLabel, run: () => { noteOpen(key); openUrl(url, newTabFirst); finish(); } };
		const other = {
			label: newTabFirst ? 'Open in this tab' : 'Open in new tab',
			hint: '⌘ ↵',
			run: () => { noteOpen(key); openUrl(url, !newTabFirst); finish(); }
		};
		const copy = { label: 'Copy link', hint: '⌘ ⇧ C', run: () => { copyText(url); finish(); } };
		return [open, other, copy];
	}

	// Result actions run in place (e.g. Seerr's Request): the list stays open
	// and the poster's badge reports how it went. Keyed by result key. They
	// never run on a plain click or Enter, which open the title; the poster
	// shows a button for it on hover, and the ⌘K panel lists it.
	let actionState = $state({});

	async function runResultAction(key, integrationId, action) {
		if (actionState[key]?.busy || actionState[key]?.ok) return;
		actionState = { ...actionState, [key]: { busy: true, message: `${action.label}…` } };
		const res = await integrationsStore.runAction(integrationId, action.key, action.params);
		actionState = { ...actionState, [key]: { ok: res.ok, message: res.message } };
	}

	// The poster's button: Request, then a disabled Requested once it's in
	// (or when Seerr already has a request for the title).
	function resultAction(key, p, r) {
		if (actionState[key]?.ok || r.meta?.requested) return { label: 'Requested', done: true };
		if (!r.action) return null;
		return {
			label: r.action.label,
			busy: !!actionState[key]?.busy,
			run: () => runResultAction(key, p.integrationId, r.action)
		};
	}

	function resultActions(key, p, r) {
		const links = r.href ? linkActions(key, r.href, true, r.openLabel || 'Open') : [];
		const extra = resultAction(key, p, r);
		return extra?.run ? [...links, extra] : links;
	}

	function appItem(app) {
		const key = `app:${app.id}`;
		let host = '';
		try { host = new URL(app.url).host; } catch {}
		return {
			key,
			title: app.name,
			subtitle: app.subtitle || host,
			appIcon: app.icon ?? null,
			accessory: 'App',
			url: app.url,
			actions: linkActions(key, app.url, openAppsInNewTab)
		};
	}

	function commandItem(a) {
		return {
			key: `cmd:${a.id}`,
			title: a.label,
			subtitle: a.bang ? `!${a.bang}${a.arg ? ' ' + a.arg : ''}` : '',
			svg: a.icon,
			accessory: 'Command',
			actions: [{ label: 'Run command', run: () => runAction(a) }]
		};
	}

	const PROVIDER_KIND_ORDER = { media: 0, document: 1, file: 2, card: 3, bookmark: 4, photo: 5 };

	let frecency = $state({});
	$effect(() => {
		if (inlineOpen) frecency = frecencyScores();
	});

	const sections = $derived.by(() => {
		const q = (query || '').trim();
		const out = [];

		// Bang mode: only the matching commands.
		if (matchedActions.length) {
			out.push({ id: 'commands', label: 'Commands', items: matchedActions.map(commandItem) });
			return out;
		}
		// A bare or partial bang ("!", "!th"): list the commands and scopes
		// it could still become, so "!" doubles as the command list.
		if (q.startsWith('!') && !activeScope) {
			const m = q.match(/^!([a-zA-Z0-9_-]*)$/);
			if (!m) return out;
			const prefix = m[1].toLowerCase();
			const cmds = ACTIONS.filter((a) => a.bang.startsWith(prefix));
			if (cmds.length) out.push({ id: 'commands', label: 'Commands', items: cmds.map(commandItem) });
			const scopes = [];
			for (const [key, id] of shortcutMap) {
				if (!key.startsWith(prefix)) continue;
				const it = $integrationsStore.integrations.find((i) => i.id === id);
				if (!it) continue;
				scopes.push({
					key: `scope:${id}`,
					title: `Search in ${it.name}`,
					subtitle: `!${key}`,
					appIcon: it.icon ? resolveIcon(it.icon) : null,
					actions: [{ label: `Search ${it.name}`, run: () => { activeScope = id; query = ''; inputEl?.focus(); } }]
				});
			}
			if (scopes.length) out.push({ id: 'scopes', label: 'Scopes', items: scopes });
			return out;
		}

		// Nothing typed yet: recents first, then a few commands.
		if (!q && !activeScope) {
			const ranked = apps
				.map((a) => ({ a, f: frecency[`app:${a.id}`] || 0 }))
				.filter((x) => x.f > 0)
				.sort((x, y) => y.f - x.f)
				.slice(0, 6)
				.map((x) => x.a);
			const recent = ranked.length ? ranked : apps.slice(0, 6);
			out.push({ id: 'recent', label: ranked.length ? 'Recent' : 'Apps', items: recent.map(appItem) });
			const suggested = ['settings', 'wall', $prefs.theme === 'light' ? 'theme-dark' : 'theme-light'];
			out.push({
				id: 'commands',
				label: 'Commands',
				items: suggested.map((id) => ACTIONS.find((a) => a.id === id)).filter(Boolean).map(commandItem)
			});
			return out;
		}

		if (!activeScope) {
			const scoredApps = apps
				.map((a) => ({
					a,
					s: bestScore(q, a.name, [a.subtitle, ...(a.tags || [])].filter(Boolean)) + Math.min(frecency[`app:${a.id}`] || 0, 10)
				}))
				// 45+ = substring or better; a letters-in-order match alone would
				// put a weak app above the web fallback that Enter should hit.
				.filter((x) => x.s >= 45)
				.sort((x, y) => y.s - x.s)
				.slice(0, 6);
			if (scoredApps.length) out.push({ id: 'apps', label: 'Apps', items: scoredApps.map((x) => appItem(x.a)) });

			const scoredCmds = ACTIONS
				.map((a) => ({ a, s: bestScore(q, a.label, a.keywords || []) }))
				.filter((x) => x.s >= 45)
				.sort((x, y) => y.s - x.s)
				.slice(0, 3);
			if (scoredCmds.length) out.push({ id: 'commands', label: 'Commands', items: scoredCmds.map((x) => commandItem(x.a)) });
		}

		// Results from connected apps, one section each. A result marked
		// `merge` (Seerr) stands for its title, so other providers' results for
		// the same TMDB id are dropped rather than shown twice. The media
		// server is the authority on what the user has: when it returned the
		// title, the merged row plays from there and offers no Request.
		const merged = new Set();
		const owned = new Map();
		for (const p of scopedProviders) {
			for (const r of providerResults[p.providerId]?.results || []) {
				if (!r.meta?.tmdb) continue;
				if (r.meta.merge) merged.add(r.meta.tmdb);
				else if (r.href && !owned.has(r.meta.tmdb)) owned.set(r.meta.tmdb, r.href);
			}
		}
		const fromMediaServer = (r) =>
			r.meta?.merge && owned.has(r.meta.tmdb)
				? { ...r, href: owned.get(r.meta.tmdb), openLabel: 'Play', action: undefined, meta: { ...r.meta, status: '', requested: false } }
				: r;
		const provSections = scopedProviders.map((p) => {
			const data = providerResults[p.providerId] || {};
			const results = (data.results || [])
				.filter((r) => r.meta?.merge || !merged.has(r.meta?.tmdb))
				.map(fromMediaServer);
			const kind = results[0]?.meta?.kind || 'other';
			const layout = kind === 'photo' ? 'grid' : kind === 'media' ? 'poster' : 'list';
			const max = layout === 'grid' ? 6 : layout === 'poster' ? 8 : 6;
			return {
				id: `p-${p.providerId}`,
				label: p.label,
				layout,
				kind,
				loading: !!data.loading && q.length >= 3,
				error: data.error || '',
				items: [...results.slice(0, max).map((r) => {
					const key = `r:${p.providerId}:${r.id}`;
					return {
						key,
						url: r.href,
						title: r.title,
						subtitle: r.subtitle,
						thumbnail: r.thumbnail,
						kind: r.meta?.kind,
						// A failed action reports here; success shows on the button.
						badge: (actionState[key]?.ok === false && actionState[key].message) || r.meta?.status || '',
						// A movie or show the user has: a play mark, and a click plays it.
						play: !!r.meta?.tmdb && (r.openLabel === 'Play' || !r.meta?.merge),
						request: resultAction(key, p, r),
						tags: r.tags,
						accessory: layout === 'list' ? p.integrationName : '',
						actions: resultActions(key, p, r)
					};
				}), ...(results.length > max && p.searchUrl ? [{
					key: `more:${p.providerId}`,
					title: `More in ${p.integrationName}`,
					more: true,
					url: p.searchUrl,
					svg: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
					actions: linkActions(`more:${p.providerId}`, p.searchUrl, true)
				}] : [])]
			};
		});
		provSections.sort((a, b) => (PROVIDER_KIND_ORDER[a.kind] ?? 99) - (PROVIDER_KIND_ORDER[b.kind] ?? 99));
		out.push(...provSections);

		// Fallbacks: always reachable, last in the list. Their icons are grey
		// so they don't pull the eye from the results above.
		if (q) {
			const fb = [];
			if (!activeScope) {
				for (const it of $integrationsStore.integrations) {
					if (!it.shortcut || !it.userState?.connected) continue;
					if (it.userState?.surfaces?.search === false) continue;
					if (!(it.availableSurfaces || []).includes('search')) continue;
					fb.push({
						key: `scope:${it.id}`,
						title: `Search ${it.name} for “${q}”`,
						subtitle: `!${it.shortcut}`,
						appIcon: it.icon ? resolveIcon(it.icon) : null,
						iconStyle: 'grayed',
						actions: [{ label: `Search ${it.name}`, run: () => { activeScope = it.id; inputEl?.focus(); } }]
					});
				}
			}
			if (searchConfig?.url) {
				const param = searchConfig.param || 'q';
				const url = `${searchConfig.url}${searchConfig.url.includes('?') ? '&' : '?'}${param}=${encodeURIComponent(q)}`;
				fb.unshift({
					key: 'web',
					title: `Search the web for “${q}”`,
					subtitle: searchConfig.name || 'Web',
					appIcon: searchConfig.icon ? resolveIcon(searchConfig.icon) : undefined,
					iconStyle: 'grayed',
					svg: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
					url,
					actions: linkActions('web', url, true)
				});
			}
			if (fb.length) out.push({ id: 'fallbacks', label: 'Use “' + (q.length > 24 ? q.slice(0, 24) + '…' : q) + '” with…', items: fb });
		}
		return out;
	});

	const flatItems = $derived(sections.flatMap((s) => s.items));
	let selectedKey = $state(null);
	let panelOpen = $state(false);
	let panelIndex = $state(0);
	let resultsEl = $state();

	// Keep a valid selection. Until the user arrows away, it tracks the top
	// row, so results that arrive late (and sort above the fallbacks) take it.
	let userMoved = false;
	$effect(() => {
		const keys = flatItems.map((i) => i.key);
		const cur = untrack(() => selectedKey);
		if (!userMoved || !keys.includes(cur)) selectedKey = keys[0] ?? null;
	});
	$effect(() => {
		query;
		panelOpen = false;
		userMoved = false;
	});

	function moveSelection(delta) {
		const keys = flatItems.map((i) => i.key);
		if (!keys.length) return;
		const i = keys.indexOf(selectedKey);
		selectedKey = keys[(i + delta + keys.length) % keys.length];
		userMoved = true;
	}

	function runItem(item, e) {
		if (!item) return;
		const mod = e && (e.metaKey || e.ctrlKey);
		// Mouse: Cmd/Ctrl-click and middle-click mean "new tab", as on a link.
		if (item.url && e && 'button' in e && (mod || e.button === 1)) {
			noteOpen(item.key);
			openUrl(item.url, true);
			finish();
			return;
		}
		const action = mod && item.actions[1] ? item.actions[1] : item.actions[0];
		action?.run();
	}

	const isPaletteOpen = $derived(inlineOpen);

	// Desktop landing page: the first keystroke anywhere starts a search.
	function typeAnywhere(e) {
		if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
		if (e.key.length !== 1 || e.key === ' ' || e.key === '/') return;
		const el = document.activeElement;
		if (el && el !== document.body && el.tagName !== 'A' && el.tagName !== 'BUTTON') return;
		if (document.querySelector('[aria-modal="true"]')) return;
		if (window.matchMedia('(pointer: coarse)').matches) return;
		e.preventDefault();
		query = e.key;
		inputEl?.focus();
		inlineOpen = true;
		handleInput();
	}

	onMount(() => {
		ensureIntegrationsLoaded();
		recomputeResultsMaxHeight();
		const onResize = () => recomputeResultsMaxHeight();
		window.addEventListener('resize', onResize);

		// ?q= deep link (browser search engine / OpenSearch): open the
		// launcher pre-filled, then drop the parameter from the address bar.
		const params = new URLSearchParams(window.location.search);
		const q0 = params.get('q');
		if (q0) {
			query = q0;
			inlineOpen = true;
			inputEl?.focus();
			params.delete('q');
			const rest = params.toString();
			history.replaceState(history.state, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash);
		}

		function onClickOutside(e) {
			if (inlineOpen && containerEl && !containerEl.contains(e.target)) {
				inlineOpen = false;
				panelOpen = false;
			}
		}
		function onKeydown(e) {
			// ⌘K / Ctrl+K — open search from anywhere; inside the open
			// launcher it toggles the action panel instead.
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
				e.preventDefault();
				if (inlineOpen && document.activeElement === inputEl && selectedKey) {
					panelOpen = !panelOpen;
					return;
				}
				inputEl?.focus();
				inputEl?.select();
				inlineOpen = true;
				return;
			}
			if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) && !document.activeElement.isContentEditable) {
				e.preventDefault();
				inputEl?.focus();
				return;
			}
			typeAnywhere(e);
		}
		document.addEventListener('keydown', onKeydown);
		document.addEventListener('mousedown', onClickOutside);

		// iOS has no interactive-widget support yet: lift the bottom-docked
		// search above the on-screen keyboard by the part of the layout
		// viewport the keyboard covers.
		const vv = window.visualViewport;
		const onViewport = () => {
			const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
			document.documentElement.style.setProperty('--kb-inset', `${covered}px`);
		};
		vv?.addEventListener('resize', onViewport);
		vv?.addEventListener('scroll', onViewport);

		return () => {
			document.removeEventListener('keydown', onKeydown);
			document.removeEventListener('mousedown', onClickOutside);
			window.removeEventListener('resize', onResize);
			vv?.removeEventListener('resize', onViewport);
			vv?.removeEventListener('scroll', onViewport);
		};
	});

	// Recompute when the palette opens (the bar may have raised on focus, so
	// its bottom edge changed) and when the scope chip appears/disappears.
	$effect(() => {
		if (inlineOpen) requestAnimationFrame(recomputeResultsMaxHeight);
	});

	function handleSubmit(e) {
		// Enter is handled in the keydown below; a submit only gets here with
		// nothing to run (no results yet), and then it is a web search.
		if (!query.trim()) e.preventDefault();
	}

	function handleFocus() {
		ensureIntegrationsLoaded();
		inlineOpen = true;
	}

	function handleInputKeydown(e) {
		if (resultsEl?.panelKey(e)) return;

		// Escape steps back one level: action panel, query, scope, then close.
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			if (panelOpen) panelOpen = false;
			else if (query) query = '';
			else if (activeScope) activeScope = null;
			else { inlineOpen = false; inputEl?.blur(); }
			return;
		}
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			inlineOpen = true;
			moveSelection(e.key === 'ArrowDown' ? 1 : -1);
			return;
		}
		// Backspace at empty input with a chip → clear the scope and put "!" back in the input
		if (e.key === 'Backspace' && activeScope && query === '' && inputEl?.selectionStart === 0) {
			e.preventDefault();
			activeScope = null;
			query = '!';
			requestAnimationFrame(() => inputEl?.setSelectionRange(1, 1));
			return;
		}
		// ⌘⇧C copies the selected item's link.
		if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
			const item = flatItems.find((i) => i.key === selectedKey);
			const copy = item?.actions.find((a) => a.label === 'Copy link');
			if (copy) { e.preventDefault(); copy.run(); }
			return;
		}
		if (e.key === 'Enter') {
			// A typed scope shortcut ("!photos") becomes a scope chip.
			const s = (query || '').trimStart();
			const m = !activeScope && s.match(/^!([a-zA-Z0-9_-]+)$/);
			if (m && shortcutMap.get(m[1].toLowerCase()) && !matchedActions.length) {
				e.preventDefault();
				activeScope = shortcutMap.get(m[1].toLowerCase());
				query = '';
				return;
			}
			const item = flatItems.find((i) => i.key === selectedKey);
			if (item) {
				e.preventDefault();
				runItem(item, e);
			}
		}
	}

	// Auto-execute a no-arg action as soon as the bang is fully typed (no space needed),
	// provided no other bang could still extend this prefix (e.g. `!set` vs `!settings`).
	// Returns true when an action ran (and runAction has already cleared state),
	// so callers can skip any "reopen the palette" work that would otherwise
	// undo the blur/close (e.g. the search-active body dim staying on for !wall).
	function maybeAutoExecAction() {
		if (activeScope) return false;
		const s = (query || '').trimStart();
		const m = s.match(/^!([a-zA-Z0-9_-]+)\s*$/);
		if (!m) return false;
		const bang = m[1].toLowerCase();
		const hits = ACTIONS.filter((a) => a.bang === bang);
		if (!(hits.length === 1 && !hits[0].arg && !hits[0].manual)) return false;
		// Collision check — if another bang is a proper extension of this one, wait.
		const hasLongerBang = ACTIONS.some((a) => a.bang !== bang && a.bang.startsWith(bang));
		if (hasLongerBang) return false;
		runAction(hits[0]);
		return true;
	}

	function handleInput() {
		maybePromoteScope();
		if (maybeAutoExecAction()) return;
		inlineOpen = true;
	}

	// Toggle a body class while the search palette is open so the rest of
	// the dashboard can dim/blur via CSS without fighting stacking contexts.
	// Ancestors of the search bar use `transform` (fade-in-up animation),
	// which creates a containing block and breaks `position: fixed` overlays
	// placed inside the component tree — hence the body-level class.
	$effect(() => {
		if (typeof document === 'undefined') return;
		if (inlineOpen) document.body.classList.add('search-active');
		else document.body.classList.remove('search-active');
		return () => document.body.classList.remove('search-active');
	});

	const listId = 'launcher-list';
	const emptyText = $derived(
		(query || '').trim().startsWith('!') && !activeScope ? 'No command or scope by that name. Type ! on its own to see them all.' : ''
	);
</script>

<!-- Close when keyboard focus leaves the palette (Tab-out); click-outside is
     handled by onClickOutside. A null relatedTarget is a click on a
     non-focusable spot, which may be inside the panel, so it's ignored. -->
<div class="relative hero-search {isPaletteOpen ? 'is-open' : ''}" bind:this={containerEl} style="--results-max-h: {resultsMaxHeight}px"
	onfocusout={(e) => { if (inlineOpen && e.relatedTarget && !containerEl.contains(e.relatedTarget)) { inlineOpen = false; panelOpen = false; } }}>
	<form
		class="hero-search-form flex items-center px-4 md:px-6"
		action={searchConfig.url}
		method="GET"
		target="_blank"
		role="search"
		onsubmit={handleSubmit}
	>
		<svg class="text-content-dim shrink-0 w-4 h-4 md:w-5 md:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>

		{#if activeIntegration}
			<span class="scope-chip flex items-center gap-1 shrink-0 ml-2 text-[0.7rem] font-mono px-2 py-1 rounded-lg border">
				{activeIntegration.name}
				<button
					type="button"
					class="scope-chip-clear bg-transparent border-none cursor-pointer leading-none p-0 ml-0.5"
					onclick={() => { activeScope = null; inputEl?.focus(); }}
					aria-label="Clear scope"
				>&times;</button>
			</span>
		{/if}

		<input
			bind:this={inputEl}
			bind:value={query}
			type="text"
			name={searchConfig.param || 'q'}
			class="hero-search-input w-full h-[48px] md:h-[52px] bg-transparent border-none px-3 md:px-4 outline-none font-mono"
			placeholder={activeIntegration ? `Search in ${activeIntegration.name}…` : placeholderText}
			autocomplete="off"
			autocapitalize="off"
			spellcheck="false"
			enterkeyhint="go"
			role="combobox"
			aria-label="Search apps, files and commands"
			aria-expanded={isPaletteOpen}
			aria-controls={listId}
			aria-autocomplete="list"
			aria-activedescendant={isPaletteOpen && selectedKey ? (panelOpen ? `${listId}-action-${panelIndex}` : `${listId}-${selectedKey}`) : undefined}
			onfocus={handleFocus}
			oninput={handleInput}
			onkeydown={handleInputKeydown}
		/>

		{#if query}
			<button type="button" class="clear-btn text-sm md:text-base bg-transparent border-none cursor-pointer px-1" aria-label="Clear search" onclick={() => { query = ''; inputEl?.focus(); }}>&times;</button>
		{:else}
			<kbd class="hero-search-kbd hidden md:inline-flex items-center gap-0.5 text-[0.7rem] py-1 px-2 rounded border font-mono shrink-0">{#if macKeys}<svg class="kbd-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Command"><path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3Z"/></svg>{:else}Ctrl&nbsp;{/if}K</kbd>
		{/if}
	</form>

	{#if isPaletteOpen}
		<SearchResults
			bind:this={resultsEl}
			{sections}
			{selectedKey}
			{panelOpen}
			bind:panelIndex
			{listId}
			{emptyText}
			onselect={(k) => { selectedKey = k; userMoved = true; }}
			onrun={runItem}
			onaction={(item, action) => { panelOpen = false; action.run(); }}
			onpanel={() => { panelOpen = !panelOpen; inputEl?.focus(); }}
		/>
	{/if}
</div>
