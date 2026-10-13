// Unit tests for the Calendar (CalDAV) integration: the iCalendar reader,
// the multistatus reader, where credentials may be sent, and the adapter
// end to end against a fake server.
// Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseEvents, parseTime, parseDuration, onlyLink } from '../../src/lib/server/integrations/ical.js';
import caldav, { parseMultistatus, allowedUrl, icsTime, webAddress, serverName } from '../../src/lib/server/integrations/caldav.js';

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

function fakeServer({ now, expandDropsAlarms = false, multigetThrows = false, holiday = false }) {
	const start = icsTime(now + 30 * MIN);
	const event = [
		'BEGIN:VCALENDAR',
		'BEGIN:VEVENT',
		'UID:dentist',
		'SUMMARY:Dentist',
		'LOCATION:High St',
		'DESCRIPTION:Bring the forms\\nand the card',
		`DTSTART:${start}`,
		'DURATION:PT1H',
		'BEGIN:VALARM',
		'ACTION:DISPLAY',
		'TRIGGER:-PT15M',
		'END:VALARM',
		'END:VEVENT',
		'END:VCALENDAR'
	].join('\r\n');
	// No alarm, so reminders always look it up in the stored copies.
	const gym = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:gym', 'SUMMARY:Gym', `DTSTART:${start}`, 'DURATION:PT1H', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
	// An all-day holiday two days on. Stalwart expands its dates into UTC
	// times and drops the alarm; the stored copy keeps both.
	const day = icsTime(now + 2 * 24 * 60 * MIN).slice(0, 8);
	const next = icsTime(now + 3 * 24 * 60 * MIN).slice(0, 8);
	const holidayIcs = (stored) => ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:holiday', 'SUMMARY:Dussehra',
		...(stored ? [`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${next}`, 'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT15H', 'END:VALARM'] : [`DTSTART:${day}T000000Z`, `DTEND:${next}T000000Z`]),
		'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
	const ms = (body) => new Response(`<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">${body}</d:multistatus>`, { status: 207 });
	const ok = '<d:status>HTTP/1.1 200 OK</d:status>';
	const calls = [];
	const fetch = async (url, init) => {
		calls.push({ url, method: init.method, depth: init.headers.depth, auth: init.headers.authorization, body: init.body });
		if (init.headers.authorization !== 'Basic ' + Buffer.from('alice:s3cret ').toString('base64')) {
			return new Response('', { status: 401 });
		}
		const path = new URL(url).pathname;
		if (multigetThrows && init.body?.includes('calendar-multiget')) throw new TypeError('fetch failed');
		if (path === '/dav/alice/cals/home/dentist.ics' && init.method === 'GET') return new Response(event, { status: 200 });
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
			const response = (name, ics) => `<d:response><d:href>/dav/alice/cals/home/${name}.ics</d:href><d:propstat><d:prop><c:calendar-data>${ics.replace(/&/g, '&amp;')}</c:calendar-data></d:prop>${ok}</d:propstat></d:response>`;
			return ms(response('dentist', data) + response('gym', gym) + (holiday ? response('holiday', holidayIcs(!expanded)) : ''));
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
	assert.match(results[0].subtitle, /· High St$/);
	assert.equal(calls.filter((c) => c.method === 'REPORT').length, 2);
	// No web address for this server: picking it shows the details instead.
	assert.equal(results[0].href, undefined);
	assert.equal(results[0].detail.href, 'https://cal.example.net/dav/alice/cals/home/dentist.ics');
	const details = await caldav.details({ config, fetch, params: results[0].detail });
	assert.equal(details.title, 'Dentist');
	assert.deepEqual(details.facts.slice(1), ['High St']);
	assert.deepEqual(details.genres, []);
	assert.equal(details.overview, 'Bring the forms\nand the card');
	assert.equal(details.link, null);
	assert.equal(await caldav.details({ config, fetch, params: { ...results[0].detail, href: 'https://elsewhere.example.org/x.ics' } }), null);

	const withWeb = await caldav.searchProviders.events.query({ config: { ...config, webUrl: 'https://cal.example.net/web' }, fetch, query: 'dent', limit: 10, timeZone: 'UTC' });
	assert.equal(withWeb.results[0].href, 'https://cal.example.net/web');
	assert.equal(withWeb.results[0].detail, undefined);

	const none = await caldav.searchProviders.events.query({ config, fetch, query: 'swim', limit: 10, timeZone: 'UTC' });
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

	assert.equal(r.call, null);

	// Past due but the event is still on: kept, so the page can keep it up.
	const during = await caldav.reminders({ config, fetch, timeZone: 'UTC', now: r.start + MIN });
	assert.deepEqual(during.map((x) => x.id), [r.id]);
	const over = (r.end ?? r.start + 30 * MIN) + MIN;
	assert.deepEqual((await caldav.reminders({ config, fetch, timeZone: 'UTC', now: over })).filter((x) => x.id === r.id), []);

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

test('reminders: a failed lookup of the stored events keeps the alarms that came back', async () => {
	const now = Date.now();
	const { fetch } = fakeServer({ now, multigetThrows: true });
	const reminders = await caldav.reminders({ config, fetch, timeZone: 'UTC', now });
	assert.deepEqual(reminders.map((r) => r.title), ['Dentist']);
});

test('web address: the one given, else the known calendar page of Nextcloud, iCloud or Fastmail', () => {
	assert.equal(webAddress({ url: 'https://cloud.example.com/remote.php/dav', webUrl: 'https://cal.example.com/' }), 'https://cal.example.com/');
	assert.equal(webAddress({ url: 'https://cloud.example.com/remote.php/dav' }), 'https://cloud.example.com/index.php/apps/calendar/');
	assert.equal(webAddress({ url: 'https://example.com/nextcloud/remote.php/dav/calendars/alice/' }), 'https://example.com/nextcloud/index.php/apps/calendar/');
	assert.equal(webAddress({ url: 'https://caldav.icloud.com/' }), 'https://www.icloud.com/calendar/');
	assert.equal(webAddress({ url: 'https://caldav.fastmail.com/dav/' }), 'https://app.fastmail.com/calendar/');
	assert.equal(webAddress({ url: 'https://mail.example.com/dav/cal' }), null);
	assert.equal(webAddress({ url: 'https://notfastmail.com/' }), null);
});

test('serverName: names the known services, null otherwise', () => {
	assert.equal(serverName({ url: 'https://caldav.icloud.com/' }), 'iCloud');
	assert.equal(serverName({ url: 'https://caldav.fastmail.com/dav/calendars' }), 'Fastmail');
	assert.equal(serverName({ url: 'https://cloud.example.com/remote.php/dav' }), 'Nextcloud');
	assert.equal(serverName({ url: 'https://mail.example.com/dav/cal/alice/default/' }), 'Stalwart');
	assert.equal(serverName({ url: 'https://icloud.com.evil.example/' }), null);
	assert.equal(serverName({ url: 'https://cal.example.net/dav/alice/' }), null);
	assert.equal(serverName({ url: 'nope' }), null);
});

test('details: a moved occurrence shows its own title, found by RECURRENCE-ID', async () => {
	const ics = [
		'BEGIN:VCALENDAR',
		'BEGIN:VEVENT', 'UID:standup', 'SUMMARY:Standup', 'DTSTART:20261012T043000Z', 'RRULE:FREQ=DAILY', 'END:VEVENT',
		'BEGIN:VEVENT', 'UID:standup', 'SUMMARY:Standup (moved)', 'RECURRENCE-ID:20261014T043000Z', 'DTSTART:20261014T080000Z', 'END:VEVENT',
		'END:VCALENDAR'
	].join('\r\n');
	const { fetch: base } = fakeServer({ now: Date.now() });
	const fetch = async (url, init) => (init.method === 'GET' ? new Response(ics, { status: 200 }) : base(url, init));
	const href = 'https://cal.example.net/dav/alice/cals/home/standup.ics';
	const moved = Date.UTC(2026, 9, 14, 8, 0);
	const one = await caldav.details({ config, fetch, params: { href, start: moved, recurrenceId: Date.UTC(2026, 9, 14, 4, 30), timeZone: 'UTC' } });
	assert.equal(one.title, 'Standup (moved)');
	const series = await caldav.details({ config, fetch, params: { href, start: Date.UTC(2026, 9, 13, 4, 30), recurrenceId: Date.UTC(2026, 9, 13, 4, 30), timeZone: 'UTC' } });
	assert.equal(series.title, 'Standup');
});

test('upcoming: events still on or ahead, soonest first', async () => {
	const now = Date.now();
	const { fetch } = fakeServer({ now });
	const events = await caldav.upcoming({ config, fetch, timeZone: 'UTC', now });
	assert.deepEqual(events.map((e) => e.title), ['Dentist', 'Gym']);
	assert.equal(events[0].location, 'High St');
	assert.equal(events[0].href, null);
	// Once both are over, nothing is left.
	assert.deepEqual(await caldav.upcoming({ config, fetch, timeZone: 'UTC', now: now + 2 * 60 * MIN }), []);
});

test('parseEvents: finds the video call link', () => {
	const ev = (lines) => parseEvents(['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:x', 'DTSTART:20261013T093000Z', ...lines, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n'))[0];
	assert.equal(ev(['CONFERENCE;VALUE=URI;FEATURE=VIDEO:https://meet.jit.si/Room']).call, 'https://meet.jit.si/Room');
	assert.equal(ev(['X-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij']).call, 'https://meet.google.com/abc-defg-hij');
	assert.equal(ev(['LOCATION:https://us02web.zoom.us/j/123?pwd=x']).call, 'https://us02web.zoom.us/j/123?pwd=x');
	assert.equal(ev(['DESCRIPTION:Join:\\nhttps://teams.microsoft.com/l/meetup-join/abc).']).call, 'https://teams.microsoft.com/l/meetup-join/abc');
	// Not a call service, not https, or a lookalike host: no link.
	assert.equal(ev(['URL:https://example.com/agenda', 'DESCRIPTION:See https://zoom.us.evil.example/j/1']).call, null);
	assert.equal(ev(['CONFERENCE;VALUE=URI:http://meet.jit.si/Room']).call, null);
	assert.equal(ev(['CONFERENCE;VALUE=URI:javascript:alert(1)']).call, null);
});

test('onlyLink: a location that is just the call link', () => {
	// The call link comes back normalised; the location as typed.
	assert.equal(onlyLink('https://meet.jit.si', 'https://meet.jit.si/'), true);
	assert.equal(onlyLink(' https://meet.jit.si/Room ', 'https://meet.jit.si/Room'), true);
	assert.equal(onlyLink('Room 4, https://meet.jit.si/Room', 'https://meet.jit.si/Room'), false);
	assert.equal(onlyLink('https://meet.jit.si/Room', null), false);
	assert.equal(onlyLink('', 'https://meet.jit.si/Room'), false);
});

test('all-day events the server expanded into UTC get their dates back', async () => {
	const now = Date.UTC(2026, 9, 13, 8, 0);
	const { fetch } = fakeServer({ now, holiday: true });
	const [holiday] = (await caldav.upcoming({ config, fetch, timeZone: 'Asia/Kolkata', now })).filter((e) => e.title === 'Dussehra');
	assert.equal(holiday.allDay, true);
	// Midnight to midnight on 15 Oct in Kolkata, not 05:30 to 05:30.
	assert.equal(holiday.start, Date.UTC(2026, 9, 14, 18, 30));
	assert.equal(holiday.end, Date.UTC(2026, 9, 15, 18, 30));
	// The stored alarm, from the right start: 09:00 the day before.
	const reminder = (await caldav.reminders({ config, fetch, timeZone: 'Asia/Kolkata', now: Date.UTC(2026, 9, 14, 3, 0) })).find((r) => r.title === 'Dussehra');
	assert.equal(reminder.at, Date.UTC(2026, 9, 14, 3, 30));
	assert.equal(reminder.allDay, true);
});

test('a timed event from one UTC midnight to the next stays timed', async () => {
	const now = Date.UTC(2026, 9, 13, 8, 0);
	const { fetch } = fakeServer({ now });
	const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:shift', 'SUMMARY:Shift', 'DTSTART:20261015T000000Z', 'DTEND:20261016T000000Z', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
	const wrapped = async (url, init) => {
		const res = await fetch(url, init);
		if (res.status !== 207) return res;
		const body = (await res.text()).replace('</d:multistatus>', `<d:response><d:href>/dav/alice/cals/home/shift.ics</d:href><d:propstat><d:prop><c:calendar-data>${ics}</c:calendar-data></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`);
		return new Response(body, { status: 207 });
	};
	const shift = (await caldav.upcoming({ config, fetch: wrapped, timeZone: 'Asia/Kolkata', now })).find((e) => e.title === 'Shift');
	assert.equal(shift.allDay, false);
	assert.equal(shift.start, Date.UTC(2026, 9, 15));
});
