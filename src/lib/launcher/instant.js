// Instant answers for the search bar: maths, unit conversions and the time
// in other zones, worked out in the browser as the user types. Nothing here
// touches the network.
//
// instantAnswer() returns { kind, from: { value, label }, to: { value, label }, copy }
// or null when the query isn't a question it can answer.

export function instantAnswer(query, { now = new Date(), timeZone, locale } = {}) {
	const q = (query || '').trim();
	if (!q || q.length > 120 || q.startsWith('!')) return null;
	const local = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
	return timeAnswer(q, now, local, locale) || unitAnswer(q, locale) || mathAnswer(q, locale);
}

// ── Maths ─────────────────────────────────────────────────────────
// A small recursive-descent parser: + - * / ^ (or **), mod, a postfix %
// (per cent), brackets, implicit products like 2pi or 3(4+1), and a few
// functions and constants. Never eval.

const FUNCS = {
	sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil,
	ln: Math.log, log: Math.log10, log2: Math.log2, exp: Math.exp,
	sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan
};
const CONSTS = { pi: Math.PI, π: Math.PI, e: Math.E, tau: 2 * Math.PI };

function tokenize(s) {
	const out = [];
	const re = /\s*(?:(\d+(?:\.\d*)?|\.\d+)(?:e([+-]?\d+))?|(\*\*|[-+*/^%()×÷−])|([a-zπ][a-z0-9]*))/iy;
	let i = 0;
	while (i < s.length) {
		re.lastIndex = i;
		const m = re.exec(s);
		if (!m) {
			if (/^\s*$/.test(s.slice(i))) break;
			return null;
		}
		i = re.lastIndex;
		if (m[1] !== undefined) out.push({ t: 'num', v: parseFloat(m[1] + (m[2] ? `e${m[2]}` : '')) });
		else if (m[3]) out.push({ t: 'op', v: { '×': '*', '÷': '/', '−': '-', '**': '^' }[m[3]] || m[3] });
		else out.push({ t: 'id', v: m[4].toLowerCase() });
	}
	return out;
}

function evaluate(tokens) {
	let pos = 0;
	const peek = () => tokens[pos];
	const isOp = (v) => peek()?.t === 'op' && peek().v === v;
	const take = () => tokens[pos++];

	function expr() {
		let v = term();
		while (isOp('+') || isOp('-')) v = take().v === '+' ? v + term() : v - term();
		return v;
	}
	function term() {
		let v = unary();
		for (;;) {
			if (isOp('*')) { take(); v *= unary(); }
			else if (isOp('/')) { take(); v /= unary(); }
			else if (peek()?.t === 'id' && peek().v === 'mod') { take(); v %= unary(); }
			// Implicit product: "2pi", "3(4+1)", "(1+1)(2+2)".
			else if (peek() && (peek().t === 'id' || isOp('('))) v *= power();
			else return v;
		}
	}
	function unary() {
		if (isOp('-')) { take(); return -unary(); }
		if (isOp('+')) { take(); return unary(); }
		return power();
	}
	function power() {
		const base = postfix();
		if (isOp('^')) { take(); return base ** unary(); }
		return base;
	}
	function postfix() {
		let v = primary();
		while (isOp('%')) { take(); v /= 100; }
		return v;
	}
	function primary() {
		const tok = take();
		if (!tok) throw new Error('end');
		if (tok.t === 'num') return tok.v;
		if (tok.t === 'op' && tok.v === '(') {
			const v = expr();
			if (!isOp(')')) throw new Error('bracket');
			take();
			return v;
		}
		if (tok.t === 'id' && tok.v in FUNCS) {
			// "sqrt 16" works as well as "sqrt(16)".
			return FUNCS[tok.v](isOp('(') ? primary() : postfix());
		}
		if (tok.t === 'id' && tok.v in CONSTS) return CONSTS[tok.v];
		throw new Error('token');
	}

	const v = expr();
	if (pos !== tokens.length) throw new Error('trailing');
	return v;
}

export function calculate(s) {
	const tokens = tokenize(s);
	if (!tokens?.length) return null;
	try {
		const v = evaluate(tokens);
		return Number.isFinite(v) ? v : null;
	} catch {
		return null;
	}
}

function mathAnswer(q, locale) {
	// Needs a digit and something to work out: "42" or "2024" on their own
	// are searches, not sums. Dates and version numbers are left alone too.
	if (!/\d/.test(q)) return null;
	const tokens = tokenize(q);
	if (!tokens || !tokens.some((t) => (t.t === 'op' && t.v !== '(' && t.v !== ')') || (t.t === 'id' && (t.v in FUNCS || t.v === 'mod')))) return null;
	if (/^\d{4}-\d{1,2}-\d{1,2}$|^\d+(\.\d+){2,}$/.test(q)) return null;
	const v = calculate(q);
	if (v === null) return null;
	return {
		kind: 'math',
		from: { value: q, label: 'Expression' },
		to: { value: formatNumber(v, locale), label: 'Result' },
		copy: plainNumber(v)
	};
}

// ── Units ─────────────────────────────────────────────────────────
// Each unit is a factor to its group's base unit. Temperature has offsets,
// so it's handled on its own.

const UNITS = {
	length: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344, nmi: 1852 },
	mass: { mg: 1e-6, g: 0.001, kg: 1, t: 1000, oz: 0.028349523125, lb: 0.45359237, st: 6.35029318 },
	volume: {
		ml: 0.001, cl: 0.01, dl: 0.1, l: 1, tsp: 0.00492892159375, tbsp: 0.01478676478125,
		floz: 0.0295735295625, cup: 0.2365882365, pt: 0.473176473, qt: 0.946352946, gal: 3.785411784
	},
	data: {
		bit: 0.125, B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, PB: 1e15,
		KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3, TiB: 1024 ** 4,
		kbit: 125, Mbit: 125e3, Gbit: 125e6
	},
	time: { ms: 0.001, s: 1, min: 60, h: 3600, d: 86400, wk: 604800, yr: 31557600 },
	speed: { 'm/s': 1, 'km/h': 1 / 3.6, mph: 0.44704, kn: 1852 / 3600, 'ft/s': 0.3048 },
	temperature: { '°C': null, '°F': null, K: null }
};

const NAMES = {
	mm: 'Millimetres', cm: 'Centimetres', m: 'Metres', km: 'Kilometres', in: 'Inches', ft: 'Feet', yd: 'Yards', mi: 'Miles', nmi: 'Nautical miles',
	mg: 'Milligrams', g: 'Grams', kg: 'Kilograms', t: 'Tonnes', oz: 'Ounces', lb: 'Pounds', st: 'Stone',
	ml: 'Millilitres', cl: 'Centilitres', dl: 'Decilitres', l: 'Litres', tsp: 'Teaspoons', tbsp: 'Tablespoons', floz: 'US fluid ounces', cup: 'US cups', pt: 'US pints', qt: 'US quarts', gal: 'US gallons',
	bit: 'Bits', B: 'Bytes', KB: 'Kilobytes', MB: 'Megabytes', GB: 'Gigabytes', TB: 'Terabytes', PB: 'Petabytes',
	KiB: 'Kibibytes', MiB: 'Mebibytes', GiB: 'Gibibytes', TiB: 'Tebibytes', kbit: 'Kilobits', Mbit: 'Megabits', Gbit: 'Gigabits',
	ms: 'Milliseconds', s: 'Seconds', min: 'Minutes', h: 'Hours', d: 'Days', wk: 'Weeks', yr: 'Years',
	'm/s': 'Metres per second', 'km/h': 'Kilometres per hour', mph: 'Miles per hour', kn: 'Knots', 'ft/s': 'Feet per second',
	'°C': 'Celsius', '°F': 'Fahrenheit', K: 'Kelvin'
};

// What people type → the unit's key. Matched lower-case.
const ALIASES = {
	millimeter: 'mm', millimetre: 'mm', centimeter: 'cm', centimetre: 'cm', meter: 'm', metre: 'm',
	kilometer: 'km', kilometre: 'km', inch: 'in', inches: 'in', '"': 'in', foot: 'ft', feet: 'ft', "'": 'ft',
	yard: 'yd', mile: 'mi', 'nautical mile': 'nmi',
	milligram: 'mg', gram: 'g', kilogram: 'kg', kilo: 'kg', tonne: 't', ounce: 'oz', pound: 'lb', lbs: 'lb', stone: 'st',
	milliliter: 'ml', millilitre: 'ml', liter: 'l', litre: 'l', teaspoon: 'tsp', tablespoon: 'tbsp',
	'fl oz': 'floz', 'fluid ounce': 'floz', pint: 'pt', quart: 'qt', gallon: 'gal',
	byte: 'B', kb: 'KB', kilobyte: 'KB', mb: 'MB', megabyte: 'MB', gb: 'GB', gigabyte: 'GB', tb: 'TB', terabyte: 'TB', pb: 'PB', petabyte: 'PB',
	kib: 'KiB', mib: 'MiB', gib: 'GiB', tib: 'TiB', kbps: 'kbit', mbps: 'Mbit', gbps: 'Gbit', kilobit: 'kbit', megabit: 'Mbit', gigabit: 'Gbit',
	millisecond: 'ms', sec: 's', second: 's', minute: 'min', mins: 'min', hr: 'h', hrs: 'h', hour: 'h', day: 'd', days: 'd', week: 'wk', weeks: 'wk', year: 'yr', yrs: 'yr',
	mps: 'm/s', kph: 'km/h', kmh: 'km/h', kmph: 'km/h', knot: 'kn', knots: 'kn', kt: 'kn', fps: 'ft/s',
	c: '°C', celsius: '°C', centigrade: '°C', f: '°F', fahrenheit: '°F', k: 'K', kelvin: 'K'
};

const LOOKUP = new Map();
for (const [group, units] of Object.entries(UNITS)) {
	for (const key of Object.keys(units)) LOOKUP.set(key.toLowerCase(), { key, group });
}
for (const [alias, key] of Object.entries(ALIASES)) {
	const group = Object.keys(UNITS).find((g) => key in UNITS[g]);
	LOOKUP.set(alias, { key, group });
}

// A lower-case b after a capital prefix is bits (Mb, Gb); all lower case
// ("mb") is read the casual way, as bytes.
const BITS = { b: 'bit', Kb: 'kbit', Mb: 'Mbit', Gb: 'Gbit' };

function findUnit(raw) {
	const s = raw.trim().replace(/°\s*/g, '').replace(/\s+/g, ' ');
	if (s in BITS) return { key: BITS[s], group: 'data' };
	const lower = s.toLowerCase();
	// Plurals: "miles", "litres", "hours".
	return LOOKUP.get(lower) || (lower.endsWith('s') ? LOOKUP.get(lower.slice(0, -1)) : undefined);
}

function toKelvin(v, unit) {
	return unit === '°C' ? v + 273.15 : unit === '°F' ? (v - 32) * 5 / 9 + 273.15 : v;
}
function fromKelvin(v, unit) {
	return unit === '°C' ? v - 273.15 : unit === '°F' ? (v - 273.15) * 9 / 5 + 32 : v;
}

export function convert(value, fromRaw, toRaw) {
	const from = findUnit(fromRaw);
	const to = findUnit(toRaw);
	if (!from || !to || from.group !== to.group) return null;
	const v = from.group === 'temperature'
		? fromKelvin(toKelvin(value, from.key), to.key)
		: value * UNITS[from.group][from.key] / UNITS[to.group][to.key];
	return { value: v, from: from.key, to: to.key };
}

function unitAnswer(q, locale) {
	const m = q.match(/^(-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*([a-z°'"/ ]+?)\s+(?:in|to|as|=|->|→)\s+([a-z°'"/ ]+)$/i);
	if (!m) return null;
	const amount = parseFloat(m[1]);
	const r = convert(amount, m[2], m[3]);
	if (!r || !Number.isFinite(r.value)) return null;
	const unit = (k) => (k.startsWith('°') || k === 'K' ? k : ` ${k}`);
	return {
		kind: 'unit',
		from: { value: `${formatNumber(amount, locale)}${unit(r.from)}`, label: NAMES[r.from] },
		to: { value: `${formatNumber(r.value, locale, 6)}${unit(r.to)}`, label: NAMES[r.to] },
		copy: plainNumber(r.value, 6)
	};
}

// ── Time zones ────────────────────────────────────────────────────
// "time in tokyo", "tokyo time", "3pm ist in london", "15:30 to new york",
// "ist to pst". Zones are IANA ids found by city, plus common abbreviations
// and a few countries and cities that have no id of their own. Abbreviations
// stand for the place, so "pst" in July reads PDT.

const ABBREVIATIONS = {
	utc: 'UTC', gmt: 'UTC', z: 'UTC',
	ist: 'Asia/Kolkata', pkt: 'Asia/Karachi', gst: 'Asia/Dubai', sgt: 'Asia/Singapore', hkt: 'Asia/Hong_Kong',
	jst: 'Asia/Tokyo', kst: 'Asia/Seoul', wib: 'Asia/Jakarta', msk: 'Europe/Moscow',
	wet: 'Europe/Lisbon', bst: 'Europe/London', cet: 'Europe/Paris', cest: 'Europe/Paris', eet: 'Europe/Athens', eest: 'Europe/Athens',
	et: 'America/New_York', est: 'America/New_York', edt: 'America/New_York',
	ct: 'America/Chicago', cst: 'America/Chicago', cdt: 'America/Chicago',
	mt: 'America/Denver', mst: 'America/Denver', mdt: 'America/Denver',
	pt: 'America/Los_Angeles', pst: 'America/Los_Angeles', pdt: 'America/Los_Angeles',
	akst: 'America/Anchorage', hst: 'Pacific/Honolulu',
	aest: 'Australia/Sydney', aedt: 'Australia/Sydney', acst: 'Australia/Adelaide', awst: 'Australia/Perth',
	nzst: 'Pacific/Auckland', nzdt: 'Pacific/Auckland'
};

const PLACES = {
	india: 'Asia/Kolkata', mumbai: 'Asia/Kolkata', delhi: 'Asia/Kolkata', 'new delhi': 'Asia/Kolkata', bangalore: 'Asia/Kolkata',
	bengaluru: 'Asia/Kolkata', chennai: 'Asia/Kolkata', hyderabad: 'Asia/Kolkata', pune: 'Asia/Kolkata', kolkata: 'Asia/Kolkata',
	uk: 'Europe/London', england: 'Europe/London', ireland: 'Europe/Dublin', france: 'Europe/Paris', germany: 'Europe/Berlin',
	munich: 'Europe/Berlin', frankfurt: 'Europe/Berlin', spain: 'Europe/Madrid', italy: 'Europe/Rome', netherlands: 'Europe/Amsterdam',
	japan: 'Asia/Tokyo', china: 'Asia/Shanghai', beijing: 'Asia/Shanghai', korea: 'Asia/Seoul', uae: 'Asia/Dubai', 'abu dhabi': 'Asia/Dubai',
	australia: 'Australia/Sydney', 'new zealand': 'Pacific/Auckland', brazil: 'America/Sao_Paulo', mexico: 'America/Mexico_City',
	nyc: 'America/New_York', 'new york city': 'America/New_York', boston: 'America/New_York', washington: 'America/New_York',
	'washington dc': 'America/New_York', miami: 'America/New_York', atlanta: 'America/New_York',
	dallas: 'America/Chicago', houston: 'America/Chicago', austin: 'America/Chicago',
	sf: 'America/Los_Angeles', 'san francisco': 'America/Los_Angeles', seattle: 'America/Los_Angeles', la: 'America/Los_Angeles',
	'silicon valley': 'America/Los_Angeles', 'san jose': 'America/Los_Angeles', montreal: 'America/Toronto', ottawa: 'America/Toronto',
	'local': null, 'here': null, 'my time': null
};

let cityIndex;
function cities() {
	if (cityIndex) return cityIndex;
	cityIndex = new Map();
	const ids = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
	for (const id of ids) {
		cityIndex.set(id.toLowerCase(), id);
		const city = id.split('/').pop().replace(/_/g, ' ').toLowerCase();
		if (!cityIndex.has(city)) cityIndex.set(city, id);
	}
	return cityIndex;
}

// → { id, label } or null. A null id is the browser's own zone.
function findZone(raw, local) {
	const s = raw.trim().toLowerCase().replace(/\s+/g, ' ').replace(/ time$/, '');
	if (!s) return null;
	if (s in PLACES) {
		const id = PLACES[s] || local;
		return { id, label: PLACES[s] ? titleCase(s) : cityOf(local) };
	}
	if (s in ABBREVIATIONS) return { id: ABBREVIATIONS[s], label: s.toUpperCase() };
	const id = cities().get(s);
	return id ? { id, label: cityOf(id) } : null;
}

const cityOf = (id) => (id === 'UTC' ? 'UTC' : id.split('/').pop().replace(/_/g, ' '));
const titleCase = (s) => (s.length <= 3 ? s.toUpperCase() : s.replace(/\b\w/g, (c) => c.toUpperCase()));

// The zone's wall-clock fields at an instant.
function wallClock(zone, t) {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric'
	}).formatToParts(new Date(t));
	const get = (type) => Number(parts.find((p) => p.type === type).value);
	return { y: get('year'), mo: get('month'), d: get('day'), h: get('hour'), mi: get('minute'), s: get('second') };
}

function offsetMinutes(zone, t) {
	const w = wallClock(zone, t);
	return Math.round((Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - Math.floor(t / 1000) * 1000) / 60000);
}

// The instant when it is h:mi on that date in the zone.
function zonedInstant(zone, y, mo, d, h, mi) {
	const guess = Date.UTC(y, mo - 1, d, h, mi);
	const first = guess - offsetMinutes(zone, guess) * 60000;
	return guess - offsetMinutes(zone, first) * 60000;
}

function parseClock(s) {
	const t = s.trim().toLowerCase();
	if (t === 'noon') return { h: 12, mi: 0 };
	if (t === 'midnight') return { h: 0, mi: 0 };
	const m = t.match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/);
	if (!m) return null;
	let h = Number(m[1]);
	const mi = Number(m[2] || 0);
	// A bare number ("3 in london") is too likely to be something else.
	if (!m[2] && !m[3]) return null;
	if (m[3]) {
		if (h < 1 || h > 12) return null;
		h = (h % 12) + (m[3].startsWith('p') ? 12 : 0);
	}
	return h < 24 && mi < 60 ? { h, mi } : null;
}

function timeAnswer(q, now, local, locale) {
	const s = q.toLowerCase().replace(/\s+/g, ' ');
	let m;
	// "time in tokyo", "now in utc", "tokyo time"
	if ((m = s.match(/^(?:what(?:'s| is) the )?(?:time|now)(?: in| at)? (.+?)\??$/)) || (m = s.match(/^(.+?) time$/))) {
		const zone = findZone(m[1], local);
		if (!zone) return null;
		return describe(now.getTime(), { id: local, label: cityOf(local) }, zone, now, locale, true);
	}
	// "3pm ist in london", "15:30 to new york", "ist to pst"
	m = s.match(/^(.+?) (?:in|to|->|→) (.+)$/);
	if (!m) return null;
	const to = findZone(m[2], local);
	if (!to) return null;
	const left = m[1].trim();
	const clockOnly = parseClock(left);
	if (clockOnly) return convertClock(clockOnly, { id: local, label: cityOf(local) }, to, now, locale);
	const split = left.match(/^(\S+(?: ?[ap]\.?m\.?)?) (.+)$/);
	if (split) {
		const clock = parseClock(split[1]);
		const from = findZone(split[2], local);
		if (clock && from) return convertClock(clock, from, to, now, locale);
	}
	const from = findZone(left, local);
	return from ? describe(now.getTime(), from, to, now, locale, true) : null;
}

function convertClock(clock, from, to, now, locale) {
	const today = wallClock(from.id, now.getTime());
	const t = zonedInstant(from.id, today.y, today.mo, today.d, clock.h, clock.mi);
	return describe(t, from, to, now, locale, false);
}

function describe(t, from, to, now, locale, isNow) {
	const time = (zone) => new Intl.DateTimeFormat(locale, { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(t);
	const day = (zone) => new Intl.DateTimeFormat(locale, { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short' }).format(t);
	const diff = offsetMinutes(to.id, t) - offsetMinutes(from.id, t);
	const fromDay = wallClock(from.id, t);
	const toDay = wallClock(to.id, t);
	const dayShift = Math.round((Date.UTC(toDay.y, toDay.mo - 1, toDay.d) - Date.UTC(fromDay.y, fromDay.mo - 1, fromDay.d)) / 86400000);
	const shift = dayShift > 0 ? ' (next day)' : dayShift < 0 ? ' (previous day)' : '';
	return {
		kind: 'time',
		from: { value: time(from.id), label: `${isNow ? 'Now in ' : ''}${from.label} · ${day(from.id)}` },
		to: { value: `${time(to.id)}${shift}`, label: `${to.label} · ${day(to.id)} · ${formatDiff(diff)}` },
		copy: `${time(to.id)} ${to.label}`
	};
}

function formatDiff(min) {
	if (min === 0) return 'same time';
	const a = Math.abs(min);
	const hm = `${Math.floor(a / 60)}h${a % 60 ? ` ${a % 60}m` : ''}`;
	return `${hm} ${min > 0 ? 'ahead' : 'behind'}`;
}

// ── Numbers ───────────────────────────────────────────────────────

function formatNumber(v, locale, digits = 12) {
	const a = Math.abs(v);
	if (a !== 0 && (a >= 1e15 || a < 1e-6)) return v.toPrecision(Math.min(digits, 10)).replace(/\.?0+e/, 'e');
	return new Intl.NumberFormat(locale, { maximumSignificantDigits: digits }).format(v);
}

function plainNumber(v, digits = 12) {
	return String(Number(v.toPrecision(digits)));
}
