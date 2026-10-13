<script>
	import { onMount } from 'svelte';
	import { integrations as integrationsStore } from '$lib/stores/integrations.js';

	// Calendar reminders, shown on the page at the times the events' own
	// reminders say. Only runs while some connected integration has its
	// Reminders widget switched on. A reminder stays up, through reloads,
	// until it is dismissed or put off with Later.
	const POLL_MS = 5 * 60 * 1000;
	// Reminder id → hidden until (ms): far ahead once dismissed, ten minutes
	// on for Later. Kept per browser.
	const CLOSED_KEY = 'holm_reminders_closed';
	const DISMISSED_MS = 2 * 24 * 60 * 60 * 1000;
	const LATER_MS = 10 * 60 * 1000;
	const MAX_TOASTS = 3;

	let toasts = $state([]);
	let now = $state(Date.now());
	let permission = $state('unsupported');
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

	// Asked once per reminder per page, so a reload doesn't notify again.
	const notified = new Set();
	let latest = [];

	// Due while this tab is hidden and can't notify: wait until it's seen, so
	// a tab the user is looking at gets the reminder first.
	const waiting = new Map();

	function show(r) {
		if (closedUntil(r.id) > Date.now()) return;
		if (document.hidden && permission !== 'granted') {
			waiting.set(r.id, r);
			return;
		}
		waiting.delete(r.id);
		if (toasts.some((t) => t.id === r.id)) return;
		toasts = [...toasts, r].slice(-MAX_TOASTS);
		if (document.hidden && permission === 'granted' && !notified.has(r.id)) {
			notified.add(r.id);
			try {
				new Notification(r.title, { body: [when(r, Date.now()), r.location].filter(Boolean).join(' · '), tag: r.id });
			} catch { /* some mobile browsers only notify from a service worker */ }
		}
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
				for (const r of [...waiting.values()]) show(r);
				refresh();
			}
		};
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			clearInterval(poll);
			clearInterval(tick);
			document.removeEventListener('visibilitychange', onVisible);
			for (const t of timers.values()) clearTimeout(t);
			timers.clear();
		};
	});

	onMount(() => {
		integrationsStore.load();
		if ('Notification' in window) permission = Notification.permission;
	});

	async function askPermission() {
		try { permission = await Notification.requestPermission(); } catch { permission = 'denied'; }
	}

	function dismiss(id) {
		close(id, DISMISSED_MS);
		toasts = toasts.filter((t) => t.id !== id);
	}

	function later(id) {
		close(id, LATER_MS);
		toasts = toasts.filter((t) => t.id !== id);
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
	<div class="reminders" role="region" aria-label="Reminders" aria-live="polite">
		{#each toasts as r (r.id)}
			<div class="reminder glass-card menu-surface animate-slide-up">
				<div class="reminder-icon" aria-hidden="true">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></svg>
				</div>
				<div class="reminder-text">
					<div class="reminder-title" title={r.title}>{r.title}</div>
					<div class="reminder-sub">{when(r, now)}</div>
					{#if r.location}<div class="reminder-sub" title={r.location}>{r.location}</div>{/if}
					<div class="reminder-actions">
						{#if r.call}
							<a class="reminder-btn" href={r.call} target="_blank" rel="noopener noreferrer" onclick={() => dismiss(r.id)}>Join call</a>
						{/if}
						{#if r.href}
							<a class="reminder-btn" href={r.href} target="_blank" rel="noopener noreferrer" onclick={() => dismiss(r.id)}>Open</a>
						{/if}
						<button type="button" class="reminder-btn" onclick={() => later(r.id)}>Later</button>
						<button type="button" class="reminder-btn" onclick={() => dismiss(r.id)}>Dismiss</button>
						{#if permission === 'default'}
							<button type="button" class="reminder-btn is-quiet" onclick={askPermission}>Alert me in other tabs</button>
						{/if}
					</div>
				</div>
			</div>
		{/each}
	</div>
{/if}

<style>
	.reminders {
		position: fixed;
		z-index: 60;
		top: calc(env(safe-area-inset-top, 0px) + 16px);
		right: 16px;
		width: min(340px, calc(100vw - 24px));
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	@media (max-width: 767px) {
		.reminders { right: 12px; top: calc(env(safe-area-inset-top, 0px) + 12px); }
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
	.reminder-btn.is-quiet { background: transparent; color: var(--color-content-dim); }
	.reminder-btn.is-quiet:hover { color: var(--color-content); }
</style>
