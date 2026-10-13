// CalDAV calendar integration adapter (RFC 4791): Nextcloud, Radicale, Baïkal,
// Fastmail, iCloud and anything else that speaks CalDAV with a password.
//
// Surfaces:
//   - searchProviders.events — finds events by title, from a month back to a year ahead
//   - widgets.reminders      — pops up the event's own reminders (VALARM) on the
//                              page, through `reminders` and GET /api/reminders
//   - widgets.upcoming       — the next event under the clock, the week ahead in
//                              its menu, through `upcoming` and GET /api/upcoming

import { createHash } from 'node:crypto';
import { alarmTimes, onlyLink, parseEvents, parseTime, validZone } from './ical.js';

const DAY = 24 * 60 * 60 * 1000;
const CALENDARS_TTL_MS = 30 * 60 * 1000;
const MAX_REDIRECTS = 3;
const UPCOMING_MAX = 8;

/** @type {import('./_types.js').IntegrationAdapter} */
const adapter = {
	id: 'caldav',
	name: 'Calendar',
	icon: '/api/icon/lucide/calendar',
	shortcut: 'cal',
	description: 'Events and reminders from any CalDAV calendar',
	// More accounts under `config.accounts`, each with the fields below.
	multiAccount: true,

	configSchema: [
		{
			key: 'url',
			type: 'url',
			label: 'CalDAV URL',
			required: true,
			placeholder: 'https://cloud.example.com/remote.php/dav',
			help: 'The server address your calendar app uses. Holm finds every calendar under it; a single calendar’s URL works too.',
			fromOperatorDefault: 'default_url'
		},
		{
			key: 'username',
			type: 'text',
			label: 'Username',
			required: true,
			placeholder: 'your-username'
		},
		{
			key: 'password',
			type: 'secret',
			label: 'App password',
			required: true,
			trim: false,
			help: 'Create an app password in your calendar server’s security settings rather than using your main password. Holm only reads your calendars.'
		},
		{
			key: 'webUrl',
			type: 'url',
			link: true,
			advanced: true,
			label: 'Calendar web address',
			placeholder: 'https://cloud.example.com/apps/calendar',
			help: 'Optional. Where an event opens when you pick it in search. Filled in for Nextcloud, iCloud and Fastmail; without one, picking an event shows its details.'
		}
	],

	async test({ config, fetch }) {
		if (!config?.url || !config?.username || !config?.password) {
			return { ok: false, message: 'URL, username, and app password are required' };
		}
		try {
			const calendars = await findCalendars(config, fetch, { fresh: true });
			if (calendars.length === 0) return { ok: false, message: 'Signed in, but found no calendars with events' };
			return { ok: true, message: `Connected — ${calendars.length} calendar${calendars.length === 1 ? '' : 's'}` };
		} catch (err) {
			return { ok: false, message: err.message };
		}
	},

	searchProviders: {
		events: {
			label: 'Events',
			mode: 'inline',
			async query({ config, query, limit, fetch, timeZone }) {
				const term = (query || '').trim();
				if (!term || !config?.url) return { results: [] };
				const now = Date.now();
				const events = await allEvents(config, fetch, now - 30 * DAY, now + 365 * DAY, { timeZone, term });
				const needle = term.toLocaleLowerCase();
				const found = events.filter((e) => e.summary.toLocaleLowerCase().includes(needle));
				// Coming up (or still on) soonest first, then the past, latest first.
				const upcoming = found.filter((e) => (e.end ?? e.start) > now).sort((a, b) => a.start - b.start);
				const past = found.filter((e) => (e.end ?? e.start) <= now).sort((a, b) => b.start - a.start);
				return {
					results: [...upcoming, ...past].slice(0, limit || 20).map((e) => {
						const href = webAddress(e.account);
						return {
							id: `${e.calendar.href}#${e.id}`,
							title: e.summary || 'Untitled event',
							subtitle: [formatWhen(e, timeZone), e.location].filter(Boolean).join(' · '),
							...(href ? { href } : { detail: detailParams(e, timeZone) }),
							meta: { kind: 'event' }
						};
					})
				};
			}
		}
	},

	/**
	 * An event's details, for a calendar with no web address to open. Times
	 * come from the result (an occurrence of a repeating event has its own);
	 * everything else is read again from the server.
	 */
	async details({ config: all, params, fetch }) {
		const { href, start, end, allDay } = params;
		// The account the event came from: its server, its password.
		const config = accountsOf(all).find((a) => a.id === (params.account ?? MAIN));
		if (!config || typeof href !== 'string' || !Number.isFinite(start) || !allowedUrl(href, config.url)) return null;
		const timeZone = validZone(params.timeZone) ? params.timeZone : 'UTC';
		const res = await dav(config, fetch, href, 'GET', undefined, 0);
		if (res.status !== 200) throw new Error(`The calendar answered ${res.status}`);
		const events = parseEvents(await res.text(), timeZone);
		// A moved occurrence keeps its original time in RECURRENCE-ID.
		const rid = Number.isFinite(params.recurrenceId) ? params.recurrenceId : start;
		const e = events.find((x) => x.recurrenceId === rid) || events.find((x) => x.recurrenceId == null) || events[0];
		if (!e) return null;
		const when = { start, end: Number.isFinite(end) ? end : null, allDay: allDay === true };
		const server = serverName(config);
		return {
			title: e.summary || 'Untitled event',
			// A location that is only the call link shows as the button instead.
			facts: [formatWhen(when, timeZone), onlyLink(e.location, e.call) ? '' : e.location].filter(Boolean),
			// Where the calendar lives, as a chip: a calendar's own name
			// ("Stalwart Calendar (you@…)") says little.
			genres: server ? [server] : [],
			overview: e.description,
			link: e.call ? { label: 'Join call', href: e.call } : null
		};
	},

	// Off unless the operator sets `surfaces.widgets: true`; then on for a
	// new connection, since a calendar is mostly for the reminders.
	widgetsOnConnect: true,
	widgets: {
		reminders: { label: 'Reminders', description: 'Show event reminders on this page, at the times set in your calendar' },
		upcoming: { label: 'Upcoming events', description: 'Your next event under the clock, and the week ahead a click away' }
	},

	/**
	 * Alarms due in the next day, plus those already due whose event hasn't
	 * ended (the page keeps them up until dismissed), for GET /api/reminders.
	 * Alarms only come from the events themselves: no reminder set, no popup.
	 */
	async reminders({ config, fetch, timeZone, now = Date.now() }) {
		const events = await allEvents(config, fetch, now - DAY, now + 8 * DAY, { timeZone, alarms: true });
		const out = [];
		for (const e of events) {
			for (const at of e.alarms) {
				const over = e.end ?? e.start + (e.allDay ? DAY : 30 * 60 * 1000);
				if (at > now + DAY || (at < now && (over <= now || at < now - DAY))) continue;
				out.push({
					id: `caldav:${e.calendar.href}#${e.id}@${at}`,
					title: e.summary || 'Untitled event',
					// A location that is only the call link shows as Join call.
					location: onlyLink(e.location, e.call) ? '' : e.location,
					start: e.start,
					end: e.end,
					allDay: e.allDay,
					at,
					href: webAddress(e.account),
					call: e.call
				});
			}
		}
		return out;
	},

	/**
	 * The next events, from any still on now to a week ahead, for GET
	 * /api/upcoming.
	 */
	async upcoming({ config, fetch, timeZone, now = Date.now() }) {
		const events = await allEvents(config, fetch, now - DAY, now + 7 * DAY, { timeZone });
		return events
			.filter((e) => (e.end ?? e.start + (e.allDay ? DAY : 0)) > now)
			.sort((a, b) => a.start - b.start)
			.slice(0, UPCOMING_MAX)
			.map((e) => ({
				id: `caldav:${e.calendar.href}#${e.id}`,
				title: e.summary || 'Untitled event',
				location: onlyLink(e.location, e.call) ? '' : e.location,
				// Opens its details in search, as a search result would.
				detail: detailParams(e, timeZone),
				start: e.start,
				end: e.end,
				allDay: e.allDay,
				href: webAddress(e.account),
				call: e.call
			}));
	}
};

// ── Accounts ──────────────────────────────────────────────────────

const MAIN = 'main';

/**
 * Every account in a connection: the config itself first, then the others
 * under `config.accounts`, each with its own id.
 */
export function accountsOf(config) {
	const { accounts, ...main } = config || {};
	return [{ ...main, id: MAIN }, ...(Array.isArray(accounts) ? accounts : [])];
}

/**
 * Events from every account, each marked with the account it came from. An
 * account that fails is left out; only when all of them fail is it an error.
 */
async function allEvents(config, fetch, from, to, opts) {
	const lists = await Promise.allSettled(
		accountsOf(config).map(async (account) =>
			(await eventsBetween(account, fetch, from, to, opts)).map((e) => ({ ...e, account }))
		)
	);
	const ok = lists.filter((l) => l.status === 'fulfilled');
	if (!ok.length) throw lists[0].reason;
	// The others still show, so the one left out is only in the log.
	const accounts = accountsOf(config);
	lists.forEach((l, i) => {
		if (l.status === 'rejected') console.error(`[caldav] ${hostOf(accounts[i].url)} left out:`, l.reason?.message || l.reason);
	});
	return ok.flatMap((l) => l.value);
}

function hostOf(url) {
	try {
		return new URL(url).host;
	} catch {
		return 'account';
	}
}

// What details() needs to find the event again.
function detailParams(e, timeZone) {
	return { href: e.resource, start: e.start, end: e.end, allDay: e.allDay, recurrenceId: e.recurrenceId, timeZone, account: e.account.id };
}

// ── Events ────────────────────────────────────────────────────────

async function eventsBetween(config, fetch, from, to, { timeZone = 'UTC', term = '', alarms = false } = {}) {
	const calendars = await findCalendars(config, fetch);
	const lists = await Promise.all(
		calendars.map(async (calendar) => {
			let res = await dav(config, fetch, calendar.href, 'REPORT', calendarQuery(from, to, term), 1);
			// Not every server takes a text-match: ask again for everything and
			// filter here instead.
			if (term && res.status !== 207) res = await dav(config, fetch, calendar.href, 'REPORT', calendarQuery(from, to, ''), 1);
			if (res.status !== 207) throw new Error(`Calendar “${calendar.name}” answered ${res.status}`);
			const out = [];
			const recheck = new Set();
			for (const r of parseMultistatus(await res.text(), res.url)) {
				const data = r.props['calendar-data'];
				if (!data) continue;
				for (const event of parseEvents(data, timeZone)) {
					if ((event.end ?? event.start) < from || event.start > to) continue;
					out.push({ ...event, calendar, resource: r.href });
					if ((alarms && !event.alarms.length) || wholeUtcDays(event)) recheck.add(r.href);
				}
			}
			if (recheck.size) {
				// A failed lookup leaves the events as the server expanded them.
				try {
					await fromStored(config, fetch, calendar, [...recheck], out, timeZone, { alarms });
				} catch {}
			}
			return out;
		})
	);
	return lists.flat();
}

// Timed, from one UTC midnight to another: what an all-day event looks like
// after a server expands it into UTC (Stalwart does).
function wholeUtcDays(e) {
	return !e.allDay && e.start % DAY === 0 && (e.end == null || (e.end > e.start && (e.end - e.start) % DAY === 0));
}

// The same calendar date as UTC instant `t`, as midnight in `zone`.
function localDate(t, zone) {
	return parseTime(new Date(t).toISOString().slice(0, 10).replaceAll('-', ''), {}, zone).t;
}

/**
 * Some servers change what they expand. Stalwart drops VALARMs, so a
 * reminder never shows, and turns all-day dates into UTC times. Fetch the
 * stored copies of the events that may be affected: an all-day event gets
 * its dates back, in the viewer's zone, and an instance without alarms gets
 * those of the event it came from.
 */
async function fromStored(config, fetch, calendar, hrefs, events, timeZone, { alarms }) {
	const res = await dav(config, fetch, calendar.href, 'REPORT', calendarMultiget(hrefs), 1);
	if (res.status !== 207) return;
	const stored = new Map();
	for (const r of parseMultistatus(await res.text(), res.url)) {
		for (const e of parseEvents(r.props['calendar-data'] || '', timeZone)) {
			const key = e.recurrenceId == null ? e.uid : `${e.uid}@${e.recurrenceId}`;
			if (!stored.has(key)) stored.set(key, e);
		}
	}
	for (const e of events) {
		const own = e.recurrenceId != null ? stored.get(`${e.uid}@${e.recurrenceId}`) : null;
		const from = own || stored.get(e.uid);
		if (!from) continue;
		const dated = from.allDay && wholeUtcDays(e);
		if (dated) {
			e.allDay = true;
			e.start = localDate(e.start, timeZone);
			e.end = e.end == null ? null : localDate(e.end, timeZone);
		}
		if (!alarms || !from.alarmSpecs.length || (e.alarms.length && !dated)) continue;
		e.alarms = alarmTimes(from.alarmSpecs, e.start, e.end, timeZone, { relativeOnly: from.start !== e.start });
	}
}

function calendarMultiget(hrefs) {
	const list = hrefs.map((h) => `<d:href>${escapeXml(new URL(h).pathname)}</d:href>`).join('');
	return `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-multiget xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><c:calendar-data/></d:prop>${list}
</c:calendar-multiget>`;
}

function calendarQuery(from, to, term) {
	const range = `start="${icsTime(from)}" end="${icsTime(to)}"`;
	const match = term
		? `<c:prop-filter name="SUMMARY"><c:text-match collation="i;unicode-casemap">${escapeXml(term)}</c:text-match></c:prop-filter>`
		: '';
	return `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><c:calendar-data><c:expand ${range}/></c:calendar-data></d:prop>
  <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range ${range}/>${match}</c:comp-filter></c:comp-filter></c:filter>
</c:calendar-query>`;
}

/**
 * Where an event opens: the address the user gave, or for a server whose
 * calendar page is known, that page. Null when there is none.
 */
/**
 * The calendar service a CalDAV URL points at, from its host or path, for
 * the chip on an event's details. Null when it can't be told.
 * @param {Record<string, any>} config
 */
export function serverName(config) {
	let u;
	try {
		u = new URL(config.url);
	} catch {
		return null;
	}
	const host = u.hostname.toLowerCase();
	const on = (domain) => host === domain || host.endsWith(`.${domain}`);
	if (on('icloud.com')) return 'iCloud';
	if (on('fastmail.com')) return 'Fastmail';
	if (u.pathname.includes('/remote.php/')) return 'Nextcloud';
	if (u.pathname.startsWith('/dav/cal/')) return 'Stalwart';
	return null;
}

export function webAddress(config) {
	if (config.webUrl) return config.webUrl;
	let u;
	try {
		u = new URL(config.url);
	} catch {
		return null;
	}
	const host = u.hostname.toLowerCase();
	const nextcloud = u.pathname.indexOf('/remote.php/');
	if (nextcloud !== -1) return `${u.origin}${u.pathname.slice(0, nextcloud)}/index.php/apps/calendar/`;
	if (host === 'icloud.com' || host.endsWith('.icloud.com')) return 'https://www.icloud.com/calendar/';
	if (host === 'fastmail.com' || host.endsWith('.fastmail.com')) return 'https://app.fastmail.com/calendar/';
	return null;
}

export function icsTime(t) {
	return new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
}

function formatWhen(e, timeZone = 'UTC') {
	const day = (t) => new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(t);
	if (e.allDay) {
		const last = e.end ? e.end - 1 : e.start;
		return day(e.start) === day(last) ? `${day(e.start)} · All day` : `${day(e.start)} – ${day(last)}`;
	}
	const time = (t) => new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(t);
	if (!e.end || e.end === e.start) return `${day(e.start)} · ${time(e.start)}`;
	if (day(e.start) === day(e.end)) return `${day(e.start)} · ${time(e.start)} – ${time(e.end)}`;
	return `${day(e.start)} ${time(e.start)} – ${day(e.end)} ${time(e.end)}`;
}

// ── Discovery ─────────────────────────────────────────────────────
//
// The configured URL → its user's principal → the principal's calendar home
// → the calendars in it. Kept for half an hour, per server and credentials.

const calendarCache = new Map();

async function findCalendars(config, fetch, { fresh = false } = {}) {
	const key = createHash('sha256').update(`${config.url}\n${config.username}\n${config.password}`).digest('hex');
	const hit = calendarCache.get(key);
	if (!fresh && hit && Date.now() - hit.at < CALENDARS_TTL_MS) return hit.calendars;

	const calendars = await discover(config, fetch);
	calendarCache.set(key, { at: Date.now(), calendars });
	return calendars;
}

const PROPS = '<d:resourcetype/><d:displayname/><d:current-user-principal/><c:calendar-home-set/><c:supported-calendar-component-set/>';

function propfind(props) {
	return `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop>${props}</d:prop></d:propfind>`;
}

async function discover(config, fetch) {
	let res = await dav(config, fetch, config.url, 'PROPFIND', propfind(PROPS), 0);
	if (res.status === 401 || res.status === 403) throw new Error('Username or app password rejected');
	// A bare host: the well-known address points at the DAV root.
	if (res.status === 404 || res.status === 405) {
		res = await dav(config, fetch, new URL('/.well-known/caldav', config.url).href, 'PROPFIND', propfind(PROPS), 0);
	}
	if (res.status === 401 || res.status === 403) throw new Error('Username or app password rejected');
	if (res.status !== 207) throw new Error(`No CalDAV server at that URL (it answered ${res.status})`);

	const [self] = parseMultistatus(await res.text(), res.url);
	if (!self) throw new Error('No CalDAV server at that URL');
	if (isCalendar(self)) return [toCalendar(self)];

	// No principal either: take the URL itself for the calendar home.
	let home = self.props['calendar-home-set'];
	const principal = self.props['current-user-principal'];
	if (!home && !principal) home = res.url;
	if (!home) {
		const pres = await dav(config, fetch, principal, 'PROPFIND', propfind('<c:calendar-home-set/>'), 0);
		if (pres.status !== 207) throw new Error(`The server answered ${pres.status} for your account`);
		home = parseMultistatus(await pres.text(), pres.url)[0]?.props['calendar-home-set'];
		if (!home) throw new Error('The server did not say where your calendars are');
	}

	const hres = await dav(config, fetch, home, 'PROPFIND', propfind(PROPS), 1);
	if (hres.status !== 207) throw new Error(`The server answered ${hres.status} for your calendars`);
	return parseMultistatus(await hres.text(), hres.url).filter(isCalendar).map(toCalendar);
}

// A calendar that holds events (not only tasks). No component list means
// any component, per RFC 4791.
function isCalendar(r) {
	if (!/<calendar\b/.test(r.props.resourcetype || '')) return false;
	const comps = r.props['supported-calendar-component-set'];
	return !comps || /name=["']VEVENT["']/i.test(comps);
}

function toCalendar(r) {
	return { href: r.href, name: decodeXml(stripTags(r.props.displayname || '')).trim() || 'Calendar' };
}

// ── DAV over fetch ────────────────────────────────────────────────

function authHeader(config) {
	return 'Basic ' + Buffer.from(`${config.username}:${config.password}`, 'utf8').toString('base64');
}

/**
 * One DAV request. Redirects are followed by hand, a few at most, and only
 * to places `allowedUrl` lets the credentials go. The returned response gets
 * a `url` that is the final address, for resolving relative hrefs.
 */
async function dav(config, fetch, url, method, body, depth) {
	let target = url;
	for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
		if (!allowedUrl(target, config.url)) throw new Error('The server pointed somewhere Holm won’t send your password');
		const res = await fetch(target, {
			method,
			redirect: 'manual',
			headers: {
				authorization: authHeader(config),
				'content-type': 'application/xml; charset=utf-8',
				depth: String(depth)
			},
			body
		});
		const location = res.headers.get('location');
		if (res.status >= 300 && res.status < 400 && location) {
			target = new URL(location, target).href;
			continue;
		}
		return { status: res.status, url: target, text: () => res.text() };
	}
	throw new Error('Too many redirects');
}

// Providers that move each account to a host of its own beside the one the
// user typed: iCloud answers on caldav.icloud.com and hands each account a
// pNN-caldav.icloud.com. Only listed here, never inferred: on a shared
// domain (duckdns.org, ngrok.io) the host next door is someone else's.
const SIBLING_DOMAINS = ['icloud.com'];

/**
 * Where the user's password may be sent: the configured origin, the same
 * host upgraded to https, or, for a listed provider, another https host of
 * that provider.
 */
export function allowedUrl(url, base) {
	let u, b;
	try {
		u = new URL(url);
		b = new URL(base);
	} catch {
		return false;
	}
	if (u.origin === b.origin) return true;
	if (u.protocol !== 'https:') return false;
	if (b.protocol === 'http:') return u.hostname === b.hostname;
	return SIBLING_DOMAINS.some(
		(d) => (b.hostname === d || b.hostname.endsWith('.' + d)) && u.hostname.endsWith('.' + d)
	);
}

// ── A small, forgiving multistatus reader ─────────────────────────
//
// Servers differ in namespace prefixes (d:, D:, none, ns0:), so the prefixes
// are dropped and properties looked up by local name. Hrefs come back as
// absolute URLs, resolved against `base`.

export function parseMultistatus(xml, base) {
	const doc = String(xml || '').replace(/<(\/?)[A-Za-z][\w.-]*:(?=[A-Za-z])/g, '<$1');
	const out = [];
	for (const [, body] of doc.matchAll(/<response\b[^>]*>([\s\S]*?)<\/response>/g)) {
		const href = textOf(body, 'href');
		if (href == null) continue;
		const props = {};
		for (const [, stat] of body.matchAll(/<propstat\b[^>]*>([\s\S]*?)<\/propstat>/g)) {
			const status = textOf(stat, 'status') || '';
			if (!/\s2\d\d\s/.test(status + ' ')) continue;
			const prop = innerOf(stat, 'prop') || '';
			for (const name of ['resourcetype', 'displayname', 'supported-calendar-component-set']) {
				const v = innerOf(prop, name);
				if (v != null) props[name] = v;
			}
			for (const name of ['current-user-principal', 'calendar-home-set']) {
				const inner = innerOf(prop, name);
				const h = inner != null ? textOf(inner, 'href') : null;
				if (h) props[name] = resolve(h, base);
			}
			const data = innerOf(prop, 'calendar-data');
			if (data != null) props['calendar-data'] = decodeXml(data);
		}
		out.push({ href: resolve(href, base), props });
	}
	return out;
}

function innerOf(xml, name) {
	const re = new RegExp(`<${name}\\b[^>]*?(?:/>|>([\\s\\S]*?)</${name}>)`);
	const m = re.exec(xml);
	return m ? m[1] ?? '' : null;
}

function textOf(xml, name) {
	const inner = innerOf(xml, name);
	return inner == null ? null : decodeXml(inner).trim();
}

function resolve(href, base) {
	try {
		return base ? new URL(href, base).href : href;
	} catch {
		return href;
	}
}

function stripTags(s) {
	return s.replace(/<[^>]*>/g, '');
}

function decodeXml(s) {
	return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>|&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (m, cdata, ent) => {
		if (cdata != null) return cdata;
		const e = ent.toLowerCase();
		if (e.startsWith('#')) {
			const code = e.startsWith('#x') ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
			return code <= 0x10ffff ? String.fromCodePoint(code) : '\ufffd';
		}
		return { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[e];
	});
}

function escapeXml(s) {
	return s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
}

export default adapter;
