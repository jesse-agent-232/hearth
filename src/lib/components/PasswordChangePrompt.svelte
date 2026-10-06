<script>
	import { dialog } from '$lib/actions/dialog.js';
	import { getContext } from 'svelte';
	import { prefs } from '$lib/stores/prefs.js';
	import { getWallpaperUrl } from '$lib/wallpaper.js';
	import { browser } from '$app/environment';

	const siteConfig = getContext('config');
	const passwordChangeUrl = siteConfig?.auth?.password_change_url;
	const brandName = siteConfig?.branding?.name || 'Holm';
	const brandLogo = siteConfig?.branding?.logo;

	let wallpaperUrl = $state('');
	let wallpaperLoaded = $state(false);
	const showWallpaper = $derived(($prefs.theme || 'auto') === 'auto');

	$effect(() => {
		if (!browser) return;
		wallpaperUrl = showWallpaper ? getWallpaperUrl() : '';
	});

	// Block access until password is changed (first login = no passwordVerified flag)
	const blocked = $derived(
		!!passwordChangeUrl &&
		!$prefs.passwordVerified &&
		!!$prefs.firstLoginAt
	);

	function handleChanged() {
		prefs.update(p => ({ ...p, passwordVerified: true }));
	}
</script>

{#if blocked}
	<div use:dialog class="fixed inset-0 flex flex-col items-center justify-center z-[200] p-4">
		<!-- Wallpaper background -->
		<div class="fixed inset-0 -z-20 bg-surface">
			{#if wallpaperUrl}
				<img src={wallpaperUrl} alt="" loading="lazy" decoding="async" class="w-full h-full object-cover transition-opacity duration-700 {wallpaperLoaded ? 'opacity-100' : 'opacity-0'}" onload={() => wallpaperLoaded = true} />
			{/if}
		</div>
		<div class="fixed inset-0 -z-10 pointer-events-none backdrop-blur-[6px] login-overlay"></div>

		<div class="bg-surface-modal-card backdrop-blur-[80px] border border-border-modal-card rounded-2xl p-8 w-full max-w-[360px] text-center shadow-theme animate-modal-enter">
			{#if brandLogo}
				<img src={brandLogo} alt="" class="w-12 h-12 mx-auto mb-4" />
			{:else}
				<svg viewBox="4 4 24 24" class="w-12 h-12 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg">
					<circle cx="16" cy="16" r="9" fill="none" stroke="currentColor" stroke-width="1.5"/>
					<circle cx="16" cy="16" r="3" fill="currentColor"/>
				</svg>
			{/if}
			<span class="text-[0.65rem] text-content-muted uppercase tracking-[0.2em] mb-3 block">{brandName}</span>
			<h2 class="text-[1.2rem] font-semibold mb-2">Change your password</h2>
			<p class="text-content-muted text-[0.85rem] mb-6">
				Change your default password to something only you know before continuing.
			</p>

			<a
				href={passwordChangeUrl}
				style="border: none;"
				class="block w-full py-3 px-4 rounded-[10px] text-[0.9rem] font-medium font-mono text-center no-underline cursor-pointer transition-[opacity,background] duration-200 login-btn mb-2"
			>Reset password</a>

			<button
				class="w-full py-3 px-4 rounded-[10px] text-[0.9rem] font-medium font-mono cursor-pointer transition-colors duration-200 bg-surface-card-strong text-content border border-border-card mt-3 hover:bg-surface-card-strong"
				onclick={handleChanged}
			>I've changed my password</button>
		</div>
	</div>
{/if}

