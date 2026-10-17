<script>
	import { prefs } from '$lib/stores/prefs.js';

	// One preference as a segmented control: the clock's time format, the
	// weather's temperature unit, the glass density. Saves on click. An option
	// may carry an `icon` (an SVG path) drawn before its label. `inline` puts the label
	// beside the control, as a settings row.
	let { key, label, options, fallback, compact = false, inline = false } = $props();
</script>

<div class:inline-row={inline}>
	<div class={inline ? 'text-[0.75rem] text-content-muted whitespace-nowrap' : 'text-[0.65rem] font-bold uppercase tracking-[0.2em] text-content-dim mb-2'}>{label}</div>
	<div class="segmented" class:compact={compact || inline} role="radiogroup" aria-label={label}>
		{#each options as opt}
			<button
				type="button"
				role="radio"
				aria-checked={($prefs[key] || fallback) === opt.id}
				class="segmented-item"
				onclick={() => prefs.update((p) => ({ ...p, [key]: opt.id }))}
			>{#if opt.icon}<svg viewBox="0 0 16 16" class="segmented-icon" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round" aria-hidden="true"><path d={opt.icon} /></svg>{/if}{opt.label}</button>
		{/each}
	</div>
</div>

<style>
	/* Inside the header's menus: fill the menu's width, smaller type. */
	.compact { display: flex; }
	.compact :global(.segmented-item) { flex: 1; padding: 0.3rem 0.5rem; font-size: 0.72rem; white-space: nowrap; }
	.inline-row { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
	/* One width for every settings row, so the controls line up. */
	.inline-row .segmented { width: 12.5rem; min-width: 0; }
	/* An option's optional icon, before its label. */
	.segmented-icon { width: 0.9rem; height: 0.9rem; margin-right: 0.35rem; display: inline-block; vertical-align: -0.15em; }
</style>
