// Unit tests for src/lib/widgets/layout.js — pure JS, no DOM, no SvelteKit.
// Run: node --test tests/widgets/layout.test.js
//
// These cover the migration helpers + position math that determine
// first-load-after-deploy correctness. Highest-value tests in the rewrite.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	defaultWidgetLayout,
	synthesizeFromLegacyPrefs,
	findFreeSlot,
	clamp,
	updateLayoutPositions,
	updateInstanceConfig,
	addInstance,
	addAppInstance,
	removeInstance,
	findAppInstance
} from '../../src/lib/widgets/layout.js';

import { WIDGET_TYPES } from '../../src/lib/widgets/registry.js';

// Stub registry — keeps tests independent of registry.js's identity (registry.js
// has no Svelte/DOM imports for the `app` type, so we could import it directly,
// but stubbing future-proofs us once aggregator widgets land).
const stubRegistry = {
	[WIDGET_TYPES.APP]: {
		type: WIDGET_TYPES.APP,
		displayName: 'App',
		defaultSize: { w: 1, h: 1 },
		minSize: { w: 1, h: 1 },
		maxSize: { w: 3, h: 3 },
		defaultConfig: { appId: null }
	}
};

const sampleCatalog = [
	{ id: 'photos', name: 'Photos', default: true, selfHosted: true },
	{ id: 'cloud', name: 'Cloud', default: true, selfHosted: true },
	{ id: 'vault', name: 'Vault', default: false, selfHosted: true }
];

test('defaultWidgetLayout seeds one app tile per default-visible app', () => {
	const layout = defaultWidgetLayout(sampleCatalog, stubRegistry);
	assert.equal(layout.length, 2); // photos + cloud (vault is default:false)
	for (const inst of layout) {
		assert.equal(inst.type, WIDGET_TYPES.APP);
		assert.equal(inst.w, 1);
		assert.equal(inst.h, 1);
		assert.ok(inst.config.appId);
	}
	// Unique instanceIds
	const ids = new Set(layout.map((i) => i.instanceId));
	assert.equal(ids.size, layout.length);
});

test('synthesizeFromLegacyPrefs preserves categoryLayout ordering', () => {
	const legacy = {
		categoryLayout: [
			{ id: 'social', label: 'Social', appIds: ['cloud'] },
			{ id: 'storage', label: 'Storage', appIds: ['photos', 'vault'] }
		]
	};
	const layout = synthesizeFromLegacyPrefs(legacy, sampleCatalog, stubRegistry);
	const appIds = layout.map((i) => i.config.appId);
	assert.deepEqual(appIds, ['cloud', 'photos', 'vault']);
});

test('synthesizeFromLegacyPrefs falls back to defaults when nothing legacy is present', () => {
	const layout = synthesizeFromLegacyPrefs({}, sampleCatalog, stubRegistry);
	// No legacy → fall back to defaultWidgetLayout (photos + cloud)
	assert.equal(layout.length, 2);
});

test('synthesizeFromLegacyPrefs picks up visibleApps when categoryLayout is empty', () => {
	const legacy = { visibleApps: ['vault', 'photos'] };
	const layout = synthesizeFromLegacyPrefs(legacy, sampleCatalog, stubRegistry);
	const appIds = layout.map((i) => i.config.appId);
	assert.deepEqual(appIds, ['vault', 'photos']);
});

test('synthesizeFromLegacyPrefs drops apps missing from the catalog', () => {
	const legacy = {
		categoryLayout: [{ id: 'tools', label: 'Tools', appIds: ['arr-only', 'photos'] }]
	};
	const layout = synthesizeFromLegacyPrefs(legacy, sampleCatalog, stubRegistry);
	const appIds = layout.map((i) => i.config.appId);
	assert.deepEqual(appIds, ['photos']);
});

test('synthesizeFromLegacyPrefs deduplicates appIds across sources', () => {
	const legacy = {
		categoryLayout: [{ id: 'storage', label: 'Storage', appIds: ['photos'] }],
		visibleApps: ['photos', 'cloud']
	};
	const layout = synthesizeFromLegacyPrefs(legacy, sampleCatalog, stubRegistry);
	const appIds = layout.map((i) => i.config.appId);
	assert.deepEqual(appIds, ['photos', 'cloud']);
});

test('findFreeSlot picks (0,0) on empty layout', () => {
	assert.deepEqual(findFreeSlot([], 1, 1), { x: 0, y: 0 });
});

test('findFreeSlot avoids overlap', () => {
	const layout = [
		{ instanceId: 'a', type: WIDGET_TYPES.APP, x: 0, y: 0, w: 1, h: 1, config: {} }
	];
	assert.deepEqual(findFreeSlot(layout, 1, 1), { x: 1, y: 0 });
});

test('findFreeSlot wraps to next row when current row is full', () => {
	const layout = [];
	for (let x = 0; x < 12; x++) {
		layout.push({ instanceId: 'a' + x, type: WIDGET_TYPES.APP, x, y: 0, w: 1, h: 1, config: {} });
	}
	assert.deepEqual(findFreeSlot(layout, 1, 1), { x: 0, y: 1 });
});

test('clamp respects registry min/max sizes', () => {
	const entry = stubRegistry[WIDGET_TYPES.APP];
	const oversize = { instanceId: 'x', type: WIDGET_TYPES.APP, x: 0, y: 0, w: 99, h: 99, config: {} };
	const c = clamp(oversize, entry);
	assert.equal(c.w, entry.maxSize.w);
	assert.equal(c.h, entry.maxSize.h);
});

test('clamp keeps x within grid bounds', () => {
	const entry = stubRegistry[WIDGET_TYPES.APP];
	const offgrid = { instanceId: 'x', type: WIDGET_TYPES.APP, x: 15, y: 0, w: 1, h: 1, config: {} };
	const c = clamp(offgrid, entry);
	assert.ok(c.x + c.w <= 12);
});

test('updateLayoutPositions patches matched instances immutably', () => {
	const layout = [
		{ instanceId: 'a', type: WIDGET_TYPES.APP, x: 0, y: 0, w: 1, h: 1, config: {} },
		{ instanceId: 'b', type: WIDGET_TYPES.APP, x: 1, y: 0, w: 1, h: 1, config: {} }
	];
	const next = updateLayoutPositions(layout, [{ instanceId: 'a', x: 5, y: 0, w: 1, h: 1 }]);
	assert.equal(next[0].x, 5);
	assert.equal(next[1].x, 1); // untouched
	assert.equal(layout[0].x, 0); // original not mutated
});

test('updateInstanceConfig merges per-instance config', () => {
	const layout = [
		{
			instanceId: 'a',
			type: WIDGET_TYPES.APP,
			x: 0,
			y: 0,
			w: 1,
			h: 1,
			config: { appId: 'photos' }
		}
	];
	const next = updateInstanceConfig(layout, 'a', { appId: 'cloud' });
	assert.equal(next[0].config.appId, 'cloud');
	assert.equal(layout[0].config.appId, 'photos'); // original not mutated
});

test('addAppInstance places a new app tile in the first free slot', () => {
	const layout = [
		{ instanceId: 'a', type: WIDGET_TYPES.APP, x: 0, y: 0, w: 1, h: 1, config: { appId: 'photos' } }
	];
	const next = addAppInstance(layout, 'cloud', stubRegistry);
	assert.equal(next.length, 2);
	assert.equal(next[1].config.appId, 'cloud');
	assert.equal(next[1].x, 1);
	assert.equal(next[1].y, 0);
});

test('addInstance throws on unknown type', () => {
	assert.throws(() => addInstance([], 'unknown-widget', stubRegistry));
});

test('removeInstance drops the matching instance', () => {
	const layout = [
		{ instanceId: 'a', type: WIDGET_TYPES.APP, x: 0, y: 0, w: 1, h: 1, config: { appId: 'photos' } },
		{ instanceId: 'b', type: WIDGET_TYPES.APP, x: 1, y: 0, w: 1, h: 1, config: { appId: 'cloud' } }
	];
	const next = removeInstance(layout, 'a');
	assert.equal(next.length, 1);
	assert.equal(next[0].instanceId, 'b');
});

test('findAppInstance returns the matching tile or null', () => {
	const layout = [
		{ instanceId: 'a', type: WIDGET_TYPES.APP, x: 0, y: 0, w: 1, h: 1, config: { appId: 'photos' } }
	];
	assert.equal(findAppInstance(layout, 'photos').instanceId, 'a');
	assert.equal(findAppInstance(layout, 'cloud'), null);
	assert.equal(findAppInstance(null, 'photos'), null);
});
