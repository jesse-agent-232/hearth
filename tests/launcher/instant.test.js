// Unit tests for the search bar's instant answers: maths, unit
// conversions and times in other zones.
// Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instantAnswer, isCalculation, calculate, convert } from '../../src/lib/launcher/instant.js';

// 15:00 in Kolkata on a Monday; London is on BST, New York on EDT.
const opts = { now: new Date('2026-10-12T09:30:00Z'), timeZone: 'Asia/Kolkata', locale: 'en-US' };
const answer = (q) => instantAnswer(q, opts);

test('calculates with precedence, powers, brackets and functions', () => {
	assert.equal(calculate('12*(3+4)'), 84);
	assert.equal(calculate('2 + 3 * 4'), 14);
	assert.equal(calculate('2^3^2'), 512);
	assert.equal(calculate('-2^2'), -4);
	assert.equal(calculate('2 ** 10'), 1024);
	assert.equal(calculate('10 mod 3'), 1);
	assert.equal(calculate('50% * 20'), 10);
	assert.equal(calculate('2pi'), 2 * Math.PI);
	assert.equal(calculate('3(4+1)'), 15);
	assert.equal(calculate('sqrt 16 + 1'), 5);
	assert.equal(calculate('sin(pi/2)'), 1);
	assert.equal(calculate('6 × 7 ÷ 2'), 21);
});

test('rejects what is not a sum', () => {
	for (const q of ['1/0', '2 +', '(1+2', 'alert(1)', 'x = 2', '']) assert.equal(calculate(q), null, q);
});

test('only answers queries that have something to work out', () => {
	for (const q of ['42', '2024', 'hello', 'jellyfin', '2026-10-12', '1.2.3', '!theme dark', '2pi']) {
		assert.equal(answer(q), null, q);
	}
	const a = answer('0.1+0.2');
	assert.equal(a.kind, 'math');
	assert.equal(a.to.value, '0.3');
	assert.equal(answer('2^20').to.value, '1,048,576');
	assert.equal(answer('2^20').copy, '1048576');
	assert.equal(answer('10 mod 3').to.value, '1');
});

test('converts units within a group, and refuses across groups', () => {
	assert.equal(convert(5, 'km', 'mi').value.toFixed(5), '3.10686');
	assert.equal(convert(30, 'c', 'f').value, 86);
	assert.equal(convert(0, '°C', 'kelvin').value, 273.15);
	assert.equal(convert(1, 'GiB', 'mb').value, 1073.741824);
	assert.equal(convert(3, 'hours', 'minutes').value, 180);
	// Capital prefix + lower-case b is bits; all lower case is bytes.
	assert.equal(convert(100, 'Mb', 'MB').value, 12.5);
	assert.equal(convert(100, 'mb', 'MB').value, 100);
	assert.equal(convert(1, 'Tb', 'GB').value, 125);
	assert.equal(convert(8, 'b', 'B').value, 1);
	assert.equal(convert(1, 'ton', 'kg'), null);
	assert.equal(convert(5, 'km', 'kg'), null);
	assert.equal(convert(5, 'parsecs', 'km'), null);
});

test('unit answers show both sides with their names', () => {
	const a = answer('5 km in mi');
	assert.deepEqual([a.kind, a.from.value, a.from.label, a.to.value, a.to.label, a.copy], ['unit', '5 km', 'Kilometres', '3.10686 mi', 'Miles', '3.10686']);
	assert.equal(answer('100 F to C').to.value, '37.7778°C');
	assert.equal(answer('60 mph to km/h').to.value, '96.5606 km/h');
});

test('a bare quantity converts to the usual units on the other side, in one answer', () => {
	const all = (q) => {
		const a = answer(q);
		return a ? [a.to, ...(a.also || [])].map((r) => r.value) : [];
	};
	assert.deepEqual(all('5km'), ['3.10686 mi']);
	assert.deepEqual(all('5 km'), ['3.10686 mi']);
	assert.deepEqual(all('2ft'), ['24 in', '60.96 cm']);
	assert.deepEqual(all('72f'), ['22.2222°C']);
	assert.deepEqual(all('72°F'), ['22.2222°C']);
	assert.deepEqual(all('30c'), ['86°F']);
	assert.deepEqual(all('10 lbs'), ['4.53592 kg']);
	assert.deepEqual(all('100 km/h'), ['62.1371 mph']);
	const two = answer('2ft');
	assert.equal(two.kind, 'unit');
	assert.deepEqual([two.copy, two.also[0].copy, two.also[0].label], ['24', '60.96', 'Centimetres']);
	// No usual other side, or more likely something else.
	for (const q of ['5k', '5g', '4 GB', '30 min', '5 parsecs', 'km', '5']) assert.deepEqual(all(q), [], q);
	// An explicit target gives just that one.
	assert.deepEqual(all('2 ft in m'), ['0.6096 m']);
	assert.equal(answer('2 ft in m').also, undefined);
});

test('tells the time elsewhere', () => {
	for (const q of ['time in tokyo', 'tokyo time', 'now in tokyo']) {
		const a = answer(q);
		assert.equal(a.kind, 'time', q);
		assert.equal(a.to.value, '6:30 PM', q);
		assert.match(a.to.label, /^Tokyo · .* · 3h 30m ahead$/, q);
	}
});

test('converts a time between zones', () => {
	const a = answer('3pm ist in london');
	assert.equal(a.from.value, '3:00 PM');
	assert.equal(a.to.value, '10:30 AM');
	assert.match(a.to.label, /4h 30m behind/);
	assert.equal(a.copy, '10:30 AM London');
	// A bare time starts from the browser's own zone.
	assert.equal(answer('11pm in new york').to.value, '1:30 PM');
	assert.equal(answer('15:30 to utc').to.value, '10:00 AM');
	// Crossing midnight says so.
	assert.equal(answer('9am in los angeles').to.value, '8:30 PM (previous day)');
	// Two zones with no time compare them now.
	assert.equal(answer('ist to pst').to.value, '2:30 AM');
});

test('leaves ambiguous time-like queries alone', () => {
	for (const q of ['3 in london', 'time in narnia', 'meeting to london']) assert.equal(answer(q), null, q);
});

test('a calculation skips the app searches; numbers, dates and titles do not', () => {
	for (const q of ['12 * 7', '(250000*0.6%)/(1-(1+0.6%)^-240)', '(250000*0.65', '2+', '5 km in mi', '50%']) assert.equal(isCalculation(q, opts), true, q);
	for (const q of ['1917', '300', '2024', '28 days later', '2024-10-16', '1.2.3', 'spider', '3pm in london', '']) assert.equal(isCalculation(q, opts), false, q);
});
