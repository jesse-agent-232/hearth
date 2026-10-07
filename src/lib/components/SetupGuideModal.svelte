<script>
	import { browser } from '$app/environment';
	import { dialog } from '$lib/actions/dialog.js';
	import { portal } from '$lib/actions/portal.js';
	import AppIcon from '$lib/components/AppIcon.svelte';

	// How to set up an app's mobile client: steps, server URL and store links.
	let { app, guide, iconStyle, onclose } = $props();

	let urlCopied = $state(false);
	let urlCopiedTimer;
	function copyUrl(url) {
		navigator.clipboard?.writeText(url).then(() => {
			urlCopied = true;
			clearTimeout(urlCopiedTimer);
			urlCopiedTimer = setTimeout(() => (urlCopied = false), 1500);
		}).catch(() => {});
	}

	$effect(() => {
		if (!browser) return;
		function onEsc(e) {
			if (e.key === 'Escape') {
				e.preventDefault();
				onclose();
			}
		}
		window.addEventListener('keydown', onEsc);
		return () => window.removeEventListener('keydown', onEsc);
	});
</script>

<div use:portal use:dialog={{ label: `${app.name} setup`, onclose }} class="fixed inset-0 modal-veil flex items-center justify-center z-[100] p-4">
	<div class="glass-card rounded-2xl w-full max-w-[400px] overflow-hidden animate-modal-enter shadow-theme relative">
		<!-- Header: app icon on its dashboard tile + close -->
		<div class="px-6 pt-5 pb-4 border-b border-border-card relative">
			<button
				class="absolute top-3 right-4 bg-transparent border-none text-content-dim text-2xl cursor-pointer leading-none hover:text-content w-6 h-6 flex items-center justify-center"
				onclick={onclose}
				aria-label="Close"
			>&times;</button>
			<div class="flex items-center gap-3 pr-8">
				<AppIcon icon={app.icon} name={app.name} size="w-6 h-6" wrapSize="w-10 h-10" {iconStyle} wrap />
				<div class="min-w-0">
					<h3 class="text-[1rem] font-semibold text-content m-0 truncate">{guide.title}</h3>
					<p class="text-[0.75rem] text-content-dim m-0 truncate">{guide.subtitle}</p>
				</div>
			</div>
		</div>

		<!-- Steps -->
		<div class="px-6 pt-4 pb-3 max-h-[260px] overflow-y-auto">
			{#each guide.steps as step, i}
				<div class="flex gap-3 {i < guide.steps.length - 1 ? 'mb-3' : ''}">
					<div class="flex flex-col items-center">
						<span class="w-6 h-6 rounded-full bg-surface-card-strong text-[0.7rem] font-semibold text-content-muted flex items-center justify-center shrink-0">{i + 1}</span>
						{#if i < guide.steps.length - 1}
							<div class="w-px flex-1 bg-surface-card mt-1.5"></div>
						{/if}
					</div>
					<div class="pb-0.5">
						<p class="text-[0.82rem] text-content font-medium m-0 leading-6">{step.label}</p>
						<p class="text-[0.75rem] text-content-dim m-0 leading-snug">{step.desc}</p>
					</div>
				</div>
			{/each}
		</div>

		<!-- Server URL -->
		<div class="mx-6 {app.ios || app.android ? 'mb-3' : 'mb-6'} pl-3.5 pr-2 py-2 bg-surface-input border border-border-card rounded-xl flex items-center gap-3">
			<div class="min-w-0 flex-1">
				<span class="text-[0.65rem] text-content-dim uppercase tracking-[0.15em]">Server URL</span>
				<p class="text-[0.85rem] text-content-muted font-mono m-0 mt-0.5 truncate">{app.url}</p>
			</div>
			<button
				type="button"
				class="shrink-0 bg-transparent border border-border-card rounded-lg px-3 py-1.5 text-[0.75rem] font-mono text-content-muted cursor-pointer hover:text-content hover:bg-surface-card transition-colors"
				onclick={() => copyUrl(app.url)}
			>{urlCopied ? 'Copied' : 'Copy'}</button>
		</div>

		<!-- Actions -->
		{#if app.ios || app.android}
		<div class="px-6 pb-6 flex gap-2">
			{#if app.ios}
				<a href={app.ios} target="_blank" rel="noopener noreferrer" class="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-[10px] text-[0.8rem] font-medium font-mono text-center no-underline bg-surface-card-strong text-content border border-border-card hover:bg-surface-card-strong transition-colors">
					<img src="/icons/appstore.svg" alt="" class="w-4 h-4 icon-white" /> App Store
				</a>
			{/if}
			{#if app.android}
				<a href={app.android} target="_blank" rel="noopener noreferrer" class="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-[10px] text-[0.8rem] font-medium font-mono text-center no-underline bg-surface-card-strong text-content border border-border-card hover:bg-surface-card-strong transition-colors">
					<img src="/icons/googleplay.svg" alt="" class="w-4 h-4 icon-white" /> Play Store
				</a>
			{/if}
		</div>
		{/if}
	</div>
</div>
