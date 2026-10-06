<script>
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import Weather from './Weather.svelte';
	import { DAYS, MONTHS } from '$lib/constants.js';
	import { fetchWeather, reverseGeocode } from '$lib/weather.js';
	// lat/lon are the user's chosen location (device or a searched place);
	// without one, the weather pill offers to set it. placeName is set for a
	// searched place, which needs no reverse lookup.
	let { lat, lon, placeName = '', locationSource = null, showWeather = true } = $props();

	let weatherData = $state(null);
	let weatherLoaded = $state(false);
	let locationName = $state('');
	let now = $state(new Date());

	function formatTime() {
		const hours = String(now.getHours()).padStart(2, '0');
		const minutes = String(now.getMinutes()).padStart(2, '0');
		return `${hours}:${minutes}`;
	}

	function formatDate() {
		const d = now;
		const day = DAYS[d.getDay()].slice(0, 3);
		const month = MONTHS[d.getMonth()].slice(0, 3);
		const date = d.getDate();
		return `${day} · ${month} ${date}`;
	}

	$effect(() => {
		weatherData = null;
		weatherLoaded = false;
		locationName = '';
		if (!browser || !showWeather || !(lat && lon)) return;
		let stale = false;
		if (placeName) locationName = placeName;
		else reverseGeocode(lat, lon).then((n) => { if (!stale) locationName = n; });
		fetchWeather(lat, lon).then((d) => { if (!stale) { weatherData = d; weatherLoaded = true; } });
		return () => { stale = true; };
	});

	let headerEl;
	onMount(() => {
		const timer = setInterval(() => { now = new Date(); }, 60000);
		// Toggle a blurred backdrop on the sticky header only once the
		// page has scrolled a bit — keeps the at-rest top-of-page clean.
		const onScroll = () => headerEl?.classList.toggle('is-stuck', window.scrollY > 8);
		onScroll();
		window.addEventListener('scroll', onScroll, { passive: true });
		return () => {
			clearInterval(timer);
			window.removeEventListener('scroll', onScroll);
		};
	});
</script>

<!-- Compact status-bar header: a single mono row with time · date on the
     left and weather/location on the right. Clock is the anchor but no
     longer the visual hero — the search palette below is. -->
<div bind:this={headerEl} class="dashboard-header mb-8 max-md:mb-6 flex justify-between items-center gap-3 text-[0.85rem] max-md:text-[0.75rem] font-mono tracking-[0.12em] uppercase">
	<div class="flex items-baseline gap-3 min-w-0 flex-wrap">
		<span class="text-[1.35rem] max-md:text-[1.1rem] font-semibold text-content tabular-nums tracking-tight normal-case">{formatTime()}</span>
		<span class="text-content-muted">{formatDate()}</span>
	</div>
	<div class="flex items-center gap-3 shrink-0">
		{#if showWeather}<Weather {weatherData} {weatherLoaded} {locationName} hasLocation={!!(lat && lon)} source={locationSource === 'manual' ? 'manual' : 'device'} />{/if}
	</div>
</div>
