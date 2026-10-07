import { getClientConfig, getAuth } from '$lib/server/config.js';
import { getSessionUser } from '$lib/server/session.js';

export async function load({ cookies, url }) {
	const authConfig = getAuth();
	const user = getSessionUser(cookies, url);
	const authenticated = !authConfig.enabled || !!user;
	return {
		config: await getClientConfig({ authenticated, user })
	};
}
