// Unit tests for how the search bar orders provider rows and folds
// video results into the Movies & TV shelf.
// Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arrangeProviderSections } from '../../src/lib/launcher/sections.js';

const section = (id, kind, items, extra = {}) => ({ id, label: id, layout: 'poster', kind, loading: false, skeleton: 0, error: '', items, ...extra });
const title = (key, tmdb, extra = {}) => ({ key, tmdb, showDetail: () => {}, ...extra });

test('one video provider keeps its own row', () => {
	const out = arrangeProviderSections([section('p-jellyfin', 'media', [title('a', 'movie:1')], { shelf: 'video' })]);
	assert.deepEqual(out.map((s) => s.id), ['p-jellyfin']);
});

test('video providers share one shelf: playable first, then requestable, then requested, deduped', () => {
	const out = arrangeProviderSections([
		section('p-docs', 'document', [{ key: 'd' }]),
		section('p-seerr', 'media', [title('s1', 'movie:1'), title('s2', 'movie:2', { request: { done: true } }), title('s3', 'movie:3')], { shelf: 'video' }),
		section('p-plex', 'media', [title('x1', 'movie:1', { play: {} }), { key: 'album', showDetail: null }], { shelf: 'video' })
	]);
	assert.deepEqual(out.map((s) => s.id), ['p-media', 'p-plex', 'p-docs']);
	assert.deepEqual(out[0].items.map((i) => i.key), ['x1', 's3', 's2']);
	// What's left of Plex (no detail view) stays, as tracks.
	assert.equal(out[1].layout, 'tracks');
	assert.deepEqual(out[1].items.map((i) => i.key), ['album']);
});

test('sections without a shelf are only ordered by kind', () => {
	const out = arrangeProviderSections([section('photo', 'photo', []), section('nav', 'media', [], { layout: 'tracks' }), section('x', 'other', [])]);
	assert.deepEqual(out.map((s) => s.id), ['nav', 'photo', 'x']);
});
