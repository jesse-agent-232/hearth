// Where the search bar goes when it opens on desktop. 'top' slides it up
// toward the top of the window, so short screens give the results most of
// the height; 'in_place' leaves it where it rests. config.yml's
// search.on_focus sets the default and each person can override it under
// Configure → Widgets → Search. Phones always pin it above the keyboard.

// Each icon is a screen with the bar where that option puts it.
const SCREEN = 'M3.5 2.5h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z';
export const SEARCH_ON_FOCUS = [
	{ id: 'top', label: 'At top', icon: `${SCREEN}M5 4.5h6v2H5z` },
	{ id: 'in_place', label: 'In place', icon: `${SCREEN}M5 7h6v2H5z` }
];
export const DEFAULT_SEARCH_ON_FOCUS = 'top';

const valid = (v) => SEARCH_ON_FOCUS.some((o) => o.id === v);

// The person's pick, else the configured default, else 'top'.
export function searchOnFocus(pref, configured) {
	if (valid(pref)) return pref;
	return valid(configured) ? configured : DEFAULT_SEARCH_ON_FOCUS;
}

// Why a config's search.on_focus can't be used, or null when it can.
export function searchOnFocusError(search) {
	const v = search?.on_focus;
	if (v === undefined || valid(v)) return null;
	return `search.on_focus must be ${SEARCH_ON_FOCUS.map((o) => o.id).join(' or ')}, not ${JSON.stringify(v)}`;
}
