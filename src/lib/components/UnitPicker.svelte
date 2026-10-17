<script>
	import { prefs } from '$lib/stores/prefs.js';

	// One preference as a segmented control: the clock's time format, the
	// weather's temperature unit, the glass density. Saves on click. `inline` puts the label
	// beside the control, as a settings row; `hint` is a short line under the
	// label saying what the setting does.
	let { key, label, options, fallback, hint = '', compact = false, inline = false } = $props();
</script>

<div class:inline-row={inline}>
	<div class="min-w-0">
		<div class={inline ? 'text-[0.75rem] text-content-muted whitespace-nowrap' : 'text-[0.65rem] font-bold uppercase tracking-[0.2em] text-content-dim mb-2'}>{label}</div>
		{#if hint}<div class="text-[0.7rem] text-content-dim leading-snug text-balance" class:mb-2={!inline}>{hint}</div>{/if}
	</div>
	<div class="segmented" class:compact={compact || inline} role="radiogroup" aria-label={label}>
		{#each options as opt}
			<button
				type="button"
				role="radio"
				aria-checked={($prefs[key] || fallback) === opt.id}
				class="segmented-item"
				onclick={() => prefs.update((p) => ({ ...p, [key]: opt.id }))}
			>{opt.label}</button>
		{/each}
	</div>
</div>

<style>
	/* Inside the header's menus: fill the menu's width, smaller type. */
	.compact { display: flex; }
	.compact :global(.segmented-item) { flex: 1; padding: 0.3rem 0.5rem; font-size: 0.72rem; white-space: nowrap; }
	.inline-row { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
	/* One width for every settings row, so the controls line up. */
	.inline-row .segmented { width: 12.5rem; min-width: 0; flex-shrink: 0; }
</style>
