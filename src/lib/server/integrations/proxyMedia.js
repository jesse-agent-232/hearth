// Content types the integration proxy will serve: thumbnails, covers and
// audio. Everything it returns comes from Holm's own origin.
export function isProxiedMedia(contentType) {
	const type = (contentType || '').split(';')[0].trim().toLowerCase();
	return type.startsWith('image/') || type.startsWith('audio/');
}
