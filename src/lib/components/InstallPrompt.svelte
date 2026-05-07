<script>
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	let deferredPrompt = $state(null);
	let showPrompt = $state(false);
	let isIOS = $state(false);
	let dismissed = $state(false);

	let { devMode = false } = $props();

	onMount(() => {
		// Don't show if already installed as standalone
		if (window.matchMedia('(display-mode: standalone)').matches) return;

		// Check if dismissed recently (7 days)
		const dismissedAt = localStorage.getItem('install_dismissed');
		if (dismissedAt && Date.now() - parseInt(dismissedAt) < 7 * 86400000) return;

		// Dev mode (no auth, demo user): suppress the iOS prompt so screenshots
		// and local dev runs aren't dominated by the install banner overlay.
		if (devMode) return;

		// iOS Safari detection
		const ua = navigator.userAgent;
		isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;

		if (isIOS) {
			// Show iOS instructions after a short delay
			setTimeout(() => { showPrompt = true; }, 2000);
			return;
		}

		// Chrome/Edge beforeinstallprompt
		window.addEventListener('beforeinstallprompt', (e) => {
			e.preventDefault();
			deferredPrompt = e;
			setTimeout(() => { showPrompt = true; }, 2000);
		});
	});

	async function install() {
		if (deferredPrompt) {
			deferredPrompt.prompt();
			const { outcome } = await deferredPrompt.userChoice;
			deferredPrompt = null;
			showPrompt = false;
		}
	}

	function dismiss() {
		showPrompt = false;
		dismissed = true;
		if (browser) localStorage.setItem('install_dismissed', String(Date.now()));
	}
</script>

{#if showPrompt && !dismissed}
	<div class="install-prompt fixed bottom-0 left-0 right-0 flex items-center justify-center gap-4 py-3.5 px-6 glass-card rounded-none border-t border-border-card z-[60] animate-slide-up" style="padding-bottom: calc(0.875rem + env(safe-area-inset-bottom, 0px))">
		{#if isIOS}
			<span class="text-base text-content-dim">
				Tap <strong class="text-content">Share</strong> then <strong class="text-content">Add to Home Screen</strong> to install
			</span>
		{:else}
			<span class="text-base text-content-dim">Install as app for the best experience</span>
			<button class="bg-surface-card-strong border border-border-card text-content py-1.5 px-4 rounded-md font-mono text-base cursor-pointer transition-colors duration-150 hover:bg-surface-card-strong" onclick={install}>Install</button>
		{/if}
		<button class="bg-transparent border-none text-content-dim text-[1.3rem] cursor-pointer px-1 leading-none hover:text-content" onclick={dismiss}>&times;</button>
	</div>
{/if}
