<script>
	import { getWallpaperUrl } from '$lib/wallpaper.js';

	let { wallpaperId = null } = $props();
	let loaded = $state(false);
	let failed = $state(false);
	let imgSrc = $derived(getWallpaperUrl(wallpaperId));

	// Reset load state when wallpaper changes
	$effect(() => {
		imgSrc;
		loaded = false;
		failed = false;
	});
</script>

<div class="dashboard-wallpaper fixed inset-0 -z-20 {failed ? 'bg-surface' : ''}">
	{#if imgSrc && !failed}
		{#key imgSrc}
		<img
			src={imgSrc}
			alt=""
			fetchpriority="high"
			class="w-full h-full object-cover transition-opacity duration-700 {loaded ? 'opacity-100' : 'opacity-0'}"
			onload={() => loaded = true}
			onerror={() => failed = true}
		/>
		{/key}
	{/if}
</div>
<div class="fixed inset-0 -z-10 pointer-events-none" style="background: linear-gradient(to right, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.35) 100%);"></div>
