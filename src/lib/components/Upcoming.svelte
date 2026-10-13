<script>
	import { onMount } from 'svelte';
	import { integrations as integrationsStore } from '$lib/stores/integrations.js';

	// "At a glance" for the calendar: the next event on a small line under the clock, and the
	// week ahead in its menu. Only runs while some connected integration has
	// its Upcoming events widget switched on.
	const POLL_MS = 5 * 60 * 1000;
	const DAY = 24 * 60 * 60 * 1000;

	let events = $state([]);
	let now = $state(Date.now());
	let open = $state(false);
	let rootEl = $state();
	let pillEl = $state();

	const enabled = $derived(
		$integrationsStore.integrations.some(
			(it) =>
				it.userState?.connected &&
				it.userState?.surfaces?.widgets === true &&
				(it.availableSurfaces || []).includes('widgets') &&
				(it.widgets || []).some((w) => w.key === 'upcoming')
		)
	);

	async function refresh() {
		try {
			const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
			const res = await fetch(`/api/upcoming?tz=${encodeURIComponent(tz)}`);
			if (!res.ok) return;
			const data = await res.json();
			events = data.upcoming || [];
		} catch { /* offline: try again on the next poll */ }
	}

	$effect(() => {
		if (!enabled) {
			events = [];
			return;
		}
		refresh();
		const poll = setInterval(refresh, POLL_MS);
		const tick = setInterval(() => (now = Date.now()), 30 * 1000);
		const onVisible = () => {
			if (document.visibilityState !== 'visible') return;
			now = Date.now();
			refresh();
		};
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			clearInterval(poll);
			clearInterval(tick);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});

	onMount(() => integrationsStore.load());

	const endOf = (e) => e.end ?? e.start + (e.allDay ? DAY : 0);
	const live = $derived(events.filter((e) => endOf(e) > now));
	// A timed event before an all-day one: "Standup in 10 min" says more than
	// "Holiday today".
	const next = $derived(live.find((e) => !e.allDay) || live[0]);
	// The pill brightens as the event nears: over an hour, within the hour,
	// 30 minutes, 10 minutes (and once it has started).
	const nearness = $derived.by(() => {
		if (!next || next.allDay) return 0;
		const mins = (next.start - now) / 60000;
		return mins <= 10 ? 3 : mins <= 30 ? 2 : mins <= 60 ? 1 : 0;
	});

	// The header's clock is 24-hour; event times match it.
	const clock = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
	const dayStart = (t) => new Date(t).setHours(0, 0, 0, 0);
	const daysFrom = (t) => Math.round((dayStart(t) - dayStart(now)) / DAY);

	function dayWord(t) {
		const days = daysFrom(t);
		if (days <= 0) return 'Today';
		if (days === 1) return 'Tomorrow';
		return new Date(t).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
	}

	function when(e) {
		if (e.allDay) return dayWord(e.start);
		const mins = Math.round((e.start - now) / 60000);
		if (mins <= 0) return 'now';
		if (mins < 60) return `in ${mins} min`;
		const days = daysFrom(e.start);
		if (days === 0) return clock(e.start);
		if (days === 1) return `tomorrow ${clock(e.start)}`;
		return `${new Date(e.start).toLocaleDateString([], { weekday: 'short' })} ${clock(e.start)}`;
	}

	const groups = $derived.by(() => {
		const out = [];
		for (const e of live) {
			const label = e.start <= now ? 'Today' : dayWord(e.start);
			if (out.at(-1)?.label !== label) out.push({ label, events: [] });
			out.at(-1).events.push(e);
		}
		return out;
	});

	function close() {
		open = false;
	}

	// The search bar opens the event's details, with its title as the query.
	function showDetails(e) {
		close();
		window.dispatchEvent(new CustomEvent('holm:show-details', { detail: { integrationId: e.integrationId, title: e.title, href: e.href, detail: e.detail } }));
	}

	$effect(() => {
		if (!open) return;
		const onDown = (e) => { if (!rootEl?.contains(e.target)) close(); };
		const onKey = (e) => {
			if (e.key !== 'Escape') return;
			close();
			pillEl?.focus();
		};
		document.addEventListener('pointerdown', onDown);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('pointerdown', onDown);
			document.removeEventListener('keydown', onKey);
		};
	});
</script>

{#if next}
	<div class="relative min-w-0 self-start max-w-full" bind:this={rootEl}>
		<button
			bind:this={pillEl}
			data-near={nearness}
			class="upcoming-pill animate-fade-in flex items-center gap-1.5 min-w-0 max-w-full bg-transparent border-none p-0 cursor-pointer font-mono uppercase text-content"
			aria-haspopup="dialog"
			aria-expanded={open}
			title="Upcoming events"
			onclick={() => (open = !open)}
		>
			<svg class="header-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></svg>
			<span class="truncate">{next.title}</span>
			<span class="shrink-0 tabular-nums">· {when(next)}</span>
		</button>

		{#if open}
			<div
				class="absolute left-0 top-full mt-2 z-[70] w-[20rem] max-w-[calc(100vw-2rem)] glass-card menu-surface rounded-xl shadow-theme animate-menu-up normal-case tracking-normal text-[0.78rem] font-mono text-content overflow-hidden"
				role="dialog"
				aria-label="Upcoming events"
			>
				<div class="upcoming-list py-1">
					{#each groups as g, gi (g.label)}
						<div class="px-4 pt-2.5 pb-1 text-[0.68rem] uppercase tracking-[0.12em] text-content-dim {gi ? 'border-t border-border-card mt-1' : ''}">{g.label}</div>
						{#each g.events as e (e.id)}
							{#if e.detail && e.integrationId}
								<button type="button" class="upcoming-row hover:bg-surface-card-hover" onclick={() => showDetails(e)}>
									{@render row(e)}
								</button>
							{:else if e.href}
								<a class="upcoming-row hover:bg-surface-card-hover" href={e.href} target="_blank" rel="noopener noreferrer" onclick={close}>
									{@render row(e)}
								</a>
							{:else}
								<div class="upcoming-row">{@render row(e)}</div>
							{/if}
						{/each}
					{/each}
				</div>
			</div>
		{/if}
	</div>
{/if}

{#snippet row(e)}
	<span class="tabular-nums text-content-muted">
		{#if e.allDay}All day{:else if e.start <= now}Now{:else}{clock(e.start)}{/if}
	</span>
	<span class="min-w-0">
		<span class="block truncate">{e.title}</span>
		{#if e.location}
			<span class="block truncate text-[0.7rem] text-content-dim">{e.location}</span>
		{/if}
	</span>
{/snippet}

<style>
	/* A smaller line under the clock. */
	.upcoming-pill { font-size: 0.82em; letter-spacing: 0.1em; }
	/* On the children, so the fade-in animation on the pill doesn't fight it. */
	.upcoming-pill > * { opacity: 0.6; transition: opacity 0.6s ease; }
	.upcoming-pill[data-near='1'] > * { opacity: 0.72; }
	.upcoming-pill[data-near='2'] > * { opacity: 0.86; }
	.upcoming-pill[data-near='3'] > *,
	.upcoming-pill:hover > *,
	.upcoming-pill:focus-visible > * { opacity: 1; }
	.upcoming-list { max-height: min(24rem, 60vh); overflow-y: auto; }
	.upcoming-row {
		display: grid;
		grid-template-columns: 3.75rem minmax(0, 1fr);
		gap: 10px;
		align-items: baseline;
		width: 100%;
		padding: 7px 16px;
		border: none;
		background: transparent;
		font: inherit;
		text-align: left;
		cursor: pointer;
		color: inherit;
		text-decoration: none;
	}
</style>
