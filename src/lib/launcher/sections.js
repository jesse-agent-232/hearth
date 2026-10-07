// Orders the search bar's per-provider sections and folds video results
// into one shelf. Sections come from SearchBar: { id, label, layout, kind,
// shelf, loading, skeleton, error, items }.

const PROVIDER_KIND_ORDER = { media: 0, document: 1, file: 2, card: 3, bookmark: 4, photo: 5 };

export function arrangeProviderSections(sections) {
	const provSections = [...sections];
	// Providers with shelf: 'video' (Jellyfin, Plex, Seerr) share one
	// "Movies & TV" shelf: what you can play, then what you can request,
	// then what's already requested. Only movies and shows move (they're
	// the ones with a detail view); albums and artists stay in their
	// provider's row.
	const mediaSections = provSections.filter((s) => s.shelf === 'video');
	if (mediaSections.length > 1) {
		const isTitle = (it) => !it.more && it.showDetail;
		const seen = new Set();
		const titles = [
			...mediaSections.flatMap((s) => s.items.filter((it) => isTitle(it) && it.play)),
			...mediaSections.flatMap((s) => s.items.filter((it) => isTitle(it) && !it.play && !it.request?.done)),
			...mediaSections.flatMap((s) => s.items.filter((it) => isTitle(it) && !it.play && it.request?.done))
		].filter((it) => {
			// Seerr already folds its own duplicates; this catches the same
			// film on both Jellyfin and Plex. The playable copy comes first.
			if (!it.tmdb) return true;
			if (seen.has(it.tmdb)) return false;
			seen.add(it.tmdb);
			return true;
		});
		const shelf = {
			id: 'p-media',
			label: 'Movies & TV',
			layout: 'poster',
			kind: 'media',
			loading: mediaSections.some((s) => s.loading),
			skeleton: titles.length ? 0 : Math.max(...mediaSections.map((s) => s.skeleton)),
			error: mediaSections.filter((s) => s.error).map((s) => `${s.label}: ${s.error}`).join(' · '),
			items: [...titles, ...mediaSections.flatMap((s) => s.items.filter((it) => it.more))]
		};
		provSections.splice(provSections.indexOf(mediaSections[0]), 0, shelf);
		for (const s of mediaSections) {
			const rest = s.items.filter((it) => !it.more && !it.showDetail);
			// What's left is music (albums, artists, songs): same cards as Navidrome.
			if (rest.length) Object.assign(s, { layout: 'tracks', items: rest.slice(0, 6), loading: false, skeleton: 0, error: '' });
			else provSections.splice(provSections.indexOf(s), 1);
		}
	}
	provSections.sort((a, b) => (PROVIDER_KIND_ORDER[a.kind] ?? 99) - (PROVIDER_KIND_ORDER[b.kind] ?? 99));
	return provSections;
}
