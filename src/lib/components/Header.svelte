<script>
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import Weather from './Weather.svelte';
	import Upcoming from './Upcoming.svelte';
	import { DAYS, MONTHS } from '$lib/constants.js';
	import { fetchWeather, reverseGeocode } from '$lib/weather.js';
	import { prefs } from '$lib/stores/prefs.js';
	import { clockParts, TIME_FORMATS, DEFAULT_TIME_FORMAT } from '$lib/units.js';
	import UnitPicker from './UnitPicker.svelte';
	// lat/lon are the user's chosen location (device or a searched place);
	// without one, the weather pill offers to set it. placeName is set for a
	// searched place, which needs no reverse lookup.
	let { lat, lon, placeName = '', locationSource = null, showWeather = true } = $props();

	let weatherData = $state(null);
	let weatherLoaded = $state(false);
	let locationName = $state('');
	let now = $state(new Date());

	const clock = $derived(clockParts(now, $prefs.timeFormat));

	// The clock opens a small menu for its time format.
	let clockOpen = $state(false);
	let clockEl = $state();
	$effect(() => {
		if (!clockOpen) return;
		const onDown = (e) => { if (!clockEl?.contains(e.target)) clockOpen = false; };
		const onKey = (e) => {
			if (e.key !== 'Escape') return;
			clockOpen = false;
			clockEl?.querySelector('button')?.focus();
		};
		document.addEventListener('pointerdown', onDown);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('pointerdown', onDown);
			document.removeEventListener('keydown', onKey);
		};
	});

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

	onMount(() => {
		const timer = setInterval(() => { now = new Date(); }, 60000);
		return () => clearInterval(timer);
	});
</script>

<!-- Compact status-bar header: a single mono row with time · date on the
     left and weather/location on the right. Clock is the anchor but no
     longer the visual hero — the search palette below is. -->
<div class="dashboard-header mb-8 max-md:mb-6 flex justify-between items-center max-md:items-start gap-3 text-[0.85rem] max-md:text-[0.75rem] font-mono tracking-[0.12em] uppercase">
	<div class="flex flex-col gap-1 min-w-0">
		<div class="relative self-start" bind:this={clockEl}>
			<button
				type="button"
				class="header-trigger items-baseline gap-3 min-w-0 max-md:h-7 max-md:leading-7 bg-transparent cursor-pointer font-mono tracking-[0.12em] uppercase text-left"
				aria-haspopup="dialog"
				aria-expanded={clockOpen}
				title="Time format"
				onclick={() => (clockOpen = !clockOpen)}
			>
				<span class="text-[1.35rem] max-md:text-[1.1rem] font-semibold text-content tabular-nums tracking-tight normal-case">{clock.time}{#if clock.dayPeriod}<span class="clock-period">{clock.dayPeriod}</span>{/if}</span>
				<span class="text-content-muted whitespace-nowrap">{formatDate()}</span>
			</button>
			{#if clockOpen}
				<div
					class="absolute left-0 top-full mt-2 z-[70] w-[17rem] glass-card menu-surface rounded-xl shadow-theme animate-menu-up normal-case tracking-normal font-mono text-content px-4 pt-2.5 pb-3"
					role="dialog"
					aria-label="Time format"
				>
					<UnitPicker key="timeFormat" label="Time format" options={TIME_FORMATS} fallback={DEFAULT_TIME_FORMAT} compact />
				</div>
			{/if}
		</div>
		<Upcoming />
	</div>
	<div class="flex items-center gap-3 shrink-0">
		{#if showWeather}<Weather {weatherData} {weatherLoaded} {locationName} hasLocation={!!(lat && lon)} source={locationSource === 'manual' ? 'manual' : 'device'} />{/if}
	</div>
</div>

<style>
	/* AM/PM rides beside the digits, small, so the time still leads. */
	.clock-period {
		margin-left: 0.3em;
		font-size: 0.55em;
		font-weight: 500;
		letter-spacing: 0.08em;
		color: var(--color-content-muted);
	}
</style>
