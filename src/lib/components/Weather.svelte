<script>
	import { WEATHER_MAP } from '$lib/constants.js';
	import { prefs } from '$lib/stores/prefs.js';
	import { searchPlaces } from '$lib/weather.js';
	import AnimatedNumber from './AnimatedNumber.svelte';

	// Until a location is chosen the pill reads "Set location", and its first
	// click asks the browser. source: 'device' | 'manual'.
	// weatherLoaded: the forecast request has settled (weatherData may still be
	// null if it failed) — the pill stays so the menu stays reachable.
	let { weatherData, weatherLoaded = false, locationName, hasLocation = false, source } = $props();

	let open = $state(false);
	let rootEl = $state();
	let pillEl = $state();
	let menuEl = $state();
	let query = $state('');
	let results = $state([]);
	let status = $state('');
	let busy = $state(false);

	const weatherInfo = $derived(
		weatherData ? (WEATHER_MAP[weatherData.code] || [null, 'Unknown']) : null
	);
	const laterInfo = $derived(
		weatherData?.later ? (WEATHER_MAP[weatherData.later.code] || [null, 'Unknown']) : null
	);
	// The "later" forecast is a fixed few hours ahead; in the evening that
	// lands after midnight, where "later today" would be wrong.
	const laterWhen = $derived.by(() => {
		if (!weatherData?.later) return '';
		const at = new Date(Date.now() + (weatherData.later.hours ?? 6) * 3600e3);
		return at.getDate() === new Date().getDate() ? 'later today' : 'overnight';
	});
	const sourceLabel = $derived(
		source === 'manual' ? 'Address you set' : 'From your device location'
	);

	function close() {
		open = false;
		results = [];
		status = '';
	}

	function setLocation(fields) {
		prefs.update((p) => ({ ...p, ...fields }));
		close();
	}

	function detect() {
		if (!navigator.geolocation) {
			status = 'This browser can’t share its location. Set an address instead.';
			return;
		}
		busy = true;
		status = '';
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				busy = false;
				setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude, locationSource: 'device', locationName: null });
			},
			(err) => {
				busy = false;
				status = err.code === err.PERMISSION_DENIED
					? 'Location is blocked for this site. Allow it in the browser’s site settings, or set an address.'
					: 'Couldn’t get your location. Try again, or set an address.';
			},
			{ timeout: 15000 }
		);
	}

	// Search as you type: debounced, and only the newest query's answer
	// lands, so a slow early response can't overwrite a later one.
	let searchTimer;
	let searchSeq = 0;
	let searching = $state(false);
	let active = $state(0);

	function onAddressInput() {
		clearTimeout(searchTimer);
		const q = query.trim();
		const seq = ++searchSeq;
		status = '';
		if (q.length < 2) {
			results = [];
			searching = false;
			return;
		}
		searching = true;
		searchTimer = setTimeout(async () => {
			try {
				const found = await searchPlaces(q);
				if (seq !== searchSeq) return;
				results = found;
				active = 0;
				if (!found.length) status = `No places found for “${q}”.`;
			} catch {
				if (seq !== searchSeq) return;
				results = [];
				status = 'Address search failed. Check your connection and try again.';
			} finally {
				if (seq === searchSeq) searching = false;
			}
		}, 250);
	}

	function onAddressKeydown(e) {
		if (!results.length) return;
		if (e.key === 'ArrowDown') active = (active + 1) % results.length;
		else if (e.key === 'ArrowUp') active = (active - 1 + results.length) % results.length;
		else return;
		e.preventDefault();
	}

	function search(e) {
		e.preventDefault();
		if (results[active]) pick(results[active]);
	}

	function pick(place) {
		clearTimeout(searchTimer);
		searchSeq++;
		searching = false;
		query = '';
		setLocation({ lat: place.latitude, lon: place.longitude, locationSource: 'manual', locationName: place.name });
	}

	function toggle() {
		if (open) return close();
		open = true;
		if (!hasLocation) detect();
	}

	const placeLabel = (r) => [r.name, r.admin1, r.country].filter(Boolean).join(', ');

	$effect(() => {
		if (!open) return;
		const onDown = (e) => { if (!rootEl?.contains(e.target)) close(); };
		const onKey = (e) => {
			if (e.key !== 'Escape') return;
			close();
			pillEl?.focus();
		};
		// Move focus into the panel so keyboard users land on its first action.
		queueMicrotask(() => menuEl?.querySelector('button:not([disabled]), input')?.focus());
		document.addEventListener('pointerdown', onDown);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('pointerdown', onDown);
			document.removeEventListener('keydown', onKey);
		};
	});
</script>

{#if !hasLocation || weatherInfo || weatherLoaded}
	<div class="relative shrink-0" bind:this={rootEl}>
		<button
			bind:this={pillEl}
			class="animate-fade-in flex items-center gap-1.5 text-[0.85rem] max-md:text-[0.75rem] tracking-[0.12em] uppercase text-content font-mono bg-transparent border-none p-0 cursor-pointer hover:opacity-80"
			aria-haspopup="dialog"
			aria-expanded={open}
			title="Weather and location"
			onclick={toggle}
		>
			{#if weatherInfo}
				<span class="w-3.5 h-3.5 shrink-0 opacity-85">{@html weatherInfo[0]}</span>
				<span class="tabular-nums normal-case font-medium">
					<AnimatedNumber value={weatherData.temp} />&deg;
				</span>
				{#if locationName}
					<span class="text-content-muted hidden md:inline">·</span>
					<span class="text-content-muted hidden md:inline">{locationName}</span>
				{/if}
			{:else}
				<svg class="w-3.5 h-3.5 shrink-0 opacity-85" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>
				<span class="text-content-muted">{hasLocation ? locationName || 'Weather unavailable' : 'Set location'}</span>
			{/if}
		</button>

		{#if open}
			<div
				class="weather-menu absolute right-0 top-full mt-2 z-[70] w-[18rem] max-w-[calc(100vw-2rem)] glass-card menu-surface rounded-xl shadow-theme animate-menu-up normal-case tracking-normal text-[0.78rem] font-mono text-content overflow-hidden"
				bind:this={menuEl}
				role="dialog"
				aria-label="Weather and location"
			>
				{#if hasLocation && laterInfo}
					<div class="flex items-center gap-2.5 px-4 py-3">
						<span class="w-4 h-4 shrink-0 text-content-muted">{@html laterInfo[0]}</span>
						<span><span class="tabular-nums">{weatherData.later.temp}&deg;</span> {laterInfo[1].toLowerCase()} {laterWhen}</span>
					</div>
				{/if}
				{#if hasLocation}
				<div class="flex items-start gap-2.5 px-4 py-3 border-t border-border-card">
					<svg class="w-4 h-4 shrink-0 mt-0.5 text-content-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>
					<div class="min-w-0">
						<div class="truncate">{locationName ? `Weather for ${locationName}` : 'Weather for your area'}</div>
						<div class="text-[0.7rem] text-content-dim">{sourceLabel}</div>
					</div>
				</div>
				{/if}
				<div class="py-1 {hasLocation ? 'border-t border-border-card' : ''}">
					<button
						class="flex items-center gap-2.5 w-full px-4 py-2.5 text-left bg-transparent border-none cursor-pointer text-content font-mono text-[0.78rem] hover:bg-surface-card-hover disabled:opacity-60 disabled:cursor-default"
						disabled={busy}
						onclick={detect}
					>
						<svg class="w-4 h-4 shrink-0 text-content-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="7"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
						{busy && !hasLocation ? 'Asking your browser…' : 'Detect location'}
					</button>
					{#if hasLocation}
						<button
							class="flex items-center gap-2.5 w-full px-4 py-2.5 text-left bg-transparent border-none cursor-pointer text-content font-mono text-[0.78rem] hover:bg-surface-card-hover"
							onclick={() => setLocation({ lat: null, lon: null, locationSource: null, locationName: null })}
						>
							<svg class="w-4 h-4 shrink-0 text-content-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
							Forget location
						</button>
					{/if}
				</div>
				<form class="px-4 pt-2 pb-3 border-t border-border-card" onsubmit={search}>
					<label for="weather-address" class="block mb-1.5 text-[0.7rem] text-content-muted">Set custom address</label>
					<div class="relative">
						<input
							id="weather-address"
							role="combobox"
							aria-expanded={results.length > 0}
							aria-controls="weather-address-results"
							aria-activedescendant={results.length ? `weather-place-${active}` : undefined}
							oninput={onAddressInput}
							onkeydown={onAddressKeydown}
							class="w-full min-w-0 pr-8 bg-surface-input border border-border-input rounded-lg px-3 py-2 text-[0.78rem] text-content font-mono placeholder:text-content-dim outline-none focus:border-border-pill"
							placeholder="City or address"
							autocomplete="off"
							bind:value={query}
						/>
						{#if searching}
							<span class="launcher-spinner absolute right-3 top-1/2 -translate-y-1/2" role="status" aria-label="Searching"></span>
						{/if}
					</div>
					{#if results.length}
						<ul id="weather-address-results" class="mt-2 list-none p-0 m-0" role="listbox" aria-label="Places">
							{#each results as r, i (r.id)}
								<!-- Keyboard lives on the input (combobox + aria-activedescendant). -->
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<li
									id="weather-place-{i}"
									role="option"
									aria-selected={i === active}
									class="w-full px-2 py-2 rounded-lg cursor-pointer text-content font-mono text-[0.75rem] {i === active ? 'bg-surface-card-hover' : ''}"
									onpointermove={() => (active = i)}
									onmousedown={(e) => e.preventDefault()}
									onclick={() => pick(r)}
								>{placeLabel(r)}</li>
							{/each}
						</ul>
					{/if}
					{#if status}
						<p class="mt-2 mb-0 text-[0.7rem] text-content-muted" role="status">{status}</p>
					{/if}
				</form>
			</div>
		{/if}
	</div>
{/if}
