<script>
	// The bottom-right corner, shared by the small cards that come and go
	// (calendar reminders, the player). Each renders its cards in here, in
	// flow, so they stack on their own: a new card pushes the ones above it
	// up instead of covering them. The last child sits nearest the corner.
	let { children } = $props();
</script>

<div class="corner-stack">{@render children()}</div>

<style>
	.corner-stack {
		position: fixed;
		z-index: 60;
		right: 16px;
		bottom: calc(env(safe-area-inset-bottom, 0px) + 16px);
		width: min(340px, calc(100vw - 24px));
		display: flex;
		flex-direction: column;
		gap: 8px;
		/* The gaps between cards stay clickable through to the page. */
		pointer-events: none;
	}
	.corner-stack > :global(*) { pointer-events: auto; }
	/* Phones: the search is docked at the bottom, so sit just above it. */
	@media (max-width: 767px) {
		.corner-stack { right: 12px; bottom: calc(env(safe-area-inset-bottom, 0px) + 12px + 50px + 10px); }
	}
</style>
