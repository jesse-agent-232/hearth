// "What's new": the releases in CHANGELOG.md, and which of them a user should
// see. Pure, so the server route and the tests share it.

const HEADING = /^## v?(\d+\.\d+\.\d+)(?:\s*[—–-]\s*(.+?))?\s*$/;

/** The changelog's releases, newest first: { version, date, notes } with notes as markdown. */
export function parseChangelog(md) {
	const releases = [];
	let current = null;
	for (const line of String(md || '').split(/\r?\n/)) {
		const m = HEADING.exec(line);
		if (m) {
			current = { version: m[1], date: m[2] || '', notes: '' };
			releases.push(current);
		} else if (/^## /.test(line)) {
			current = null;
		} else if (current) {
			current.notes += line + '\n';
		}
	}
	for (const r of releases) r.notes = r.notes.trim();
	return releases;
}

/** -1, 0 or 1, comparing x.y.z versions; anything unreadable sorts first. */
export function compareVersions(a, b) {
	const pa = String(a || '').split('.').map(Number);
	const pb = String(b || '').split('.').map(Number);
	for (let i = 0; i < 3; i++) {
		const x = Number.isFinite(pa[i]) ? pa[i] : -1;
		const y = Number.isFinite(pb[i]) ? pb[i] : -1;
		if (x !== y) return x < y ? -1 : 1;
	}
	return 0;
}

/**
 * Whether to show the dialog, and which releases it lists.
 * - `seen`: the last version this user closed the dialog on, or null.
 * - `known`: whether the user was here before (has saved anything). A new
 *   user sees nothing and has the current version recorded; someone who was
 *   here before this dialog existed sees the current release only.
 * Returns { show, releases, record }: `record` says the current version should
 * be stored now without showing anything.
 */
export function whatsNewFor({ version, seen, known, enabled, releases }) {
	if (!seen && !known) return { show: false, releases: [], record: true };
	if (seen && compareVersions(seen, version) >= 0) return { show: false, releases: [], record: false };
	const since = (releases || []).filter(
		(r) => compareVersions(r.version, version) <= 0 && (seen ? compareVersions(r.version, seen) > 0 : r.version === version)
	);
	if (!enabled) return { show: false, releases: [], record: false };
	// A version with no notes has nothing to show: count it as seen.
	if (!since.length) return { show: false, releases: [], record: true };
	return { show: true, releases: since, record: false };
}
