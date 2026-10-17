// Unit tests for where the search bar opens, chosen under
// Configure → Widgets → Search with config.yml's search.on_focus as the default.
// Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchOnFocus, searchOnFocusError } from '../src/lib/searchOnFocus.js';

test("a person's pick wins over the config default", () => {
	assert.equal(searchOnFocus('in_place', 'top'), 'in_place');
	assert.equal(searchOnFocus('top', 'in_place'), 'top');
});

test('with no pick, the config default applies', () => {
	assert.equal(searchOnFocus(undefined, 'in_place'), 'in_place');
	assert.equal(searchOnFocus(undefined, 'top'), 'top');
});

test('with neither, the bar opens at the top', () => {
	assert.equal(searchOnFocus(undefined, undefined), 'top');
});

test('an unknown saved pick falls through to the config default', () => {
	assert.equal(searchOnFocus('sideways', 'in_place'), 'in_place');
});

test('search.on_focus accepts top, in_place or nothing', () => {
	assert.equal(searchOnFocusError(undefined), null);
	assert.equal(searchOnFocusError({}), null);
	assert.equal(searchOnFocusError({ on_focus: 'top' }), null);
	assert.equal(searchOnFocusError({ on_focus: 'in_place' }), null);
});

test('any other search.on_focus is rejected with the reason', () => {
	for (const value of ['bottom', 'In place', 'inplace', '', true, 1, null]) {
		assert.match(searchOnFocusError({ on_focus: value }), /^search\.on_focus must be top or in_place, not /);
	}
	assert.equal(searchOnFocusError({ on_focus: 'bottom' }), 'search.on_focus must be top or in_place, not "bottom"');
});
