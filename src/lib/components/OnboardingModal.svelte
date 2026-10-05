<script>
	import { dialog } from '$lib/actions/dialog.js';
	import { browser } from '$app/environment';
	import { getContext } from 'svelte';
	import { prefs } from '$lib/stores/prefs.js';
	import { getWallpaperUrl } from '$lib/wallpaper.js';
	import { resolveIcon } from '$lib/apps.js';
	import { getIconSrc, getIconClass, handleIconError } from '$lib/iconHelpers.js';
	import AppIcon from '$lib/components/AppIcon.svelte';

	const siteConfig = getContext('config');
	const brandName = siteConfig?.branding?.name || 'Hearth';
	const brandLogo = siteConfig?.branding?.logo;

	const iconStyle = $derived($prefs.iconStyle || 'colored');
	const onboardingConfig = siteConfig?.onboarding || {};
	const welcomeText = onboardingConfig.welcome_text || 'Your data stays on your hardware — no third-party clouds, no tracking, no ads.';
	const slideHeight = onboardingConfig.slide_height || null;
	const registrationConfig = siteConfig?.auth?.registration;
	const privacyConfig = siteConfig?.privacy || {};
	const privacyHtml = privacyConfig.html || null;

	let { oncomplete, authName = null, authUsername = null, devMode = false, isAdmin = false } = $props();

	let step = $state(authName ? 'onboarding' : 'welcome');
	let slide = $state(0);
	let acceptedTerms = $state(false);
	let showTerms = $state(false);
	let deferredPrompt = $state(null);
	let isMobile = $state(false);
	let isIOS = $state(false);
	let isStandalone = $state(false);
	let wallpaperUrl = $state('');
	let wallpaperLoaded = $state(false);
	const showWallpaper = $derived(($prefs.theme || 'auto') === 'auto');

	$effect(() => {
		if (!browser) return;
		wallpaperUrl = showWallpaper ? getWallpaperUrl() : '';
	});

	$effect(() => {
		if (!browser) return;
		isMobile = window.matchMedia('(max-width: 768px)').matches;
		isStandalone = window.matchMedia('(display-mode: standalone)').matches;
		isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

		const handler = (e) => {
			e.preventDefault();
			deferredPrompt = e;
		};
		window.addEventListener('beforeinstallprompt', handler);
		return () => window.removeEventListener('beforeinstallprompt', handler);
	});

	async function installApp() {
		if (deferredPrompt) {
			deferredPrompt.prompt();
			await deferredPrompt.userChoice;
			deferredPrompt = null;
		}
	}

	function next() {
		if (slide < totalSlides - 1) slide++;
	}

	function back() {
		if (slide > 0) slide--;
	}

	function finish() {
		step = 'done';
		prefs.update((p) => ({ ...p, name: authName, username: authUsername, onboarded: true, firstLoginAt: p.firstLoginAt || new Date().toISOString() }));
		oncomplete();
	}


	// Lock body scroll when any modal step is active
	$effect(() => {
		if (!browser) return;
		if (step === 'welcome' || step === 'onboarding') {
			document.body.style.overflow = 'hidden';
			return () => { document.body.style.overflow = ''; };
		}
	});

	// Derive services from apps config — use onboarding.services IDs if defined, otherwise auto-derive
	const allApps = siteConfig?.apps || [];
	const serviceConfig = onboardingConfig.services;
	const services = serviceConfig?.length
		? serviceConfig
			.map(s => {
				const app = allApps.find(a => a.id === s.id);
				if (!app || (app.admin_only && !isAdmin)) return null;
				return {
					name: app.name,
					desc: s.desc || app.setup_guide?.subtitle || '',
					icon: resolveIcon(app.icon, app.icon_mono, app.brandColor, app.brandFg, app.brandExplicit)
				};
			})
			.filter(Boolean)
		: allApps
			.filter(item => item.self_hosted && !item.admin_only)
			.map(item => ({
				name: item.name,
				desc: item.setup_guide?.subtitle || '',
				icon: resolveIcon(item.icon, item.icon_mono, item.brandColor, item.brandFg, item.brandExplicit)
			}));

	function renderBold(text) {
		return text.replace(/\*\*(.*?)\*\*/g, '<strong class="text-content-muted">$1</strong>');
	}

	// Resolve icon string to an icon URL
	// Supports: "lucide:icon-name", direct URLs, or bare names (treated as lucide)
	function resolveSlideIcon(icon) {
		if (!icon) return null;
		if (icon.startsWith('http')) return icon;
		if (icon.startsWith('lucide:')) return `/api/icon/lucide/${icon.slice(7)}`;
		return `/api/icon/lucide/${icon}`;
	}


	// Per-type defaults for list-based slides
	const slideDefaults = {
		privacy: {
			icon: 'shield-check',
			title: 'Private by Design',
			subtitle: 'How we handle your data',
			items: [
				{ text: 'Your data lives on **our hardware** — never on third-party clouds' },
				{ text: '**Encrypted** storage with daily off-site backups' },
				{ text: '**No tracking**, no ads, no data selling — ever' },
				{ text: '**One login** for everything — secured with **two-factor authentication**' }
			]
		},
		security: {
			icon: 'lock',
			title: 'Stay Safe Online',
			subtitle: 'Tips to protect your accounts',
			items: [
				{ title: 'Use strong passwords', desc: 'Use a password manager and never reuse passwords across sites' },
				{ title: 'Enable 2FA', desc: 'Use a TOTP app like Aegis or Google Authenticator for all your accounts' },
				{ title: 'Watch for phishing', desc: 'Only enter credentials at your auth provider' }
			]
		}
	};

	// Build slides from config — merge with type defaults for list-based slides
	const listTypes = new Set(['privacy', 'security', 'list']);
	// The old 'weather' slide asked for location up front; the location is
	// now set from the weather pill itself, so the type is skipped even when
	// an existing config still lists it.
	const configSlides = (onboardingConfig.slides || [{ type: 'welcome' }, { type: 'services' }]).filter(s => s.type !== 'weather');
	const slides = configSlides.map(s => {
		if (listTypes.has(s.type)) {
			const defaults = slideDefaults[s.type] || {};
			return { ...defaults, ...s, items: s.items || defaults.items || [] };
		}
		return s;
	});

	const totalSlides = slides.length;

	function currentSlideType() {
		return slides[slide]?.type;
	}
</script>

{#if step === 'welcome'}
	<div use:dialog class="fixed inset-0 flex flex-col items-center justify-center z-[100] p-4">
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
			<h2 class="text-[1.2rem] font-semibold mb-2">Welcome</h2>
			<p class="text-content-muted text-[0.85rem] mb-6">Sign in to continue.</p>
			<label class="inline-flex items-center gap-2.5 text-xs text-content-muted mb-5 cursor-pointer">
				<input type="checkbox" bind:checked={acceptedTerms} class="w-4 h-4 accent-zinc-300 shrink-0 cursor-pointer">
				<span>I agree to the <button type="button" class="bg-transparent border-none text-content font-mono text-xs cursor-pointer underline underline-offset-2 p-0 hover:text-content-dim" onclick={() => showTerms = !showTerms}>Privacy & Terms</button></span>
			</label>
			{#if showTerms}
				<div class="bg-surface-input border border-border-card rounded-[10px] p-4 mb-5 text-left max-h-[200px] overflow-y-auto">
					{#if privacyHtml}
						<div class="onboarding-privacy-md text-[0.7rem] text-content-muted leading-relaxed">{@html privacyHtml}</div>
					{:else if privacyConfig.sections?.length}
						{#each privacyConfig.sections as section, i}
							<p class="text-[0.7rem] text-content-muted leading-relaxed {i < privacyConfig.sections.length - 1 ? 'mb-2' : 'mb-0'}"><strong class="text-content">{section.title}:</strong> {section.items.join('. ')}.</p>
						{/each}
					{:else}
						<p class="text-[0.7rem] text-content-muted mb-0 leading-relaxed">Your data stays on our hardware. No tracking, no ads, no data selling.</p>
					{/if}
				</div>
			{/if}
			<button
				class="w-full py-3 px-4 border-none rounded-[10px] text-[0.9rem] font-medium font-mono cursor-pointer transition-[opacity,background] duration-200 login-btn mb-2 disabled:opacity-30 disabled:cursor-not-allowed"
				disabled={!acceptedTerms}
				onclick={() => window.location.href = devMode ? '/?user=demo' : '/auth/login'}
			>Sign in</button>
			{#if isMobile && !isStandalone}
				{#if isIOS}
					<p class="text-[0.75rem] text-content-dim mt-4">Tap <strong class="text-content-dim">Share</strong> then <strong class="text-content-dim">Add to Home Screen</strong> to install as an app</p>
				{:else if deferredPrompt}
					<button
						class="w-full py-3 px-4 rounded-[10px] text-[0.9rem] font-medium font-mono cursor-pointer transition-[opacity,background] duration-200 bg-transparent text-content-dim border border-border-card mt-3 hover:text-content"
						onclick={installApp}
					>Add to Home Screen</button>
				{/if}
			{/if}
		</div>
		{#if registrationConfig?.enabled && registrationConfig?.url}
		<p class="text-[0.75rem] text-content-dim mt-4 text-center animate-modal-enter">Don't have an account? <a href={registrationConfig.url} class="text-content-muted hover:text-content no-underline font-mono text-[0.75rem]">Register</a></p>
		{/if}
	</div>

{:else if step === 'onboarding'}
	<div use:dialog={{ label: 'Welcome' }} class="fixed inset-0 bg-surface-overlay backdrop-blur-[6px] flex items-center justify-center z-[100] p-4 animate-fade-in">
		<div class="bg-surface-modal-card backdrop-blur-[120px] border border-border-modal-card rounded-2xl w-full max-w-[480px] max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden animate-modal-enter shadow-theme">

			<!-- Slide content: one fixed height for every slide so the card doesn't
			     jump; on short screens it shrinks and scrolls, keeping the nav bar
			     on-screen. -->
			<div class="p-8 pb-0 flex flex-col overflow-x-hidden min-h-0 {slideHeight ? '' : 'h-[27rem] max-md:h-[33.5rem]'}" style={slideHeight ? `height: ${slideHeight}px` : ''}>
				{#key slide}
				<div class="flex-1 flex flex-col items-center justify-center animate-slide-in overflow-y-auto min-h-0">
				{#if currentSlideType() === 'welcome'}
					<div class="flex flex-col w-full">
						<div class="flex items-center justify-center mb-4">
						{#if brandLogo}
							<img src={brandLogo} alt="" class="w-9 h-9" />
						{:else}
							<svg viewBox="4 4 24 24" class="w-9 h-9 text-content" xmlns="http://www.w3.org/2000/svg">
								<circle cx="16" cy="16" r="9" fill="none" stroke="currentColor" stroke-width="1.5"/>
								<circle cx="16" cy="16" r="3" fill="currentColor"/>
							</svg>
						{/if}
						</div>
						<h2 class="text-[1.2rem] font-semibold mb-1 text-center">Welcome, {authName}</h2>
						<p class="text-content-dim text-[0.75rem] mb-5 text-center">{brandName}</p>
						<p class="text-content-muted text-[0.85rem] leading-relaxed text-center px-4">
							{welcomeText}
						</p>
					</div>

				{:else if currentSlideType() === 'services'}
					<div class="flex flex-col w-full">
						<h2 class="text-[1.2rem] font-semibold mb-1 text-center">What you get</h2>
						<p class="text-content-dim text-[0.75rem] mb-5 text-center">Included with your account — no extra cost</p>
						<div class="space-y-1">
							{#each services as svc, i}
								<div class="flex items-center gap-3 px-2 py-2.5 min-w-0 overflow-hidden">
									<AppIcon icon={svc.icon} name={svc.name} size="w-4 h-4" wrapSize="w-6 h-6" wrap />
									<span class="text-[0.8rem] text-content font-medium shrink-0">{svc.name}</span>
									{#if svc.desc}<span class="text-[0.7rem] text-content-dim ml-auto text-right truncate">{svc.desc}</span>{/if}
								</div>
							{/each}
						</div>
						<p class="text-content-dim/50 text-[0.7rem] mt-auto pt-4 text-center">All self-hosted on our hardware. Your data never leaves.</p>
					</div>

				{:else if currentSlideType() === 'privacy' || currentSlideType() === 'security' || currentSlideType() === 'list'}
					{@const s = slides[slide]}
					{@const defaultListIcon = resolveSlideIcon(s.list_icon || 'check')}
					<div class="flex flex-col w-full">
						{#if s.icon}
							<div class="flex items-center justify-center mb-4">
								<img src={resolveSlideIcon(s.icon)} alt="" class="w-9 h-9 slide-icon" onerror={(e) => e.target.style.display = 'none'} />
							</div>
						{/if}
						{#if s.title}<h2 class="text-[1.2rem] font-semibold mb-1 text-center">{s.title}</h2>{/if}
						{#if s.subtitle}
							<p class="text-content-dim text-[0.75rem] mb-5 text-center">{s.subtitle}</p>
						{/if}
						<div class="space-y-1">
							{#each s.items || [] as item}
								<div class="flex gap-3 items-start px-2 py-2.5">
									<img src={item.icon ? resolveSlideIcon(item.icon) : defaultListIcon} alt="" class="w-3.5 h-3.5 mt-0.5 shrink-0 list-icon" onerror={(e) => e.target.style.display = 'none'} />
									{#if item.title}
										<p class="text-content-muted text-[0.8rem] leading-relaxed m-0"><strong class="text-content">{item.title}</strong> — {item.desc}</p>
									{:else}
										<p class="text-content-muted text-[0.8rem] leading-relaxed m-0">{@html renderBold(item.text)}</p>
									{/if}
								</div>
							{/each}
						</div>
						{#if s.footer}
							<p class="text-content-dim/50 text-[0.7rem] mt-auto pt-4 text-center">{s.footer}</p>
						{/if}
					</div>

				{/if}
				</div>
				{/key}
			</div>

			<!-- Bottom bar: dots + navigation -->
			<div class="p-6 pt-4 flex items-center justify-between shrink-0">
				<!-- Dot indicators -->
				<div class="flex gap-3">
					{#each Array(totalSlides) as _, i}
						<!-- 6px dot, ~18x30px tap area via ::before -->
						<button
							class="relative w-1.5 h-1.5 rounded-full border-none cursor-pointer transition-all duration-200 p-0 before:absolute before:content-[''] before:-inset-x-1.5 before:-inset-y-3 {i === slide ? 'dot-active w-4' : 'dot-inactive'}"
							onclick={() => slide = i}
						></button>
					{/each}
				</div>

				<!-- Navigation buttons -->
				<div class="flex gap-2">
					<button
						class="py-2 px-5 rounded-lg text-[0.8rem] font-mono cursor-pointer transition-colors duration-150 bg-transparent text-content-dim border border-border-pill hover:text-content disabled:opacity-0 disabled:cursor-default"
						disabled={slide === 0}
						onclick={back}
					>Back</button>
					{#if slide === totalSlides - 1}
					<button
						class="py-2 px-5 rounded-lg text-[0.8rem] font-mono cursor-pointer transition-colors duration-150 login-btn"
						onclick={finish}
					>Get Started</button>
					{:else}
					<button
						class="py-2 px-5 rounded-lg text-[0.8rem] font-mono cursor-pointer transition-colors duration-150 bg-surface-card-strong text-content border border-border-card hover:bg-surface-card-strong disabled:opacity-0 disabled:cursor-default"
						disabled={slide === totalSlides - 1}
						onclick={next}
					>Next</button>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.onboarding-privacy-md :global(h1),
	.onboarding-privacy-md :global(h2),
	.onboarding-privacy-md :global(h3) {
		color: var(--text);
		font-weight: 600;
		margin-top: 0.5rem;
		margin-bottom: 0.125rem;
		font-size: 0.75rem;
	}
	.onboarding-privacy-md :global(p) { margin: 0.25rem 0; }
	.onboarding-privacy-md :global(ul) { padding-left: 1rem; margin: 0.125rem 0; }
	.onboarding-privacy-md :global(li) { margin-bottom: 0.0625rem; }
	.onboarding-privacy-md :global(strong) { color: var(--text); }
	@keyframes slide-in {
		from { opacity: 0; transform: translateY(8px); }
		to { opacity: 1; transform: translateY(0); }
	}
	:global(.animate-slide-in) {
		animation: slide-in 0.25s ease-out both;
	}
</style>
