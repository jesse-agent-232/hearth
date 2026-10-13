<script>
	import { integrations as integrationsStore } from '$lib/stores/integrations.js';

	// The other accounts of an integration that holds several (the Calendar):
	// listed under the first one's form, each added or edited with the same
	// fields, tested before it's saved, and removed with a second click.
	let { integration } = $props();

	const MAX = 5;
	const fields = $derived(integration.configSchema.filter((f) => !f.hidden));
	const accounts = $derived(integration.userState?.config?.accounts || []);

	// The account being edited: its id, or 'new'. Null when none is.
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
		} catch (err) {
			error = err.message || 'Remove failed';
		} finally {
			removing = null;
		}
	}
</script>

<div class="space-y-2 pt-2 border-t border-border-card">
	<div class="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-content-dim">Other accounts</div>
	{#each accounts as account (account.id)}
		{#if editing === account.id}
			{@render editor('Save account')}
		{:else}
			<div class="flex items-center justify-between gap-2 py-1">
				<span class="min-w-0">
					<span class="block truncate text-[0.75rem] text-content-muted">{account.username}</span>
					<span class="block truncate text-[0.7rem] text-content-dim font-mono">{hostOf(account.url)}</span>
				</span>
				<span class="flex gap-1.5 shrink-0">
					<button class="account-btn" onclick={() => open(account)} disabled={editing !== null}>Edit</button>
					<button class="account-btn {removing === account.id ? 'is-danger' : ''}" onclick={() => remove(account)} onblur={() => (removing = null)} disabled={editing !== null}>{removing === account.id ? 'Remove?' : 'Remove'}</button>
				</span>
			</div>
		{/if}
	{/each}
	{#if editing === 'new'}
		{@render editor('Add account')}
	{:else if editing === null && accounts.length < MAX}
		<button class="account-btn" onclick={() => open(null)}>+ Add account</button>
	{/if}
	{#if error && editing === null}
		<div class="text-[0.7rem] font-mono px-2 py-1.5 rounded bg-red-500/10 text-red-300 border border-red-500/30">{error}</div>
	{/if}
</div>

{#snippet editor(saveLabel)}
	<div class="space-y-2 rounded-lg border border-border-card p-2.5" data-form-type="other">
		{#each fields as field}
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
			</label>
		{/each}
		{#if testStatus}
			<div class="text-[0.7rem] font-mono px-2 py-1.5 rounded {testStatus.ok ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/10 text-red-300 border border-red-500/30'}">
				{testStatus.ok ? '✓' : '✗'} {testStatus.message}
			</div>
		{/if}
		{#if error}
			<div class="text-[0.7rem] font-mono px-2 py-1.5 rounded bg-red-500/10 text-red-300 border border-red-500/30">{error}</div>
		{/if}
		<div class="flex gap-2 pt-1 justify-end">
			<button class="account-btn" onclick={close}>Cancel</button>
			<button class="account-btn" disabled={testing} onclick={test}>{testing ? 'Testing…' : 'Test'}</button>
			<button class="account-btn is-primary" disabled={saving} onclick={save}>{saving ? 'Saving…' : saveLabel}</button>
		</div>
	</div>
{/snippet}

<style>
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
