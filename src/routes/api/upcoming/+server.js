import { widgetFeed } from '$lib/server/integrations/feed.js';

// GET /api/upcoming?tz=<IANA zone>
//
// The next few events from every connected integration that has an
// `upcoming` function and its widgets switched on (the Calendar), for the
// glance next to the clock.

export function GET(event) {
	return widgetFeed('upcoming', event, 'start');
}
