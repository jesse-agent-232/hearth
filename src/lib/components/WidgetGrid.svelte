<script>
	import { onMount, untrack, getContext } from 'svelte';
	import { browser } from '$app/environment';
	import { prefs } from '$lib/stores/prefs.js';
	import { adminApps as adminAppsStore } from '$lib/stores/adminApps.js';
	import { buildAppsFromConfig, resolveIcon } from '$lib/apps.js';
	import AppIcon from '$lib/components/AppIcon.svelte';
	import { getBrandBgStyle } from '$lib/iconHelpers.js';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import { registry, getRegistryEntry, WIDGET_TYPES } from '$lib/widgets/registry.js';
	import {
		defaultWidgetLayout,
		synthesizeFromLegacyPrefs,
		updateLayoutPositions,
		removeInstance,
		addAppInstance,
		findAppInstance,
		clamp
	} from '$lib/widgets/layout.js';
	import { POPULAR_APPS } from '$lib/popularApps.js';

	// Move a node to document.body so its position:fixed coords resolve to
	// the viewport even when an ancestor has a transform/filter (which
	// otherwise turns that ancestor into the containing block — that's the
	// bug that drifts the picker off to the corner).
	function portal(node) {
		if (typeof document === 'undefined') return;
		document.body.appendChild(node);
		return {
			destroy() {
				if (node.parentNode === document.body) {
					document.body.removeChild(node);
				}
			}
		};
	}

	let {
		isAdmin = false,
		guideApp = $bindable(null),
		editMode = $bindable(false),
		searchEnabled = false,
		customizationEnabled = false,
		onSettingsOpen = () => {}
	} = $props();

	const siteConfig = getContext('config');

	// Setup guides keyed by app name, for the tile context menu's "Setup Guide"
	// entry and the modal it opens. Same helper +page.svelte uses for tipApps.
	const setupGuides = $derived.by(() => buildAppsFromConfig(siteConfig?.apps).setupGuides);

	// Flat catalog: config apps + admin-added apps + per-user custom bookmarks,
	// admin_only filtered for non-admins. One source of truth used by every
	// callsite below — no widget reaches back into config or stores.
	const configApps = $derived.by(() => {
		const list = [];
		const raw = siteConfig?.apps;
		if (!Array.isArray(raw)) return list;
		// Server normalizes to flat, but tolerate the legacy nested shape too.
		const isLegacy = raw.length > 0 && Array.isArray(raw[0]?.items);
		const items = isLegacy ? raw.flatMap((c) => c.items || []) : raw;
		for (const item of items) {
			list.push({
				id: item.id,
				name: item.name,
				url: item.url,
				icon: resolveIcon(
					item.icon,
					item.icon_mono,
					item.brandColor,
					item.brandFg,
					item.brandExplicit
				),
				selfHosted: item.self_hosted || false,
				adminOnly: item.admin_only || false,
				default: item.default_visible !== false,
				ios: item.app_store?.ios || null,
				android: item.app_store?.android || null,
				extension: item.browser_extension || null,
				subtitle: item.setup_guide?.subtitle || null,
				tags: Array.isArray(item.tags) ? item.tags : []
			});
		}
		return list;
	});

	const adminCatalog = $derived.by(() => {
		const list = $adminAppsStore || [];
		return list.map((a) => ({
			id: a.id,
			name: a.name,
			url: a.url,
			icon: resolveIcon(a.icon),
			selfHosted: a.self_hosted || false,
			adminOnly: false,
			default: true,
			ios: null,
			android: null,
			extension: null,
			subtitle: null,
			tags: []
		}));
	});

	const customCatalog = $derived.by(() => {
		const list = $prefs.customApps || [];
		return list.map((a) => ({
			id: a.id,
			name: a.name,
			url: a.url,
			icon: resolveIcon(a.icon),
			selfHosted: false,
			adminOnly: false,
			default: true,
			ios: null,
			android: null,
			extension: null,
			subtitle: null,
			tags: ['bookmark']
		}));
	});

	const catalog = $derived.by(() => {
		const out = [];
		const seen = new Set();
		for (const a of configApps) {
			if (a.adminOnly && !isAdmin) continue;
			if (!seen.has(a.id)) {
				seen.add(a.id);
				out.push(a);
			}
		}
		for (const a of adminCatalog) {
			if (!seen.has(a.id)) {
				seen.add(a.id);
				out.push(a);
			}
		}
		for (const a of customCatalog) {
			if (!seen.has(a.id)) {
				seen.add(a.id);
				out.push(a);
			}
		}
		return out;
	});

	const widgetLayout = $derived(Array.isArray($prefs.widgetLayout) ? $prefs.widgetLayout : null);

	// Lazy migration: synthesize from legacy prefs on first mount when the user
	// has no widgetLayout. Strips obsolete keys so they don't get re-synced.
	let migrated = $state(false);
	$effect(() => {
		if (!browser || migrated) return;
		if (Array.isArray($prefs.widgetLayout)) {
			migrated = true;
			return;
		}
		// Wait until the catalog is populated to avoid migrating against an
		// empty list (which would skip everything).
		if (catalog.length === 0) return;
		untrack(() => {
			const hasLegacy =
				Array.isArray($prefs.categoryLayout) ||
				$prefs.gridLayouts ||
				Array.isArray($prefs.visibleApps) ||
				($prefs.dashboardView && typeof $prefs.dashboardView === 'string');
			const synthesized = hasLegacy
				? synthesizeFromLegacyPrefs($prefs, catalog, registry, { isAdmin })
				: defaultWidgetLayout(catalog, registry, { isAdmin });
			prefs.update((p) => {
				const next = { ...p, widgetLayout: synthesized };
				delete next.categoryLayout;
				delete next.gridLayouts;
				delete next.dashboardView;
				return next;
			});
			migrated = true;
		});
	});

	// Resolve each widget instance to its app for rendering. Skip instances
	// whose appId is no longer in catalog (e.g. an admin removed the app).
	const renderInstances = $derived.by(() => {
		if (!Array.isArray(widgetLayout)) return [];
		const byId = new Map(catalog.map((a) => [a.id, a]));
		const out = [];
		for (const inst of widgetLayout) {
			const entry = getRegistryEntry(inst.type);
			if (!entry) continue;
			if (inst.type === WIDGET_TYPES.APP) {
				const app = byId.get(inst.config?.appId);
				if (!app) continue;
				out.push({ inst: clamp(inst, entry), app });
			}
		}
		return out;
	});

	const placedAppIds = $derived.by(() => {
		const ids = new Set();
		if (Array.isArray(widgetLayout)) {
			for (const inst of widgetLayout) {
				if (inst.type === WIDGET_TYPES.APP && inst.config?.appId) {
					ids.add(inst.config.appId);
				}
			}
		}
		return ids;
	});

	// Tray apps in edit mode: catalog apps not currently on the surface.
	const trayApps = $derived(catalog.filter((a) => !placedAppIds.has(a.id)));

	// Popular suggestions: curated bookmarks the user hasn't already added or
	// placed. Hidden once the operator has filled the surface or matched any
	// popular slug into their own customApps.
	const popularSuggestions = $derived.by(() => {
		const customIds = new Set(($prefs.customApps || []).map((a) => a.id));
		const customUrls = new Set(($prefs.customApps || []).map((a) => a.url));
		return POPULAR_APPS.filter(
			(p) => !placedAppIds.has(p.id) && !customIds.has(p.id) && !customUrls.has(p.url)
		);
	});

	const iconStyle = $derived($prefs.iconStyle || 'colored');
	const openInNewTab = $derived($prefs.openInNewTab ?? true);

	// Recently-opened apps tracking (lifted unchanged from AppGrid).
	function recordAppOpen(appId) {
		prefs.update((p) => {
			const prev = Array.isArray(p.recentApps) ? p.recentApps : [];
			const next = [appId, ...prev.filter((id) => id !== appId)].slice(0, 16);
			return { ...p, recentApps: next };
		});
	}

	function placeAppOnSurface(appId) {
		prefs.update((p) => {
			const layout = Array.isArray(p.widgetLayout) ? p.widgetLayout : [];
			if (findAppInstance(layout, appId)) return p; // already placed
			return { ...p, widgetLayout: addAppInstance(layout, appId, registry) };
		});
	}

	function placePopularOnSurface(popular) {
		// Adds the popular as a customApp (if not already present) and places it
		// on the surface in a single prefs update so renderInstances and the
		// catalog stay in sync within one render pass.
		prefs.update((p) => {
			const customApps = Array.isArray(p.customApps) ? p.customApps : [];
			const layout = Array.isArray(p.widgetLayout) ? p.widgetLayout : [];
			const nextCustom = customApps.some((a) => a.id === popular.id)
				? customApps
				: [...customApps, { id: popular.id, name: popular.name, url: popular.url, icon: popular.icon }];
			const nextLayout = findAppInstance(layout, popular.id)
				? layout
				: addAppInstance(layout, popular.id, registry);
			return { ...p, customApps: nextCustom, widgetLayout: nextLayout };
		});
	}

	function removeFromSurface(instanceId) {
		prefs.update((p) => {
			const layout = Array.isArray(p.widgetLayout) ? p.widgetLayout : [];
			return { ...p, widgetLayout: removeInstance(layout, instanceId) };
		});
	}

	function resetSurface() {
		prefs.update((p) => ({
			...p,
			widgetLayout: defaultWidgetLayout(catalog, registry, { isAdmin })
		}));
	}

	// ── Tile context menu (right-click / long-press) — ported from AppGrid ──
	let contextApp = $state(null);
	let contextAnchor = $state(null);
	let contextMenuEl = $state(null);
	let longPressTimer = null;

	function showContext(app, e) {
		e.preventDefault();
		e.stopPropagation();
		contextAnchor = e.currentTarget;
		contextApp = app;
	}

	function startLongPress(app, e) {
		const target = e.currentTarget;
		longPressTimer = setTimeout(() => {
			e.preventDefault();
			contextAnchor = target;
			contextApp = app;
		}, 500);
	}

	function cancelLongPress() {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
	}

	function openGuide(app) {
		contextApp = null;
		guideApp = app;
	}

	// Position context menu relative to its anchor tile after render, flipping
	// to stay inside the viewport.
	$effect(() => {
		if (contextMenuEl && contextApp && contextAnchor) {
			contextMenuEl.style.left = '0px';
			contextMenuEl.style.top = '0px';

			requestAnimationFrame(() => {
				if (!contextMenuEl || !contextAnchor) return;
				const anchorRect = contextAnchor.getBoundingClientRect();
				const menuRect = contextMenuEl.getBoundingClientRect();
				const vw = window.innerWidth;
				const vh = window.innerHeight;
				const pad = 8;

				let x = anchorRect.right;
				let y = anchorRect.bottom + 4;

				if (x + menuRect.width > vw - pad) x = anchorRect.left - menuRect.width;
				if (x < pad) x = pad;
				if (y + menuRect.height > vh - pad) y = anchorRect.top - menuRect.height - 4;
				if (y < pad) y = pad;

				contextMenuEl.style.left = `${x}px`;
				contextMenuEl.style.top = `${y}px`;
				contextMenuEl.style.visibility = 'visible';
			});
		}
	});

	// Dismiss the context menu on outside click, and close the guide modal on Esc.
	$effect(() => {
		if (!browser) return;
		function dismiss(e) {
			if (contextMenuEl && !contextMenuEl.contains(e.target)) contextApp = null;
		}
		function onEsc(e) {
			if (e.key === 'Escape' && guideApp) {
				e.preventDefault();
				guideApp = null;
			}
		}
		window.addEventListener('click', dismiss);
		window.addEventListener('keydown', onEsc);
		return () => {
			window.removeEventListener('click', dismiss);
			window.removeEventListener('keydown', onEsc);
		};
	});

	let searchInput = $state('');
	let pickerOpen = $state(false);
	let addBtnEl = $state(null);
	let pickerEl = $state(null);
	// Anchor coords for the fixed-positioned picker. Recomputed on open and
	// on scroll/resize. Picker centers horizontally over the button and drops
	// below it; if it would overflow the viewport bottom, it flips above.
	let pickerCoords = $state({ left: 0, top: 0, placement: 'below' });

	function computePickerCoords() {
		if (!addBtnEl) return;
		const r = addBtnEl.getBoundingClientRect();
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
		if (!browser || !pickerOpen) return;
		computePickerCoords();
		function onDoc(e) {
			const inBtn = addBtnEl?.contains(e.target);
			const inPicker = pickerEl?.contains(e.target);
			if (!inBtn && !inPicker) pickerOpen = false;
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

	// ── GridStack ──
	let gridEl = $state(null);
	let grid = null;

	// Track the active breakpoint's column count so we can horizontally center
	// the row of tiles when it's narrower than the grid. Mirrors the same
	// thresholds passed to GridStack's columnOpts.breakpoints below.
	let cols = $state(12);
	function syncCols() {
		if (typeof window === 'undefined') return;
		const w = window.innerWidth;
		cols = w < 480 ? 4 : w < 768 ? 6 : w < 1024 ? 8 : 12;
	}

	const tileCount = $derived(renderInstances.length + (editMode ? 1 : 0));

	// Visual shift to center the single-row layout. Zero once the row would
	// wrap (multi-row centering looks lopsided). Applied as a translateX on
	// the grid container — keeps GridStack's internal coords untouched and
	// avoids fighting compact() / cell sizing.
	const centerShiftPct = $derived.by(() => {
		if (tileCount === 0 || tileCount >= cols) return 0;
		return ((cols - tileCount) / 2 / cols) * 100;
	});
	// Tracks which instances GridStack has registered. Svelte owns the DOM
	// inside .grid-stack via the {#each} block, but GridStack only learns about
	// new children when we explicitly call makeWidget on them. The reverse is
	// true on removal — we must unregister BEFORE Svelte detaches the node.
	const managedEls = new Map(); // instanceId → HTMLElement

	// Park the __add__ tile at the bottom of the grid so the next compact()
	// flows it back to the end. Called before every add/remove/drag reflow —
	// otherwise GridStack's internal state keeps __add__ wherever the last
	// compact left it, which causes collisions to push new tiles past it.
	// We mutate the internal node in addition to grid.update because float:false
	// can snap __add__ up to the first free row before compact runs, leaving
	// it at y=1 instead of y=999 and breaking the "always last" sort.
	function reparkAddTile() {
		if (!grid) return;
		const addEl = managedEls.get('__add__');
		if (!addEl) return;
		try { grid.update(addEl, { x: 0, y: 999 }); } catch {}
		if (addEl.gridstackNode) {
			addEl.gridstackNode.x = 0;
			addEl.gridstackNode.y = 999;
		}
	}

	function saveLayoutFromGrid() {
		if (!grid) return;
		const positions = [];
		for (const el of grid.getGridItems()) {
			const id = el.getAttribute('gs-id');
			const node = el.gridstackNode;
			if (!id || id === '__add__' || !node) continue;
			positions.push({ instanceId: id, x: node.x, y: node.y, w: node.w, h: node.h });
		}
		prefs.update((p) => {
			const layout = Array.isArray(p.widgetLayout) ? p.widgetLayout : [];
			return { ...p, widgetLayout: updateLayoutPositions(layout, positions) };
		});
	}

	async function initGrid(isCancelled) {
		if (!gridEl || grid) return;
		const { GridStack } = await import('gridstack');
		if (isCancelled?.() || !gridEl?.isConnected) return;

		grid = GridStack.init(
			{
				column: 12,
				// Cell height = icon (44) + vertical padding (~13) + gap (~5)
				// + name line (~14) + breathing room. 92 fits cleanly.
				cellHeight: 92,
				float: false,
				animate: true,
				handle: '.gs-drag-handle',
				disableResize: true,
				disableDrag: true,
				margin: 6,
				columnOpts: {
					breakpointForWindow: true,
					// `list` flows tiles in their existing order at the new column
					// count instead of clamping x to fit (which collapses high-x
					// tiles into the rightmost column on mobile).
					layout: 'list',
					breakpoints: [
						{ w: 480, c: 4, layout: 'list' },
						{ w: 768, c: 6, layout: 'list' },
						{ w: 1024, c: 8, layout: 'list' },
						{ w: 1280, c: 12, layout: 'list' }
					]
				}
			},
			gridEl
		);

		grid.on('dragstop', () => {
			// Re-park __add__ to y=999, then compact so it lands after the
			// dragged tile's new position. Without this, GridStack's collision
			// resolution can leave + sitting between apps.
			reparkAddTile();
			grid.compact('list');
			saveLayoutFromGrid();
		});
		grid.on('resizestop', () => saveLayoutFromGrid());

		// Seed the managed-elements map with whatever GridStack picked up
		// during init. Subsequent additions/removals go through syncGrid().
		for (const el of grid.getGridItems()) {
			const id = el.getAttribute('gs-id');
			if (id) managedEls.set(id, el);
		}

		// Initial reflow: when the breakpoint is narrower than the layout was
		// originally authored at (e.g. 12-col positions on a 4-col mobile),
		// GridStack falls back to clamping x values, which collapses high-x
		// tiles into the rightmost column. compact() reflows them sequentially
		// into the available columns, preserving order. Safe to call on every
		// init — it's a no-op when the layout already fits.
		requestAnimationFrame(() => {
			if (!grid) return;
			grid.compact('list');
		});
	}

	// Reconcile Svelte-rendered tiles with GridStack's internal node list.
	// Called from a $effect that depends on renderInstances + editMode; diffs
	// the expected set against managedEls and adds/removes as needed. The
	// special `__add__` tile is treated as expected only when editMode is on.
	function syncGrid(instances, isEditing) {
		if (!grid || !gridEl) return;
		const expected = new Set(instances.map((entry) => entry.inst.instanceId));
		if (isEditing) expected.add('__add__');

		// Remove first so freed cells become available before placing new tiles.
		let didRemove = false;
		for (const [id, el] of managedEls) {
			if (expected.has(id)) continue;
			try { grid.removeWidget(el, false, false); } catch {}
			managedEls.delete(id);
			didRemove = true;
		}

		// Re-park __add__ before placing new tiles so the slot where + currently
		// sits is freed up — otherwise a new app spawning at findFreeSlot's
		// {x,y} can collide with __add__ and get bumped to a fresh row.
		reparkAddTile();

		// Register newly-rendered app tiles.
		for (const { inst } of instances) {
			if (managedEls.has(inst.instanceId)) continue;
			const el = gridEl.querySelector(`[gs-id="${inst.instanceId}"]`);
			if (el) {
				grid.makeWidget(el);
				managedEls.set(inst.instanceId, el);
			}
		}

		// Register the add-tile when entering edit mode.
		if (isEditing && !managedEls.has('__add__')) {
			const el = gridEl.querySelector('[gs-id="__add__"]');
			if (el) {
				grid.makeWidget(el);
				managedEls.set('__add__', el);
			}
		}

		// Always compact — packs tiles left-to-right, top-to-bottom (so removed
		// cells close in-row) AND snaps the __add__ tile (re-parked above at
		// y=999) up to the next free cell after the last app. Save positions
		// afterward when something app-side actually changed.
		requestAnimationFrame(() => {
			if (!grid) return;
			grid.compact('list');
			if (didRemove) saveLayoutFromGrid();
		});
	}

	// Sync edit-mode → GridStack drag gating. Resize stays disabled — iOS-style
	// edit mode is "drag to rearrange, × to remove," nothing else.
	let prevEditMode = false;
	$effect(() => {
		const current = editMode;
		untrack(() => {
			if (current === prevEditMode) return;
			prevEditMode = current;
			if (!grid) return;
			grid.enableMove(current);
		});
	});

	// Esc exits edit mode. Skipped when the user is typing in an input —
	// SearchBar owns its own Esc handler and we don't want to steal it.
	$effect(() => {
		if (!browser || !editMode) return;
		function onKey(e) {
			if (e.key !== 'Escape') return;
			const t = e.target;
			const tag = t?.tagName;
			if (tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable) return;
			e.preventDefault();
			pickerOpen = false;
			editMode = false;
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	// Reconcile DOM additions/removals with GridStack's node list. Runs after
	// Svelte's {#each} re-renders or after editMode toggles, which is exactly
	// when new tiles (or the special __add__ tile) need to be registered or
	// unregistered.
	$effect(() => {
		const instances = renderInstances;
		const isEditing = editMode;
		untrack(() => syncGrid(instances, isEditing));
	});

	onMount(() => {
		let cancelled = false;
		syncCols();
		const onResize = () => syncCols();
		window.addEventListener('resize', onResize);
		requestAnimationFrame(() => {
			if (!cancelled) initGrid(() => cancelled);
		});
		return () => {
			cancelled = true;
			window.removeEventListener('resize', onResize);
			if (grid) {
				grid.destroy(false);
				grid = null;
			}
		};
	});
</script>

<!-- Hero area: search bar. Always visible regardless of edit mode —
     entering edit only adds a `+` tile to the surface below, it does not
     take over the search slot. -->
<div class="hero-area">
	{#if searchEnabled}
		<div class="hero-slot">
			<SearchBar bind:query={searchInput} apps={catalog} {onSettingsOpen} />
		</div>
	{/if}
</div>

{#if customizationEnabled && editMode}
	<div class="surface-header is-editing">
		<span class="surface-label"
			>{renderInstances.length}
			{renderInstances.length === 1 ? 'app' : 'apps'}</span
		>
		<div class="surface-actions">
			<button
				type="button"
				class="tray-reset"
				onclick={resetSurface}
				title="Reset surface to default layout"
				aria-label="Reset surface to default layout"
			>Reset</button>
			<button
				type="button"
				class="tray-done"
				onclick={() => (editMode = false)}
			>Done</button>
		</div>
	</div>
{/if}

<div class="grid-center-wrap" style="transform: translateX({centerShiftPct}%);">
<div
	bind:this={gridEl}
	class="grid-stack widget-surface {editMode ? 'grid-edit-mode' : ''}"
>
	{#each renderInstances as { inst, app } (inst.instanceId)}
		{@const entry = getRegistryEntry(inst.type)}
		<div
			class="grid-stack-item"
			gs-id={inst.instanceId}
			gs-x={inst.x}
			gs-y={inst.y}
			gs-w={inst.w}
			gs-h={inst.h}
			gs-min-w={entry?.minSize?.w ?? 1}
			gs-min-h={entry?.minSize?.h ?? 1}
			gs-max-w={entry?.maxSize?.w ?? 12}
			gs-max-h={entry?.maxSize?.h ?? 12}
		>
			<div class="grid-stack-item-content">
				<div class="app-tile gs-drag-handle">
					<a
						href={editMode ? null : app.url}
						target={openInNewTab ? '_blank' : undefined}
						rel={openInNewTab ? 'noopener noreferrer' : undefined}
						class="app-tile-link"
						title={app.name}
						aria-label={app.name}
						onclick={(e) => {
							if (editMode) {
								e.preventDefault();
								return;
							}
							recordAppOpen(app.id);
						}}
						oncontextmenu={editMode ? undefined : (e) => showContext(app, e)}
						ontouchstart={editMode ? undefined : (e) => startLongPress(app, e)}
						ontouchend={editMode ? undefined : cancelLongPress}
						ontouchmove={editMode ? undefined : cancelLongPress}
					>
						<div
							class="app-tile-icon"
							style={iconStyle === 'colored' ? getBrandBgStyle(app.icon) : ''}
						>
							<AppIcon icon={app.icon} name={app.name} size="w-7 h-7" {iconStyle} />
						</div>
						<span class="app-tile-name">{app.name}</span>
					</a>
					{#if editMode}
						<button
							type="button"
							class="app-tile-remove"
							aria-label="Remove {app.name} from surface"
							title="Remove from surface"
							onclick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								removeFromSurface(inst.instanceId);
							}}
							onpointerdown={(e) => e.stopPropagation()}
						>×</button>
					{/if}
				</div>
			</div>
		</div>
	{/each}
	{#if editMode}
		<!-- Add-app tile. Mirrors the .app-tile structure exactly so the + slot
		     aligns with the surrounding tiles (same icon footprint + name row).
		     Parked at gs-y=999 and reflowed to the last free cell by compact()
		     after every add/remove/drag. We deliberately don't set gs-no-move
		     so collisions push it aside; user-drag is gated by the absence of
		     .gs-drag-handle on this tile (see grid handle config). -->
		<div
			class="grid-stack-item add-tile-wrap"
			gs-id="__add__"
			gs-x="0"
			gs-y="999"
			gs-w="1"
			gs-h="1"
			gs-no-resize="true"
		>
			<div class="grid-stack-item-content">
				<div class="app-tile add-tile">
					<button
						type="button"
						class="app-tile-link add-btn"
						aria-label="Add app"
						aria-expanded={pickerOpen}
						bind:this={addBtnEl}
						onclick={() => (pickerOpen = !pickerOpen)}
					>
						<div class="app-tile-icon add-icon">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-7 h-7">
								<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
							</svg>
						</div>
						<span class="app-tile-name">Add</span>
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>
</div>

<!-- Tile context menu (portal to body to escape transform containing block) -->
{#if contextApp}
	<div
		bind:this={contextMenuEl}
		use:portal
		class="fixed z-50 glass-card rounded-xl py-1.5 shadow-theme min-w-[200px] animate-context-in"
		style="visibility: hidden;"
		role="menu"
	>
		{#if contextApp.ios}
			<a href={contextApp.ios} target="_blank" rel="noopener noreferrer" class="flex items-center gap-2.5 px-3.5 py-2 text-[0.8rem] text-content-muted no-underline hover:bg-surface-card-hover transition-colors" role="menuitem">
				<span class="text-content-muted text-xs w-4 text-center">&#63743;</span> Download for iOS
			</a>
		{/if}
		{#if contextApp.android}
			<a href={contextApp.android} target="_blank" rel="noopener noreferrer" class="flex items-center gap-2.5 px-3.5 py-2 text-[0.8rem] text-content-muted no-underline hover:bg-surface-card-hover transition-colors" role="menuitem">
				<span class="text-content-muted text-xs w-4 text-center">&#9654;</span> Download for Android
			</a>
		{/if}
		{#if contextApp.extension}
			<a href={contextApp.extension} target="_blank" rel="noopener noreferrer" class="flex items-center gap-2.5 px-3.5 py-2 text-[0.8rem] text-content-muted no-underline hover:bg-surface-card-hover transition-colors" role="menuitem">
				<span class="text-content-muted text-xs w-4 text-center">&#8862;</span> Browser Extension
			</a>
		{/if}
		{#if setupGuides[contextApp.name]}
			{#if contextApp.ios || contextApp.android || contextApp.extension}
				<div class="border-t border-border-card my-1"></div>
			{/if}
			<button onclick={() => openGuide(contextApp)} class="flex items-center gap-2.5 px-3.5 py-2 text-[0.8rem] text-content-muted bg-transparent border-none cursor-pointer hover:bg-surface-card-hover transition-colors w-full text-left font-mono" role="menuitem">
				<span class="text-content-muted text-xs w-4 text-center">?</span> Setup Guide
			</button>
		{/if}
		<div class="border-t border-border-card my-1"></div>
		<a href={contextApp.url} target="_blank" rel="noopener noreferrer" class="flex items-center gap-2.5 px-3.5 py-2 text-[0.8rem] text-content-muted no-underline hover:bg-surface-card-hover transition-colors" role="menuitem">
			<span class="text-content-muted text-xs w-4 text-center">&#8599;</span> Open {contextApp.name}
		</a>
	</div>
{/if}

<!-- Setup Guide Modal (portal to body) -->
{#if guideApp && setupGuides[guideApp.name]}
	{@const guide = setupGuides[guideApp.name]}
	<div use:portal class="fixed inset-0 bg-surface-overlay backdrop-blur-[6px] flex items-center justify-center z-[100] p-4 animate-fade-in" onclick={() => (guideApp = null)}>
		<div class="glass-card rounded-2xl w-full max-w-[480px] overflow-hidden animate-modal-enter shadow-theme relative" onclick={(e) => e.stopPropagation()}>
			<!-- Header with icon color glow + close -->
			<div class="p-8 pb-6 border-b border-border-card relative">
				<button
					class="absolute top-4 right-5 bg-transparent border-none text-content-dim text-2xl cursor-pointer leading-none hover:text-content w-6 h-6 flex items-center justify-center"
					onclick={() => (guideApp = null)}
					aria-label="Close"
				>&times;</button>
				<div class="flex items-center gap-3.5 mb-1 pr-8">
					<div class="app-icon-wrap w-12 h-12 rounded-[14px] flex items-center justify-center relative overflow-hidden shrink-0">
						{#if iconStyle === 'colored' && guideApp.icon?.colored}
							<img src={guideApp.icon.colored} alt="" class="absolute inset-0 w-full h-full scale-150 blur-xl opacity-40 pointer-events-none" />
						{/if}
						<AppIcon icon={guideApp.icon} name={guideApp.name} size="w-7 h-7" {iconStyle} className={iconStyle === 'colored' ? 'relative z-10' : ''} />
					</div>
					<div class="min-w-0">
						<h3 class="text-[1.2rem] font-semibold text-content m-0 truncate">{guide.title}</h3>
						<p class="text-[0.8rem] text-content-dim m-0 truncate">{guide.subtitle}</p>
					</div>
				</div>
			</div>

			<!-- Steps -->
			<div class="px-8 pb-4 max-h-[300px] overflow-y-auto">
				{#each guide.steps as step, i}
					<div class="flex gap-3.5 {i < guide.steps.length - 1 ? 'mb-5' : ''}">
						<div class="flex flex-col items-center">
							<span class="w-7 h-7 rounded-full bg-surface-card-strong text-[0.75rem] font-semibold text-content-muted flex items-center justify-center shrink-0">{i + 1}</span>
							{#if i < guide.steps.length - 1}
								<div class="w-px flex-1 bg-surface-card mt-2"></div>
							{/if}
						</div>
						<div class="pt-0.5 pb-1">
							<p class="text-[0.9rem] text-content font-medium m-0">{step.label}</p>
							<p class="text-[0.8rem] text-content-dim m-0 mt-1 leading-relaxed">{step.desc}</p>
						</div>
					</div>
				{/each}
			</div>

			<!-- Server URL -->
			<div class="mx-8 mb-5 px-4 py-2.5 glass-card rounded-xl">
				<span class="text-[0.65rem] text-content-dim uppercase tracking-[0.15em]">Server URL</span>
				<p class="text-[0.85rem] text-content-muted font-mono m-0 mt-0.5">{guideApp.url}</p>
			</div>

			<!-- Actions -->
			<div class="px-8 pb-8 flex gap-2.5">
				{#if guideApp.ios}
					<a href={guideApp.ios} target="_blank" rel="noopener noreferrer" class="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-[10px] text-[0.85rem] font-medium font-mono text-center no-underline bg-surface-card-strong text-content border border-border-card hover:bg-surface-card-strong transition-colors">
						<img src="/icons/appstore.svg" alt="" class="w-4 h-4 icon-white" /> App Store
					</a>
				{/if}
				{#if guideApp.android}
					<a href={guideApp.android} target="_blank" rel="noopener noreferrer" class="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-[10px] text-[0.85rem] font-medium font-mono text-center no-underline bg-surface-card-strong text-content border border-border-card hover:bg-surface-card-strong transition-colors">
						<img src="/icons/googleplay.svg" alt="" class="w-4 h-4 icon-white" /> Play Store
					</a>
				{/if}
			</div>
		</div>
	</div>
{/if}

{#if customizationEnabled}
	{#if editMode}
		<div class="edit-hint" role="status">
			Click + to add an app · drag tiles to rearrange
		</div>
	{:else}
		<div class="surface-footer">
			<button
				type="button"
				class="edit-chip"
				onclick={() => (editMode = true)}
				aria-label="Edit layout"
				title="Edit layout"
			>Edit</button>
		</div>
	{/if}
{/if}

{#if editMode && pickerOpen}
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
							placeAppOnSurface(app.id);
							pickerOpen = false;
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
							placePopularOnSurface(app);
							pickerOpen = false;
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
{/if}

<style>
	.hero-area {
		padding: 1rem 0 1.5rem;
	}
	/* Hint line shown only in edit mode, parked under the surface (after the
	   grid + Reset/Done row). Mirrors the chip typography (size, tracking,
	   muted tone) so the edit surface reads as one tonal family. */
	.edit-hint {
		font-size: 0.6rem;
		letter-spacing: 0.06em;
		color: var(--color-content-dim, #a1a1aa);
		opacity: 0.7;
		text-align: center;
		margin-top: 1rem;
		margin-bottom: 1rem;
	}
	/* Reset and Done share the Edit chip shape so the surface controls read
	   as one family. Done gets a slightly brighter border to mark it as the
	   primary action without breaking out into a colored CTA. */
	.tray-reset,
	.tray-done {
		font-size: 0.6rem;
		letter-spacing: 0.06em;
		padding: 0.2rem 0.6rem;
		border-radius: 9999px;
		background: transparent;
		border: 1px solid rgba(255, 255, 255, 0.10);
		color: var(--color-content-dim, #a1a1aa);
		opacity: 0.7;
		cursor: pointer;
		transition: background 180ms var(--ease-standard, ease),
			border-color 180ms, color 180ms, opacity 180ms;
	}
	.tray-done {
		border-color: rgba(255, 255, 255, 0.22);
		color: var(--color-content-muted, #d4d4d8);
		opacity: 0.9;
	}
	.tray-reset:hover,
	.tray-reset:focus-visible,
	.tray-done:hover,
	.tray-done:focus-visible {
		background: rgba(255, 255, 255, 0.06);
		border-color: rgba(255, 255, 255, 0.32);
		color: var(--color-content, #fafafa);
		opacity: 1;
		outline: none;
	}
	.hero-slot {
		min-height: 3rem;
	}
	/* Edit-mode add tile — same structural layout as .app-tile so the icon
	   and name row line up with the surrounding tiles pixel-for-pixel. The
	   icon square is borrowed via .app-tile-icon, then overridden to dashed
	   "empty slot" styling. */
	.add-btn {
		background: transparent;
		border: none;
		cursor: pointer;
		font: inherit;
	}
	.add-btn.app-tile-link:hover {
		background: transparent;
	}
	.add-icon {
		background: transparent;
		border: 1px dashed var(--text-dim);
		color: var(--text-muted);
		box-shadow: none !important;
		transition: border-color 200ms, color 200ms;
	}
	.add-btn:hover .add-icon,
	.add-btn[aria-expanded='true'] .add-icon {
		border-style: solid;
		color: var(--text);
	}

	/* Picker dropdown — floating, fixed-positioned in viewport coords (left/top
	   set from JS). Rendered outside the grid so it's not visually nested
	   inside the + tile. */
	.add-picker {
		position: fixed;
		width: 220px;
		max-height: 280px;
		overflow-y: auto;
		padding: 0.25rem;
		background: var(--hero-search-bg);
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
		font-size: 0.5rem;
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

	.surface-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0 0.25rem;
		margin-top: 0.25rem;
		margin-bottom: 0.5rem;
	}
	.surface-label {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-content-dim, #a1a1aa);
		font-variant-numeric: tabular-nums;
	}
	.surface-actions {
		display: flex;
		gap: 0.4rem;
	}

	/* Edit affordance lives in its own row below the grid so it never crowds
	   the tiles. Chip-shaped: rounded border, transparent fill, quiet at
	   rest, brightens on hover. Centered so it reads as a deliberate action
	   rather than a stray control. */
	.surface-footer {
		display: flex;
		justify-content: center;
		margin-top: 1rem;
		margin-bottom: 1rem;
	}
	.edit-chip {
		font-size: 0.6rem;
		letter-spacing: 0.06em;
		padding: 0.2rem 0.6rem;
		border-radius: 9999px;
		background: transparent;
		border: 1px solid rgba(255, 255, 255, 0.10);
		color: var(--color-content-dim, #a1a1aa);
		opacity: 0.7;
		cursor: pointer;
		transition: background 180ms var(--ease-standard, ease),
			border-color 180ms, color 180ms, opacity 180ms;
	}
	.edit-chip:hover,
	.edit-chip:focus-visible {
		background: rgba(255, 255, 255, 0.06);
		border-color: rgba(255, 255, 255, 0.28);
		color: var(--color-content, #fafafa);
		opacity: 1;
		outline: none;
	}

	.widget-surface {
		min-height: 4rem;
	}

	/* Wrapper around .grid-stack that owns the centering translateX. Kept
	   separate from the grid element so GridStack's own inline styles
	   (--gs-current-row, computed height) don't fight Svelte's reactive
	   style writes. */
	.grid-center-wrap {
		transition: transform 220ms var(--ease-standard, ease);
	}

	/* App tile — fills its grid cell entirely. Icon centered, name underneath. */
	.app-tile {
		position: relative;
		width: 100%;
		height: 100%;
		display: flex;
	}
	.app-tile-link {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
		width: 100%;
		height: 100%;
		padding: 0.4rem 0.25rem;
		border-radius: 0.6rem;
		text-decoration: none;
		color: var(--color-content, #e4e4e7);
		transition: background 200ms var(--ease-standard, ease);
	}
	.app-tile-link:hover {
		background: rgba(255, 255, 255, 0.05);
	}
	.app-tile-icon {
		width: 44px;
		height: 44px;
		border-radius: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		background: rgba(255, 255, 255, 0.06);
		flex-shrink: 0;
	}
	.app-tile-name {
		font-size: 0.65rem;
		text-align: center;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--color-content-muted, #d4d4d8);
	}
	.app-tile-remove {
		position: absolute;
		top: 2px;
		right: 2px;
		width: 18px;
		height: 18px;
		border-radius: 9999px;
		background: rgba(0, 0, 0, 0.7);
		color: #fff;
		font-size: 0.85rem;
		line-height: 1;
		border: none;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		z-index: 5;
	}
	.app-tile-remove:hover {
		background: rgba(220, 38, 38, 0.85);
	}

	/* Drag handle cursor — restricted to the tile itself; the inner link
	   stays clickable when not in edit mode. */
	.gs-drag-handle {
		cursor: grab;
	}
	.gs-drag-handle:active {
		cursor: grabbing;
	}
</style>
