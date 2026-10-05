// Fuzzy scoring for the launcher. Higher is better, 0 means no match.
// Order of preference, like Raycast: whole-name prefix, word prefix,
// initials ("pt" → PDF Tools), substring, then letters in order.
export function matchScore(query, text) {
	const q = query.trim().toLowerCase();
	const t = (text || '').toLowerCase();
	if (!q || !t) return 0;
	if (t === q) return 100;
	if (t.startsWith(q)) return 90 - Math.min(t.length - q.length, 20) / 4;
	const words = t.split(/[\s\-_./·]+/).filter(Boolean);
	if (words.some((w) => w.startsWith(q))) return 70;
	if (words.length > 1 && words.map((w) => w[0]).join('').startsWith(q)) return 65;
	const at = t.indexOf(q);
	if (at >= 0) return 50 - Math.min(at, 20) / 2;
	let i = 0;
	for (const ch of t) if (ch === q[i]) i++;
	return i === q.length && q.length >= 2 ? 20 : 0;
}

// Best score across a primary label and secondary keywords; keywords
// count for a little less so a name match always wins.
export function bestScore(query, title, keywords = []) {
	let best = matchScore(query, title);
	for (const k of keywords) best = Math.max(best, matchScore(query, k) * 0.8);
	return best;
}
