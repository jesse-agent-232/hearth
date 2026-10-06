<script>
	import { dialog } from '$lib/actions/dialog.js';
	import { getContext } from 'svelte';
	import { browser } from '$app/environment';

	const siteConfig = getContext('config');
	const brandName = siteConfig?.branding?.name || 'Holm';
	const privacyConfig = siteConfig?.privacy || {};
	const sections = privacyConfig.sections || [];
	const lastUpdated = privacyConfig.last_updated || '';
	const privacyHtml = privacyConfig.html || null;

	let { open = $bindable(false), standalone = false } = $props();

	function portal(node) {
		document.body.appendChild(node);
		return { destroy() { if (node.parentNode) node.parentNode.removeChild(node); } };
	}

	// Close on Escape while the modal is open
	$effect(() => {
		if (!browser || !open) return;
		function onKey(e) {
			if (e.key === 'Escape') {
				e.preventDefault();
				open = false;
			}
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});
</script>

{#if open}
	<div
		use:portal
		use:dialog={{ label: 'Privacy & Terms' }}
		class="fixed inset-0 bg-surface-overlay backdrop-blur-[6px] flex items-center justify-center z-[100] p-4 animate-fade-in"
		onclick={() => open = false}
	>
	<div class="glass-card rounded-2xl w-full max-w-[480px] max-h-[80vh] overflow-hidden shadow-theme animate-modal-enter flex flex-col relative" onclick={(e) => e.stopPropagation()}>
		<!-- Header strip -->
		<div class="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border-card">
			<span class="text-[0.8rem] font-semibold text-content">Privacy & Terms</span>
			<button
				class="bg-transparent border-none text-content-dim text-2xl cursor-pointer leading-none hover:text-content w-6 h-6 flex items-center justify-center"
				onclick={() => open = false}
				aria-label="Close"
			>&times;</button>
		</div>

		<!-- Body -->
		<div class="p-8 pt-5 overflow-y-auto text-content-dim text-[0.78rem] leading-[1.7]">
			{#if lastUpdated}
			<p class="opacity-50 text-[0.7rem] mt-0">Last updated: {lastUpdated}</p>
			{/if}

			{#if privacyHtml}
				<div class="privacy-md">{@html privacyHtml}</div>
			{:else}
				{#each sections as section}
					<h3 class="text-[0.8rem] font-semibold text-content mt-5 mb-1">{section.title}</h3>
					<ul class="pl-5 my-1">
						{#each section.items as item}
							<li class="mb-0.5">{item}</li>
						{/each}
					</ul>
				{/each}
			{/if}
		</div>
	</div>
	</div>
{/if}

<style>
	.privacy-md :global(h1),
	.privacy-md :global(h2),
	.privacy-md :global(h3) {
		color: var(--text);
		font-weight: 600;
		margin-top: 1.25rem;
		margin-bottom: 0.25rem;
	}
	.privacy-md :global(h1) { font-size: 0.95rem; }
	.privacy-md :global(h2) { font-size: 0.85rem; }
	.privacy-md :global(h3) { font-size: 0.8rem; }
	.privacy-md :global(p) { margin: 0.5rem 0; }
	.privacy-md :global(ul) { padding-left: 1.25rem; margin: 0.25rem 0; }
	.privacy-md :global(li) { margin-bottom: 0.125rem; }
	.privacy-md :global(a) { color: var(--text-muted); text-decoration: underline; }
	.privacy-md :global(a:hover) { color: var(--text); }
	.privacy-md :global(strong) { color: var(--text); }
</style>

{#if !standalone}
<div class="flex items-center justify-center gap-2 pt-8 pb-4 text-[0.7rem] text-content-dim">
	<span>{brandName}</span>
	{#if privacyConfig.enabled}
	<span class="opacity-50">&middot;</span>
	<button class="bg-transparent border-none text-content-dim font-mono text-[0.7rem] cursor-pointer p-0 no-underline hover:text-content-dim" onclick={() => open = true}>Privacy & Terms</button>
	{/if}
</div>
{/if}
