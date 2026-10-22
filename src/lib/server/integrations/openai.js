// OpenAI integration adapter: AI answers in search, with the user's own
// OpenAI API key. The call is made by Holm's server, so the key never
// reaches the browser.
//
// Surfaces:
//   - answers — a streamed answer to a search, and a conversation from it

import { listOpenAiModels, streamOpenAiChat, MAX_OUTPUT_TOKENS } from './ai.js';

const API = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4.1-mini';

/** @type {import('./_types.js').IntegrationAdapter} */
const adapter = {
	id: 'openai',
	name: 'OpenAI',
	icon: 'di:openai',
	description: 'AI answers in search, with your own OpenAI API key',

	configSchema: [
		{
			key: 'key',
			type: 'secret',
			label: 'API key',
			required: true,
			placeholder: 'sk-…',
			help: '1. Open **API keys** in the OpenAI platform\n2. Click **Create new secret key** and copy it\n\nAn API key is billed per use by OpenAI; a ChatGPT Plus or Pro subscription doesn’t cover it.',
			helpUrl: { url: 'https://platform.openai.com/api-keys', label: 'Open the OpenAI platform' }
		},
		{
			key: 'model',
			type: 'text',
			label: 'Model',
			default: DEFAULT_MODEL,
			advanced: true,
			help: 'A fast chat model answers best in search. Any model id your key can use works.'
		}
	],

	async test({ config, fetch }) {
		if (!config?.key) return { ok: false, message: 'An API key is required' };
		const model = modelOf(config);
		try {
			const models = await listOpenAiModels({ base: API, key: config.key, fetch, name: 'OpenAI' });
			if (!models.includes(model)) return { ok: false, message: `The key works, but it can’t use the model “${model}”` };
			return { ok: true, message: `Connected — answers come from ${model}` };
		} catch (err) {
			return { ok: false, message: `Connection failed: ${err.message}` };
		}
	},

	answers: {
		stream({ config, system, messages, fetch }) {
			return streamOpenAiChat({
				base: API,
				key: config.key,
				model: modelOf(config),
				system,
				messages,
				fetch,
				name: 'OpenAI',
				extra: { max_completion_tokens: MAX_OUTPUT_TOKENS }
			});
		}
	}
};

function modelOf(config) {
	return String(config?.model || '').trim() || DEFAULT_MODEL;
}

export default adapter;
