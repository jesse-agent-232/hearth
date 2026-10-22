// Claude integration adapter: AI answers in search, with the user's own
// Anthropic API key. The call is made by Holm's server, so the key never
// reaches the browser.
//
// Surfaces:
//   - answers — a streamed answer to a search, and a conversation from it

import { apiError, sseEvents, MAX_OUTPUT_TOKENS, CUT_OFF } from './ai.js';

const API = 'https://api.anthropic.com/v1';
const VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-haiku-4-5';

/** @type {import('./_types.js').IntegrationAdapter} */
const adapter = {
	id: 'claude',
	name: 'Claude',
	icon: 'di:claude-ai',
	description: 'AI answers in search, with your own Anthropic API key',

	configSchema: [
		{
			key: 'key',
			type: 'secret',
			label: 'API key',
			required: true,
			placeholder: 'sk-ant-…',
			help: '1. Open **API Keys** in the Claude Console\n2. Click **Create Key** and copy it\n\nAn API key is billed per use by Anthropic; a Claude Pro or Max subscription doesn’t cover it.',
			helpUrl: { url: 'https://console.anthropic.com/settings/keys', label: 'Open the Claude Console' }
		},
		{
			key: 'model',
			type: 'text',
			label: 'Model',
			default: DEFAULT_MODEL,
			advanced: true,
			help: 'Haiku is the fastest. Any model id from Anthropic’s models list works.'
		}
	],

	async test({ config, fetch }) {
		if (!config?.key) return { ok: false, message: 'An API key is required' };
		const model = modelOf(config);
		try {
			const res = await fetch(`${API}/models/${encodeURIComponent(model)}`, { headers: headers(config) });
			if (res.status === 404) return { ok: false, message: `The key works, but there is no model “${model}”` };
			if (!res.ok) return { ok: false, message: await apiError(res, 'Anthropic') };
			const data = await res.json();
			return { ok: true, message: `Connected — answers come from ${data?.display_name || model}` };
		} catch (err) {
			return { ok: false, message: `Connection failed: ${err.message}` };
		}
	},

	answers: {
		async *stream({ config, system, messages, fetch }) {
			const res = await fetch(`${API}/messages`, {
				method: 'POST',
				headers: { ...headers(config), 'content-type': 'application/json', accept: 'text/event-stream' },
				body: JSON.stringify({ model: modelOf(config), max_tokens: MAX_OUTPUT_TOKENS, system, messages, stream: true })
			});
			if (!res.ok) throw new Error(await apiError(res, 'Anthropic'));
			for await (const { event, data } of sseEvents(res)) {
				if (event === 'message_stop') return;
				let body;
				try {
					body = JSON.parse(data);
				} catch {
					continue;
				}
				if (event === 'error' || body?.type === 'error') {
					throw new Error(`Anthropic: ${body?.error?.message || 'the answer stopped'}`);
				}
				if (body?.type === 'content_block_delta' && body.delta?.type === 'text_delta' && body.delta.text) {
					yield body.delta.text;
				}
				if (body?.type === 'message_delta' && body.delta?.stop_reason === 'max_tokens') yield CUT_OFF;
			}
		}
	}
};

function modelOf(config) {
	return String(config?.model || '').trim() || DEFAULT_MODEL;
}

function headers(config) {
	return { 'x-api-key': config.key, 'anthropic-version': VERSION, accept: 'application/json' };
}

export default adapter;
