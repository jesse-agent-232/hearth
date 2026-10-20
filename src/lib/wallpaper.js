// Wallpaper URLs for the browser. Wallpapers are numbered 1 to count, the
// number of images in the configured source; the server sends count and v
// as config.wallpapers. v changes whenever the source or a folder's files
// do, so a browser never shows an image it cached under the same number from
// before. No pick, or one past the count (the source shrank), shows the
// wallpaper of the day, which the server picks.

const inRange = (id, count) => Number.isInteger(Number(id)) && id >= 1 && (!count || id <= count);

function wallpaperPath(wallpaperId, { count, v } = {}, suffix = '') {
	const path = inRange(wallpaperId, count) ? `/api/wallpaper/${String(wallpaperId).padStart(4, '0')}${suffix}` : `/api/wallpaper/today${suffix}`;
	return v ? `${path}?v=${v}` : path;
}

export function getWallpaperUrl(wallpaperId, wallpapers) {
	return wallpaperPath(wallpaperId, wallpapers);
}

export function getWallpaperThumbUrl(wallpaperId, wallpapers) {
	return wallpaperPath(wallpaperId, wallpapers, '/thumb');
}

// The original, skipping the resizer, for screens wider than the 1920px image.
export function getWallpaperOriginalUrl(wallpaperId, wallpapers) {
	return wallpaperPath(wallpaperId, wallpapers, '/original');
}
