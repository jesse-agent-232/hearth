<script>
	import { dialog } from '$lib/actions/dialog.js';
	import { portal } from '$lib/actions/portal.js';
	import { getContext } from 'svelte';
	import { browser } from '$app/environment';

	// "What's new in vX.Y.Z": opens once after the version changes, with every
	// release since the one the user last closed it on, and again from the
	// version link in Configure (the `holm:whats-new` event).
	const SEEN_KEY = 'holm_whats_new_seen';
	const siteConfig = getContext('config');
	const brandName = siteConfig?.branding?.name || 'Holm';

	// Waits until onboarding and the password gate are out of the way.
	let { ready = true } = $props();

	let releases = $state([]);
	let version = $state('');
	let open = $state(false);
	// Where Close records the version: 'server', 'local' (guest, or no
	// database), or null when opened from Configure.
	let store = $state(null);
	let checked = false;

	function readSeen() {
		try {
			return localStorage.getItem(SEEN_KEY);
		} catch {
			return null;
		}
	}

	function writeSeen(v) {
		try {
			localStorage.setItem(SEEN_KEY, v);
		} catch {
			/* private mode: it shows again next time */
		}
	}

	async function check() {
		const seen = readSeen();
		const res = await fetch(`/api/whats-new${seen ? `?seen=${encodeURIComponent(seen)}` : ''}`);
		if (!res.ok) return;
		const data = await res.json();
		if (data.store === 'local' && data.record) writeSeen(data.version);
		if (!data.show) return;
		({ version, releases, store } = data);
		open = true;
	}

	async function showCurrent() {
		const res = await fetch('/api/whats-new?all=1').catch(() => null);
		if (!res?.ok) return;
		const data = await res.json();
		({ version, releases } = data);
		store = null;
		open = true;
	}

	function close() {
		open = false;
		if (store === 'server') fetch('/api/whats-new/seen', { method: 'POST' }).catch(() => {});
		else if (store === 'local') writeSeen(version);
		store = null;
	}

	$effect(() => {
		if (!browser || !ready || checked || siteConfig?.whatsNew?.enabled === false) return;
		checked = true;
		check().catch(() => {});
	});

	$effect(() => {
		if (!browser) return;
		const onOpen = () => showCurrent();
		window.addEventListener('holm:whats-new', onOpen);
		return () => window.removeEventListener('holm:whats-new', onOpen);
	});

	$effect(() => {
		if (!open) return;
		const onKey = (e) => {
			if (e.key !== 'Escape') return;
			e.preventDefault();
			close();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});
</script>

{#if open}
	<div
		use:portal
		use:dialog={{ label: `What's new in ${brandName} ${version}`, onclose: close }}
		class="fixed inset-0 modal-veil flex items-center justify-center z-[100] p-4"
	>
		<div class="glass-card rounded-2xl w-full max-w-[480px] max-h-[80vh] overflow-hidden shadow-theme animate-modal-enter flex flex-col relative">
			<div class="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border-card">
				<span class="text-[0.8rem] font-semibold text-content">What's new in {brandName} <span class="font-mono">v{version}</span></span>
				<button
					class="bg-transparent border-none text-content-dim text-2xl cursor-pointer leading-none hover:text-content w-6 h-6 flex items-center justify-center"
					onclick={close}
					aria-label="Close"
				>&times;</button>
			</div>
			<div class="px-6 py-4 overflow-y-auto text-content-dim text-[0.78rem] leading-[1.7]">
				{#each releases as r, i (r.version)}
					{#if releases.length > 1}
						<h3 class="text-[0.7rem] font-mono uppercase tracking-[0.12em] text-content-dim {i ? 'mt-5' : 'mt-0'} mb-1">v{r.version}{#if r.date} · {r.date}{/if}</h3>
					{:else if r.date}
						<p class="text-[0.7rem] font-mono text-content-dim mt-0 mb-1">{r.date}</p>
					{/if}
					<div class="notes">{@html r.html}</div>
				{/each}
			</div>
			<div class="shrink-0 flex justify-end px-4 py-3 border-t border-border-card">
				<button
					class="py-1.5 px-4 rounded-lg text-[0.75rem] font-mono bg-surface-card-strong text-content border border-border-card cursor-pointer hover:bg-surface-card-hover transition-colors"
					onclick={close}
				>Close</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.notes :global(ul) { padding-left: 1.1rem; margin: 0.25rem 0; list-style: disc; }
	.notes :global(li) { margin-bottom: 0.4rem; }
	.notes :global(li::marker) { color: var(--color-content-dim); }
	.notes :global(p) { margin: 0.5rem 0; }
	.notes :global(strong) { color: var(--color-content); font-weight: 600; }
	.notes :global(code) { font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.95em; }
	.notes :global(a) { color: var(--color-content-muted); text-decoration: underline; }
</style>
