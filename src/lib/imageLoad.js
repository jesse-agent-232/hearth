// Load and error for an <img> the server rendered. Svelte renders `onload=`
// (or `use:`) on such an image as an inline `onload="this.__e=event"` so an
// event before hydration isn't lost, and the CSP blocks inline handlers: an
// image already cached when the page loaded never reported in and stayed
// hidden. Use with `bind:this` in an $effect instead: this listens from then
// on, and reports an image that had already finished. Returns the cleanup.
export function watchImage(img, { onload, onerror } = {}) {
	const load = () => onload?.();
	const error = () => onerror?.();
	img.addEventListener('load', load);
	img.addEventListener('error', error);
	if (img.complete) (img.naturalWidth ? load : error)();
	return () => {
		img.removeEventListener('load', load);
		img.removeEventListener('error', error);
	};
}
