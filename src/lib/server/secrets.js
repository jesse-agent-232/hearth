import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { readFileSync, writeFileSync, chmodSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

// AES-256-GCM master key for encrypting per-user integration credentials.
//
// Resolution order:
//   1. process.env.HOLM_SECRET_KEY  — 32 bytes hex or base64. Production-grade.
//   2. ./data/.integrations-key       — 32 random bytes auto-generated on first
//                                       boot, chmod 0600. Frictionless for dev.
//
// Threat model: with the auto-generated file fallback, the key sits next to
// the SQLite DB. An attacker who exfiltrates the whole ./data/ directory has
// both the key and the ciphertext. Operators running production deployments
// should set HOLM_SECRET_KEY in the environment to keep the key out of the
// data directory entirely.

const KEY_FILE_PATH = './data/.integrations-key';
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
	if (existsSync(KEY_FILE_PATH)) {
		const buf = readFileSync(KEY_FILE_PATH);
		if (buf.length === KEY_LENGTH) return buf;
		console.warn(`[holm] ${KEY_FILE_PATH} has unexpected length ${buf.length}, regenerating`);
	}
	mkdirSync(dirname(KEY_FILE_PATH), { recursive: true });
	const fresh = randomBytes(KEY_LENGTH);
	writeFileSync(KEY_FILE_PATH, fresh);
	try { chmodSync(KEY_FILE_PATH, 0o600); } catch { /* best-effort on non-POSIX */ }
	console.log(`[holm] Generated new integrations master key at ${KEY_FILE_PATH}`);
	return fresh;
}

export function getMasterKey() {
	if (_masterKey) return _masterKey;

	const envKey = decodeEnvKey(process.env.HOLM_SECRET_KEY);
	if (envKey) {
		_masterKey = envKey;
		console.log('[holm] Integrations master key loaded from HOLM_SECRET_KEY env');
		return _masterKey;
	}

	if (process.env.HOLM_SECRET_KEY) {
		console.warn('[holm] HOLM_SECRET_KEY is set but malformed (need 32 bytes hex or base64) — falling back to key file');
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
