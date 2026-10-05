<script>
	import { onMount, getContext } from 'svelte';
	import { browser } from '$app/environment';

	let deferredPrompt = $state(null);
	let showPrompt = $state(false);
	// 'native' = Chrome/Edge gave us beforeinstallprompt; 'ios' / 'android' =
	// we can only explain the browser's own menu.
	let mode = $state('native');
	let dismissed = $state(false);

	// ready=false holds the card back (e.g. while first-login screens are up)
	// without missing an early beforeinstallprompt event.
	let { devMode = false, ready = true } = $props();

	const brandName = getContext('config')?.branding?.name || 'Hearth';

	onMount(() => {
		// Don't show if already installed as standalone
		if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) return;

		// Check if dismissed recently (7 days)
		const dismissedAt = localStorage.getItem('install_dismissed');
		if (dismissedAt && Date.now() - parseInt(dismissedAt) < 7 * 86400000) return;

		// Dev mode (no auth, demo user): suppress the prompt so screenshots
		// and local dev runs aren't dominated by the install card.
		if (devMode) return;

		const ua = navigator.userAgent;
		// iPadOS reports itself as a Mac; touch points give it away.
		const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
		if (isIOS) {
			mode = 'ios';
			setTimeout(() => { showPrompt = true; }, 2000);
			return;
		}

		window.addEventListener('beforeinstallprompt', (e) => {
			e.preventDefault();
			deferredPrompt = e;
			mode = 'native';
			setTimeout(() => { showPrompt = true; }, 2000);
		});

		// Android browsers that never fire beforeinstallprompt (Firefox,
		// Samsung Internet, or Chrome when its install criteria aren't met)
		// can still add to the home screen from their menu — say how.
		if (/Android/.test(ua)) {
			setTimeout(() => {
				if (!deferredPrompt) { mode = 'android'; showPrompt = true; }
			}, 4000);
		}
	});

	async function install() {
		if (deferredPrompt) {
			deferredPrompt.prompt();
			await deferredPrompt.userChoice;
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

{#if showPrompt && ready && !dismissed}
	<div class="install-prompt glass-card menu-surface animate-slide-up" role="dialog" aria-label="Install {brandName}">
		<img src="/icon-192.png" alt="" class="install-prompt-icon" />
		<div class="install-prompt-text">
			<div class="install-prompt-title">Install {brandName}</div>
			{#if mode === 'ios'}
				<div class="install-prompt-sub">
					Tap
					<svg class="install-prompt-glyph" viewBox="0 0 24 24" role="img" aria-label="Share"><path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>
					<strong>Share</strong>, then <strong>Add to Home Screen</strong>
				</div>
			{:else if mode === 'android'}
				<div class="install-prompt-sub">Open the browser menu <svg class="install-prompt-glyph" viewBox="0 0 24 24" role="img" aria-label="Menu"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>, then <strong>Add to Home screen</strong></div>
			{:else}
				<div class="install-prompt-sub">Full screen, one tap from your home screen</div>
			{/if}
		</div>
		{#if mode === 'native'}
			<button type="button" class="install-prompt-btn" onclick={install}>Install</button>
		{/if}
		<button type="button" class="install-prompt-close" aria-label="Dismiss" onclick={dismiss}>&times;</button>
	</div>
{/if}

<style>
	.install-prompt {
		position: fixed;
		z-index: 60;
		/* Centred with margins, not a transform: slide-up animates transform. */
		left: 0;
		right: 0;
		margin: 0 auto;
		bottom: calc(env(safe-area-inset-bottom, 0px) + 16px);
		width: min(440px, calc(100vw - 24px));
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 10px 12px 12px;
		border-radius: 18px;
		box-shadow: 0 12px 32px -8px rgba(0, 0, 0, 0.45);
	}
	/* Phones: the search is docked at the bottom, so sit just above it. */
	@media (max-width: 767px) {
		.install-prompt { bottom: calc(env(safe-area-inset-bottom, 0px) + 12px + 50px + 10px); }
	}
	.install-prompt-icon { width: 44px; height: 44px; border-radius: 11px; flex-shrink: 0; }
	.install-prompt-text { flex: 1; min-width: 0; }
	.install-prompt-title { font-size: 0.9rem; font-weight: 600; color: var(--color-content); }
	.install-prompt-sub { font-size: 0.75rem; line-height: 1.4; color: var(--color-content-dim); margin-top: 2px; }
	.install-prompt-sub strong { color: var(--color-content-muted); font-weight: 600; }
	.install-prompt-glyph {
		display: inline-block; width: 14px; height: 14px; vertical-align: -2px;
		fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
	}
	.install-prompt-btn {
		flex-shrink: 0;
		padding: 7px 14px;
		border-radius: 10px;
		border: none;
		background: var(--color-content);
		color: var(--color-surface, #09090b);
		font: inherit;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
	}
	.install-prompt-close {
		flex-shrink: 0;
		width: 28px; height: 28px;
		border: none; background: transparent;
		color: var(--color-content-dim);
		font-size: 1.25rem; line-height: 1;
		cursor: pointer;
	}
	.install-prompt-close:hover { color: var(--color-content); }
</style>
