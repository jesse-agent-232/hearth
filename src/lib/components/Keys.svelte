<script module>
	// Mac shows ⌘, everyone else Ctrl. Decided once in the browser; the
	// server render (and anything before hydration) assumes Mac.
	export const isMac =
		typeof navigator === 'undefined' ||
		/mac|iphone|ipad/i.test(navigator.userAgentData?.platform || navigator.platform || '');
</script>

<script>
	// Renders a shortcut like "⌘ ⇧ C" as a row of <kbd>s. Modifier and arrow
	// glyphs are drawn as SVG: the UI font has no ⌘/⇧/↵ and system fallbacks
	// vary, so text glyphs show up as boxes on some platforms.
	let { keys = '' } = $props();

	const PATHS = {
		'⌘': '<path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3Z"/>',
		'⇧': '<path d="M12 4 4 12h4.5v8h7v-8H20Z"/>',
		'↵': '<path d="M20 5v7a3 3 0 0 1-3 3H5"/><path d="m9 11-4 4 4 4"/>',
		'↑': '<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>',
		'↓': '<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>'
	};

	const list = $derived(
		keys
			.split(' ')
			.filter(Boolean)
			.map((k) => (k === '⌘' && !isMac ? 'Ctrl' : k))
	);
</script>

{#each list as k}
	<kbd>
		{#if PATHS[k]}
			<svg class="kbd-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label={k}>{@html PATHS[k]}</svg>
		{:else}{k}{/if}
	</kbd>
{/each}
