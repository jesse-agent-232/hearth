// Wallpaper URLs for the browser. Wallpapers are numbered 1 to count, the
// number of images in the configured source (config's wallpapers.count, sent
// by the server). No pick, or one past the count (the source shrank), shows
// the wallpaper of the day, which the server picks.

const inRange = (id, count) => Number.isInteger(Number(id)) && id >= 1 && (!count || id <= count);

export function getWallpaperUrl(wallpaperId, count) {
	return inRange(wallpaperId, count) ? `/api/wallpaper/${String(wallpaperId).padStart(4, '0')}` : '/api/wallpaper/today';
}

export function getWallpaperThumbUrl(wallpaperId, count) {
	return inRange(wallpaperId, count) ? `/api/wallpaper/${String(wallpaperId).padStart(4, '0')}/thumb` : '/api/wallpaper/today/thumb';
}

// The original, skipping the resizer, for screens wider than the 1920px image.
export function getWallpaperOriginalUrl(wallpaperId, count) {
	return inRange(wallpaperId, count) ? `/api/wallpaper/${String(wallpaperId).padStart(4, '0')}/original` : '/api/wallpaper/today/original';
}
