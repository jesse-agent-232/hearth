import { randomUUID } from 'node:crypto';
import { checkUrls, urlOriginChanged, withoutSecrets } from './urlPolicy.js';
import { mergeConfig, validateConfig } from './configMerge.js';

// An integration that holds more than one account (`adapter.multiAccount`,
// the Calendar) keeps its first account as the config itself, like any
// other, and the rest under `config.accounts`: each a config of the same
// shape plus an `id`. Every one goes through the same rules as the first.

export const MAX_ACCOUNTS = 5;

/** The stored accounts after the first, or [] for an integration with one. */
export function otherAccounts(adapter, config) {
	if (!adapter?.multiAccount || !Array.isArray(config?.accounts)) return [];
	return config.accounts.filter((a) => a && typeof a === 'object' && typeof a.id === 'string');
}

/**
 * The accounts to store, from the stored ones and those submitted. Without a
 * submitted list the stored ones stay as they are; with one, it is the new
 * list: an id that matches a stored account updates it (a redacted secret
 * keeps the stored one), and anything else is a new account. Accounts left
 * out are removed. Returns { ok: true, accounts } or { ok: false, message }.
 */
export function mergeAccounts(adapter, operator, storedConfig, submitted) {
	const stored = otherAccounts(adapter, storedConfig);
	if (!adapter?.multiAccount || submitted == null) return { ok: true, accounts: stored };
	if (!Array.isArray(submitted)) return { ok: false, message: 'Accounts must be a list' };
	if (submitted.length > MAX_ACCOUNTS) return { ok: false, message: `At most ${MAX_ACCOUNTS} more accounts` };
	const out = [];
	for (const [i, sub] of submitted.entries()) {
		if (!sub || typeof sub !== 'object') return { ok: false, message: 'Accounts must be a list' };
		const before = stored.find((a) => a.id === sub.id);
		const label = `Account ${i + 2}`;
		let checked = checkUrls(adapter, operator, mergeConfig(adapter, before || {}, sub));
		// Moving an account to another server never takes its password along.
		if (checked.ok && before && urlOriginChanged(adapter, before, checked.config)) {
			checked = checkUrls(adapter, operator, mergeConfig(adapter, withoutSecrets(adapter, before), sub));
		}
		if (!checked.ok) return { ok: false, message: `${label}: ${checked.message}` };
		let { id: _id, accounts: _nested, ...config } = checked.config;
		if (adapter.prepareConfig) config = adapter.prepareConfig({ config });
		const validation = validateConfig(adapter, config);
		if (!validation.ok) return { ok: false, message: `${label}: ${validation.message}` };
		out.push({ ...config, id: before ? before.id : randomUUID() });
	}
	return { ok: true, accounts: out };
}
