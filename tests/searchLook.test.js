// Unit tests for the search bar's Transparency and Tips, chosen under
// Configure → Widgets → Search with config.yml's search.transparency and
// search.tips as the defaults.
// Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchTransparency, searchGlassLevel, searchTips, searchLookError } from '../src/lib/searchLook.js';

test("a person's transparency wins over the config default", () => {
	assert.equal(searchTransparency('theme', 'solid'), 'theme');
	assert.equal(searchTransparency('solid', 'theme'), 'solid');
});

test('with no transparency pick, the config default applies, else theme', () => {
	assert.equal(searchTransparency(undefined, 'solid'), 'solid');
	assert.equal(searchTransparency(undefined, undefined), 'theme');
	assert.equal(searchTransparency('clear', undefined), 'theme');
	assert.equal(searchTransparency('misty', 'solid'), 'solid');
});

test("theme follows the page's glass; solid ignores it", () => {
	assert.equal(searchGlassLevel('theme', 'clear'), 'clear');
	assert.equal(searchGlassLevel('theme', undefined), 'frosted');
	assert.equal(searchGlassLevel('solid', 'clear'), 'solid');
});

test("a person's tips pick wins over the config default", () => {
	assert.equal(searchTips('off', true), 'off');
	assert.equal(searchTips('on', false), 'on');
});

test('with no tips pick, config true / false applies, else on', () => {
	assert.equal(searchTips(undefined, false), 'off');
	assert.equal(searchTips(undefined, true), 'on');
	assert.equal(searchTips(undefined, undefined), 'on');
	assert.equal(searchTips('maybe', false), 'off');
});

test('valid or missing search.transparency and search.tips are accepted', () => {
	assert.equal(searchLookError(undefined), null);
	assert.equal(searchLookError({}), null);
	for (const transparency of ['theme', 'solid']) {
		assert.equal(searchLookError({ transparency }), null);
	}
	assert.equal(searchLookError({ tips: false }), null);
	assert.equal(searchLookError({ tips: true }), null);
});

test('any other value is rejected with the reason', () => {
	assert.equal(
		searchLookError({ transparency: 'glass' }),
		'search.transparency must be theme or solid, not "glass"'
	);
	for (const transparency of ['page', 'clear', 'frosted', 'Solid', '', null, 1, true]) {
		assert.match(searchLookError({ transparency }), /^search\.transparency must be /);
	}
	assert.equal(searchLookError({ tips: 'off' }), 'search.tips must be true or false, not "off"');
	assert.match(searchLookError({ tips: null }), /^search\.tips must be true or false/);
});
