// Integration cards mark an open, edited form with data-unsaved. Anything that
// would unmount or collapse that form asks first.
export function confirmDiscardUnsaved() {
	return !document.querySelector('[data-unsaved]') || confirm('Discard unsaved changes?');
}
