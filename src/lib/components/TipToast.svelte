<script>
	import { browser } from '$app/environment';
	import { getContext } from 'svelte';
	import { prefs } from '$lib/stores/prefs.js';
	import { resolveIcon } from '$lib/apps.js';
	import { getIconSrc, getIconClass, handleIconError } from '$lib/iconHelpers.js';
	import AppIcon from '$lib/components/AppIcon.svelte';

	let { onsetup = () => {}, hidden = false, hasTip = $bindable(false), tipData = $bindable(null) } = $props();

	const siteConfig = getContext('config');
	const tipsConfig = siteConfig?.tips || {};

	const iconStyle = $derived($prefs.iconStyle || 'colored');

	// Use explicit tips from config, or auto-derive from apps with setup guides
	function buildTips() {
		if (tipsConfig.items?.length) {
			return tipsConfig.items.map(t => ({
				id: t.id,
				text: t.text,
				icon: resolveIcon(t.icon),
				app: t.app || null
			}));
		}

		// Auto-derive: apps with setup guides become tips
		// Priority: security/vault → photos → cloud/storage → everything else
		const priorityKeywords = ['vault', 'password', 'bitwarden', 'photo', 'immich', 'cloud', 'nextcloud', 'paperless'];
		const appTips = (siteConfig?.apps || [])
			.flatMap(cat => cat.items || [])
			.filter(item => item.setup_guide)
			.map(item => ({
				id: item.id,
				text: `Set up ${item.name} — ${item.setup_guide.subtitle || item.name}`,
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

	let visible = $state(false);
	let dismissing = $state(false);
	let currentTip = $state(null);

	$effect(() => {
		if (!browser) return;
		const p = $prefs;
		if (!p.firstLoginAt) return;

		const daysSince = (Date.now() - new Date(p.firstLoginAt).getTime()) / (1000 * 60 * 60 * 24);
		if (daysSince > (tipsConfig.max_days || 7)) return;

		const dismissed = p.dismissedTips || [];
		const tip = tips.find(t => !dismissed.includes(t.id));
		if (!tip) return;

		currentTip = tip;
		hasTip = true;
		tipData = tip;
		const timer = setTimeout(() => { visible = true; }, 2000);
		return () => clearTimeout(timer);
	});

	function dismiss() {
		dismissing = true;
		setTimeout(() => {
			prefs.update(p => ({
				...p,
				dismissedTips: [...(p.dismissedTips || []), currentTip.id],
				lastTipDay: new Date().toISOString().slice(0, 10)
			}));
			visible = false;
			dismissing = false;
			currentTip = null;
			hasTip = false;
			tipData = null;
		}, 200);
	}

	export function dismissTip() { if (currentTip) dismiss(); }

	function handleSetup() {
		if (currentTip?.app) {
			onsetup(currentTip.app);
			dismiss();
		}
	}
</script>

{#if visible && currentTip}
	<!-- Desktop only floating toast — mobile uses badge + bottom sheet -->
	<div class="fixed z-50 bottom-20 right-6 max-w-[300px] max-md:hidden transition-opacity duration-300 {hidden ? 'opacity-0 pointer-events-none' : 'opacity-100'}">
		<div class="glass-card rounded-2xl p-4 shadow-theme relative {dismissing ? 'animate-toast-out' : 'animate-toast-in'}">
			<!-- Dismiss button -->
			<button
				onclick={dismiss}
				class="absolute top-2.5 right-2.5 w-6 h-6 flex items-center justify-center bg-transparent border-none text-content-dim hover:text-content-muted cursor-pointer transition-colors text-sm"
				aria-label="Dismiss tip"
			>&times;</button>

			<div class="flex items-start gap-3 pr-4">
				<!-- Icon -->
				<AppIcon icon={currentTip.icon} name={currentTip.app?.name || ''} size="w-5 h-5" wrapSize="w-9 h-9" {iconStyle} wrap className="opacity-80 mt-0.5" />

				<!-- Content -->
				<div class="flex-1 min-w-0">
					<p class="text-[0.8rem] text-content-muted leading-relaxed m-0 mb-2">{currentTip.text}</p>
					{#if currentTip.app}
						<button
							onclick={handleSetup}
							class="py-1.5 px-3.5 rounded-lg text-[0.75rem] font-medium font-mono cursor-pointer transition-colors duration-150 bg-surface-card-strong text-content border border-border-card hover:bg-surface-card-strong"
						>Set up</button>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

