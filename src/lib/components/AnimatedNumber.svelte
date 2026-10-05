<script>
	import { browser } from '$app/environment';
	import { prefersReducedMotion } from 'svelte/motion';

	let { value, duration = 600, decimals = 0 } = $props();

	let displayValue = $state(0);
	let prevValue = $state(0);
	let initialized = false;

	$effect(() => {
		if (!initialized) {
			displayValue = value;
			prevValue = value;
			initialized = true;
			return;
		}

		if (!browser || prevValue === value || prefersReducedMotion.current) {
			displayValue = value;
			prevValue = value;
			return;
		}

		const from = prevValue;
		const to = value;
		prevValue = value;
		const start = performance.now();

		let frame;
		function tick(now) {
			const elapsed = now - start;
			const t = Math.min(elapsed / duration, 1);
			const ease = 1 - Math.pow(1 - t, 3);
			displayValue = from + (to - from) * ease;
			if (t < 1) {
				frame = requestAnimationFrame(tick);
			}
		}

		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	});
</script>

{displayValue.toFixed(decimals)}
