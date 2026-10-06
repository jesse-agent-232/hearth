import { getBranding } from '$lib/server/config.js';

const esc = (s) => String(s).replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Lets browsers add Holm as a search engine: a query lands on the
// dashboard with the launcher open and pre-filled (?q=). Chrome adds it
// inactive; it has to be switched on under Settings → Search engine.
export function GET({ url }) {
	const branding = getBranding();
	const name = branding.name || 'Holm';
	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/" xmlns:moz="http://www.mozilla.org/2006/browser/search/">
	<ShortName>${esc(name.slice(0, 16))}</ShortName>
	<Description>Search apps, files and commands in ${esc(name)}</Description>
	<InputEncoding>UTF-8</InputEncoding>
	<Image width="192" height="192" type="image/png">${esc(url.origin)}/icon-192.png</Image>
	<Url type="text/html" method="get" template="${esc(url.origin)}/?q={searchTerms}"/>
	<moz:SearchForm>${esc(url.origin)}/</moz:SearchForm>
</OpenSearchDescription>
`;
	return new Response(xml, {
		headers: { 'Content-Type': 'application/opensearchdescription+xml', 'Cache-Control': 'public, max-age=86400' }
	});
}
