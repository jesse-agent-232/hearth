// Who may show Holm in a frame. Off by default: every page answers
// X-Frame-Options: DENY and CSP frame-ancestors 'none'. An operator can list
// origins (security.frame_ancestors in config.yml), e.g. a dashboard such as
// Dynacat that embeds Holm in an iframe.

// A scheme and host, an optional port, and nothing else. `*.` is allowed at
// the start of the host, as CSP allows it. Anything with a path, quote, space
// or semicolon is rejected, so it can't add to or end the CSP directive.
const ORIGIN = /^https?:\/\/(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)*(:\d{1,5})?$/i;

// The origins from config that are valid, and the ones that aren't.
export function parseFrameAncestors(value) {
	const list = Array.isArray(value) ? value : value == null ? [] : [value];
	const allowed = [];
	const invalid = [];
	for (const entry of list) {
		const origin = typeof entry === 'string' ? entry.trim().replace(/\/$/, '') : '';
		if (ORIGIN.test(origin)) allowed.push(origin);
		else invalid.push(entry);
	}
	return { allowed, invalid };
}

// Rewrites a response's framing headers for the allowed origins. With none,
// it leaves the default block in place. With some, X-Frame-Options goes (it
// can't name an origin), so every response needs the CSP directive instead:
// replaced in the page CSP, added to a route's own CSP (icons, the
// integration proxy), or the whole CSP when there is none (the JSON API).
export function allowFraming(headers, allowed) {
	if (!allowed.length) return;
	headers.delete('x-frame-options');
	const directive = `frame-ancestors 'self' ${allowed.join(' ')}`;
	const csp = headers.get('content-security-policy');
	if (!csp) headers.set('content-security-policy', directive);
	else if (/frame-ancestors/.test(csp)) headers.set('content-security-policy', csp.replace(/frame-ancestors[^;]*/, directive));
	else headers.set('content-security-policy', `${csp.replace(/;\s*$/, '')}; ${directive}`);
}
