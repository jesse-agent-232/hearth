// How the search bar looks, chosen under Configure → Widgets → Search with
// config.yml's search.transparency and search.tips as the defaults.
//
// Transparency: 'theme' follows the page's Glass (Configure → Appearance) on
// every theme; 'solid' keeps the bar and its results solid, whatever Glass
// says.
// Hints (search.tips): 'on' types out rotating hints in the empty bar; 'off' keeps one
// still placeholder.

// Each icon is the bar: see-through with a glint, or filled in.
const PILL = 'M4.5 5.5h7a2.5 2.5 0 0 1 0 5h-7a2.5 2.5 0 0 1 0-5z';
export const SEARCH_TRANSPARENCY = [
	{ id: 'theme', label: 'Match theme', icon: `${PILL}M6 9.5l2-3M8.5 9.5l2-3` },
	{ id: 'solid', label: 'Solid', icon: PILL, fill: true }
];
export const DEFAULT_SEARCH_TRANSPARENCY = 'theme';

export const SEARCH_TIPS = [
	{ id: 'on', label: 'Rotating' },
	{ id: 'off', label: 'Still' }
];
export const DEFAULT_SEARCH_TIPS = 'on';

const validTransparency = (v) => SEARCH_TRANSPARENCY.some((o) => o.id === v);

// The person's pick, else the configured default, else 'theme'.
export function searchTransparency(pref, configured) {
	if (validTransparency(pref)) return pref;
	return validTransparency(configured) ? configured : DEFAULT_SEARCH_TRANSPARENCY;
}

// The glass level the bar uses: solid, or the page's under Theme.
export function searchGlassLevel(transparency, pageGlass) {
	return transparency === 'solid' ? 'solid' : pageGlass || 'frosted';
}

// The person's pick, else the configured default (true / false in
// config.yml), else on.
export function searchTips(pref, configured) {
	if (pref === 'on' || pref === 'off') return pref;
	if (typeof configured === 'boolean') return configured ? 'on' : 'off';
	return DEFAULT_SEARCH_TIPS;
}

// Why a config's search.transparency or search.tips can't be used, or null
// when both can.
export function searchLookError(search) {
	const t = search?.transparency;
	if (t !== undefined && !validTransparency(t)) {
		return `search.transparency must be theme or solid, not ${JSON.stringify(t)}`;
	}
	const tips = search?.tips;
	if (tips !== undefined && typeof tips !== 'boolean') {
		return `search.tips must be true or false, not ${JSON.stringify(tips)}`;
	}
	return null;
}
