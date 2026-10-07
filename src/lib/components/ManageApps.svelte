<script>
	import { dialog } from '$lib/actions/dialog.js';
	import { getContext } from 'svelte';
	import { prefs } from '$lib/stores/prefs.js';
	import { buildAppsFromConfig } from '$lib/apps.js';
	import IntegrationsPanel from '$lib/components/IntegrationsPanel.svelte';
	import { TOTAL_WALLPAPERS, getWallpaperThumbUrl } from '$lib/wallpaper.js';
	import { browser } from '$app/environment';
	import { confirmDiscardUnsaved } from '$lib/unsaved.js';

	const siteConfig = getContext('config');
	// Off when database.enabled is false: credentials would have nowhere to live.
	const integrationsEnabled = siteConfig?.integrations?.enabled !== false;
	const { apps: catalogApps } = buildAppsFromConfig(siteConfig?.apps);
	const defaultAppIds = catalogApps.filter((a) => a.default !== false).map((a) => a.id);

	let { open = $bindable(false) } = $props();

	let activeTab = $state('appearance');
	let visibleSet = $state(new Set($prefs.visibleApps || defaultAppIds));
	let iconStyle = $state($prefs.iconStyle || 'colored');
	let theme = $state($prefs.theme || 'auto');
	let wallpaperEnabled = $state($prefs.wallpaperEnabled !== false);
	let wallpaperId = $state($prefs.wallpaperId || null);
	let openInNewTab = $state($prefs.openInNewTab ?? true);
	let wallpaperPage = $state(0);
	let enabledWidgets = $state(new Set($prefs.enabledWidgets || ['weather', 'search']));
	const WALLPAPERS_PER_PAGE = 12;
	const totalPages = Math.ceil(TOTAL_WALLPAPERS / WALLPAPERS_PER_PAGE);

	let prevOpen = false;

	function loadFromPrefs() {
		visibleSet = new Set($prefs.visibleApps || defaultAppIds);
		iconStyle = $prefs.iconStyle || 'colored';
		theme = $prefs.theme || 'auto';
		wallpaperEnabled = $prefs.wallpaperEnabled !== false;
		wallpaperId = $prefs.wallpaperId || null;
		openInNewTab = $prefs.openInNewTab ?? true;
		wallpaperPage = wallpaperId ? Math.floor((wallpaperId - 1) / WALLPAPERS_PER_PAGE) : 0;
		enabledWidgets = new Set($prefs.enabledWidgets || ['weather', 'search']);
	}
	$effect(() => {
		if (open && !prevOpen) {
			activeTab = 'appearance';
			loadFromPrefs();
		}
		prevOpen = open;
	});

	// Every close path goes through here so unsaved integration edits
	// (marked data-unsaved by IntegrationCard) aren't dropped silently.
	function requestClose() {
		if (!confirmDiscardUnsaved()) return;
		open = false;
	}

	// Switching tabs unmounts the integrations panel, so it asks too.
	function selectTab(id) {
		if (id !== activeTab && !confirmDiscardUnsaved()) return;
		activeTab = id;
	}

	// Close on Escape while the modal is open
	$effect(() => {
		if (!browser || !open) return;
		function onKey(e) {
			if (e.key === 'Escape') {
				e.preventDefault();
				requestClose();
			}
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});


	function toggle(appId) {
		const next = new Set(visibleSet);
		if (next.has(appId)) next.delete(appId);
		else next.add(appId);
		visibleSet = next;
		prefs.update(p => ({ ...p, visibleApps: [...next] }));
	}

	function setIconStyle(style) {
		iconStyle = style;
		prefs.update(p => ({ ...p, iconStyle: style }));
	}

	function setTheme(t) {
		theme = t;
		prefs.update(p => ({ ...p, theme: t }));
	}

	function toggleWallpaper() {
		wallpaperEnabled = !wallpaperEnabled;
		prefs.update(p => ({ ...p, wallpaperEnabled }));
	}

	function toggleOpenInNewTab() {
		openInNewTab = !openInNewTab;
		prefs.update(p => ({ ...p, openInNewTab }));
	}

	function toggleWidget(id) {
		const next = new Set(enabledWidgets);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		enabledWidgets = next;
		prefs.update(p => ({ ...p, enabledWidgets: [...next] }));
	}

	function selectWallpaper(id) {
		wallpaperId = id;
		prefs.update(p => ({ ...p, wallpaperId: id }));
	}

	// Reset is appearance-only: bookmarks (customApps) and the tile layout are
	// left alone. The button offers Undo for a few seconds afterwards.
	const RESET_KEYS = ['visibleApps', 'iconStyle', 'theme', 'wallpaperEnabled', 'wallpaperId', 'openInNewTab'];
	let resetUndo = $state(null);
	let resetUndoTimer;

	function resetDefaults() {
		resetUndo = Object.fromEntries(RESET_KEYS.map((k) => [k, $prefs[k]]));
		clearTimeout(resetUndoTimer);
		resetUndoTimer = setTimeout(() => (resetUndo = null), 8000);
		prefs.update(p => ({ ...p, visibleApps: null, iconStyle: 'colored', theme: 'auto', wallpaperEnabled: true, wallpaperId: null, openInNewTab: true }));
		loadFromPrefs();
	}

	function undoResetDefaults() {
		const snapshot = resetUndo;
		resetUndo = null;
		clearTimeout(resetUndoTimer);
		if (!snapshot) return;
		prefs.update(p => ({ ...p, ...snapshot }));
		loadFromPrefs();
	}

	function portal(node) {
		document.body.appendChild(node);
		return { destroy() { if (node.parentNode) node.parentNode.removeChild(node); } };
	}

	const iconStyles = [
		{ id: 'colored', label: 'Colored' },
		{ id: 'white', label: 'White' },
		{ id: 'grayed', label: 'Grayed' }
	];

	const themes = [
		{ id: 'auto', label: 'Dynamic' },
		{ id: 'dark', label: 'Dark' },
		{ id: 'light', label: 'Light' }
	];
</script>

{#if open}
	<div
		use:portal
		use:dialog={{ label: 'Configure', onclose: requestClose }}
		class="fixed inset-0 modal-veil flex items-center justify-center z-[100] p-4"
	>
		<div
			class="glass-card rounded-2xl w-full max-w-[620px] h-[520px] max-md:max-w-full max-md:h-[75vh] max-md:rounded-xl overflow-hidden animate-modal-enter shadow-theme relative flex flex-col"
		>
			<!-- Header strip -->
			<div class="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border-card">
				<span class="text-[0.8rem] font-semibold text-content">Configure</span>
				<button
					class="bg-transparent border-none text-content-dim text-2xl cursor-pointer leading-none hover:text-content w-6 h-6 flex items-center justify-center"
					onclick={requestClose}
					aria-label="Close"
				>&times;</button>
			</div>

			<!-- Mobile: horizontal tabs -->
			<div class="hidden max-md:flex shrink-0 px-3 pt-2 pb-1 gap-1 border-b border-border-card overflow-x-auto items-center">
				{#each [
					{ id: 'appearance', label: 'Appearance' },
					{ id: 'widgets', label: 'Widgets' },
					{ id: 'integrations', label: 'Integrations' }
				].filter((t) => t.id !== 'integrations' || integrationsEnabled) as tab}
					<button
						class="flex-1 min-w-fit px-2.5 py-2.5 rounded-lg border-none cursor-pointer text-center text-[0.75rem] font-medium transition-all duration-150 {activeTab === tab.id ? 'bg-surface-card-strong text-content' : 'bg-transparent text-content-dim'}"
						onclick={() => selectTab(tab.id)}
					>{tab.label}</button>
				{/each}
			</div>

			<!-- Tabbed layout: sidebar (desktop) + content -->
			<div class="flex flex-1 min-h-0">
				<!-- Sidebar — hidden on mobile -->
				<div class="w-[160px] shrink-0 px-2.5 pt-3 pb-3 flex flex-col max-md:hidden">
					<div class="flex flex-col gap-0.5">
						{#each [
							{ id: 'appearance', label: 'Appearance', svg: '<circle cx="12" cy="12" r="3"/><path d="M12 1v2m0 18v-2M4.22 4.22l1.42 1.42m12.72 12.72-1.42-1.42M1 12h2m18 0h-2M4.22 19.78l1.42-1.42M18.36 5.64l-1.42 1.42"/>' },
							{ id: 'widgets', label: 'Widgets', svg: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>' },
							{ id: 'integrations', label: 'Integrations', svg: '<path d="M9 2v6"/><path d="M15 2v6"/><path d="M12 17v5"/><path d="M5 8h14a2 2 0 0 1 2 2v3a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5v-3a2 2 0 0 1 2-2z"/>' }
						].filter((t) => t.id !== 'integrations' || integrationsEnabled) as tab}
							<button
								class="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg border-none cursor-pointer transition-all duration-150 text-left {activeTab === tab.id ? 'bg-surface-card-strong' : 'bg-transparent hover:bg-surface-card-hover'}"
								onclick={() => selectTab(tab.id)}
							>
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 shrink-0 {activeTab === tab.id ? 'text-content' : 'text-content-dim'}">{@html tab.svg}</svg>
								<span class="text-[0.78rem] font-medium {activeTab === tab.id ? 'text-content' : 'text-content-dim'}">{tab.label}</span>
							</button>
						{/each}
					</div>
					<div class="mt-auto pt-3">
						{#if resetUndo}
							<button
								class="text-[0.7rem] text-content bg-transparent border-none cursor-pointer underline underline-offset-2 font-mono px-3"
								onclick={undoResetDefaults}
							>Undo reset</button>
						{:else}
							<button
								class="text-[0.7rem] text-content-dim bg-transparent border-none cursor-pointer hover:text-content transition-colors font-mono px-3"
								onclick={resetDefaults}
							>Reset defaults</button>
						{/if}
					</div>
				</div>

				<!-- Tab content -->
				<div class="flex-1 max-md:border-l-0 border-l border-border-card px-5 max-md:px-4 pt-3 pb-4 overflow-y-auto">

				{#if activeTab === 'appearance'}
				<!-- ═══ APPEARANCE TAB ═══ -->
				<div class="mb-4">
					<div class="text-[0.85rem] font-semibold text-content">Appearance</div>
					<div class="text-[0.7rem] text-content-dim mt-0.5">Customize how your dashboard looks.</div>
				</div>

				<!-- Theme -->
				<div class="mb-5">
					<div class="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-content-dim mb-2">Theme</div>
					<div class="segmented" role="radiogroup">
						{#each themes as t}
							<button
								role="radio"
								aria-checked={theme === t.id}
								class="segmented-item"
								onclick={() => setTheme(t.id)}
							>{t.label}</button>
						{/each}
					</div>
				</div>

				<!-- Icon style -->
				<div class="mb-5">
					<div class="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-content-dim mb-2">Icon style</div>
					<div class="segmented" role="radiogroup">
						{#each iconStyles as style}
							<button
								role="radio"
								aria-checked={iconStyle === style.id}
								class="segmented-item"
								onclick={() => setIconStyle(style.id)}
							>{style.label}</button>
						{/each}
					</div>
				</div>

				<!-- Open apps in new tab -->
				<div class="mb-4">
					<div class="flex items-center justify-between">
						<span class="text-[0.8rem] text-content-muted">Open apps in new tab</span>
						<button class="bg-transparent border-none cursor-pointer p-0" role="switch" aria-checked={openInNewTab} aria-label="Open apps in new tab" onclick={toggleOpenInNewTab}>
							<div class="w-9 h-5 rounded-full transition-colors duration-200 relative shrink-0 {openInNewTab ? 'bg-surface-toggle-on' : 'bg-surface-toggle-off'}">
								<div class="absolute top-0.5 w-4 h-4 rounded-full bg-surface-toggle-knob shadow transition-transform duration-200 {openInNewTab ? 'translate-x-4' : 'translate-x-0.5'}"></div>
							</div>
						</button>
					</div>
				</div>

				<!-- Wallpaper — visible in all themes, disabled when not Dynamic -->
				<div class="mb-4 {theme !== 'auto' ? 'opacity-40 pointer-events-none' : ''}">
					<div class="flex items-center justify-between mb-3">
						<span class="text-[0.8rem] text-content-muted">Wallpaper {theme !== 'auto' ? '(Dynamic only)' : ''}</span>
						<button class="bg-transparent border-none cursor-pointer p-0" role="switch" aria-checked={wallpaperEnabled && theme === 'auto'} aria-label="Wallpaper" onclick={toggleWallpaper}>
							<div class="w-9 h-5 rounded-full transition-colors duration-200 relative shrink-0 {wallpaperEnabled && theme === 'auto' ? 'bg-surface-toggle-on' : 'bg-surface-toggle-off'}">
								<div class="absolute top-0.5 w-4 h-4 rounded-full bg-surface-toggle-knob shadow transition-transform duration-200 {wallpaperEnabled && theme === 'auto' ? 'translate-x-4' : 'translate-x-0.5'}"></div>
							</div>
						</button>
					</div>

					{#if wallpaperEnabled && theme === 'auto'}
						<!-- Daily rotation option -->
						<button
							class="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-[0.75rem] font-mono cursor-pointer transition-all duration-150 mb-2 {!wallpaperId ? 'bg-surface-card-strong text-content border border-border-pill' : 'bg-transparent text-content-dim border border-border-card hover:bg-surface-card-hover'}"
							onclick={() => selectWallpaper(null)}
						>Daily rotation</button>

						<!-- Wallpaper grid — always visible -->
						<div class="grid grid-cols-3 max-md:grid-cols-2 gap-1.5">
							{#each Array.from({length: WALLPAPERS_PER_PAGE}, (_, i) => wallpaperPage * WALLPAPERS_PER_PAGE + i + 1).filter(id => id <= TOTAL_WALLPAPERS) as id}
								<button
									class="relative aspect-video rounded-lg overflow-hidden cursor-pointer border-2 transition-all duration-150 bg-surface-card {wallpaperId == id ? 'border-white/60 shadow-lg' : 'border-transparent hover:border-border-pill'}"
									onclick={() => selectWallpaper(id)}
								>
									<div class="absolute inset-0 shimmer"></div>
									<img
										src={getWallpaperThumbUrl(id)}
										alt="Wallpaper {id}"
										loading="lazy"
										class="absolute inset-0 w-full h-full object-cover transition-opacity duration-300 opacity-0"
										onload={(e) => e.target.classList.replace('opacity-0', 'opacity-100')}
									/>
									{#if wallpaperId == id}
										<div class="absolute inset-0 bg-white/10 flex items-center justify-center z-10">
											<span class="text-white text-xs font-bold drop-shadow">✓</span>
										</div>
									{/if}
								</button>
							{/each}
						</div>

						<!-- Pagination -->
						<div class="flex items-center justify-between mt-2 px-1">
							<button
								class="text-[0.7rem] text-content-dim bg-transparent border-none cursor-pointer hover:text-content transition-colors font-mono disabled:opacity-30 disabled:cursor-not-allowed"
								disabled={wallpaperPage === 0}
								onclick={() => wallpaperPage--}
							>← Prev</button>
							<span class="text-[0.7rem] text-content-dim font-mono">{wallpaperPage + 1} / {totalPages}</span>
							<button
								class="text-[0.7rem] text-content-dim bg-transparent border-none cursor-pointer hover:text-content transition-colors font-mono disabled:opacity-30 disabled:cursor-not-allowed"
								disabled={wallpaperPage >= totalPages - 1}
								onclick={() => wallpaperPage++}
							>Next →</button>
						</div>
					{/if}
				</div>

				{:else if activeTab === 'widgets'}
				<!-- ═══ WIDGETS TAB ═══ -->
				<div class="mb-4">
					<div class="text-[0.85rem] font-semibold text-content">Widgets</div>
					<div class="text-[0.7rem] text-content-dim mt-0.5">Turn parts of your page on or off. To add or move apps, use Edit on the dashboard.</div>
				</div>
				{@const widgets = [
					{ id: 'weather', name: 'Weather', desc: 'Temperature and conditions for your location', icon: 'M12 3v2M12 19v2M5.6 5.6 7 7M17 17l1.4 1.4M3 12h2M19 12h2M5.6 18.4 7 17M17 7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z' },
					{ id: 'search', name: 'Search', desc: 'Search apps and files from the middle of the page', icon: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4' }
				]}
				{#each widgets as widget}
					<button
						class="flex items-center gap-3 w-full px-2 py-3 bg-transparent border-none border-b border-border-card text-left font-mono cursor-pointer hover:bg-surface-card-hover"
						onclick={() => toggleWidget(widget.id)}
					>
						<span class="w-8 h-8 rounded-lg bg-surface-input border border-border-card flex items-center justify-center shrink-0 text-content-muted">
							<svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={widget.icon} /></svg>
						</span>
						<div class="flex-1 min-w-0">
							<div class="text-[0.8rem] text-content font-medium">{widget.name}</div>
							<div class="text-[0.7rem] text-content-dim">{widget.desc}</div>
						</div>
						<div class="w-9 h-5 rounded-full transition-colors duration-200 relative shrink-0 {enabledWidgets.has(widget.id) ? 'bg-surface-toggle-on' : 'bg-surface-toggle-off'}">
							<div class="absolute top-0.5 w-4 h-4 rounded-full bg-surface-toggle-knob shadow transition-transform duration-200 {enabledWidgets.has(widget.id) ? 'translate-x-4' : 'translate-x-0.5'}"></div>
						</div>
					</button>
				{/each}

				{:else if activeTab === 'integrations'}
				<!-- ═══ INTEGRATIONS TAB ═══ -->
				<IntegrationsPanel {iconStyle} />

				{/if}
				</div>
			</div>

		</div>
	</div>
{/if}

