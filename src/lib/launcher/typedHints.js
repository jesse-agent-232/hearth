// Types out each hint, holds it, erases it and moves to the next: the
// search bar's rotating placeholder. With reduced motion, whole hints swap.
// Returns a function that stops it.
export function cycleHints(hints, setText, reducedMotion) {
	let hintIndex = 0;
	let charIndex = hints[0].length;
	let phase = 'holding';
	let timeout;
	setText(hints[0]);

	const step = () => {
		// Reduced motion: swap whole hints instead of typing them out.
		if (reducedMotion()) {
			hintIndex = (hintIndex + 1) % hints.length;
			charIndex = hints[hintIndex].length;
			phase = 'holding';
			setText(hints[hintIndex]);
			timeout = setTimeout(step, 4000);
			return;
		}
		const target = hints[hintIndex];
		if (phase === 'holding') {
			phase = 'erasing';
			timeout = setTimeout(step, 1800);
		} else if (phase === 'erasing') {
			if (charIndex > 0) {
				charIndex--;
				setText(target.slice(0, charIndex));
				timeout = setTimeout(step, 22);
			} else {
				phase = 'typing';
				hintIndex = (hintIndex + 1) % hints.length;
				timeout = setTimeout(step, 320);
			}
		} else if (phase === 'typing') {
			const next = hints[hintIndex];
			if (charIndex < next.length) {
				charIndex++;
				setText(next.slice(0, charIndex));
				timeout = setTimeout(step, 45);
			} else {
				phase = 'holding';
				timeout = setTimeout(step, 2200);
			}
		}
	};
	timeout = setTimeout(step, 2800);
	return () => clearTimeout(timeout);
}
