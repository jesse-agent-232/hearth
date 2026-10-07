<script>
	import AppIcon from './AppIcon.svelte';
	import Keys from './Keys.svelte';

	// Raycast-style result list. SearchBar owns the data, the selection and
	// the keyboard; this only renders. Focus never leaves the input: the
	// selected row is announced through aria-activedescendant.
	//
	// sections: [{ id, label, layout: 'list'|'grid'|'poster', loading, error, items }]
	// item:     { key, title, subtitle?, accessory?, appIcon?, svg?, thumbnail?, kind?, badge?, play?,
	//             iconStyle?, play?: { run }, request?: { label, busy, run }, actions: [{ label, hint?, run }] }
	let {
		sections = [],
		selectedKey = null,
		panelOpen = false,
		panelIndex = $bindable(0),
		listId = 'launcher-list',
		emptyText = '',
		detail = null,
		ondetailclose = () => {},
		onselect = () => {},
		onrun = () => {},
		onaction = () => {},
		onpanel = () => {}
	} = $props();

	const flat = $derived(sections.flatMap((s) => s.items));
	const selected = $derived(flat.find((i) => i.key === selectedKey) || null);
	$effect(() => {
		if (panelOpen) panelIndex = 0;
	});

	export function panelKey(e) {
		if (!panelOpen || !selected) return false;
		const n = selected.actions.length;
		if (e.key === 'ArrowDown') panelIndex = (panelIndex + 1) % n;
		else if (e.key === 'ArrowUp') panelIndex = (panelIndex - 1 + n) % n;
		else if (e.key === 'Enter') onaction(selected, selected.actions[panelIndex]);
		else return false;
		e.preventDefault();
		return true;
	}

	const KIND_ICONS = {
		document: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/>',
		file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
		card: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 7h8"/><path d="M8 11h4"/>',
		bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
		photo: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
		media: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="m10 8 6 4-6 4Z"/>'
	};

	function thumbFailed(e) {
		e.currentTarget.classList.remove('is-loading');
		e.currentTarget.style.display = 'none';
	}

	// Thumbnails start hidden behind a shimmer and fade in once decoded. A
	// cached image can finish before the handler is attached, so check
	// `complete` on mount too.
	function thumbLoading(node) {
		const done = () => node.classList.remove('is-loading');
		if (node.complete && node.naturalWidth) done();
		else node.addEventListener('load', done, { once: true });
	}

	function scrollIntoView(node, isSelected) {
		const run = (sel) => { if (sel) node.scrollIntoView({ block: 'nearest' }); };
		run(isSelected);
		return { update: run };
	}
</script>

<div class="launcher-panel hero-search-results">
	{#if detail}
		<!-- Detail view: one title, Spotlight-style, in place of the list. -->
		<div class="launcher-scroll launcher-detail" role="region" aria-label="Details for {detail.title}">
			<div class="launcher-detail-hero" class:is-empty={!detail.loading && !detail.data?.backdrop}>
				{#if detail.data?.backdrop}
					<img class="launcher-detail-backdrop is-loading" use:thumbLoading src={detail.data.backdrop} alt="" referrerpolicy="no-referrer" onerror={thumbFailed} />
				{/if}
				<button type="button" class="launcher-detail-back" onmousedown={(e) => e.preventDefault()} onclick={ondetailclose}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
					Results
				</button>
			</div>
			<div class="launcher-detail-body">
				<div class="launcher-detail-poster launcher-thumb-wrap">
					{#if detail.thumbnail}
						<img class="is-loading" use:thumbLoading src={detail.thumbnail} alt="" referrerpolicy="no-referrer" onerror={thumbFailed} />
					{/if}
					<svg class="launcher-thumb-fallback" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">{@html KIND_ICONS.media}</svg>
				</div>
				<div class="launcher-detail-info">
					<h3 class="launcher-detail-title">{detail.title}</h3>
					{#if detail.data}
						<div class="launcher-detail-facts">
							{#each detail.data.facts || [] as fact}<span>{fact}</span>{/each}
							{#if detail.data.rating}
								<span class="launcher-detail-rating">
									<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>
									{detail.data.rating}
								</span>
							{/if}
						</div>
						{#if detail.data.genres?.length}
							<div class="launcher-tags">{#each detail.data.genres as g}<span class="launcher-tag">{g}</span>{/each}</div>
						{/if}
					{:else if detail.r?.subtitle}
						<div class="launcher-detail-facts"><span>{detail.r.subtitle}</span></div>
					{/if}
					<div class="launcher-detail-buttons">
						{#if detail.request}
							<button
								type="button"
								class="launcher-detail-btn is-primary"
								class:is-done={detail.request.done}
								disabled={detail.request.busy || detail.request.done}
								onmousedown={(e) => e.preventDefault()}
								onclick={() => detail.request.run?.()}
							>
								{#if detail.request.done}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>{/if}
								{detail.request.busy ? `${detail.request.label}…` : detail.request.label}
							</button>
						{/if}
						{#if detail.open}
							<button type="button" class="launcher-detail-btn" class:is-primary={!detail.request} onmousedown={(e) => e.preventDefault()} onclick={detail.open.run}>
								{#if detail.open.label === 'Play'}<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/></svg>{/if}
								{detail.open.label}
							</button>
						{/if}
					</div>
					{#if detail.badge}<div class="launcher-error launcher-detail-error">{detail.badge}</div>{/if}
				</div>
			</div>
			{#if detail.loading}
				<div class="launcher-detail-text"><span class="launcher-spinner" role="status" aria-label="Loading details"></span></div>
			{:else if detail.error}
				<div class="launcher-error">{detail.error}</div>
			{:else if detail.data}
				<div class="launcher-detail-text">
					{#if detail.data.tagline}<p class="launcher-detail-tagline">{detail.data.tagline}</p>{/if}
					{#if detail.data.overview}<p>{detail.data.overview}</p>{/if}
				</div>
			{/if}
		</div>
	{:else}
	<div class="launcher-scroll" id={listId} role="listbox" aria-label="Results">
		{#each sections as section (section.id)}
			{#if section.items.length || section.loading || section.error}
				<div class="launcher-section" role="group" aria-labelledby="{listId}-{section.id}">
					<div class="launcher-section-label" id="{listId}-{section.id}">
						<span>{section.label}</span>
						{#if section.loading}<span class="launcher-spinner" role="status" aria-label="Searching"></span>{/if}
					</div>
					{#if section.error}
						<div class="launcher-error">{section.error}</div>
					{/if}
					<div class={section.layout === 'grid' ? 'launcher-grid' : section.layout === 'poster' ? 'launcher-posters' : 'launcher-rows'}>
						{#each section.items as item (item.key)}
							{@const isSel = item.key === selectedKey}
							<div
								id="{listId}-{item.key}"
								role="option"
								aria-selected={isSel}
								aria-label={section.layout === 'list' ? undefined : [item.title, item.subtitle, item.badge].filter(Boolean).join(', ')}
								tabindex="-1"
								class="launcher-item {section.layout === 'grid' ? 'is-tile' : section.layout === 'poster' ? 'is-poster' : 'is-row'}"
								class:is-selected={isSel}
								use:scrollIntoView={isSel}
								onpointermove={() => { if (!isSel) onselect(item.key); }}
								onmousedown={(e) => e.preventDefault()}
								onclick={(e) => onrun(item, e)}
								onauxclick={(e) => { if (e.button === 1) { e.preventDefault(); onrun(item, e); } }}
							>
								{#if item.more && section.layout !== 'list'}
									<div class="launcher-thumb-wrap launcher-more">{item.title}</div>
								{:else if section.layout === 'grid' || section.layout === 'poster'}
									<div class="launcher-thumb-wrap">
										{#if item.thumbnail}
											<img class="is-loading" use:thumbLoading src={item.thumbnail} alt="" loading="lazy" referrerpolicy="no-referrer" onerror={thumbFailed} />
										{/if}
										<svg class="launcher-thumb-fallback" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">{@html KIND_ICONS[item.kind] || KIND_ICONS.file}</svg>
										{#if item.play}
											<button
												type="button"
												class="launcher-play"
												aria-label="Play {item.title}"
												tabindex="-1"
												onmousedown={(e) => e.preventDefault()}
												onclick={(e) => { e.stopPropagation(); item.play.run(); }}
											>
												<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/></svg>
											</button>
										{/if}
										{#if item.request}
											<button
												type="button"
												class="launcher-request"
												class:is-busy={item.request.busy}
												class:is-done={item.request.done}
												disabled={item.request.busy || item.request.done}
												onmousedown={(e) => e.preventDefault()}
												onclick={(e) => { e.stopPropagation(); item.request.run?.(); }}
											>
												{#if item.request.done}
													<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
												{/if}
												{item.request.busy ? `${item.request.label}…` : item.request.label}
											</button>
										{/if}
										{#if item.badge}<span class="launcher-badge" class:is-top={item.request}>{item.badge}</span>{/if}
									</div>
									{#if section.layout === 'poster'}
										<div class="launcher-poster-title">{item.title}</div>
										{#if item.subtitle}<div class="launcher-poster-sub">{item.subtitle}</div>{/if}
									{/if}
								{:else}
									<span class="launcher-icon">
										{#if item.appIcon !== undefined}
											<AppIcon icon={item.appIcon} name={item.title} size="w-[18px] h-[18px]" wrapSize="w-7 h-7" iconStyle={item.iconStyle || 'colored'} wrap />
										{:else if item.thumbnail}
											<span class="launcher-icon-box">
												<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">{@html KIND_ICONS[item.kind] || KIND_ICONS.file}</svg>
												<img class="is-loading" use:thumbLoading src={item.thumbnail} alt="" loading="lazy" referrerpolicy="no-referrer" onerror={thumbFailed} />
											</span>
										{:else}
											<span class="launcher-icon-box">
												<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">{@html item.svg || KIND_ICONS[item.kind] || KIND_ICONS.file}</svg>
											</span>
										{/if}
									</span>
									<span class="launcher-text">
										<span class="launcher-title">{item.title}</span>
										{#if item.subtitle}<span class="launcher-subtitle">{item.subtitle}</span>{/if}
									</span>
									{#if item.tags?.length}
										<span class="launcher-tags">
											{#each item.tags.slice(0, 3) as tag}<span class="launcher-tag">{tag}</span>{/each}
										</span>
									{/if}
									{#if item.accessory}<span class="launcher-accessory">{item.accessory}</span>{/if}
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}
		{/each}
		{#if !flat.length && emptyText && !sections.some((s) => s.loading)}
			<div class="launcher-empty">{emptyText}</div>
		{/if}
	</div>
	{/if}

	<!-- Footer bar: what Enter does, and where the rest of the actions live. -->
	<div class="launcher-footer">
		{#if detail}
			<span class="launcher-footer-hint">
				<Keys keys="esc" /> back
			</span>
			{@const enter = detail.open}
			{#if enter}
				<button type="button" class="launcher-footer-btn" onmousedown={(e) => e.preventDefault()} onclick={() => enter.run()}>
					{enter.label} <Keys keys="↵" />
				</button>
			{/if}
		{:else}
		<span class="launcher-footer-hint">
			<Keys keys="↑ ↓" /> to move
		</span>
		{#if selected}
			<button type="button" class="launcher-footer-btn" onmousedown={(e) => e.preventDefault()} onclick={(e) => onrun(selected, e)}>
				{selected.actions[0]?.label || 'Open'} <Keys keys="↵" />
			</button>
			{#if selected.actions.length > 1}
				<span class="launcher-footer-sep"></span>
				<button type="button" class="launcher-footer-btn" aria-expanded={panelOpen} onmousedown={(e) => e.preventDefault()} onclick={onpanel}>
					Actions <Keys keys="⌘ K" />
				</button>
			{/if}
		{/if}
		{/if}
	</div>

	{#if panelOpen && selected && !detail}
		<div class="launcher-actions" role="menu" aria-label="Actions for {selected.title}">
			<div class="launcher-actions-title">{selected.title}</div>
			{#each selected.actions as action, i}
				<button
					type="button"
					id="{listId}-action-{i}"
						role="menuitem"
					class="launcher-action"
					class:is-selected={i === panelIndex}
					onpointermove={() => (panelIndex = i)}
					onmousedown={(e) => e.preventDefault()}
					onclick={() => onaction(selected, action)}
				>
					<span>{action.label}</span>
					{#if action.hint}<span class="launcher-action-hint"><Keys keys={action.hint} /></span>{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>
