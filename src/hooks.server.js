// Response headers for every request. The Content-Security-Policy itself is
// in svelte.config.js, where SvelteKit can add per-page nonces to it.
const SECURITY_HEADERS = {
	'x-frame-options': 'DENY',
	'x-content-type-options': 'nosniff',
	'referrer-policy': 'strict-origin-when-cross-origin'
};

export async function handle({ event, resolve }) {
	let response = await resolve(event);
	try {
		addHeaders(response.headers);
	} catch {
		// A response passed straight through from fetch() has immutable headers.
		response = new Response(response.body, response);
		addHeaders(response.headers);
	}
	return response;
}

function addHeaders(headers) {
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
		if (!headers.has(name)) headers.set(name, value);
	}
}
