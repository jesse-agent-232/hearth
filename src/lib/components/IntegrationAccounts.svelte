<script>
	import { marked } from 'marked';
	import { integrations as integrationsStore } from '$lib/stores/integrations.js';

	// The accounts of an integration that holds several (the Calendar), as a
	// list: a row opens its form, the first account's being the card's own
	// (`main`). The others are added and edited with the same fields, tested
	// before they're saved, and removed with a second click.
	let { integration, main } = $props();

	const MAX = 5;
	const fields = $derived(integration.configSchema.filter((f) => !f.hidden));
	// Advanced starts open when one of its fields already has a value, and
	// isn't closed again while it's being edited.
	const openIf = (node, open) => { node.open = !!open; };
	const accounts = $derived(integration.userState?.config?.accounts || []);
	const first = $derived(integration.userState?.config || {});

	// The open account: 'main', another's id, or 'new'. Null when none is.
	let editing = $state(null);
	let form = $state({});
	let testStatus = $state(null);
	let testing = $state(false);
	let saving = $state(false);
	let error = $state('');
	let removing = $state(null);

	function hostOf(value) {
		try {
			return new URL(value).host;
		} catch {
			return value || '';
		}
	}

	function toggle(id, account) {
		if (editing === id) return close();
		if (id === 'main') {
			close();
			editing = 'main';
			return;
		}
		open(account);
	}

	function open(account) {
		editing = account ? account.id : 'new';
		form = Object.fromEntries(fields.map((f) => [f.key, account?.[f.key] ?? integration.operatorDefaults?.[f.key] ?? '']));
		testStatus = null;
		error = '';
		removing = null;
	}

	function close() {
		editing = null;
		testStatus = null;
		error = '';
	}

	function edited() {
		testStatus = null;
		error = '';
	}

	async function test() {
		testing = true;
		testStatus = null;
		try {
			testStatus = await integrationsStore.test(integration.id, form, editing);
		} catch (err) {
			testStatus = { ok: false, message: err.message || 'Test failed' };
		} finally {
			testing = false;
		}
	}

	// The whole list goes back each time: unchanged accounts keep their
	// stored passwords (they come back redacted), and one left out is removed.
	async function store(list) {
		await integrationsStore.save(integration.id, {
			config: { accounts: list },
			surfaces: integration.userState?.surfaces || {}
		});
	}

	async function save() {
		saving = true;
		error = '';
		try {
			if (!testStatus?.ok) {
				testStatus = await integrationsStore.test(integration.id, form, editing);
				if (!testStatus.ok) return;
			}
			const entry = editing === 'new' ? { ...form } : { ...form, id: editing };
			const list = editing === 'new' ? [...accounts, entry] : accounts.map((a) => (a.id === editing ? entry : a));
			await store(list);
			close();
		} catch (err) {
			error = err.message || 'Save failed';
		} finally {
			saving = false;
		}
	}

	async function remove(account) {
		if (removing !== account.id) {
			removing = account.id;
			return;
		}
		error = '';
		try {
			await store(accounts.filter((a) => a.id !== account.id));
			close();
		} catch (err) {
			error = err.message || 'Remove failed';
		} finally {
			removing = null;
		}
	}
</script>

<div class="space-y-1.5">
	<div class="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-content-dim">Accounts</div>
	{@render row('main', first)}
	{#if editing === 'main'}
		<div class="pb-2">{@render main()}</div>
	{/if}
	{#each accounts as account (account.id)}
		{@render row(account.id, account)}
		{#if editing === account.id}
			{@render editor('Save account', account)}
		{/if}
	{/each}
	{#if editing === 'new'}
		{@render editor('Add account', null)}
	{:else if accounts.length < MAX}
		<button class="account-btn" onclick={() => open(null)}>+ Add account</button>
	{/if}
	{#if error && editing === null}
		<div class="text-[0.7rem] font-mono px-2 py-1.5 rounded bg-red-500/10 text-red-300 border border-red-500/30">{error}</div>
	{/if}
</div>

{#snippet row(id, account)}
	<button
		class="account-row {editing === id ? 'is-open' : ''}"
		aria-expanded={editing === id}
		onclick={() => toggle(id, account)}
	>
		<span class="min-w-0 text-left">
			<span class="block truncate text-[0.75rem] text-content-muted">{account.username || 'Account'}</span>
			<span class="block truncate text-[0.7rem] text-content-dim font-mono">{hostOf(account.url)}</span>
		</span>
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="chevron" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
	</button>
{/snippet}

{#snippet editor(saveLabel, account)}
	<div class="space-y-2 rounded-lg border border-border-card p-2.5" data-form-type="other">
		{#snippet fieldRow(field)}
			{@const locked = field.fromOperatorDefault && integration.operatorDefaults?.[field.key]}
			<label class="block">
				<span class="block text-[0.7rem] text-content-dim mb-1">{field.label}{#if field.required}<span class="text-[var(--accent,#f5b942)]" aria-hidden="true"> *</span>{/if}</span>
				<input
					type={field.type === 'secret' ? 'password' : field.type === 'url' ? 'url' : 'text'}
					bind:value={form[field.key]}
					placeholder={field.placeholder}
					oninput={edited}
					readonly={!!locked}
					class="w-full bg-surface-input border border-border-input rounded-lg px-3 py-2 text-[0.8rem] text-content font-mono placeholder:text-content-dim outline-none focus:border-border-pill {locked ? 'opacity-60 cursor-not-allowed' : ''}"
					autocomplete={field.type === 'secret' ? 'new-password' : 'off'}
					spellcheck="false"
					data-1p-ignore="true"
					data-lpignore="true"
					data-bwignore="true"
				/>
				{#if locked}
					<span class="block text-[0.7rem] text-content-dim mt-1">Set by your administrator</span>
				{:else}
					{#if field.help}
						<div class="field-help text-[0.7rem] text-content-dim mt-1.5 leading-relaxed">{@html marked.parse(field.help)}</div>
					{/if}
					{#if field.helpUrl && form[field.helpUrl.baseKey]}
						<a href="{form[field.helpUrl.baseKey]}{field.helpUrl.path}" target="_blank" rel="noopener noreferrer" class="inline-block text-[0.7rem] text-blue-400 hover:text-blue-300 mt-1 no-underline hover:underline">{field.helpUrl.label} ↗</a>
					{/if}
				{/if}
			</label>
		{/snippet}
		{#each fields.filter((f) => !f.advanced) as field}{@render fieldRow(field)}{/each}
		{#if fields.some((f) => f.advanced)}
			<details class="advanced" use:openIf={fields.some((f) => f.advanced && form[f.key])}>
				<summary class="text-[0.7rem] text-content-dim">Advanced</summary>
				<div class="space-y-2 pt-2">
					{#each fields.filter((f) => f.advanced) as field}{@render fieldRow(field)}{/each}
				</div>
			</details>
		{/if}
		{#if testStatus}
			<div class="text-[0.7rem] font-mono px-2 py-1.5 rounded {testStatus.ok ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/10 text-red-300 border border-red-500/30'}">
				{testStatus.ok ? '✓' : '✗'} {testStatus.message}
			</div>
		{/if}
		{#if error}
			<div class="text-[0.7rem] font-mono px-2 py-1.5 rounded bg-red-500/10 text-red-300 border border-red-500/30">{error}</div>
		{/if}
		<div class="flex gap-2 pt-1 justify-end">
			{#if account}
				<button class="account-btn mr-auto {removing === account.id ? 'is-danger' : ''}" onclick={() => remove(account)} onblur={() => (removing = null)}>{removing === account.id ? 'Remove?' : 'Remove'}</button>
			{/if}
			<button class="account-btn" onclick={close}>Cancel</button>
			<button class="account-btn" disabled={testing} onclick={test}>{testing ? 'Testing…' : 'Test'}</button>
			<button class="account-btn is-primary" disabled={saving} onclick={save}>{saving ? 'Saving…' : saveLabel}</button>
		</div>
	</div>
{/snippet}

<style>
	/* As on the first account's form (IntegrationCard). */
	.advanced > summary { cursor: pointer; width: fit-content; transition: color 0.15s ease; }
	.advanced > summary:hover { color: var(--color-content); }
	.field-help :global(ol),
	.field-help :global(ul) { margin: 0.25rem 0; padding-left: 0; list-style-position: inside; }
	.field-help :global(li) { margin: 0.1rem 0; }
	.field-help :global(p) { margin: 0.2rem 0; }
	.field-help :global(strong) { color: var(--content-muted, #aaa); font-weight: 600; }
	.field-help :global(a) { color: var(--color-content); font-weight: 700; }
	.account-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		width: 100%;
		padding: 0.4rem 0.5rem;
		border-radius: 0.5rem;
		background: transparent;
		border: 1px solid transparent;
		cursor: pointer;
		transition: background 0.15s ease;
	}
	.account-row:hover { background: var(--color-surface-card-hover); }
	.account-row:focus-visible { outline: 2px solid var(--color-content-muted); outline-offset: 1px; }
	.account-row.is-open { border-color: var(--color-border-card); }
	.chevron { width: 0.85rem; height: 0.85rem; flex-shrink: 0; color: var(--color-content-dim); transition: transform 0.15s ease; }
	.account-row.is-open .chevron { transform: rotate(180deg); }
	.account-btn {
		padding: 0.3rem 0.65rem;
		border-radius: 0.5rem;
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.72rem;
		background: transparent;
		color: var(--color-content-dim);
		border: 1px solid var(--color-border-card);
		cursor: pointer;
		transition: color 0.15s ease;
	}
	.account-btn:hover:not(:disabled) { color: var(--color-content); }
	.account-btn:disabled { opacity: 0.3; cursor: not-allowed; }
	.account-btn:focus-visible { outline: 2px solid var(--color-content-muted); outline-offset: 1px; }
	.account-btn.is-primary { background: var(--color-surface-card-strong); color: var(--color-content); }
	.account-btn.is-danger { color: rgb(252 165 165); border-color: rgb(239 68 68 / 0.4); }
</style>
