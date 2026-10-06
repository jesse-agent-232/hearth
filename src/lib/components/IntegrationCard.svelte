<script>
	import { onDestroy } from 'svelte';
	import { marked } from 'marked';
	import AppIcon from './AppIcon.svelte';
	import { integrations as integrationsStore } from '$lib/stores/integrations.js';
	import { resolveIcon } from '$lib/apps.js';

	let {
		integration,
		iconStyle = 'colored',
		expanded = false,
		onExpandRequest = () => {},
		onCollapseRequest = () => {}
	} = $props();

	let cardEl = $state(null);
	let formEl = $state(null);

	const icon = $derived(resolveIcon(integration.icon));

	function seedConfig() {
		const out = {};
		for (const f of integration.configSchema) {
			const known = integration.userState?.config?.[f.key];
			const opDefault = integration.operatorDefaults?.[f.key];
			out[f.key] = known ?? opDefault ?? '';
		}
		return out;
	}

	function seedSurfaces() {
		const out = {};
		for (const surface of integration.availableSurfaces || []) {
			out[surface] = !!integration.userState?.surfaces?.[surface];
		}
		return out;
	}

	let formConfig = $state(seedConfig());
	let formSurfaces = $state(seedSurfaces());
	let contextOpen = $state(false);
	let menuEl = $state(null);
	let testStatus = $state(null);
	let testing = $state(false);
	let saving = $state(false);
	let saveError = $state('');
	let dirty = $state(false);

	const connected = $derived(!!integration.userState?.connected);
	const hasSearch = $derived((integration.availableSurfaces || []).includes('search'));
	const hasWidgets = $derived((integration.availableSurfaces || []).includes('widgets'));
	const visibleFields = $derived(integration.configSchema.filter((f) => !f.hidden));
	const signedInAs = $derived(integration.signIn && connected ? integration.userState?.config?.userName : '');

	// Sign-in flow: { flowId, code } while waiting for approval elsewhere.
	let signFlow = $state(null);
	let signStarting = $state(false);
	let signError = $state('');
	let pollTimer = null;
	let flowSeq = 0;

	async function startSignIn() {
		cancelSignIn();
		signStarting = true;
		signError = '';
		const seq = flowSeq;
		try {
			const res = await integrationsStore.signIn(integration.id, { action: 'start', config: formConfig });
			if (seq !== flowSeq) return;
			signFlow = { flowId: res.flowId, code: res.code, link: res.link };
			schedulePoll(seq);
		} catch (err) {
			if (seq === flowSeq) signError = err.message || 'Sign-in failed';
		} finally {
			signStarting = false;
		}
	}

	function schedulePoll(seq) {
		pollTimer = setTimeout(async () => {
			if (seq !== flowSeq || !signFlow) return;
			try {
				const res = await integrationsStore.signIn(integration.id, { action: 'poll', flowId: signFlow.flowId });
				if (seq !== flowSeq) return;
				if (res.status === 'pending') return schedulePoll(seq);
				signFlow = null;
				if (res.status === 'done') {
					formConfig = seedConfig();
					formSurfaces = seedSurfaces();
					dirty = false;
					onCollapseRequest();
				} else {
					signError = res.status === 'expired' ? 'The code expired — start again' : res.error || 'Sign-in failed';
				}
			} catch (err) {
				if (seq !== flowSeq) return;
				signFlow = null;
				signError = err.message || 'Sign-in failed';
			}
		}, 2000);
	}

	function cancelSignIn() {
		flowSeq++;
		clearTimeout(pollTimer);
		signFlow = null;
	}

	onDestroy(cancelSignIn);

	function markDirty() {
		dirty = true;
		testStatus = null;
		saveError = '';
	}

	async function runTest() {
		testing = true;
		testStatus = null;
		try {
			testStatus = await integrationsStore.test(integration.id, formConfig);
		} catch (err) {
			testStatus = { ok: false, message: err.message || 'Test failed' };
		} finally {
			testing = false;
		}
	}

	async function runSave() {
		saving = true;
		saveError = '';
		try {
			if ((!connected || dirty) && !testStatus?.ok) {
				const res = await integrationsStore.test(integration.id, formConfig);
				testStatus = res;
				if (!res.ok) {
					saveError = res.message || 'Test failed — fix credentials before saving';
					return;
				}
			}
			const willConnectFresh = !connected;
			const surfacesToSave = { ...formSurfaces };
			if (willConnectFresh && hasSearch) {
				surfacesToSave.search = true;
				formSurfaces = surfacesToSave;
			}
			await integrationsStore.save(integration.id, { config: formConfig, surfaces: surfacesToSave });
			dirty = false;
			onCollapseRequest();
		} catch (err) {
			saveError = err.message || 'Save failed';
		} finally {
			saving = false;
		}
	}

	async function runDisconnect() {
		if (!connected) return;
		contextOpen = false;
		if (!confirm(`Disconnect ${integration.name}? Stored credentials will be removed.`)) return;
		saving = true;
		try {
			await integrationsStore.disconnect(integration.id);
			formConfig = seedConfig();
			formSurfaces = seedSurfaces();
			testStatus = null;
			dirty = false;
			onCollapseRequest();
		} catch (err) {
			saveError = err.message || 'Disconnect failed';
		} finally {
			saving = false;
		}
	}

	// Cancel throws away edits, so reopening shows the saved state again.
	function cancelEdit() {
		cancelSignIn();
		signError = '';
		formConfig = seedConfig();
		formSurfaces = seedSurfaces();
		testStatus = null;
		saveError = '';
		dirty = false;
		onCollapseRequest();
	}

	async function toggleSurface(surface) {
		if (!connected) {
			formSurfaces = { ...formSurfaces, [surface]: !formSurfaces[surface] };
			return;
		}
		const next = { ...formSurfaces, [surface]: !formSurfaces[surface] };
		formSurfaces = next;
		try {
			await integrationsStore.save(integration.id, {
				config: integration.userState.config,
				surfaces: next
			});
		} catch (err) {
			formSurfaces = { ...formSurfaces, [surface]: !formSurfaces[surface] };
			saveError = err.message || 'Failed to update surface';
		}
	}

	function handleRowClick() {
		if (connected) return;
		if (expanded) onCollapseRequest();
		else onExpandRequest();
	}

	function openContext(e) {
		e.stopPropagation();
		contextOpen = !contextOpen;
	}

	function editConnection() {
		contextOpen = false;
		onExpandRequest();
	}

	$effect(() => {
		if (expanded && cardEl) {
			cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
		if (expanded && formEl) {
			const first = formEl.querySelector('input:not([readonly]):not([disabled])');
			if (first) first.focus();
		}
	});

	// Close context menu on click outside
	$effect(() => {
		if (!contextOpen) return;
		function close(e) {
			if (menuEl && !menuEl.contains(e.target)) contextOpen = false;
		}
		function escape(e) {
			if (e.key !== 'Escape') return;
			// Close just this menu, not the Configure modal around it.
			e.stopPropagation();
			contextOpen = false;
		}
		document.addEventListener('mousedown', close);
		document.addEventListener('keydown', escape);
		return () => {
			document.removeEventListener('mousedown', close);
			document.removeEventListener('keydown', escape);
		};
	});
</script>

<!-- data-unsaved lets ManageApps confirm before closing over typed edits -->
<div
	bind:this={cardEl}
	data-unsaved={expanded && dirty ? '' : undefined}
	class="rounded-lg transition-colors {expanded ? 'border border-border-pill bg-surface-card/30' : 'border border-transparent'}"
>
	<!-- Row (acts as header when expanded) -->
	<div
		class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors"
	>
		<AppIcon {icon} name={integration.name} size="w-3.5 h-3.5" wrapSize="w-5 h-5" {iconStyle} wrap />
		<div class="flex-1 min-w-0">
			<span class="text-[0.8rem] text-content font-medium">{integration.name}</span>
			{#if signedInAs && !expanded}
				<span class="block text-[0.7rem] text-content-dim truncate">Signed in as {signedInAs}</span>
			{/if}
		</div>
		<div class="flex items-center gap-2">
			{#if expanded}
				<button
					class="text-[0.7rem] font-mono text-content-dim px-2.5 py-1 rounded-lg border border-border-card bg-transparent cursor-pointer hover:text-content hover:bg-surface-card-hover transition-colors"
					onclick={cancelEdit}
				>Cancel</button>
			{:else if connected}
				<span class="text-[0.7rem] font-mono text-emerald-400 px-2.5 py-1 rounded-lg border border-emerald-400/30 bg-emerald-500/5">Connected</span>
				<div class="relative" bind:this={menuEl}>
					<button
						class="w-7 h-7 rounded-lg border border-border-card bg-transparent text-content-dim cursor-pointer hover:text-content hover:bg-surface-card-hover transition-colors flex items-center justify-center"
						onclick={openContext}
						title="Options"
					>
						<svg viewBox="0 0 24 24" fill="currentColor" class="w-3 h-3">
							<circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
						</svg>
					</button>
					{#if contextOpen}
						<div class="absolute right-0 top-full mt-1 bg-surface-modal border border-border-card rounded-lg shadow-theme z-50 min-w-[140px] py-1">
							<button
								class="w-full px-3 py-1.5 text-left text-[0.75rem] text-content-muted bg-transparent border-none cursor-pointer hover:bg-surface-card-hover transition-colors"
								onclick={editConnection}
							>{integration.signIn ? 'Sign in again' : 'Edit connection'}</button>
							<button
								class="w-full px-3 py-1.5 text-left text-[0.75rem] text-red-400/80 bg-transparent border-none cursor-pointer hover:bg-surface-card-hover transition-colors"
								onclick={runDisconnect}
							>Disconnect</button>
						</div>
					{/if}
				</div>
			{:else}
				<button
					class="text-[0.7rem] font-mono text-content-dim px-2.5 py-1 rounded-lg border border-border-card bg-transparent cursor-pointer hover:text-content hover:bg-surface-card-hover transition-colors"
					onclick={handleRowClick}
				>Connect</button>
			{/if}
		</div>
	</div>

	<!-- Expandable config form -->
	{#if expanded}
		<div bind:this={formEl} class="px-3 pb-3 pt-3 space-y-3 border-t border-border-card" data-form-type="other">
			{#if integration.tip}
				<div class="text-[0.7rem] text-content-dim/70 leading-relaxed px-2 py-1.5 rounded-lg bg-surface-card/40 border border-border-card">
					{integration.tip}
				</div>
			{/if}
			<div class="space-y-2">
				{#each visibleFields as field}
					{@const lockedByOperator = field.fromOperatorDefault && integration.operatorDefaults?.[field.key]}
					<label class="block">
						<span class="block text-[0.7rem] text-content-dim mb-1">{field.label}{#if field.required}<span class="text-[var(--accent,#f5b942)]" aria-hidden="true"> *</span>{/if}</span>
						<input
							type={field.type === 'secret' ? 'password' : field.type === 'url' ? 'url' : 'text'}
							bind:value={formConfig[field.key]}
							placeholder={field.placeholder}
							oninput={markDirty}
							readonly={!!lockedByOperator}
							class="w-full bg-surface-input border border-border-input rounded-lg px-3 py-2 text-[0.8rem] text-content font-mono placeholder:text-content-dim outline-none focus:border-border-pill {lockedByOperator ? 'opacity-60 cursor-not-allowed' : ''}"
							autocomplete={field.type === 'secret' ? 'new-password' : 'off'}
							spellcheck="false"
							data-1p-ignore="true"
							data-lpignore="true"
							data-bwignore="true"
						/>
						{#if lockedByOperator}
							<span class="block text-[0.7rem] text-content-dim mt-1">Set by your administrator</span>
						{:else}
							{#if field.help}
								<div class="field-help text-[0.7rem] text-content-dim mt-1.5 leading-relaxed">
									{@html marked.parse(field.help)}
								</div>
							{/if}
							{#if field.helpUrl && formConfig[field.helpUrl.baseKey]}
								<a
									href="{formConfig[field.helpUrl.baseKey]}{field.helpUrl.path}"
									target="_blank"
									rel="noopener noreferrer"
									class="inline-block text-[0.7rem] text-blue-400 hover:text-blue-300 mt-1 no-underline hover:underline"
								>{field.helpUrl.label} ↗</a>
							{/if}
						{/if}
					</label>
				{/each}

				{#if integration.signIn}
					{#if signFlow}
						<div class="rounded-lg border border-border-card bg-surface-card/40 px-3 py-3 text-center" role="status" aria-live="polite">
							<div class="text-[0.7rem] text-content-dim mb-1.5">Your code</div>
							<div class="signin-digits font-mono text-content" aria-label="Code {signFlow.code.split('').join(' ')}">{signFlow.code}</div>
							{#if integration.signIn.help}
								<div class="field-help text-[0.7rem] text-content-dim mt-2 leading-relaxed">{@html marked.parse(integration.signIn.help)}</div>
							{/if}
							{#if signFlow.link}
								<a
									href={signFlow.link}
									target="_blank"
									rel="noopener noreferrer"
									class="inline-block text-[0.7rem] text-blue-400 hover:text-blue-300 mt-1 no-underline hover:underline"
								>Open {integration.name} ↗</a>
							{/if}
							<div class="flex items-center justify-center gap-2 text-[0.7rem] text-content-dim mt-2.5">
								<span class="signin-spinner" aria-hidden="true"></span>
								Waiting for approval…
							</div>
						</div>
					{/if}
					{#if signError}
						<div class="text-[0.7rem] font-mono px-2 py-1.5 rounded bg-red-500/10 text-red-300 border border-red-500/30">
							{signError}
						</div>
					{/if}
					<div class="flex gap-2 pt-1 justify-end">
						{#if signFlow}
							<button
								class="py-1.5 px-3 rounded-lg text-[0.75rem] font-mono bg-transparent text-content-dim border border-border-card cursor-pointer hover:text-content transition-colors"
								onclick={startSignIn}
							>New code</button>
						{:else}
							<button
								class="py-1.5 px-3 rounded-lg text-[0.75rem] font-mono bg-surface-card-strong text-content border border-border-card cursor-pointer hover:bg-surface-card-strong transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
								disabled={signStarting || !formConfig.url}
								onclick={startSignIn}
							>{signStarting ? 'Getting a code…' : connected ? 'Sign in again' : integration.signIn.label}</button>
						{/if}
					</div>
				{:else}
					{#if testStatus}
						<div class="text-[0.7rem] font-mono px-2 py-1.5 rounded {testStatus.ok ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/10 text-red-300 border border-red-500/30'}">
							{testStatus.ok ? '✓' : '✗'} {testStatus.message}
						</div>
					{/if}
					{#if saveError}
						<div class="text-[0.7rem] font-mono px-2 py-1.5 rounded bg-red-500/10 text-red-300 border border-red-500/30">
							{saveError}
						</div>
					{/if}

					<div class="flex gap-2 pt-1 justify-end">
						<button
							class="py-1.5 px-3 rounded-lg text-[0.75rem] font-mono bg-transparent text-content-dim border border-border-card cursor-pointer hover:text-content transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
							disabled={testing}
							onclick={runTest}
						>{testing ? 'Testing…' : 'Test'}</button>
						<button
							class="py-1.5 px-3 rounded-lg text-[0.75rem] font-mono bg-surface-card-strong text-content border border-border-card cursor-pointer hover:bg-surface-card-strong transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
							disabled={saving || (!dirty && connected)}
							onclick={runSave}
						>{saving ? 'Saving…' : connected ? 'Save' : 'Connect'}</button>
					</div>
				{/if}
			</div>

			<!-- Surface toggles -->
			{#if connected}
				<div class="space-y-2 pt-2 border-t border-border-card">
					<div class="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-content-dim">Use for</div>
					{#if hasSearch}
						<button
							class="flex items-center justify-between w-full bg-transparent border-none cursor-pointer text-left py-1"
							onclick={() => toggleSurface('search')}
						>
							<span class="text-[0.75rem] text-content-muted">Search provider</span>
							<div class="w-9 h-5 rounded-full transition-colors duration-200 relative shrink-0 {formSurfaces.search ? 'bg-surface-toggle-on' : 'bg-surface-toggle-off'}">
								<div class="absolute top-0.5 w-4 h-4 rounded-full bg-surface-toggle-knob shadow transition-transform duration-200 {formSurfaces.search ? 'translate-x-4' : 'translate-x-0.5'}"></div>
							</div>
						</button>
					{/if}
					<div class="flex items-center justify-between py-1 opacity-50" title="Coming in a future release">
						<span class="text-[0.75rem] text-content-muted">Widgets <span class="text-[0.7rem] text-content-dim">(soon)</span></span>
						<div class="w-9 h-5 rounded-full bg-surface-toggle-off relative shrink-0">
							<div class="absolute top-0.5 w-4 h-4 rounded-full bg-surface-toggle-knob shadow translate-x-0.5"></div>
						</div>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.signin-digits {
		font-size: 1.75rem;
		font-weight: 600;
		letter-spacing: 0.3em;
		/* letter-spacing trails the last digit; pull it back so it centres */
		margin-right: -0.3em;
		user-select: all;
	}
	.signin-spinner {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		border: 1.5px solid currentColor;
		border-right-color: transparent;
		animation: signin-spin 0.8s linear infinite;
	}
	@keyframes signin-spin { to { transform: rotate(360deg); } }
	@media (prefers-reduced-motion: reduce) {
		.signin-spinner { animation: none; border-right-color: currentColor; opacity: 0.6; }
	}
	.field-help :global(ol),
	.field-help :global(ul) {
		margin: 0.25rem 0;
		padding-left: 0;
		list-style-position: inside;
	}
	.field-help :global(li) {
		margin: 0.1rem 0;
	}
	.field-help :global(p) {
		margin: 0.2rem 0;
	}
	.field-help :global(strong) {
		color: var(--content-muted, #aaa);
		font-weight: 600;
	}
	.field-help :global(code) {
		font-size: 0.65rem;
		background: var(--card-bg, rgba(255,255,255,0.05));
		padding: 0.1rem 0.25rem;
		border-radius: 3px;
	}
</style>
