// Shared pieces of the AI integrations (Claude, OpenAI, OpenAI-compatible):
// the system prompt, checks on the conversation the browser sends, a
// per-user rate limit, and the streaming readers both APIs need.
//
// Answers are answer-only by design: the model gets the conversation and
// nothing else. No tools, no apps, no Holm data, and nothing is stored.

export const SYSTEM_PROMPT =
	'You answer questions typed into the search bar of Holm, a personal dashboard. ' +
	'Lead with the answer in a sentence or two, then add only the detail that helps. ' +
	'Use short Markdown (lists, bold, code) where it makes the answer easier to scan; no headings for short answers. ' +
	'You cannot browse the web or see anything of the user\'s, so say so when a question needs that, and be clear when you are unsure.';

export const MAX_OUTPUT_TOKENS = 1024;
export const MAX_MESSAGES = 20;
export const MAX_MESSAGE_CHARS = 4000;
// Earlier answers come back with each follow-up and may run past
// MAX_MESSAGE_CHARS, so only the total bounds them.
const MAX_TOTAL_CHARS = 40000;

/**
 * The conversation from the browser, checked: 1 to MAX_MESSAGES turns that
 * alternate user and assistant, starting and ending with the user, each
 * question up to MAX_MESSAGE_CHARS.
 * Returns { ok: true, messages } or { ok: false, message }.
 */
export function checkMessages(input) {
	if (!Array.isArray(input) || input.length === 0) return { ok: false, message: 'messages must be a non-empty list' };
	if (input.length > MAX_MESSAGES) return { ok: false, message: `A conversation holds up to ${MAX_MESSAGES} messages` };
	const messages = [];
	let total = 0;
	for (let i = 0; i < input.length; i++) {
		const m = input[i];
		const role = i % 2 === 0 ? 'user' : 'assistant';
		if (m?.role !== role) return { ok: false, message: 'Messages must alternate, starting with the user' };
		const content = typeof m.content === 'string' ? m.content.trim() : '';
		if (!content) return { ok: false, message: 'A message is empty' };
		if (role === 'user' && content.length > MAX_MESSAGE_CHARS) return { ok: false, message: `A message is longer than ${MAX_MESSAGE_CHARS} characters` };
		total += content.length;
		messages.push({ role, content });
	}
	if (messages[messages.length - 1].role !== 'user') return { ok: false, message: 'The last message must be the user\'s' };
	if (total > MAX_TOTAL_CHARS) return { ok: false, message: 'This conversation is too long; start a new one' };
	return { ok: true, messages };
}

// A sliding window per user. In memory: a restart forgets it, which is fine
// for a guard against runaway loops on the user's own key.
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;
const recent = new Map(); // username → timestamps (ms) of asks inside the window

/** Records an ask; false when the user already made RATE_LIMIT in the last minute. */
export function takeRateSlot(username, now = Date.now()) {
	const kept = (recent.get(username) || []).filter((t) => now - t < RATE_WINDOW_MS);
	if (kept.length >= RATE_LIMIT) {
		recent.set(username, kept);
		return false;
	}
	kept.push(now);
	recent.set(username, kept);
	return true;
}

export function resetRateLimits() {
	recent.clear();
}

/** Server-sent events from a fetch Response: yields { event, data } per event. */
export async function* sseEvents(res) {
	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	try {
		while (true) {
			const { done, value } = await reader.read();
			buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
			let cut;
			while ((cut = buffer.search(/\r?\n\r?\n/)) !== -1) {
				const block = buffer.slice(0, cut);
				buffer = buffer.slice(cut).replace(/^\r?\n\r?\n/, '');
				const ev = parseEvent(block);
				if (ev) yield ev;
			}
			if (done) break;
		}
		const ev = parseEvent(buffer);
		if (ev) yield ev;
	} finally {
		reader.releaseLock();
	}
}

function parseEvent(block) {
	let event = 'message';
	const data = [];
	for (const line of block.split(/\r?\n/)) {
		if (line.startsWith('event:')) event = line.slice(6).trim();
		else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
	}
	return data.length ? { event, data: data.join('\n') } : null;
}

/** The text of an error reply, as the API words it when it does. */
export async function apiError(res, name) {
	let detail = '';
	try {
		const body = await res.json();
		detail = body?.error?.message || body?.message || (typeof body?.error === 'string' ? body.error : '');
	} catch {}
	if (res.status === 401 || res.status === 403) return `${name} rejected the API key`;
	if (res.status === 429) return `${name} is rate limiting this key${detail ? `: ${detail}` : ''}`;
	return `${name} returned ${res.status}${detail ? `: ${detail}` : ''}`;
}

export function stripTrailingSlash(url) {
	return String(url || '').replace(/\/+$/, '');
}

// ── OpenAI chat completions, shared by OpenAI and OpenAI-compatible servers ──

export function openAiHeaders(key) {
	return {
		'content-type': 'application/json',
		accept: 'application/json',
		...(key ? { Authorization: `Bearer ${key}` } : {})
	};
}

/** The model ids at `<base>/models`, or throws with the API's error. */
export async function listOpenAiModels({ base, key, fetch, name }) {
	const res = await fetch(`${base}/models`, { headers: openAiHeaders(key) });
	if (!res.ok) throw new Error(await apiError(res, name));
	const data = await res.json();
	return (Array.isArray(data?.data) ? data.data : []).map((m) => String(m?.id || '')).filter(Boolean);
}

/** Streams a chat completion from `<base>/chat/completions`, yielding text. */
export async function* streamOpenAiChat({ base, key, model, system, messages, fetch, name, extra = {} }) {
	const res = await fetch(`${base}/chat/completions`, {
		method: 'POST',
		headers: { ...openAiHeaders(key), accept: 'text/event-stream' },
		body: JSON.stringify({
			model,
			stream: true,
			messages: [{ role: 'system', content: system }, ...messages],
			...extra
		})
	});
	if (!res.ok) throw new Error(await apiError(res, name));
	for await (const { data } of sseEvents(res)) {
		if (data === '[DONE]') return;
		let chunk;
		try {
			chunk = JSON.parse(data);
		} catch {
			continue;
		}
		if (chunk?.error) throw new Error(`${name}: ${chunk.error.message || 'the answer stopped'}`);
		const text = chunk?.choices?.[0]?.delta?.content;
		if (typeof text === 'string' && text) yield text;
	}
}
