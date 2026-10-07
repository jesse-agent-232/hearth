// Shared modal behaviour: `<div use:dialog={{ label }}>` on a modal's root.
//
// - role="dialog" + aria-modal, labelled by `label` or the first heading.
// - Everything outside the dialog is made `inert`, so Tab, screen readers and
//   clicks can't reach the page behind it. That is the focus trap.
// - Focus moves into the dialog on open and back to the opener on close.
// - `onclose`, if given, runs on a click on the root itself: the backdrop
//   around the modal's card.
//
// Dialogs can stack or briefly overlap while one replaces another, so inert
// is reference-counted: an element is released only when no open dialog
// still needs it hidden.

const holds = new Map();

const FOCUSABLE =
	'[autofocus], button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function dialog(node, { label, onclose } = {}) {
	const opener = document.activeElement;
	let close = onclose;
	const onClick = (e) => {
		if (e.target === node) close?.();
	};
	node.addEventListener('click', onClick);
	node.setAttribute('role', 'dialog');
	node.setAttribute('aria-modal', 'true');
	const name = label || node.querySelector('h1, h2, h3')?.textContent?.trim();
	if (name) node.setAttribute('aria-label', name);

	const inerted = [];
	for (let el = node; el && el !== document.body; el = el.parentElement) {
		for (const sib of el.parentElement?.children || []) {
			if (sib === el || sib.tagName === 'SCRIPT') continue;
			if (sib.inert && !holds.has(sib)) continue; // inert for its own reasons
			holds.set(sib, (holds.get(sib) || 0) + 1);
			sib.inert = true;
			inerted.push(sib);
		}
	}

	if (!node.contains(document.activeElement)) {
		const target = node.querySelector(FOCUSABLE);
		if (target) target.focus({ preventScroll: true });
		else {
			node.tabIndex = -1;
			node.focus({ preventScroll: true });
		}
	}

	return {
		update(params) {
			close = params?.onclose;
		},
		destroy() {
			node.removeEventListener('click', onClick);
			for (const el of inerted) {
				const n = holds.get(el) - 1;
				if (n > 0) holds.set(el, n);
				else {
					holds.delete(el);
					el.inert = false;
				}
			}
			if (opener?.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
		}
	};
}
