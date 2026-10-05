<script>
	import { onMount } from 'svelte';
	import { integrations as integrationsStore } from '$lib/stores/integrations.js';
	import IntegrationCard from './IntegrationCard.svelte';
	import { confirmDiscardUnsaved } from '$lib/unsaved.js';

	let { iconStyle = 'colored' } = $props();

	let expandedId = $state(null);

	onMount(() => {
		integrationsStore.load();
	});
</script>

<div>
	<div class="mb-3">
		<div class="flex items-center gap-2">
			<div class="text-[0.85rem] font-semibold text-content">Integrations</div>
			<span class="text-[0.65rem] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-card-strong text-content-muted border border-border-card">Alpha</span>
		</div>
		<div class="text-[0.7rem] text-content-dim mt-0.5">Connect your apps to search and interact with them from Hearth.</div>
	</div>

	<div class="mb-4 px-3 py-2 rounded-lg bg-surface-card border border-border-card">
		<p class="text-[0.7rem] text-content-dim leading-relaxed m-0 font-mono">
			This framework is in active development. Expect breaking changes in future versions &mdash; connected accounts may need to be re-linked.
		</p>
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
		<div class="flex flex-col gap-1">
			{#each $integrationsStore.integrations as integration (integration.id)}
				<IntegrationCard
					{integration}
					{iconStyle}
					expanded={expandedId === integration.id}
					onExpandRequest={() => { if (expandedId !== integration.id && !confirmDiscardUnsaved()) return; expandedId = integration.id; }}
					onCollapseRequest={() => { if (expandedId === integration.id) expandedId = null; }}
				/>
			{/each}
		</div>
	{/if}
</div>
