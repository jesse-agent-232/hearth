<script>
	import { browser } from '$app/environment';
	import { getContext } from 'svelte';
	import { prefs } from '$lib/stores/prefs.js';
	import { resolveIcon } from '$lib/apps.js';
	import { handleIconError } from '$lib/iconHelpers.js';
	import AppIcon from '$lib/components/AppIcon.svelte';

	let { onsetup = () => {} } = $props();

	const siteConfig = getContext('config');
	const tipsConfig = siteConfig?.tips || {};

	function buildTips() {
		if (tipsConfig.items?.length) {
			return tipsConfig.items.map(t => ({
				id: t.id,
				text: t.text,
				icon: resolveIcon(t.icon),
				app: t.app || null
			}));
		}

		const priorityKeywords = ['vault', 'password', 'bitwarden', 'photo', 'immich', 'cloud', 'nextcloud', 'paperless'];
		const appTips = (siteConfig?.apps || [])
			.flatMap(cat => cat.items || [])
			.filter(item => item.setup_guide)
			.map(item => ({
				id: item.id,
				text: item.setup_guide.tip || item.setup_guide.subtitle || `Set up ${item.name}`,
				icon: resolveIcon(item.icon),
				app: item.name,
				_priority: priorityKeywords.findIndex(k => item.name.toLowerCase().includes(k) || (item.icon || '').toLowerCase().includes(k))
			}))
			.sort((a, b) => {
				const pa = a._priority >= 0 ? a._priority : 999;
				const pb = b._priority >= 0 ? b._priority : 999;
				return pa - pb;
			});

		const genericTips = [
			{ id: 'context-menu', text: 'Long-press any app icon for download links & setup guides', icon: null, app: null },
			{ id: '2fa', text: 'Enable 2FA on your account for extra security', icon: resolveIcon('auth'), app: null }
		];

		return [...appTips, ...genericTips];
	}

	const tips = buildTips();
	let currentTip = $state(null);
	let dismissing = $state(false);

	$effect(() => {
		if (!browser) return;
		const p = $prefs;

		// If auth is enabled, check firstLoginAt and max_days
		if (p.firstLoginAt) {
			const daysSince = (Date.now() - new Date(p.firstLoginAt).getTime()) / (1000 * 60 * 60 * 24);
			if (daysSince > (tipsConfig.max_days || 7)) return;
		}

		const dismissed = p.dismissedTips || [];
		currentTip = tips.find(t => !dismissed.includes(t.id)) || null;
	});

	function dismiss() {
		dismissing = true;
		setTimeout(() => {
			prefs.update(p => ({
				...p,
				dismissedTips: [...(p.dismissedTips || []), currentTip.id],
				lastTipDay: new Date().toISOString().slice(0, 10)
			}));
			currentTip = null;
			dismissing = false;
		}, 200);
	}

	function handleSetup() {
		if (currentTip?.app) {
			onsetup(currentTip.app);
			dismiss();
		}
	}
</script>

{#if currentTip}
	<div class="flex items-center justify-center py-4 transition-opacity duration-200 {dismissing ? 'opacity-0' : 'opacity-100'}">
		<div class="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border-card/50 bg-surface-card/30 backdrop-blur-sm max-md:mx-4 max-md:rounded-xl max-md:px-3.5 max-md:py-2">
		{#if currentTip.icon}
			<AppIcon icon={currentTip.icon} name={currentTip.app?.name || ''} size="w-3.5 h-3.5" wrapSize="w-5 h-5" iconStyle="white" wrap className="opacity-50" />
		{/if}
		<span class="text-[0.7rem] text-content-muted/80 min-w-0">{currentTip.text}</span>

		{#if currentTip.app}
			<button
				onclick={handleSetup}
				class="text-[0.7rem] font-medium font-mono text-content-muted hover:text-content bg-transparent border-none cursor-pointer transition-colors underline decoration-content-dim/40 underline-offset-2 shrink-0 whitespace-nowrap"
			>Set up</button>
		{/if}

		<button
			onclick={dismiss}
			class="text-content-dim/40 hover:text-content-muted bg-transparent border-none cursor-pointer transition-colors text-sm leading-none shrink-0"
			aria-label="Dismiss tip"
		>&times;</button>
		</div>
	</div>
{/if}
