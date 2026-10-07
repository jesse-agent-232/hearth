import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { readFileSync, writeFileSync, chmodSync, existsSync, mkdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { resolveDbPath } from './db.js';

// AES-256-GCM master key for encrypting per-user integration credentials.
//
// Resolution order:
//   1. process.env.HOLM_SECRET_KEY  — 32 bytes hex or base64. Production-grade.
//   2. .integrations-key next to the SQLite DB (DATABASE_PATH / database.path,
//      default ./data/) — 32 random bytes auto-generated on first boot,
//      chmod 0600. Frictionless for dev.
//
// Threat model: with the auto-generated file fallback, the key sits next to
// the SQLite DB. An attacker who exfiltrates the whole ./data/ directory has
// both the key and the ciphertext. Operators running production deployments
// should set HOLM_SECRET_KEY in the environment to keep the key out of the
// data directory entirely.

// Where the key file lived before it followed the DB. Read once so installs
// that moved DATABASE_PATH but also kept ./data/ don't lose their key.
const LEGACY_KEY_FILE_PATH = './data/.integrations-key';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12;  // 96 bits — recommended for GCM
const TAG_LENGTH = 16; // 128 bits

let _masterKey = null;

function decodeEnvKey(raw) {
	if (!raw) return null;
	// Try hex first (64 chars), then base64
	if (/^[0-9a-fA-F]{64}$/.test(raw.trim())) {
		return Buffer.from(raw.trim(), 'hex');
	}
	try {
		const buf = Buffer.from(raw.trim(), 'base64');
		if (buf.length === KEY_LENGTH) return buf;
	} catch { /* fall through */ }
	return null;
}

function loadOrGenerateKeyFile() {
	const keyPath = join(dirname(resolveDbPath()), '.integrations-key');
	if (existsSync(keyPath)) {
		const buf = readFileSync(keyPath);
		if (buf.length === KEY_LENGTH) return buf;
		console.warn(`[holm] ${keyPath} has unexpected length ${buf.length}, regenerating`);
	} else if (resolve(keyPath) !== resolve(LEGACY_KEY_FILE_PATH) && existsSync(LEGACY_KEY_FILE_PATH)) {
		const buf = readFileSync(LEGACY_KEY_FILE_PATH);
		if (buf.length === KEY_LENGTH) {
			writeKeyFile(keyPath, buf);
			console.log(`[holm] Copied integrations master key from ${LEGACY_KEY_FILE_PATH} to ${keyPath}`);
			return buf;
		}
	}
	const fresh = randomBytes(KEY_LENGTH);
	writeKeyFile(keyPath, fresh);
	console.log(`[holm] Generated new integrations master key at ${keyPath}`);
	return fresh;
}

function writeKeyFile(keyPath, buf) {
	mkdirSync(dirname(keyPath), { recursive: true });
	writeFileSync(keyPath, buf);
	try { chmodSync(keyPath, 0o600); } catch { /* best-effort on non-POSIX */ }
}

export function getMasterKey() {
	if (_masterKey) return _masterKey;

	const envKey = decodeEnvKey(process.env.HOLM_SECRET_KEY);
	if (envKey) {
		_masterKey = envKey;
		console.log('[holm] Integrations master key loaded from HOLM_SECRET_KEY env');
		return _masterKey;
	}

	// A set but unusable key is a mistake, not a request for the key file:
	// falling back would quietly encrypt with a key the operator never chose.
	if (process.env.HOLM_SECRET_KEY) {
		throw new Error('HOLM_SECRET_KEY is set but malformed: it must be 32 bytes as 64 hex characters or base64 (openssl rand -hex 32)');
	}

	_masterKey = loadOrGenerateKeyFile();
	return _masterKey;
}

/**
 * Encrypt a JSON-serializable object for a given (username, integrationId) pair.
 * AAD binds the ciphertext to that pair so blobs can't be swapped between rows.
 *
 * @param {string} username
 * @param {string} integrationId
 * @param {object} obj
 * @returns {string} base64(iv || authTag || ciphertext)
 */
export function encryptConfig(username, integrationId, obj) {
	const key = getMasterKey();
	const iv = randomBytes(IV_LENGTH);
	const aad = Buffer.from(`${username}:${integrationId}`, 'utf8');
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	cipher.setAAD(aad);
	const plaintext = Buffer.from(JSON.stringify(obj), 'utf8');
	const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
	const authTag = cipher.getAuthTag();
	return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

/**
 * Decrypt a blob produced by encryptConfig. Returns null on any failure
 * (wrong key, tampered ciphertext, AAD mismatch, malformed input).
 *
 * @param {string} username
 * @param {string} integrationId
 * @param {string} blob
 * @returns {object | null}
 */
export function decryptConfig(username, integrationId, blob) {
	if (!blob) return null;
	try {
		const key = getMasterKey();
		const buf = Buffer.from(blob, 'base64');
		if (buf.length < IV_LENGTH + TAG_LENGTH) return null;
		const iv = buf.subarray(0, IV_LENGTH);
		const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
		const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH);
		const aad = Buffer.from(`${username}:${integrationId}`, 'utf8');
		const decipher = createDecipheriv('aes-256-gcm', key, iv);
		decipher.setAAD(aad);
		decipher.setAuthTag(authTag);
		const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
		return JSON.parse(plaintext.toString('utf8'));
	} catch (err) {
		console.warn(`[holm] decryptConfig failed for ${username}/${integrationId}: ${err.message}`);
		return null;
	}
}
