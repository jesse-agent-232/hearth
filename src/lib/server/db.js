import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { getConfig } from './config.js';

let db = null;
let dbPath = null;
let initPromise = null;

// Serializes async read-modify-write sequences (e.g. mergeUserPrefs) so two
// concurrent requests on the same key can't lose updates at await boundaries.
// sql.js itself is synchronous in-memory, so single-statement ops don't need
// this — only compositions that await between a read and a write do.
let writeLock = Promise.resolve();
function withLock(fn) {
	const run = writeLock.then(() => fn());
	// Don't poison the chain if fn throws.
	writeLock = run.catch(() => {});
	return run;
}

function saveToDisk() {
	if (!db || !dbPath) return;
	try {
		const data = db.export();
		// Atomic write: dump to a sibling temp file, then rename over the target.
		// Rename is atomic on POSIX within the same filesystem, so a crash
		// mid-write leaves the old DB intact instead of a truncated file.
		const tmpPath = `${dbPath}.tmp`;
		writeFileSync(tmpPath, Buffer.from(data));
		renameSync(tmpPath, dbPath);
	} catch (err) {
		console.error('[holm] Failed to save database:', err.message);
	}
}

async function ensureInit() {
	if (db === false) return; // disabled
	if (db) return; // already initialized
	if (initPromise) return initPromise; // initialization in progress

	initPromise = (async () => {
		const config = getConfig();
		const dbConfig = config.database || {};

		if (dbConfig.enabled === false) {
			db = false;
			console.log('[holm] Database disabled in config — using localStorage-only mode');
			return;
		}

		try {
			dbPath = process.env.DATABASE_PATH || dbConfig.path || './data/holm.db';
			mkdirSync(dirname(dbPath), { recursive: true });

			const SQL = await initSqlJs();

			// Load existing database file or create new
			if (existsSync(dbPath)) {
				const fileBuffer = readFileSync(dbPath);
				db = new SQL.Database(fileBuffer);
			} else {
				db = new SQL.Database();
			}

			db.run(`
			  CREATE TABLE IF NOT EXISTS user_prefs (
			    username     TEXT PRIMARY KEY,
			    prefs_json   TEXT NOT NULL DEFAULT '{}',
			    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
			  );

			  CREATE TABLE IF NOT EXISTS admin_apps (
			    id           TEXT PRIMARY KEY,
			    name         TEXT NOT NULL,
			    url          TEXT NOT NULL,
			    icon         TEXT,
			    category     TEXT NOT NULL DEFAULT 'Custom',
			    internal     INTEGER NOT NULL DEFAULT 0,
			    sort_order   INTEGER NOT NULL DEFAULT 0,
			    added_by     TEXT NOT NULL,
			    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
			  );

			  CREATE TABLE IF NOT EXISTS user_integrations (
			    username       TEXT NOT NULL,
			    integration_id TEXT NOT NULL,
			    config_blob    TEXT NOT NULL DEFAULT '',
			    surfaces_json  TEXT NOT NULL DEFAULT '{}',
			    updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
			    PRIMARY KEY (username, integration_id)
			  );
			`);

			saveToDisk();
			console.log('[holm] SQLite database initialized (sql.js)');
		} catch (err) {
			db = false;
			console.log('[holm] SQLite failed to initialize:', err.message);
		}
	})();

	return initPromise;
}

// Helper: run a SELECT and return rows as objects
function queryAll(sql, params = []) {
	const stmt = db.prepare(sql);
	if (params.length) stmt.bind(params);
	const rows = [];
	while (stmt.step()) {
		rows.push(stmt.getAsObject());
	}
	stmt.free();
	return rows;
}

function queryOne(sql, params = []) {
	const stmt = db.prepare(sql);
	if (params.length) stmt.bind(params);
	const row = stmt.step() ? stmt.getAsObject() : null;
	stmt.free();
	return row;
}

export async function getUserPrefs(username) {
	await ensureInit();
	if (!db) return {};
	const row = queryOne('SELECT prefs_json FROM user_prefs WHERE username = ?', [username]);
	if (!row) return {};
	try { return JSON.parse(row.prefs_json); }
	catch { return {}; }
}

export async function upsertUserPrefs(username, prefs) {
	await ensureInit();
	if (!db) return;
	db.run(
		`INSERT INTO user_prefs (username, prefs_json, updated_at)
		 VALUES (?, ?, datetime('now'))
		 ON CONFLICT(username) DO UPDATE SET prefs_json = excluded.prefs_json, updated_at = datetime('now')`,
		[username, JSON.stringify(prefs)]
	);
	saveToDisk();
}

export async function mergeUserPrefs(username, partial) {
	await ensureInit();
	if (!db) return partial;
	// Hold the lock across read+merge+write. Everything inside the callback is
	// synchronous (no awaits), so no other request can interleave once we're in.
	return withLock(() => {
		const row = queryOne('SELECT prefs_json FROM user_prefs WHERE username = ?', [username]);
		let existing = {};
		if (row) {
			try { existing = JSON.parse(row.prefs_json); } catch {}
		}
		const merged = { ...existing, ...partial };
		db.run(
			`INSERT INTO user_prefs (username, prefs_json, updated_at)
			 VALUES (?, ?, datetime('now'))
			 ON CONFLICT(username) DO UPDATE SET prefs_json = excluded.prefs_json, updated_at = datetime('now')`,
			[username, JSON.stringify(merged)]
		);
		saveToDisk();
		return merged;
	});
}

export async function getAdminApps() {
	await ensureInit();
	if (!db) return [];
	return queryAll('SELECT * FROM admin_apps ORDER BY sort_order, created_at').map(row => ({
		id: row.id,
		name: row.name,
		url: row.url,
		icon: row.icon,
		category: row.category,
		self_hosted: !!row.internal,
		sort_order: row.sort_order,
		added_by: row.added_by
	}));
}

export async function addAdminApp(app, addedBy) {
	await ensureInit();
	if (!db) return;
	const maxRow = queryOne('SELECT COALESCE(MAX(sort_order), 0) as max_order FROM admin_apps');
	const maxOrder = maxRow?.max_order || 0;
	db.run(
		`INSERT INTO admin_apps (id, name, url, icon, category, internal, sort_order, added_by)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			app.id || crypto.randomUUID(),
			app.name,
			app.url,
			app.icon || null,
			app.category || 'Custom',
			app.self_hosted ? 1 : 0,
			maxOrder + 1,
			addedBy
		]
	);
	saveToDisk();
}

export async function removeAdminApp(id) {
	await ensureInit();
	if (!db) return false;
	db.run('DELETE FROM admin_apps WHERE id = ?', [id]);
	// getRowsModified() returns the row count from the MOST RECENT
	// INSERT/UPDATE/DELETE — it's not a monotonic counter you can diff against
	// an earlier sample, so check directly against 0.
	const changed = db.getRowsModified() > 0;
	if (changed) saveToDisk();
	return changed;
}

// ─── Integrations (raw rows; encryption handled in store.js) ───────────────

export async function getIntegrationRow(username, integrationId) {
	await ensureInit();
	if (!db) return null;
	return queryOne(
		'SELECT username, integration_id, config_blob, surfaces_json, updated_at FROM user_integrations WHERE username = ? AND integration_id = ?',
		[username, integrationId]
	);
}

export async function listIntegrationRows(username) {
	await ensureInit();
	if (!db) return [];
	return queryAll(
		'SELECT username, integration_id, config_blob, surfaces_json, updated_at FROM user_integrations WHERE username = ?',
		[username]
	);
}

export async function upsertIntegrationRow(username, integrationId, configBlob, surfacesJson) {
	await ensureInit();
	if (!db) return;
	db.run(
		`INSERT INTO user_integrations (username, integration_id, config_blob, surfaces_json, updated_at)
		 VALUES (?, ?, ?, ?, datetime('now'))
		 ON CONFLICT(username, integration_id) DO UPDATE SET
		   config_blob   = excluded.config_blob,
		   surfaces_json = excluded.surfaces_json,
		   updated_at    = datetime('now')`,
		[username, integrationId, configBlob, surfacesJson]
	);
	saveToDisk();
}

export async function deleteIntegrationRow(username, integrationId) {
	await ensureInit();
	if (!db) return false;
	const before = db.getRowsModified();
	db.run('DELETE FROM user_integrations WHERE username = ? AND integration_id = ?', [username, integrationId]);
	const changed = db.getRowsModified() > before;
	if (changed) saveToDisk();
	return changed;
}

export async function isDatabaseEnabled() {
	await ensureInit();
	return !!db;
}
