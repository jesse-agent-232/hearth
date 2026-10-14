<script>
	import { getContext } from 'svelte';
	import { browser } from '$app/environment';
	import { dialog } from '$lib/actions/dialog.js';
	import { portal } from '$lib/actions/portal.js';
	import AppIcon from '$lib/components/AppIcon.svelte';

	// Getting started with an app: use it in the browser, or set up the mobile
	// client (server URL, store links, steps).
	// dismissible: the tile opens this on a plain click (on_click: getting_started),
	// so it offers a way to stop that.
	let {
		app,
		guide,
		iconStyle,
		dismissible = false,
		openInNewTab = true,
		dismissed = false,
		ondismiss = () => {},
		onopenapp = () => {},
		onclose
	} = $props();

	const touch = typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches;

	// The user first picks browser or phone, however they got here.
	let view = $state('choose');

	// The body scrolls inside the card; while more sits below the fold, a fade
	// and a down arrow say so.
	let bodyEl = $state();
	let moreBelow = $state(false);
	function checkMore() {
		if (bodyEl) moreBelow = bodyEl.scrollTop + bodyEl.clientHeight < bodyEl.scrollHeight - 4;
	}
	$effect(() => {
		if (!bodyEl) return;
		const ro = new ResizeObserver(checkMore);
		ro.observe(bodyEl);
		for (const child of bodyEl.children) ro.observe(child);
		checkMore();
		return () => ro.disconnect();
	});
	const hasStores = $derived(!!(app.ios || app.android));

	// The one-line pitch: the onboarding service blurb, else the guide subtitle
	// (which falls back to the bare name — not worth repeating).
	const siteConfig = getContext('config');
	const pitch = $derived(
		siteConfig?.onboarding?.services?.find((s) => s.id === app.id)?.desc ||
			(guide.subtitle !== app.name ? guide.subtitle : '')
	);

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

<div use:portal use:dialog={{ label: `Getting started with ${app.name}`, onclose }} class="fixed inset-0 modal-veil flex items-center justify-center z-[100] p-4">
	<div class="glass-card rounded-2xl w-full max-w-[400px] max-h-full flex flex-col overflow-hidden animate-modal-enter shadow-theme relative">
		<!-- Header: app icon on its dashboard tile, back (phone view from a click) + close -->
		<div class="shrink-0 px-6 pt-5 pb-4 border-b border-border-card relative">
			<button
				class="absolute top-3 right-4 bg-transparent border-none text-content-dim text-2xl cursor-pointer leading-none hover:text-content w-6 h-6 flex items-center justify-center"
				onclick={onclose}
				aria-label="Close"
			>&times;</button>
			<div class="flex items-center gap-3 pr-8">
				{#if view === 'phone'}
					<button
						type="button"
						class="shrink-0 -ml-1.5 w-7 h-7 rounded-lg bg-transparent border-none text-content-dim cursor-pointer hover:text-content hover:bg-surface-card flex items-center justify-center transition-colors"
						onclick={() => (view = 'choose')}
						aria-label="Back"
					><svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>
				{/if}
				<AppIcon icon={app.icon} name={app.name} size="w-6 h-6" wrapSize="w-10 h-10" {iconStyle} wrap />
				<div class="min-w-0">
					<span class="block text-[0.65rem] text-content-dim uppercase tracking-[0.15em]">{view === 'choose' ? 'Getting started' : 'Mobile app setup'}</span>
					<h3 class="text-[1rem] font-semibold text-content m-0 truncate">{app.name}</h3>
				</div>
			</div>
			<!-- Full width under the icon row, so a long pitch wraps instead of truncating -->
			{#if pitch}<p class="text-[0.78rem] text-content-muted leading-snug m-0 mt-3">{pitch}</p>{/if}
		</div>

		<div class="relative min-h-0 flex-1 flex flex-col">
		<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain" bind:this={bodyEl} onscroll={checkMore}>
		{#if view === 'choose'}
			<!-- Two paths: the app right here, or its mobile client -->
			<div class="px-6 pt-4 pb-5">
				<p class="text-[0.82rem] text-content-muted m-0 mb-3">How do you want to use {app.name}?</p>
				<div class="flex flex-col gap-2">
					<a
						href={app.url}
						target={openInNewTab ? '_blank' : undefined}
						rel={openInNewTab ? 'noopener noreferrer' : undefined}
						class="path-card no-underline"
						onclick={() => { onopenapp(); onclose(); }}
					>
						<span class="path-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3"/></svg></span>
						<span class="min-w-0 flex-1">
							<span class="block text-[0.85rem] font-medium text-content">In the browser</span>
							<span class="block text-[0.75rem] text-content-dim leading-snug">Open {app.name} here. Nothing to install.</span>
						</span>
						<svg viewBox="0 0 24 24" class="path-chevron" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>
					</a>
					<button type="button" class="path-card" onclick={() => (view = 'phone')}>
						<span class="path-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/></svg></span>
						<span class="min-w-0 flex-1 text-left">
							<span class="block text-[0.85rem] font-medium text-content">In the mobile app</span>
							<span class="block text-[0.75rem] text-content-dim leading-snug">Install the app and connect it to this server.</span>
						</span>
						<svg viewBox="0 0 24 24" class="path-chevron" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
					</button>
				</div>
			</div>
		{:else}
			<!-- Mobile client: server URL, stores, then the steps -->
			<div class="px-6 pt-4 pb-5 flex flex-col gap-3">
				<!-- Server URL -->
				<div class="pl-3.5 pr-2 py-2 bg-surface-input border border-border-card rounded-xl flex items-center gap-3">
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

				{#if hasStores}
				<div class="flex gap-2">
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

				{#if guide.steps.length}
				<details class="guide-steps" open ontoggle={checkMore}>
					<summary class="text-[0.75rem] font-mono text-content-muted cursor-pointer select-none hover:text-content flex items-center gap-1.5"><svg viewBox="0 0 24 24" class="steps-chevron w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>Setup steps ({guide.steps.length})</summary>
					<div class="pt-3">
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
				</details>
				{/if}
			</div>
		{/if}
		</div>
		{#if moreBelow}
			<div class="more-fade" aria-hidden="true"></div>
			<button
				type="button"
				class="more-btn"
				aria-label="Scroll for more"
				onclick={() => bodyEl.scrollBy({ top: bodyEl.clientHeight * 0.7, behavior: 'smooth' })}
			><svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
		{/if}
		</div>

		{#if dismissible}
		<div class="shrink-0 px-6 py-4 border-t border-border-card">
			<!-- Once it stops opening on click, the right-click / long-press menu
			     is where this lives; say so before the user turns it off. -->
			<div class="flex items-start gap-2 mb-3 px-3 py-2 rounded-lg bg-surface-input border border-border-card text-[0.72rem] leading-snug text-content-muted font-mono">
				<svg viewBox="0 0 24 24" class="w-3.5 h-3.5 mt-px shrink-0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/></svg>
				<span>Tip: {touch ? 'press and hold' : 'right-click'} {app.name} any time to see this again.</span>
			</div>
			<label class="flex items-center gap-2 text-[0.75rem] text-content-muted font-mono cursor-pointer select-none">
				<input type="checkbox" class="guide-dismiss" checked={dismissed} onchange={(e) => ondismiss(e.currentTarget.checked)} />
				Don’t show again
			</label>
		</div>
		{/if}
	</div>
</div>

<style>
	.guide-dismiss {
		width: 0.95rem;
		height: 0.95rem;
		margin: 0;
		accent-color: var(--text);
		cursor: pointer;
	}
	.path-card {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
		padding: 0.75rem 0.85rem;
		border-radius: 0.75rem;
		border: 1px solid var(--color-border-card);
		background: var(--color-surface-input);
		color: inherit;
		font: inherit;
		cursor: pointer;
		transition: background-color 0.15s, border-color 0.15s;
	}
	.path-card:hover,
	.path-card:focus-visible {
		background: var(--color-surface-card-strong);
	}
	.path-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		flex-shrink: 0;
		border-radius: 0.6rem;
		background: var(--color-surface-card-strong);
		color: var(--color-content-muted);
	}
	.path-icon svg {
		width: 1.15rem;
		height: 1.15rem;
	}
	.path-chevron {
		width: 1rem;
		height: 1rem;
		flex-shrink: 0;
		color: var(--color-content-dim);
	}
	.guide-steps > summary {
		list-style: none;
	}
	.guide-steps > summary::-webkit-details-marker {
		display: none;
	}
	.more-fade {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 3.5rem;
		pointer-events: none;
		background: linear-gradient(to bottom, transparent, var(--modal-fade, rgba(20, 20, 22, 0.85)));
	}
	:global(body.theme-light) .more-fade {
		--modal-fade: rgba(245, 245, 247, 0.9);
	}
	.more-btn {
		position: absolute;
		left: 50%;
		bottom: 0.6rem;
		transform: translateX(-50%);
		width: 1.9rem;
		height: 1.9rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 999px;
		border: 1px solid var(--color-border-card);
		background: var(--color-surface-card-strong);
		color: var(--color-content);
		cursor: pointer;
		animation: more-nudge 1.6s ease-in-out infinite;
	}
	@keyframes more-nudge {
		0%, 100% { transform: translate(-50%, 0); }
		50% { transform: translate(-50%, 3px); }
	}
	@media (prefers-reduced-motion: reduce) {
		.more-btn { animation: none; }
	}
	.steps-chevron {
		transition: transform 0.15s;
	}
	.guide-steps[open] .steps-chevron {
		transform: rotate(90deg);
	}
</style>
