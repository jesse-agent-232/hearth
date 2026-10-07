import { loadEnabledAdapters } from '$lib/server/integrations/index.js';

// Integration adapters load on demand (see integrations/index.js). Making
// sure the enabled ones are in before each request keeps every caller of
// getRegistry()/getAdapter() synchronous, and catches config reloads.
export async function handle({ event, resolve }) {
	await loadEnabledAdapters();
	return resolve(event);
}
