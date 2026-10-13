import { widgetFeed } from '$lib/server/integrations/feed.js';

// GET /api/reminders?tz=<IANA zone>
//
// Reminders due soon from every connected integration that has a
// `reminders` function and its widgets switched on (the Calendar). The page
// shows each one when it falls due.

export function GET(event) {
	return widgetFeed('reminders', event, 'at');
}
