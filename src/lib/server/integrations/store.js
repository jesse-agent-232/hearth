import {
	getIntegrationRow,
	listIntegrationRows,
	upsertIntegrationRow,
	deleteIntegrationRow
} from '../db.js';
import { encryptConfig, decryptConfig } from '../secrets.js';
import { getAdapter, getOperatorDefaults } from './index.js';
import { applyOperatorUrls } from './urlPolicy.js';

// Wraps user_integrations row access with transparent encryption / decryption.
// Callers always deal in plain JS objects; the encrypted blob never leaves
// this module.

function parseSurfaces(json) {
	if (!json) return {};
	try {
		const obj = JSON.parse(json);
		return obj && typeof obj === 'object' ? obj : {};
	} catch {
		return {};
	}
}

function rowToConnection(row) {
	if (!row) return null;
	const config = row.config_blob
		? decryptConfig(row.username, row.integration_id, row.config_blob)
		: null;
	return {
		integrationId: row.integration_id,
		connected: !!config,
		// The operator's URL wins over one saved before it was pinned.
		config: config ? applyOperatorUrls(getAdapter(row.integration_id), getOperatorDefaults(row.integration_id), config) : {},
		surfaces: parseSurfaces(row.surfaces_json),
		updatedAt: row.updated_at
	};
}

export async function getConnection(username, integrationId) {
	const row = await getIntegrationRow(username, integrationId);
	return rowToConnection(row);
}

export async function listConnections(username) {
	const rows = await listIntegrationRows(username);
	return rows.map(rowToConnection);
}

export async function upsertConnection(username, integrationId, { config, surfaces }) {
	const blob = config && Object.keys(config).length > 0
		? encryptConfig(username, integrationId, config)
		: '';
	const surfacesJson = JSON.stringify(surfaces || {});
	await upsertIntegrationRow(username, integrationId, blob, surfacesJson);
}

export async function deleteConnection(username, integrationId) {
	return await deleteIntegrationRow(username, integrationId);
}
