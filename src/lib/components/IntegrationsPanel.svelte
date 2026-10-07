<script>
	import { onMount } from 'svelte';
	import { integrations as integrationsStore } from '$lib/stores/integrations.js';
	import IntegrationCard from './IntegrationCard.svelte';
	import { confirmDiscardUnsaved } from '$lib/unsaved.js';

	let { iconStyle = 'colored' } = $props();

	let expandedId = $state(null);
	let filter = $state('');

	// What the user has connected comes first; the rest are grouped by
	// category. Past a handful of integrations a filter box appears.
	const CATEGORY_ORDER = ['Media', 'Photos', 'Documents', 'Productivity', 'Home', 'Other'];
	const all = $derived($integrationsStore.integrations);
	const showFilter = $derived(all.length > 8);
	const groups = $derived.by(() => {
		const q = filter.trim().toLowerCase();
		const match = (it) => !q || [it.name, it.description, it.category].some((t) => (t || '').toLowerCase().includes(q));
		const shown = all.filter(match);
		const out = [];
		const connected = shown.filter((it) => it.userState?.connected);
		if (connected.length) out.push({ label: 'Connected', items: connected });
		const rest = shown.filter((it) => !it.userState?.connected);
		const cats = [...new Set(rest.map((it) => it.category || 'Other'))]
			.sort((a, b) => (CATEGORY_ORDER.indexOf(a) + 1 || 99) - (CATEGORY_ORDER.indexOf(b) + 1 || 99));
		for (const c of cats) out.push({ label: c, items: rest.filter((it) => (it.category || 'Other') === c) });
		return out;
	});

	onMount(() => {
		integrationsStore.load();
	});
</script>

<div>
	<div class="mb-3">
		<div class="flex items-center gap-2">
			<div class="text-[0.85rem] font-semibold text-content">Integrations</div>
			<span class="text-[0.65rem] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-surface-input text-content-dim border border-border-card">Alpha</span>
		</div>
		<div class="text-[0.7rem] text-content-dim mt-0.5">Connect your apps to search and interact with them from Holm.</div>
		<div class="text-[0.7rem] text-content-dim mt-1.5">Still early: after an update you may need to connect an app again.</div>
	</div>

	{#if $integrationsStore.loading && !$integrationsStore.loaded}
		<div class="text-[0.75rem] text-content-dim font-mono px-1 py-2">Loading integrations…</div>
	{:else if $integrationsStore.error}
		<div class="text-[0.75rem] text-content-dim font-mono px-1 py-2 leading-relaxed">
			Couldn't load integrations.
			<button class="bg-transparent border-none p-0 text-content-muted underline cursor-pointer font-mono text-[0.75rem]" onclick={() => integrationsStore.load()}>Retry</button>
		</div>
	{:else if $integrationsStore.integrations.length === 0}
		<div class="text-[0.75rem] text-content-dim font-mono px-1 py-2 leading-relaxed">
			No integrations enabled. Ask your administrator to add an
			<code class="text-content-muted">integrations:</code> section to <code class="text-content-muted">config.yml</code>.
		</div>
	{:else}
		{#if showFilter}
			<input
				type="text"
				bind:value={filter}
				placeholder="Filter integrations"
				aria-label="Filter integrations"
				class="w-full mb-3 bg-surface-input border border-border-input rounded-lg px-3 py-2 text-[0.8rem] text-content font-mono placeholder:text-content-dim outline-none focus:border-border-pill"
				autocomplete="off"
				spellcheck="false"
			/>
		{/if}
		{#each groups as group (group.label)}
			<div class="mb-3">
				<div class="text-[0.65rem] font-mono font-semibold uppercase tracking-[0.16em] text-content-dim px-1 pb-1">{group.label}</div>
				<div class="flex flex-col gap-1">
					{#each group.items as integration (integration.id)}
						<IntegrationCard
							{integration}
							{iconStyle}
							expanded={expandedId === integration.id}
							onExpandRequest={() => { if (expandedId !== integration.id && !confirmDiscardUnsaved()) return; expandedId = integration.id; }}
							onCollapseRequest={() => { if (expandedId === integration.id) expandedId = null; }}
						/>
					{/each}
				</div>
			</div>
		{:else}
			<div class="text-[0.75rem] text-content-dim font-mono px-1 py-2">No integrations match “{filter.trim()}”.</div>
		{/each}
	{/if}
</div>
