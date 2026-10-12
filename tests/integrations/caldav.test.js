// Unit tests for the Calendar (CalDAV) integration: the iCalendar reader,
// the multistatus reader, where credentials may be sent, and the adapter
// end to end against a fake server.
// Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseEvents, parseTime, parseDuration } from '../../src/lib/server/integrations/ical.js';
import caldav, { parseMultistatus, allowedUrl, icsTime } from '../../src/lib/server/integrations/caldav.js';

const MIN = 60 * 1000;

const ICS = [
	'BEGIN:VCALENDAR',
	'BEGIN:VTIMEZONE',
	'TZID:Europe/Berlin',
	'BEGIN:STANDARD',
	'DTSTART:19701025T030000',
	'END:STANDARD',
	'END:VTIMEZONE',
	'BEGIN:VEVENT',
	'UID:standup-1',
	'SUMMARY:Team standup\\, daily',
	'LOCATION:Room 4',
	'DTSTART;TZID=Europe/Berlin:20261014T093000',
	'DTEND;TZID=Europe/Berlin:20261014T094500',
	'BEGIN:VALARM',
	'ACTION:DISPLAY',
	'TRIGGER:-PT15M',
	'END:VALARM',
	'BEGIN:VALARM',
	'ACTION:EMAIL',
	'TRIGGER:-PT1H',
	'END:VALARM',
	'BEGIN:VALARM',
	'ACTION:AUDIO',
	'TRIGGER;RELATED=END:PT0S',
	'END:VALARM',
	'END:VEVENT',
	'BEGIN:VEVENT',
	'UID:holiday',
	'SUMMARY:Public holiday',
	'DTSTART;VALUE=DATE:20261015',
	'DTEND;VALUE=DATE:20261016',
	'BEGIN:VALARM',
	'ACTION:DISPLAY',
	'TRIGGER;VALUE=DATE-TIME:20261014T180000Z',
	'END:VALARM',
	'END:VEVENT',
	'BEGIN:VEVENT',
	'UID:cancelled',
	'SUMMARY:Called off',
	'STATUS:CANCELLED',
	'DTSTART:20261014T120000Z',
	'END:VEVENT',
	'BEGIN:VEVENT',
	'UID:long-description',
	'SUMMARY:Lunch with a very long title that the server folded onto the next',
	'  line',
	'DTSTART:20261014T120000Z',
	'DURATION:PT1H30M',
	'END:VEVENT',
	'END:VCALENDAR'
].join('\r\n');

test('events: time zones, all-day dates, durations, folding, escapes', () => {
	const events = parseEvents(ICS, 'Asia/Kolkata');
	assert.deepEqual(events.map((e) => e.uid), ['standup-1', 'holiday', 'long-description']);

	const [standup, holiday, lunch] = events;
	assert.equal(standup.summary, 'Team standup, daily');
	assert.equal(standup.location, 'Room 4');
	assert.equal(standup.start, Date.UTC(2026, 9, 14, 7, 30)); // CEST is UTC+2
	assert.equal(standup.end, Date.UTC(2026, 9, 14, 7, 45));
	assert.equal(standup.allDay, false);

	// All-day dates are the viewer's midnight: Kolkata is UTC+5:30.
	assert.equal(holiday.allDay, true);
	assert.equal(holiday.start, Date.UTC(2026, 9, 14, 18, 30));
	assert.equal(holiday.end, Date.UTC(2026, 9, 15, 18, 30));

	assert.equal(lunch.summary, 'Lunch with a very long title that the server folded onto the next line');
	assert.equal(lunch.end - lunch.start, 90 * MIN);
});

test('alarms: before the start, after the end, at a fixed time; email left out', () => {
	const [standup, holiday] = parseEvents(ICS, 'UTC');
	assert.deepEqual(standup.alarms, [standup.start - 15 * MIN, standup.end]);
	assert.deepEqual(holiday.alarms, [Date.UTC(2026, 9, 14, 18)]);
});

test('times and durations', () => {
	assert.deepEqual(parseTime('20261014T093000Z'), { t: Date.UTC(2026, 9, 14, 9, 30), allDay: false });
	// Floating time: the viewer's zone. An unknown TZID falls back to it too.
	assert.equal(parseTime('20261014T093000', {}, 'America/New_York').t, Date.UTC(2026, 9, 14, 13, 30));
	assert.equal(parseTime('20261014T093000', { TZID: 'Not/AZone' }, 'UTC').t, Date.UTC(2026, 9, 14, 9, 30));
	assert.equal(parseTime('garbage'), null);

	assert.equal(parseDuration('-PT15M'), -15 * MIN);
	assert.equal(parseDuration('P1D'), 24 * 60 * MIN);
	assert.equal(parseDuration('P1W'), 7 * 24 * 60 * MIN);
	assert.equal(parseDuration('-P1DT2H30M'), -(26 * 60 + 30) * MIN);
	assert.equal(parseDuration('PT'), null);
	assert.equal(parseDuration('P'), null);
	assert.equal(parseDuration('15M'), null);

	assert.equal(icsTime(Date.UTC(2026, 9, 14, 9, 30, 5, 123)), '20261014T093005Z');
});

test('multistatus: any namespace prefix, relative hrefs, failed propstats skipped', () => {
	const xml = `<?xml version="1.0"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response>
    <D:href>/dav/calendars/alice/work/</D:href>
    <D:propstat><D:prop>
      <D:resourcetype><D:collection/><C:calendar/></D:resourcetype>
      <D:displayname>Work &amp; meetings</D:displayname>
      <C:supported-calendar-component-set><C:comp name="VEVENT"/></C:supported-calendar-component-set>
    </D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat>
    <D:propstat><D:prop><C:calendar-home-set/></D:prop><D:status>HTTP/1.1 404 Not Found</D:status></D:propstat>
  </D:response>
  <response xmlns="DAV:">
    <href>https://dav.example.com/dav/principals/alice/</href>
    <propstat><prop><current-user-principal><href>/dav/principals/alice/</href></current-user-principal>
      <calendar-data xmlns="urn:ietf:params:xml:ns:caldav"><![CDATA[BEGIN:VCALENDAR
END:VCALENDAR]]></calendar-data></prop>
    <status>HTTP/1.1 200 OK</status></propstat>
  </response>
</D:multistatus>`;
	const [cal, principal] = parseMultistatus(xml, 'https://dav.example.com/dav/');
	assert.equal(cal.href, 'https://dav.example.com/dav/calendars/alice/work/');
	assert.match(cal.props.resourcetype, /<calendar\/>/);
	assert.equal(cal.props.displayname, 'Work &amp; meetings');
	assert.equal(cal.props['calendar-home-set'], undefined);
	assert.equal(principal.props['current-user-principal'], 'https://dav.example.com/dav/principals/alice/');
	assert.equal(principal.props['calendar-data'], 'BEGIN:VCALENDAR\nEND:VCALENDAR');
});

test('multistatus: an out-of-range character reference does not throw', () => {
	const xml = '<multistatus><response><href>/c/</href><propstat><prop><calendar-data>SUMMARY:a&#x110000;b&#65;</calendar-data></prop><status>HTTP/1.1 200 OK</status></propstat></response></multistatus>';
	assert.equal(parseMultistatus(xml)[0].props['calendar-data'], 'SUMMARY:a\ufffdbA');
});

test('credentials only go to the configured origin, its https upgrade, or iCloud\'s account hosts', () => {
	assert.equal(allowedUrl('https://cloud.example.com/remote.php/dav/x', 'https://cloud.example.com/remote.php/dav'), true);
	assert.equal(allowedUrl('https://p42-caldav.icloud.com/123/', 'https://caldav.icloud.com'), true);
	assert.equal(allowedUrl('http://p42-caldav.icloud.com/123/', 'https://caldav.icloud.com'), false);
	assert.equal(allowedUrl('https://evil.example.org/', 'https://cloud.example.com'), false);
	// Shared parent domains: the host next door is someone else's.
	assert.equal(allowedUrl('https://evil.duckdns.org/', 'https://me.duckdns.org/'), false);
	assert.equal(allowedUrl('https://attacker.ngrok.io/', 'https://me.ngrok.io/'), false);
	assert.equal(allowedUrl('https://other.example.com/', 'https://cloud.example.com/'), false);
	// Same host, upgraded to https: fine. Downgraded: no.
	assert.equal(allowedUrl('https://radicale.home/alice/', 'http://radicale.home:5232/'), true);
	assert.equal(allowedUrl('http://cloud.example.com/', 'https://cloud.example.com/'), false);
	// iCloud from plain http is not iCloud.
	assert.equal(allowedUrl('https://p42-caldav.icloud.com/', 'http://caldav.icloud.com/'), false);
	assert.equal(allowedUrl('https://cloud.example.com:8443/', 'https://cloud.example.com'), false);
	// One label short of a real domain: no siblings, or every .com would pass.
	assert.equal(allowedUrl('https://other.com/', 'https://example.com'), false);
	assert.equal(allowedUrl('http://radicale.home:5232/alice/', 'http://radicale.home:5232/'), true);
	assert.equal(allowedUrl('http://nas.home:5232/', 'http://radicale.home:5232/'), false);
	assert.equal(allowedUrl('not a url', 'https://cloud.example.com'), false);
});

// ── The adapter against a fake server ─────────────────────────────

function fakeServer({ now, expandDropsAlarms = false }) {
	const start = icsTime(now + 30 * MIN);
	const event = [
		'BEGIN:VCALENDAR',
		'BEGIN:VEVENT',
		'UID:dentist',
		'SUMMARY:Dentist',
		'LOCATION:High St',
		`DTSTART:${start}`,
		'DURATION:PT1H',
		'BEGIN:VALARM',
		'ACTION:DISPLAY',
		'TRIGGER:-PT15M',
		'END:VALARM',
		'END:VEVENT',
		'END:VCALENDAR'
	].join('\r\n');
	const ms = (body) => new Response(`<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">${body}</d:multistatus>`, { status: 207 });
	const ok = '<d:status>HTTP/1.1 200 OK</d:status>';
	const calls = [];
	const fetch = async (url, init) => {
		calls.push({ url, method: init.method, depth: init.headers.depth, auth: init.headers.authorization, body: init.body });
		if (init.headers.authorization !== 'Basic ' + Buffer.from('alice:s3cret ').toString('base64')) {
			return new Response('', { status: 401 });
		}
		const path = new URL(url).pathname;
		if (path === '/') return new Response('', { status: 301, headers: { location: '/dav/' } });
		if (path === '/dav/' && init.method === 'PROPFIND') {
			return ms(`<d:response><d:href>/dav/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype><d:current-user-principal><d:href>/dav/alice/</d:href></d:current-user-principal></d:prop>${ok}</d:propstat></d:response>`);
		}
		if (path === '/dav/alice/' && init.headers.depth === '0') {
			return ms(`<d:response><d:href>/dav/alice/</d:href><d:propstat><d:prop><c:calendar-home-set><d:href>/dav/alice/cals/</d:href></c:calendar-home-set></d:prop>${ok}</d:propstat></d:response>`);
		}
		if (path === '/dav/alice/cals/' && init.method === 'PROPFIND') {
			return ms(
				`<d:response><d:href>/dav/alice/cals/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop>${ok}</d:propstat></d:response>` +
				`<d:response><d:href>/dav/alice/cals/home/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><d:displayname>Home</d:displayname></d:prop>${ok}</d:propstat></d:response>` +
				`<d:response><d:href>/dav/alice/cals/tasks/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><c:supported-calendar-component-set><c:comp name="VTODO"/></c:supported-calendar-component-set></d:prop>${ok}</d:propstat></d:response>`
			);
		}
		if (path === '/dav/alice/cals/home/' && init.method === 'REPORT') {
			// Pretend text-match is unsupported, as some servers do.
			if (init.body.includes('text-match')) return new Response('', { status: 501 });
			// Stalwart: expanded instances come back without their VALARMs.
			const expanded = !init.body.includes('calendar-multiget');
			const data = expandDropsAlarms && expanded ? event.replace(/BEGIN:VALARM[\s\S]*END:VALARM\r\n/, '') : event;
			return ms(`<d:response><d:href>/dav/alice/cals/home/dentist.ics</d:href><d:propstat><d:prop><c:calendar-data>${data.replace(/&/g, '&amp;')}</c:calendar-data></d:prop>${ok}</d:propstat></d:response>`);
		}
		return new Response('', { status: 404 });
	};
	return { fetch, calls };
}

const config = { url: 'https://cal.example.net/', username: 'alice', password: 's3cret ' };

test('test(): follows the redirect, finds event calendars, skips task lists', async () => {
	const { fetch } = fakeServer({ now: Date.now() });
	assert.deepEqual(await caldav.test({ config, fetch }), { ok: true, message: 'Connected — 1 calendar' });
	assert.deepEqual(await caldav.test({ config: { ...config, password: 'nope' }, fetch }), {
		ok: false,
		message: 'Username or app password rejected'
	});
});

test('test(): a redirect to another host is refused', async () => {
	const fetch = async () => new Response('', { status: 302, headers: { location: 'https://elsewhere.example.org/dav/' } });
	const res = await caldav.test({ config: { ...config, username: 'bob' }, fetch });
	assert.equal(res.ok, false);
	assert.match(res.message, /won’t send your password/);
});

test('search: matches the title, falls back when text-match fails', async () => {
	const { fetch, calls } = fakeServer({ now: Date.now() });
	const { results } = await caldav.searchProviders.events.query({ config, fetch, query: 'denT', limit: 10, timeZone: 'UTC' });
	assert.equal(results.length, 1);
	assert.equal(results[0].title, 'Dentist');
	assert.match(results[0].subtitle, /· High St · Home$/);
	assert.equal(results[0].href, config.url);
	assert.equal(calls.filter((c) => c.method === 'REPORT').length, 2);

	const none = await caldav.searchProviders.events.query({ config, fetch, query: 'gym', limit: 10, timeZone: 'UTC' });
	assert.deepEqual(none.results, []);
});

test('reminders: the event’s own alarm, inside the window', async () => {
	const now = Date.now();
	const { fetch } = fakeServer({ now });
	const reminders = await caldav.reminders({ config: { ...config, webUrl: 'https://cal.example.net/web' }, fetch, timeZone: 'UTC', now });
	assert.equal(reminders.length, 1);
	const [r] = reminders;
	assert.equal(r.title, 'Dentist');
	assert.equal(r.location, 'High St');
	assert.equal(r.href, 'https://cal.example.net/web');
	assert.equal(r.at, r.start - 15 * MIN);

	// Two days on, the alarm has long passed.
	assert.deepEqual(await caldav.reminders({ config, fetch, timeZone: 'UTC', now: now + 2 * 24 * 60 * MIN }), []);
});

test('reminders: alarms the server dropped while expanding come from the stored event', async () => {
	const now = Date.now();
	const { fetch, calls } = fakeServer({ now, expandDropsAlarms: true });
	const reminders = await caldav.reminders({ config, fetch, timeZone: 'UTC', now });
	assert.equal(reminders.length, 1);
	assert.equal(reminders[0].at, reminders[0].start - 15 * MIN);
	const multiget = calls.find((c) => c.body?.includes('calendar-multiget'));
	assert.match(multiget.body, /<d:href>\/dav\/alice\/cals\/home\/dentist\.ics<\/d:href>/);
});
