import { marked } from 'marked';
import { version as APP_VERSION } from '../../../package.json';
import changelog from '../../../CHANGELOG.md?raw';
import { parseChangelog } from '$lib/changelog.js';

// CHANGELOG.md is bundled at build time, so an instance never asks GitHub.
// Its notes are rendered once, the first time they're asked for.

export const version = APP_VERSION;

let rendered = null;
export async function releases() {
	if (!rendered) {
		const { default: DOMPurify } = await import('isomorphic-dompurify');
		// A link in What's new opens in a new tab rather than leaving Holm.
		// DOMPurify drops target, so the hook adds it back after sanitizing,
		// and only for these notes.
		DOMPurify.addHook('afterSanitizeAttributes', newTab);
		try {
			rendered = parseChangelog(changelog).map((r) => ({ ...r, html: DOMPurify.sanitize(marked.parse(r.notes)) }));
		} finally {
			DOMPurify.removeHook('afterSanitizeAttributes', newTab);
		}
	}
	return rendered;
}

function newTab(node) {
	if (node.tagName === 'A' && node.getAttribute('href')) {
		node.setAttribute('target', '_blank');
		node.setAttribute('rel', 'noopener noreferrer');
	}
}
