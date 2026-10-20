<script>
	import { getContext } from 'svelte';
	import { watchImage } from '$lib/imageLoad.js';
	import { getWallpaperUrl, getWallpaperOriginalUrl } from '$lib/wallpaper.js';

	let { wallpaperId = null } = $props();
	const wallpapers = getContext('config')?.wallpapers;
	let loaded = $state(false);
	let failed = $state(false);
	let imgSrc = $derived(getWallpaperUrl(wallpaperId, wallpapers?.count));
	// The original, swapped in over the 1920px image once it has loaded, on a
	// screen with more pixels than that. Without a resizer the first image
	// already is the original.
	let fullSrc = $state('');
	let fullShown = $state(false);

	// Reset load state when wallpaper changes
	$effect(() => {
		imgSrc;
		loaded = false;
		failed = false;
		fullSrc = '';
		fullShown = false;
	});

	let img = $state(null);
	$effect(() => {
		if (img) return watchImage(img, { onload: () => loaded = true, onerror: () => failed = true });
	});

	$effect(() => {
		if (!loaded || !img || !wallpapers?.resized) return;
		if (screen.width * devicePixelRatio <= 1920) return;
		const shown = img.naturalWidth;
		const src = getWallpaperOriginalUrl(wallpaperId, wallpapers?.count);
		const pre = new Image();
		pre.onload = () => { if (pre.naturalWidth > shown) fullSrc = src; };
		pre.src = src;
		return () => { pre.onload = null; };
	});

	let fullImg = $state(null);
	$effect(() => {
		if (fullImg) return watchImage(fullImg, { onload: () => fullShown = true });
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
			bind:this={img}
		/>
		{/key}
		{#if fullSrc}
			<img
				src={fullSrc}
				alt=""
				class="absolute inset-0 w-full h-full object-cover transition-opacity duration-700 {fullShown ? 'opacity-100' : 'opacity-0'}"
				bind:this={fullImg}
			/>
		{/if}
	{/if}
</div>
<div class="fixed inset-0 -z-10 pointer-events-none" style="background: linear-gradient(to right, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.35) 100%);"></div>
