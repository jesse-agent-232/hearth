// Replaces ${VAR} with its environment value. An unset or empty variable
// is an error naming every one, not a silent "": an OIDC secret or URL that
// quietly became empty is worse than not starting.
export function substituteEnvVars(obj, env = process.env, missing = new Set(), top = true) {
	let out;
	if (typeof obj === 'string') {
		out = obj.replace(/\$\{(\w+)\}/g, (_, key) => {
			if (!env[key]) missing.add(key);
			return env[key] || '';
		});
	} else if (Array.isArray(obj)) {
		out = obj.map((v) => substituteEnvVars(v, env, missing, false));
	} else if (obj && typeof obj === 'object') {
		out = Object.fromEntries(
			Object.entries(obj).map(([k, v]) => [k, substituteEnvVars(v, env, missing, false)])
		);
	} else {
		out = obj;
	}
	if (top && missing.size) {
		throw new Error(`config uses unset environment variable(s): ${[...missing].join(', ')}`);
	}
	return out;
}
