<script>
	import { getIconSrc, getIconClass, handleIconError, getBrandIconClass, getBrandBgStyle } from '$lib/iconHelpers.js';

	let {
		icon = null,
		name = '',
		size = 'w-5 h-5',
		wrapSize = 'w-8 h-8',
		iconStyle = 'colored',
		wrap = false,
		className = ''
	} = $props();

	let failed = $state(false);
	let letterEl = $state(null);
	let fontSize = $state('0.6rem');

	const src = $derived(icon ? getIconSrc(iconStyle, icon) : null);
	const imgClass = $derived(
		iconStyle === 'colored' ? getBrandIconClass(iconStyle, icon) : getIconClass(iconStyle, icon)
	);
	const letter = $derived((name || '?')[0].toUpperCase());
	const wrapBg = $derived(icon && iconStyle === 'colored' ? getBrandBgStyle(icon) : '');

	$effect(() => {
		if (letterEl) {
			fontSize = `${Math.round(letterEl.offsetWidth * 0.55)}px`;
		}
	});

	function onError(e) {
		const before = e.target.getAttribute('src');
		if (icon) handleIconError(e, icon);
		// No fallback to swap to (the failing URL already was the fallback):
		// show the letter now rather than a blank tile.
		if (e.target.getAttribute('src') === before || !e.target.src || e.target.src === window.location.href) {
			failed = true;
		} else {
			e.target.onerror = () => { failed = true; };
		}
	}
</script>

{#if wrap}
	<div class="app-icon-wrap {wrapSize} rounded-[22%] flex items-center justify-center relative overflow-hidden shrink-0 bg-surface-card-strong {className}" class:is-brand={src && !failed && iconStyle === 'colored' && icon?.brandExplicit && icon?.brandColor} style={src && !failed ? wrapBg : ''}>
		{#if src && !failed}
			<img {src} alt={name} class="{size} {imgClass}" onerror={onError} />
		{:else}
			<span
				bind:this={letterEl}
				class="{size} text-content-dim font-semibold flex items-center justify-center"
				style="font-size: {fontSize}; line-height: 1;"
			>{letter}</span>
		{/if}
	</div>
{:else}
	{#if src && !failed}
		<img {src} alt={name} class="{size} shrink-0 {imgClass} {className}" onerror={onError} />
	{:else}
		<span
			bind:this={letterEl}
			class="{size} shrink-0 text-content-dim font-semibold flex items-center justify-center {className}"
			style="font-size: {fontSize}; line-height: 1;"
		>{letter}</span>
	{/if}
{/if}
