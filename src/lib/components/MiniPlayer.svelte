<script>
	import { nowPlaying } from '$lib/stores/player.js';

	// Corner player for a song picked in search. Deliberately small: play or
	// pause, stop, mute, and how far along it is. No seeking and no queue.
	let audio = $state(null);
	let paused = $state(true);
	let muted = $state(false);
	let current = $state(0);
	let length = $state(0);
	let failed = $state(false);

	const track = $derived($nowPlaying);
	// Navidrome knows the length; the element may not (Infinity until the
	// whole file is in, for some formats), so it's only the fallback.
	const total = $derived(track?.duration || (Number.isFinite(length) ? length : 0));
	const progress = $derived(total ? Math.min(current / total, 1) : 0);

	// A new track (a fresh object each pick, even the same song) starts over.
	$effect(() => {
		if (!audio || !track) return;
		failed = false;
		current = 0;
		audio.src = track.stream;
		audio.play().catch(() => {});
	});

	function toggle() {
		if (!audio) return;
		if (audio.paused) audio.play().catch(() => {});
		else audio.pause();
	}

	function stop() {
		audio?.pause();
		audio?.removeAttribute('src');
		audio?.load();
		nowPlaying.set(null);
	}

	function time(s) {
		if (!Number.isFinite(s) || s < 0) s = 0;
		const m = Math.floor(s / 60);
		return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
	}
</script>

<audio
	bind:this={audio}
	bind:paused
	bind:muted
	bind:currentTime={current}
	bind:duration={length}
	onended={stop}
	onerror={() => { if (track) failed = true; }}
	preload="none"
></audio>

{#if track}
	<div class="mini-player glass-card menu-surface animate-slide-up" role="region" aria-label="Now playing">
		<div class="mini-player-art">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
			{#if track.cover}<img src={track.cover} alt="" />{/if}
		</div>
		<div class="mini-player-text">
			<div class="mini-player-title" title={track.title}>{track.title}</div>
			{#if failed}
				<div class="mini-player-sub is-error">Couldn’t play this song</div>
			{:else}
				{#if track.artist}<div class="mini-player-sub" title={track.artist}>{track.artist}</div>{/if}
				<div class="mini-player-time"><span>{time(current)}</span> / <span>{time(total)}</span></div>
			{/if}
		</div>
		<div class="mini-player-buttons">
			<button type="button" class="mini-player-btn" aria-label={paused ? 'Play' : 'Pause'} onclick={toggle} disabled={failed}>
				{#if paused}
					<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/></svg>
				{:else}
					<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
				{/if}
			</button>
			<button type="button" class="mini-player-btn" aria-label="Stop" onclick={stop}>
				<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
			</button>
			<button type="button" class="mini-player-btn" aria-label={muted ? 'Unmute' : 'Mute'} aria-pressed={muted} onclick={() => (muted = !muted)}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M11 5 6 9H3v6h3l5 4V5Z"/>
					{#if muted}<path d="m22 9-6 6M16 9l6 6"/>{:else}<path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>{/if}
				</svg>
			</button>
		</div>
		<!-- How far along, display only. -->
		<div class="mini-player-progress" aria-hidden="true"><div style="transform: scaleX({progress})"></div></div>
	</div>
{/if}

<style>
	.mini-player {
		position: fixed;
		z-index: 55;
		right: 16px;
		bottom: calc(env(safe-area-inset-bottom, 0px) + 16px);
		width: min(340px, calc(100vw - 24px));
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 10px 12px;
		border-radius: 16px;
		overflow: hidden;
		box-shadow: 0 12px 32px -8px rgba(0, 0, 0, 0.45);
	}
	/* Phones: the search is docked at the bottom, so sit just above it. */
	@media (max-width: 767px) {
		.mini-player { right: 12px; bottom: calc(env(safe-area-inset-bottom, 0px) + 12px + 50px + 10px); }
	}
	.mini-player-art {
		position: relative;
		width: 48px;
		height: 48px;
		flex-shrink: 0;
		border-radius: 8px;
		overflow: hidden;
		display: grid;
		place-items: center;
		background: color-mix(in srgb, var(--color-content) 8%, transparent);
		color: var(--color-content-dim);
	}
	.mini-player-art svg { width: 22px; height: 22px; }
	.mini-player-art img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
	.mini-player-text { flex: 1; min-width: 0; }
	.mini-player-title,
	.mini-player-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.mini-player-title { font-size: 0.85rem; font-weight: 600; color: var(--color-content); }
	.mini-player-sub { font-size: 0.75rem; color: var(--color-content-dim); margin-top: 1px; }
	.mini-player-sub.is-error { color: var(--color-content-muted); }
	.mini-player-time { font-size: 0.7rem; color: var(--color-content-dim); margin-top: 2px; font-variant-numeric: tabular-nums; }
	.mini-player-buttons { display: flex; gap: 2px; flex-shrink: 0; }
	.mini-player-btn {
		width: 32px;
		height: 32px;
		display: grid;
		place-items: center;
		border: none;
		border-radius: 999px;
		background: transparent;
		color: var(--color-content);
		cursor: pointer;
	}
	.mini-player-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--color-content) 10%, transparent); }
	.mini-player-btn:disabled { opacity: 0.4; cursor: default; }
	.mini-player-btn:focus-visible { outline: 2px solid var(--color-content-muted); outline-offset: 1px; }
	.mini-player-btn svg { width: 16px; height: 16px; }
	.mini-player-progress {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 3px;
		background: color-mix(in srgb, var(--color-content) 10%, transparent);
	}
	.mini-player-progress div {
		height: 100%;
		background: var(--color-content-muted);
		transform-origin: left;
	}
</style>
