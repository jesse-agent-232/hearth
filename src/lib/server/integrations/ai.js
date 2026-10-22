// The server's side of the AI integrations: a per-user rate limit, and the
// shared calls (src/lib/aiProviders.js) for the adapters and POST /api/ai.

export * from '../../aiProviders.js';

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
