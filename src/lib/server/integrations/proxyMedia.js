// Content types the integration proxy will serve: thumbnails, covers and
// audio. Everything it returns comes from Holm's own origin.
export function isProxiedMedia(contentType) {
	const type = mediaType(contentType);
	return type.startsWith('image/') || type.startsWith('audio/') || type === 'application/octet-stream';
}

// Some servers send raw files (a FLAC stream, say) as octet-stream. Those
// pass, but only ever as a download: opened directly they can't render.
export function isOpaque(contentType) {
	return mediaType(contentType) === 'application/octet-stream';
}

function mediaType(contentType) {
	return (contentType || '').split(';')[0].trim().toLowerCase();
}
