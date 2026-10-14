// Unit tests for the clock and temperature units chosen under
// Configure → Widgets.
// Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uses12Hour, usesFahrenheit, temperature, formatClock } from '../src/lib/units.js';

const evening = new Date(2026, 9, 14, 16, 5);
const morning = new Date(2026, 9, 14, 9, 5);

test('the clock is 24-hour unless the user picks otherwise', () => {
	assert.equal(formatClock(evening, undefined, 'en-US'), '16:05');
	assert.equal(formatClock(morning, '24h', 'en-US'), '09:05');
	assert.equal(formatClock(evening, '12h', 'en-GB').replace(/\s/g, ' ').toUpperCase(), '4:05 PM');
});

test('auto follows the locale', () => {
	assert.equal(uses12Hour('auto', 'en-US'), true);
	assert.equal(uses12Hour('auto', 'de-DE'), false);
	assert.equal(formatClock(evening, 'auto', 'de-DE'), '16:05');
});

test('temperatures are Celsius unless the user picks otherwise', () => {
	assert.equal(temperature(21.4, undefined, 'en-US'), 21);
	assert.equal(temperature(21.4, 'f', 'de-DE'), 71);
	assert.equal(temperature(-40, 'f'), -40);
});

test('auto uses Fahrenheit only where it is the everyday unit', () => {
	assert.equal(usesFahrenheit('auto', 'en-US'), true);
	assert.equal(usesFahrenheit('auto', 'en'), true);
	assert.equal(usesFahrenheit('auto', 'en-GB'), false);
	assert.equal(usesFahrenheit('auto', 'en-IN'), false);
	assert.equal(usesFahrenheit('auto', 'not a locale'), false);
});
