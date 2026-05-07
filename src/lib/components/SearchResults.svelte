<script>
	import AppIcon from './AppIcon.svelte';
	import { resolveIcon } from '$lib/apps.js';

	let {
		apps = [],
		providers = [],
		providerResults = {},
		query = '',
		searchConfig = {},
		tips = [],
		actions = [],
		onclose = () => {},
		ontip = () => {},
		onaction = () => {}
	} = $props();

	// ── App matches ──────────────────────────────────────────
	const matchedApps = $derived.by(() => {
		const q = (query || '').trim().toLowerCase();
		if (!q || !apps.length) return [];
		return apps.filter(app => app.name.toLowerCase().includes(q)).slice(0, 5);
	});

	// ── Integration sections ─────────────────────────────────
	// Sort order: document → file → photo (photos last since they get the grid)
	const KIND_ORDER = { document: 0, file: 1, card: 2, bookmark: 3, photo: 4 };

	const sections = $derived.by(() => {
		const raw = providers.map((p) => {
			const data = providerResults[p.providerId] || {};
			const results = data.results || [];
			const kind = results[0]?.meta?.kind || 'other';
			return {
				provider: p,
				loading: !!data.loading,
				error: data.error || '',
				results,
				photoMode: kind === 'photo',
				kind
			};
		});
		return raw.sort((a, b) => (KIND_ORDER[a.kind] ?? 99) - (KIND_ORDER[b.kind] ?? 99));
	});

	// ── Web search URL ───────────────────────────────────────
	const webHref = $derived.by(() => {
		const url = searchConfig?.url;
		const param = searchConfig?.param || 'q';
		if (!url) return '';
		return `${url}${url.includes('?') ? '&' : '?'}${param}=${encodeURIComponent(query)}`;
	});

	// ── Photo row config ─────────────────────────────────────
	const MAX_PHOTO_TILES = 5;

	// ── Thumbnail error handling ─────────────────────────────
	// Replace broken thumbnail with a kind-appropriate SVG icon
	const KIND_ICONS = {
		document: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
		file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
		card: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 7h8"/><path d="M8 11h4"/>',
		bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
		photo: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>'
	};

	function showFallbackIcon(e, kind) {
		const svg = KIND_ICONS[kind] || KIND_ICONS.file;
		const parent = e.target.parentElement;
		e.target.remove();
		const el = document.createElement('div');
		el.className = 'w-8 h-8 rounded bg-surface-card-strong flex items-center justify-center shrink-0';
		el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-content-dim">${svg}</svg>`;
		parent.prepend(el);
	}
</script>

<div class="hero-search-results absolute left-0 right-0 top-full mt-1 bg-surface-modal backdrop-blur-xl border border-border-card rounded-xl overflow-hidden z-20 shadow-theme overflow-y-auto" style="max-height: var(--results-max-h, 60vh)">

	<!-- ═══ ACTIONS SECTION ═══ -->
	{#if actions.length > 0}
		<div class="px-4 pt-2.5 pb-1">
			<span class="text-[0.55rem] font-bold uppercase tracking-[0.2em] text-content-dim">Actions</span>
		</div>
		<div class="flex flex-col gap-0.5 px-1.5 pb-1.5">
			{#each actions as action (action.id)}
				<button
					type="button"
					class="group flex items-center gap-3 px-3 py-2 rounded-lg bg-transparent border-none text-left cursor-pointer hover:bg-surface-card-hover focus:bg-surface-card-hover focus:outline-none transition-colors"
					data-nav-item
					onclick={() => onaction(action)}
				>
					<div class="w-6 h-6 rounded-[22%] flex items-center justify-center bg-surface-card-strong shrink-0">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 text-content-dim">{@html action.icon}</svg>
					</div>
					<span class="text-[0.8rem] text-content-muted group-hover:text-content transition-colors flex-1">{action.label}</span>
					<kbd class="text-content-muted text-[0.55rem] bg-surface-card-strong py-0.5 px-1.5 rounded border border-border-card font-mono shrink-0">↵</kbd>
				</button>
			{/each}
		</div>
	{/if}

	<!-- ═══ APPS SECTION ═══ -->
	{#if matchedApps.length > 0}
		<div class="px-4 pt-2.5 pb-1">
			<span class="text-[0.55rem] font-bold uppercase tracking-[0.2em] text-content-dim">Apps</span>
		</div>
		<div class="flex flex-col gap-0.5 px-1.5 pb-1.5">
			{#each matchedApps as app (app.id)}
				<a
					href={app.url}
					target="_blank"
					rel="noopener noreferrer"
					class="group flex items-center gap-3 px-3 py-2 rounded-lg no-underline hover:bg-surface-card-hover focus:bg-surface-card-hover focus:outline-none transition-colors"
					data-nav-item
					onclick={onclose}
				>
					<AppIcon icon={app.icon} name={app.name} size="w-3.5 h-3.5" wrapSize="w-6 h-6" iconStyle="colored" wrap />
					<span class="text-[0.8rem] text-content-muted group-hover:text-content transition-colors">{app.name}</span>
					<span class="ml-auto text-[0.55rem] text-content-dim/40 shrink-0">&nearr;</span>
				</a>
			{/each}
		</div>
	{/if}

	<!-- ═══ INTEGRATION SECTIONS: documents → files → photos ═══ -->
	{#each sections as section (section.provider.providerId)}
		{#if section.loading || section.error || section.results.length > 0}
			<div>
				<div class="px-4 pt-2.5 pb-1 flex items-center gap-2">
					<span class="text-[0.55rem] font-bold uppercase tracking-[0.2em] text-content-dim">{section.provider.label}</span>
					{#if section.loading}
						<span class="text-[0.5rem] text-content-dim font-mono">searching…</span>
					{/if}
				</div>

				{#if section.error}
					<div class="px-4 pb-2.5 text-[0.7rem] text-red-300 font-mono">{section.error}</div>
				{:else if section.loading}
					<!-- Label already shows "searching…" -->
				{:else if section.photoMode}
					{@const visiblePhotos = section.results.slice(0, MAX_PHOTO_TILES - 1)}
					{@const remaining = section.results.length - visiblePhotos.length}
					{@const moreHref = section.provider.searchUrl ? `${section.provider.searchUrl}/search?q=${encodeURIComponent(query)}&type=smart-search` : null}
					<div class="flex gap-1.5 px-3 pb-2.5 overflow-hidden">
						{#each visiblePhotos as item (item.id)}
							<a
								href={item.href}
								target="_blank"
								rel="noopener noreferrer"
								class="relative w-[100px] h-[100px] shrink-0 rounded-lg overflow-hidden bg-surface-card-strong group focus:ring-2 focus:ring-border-pill focus:outline-none"
								title={item.title}
								data-nav-item
								onclick={onclose}
							>
								{#if item.thumbnail}
									<img
										src={item.thumbnail}
										alt={item.title}
										loading="lazy"
										class="absolute inset-0 w-full h-full object-cover"
										referrerpolicy="no-referrer"
										onerror={(e) => showFallbackIcon(e, 'photo')}
									/>
								{/if}
								<div class="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors"></div>
							</a>
						{/each}

						{#if remaining > 0}
							<a
								href={moreHref || section.results[0]?.href || '#'}
								target="_blank"
								rel="noopener noreferrer"
								class="relative w-[100px] h-[100px] shrink-0 rounded-lg overflow-hidden bg-surface-card-strong group focus:ring-2 focus:ring-border-pill focus:outline-none"
								data-nav-item
								onclick={onclose}
							>
								{#if section.results[MAX_PHOTO_TILES - 1]?.thumbnail}
									<img
										src={section.results[MAX_PHOTO_TILES - 1].thumbnail}
										alt="More results"
										loading="lazy"
										class="absolute inset-0 w-full h-full object-cover"
										referrerpolicy="no-referrer"
										onerror={(e) => showFallbackIcon(e, 'photo')}
									/>
								{/if}
								<div class="absolute inset-0 bg-black/60 flex items-center justify-center">
									<span class="text-white text-[0.8rem] font-mono font-semibold">+{remaining} more</span>
								</div>
							</a>
						{/if}
					</div>
				{:else}
					<!-- Generic list results (documents, files, cards) -->
					{@const sectionIcon = section.provider.integrationIcon ? resolveIcon(section.provider.integrationIcon) : null}
					<div class="flex flex-col gap-0.5 px-1.5 pb-1.5">
						{#each section.results.slice(0, 6) as item (item.id)}
							<a
								href={item.href}
								target="_blank"
								rel="noopener noreferrer"
								class="group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-card-hover focus:bg-surface-card-hover focus:outline-none transition-colors no-underline"
								data-nav-item
								onclick={onclose}
							>
								{#if item.thumbnail}
									<img
										src={item.thumbnail}
										alt=""
										loading="lazy"
										class="w-8 h-8 rounded object-cover shrink-0"
										referrerpolicy="no-referrer"
										onerror={(e) => showFallbackIcon(e, item.meta?.kind)}
									/>
								{:else if sectionIcon}
									<AppIcon icon={sectionIcon} name={section.provider.integrationName} size="w-3.5 h-3.5" wrapSize="w-6 h-6" iconStyle="colored" wrap />
								{:else}
									<div class="w-8 h-8 rounded bg-surface-card-strong flex items-center justify-center shrink-0">
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-content-dim">{@html KIND_ICONS[item.meta?.kind] || KIND_ICONS.file}</svg>
									</div>
								{/if}
								<div class="flex flex-col min-w-0 flex-1">
									<span class="text-[0.8rem] text-content-muted group-hover:text-content transition-colors truncate">{item.title}</span>
									{#if item.subtitle}
										<span class="text-[0.65rem] text-content-dim truncate">{item.subtitle}</span>
									{/if}
								</div>
								{#if item.tags?.length}
									<div class="hidden md:flex items-center gap-1 shrink-0 max-w-[40%] overflow-hidden">
										{#each item.tags.slice(0, 3) as tag}
											<span class="text-[0.55rem] font-mono px-1.5 py-0.5 rounded border border-border-card text-content-dim bg-surface-card-strong/60 whitespace-nowrap">{tag}</span>
										{/each}
									</div>
								{/if}
							</a>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	{/each}

	<!-- ═══ SUGGESTIONS (last) ═══ -->
	{#if webHref}
		<div>
			<div class="px-4 pt-2.5 pb-1">
				<span class="text-[0.55rem] font-bold uppercase tracking-[0.2em] text-content-dim">Suggestions</span>
			</div>
			<div class="px-1.5 pb-1.5">
				<a
					href={webHref}
					target="_blank"
					rel="noopener noreferrer"
					class="group flex items-center gap-3 px-3 py-2 rounded-lg no-underline hover:bg-surface-card-hover focus:bg-surface-card-hover focus:outline-none transition-colors"
					data-nav-item
					onclick={onclose}
				>
					{#if searchConfig?.icon}
						{@const ico = resolveIcon(searchConfig.icon)}
						<AppIcon icon={ico} name={searchConfig?.name || 'Search'} size="w-3.5 h-3.5" wrapSize="w-6 h-6" iconStyle="colored" wrap />
					{:else}
						<div class="w-6 h-6 rounded-[22%] flex items-center justify-center bg-surface-card-strong shrink-0">
							<svg class="w-3.5 h-3.5 text-content-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
						</div>
					{/if}
					<div class="flex flex-col min-w-0">
						<span class="text-[0.8rem] text-content-muted group-hover:text-content transition-colors">Search for "{query}"</span>
						<span class="text-[0.65rem] text-content-dim truncate">{searchConfig?.name || 'Web'}</span>
					</div>
					<kbd class="ml-auto text-content-muted text-[0.55rem] bg-surface-card-strong py-0.5 px-1.5 rounded border border-border-card font-mono shrink-0">↵</kbd>
				</a>
			</div>
		</div>
	{/if}

	{#if tips.length > 0}
		<div class="border-t border-border-card px-4 py-2 flex items-center gap-2 flex-wrap text-[0.6rem] font-mono text-content-dim">
			<span class="uppercase tracking-[0.15em] text-[0.55rem] mr-1">Tips</span>
			{#each tips as t (t.kind + ':' + t.id)}
				<button
					type="button"
					class="inline-flex items-center gap-1 bg-transparent border-none text-content-dim hover:text-content cursor-pointer p-0"
					onclick={() => ontip(t)}
				>
					<kbd class="bg-surface-card-strong py-0.5 px-1.5 rounded border border-border-card">!{t.bang}</kbd>
					<span>{t.label}</span>
				</button>
			{/each}
		</div>
	{/if}
</div>
