<script>
	import { WEATHER_MAP } from '$lib/constants.js';
	import AnimatedNumber from './AnimatedNumber.svelte';

	let { weatherData, locationName } = $props();

	const weatherInfo = $derived(
		weatherData ? (WEATHER_MAP[weatherData.code] || [null, 'Unknown']) : null
	);
</script>

{#if weatherData && weatherInfo}
	<div class="shrink-0 animate-fade-in flex items-center gap-1.5 text-[0.85rem] max-md:text-[0.75rem] tracking-[0.12em] uppercase text-content">
		<div class="w-3.5 h-3.5 shrink-0 opacity-85">{@html weatherInfo[0]}</div>
		<span class="tabular-nums normal-case font-medium">
			<AnimatedNumber value={weatherData.temp} />&deg;
		</span>
		{#if locationName}
			<span class="text-content-muted hidden md:inline">·</span>
			<span class="text-content-muted hidden md:inline">{locationName}</span>
		{/if}
	</div>
{/if}
