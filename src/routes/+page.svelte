<script>
	import { prefs } from '$lib/stores/prefs.js';
	import { adminApps } from '$lib/stores/adminApps.js';
	import Header from '$lib/components/Header.svelte';
	import WidgetGrid from '$lib/components/WidgetGrid.svelte';

	import Footer from '$lib/components/Footer.svelte';
	import PrivacyTerms from '$lib/components/PrivacyTerms.svelte';
	import OnboardingModal from '$lib/components/OnboardingModal.svelte';
	import SettingsButton from '$lib/components/SettingsButton.svelte';
	import InstallPrompt from '$lib/components/InstallPrompt.svelte';
	import WallpaperBackground from '$lib/components/WallpaperBackground.svelte';

	import DynamicFavicon from '$lib/components/DynamicFavicon.svelte';
	import InlineTip from '$lib/components/InlineTip.svelte';
	import ManageApps from '$lib/components/ManageApps.svelte';
	import PasswordChangePrompt from '$lib/components/PasswordChangePrompt.svelte';

	import { browser } from '$app/environment';

	let { data } = $props();
	let privacyOpen = $state(false);
	let onboarded = $state(false);
	let prefsSynced = $state(false);
	let guideApp = $state(null);
	let menuOpen = $state(false);
	let manageAppsOpen = $state(false);
	let editMode = $state(false);

	import { buildAppsFromConfig } from '$lib/apps.js';
	import { getContext } from 'svelte';

	const siteConfig = getContext('config');
	const authEnabled = siteConfig?.auth?.enabled ?? false;
	const customizationEnabled = siteConfig?.customization?.enabled ?? false;
	const onboardingEnabled = siteConfig?.onboarding?.enabled ?? false;
	const wallpapersEnabled = siteConfig?.wallpapers?.enabled ?? false;
	const weatherConfigEnabled = siteConfig?.weather?.enabled ?? false;
	const tipsEnabled = siteConfig?.tips?.enabled ?? false;
	const privacyEnabled = siteConfig?.privacy?.enabled ?? false;
	const footerEnabled = siteConfig?.branding?.show_footer !== false;

	const searchConfigEnabled = siteConfig?.search?.enabled ?? false;
	const newsConfigEnabled = siteConfig?.news?.enabled ?? false;

	// Widget visibility: config enables feature, user prefs toggle per-user
	const userWidgets = $derived(new Set($prefs.enabledWidgets || ['weather', 'news', 'search']));
	const weatherEnabled = $derived(weatherConfigEnabled && userWidgets.has('weather'));
	const searchEnabled = $derived(searchConfigEnabled && userWidgets.has('search'));
	const newsEnabled = $derived(newsConfigEnabled && userWidgets.has('news'));

	const { apps: allApps, setupGuides } = buildAppsFromConfig(siteConfig?.apps);
	const tipApps = Object.fromEntries(
		allApps.filter(app => setupGuides[app.name]).map(app => [app.name, app])
	);

	const loggedIn = !!(data.authName);
	// No auth = always show dashboard (no login gate)
	const showDashboard = !authEnabled || loggedIn;

	// Dev mode: reset onboarding on every fresh load (no ?user param)
	if (browser && data.devMode && !loggedIn) {
		prefs.reset();
	}

	// Sync auth info into prefs on every authenticated load — wait for server state before rendering
	if (browser && loggedIn) {
		(async () => {
			prefs.update((p) => {
				return { ...p, name: data.authName, username: data.authUsername, firstLoginAt: p.firstLoginAt || new Date().toISOString() };
			});
			await prefs.syncFromServer();
			prefsSynced = true;
			adminApps.load();
		})();
	} else {
		prefsSynced = true;
	}

	$effect(() => {
		if (!onboardingEnabled || !authEnabled || (prefsSynced && $prefs.onboarded)) onboarded = true;
	});

	// Apply theme class to body
	const theme = $derived($prefs.theme || 'auto');
	$effect(() => {
		if (!browser) return;
		document.body.classList.remove('theme-light', 'theme-dark');
		if (theme === 'light') document.body.classList.add('theme-light');
		else if (theme === 'dark') document.body.classList.add('theme-dark');
	});


	// Silently refresh geolocation on load AND whenever the geolocation
	// permission flips to 'granted' (e.g. user enabled it via browser
	// settings after onboarding). Without the Permissions API listener,
	// granting access outside our UI required a page reload to take effect.
	$effect(() => {
		if (!browser || !weatherEnabled) return;
		let permStatus = null;
		let cancelled = false;

		function fetchAndStore() {
			navigator.geolocation?.getCurrentPosition(
				(pos) => {
					if (cancelled) return;
					const curLat = $prefs.lat;
					const curLon = $prefs.lon;
					const dlat = curLat ? Math.abs(pos.coords.latitude - curLat) : Infinity;
					const dlon = curLon ? Math.abs(pos.coords.longitude - curLon) : Infinity;
					if (!curLat || !curLon || dlat > 0.1 || dlon > 0.1) {
						prefs.update((p) => ({
							...p,
							lat: pos.coords.latitude,
							lon: pos.coords.longitude
						}));
					}
				},
				() => {}
			);
		}

		function onPermChange() {
			if (permStatus?.state === 'granted') fetchAndStore();
		}

		if (navigator.permissions?.query) {
			navigator.permissions
				.query({ name: 'geolocation' })
				.then((status) => {
					if (cancelled) return;
					permStatus = status;
					if (status.state === 'granted') fetchAndStore();
					status.addEventListener('change', onPermChange);
				})
				.catch(() => {
					// Permissions API rejected the descriptor — fall back to the
					// pre-existing behavior (only refresh if we already have
					// coords, i.e. user opted in during onboarding).
					if ($prefs.lat && $prefs.lon) fetchAndStore();
				});
		} else if ($prefs.lat && $prefs.lon) {
			fetchAndStore();
		}

		return () => {
			cancelled = true;
			permStatus?.removeEventListener('change', onPermChange);
		};
	});

	function onOnboardingComplete() {
		onboarded = true;
	}
</script>

{#if authEnabled && !loggedIn}
	<!-- Login screen (only when auth is enabled) -->
	<OnboardingModal oncomplete={onOnboardingComplete} authName={data.authName} authUsername={data.authUsername} devMode={data.devMode} />
{:else if showDashboard && prefsSynced}
	<!-- Password change gate (only when auth + password_change_url configured) -->
	{#if authEnabled}
		<PasswordChangePrompt />
	{/if}
	<!-- Dashboard -->
	{#if wallpapersEnabled && theme === 'auto' && ($prefs.wallpaperEnabled !== false)}
		<WallpaperBackground wallpaperId={$prefs.wallpaperId || null} />
	{/if}
<DynamicFavicon />
	<div class="w-full max-w-[1200px] px-16 pb-16 pt-[calc(1.5rem+env(safe-area-inset-top,0px))] max-lg:px-12 max-md:px-5 max-md:pb-[calc(6rem+env(safe-area-inset-bottom,0px))] max-md:pt-[calc(5.5rem+env(safe-area-inset-top,0px))] max-md:max-w-full max-xs:px-4 max-xs:pt-[calc(5.25rem+env(safe-area-inset-top,0px))] {$prefs.iconStyle === 'grayed' ? 'grayed-widgets' : ''} {wallpapersEnabled && theme === 'auto' && $prefs.wallpaperEnabled !== false ? 'wallpaper-active' : ''}">
		<div class="dashboard-header-wrap opacity-0 animate-fade-in [animation-fill-mode:both]">
			<Header lat={$prefs.lat} lon={$prefs.lon} hasLocation={!!($prefs.lat && $prefs.lon)} showWeather={weatherEnabled} headlines={newsEnabled ? data.news : []} />

		</div>
		<div class="opacity-0 animate-fade-in-up [animation-fill-mode:both] [animation-delay:75ms] relative z-20">
			<WidgetGrid isAdmin={data.isAdmin} bind:guideApp bind:editMode {searchEnabled} {customizationEnabled} onSettingsOpen={() => manageAppsOpen = true} />
		</div>
		<!-- Inline help tips disabled for now — revisit once the palette
		     layout is settled and we decide where tips fit in. -->
		{#if false && tipsEnabled}
			<div class="opacity-0 animate-fade-in [animation-fill-mode:both] [animation-delay:250ms]">
				<InlineTip onsetup={(appName) => { guideApp = tipApps[appName] || null; }} />
			</div>
		{/if}
		{#if footerEnabled}
			<div class="opacity-0 animate-fade-in [animation-fill-mode:both] [animation-delay:300ms]">
				<Footer onOpenPrivacy={privacyEnabled ? () => privacyOpen = true : null} />
			</div>
		{/if}
	</div>
	{#if privacyEnabled}
		<PrivacyTerms bind:open={privacyOpen} standalone />
	{/if}
	<SettingsButton bind:open={menuOpen} onmanageapps={customizationEnabled ? () => manageAppsOpen = true : null} showAuth={authEnabled} />
	{#if customizationEnabled}
		<ManageApps bind:open={manageAppsOpen} isAdmin={data.isAdmin} />
	{/if}
	<InstallPrompt devMode={data.devMode} />

	<!-- Post-login onboarding (only when auth + onboarding enabled) -->
	{#if authEnabled && onboardingEnabled && !onboarded}
		<OnboardingModal oncomplete={onOnboardingComplete} authName={data.authName} authUsername={data.authUsername} devMode={data.devMode} />
	{/if}
{/if}
