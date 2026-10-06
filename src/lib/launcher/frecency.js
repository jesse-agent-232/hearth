// Frecency for launcher items: how often and how recently something was
// opened from Holm. Kept in this browser only — it's a ranking hint, not
// a preference worth syncing.
const KEY = 'launcher_frecency';
const HALF_LIFE_DAYS = 14;
const MAX_ENTRIES = 200;

function load() {
	try {
		return JSON.parse(localStorage.getItem(KEY) || '{}');
	} catch {
		return {};
	}
}

export function recordOpen(id) {
	if (typeof localStorage === 'undefined' || !id) return;
	const all = load();
	const e = all[id] || { count: 0, last: 0 };
	all[id] = { count: e.count + 1, last: Date.now() };
	const ids = Object.keys(all);
	if (ids.length > MAX_ENTRIES) {
		ids.sort((a, b) => all[a].last - all[b].last);
		for (const old of ids.slice(0, ids.length - MAX_ENTRIES)) delete all[old];
	}
	localStorage.setItem(KEY, JSON.stringify(all));
}

// Opens decay by half every HALF_LIFE_DAYS.
export function frecencyScores() {
	if (typeof localStorage === 'undefined') return {};
	const now = Date.now();
	const out = {};
	for (const [id, e] of Object.entries(load())) {
		const days = (now - e.last) / 86400000;
		out[id] = e.count * Math.pow(0.5, days / HALF_LIFE_DAYS);
	}
	return out;
}

export function clearFrecency() {
	if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY);
}
