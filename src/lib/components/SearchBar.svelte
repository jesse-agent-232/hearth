<script>
	import { onMount, getContext } from 'svelte';
	import { integrations as integrationsStore } from '$lib/stores/integrations.js';
	import { prefs } from '$lib/stores/prefs.js';
	import { TOTAL_WALLPAPERS } from '$lib/wallpaper.js';
	import SearchResults from './SearchResults.svelte';

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

	const scopedProviders = $derived(
		activeScope
			? inlineProviders.filter((p) => p.integrationId === activeScope)
			: inlineProviders
	);

	const activeIntegration = $derived(
		activeScope ? $integrationsStore.integrations.find((it) => it.id === activeScope) : null
	);

	const integrationTips = $derived(
		$integrationsStore.integrations
			.filter((it) => it.shortcut && it.userState?.connected)
			.map((it) => ({ kind: 'scope', id: it.id, bang: it.shortcut, label: it.name }))
	);

	// Static action tips (kept in sync with ACTIONS below; bang only, one entry per bang)
	const actionTips = [
		{ kind: 'action', id: 'settings', bang: 'settings', label: 'Configure' },
		{ kind: 'action', id: 'theme', bang: 'theme', label: 'Theme' },
		{ kind: 'action', id: 'icon', bang: 'icon', label: 'Icon style' },
		{ kind: 'action', id: 'wall', bang: 'wall', label: 'Wallpaper' },
		{ kind: 'action', id: 'logout', bang: 'logout', label: 'Log out' }
	];

	const allTips = $derived([...integrationTips, ...actionTips]);

	// Rotate tips 2 at a time so the footer stays uncluttered
	let tipIndex = $state(0);
	const visibleTips = $derived.by(() => {
		const list = allTips;
		if (list.length <= 2) return list;
		const a = tipIndex % list.length;
		const b = (tipIndex + 1) % list.length;
		return [list[a], list[b]];
	});

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
		{ id: 'settings', bang: 'settings', label: 'Open Configure', icon: ICONS.settings, exec: () => onSettingsOpen() },
		{ id: 'logout', bang: 'logout', label: 'Log out', icon: ICONS.logout, exec: () => { window.location.href = '/auth/logout'; } },
		{
			id: 'wall', bang: 'wall', label: 'Pick a random wallpaper', icon: ICONS.wall,
			exec: () => {
				const next = Math.floor(Math.random() * TOTAL_WALLPAPERS) + 1;
				prefs.update((p) => ({ ...p, wallpaperId: next, wallpaperEnabled: true }));
			}
		},
		...['dark', 'light', 'auto'].map((t) => ({
			id: `theme-${t}`, bang: 'theme', arg: t, label: `Theme: ${t[0].toUpperCase()}${t.slice(1)}`, icon: ICONS.theme,
			exec: () => prefs.update((p) => ({ ...p, theme: t }))
		})),
		...['colored', 'white', 'grayed'].map((s) => ({
			id: `icon-${s}`, bang: 'icon', arg: s, label: `Icon style: ${s[0].toUpperCase()}${s.slice(1)}`, icon: ICONS.icon,
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
		return hits.filter((a) => !a.arg || a.arg.includes(argFilter));
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
	// True when the results panel is actually being shown — gates the
	// "joined surface" Raycast-style styling on the container.
	const isPaletteOpen = $derived(inlineOpen && !!(query.trim() || activeScope));
	let debounceTimer = null;
	let lastDispatched = '';

	// ── Rotating typed placeholder ────────────────────────────────
	// Cycles through hints so the placeholder advertises what the palette
	// can do (bangs, actions, shortcuts) without a static wall of text.
	// Pauses while the user is focused, typing, or scoped — those are
	// states where a moving placeholder would distract.
	const PLACEHOLDER_HINTS = [
		'Search apps, files, photos…',
		'Try !nc to scope Nextcloud',
		'Type !settings to configure',
		'Press / anywhere to focus'
	];
	let placeholderText = $state(PLACEHOLDER_HINTS[0]);

	$effect(() => {
		if (typeof document === 'undefined') return;
		if (inlineOpen || query || activeScope) return;
		let hintIndex = 0;
		let charIndex = PLACEHOLDER_HINTS[0].length;
		let phase = 'holding';
		let timeout;
		placeholderText = PLACEHOLDER_HINTS[0];

		const step = () => {
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

	function closeInline() {
		inlineOpen = false;
	}

	async function fireOneProvider(provider, q) {
		providerResults = {
			...providerResults,
			[provider.providerId]: { ...(providerResults[provider.providerId] || {}), loading: true, error: '' }
		};
		try {
			const res = await fetch('/api/search', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ provider: provider.providerId, query: q, limit: 24 })
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
			if (lastDispatched !== q) return;
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
		clearTimeout(debounceTimer);
		const trimmed = (q || '').trim();
		if (trimmed.length < MIN_REMOTE_QUERY_LENGTH) {
			providerResults = {};
			return;
		}
		debounceTimer = setTimeout(() => {
			lastDispatched = trimmed;
			for (const provider of providers) {
				fireOneProvider(provider, trimmed);
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
			providerResults = {};
		}
	});

	// Close on click outside
	onMount(() => {
		ensureIntegrationsLoaded();
		recomputeResultsMaxHeight();
		const onResize = () => recomputeResultsMaxHeight();
		window.addEventListener('resize', onResize);

		const tipRotator = setInterval(() => {
			if (allTips.length > 2) tipIndex += 2;
		}, 3500);

		function onClickOutside(e) {
			if (inlineOpen && containerEl && !containerEl.contains(e.target)) {
				inlineOpen = false;
			}
		}
		function onKeydown(e) {
			// ⌘K / Ctrl+K — open search from anywhere (industry standard)
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
				e.preventDefault();
				inputEl?.focus();
				inputEl?.select();
				return;
			}
			if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
				e.preventDefault();
				inputEl?.focus();
				return;
			}
			if (e.key === 'Escape' && document.activeElement === inputEl) {
				query = '';
				activeScope = null;
				inlineOpen = false;
				inputEl.blur();
				return;
			}
			// Arrow navigation when dropdown is open and focus is in the container
			if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && inlineOpen && containerEl?.contains(document.activeElement)) {
				const items = Array.from(containerEl.querySelectorAll('[data-nav-item]'));
				if (!items.length) return;
				const current = document.activeElement;
				const idx = items.indexOf(current);
				e.preventDefault();
				if (e.key === 'ArrowDown') {
					const next = idx < 0 ? items[0] : items[Math.min(idx + 1, items.length - 1)];
					next?.focus();
				} else {
					// ArrowUp from first result returns to the input
					if (idx <= 0) inputEl?.focus();
					else items[idx - 1]?.focus();
				}
			}
			// Escape from a focused result returns to input
			if (e.key === 'Escape' && containerEl?.contains(document.activeElement) && document.activeElement !== inputEl) {
				e.preventDefault();
				inputEl?.focus();
			}
		}
		document.addEventListener('keydown', onKeydown);
		document.addEventListener('mousedown', onClickOutside);
		return () => {
			document.removeEventListener('keydown', onKeydown);
			document.removeEventListener('mousedown', onClickOutside);
			window.removeEventListener('resize', onResize);
			clearInterval(tipRotator);
		};
	});

	// Recompute when the palette opens (the bar may have raised on focus, so
	// its bottom edge changed) and when the scope chip appears/disappears.
	$effect(() => {
		if (inlineOpen) requestAnimationFrame(recomputeResultsMaxHeight);
	});

	function handleSubmit(e) {
		// Enter key on the form → web search in a new tab. Behavior preserved
		// from pre-integrations Hearth: empty query is a no-op, otherwise the
		// browser does a normal form submit to the configured search URL.
		if (!query.trim()) e.preventDefault();
	}

	function handleFocus() {
		ensureIntegrationsLoaded();
		inlineOpen = true;
	}

	function handleInputKeydown(e) {
		// Escape — clear scope/query and dismiss the palette. Handled here on
		// the input directly (rather than relying on the document-level listener)
		// so it can't be missed by event-bubbling quirks or activeElement checks.
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			query = '';
			activeScope = null;
			inlineOpen = false;
			inputEl?.blur();
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
		// Enter — commit a pending bang as a scope, OR run action if unambiguous (exactly one match)
		if (e.key === 'Enter' && !activeScope) {
			if (matchedActions.length === 1) {
				e.preventDefault();
				runAction(matchedActions[0]);
				return;
			}
			if (matchedActions.length > 1) {
				// Multiple matches — don't auto-pick; let user arrow-down and choose
				e.preventDefault();
				const first = containerEl?.querySelector('[data-nav-item]');
				first?.focus();
				return;
			}
			const s = (query || '').trimStart();
			const m = s.match(/^!([a-zA-Z0-9_-]+)$/);
			if (m && shortcutMap.get(m[1].toLowerCase())) {
				e.preventDefault();
				activeScope = shortcutMap.get(m[1].toLowerCase());
				query = '';
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
		if (!(hits.length === 1 && !hits[0].arg)) return false;
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
</script>

<div class="relative hero-search {isPaletteOpen ? 'is-open' : ''}" bind:this={containerEl} style="--results-max-h: {resultsMaxHeight}px">
	<form
		class="hero-search-form flex items-center px-5 md:px-7"
		action={searchConfig.url}
		method="GET"
		target="_blank"
		onsubmit={handleSubmit}
	>
		<svg class="text-content-dim shrink-0 w-4 h-4 md:w-5 md:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>

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
			class="w-full h-[44px] md:h-[52px] bg-transparent border-none text-[0.85rem] md:text-[0.95rem] px-3 md:px-4 outline-none font-mono"
			placeholder={activeIntegration ? `Search in ${activeIntegration.name}...` : placeholderText}
			autocomplete="off"
			onfocus={handleFocus}
			oninput={handleInput}
			onkeydown={handleInputKeydown}
		/>

		{#if query}
			<button type="button" class="clear-btn text-sm md:text-base bg-transparent border-none cursor-pointer px-1" onclick={() => { query = ''; inputEl?.focus(); }}>&times;</button>
		{:else}
			<kbd class="hero-search-kbd text-[0.6rem] md:text-[0.7rem] py-0.5 px-1.5 md:py-1 md:px-2 rounded border font-mono shrink-0">/</kbd>
		{/if}
	</form>

	{#if inlineOpen && (query.trim() || activeScope)}
		{@const bangMode = query.trimStart().startsWith('!') || !!activeScope || matchedActions.length > 0}
		<SearchResults
			apps={bangMode ? [] : apps}
			providers={matchedActions.length ? [] : scopedProviders}
			providerResults={providerResults}
			{query}
			searchConfig={bangMode ? {} : searchConfig}
			tips={activeScope || matchedActions.length ? [] : visibleTips}
			actions={matchedActions}
			onaction={runAction}
			onclose={closeInline}
			ontip={(tip) => {
				if (tip.kind === 'scope') {
					activeScope = tip.id;
					query = '';
				} else {
					query = `!${tip.bang} `;
				}
				inputEl?.focus();
			}}
		/>
	{/if}
</div>
