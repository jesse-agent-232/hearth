// A small iCalendar (RFC 5545) reader for the CalDAV adapter: just enough to
// list events and their reminders. Recurring events arrive already expanded
// by the server (CalDAV's <expand>), so there is no RRULE handling here.

// Lines folded with a leading space or tab are joined back up.
function unfold(text) {
	return String(text || '').replace(/\r\n|\r/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

// "DTSTART;TZID=Europe/London:20261012T093000" →
// { name: 'DTSTART', params: { TZID: 'Europe/London' }, value: '20261012T093000' }
function parseLine(line) {
	let i = 0;
	let quoted = false;
	for (; i < line.length; i++) {
		const ch = line[i];
		if (ch === '"') quoted = !quoted;
		else if (ch === ':' && !quoted) break;
	}
	if (i >= line.length) return null;
	const [name, ...rawParams] = line.slice(0, i).split(';');
	const params = {};
	for (const p of rawParams) {
		const eq = p.indexOf('=');
		if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
	}
	return { name: name.toUpperCase(), params, value: line.slice(i + 1) };
}

function unescapeText(s) {
	return s.replace(/\\([nN,;\\])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));
}

// ── Times ─────────────────────────────────────────────────────────

function wallClock(zone, t) {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric'
	}).formatToParts(new Date(t));
	const get = (type) => Number(parts.find((p) => p.type === type).value);
	return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
}

// The instant when the wall clock in `zone` reads the given UTC-shaped time.
function zoned(zone, wall) {
	const first = wall - (wallClock(zone, wall) - wall);
	return wall - (wallClock(zone, first) - first);
}

export function validZone(zone) {
	if (!zone) return false;
	try {
		new Intl.DateTimeFormat('en', { timeZone: zone });
		return true;
	} catch {
		return false;
	}
}

// A DATE or DATE-TIME value → { t, allDay }. Floating and all-day times are
// read in `zone` (the viewer's), as a calendar app on their device would.
export function parseTime(value, params = {}, zone = 'UTC') {
	const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value || '');
	if (!m) return null;
	const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
	if (!m[4]) return { t: zoned(zone, wall), allDay: true };
	if (m[7]) return { t: wall, allDay: false };
	const tz = validZone(params.TZID) ? params.TZID : zone;
	return { t: zoned(tz, wall), allDay: false };
}

// "-PT15M", "P1D", "-P1DT2H30M", "P2W" → milliseconds (negative = before).
export function parseDuration(value) {
	const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value || '');
	if (!m || value.endsWith('T') || /^[+-]?P$/.test(value)) return null;
	const [, sign, w, d, h, min, s] = m;
	const ms = ((((+(w || 0) * 7 + +(d || 0)) * 24 + +(h || 0)) * 60 + +(min || 0)) * 60 + +(s || 0)) * 1000;
	return sign === '-' ? -ms : ms;
}

// ── Events ────────────────────────────────────────────────────────

/**
 * Every VEVENT in an iCalendar document.
 * → [{ uid, summary, location, start, end, allDay, alarms: [ms instants] }]
 * Cancelled events are left out, and so are alarms that only send email.
 */
export function parseEvents(ics, zone = 'UTC') {
	const events = [];
	let event = null;
	let alarm = null;
	for (const line of unfold(ics)) {
		const p = parseLine(line);
		if (!p) continue;
		if (p.name === 'BEGIN' && p.value.toUpperCase() === 'VEVENT') {
			event = { props: {}, alarms: [] };
		} else if (p.name === 'END' && p.value.toUpperCase() === 'VEVENT' && event) {
			const done = finishEvent(event, zone);
			if (done) events.push(done);
			event = null;
		} else if (p.name === 'BEGIN' && p.value.toUpperCase() === 'VALARM' && event) {
			alarm = {};
		} else if (p.name === 'END' && p.value.toUpperCase() === 'VALARM' && alarm) {
			event.alarms.push(alarm);
			alarm = null;
		} else if (alarm) {
			alarm[p.name] = p;
		} else if (event && !(p.name in event.props)) {
			event.props[p.name] = p;
		}
	}
	return events;
}

function finishEvent({ props, alarms }, zone) {
	if (props.STATUS?.value.toUpperCase() === 'CANCELLED') return null;
	const start = props.DTSTART && parseTime(props.DTSTART.value, props.DTSTART.params, zone);
	if (!start) return null;
	let end = props.DTEND ? parseTime(props.DTEND.value, props.DTEND.params, zone)?.t : null;
	if (end == null && props.DURATION) {
		const d = parseDuration(props.DURATION.value);
		if (d != null) end = start.t + d;
	}
	// A recurring event's instances share a UID; RECURRENCE-ID tells them apart.
	const uid = props.UID?.value || '';
	const rid = props['RECURRENCE-ID'];
	return {
		uid,
		id: `${uid}@${start.t}`,
		recurrenceId: rid ? (parseTime(rid.value, rid.params, zone)?.t ?? null) : null,
		summary: props.SUMMARY ? unescapeText(props.SUMMARY.value) : '',
		location: props.LOCATION ? unescapeText(props.LOCATION.value) : '',
		start: start.t,
		end: end ?? null,
		allDay: start.allDay,
		alarms: alarmTimes(alarms, start.t, end, zone),
		// As written, to place on other instances of the event: see alarmTimes.
		alarmSpecs: alarms
	};
}

/**
 * When an event's alarms go off. `specs` are its VALARMs as parsed; pass
 * `{ relativeOnly: true }` when borrowing them for another instance of a
 * repeating event, where a fixed date-time trigger belongs to the original.
 */
export function alarmTimes(specs, start, end, zone = 'UTC', { relativeOnly = false } = {}) {
	return specs
		.filter((a) => !relativeOnly || a.TRIGGER?.params.VALUE?.toUpperCase() !== 'DATE-TIME')
		.map((a) => alarmTime(a, start, end ?? start, zone))
		.filter((t) => t != null);
}

function alarmTime(alarm, start, end, zone) {
	const action = alarm.ACTION?.value.toUpperCase();
	if (action === 'EMAIL') return null;
	const trigger = alarm.TRIGGER;
	if (!trigger) return null;
	if (trigger.params.VALUE?.toUpperCase() === 'DATE-TIME') return parseTime(trigger.value, {}, zone)?.t ?? null;
	const offset = parseDuration(trigger.value);
	if (offset == null) return null;
	return (trigger.params.RELATED?.toUpperCase() === 'END' ? end : start) + offset;
}
