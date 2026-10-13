// Whether a newer Holm is out: GitHub's latest release, asked from Holm's
// server at most every 6 hours and kept in memory, so visitors' IPs never reach
// GitHub. A page load never waits for it: it gets whatever the last check
// found, and a check that is due starts in the background. Any failure (404,
// rate limit, offline) means no notice, with one line in the log.

import { compareVersions } from '../changelog.js';

const LATEST_URL = 'https://api.github.com/repos/man15h/holm/releases/latest';
const INTERVAL = 6 * 60 * 60 * 1000;
const TIMEOUT = 5000;

let state = { at: -Infinity, latest: null, pending: null };

async function fetchLatest(fetch) {
	try {
		const res = await fetch(LATEST_URL, {
			headers: { accept: 'application/vnd.github+json', 'user-agent': 'Holm' },
			signal: AbortSignal.timeout(TIMEOUT)
		});
		if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
		const data = await res.json();
		const version = String(data?.tag_name || '').replace(/^v/, '');
		const url = String(data?.html_url || '');
		if (!/^\d+\.\d+\.\d+$/.test(version) || !url.startsWith('https://github.com/')) throw new Error('unexpected reply from GitHub');
		return { version, url };
	} catch (err) {
		console.warn(`[holm] update check: ${err.message}`);
		return null;
	}
}

/** The latest release `{ version, url }` as last checked, or null; starts a check when one is due. */
export function latestRelease({ fetch = globalThis.fetch, now = Date.now() } = {}) {
	if (now - state.at >= INTERVAL && !state.pending) {
		state.pending = fetchLatest(fetch).then((latest) => {
			state = { at: now, latest, pending: null };
		});
	}
	return state.latest;
}

/** Resolves once a check in progress has finished. */
export function checkSettled() {
	return state.pending || Promise.resolve();
}

/** `{ latest, url }` when `latest` is newer than the running version, else null. */
export function updateFor(running, latest) {
	if (!latest || compareVersions(latest.version, running) <= 0) return null;
	return { latest: latest.version, url: latest.url };
}

/** For tests: forget the last check. */
export function resetUpdateCheck() {
	state = { at: -Infinity, latest: null, pending: null };
}
