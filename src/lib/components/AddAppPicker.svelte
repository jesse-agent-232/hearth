<script>
	import { browser } from '$app/environment';
	import { portal } from '$lib/actions/portal.js';
	import { resolveIcon } from '$lib/apps.js';
	import { getBrandBgStyle } from '$lib/iconHelpers.js';
	import AppIcon from '$lib/components/AppIcon.svelte';

	// The edit-mode "Add" tile's list: apps not on the surface, then
	// popular bookmarks.
	let { anchor, trayApps, popularSuggestions, iconStyle, onplace, onplacepopular, onclose } = $props();

	let pickerEl = $state(null);
	// Anchor coords for the fixed-positioned picker. Recomputed on open and
	// on scroll/resize. Picker centers horizontally over the button and drops
	// below it; if it would overflow the viewport bottom, it flips above.
	let pickerCoords = $state({ left: 0, top: 0, placement: 'below' });

	function computePickerCoords() {
		if (!anchor) return;
		const r = anchor.getBoundingClientRect();
		const pickerWidth = 220;
		const pickerHeight = 280;
		const gap = 8;
		const margin = 12;
		// Horizontal: center on button, then clamp into viewport.
		let left = r.left + r.width / 2 - pickerWidth / 2;
		left = Math.max(margin, Math.min(left, window.innerWidth - pickerWidth - margin));
		// Vertical: prefer below; flip above if the bottom would clip.
		let top = r.bottom + gap;
		let placement = 'below';
		if (top + pickerHeight > window.innerHeight - margin) {
			top = r.top - gap - pickerHeight;
			placement = 'above';
			if (top < margin) top = margin;
		}
		pickerCoords = { left, top, placement };
	}

	// Recompute on open + on window resize/scroll. Close on outside click.
	$effect(() => {
		if (!browser) return;
		computePickerCoords();
		function onDoc(e) {
			const inBtn = anchor?.contains(e.target);
			const inPicker = pickerEl?.contains(e.target);
			if (!inBtn && !inPicker) onclose();
		}
		function onResize() { computePickerCoords(); }
		document.addEventListener('mousedown', onDoc);
		window.addEventListener('resize', onResize);
		window.addEventListener('scroll', onResize, { passive: true });
		return () => {
			document.removeEventListener('mousedown', onDoc);
			window.removeEventListener('resize', onResize);
			window.removeEventListener('scroll', onResize);
		};
	});
</script>

<!-- Floating picker, position: fixed in viewport coords. Lives outside the
     grid so it's not clipped by tile bounds and doesn't read as part of
     any single tile. Coords come from computePickerCoords. -->
<div
	class="add-picker"
	role="listbox"
	aria-label="Available apps"
	bind:this={pickerEl}
	use:portal
	style="left: {pickerCoords.left}px; top: {pickerCoords.top}px"
>
	{#if trayApps.length === 0 && popularSuggestions.length === 0}
		<div class="picker-empty">Everything's on your surface. Click × on a tile to send it back.</div>
	{:else}
		{#if trayApps.length > 0}
			<div class="picker-section-label">Your apps</div>
			{#each trayApps as app (app.id)}
				<button
					type="button"
					class="picker-item"
					onclick={() => {
						onplace(app);
					}}
				>
					<div
						class="picker-icon"
						style={iconStyle === 'colored' ? getBrandBgStyle(app.icon) : ''}
					>
						<AppIcon icon={app.icon} name={app.name} size="w-4 h-4" {iconStyle} />
					</div>
					<span class="picker-name">{app.name}</span>
				</button>
			{/each}
		{/if}
		{#if popularSuggestions.length > 0}
			{@const popularResolved = popularSuggestions.map((p) => ({
				...p,
				resolvedIcon: resolveIcon(p.icon)
			}))}
			<div class="picker-section-label">Popular</div>
			{#each popularResolved as app (app.id)}
				<button
					type="button"
					class="picker-item"
					onclick={() => {
						onplacepopular(app);
					}}
				>
					<div
						class="picker-icon"
						style={iconStyle === 'colored' ? getBrandBgStyle(app.resolvedIcon) : ''}
					>
						<AppIcon icon={app.resolvedIcon} name={app.name} size="w-4 h-4" {iconStyle} />
					</div>
					<span class="picker-name">{app.name}</span>
				</button>
			{/each}
		{/if}
	{/if}
</div>

<style>
	/* Picker dropdown — floating, fixed-positioned in viewport coords (left/top
	   set from JS). Rendered outside the grid so it's not visually nested
	   inside the + tile. */
	.add-picker {
		position: fixed;
		width: 220px;
		max-height: 280px;
		overflow-y: auto;
		padding: 0.25rem;
		background: var(--glass-menu-bg);
		backdrop-filter: var(--glass-blur);
		border: 1px solid var(--hero-search-border);
		border-radius: 0.6rem;
		box-shadow:
			0 12px 28px -10px rgba(0, 0, 0, 0.45),
			0 4px 12px -4px rgba(0, 0, 0, 0.18);
		z-index: 80;
	}
	.picker-empty {
		padding: 0.6rem 0.7rem;
		text-align: center;
		font-size: 0.7rem;
		color: var(--hero-search-text-dim);
	}
	.picker-section-label {
		padding: 0.4rem 0.5rem 0.2rem;
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--hero-search-text-dim);
	}
	.picker-section-label:first-child {
		padding-top: 0.2rem;
	}
	.picker-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.3rem 0.45rem;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 0.4rem;
		color: var(--hero-search-text);
		font: inherit;
		font-size: 0.72rem;
		text-align: left;
		cursor: pointer;
		transition: background 150ms var(--ease-standard, ease);
	}
	.picker-item:hover {
		background: var(--hero-search-chip-bg);
	}
	.picker-icon {
		width: 22px;
		height: 22px;
		border-radius: 6px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		background: var(--tile-bg-default);
		flex-shrink: 0;
	}
	.picker-name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
