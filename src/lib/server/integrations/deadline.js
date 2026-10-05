// Wraps SvelteKit's event fetch so every upstream call an adapter makes shares
// one deadline, and is also cancelled when the browser drops the request.
// Without it a hung integration holds the request (and its sockets) open until
// the OS gives up, and the user sees a spinner that never resolves.

export function withDeadline(fetch, ms, parentSignal) {
	const deadline = AbortSignal.timeout(ms);
	const signals = parentSignal ? [deadline, parentSignal] : [deadline];
	return (input, init = {}) =>
		fetch(input, {
			...init,
			signal: AbortSignal.any(init.signal ? [...signals, init.signal] : signals)
		});
}

export function describeFetchError(err, ms) {
	if (err?.name === 'TimeoutError') return `no response within ${ms / 1000}s`;
	return err?.message || String(err);
}
