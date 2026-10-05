// fetch() whose timeout covers only the wait for response headers. An
// AbortSignal.timeout() passed to fetch also aborts the body, which cuts off
// an image we stream through to a slow client mid-transfer.
export async function fetchHeadersWithin(url, ms) {
	const ctl = new AbortController();
	const timer = setTimeout(() => ctl.abort(), ms);
	try {
		return await fetch(url, { signal: ctl.signal });
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}
