/**
 * Shared icon helpers — used by AppGrid, ManageApps, OnboardingModal, InlineTip.
 * All functions take `iconStyle` as first arg so they work with reactive Svelte state.
 */

/** Return the correct icon URL based on the current style. */
export function getIconSrc(iconStyle, icon) {
	// Colored mode: explicit brand-colored tiles use mono glyph, others use full-color icon
	if (iconStyle === 'colored') return icon.brandExplicit ? icon.mono : icon.colored;
	// White/grayed: use mono icon (with CSS filter)
	return icon.mono;
}

/** Return the CSS class for the current icon style. */
export function getIconClass(iconStyle, icon) {
	if (iconStyle === 'white') return 'icon-white';
	if (iconStyle === 'grayed') return 'icon-grayed';
	return '';
}

/** On img error, fall back to the colored URL with grayscale filter. */
export function handleIconError(e, icon) {
	const fb = icon.fallback || icon.colored;
	if (fb && e.target.getAttribute('src') !== fb) {
		e.target.src = fb;
		// Apply grayscale since we're falling back from mono to colored
		e.target.classList.add('icon-grayscale-fallback');
	}
}

/** Return inline style for icon backgrounds in colored mode. */
export function getBrandBgStyle(icon) {
	if (icon.brandExplicit && icon.brandColor) return `background: ${icon.brandColor};`;
	// Default tile resolves per-theme via --tile-bg-default (white in light,
	// translucent dark in dark). Apps that opt into a brand-color tile via
	// `tile_color` keep their explicit hex regardless of theme.
	return 'background: var(--tile-bg-default);';
}

/** Return CSS filter to tint icon glyph to match brand foreground color. */
export function getBrandIconClass(iconStyle, icon) {
	if (iconStyle !== 'colored' || !icon.brandExplicit || !icon.brandFg) return '';
	// Theme-independent: always literal white or black on brand backgrounds
	return icon.brandFg === '#fff' ? 'brand-icon-white' : 'brand-icon-black';
}
