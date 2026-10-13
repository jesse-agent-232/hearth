<script>
	import { onMount } from 'svelte';
	import { integrations as integrationsStore } from '$lib/stores/integrations.js';
	import { nowPlaying } from '$lib/stores/player.js';

	// Calendar reminders, shown on the page at the times the events' own
	// reminders say. Only runs while some connected integration has its
	// Reminders widget switched on. A reminder stays up in every open tab,
	// through reloads, until it is dismissed or put off with Later in any one.
	const POLL_MS = 5 * 60 * 1000;
	// Reminder id → hidden until (ms): far ahead once dismissed, a while on
	// for Later. Kept per browser; other tabs follow it through storage events.
	const CLOSED_KEY = 'holm_reminders_closed';
	const DISMISSED_MS = 2 * 24 * 60 * 60 * 1000;
	const MIN = 60 * 1000;
	const MAX_TOASTS = 3;

	let toasts = $state([]);
	let now = $state(Date.now());
	const timers = new Map();

	const enabled = $derived(
		$integrationsStore.integrations.some(
			(it) =>
				it.userState?.connected &&
				it.userState?.surfaces?.widgets === true &&
				(it.availableSurfaces || []).includes('widgets') &&
				(it.widgets || []).some((w) => w.key === 'reminders')
		)
	);

	function readClosed() {
		try {
			const closed = JSON.parse(localStorage.getItem(CLOSED_KEY) || '{}');
			return closed && typeof closed === 'object' ? closed : {};
		} catch {
			return {};
		}
	}

	function close(id, forMs) {
		const closed = readClosed();
		for (const [k, until] of Object.entries(closed)) if (until < Date.now()) delete closed[k];
		closed[id] = Date.now() + forMs;
		try { localStorage.setItem(CLOSED_KEY, JSON.stringify(closed)); } catch { /* private mode: shows again next load */ }
	}

	const closedUntil = (id) => readClosed()[id] || 0;

	let latest = [];

	function show(r) {
		if (closedUntil(r.id) > Date.now()) return;
		if (toasts.some((t) => t.id === r.id)) return;
		toasts = [...toasts, r].slice(-MAX_TOASTS);
	}

	function schedule(reminders) {
		latest = reminders;
		for (const t of timers.values()) clearTimeout(t);
		timers.clear();
		for (const r of reminders) {
			// Put off with Later: back when that runs out.
			const delay = Math.max(r.at, closedUntil(r.id)) - Date.now();
			if (delay <= 0) show(r);
			else timers.set(r.id, setTimeout(() => show(r), Math.min(delay, 2 ** 31 - 1)));
		}
	}

	async function refresh() {
		try {
			const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
			const res = await fetch(`/api/reminders?tz=${encodeURIComponent(tz)}`);
			if (!res.ok) return;
			const data = await res.json();
			schedule(data.reminders || []);
		} catch { /* offline: try again on the next poll */ }
	}

	$effect(() => {
		if (!enabled) return;
		refresh();
		const poll = setInterval(refresh, POLL_MS);
		const tick = setInterval(() => (now = Date.now()), 30 * 1000);
		const onVisible = () => {
			if (document.visibilityState === 'visible') {
				now = Date.now();
				refresh();
			}
		};
		// Dismissed or put off in another tab: clear it here too, and come
		// back when that tab's Later runs out.
		const onStorage = (e) => {
			if (e.key !== CLOSED_KEY && e.key !== null) return;
			toasts = toasts.filter((t) => closedUntil(t.id) <= Date.now());
			schedule(latest);
		};
		document.addEventListener('visibilitychange', onVisible);
		window.addEventListener('storage', onStorage);
		return () => {
			clearInterval(poll);
			clearInterval(tick);
			document.removeEventListener('visibilitychange', onVisible);
			window.removeEventListener('storage', onStorage);
			for (const t of timers.values()) clearTimeout(t);
			timers.clear();
		};
	});

	onMount(() => integrationsStore.load());

	function dismiss(id) {
		close(id, DISMISSED_MS);
		toasts = toasts.filter((t) => t.id !== id);
	}

	// Back in 10 minutes once the event is half an hour off, every 30 in the
	// two hours before that, and two hours before it starts if it's further.
	// All-day events come back every 30.
	function laterFor(r, at) {
		const left = r.start - at;
		if (r.allDay) return 30 * MIN;
		if (left <= 30 * MIN) return 10 * MIN;
		if (left <= 2 * 60 * MIN) return Math.min(30 * MIN, left - 30 * MIN);
		return left - 2 * 60 * MIN;
	}

	function later(r) {
		close(r.id, laterFor(r, Date.now()));
		toasts = toasts.filter((t) => t.id !== r.id);
		schedule(latest);
	}

	const DAY = 24 * 60 * 60 * 1000;
	const clock = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
	const dayStart = (t) => new Date(t).setHours(0, 0, 0, 0);

	function when(r, at) {
		if (r.allDay) {
			const days = Math.round((dayStart(r.start) - dayStart(at)) / DAY);
			return days <= 0 ? 'Today · All day' : days === 1 ? 'Tomorrow · All day' : `${new Date(r.start).toLocaleDateString([], { weekday: 'long' })} · All day`;
		}
		const mins = Math.round((r.start - at) / 60000);
		if (r.end && at >= r.end) return `Ended at ${clock(r.end)}`;
		if (mins <= 0) return mins > -1 ? `Starting now · ${clock(r.start)}` : `Started ${-mins} min ago · ${clock(r.start)}`;
		if (mins < 60) return `Starts in ${mins} min · ${clock(r.start)}`;
		if (dayStart(r.start) === dayStart(at)) return `Today at ${clock(r.start)}`;
		if (dayStart(r.start) - dayStart(at) === DAY) return `Tomorrow at ${clock(r.start)}`;
		return new Date(r.start).toLocaleString([], { weekday: 'long', hour: 'numeric', minute: '2-digit' });
	}
</script>

{#if toasts.length}
	<div class="reminders" class:above-player={$nowPlaying} role="region" aria-label="Reminders" aria-live="polite">
		{#each toasts as r (r.id)}
			<div class="reminder glass-card menu-surface animate-slide-up">
				<div class="reminder-icon" aria-hidden="true">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></svg>
				</div>
				<div class="reminder-text">
					<div class="reminder-title" title={r.title}>{r.title}</div>
					<div class="reminder-sub">{when(r, now)}</div>
					{#if r.location && r.location !== r.call}<div class="reminder-sub" title={r.location}>{r.location}</div>{/if}
					<div class="reminder-actions">
						{#if r.call}
							<a class="reminder-btn" href={r.call} target="_blank" rel="noopener noreferrer" onclick={() => dismiss(r.id)}>Join call</a>
						{/if}
						{#if r.href}
							<a class="reminder-btn" href={r.href} target="_blank" rel="noopener noreferrer" onclick={() => dismiss(r.id)}>Open</a>
						{/if}
						<button type="button" class="reminder-btn" onclick={() => later(r)}>Later</button>
						<button type="button" class="reminder-btn" onclick={() => dismiss(r.id)}>Dismiss</button>
					</div>
				</div>
			</div>
		{/each}
	</div>
{/if}

<style>
	/* Bottom right, clear of the profile button; stacked above the corner
	   player when a song is playing (70px tall, 8px apart). */
	.reminders {
		--reminders-bottom: calc(env(safe-area-inset-bottom, 0px) + 16px);
		position: fixed;
		z-index: 60;
		bottom: var(--reminders-bottom);
		right: 16px;
		width: min(340px, calc(100vw - 24px));
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.reminders.above-player { bottom: calc(var(--reminders-bottom) + 78px); }
	/* Phones: the search is docked at the bottom, so sit just above it. */
	@media (max-width: 767px) {
		.reminders { right: 12px; --reminders-bottom: calc(env(safe-area-inset-bottom, 0px) + 12px + 50px + 10px); }
	}
	.reminder {
		display: flex;
		gap: 12px;
		padding: 12px;
		border-radius: 16px;
		box-shadow: 0 12px 32px -8px rgba(0, 0, 0, 0.45);
	}
	.reminder-icon {
		width: 36px;
		height: 36px;
		flex-shrink: 0;
		border-radius: 10px;
		display: grid;
		place-items: center;
		background: color-mix(in srgb, var(--color-content) 8%, transparent);
		color: var(--color-content-dim);
	}
	.reminder-icon svg { width: 18px; height: 18px; }
	.reminder-text { flex: 1; min-width: 0; }
	.reminder-title,
	.reminder-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.reminder-title { font-size: 0.85rem; font-weight: 600; color: var(--color-content); }
	.reminder-sub { font-size: 0.75rem; color: var(--color-content-dim); margin-top: 1px; font-variant-numeric: tabular-nums; }
	.reminder-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
	.reminder-btn {
		height: 26px;
		padding: 0 10px;
		display: inline-flex;
		align-items: center;
		border: none;
		border-radius: 999px;
		background: color-mix(in srgb, var(--color-content) 10%, transparent);
		color: var(--color-content);
		font: inherit;
		font-size: 0.72rem;
		text-decoration: none;
		cursor: pointer;
	}
	.reminder-btn:hover { background: color-mix(in srgb, var(--color-content) 16%, transparent); }
	.reminder-btn:focus-visible { outline: 2px solid var(--color-content-muted); outline-offset: 1px; }
</style>
