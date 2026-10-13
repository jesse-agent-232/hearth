import { marked } from 'marked';
import { version as APP_VERSION } from '../../../package.json';
import changelog from '../../../CHANGELOG.md?raw';
import { parseChangelog } from '$lib/whatsNew.js';

// CHANGELOG.md is bundled at build time, so an instance never asks GitHub.
// Its notes are rendered once, the first time they're asked for.

export const version = APP_VERSION;

let rendered = null;
export async function releases() {
	if (!rendered) {
		const { default: DOMPurify } = await import('isomorphic-dompurify');
		rendered = parseChangelog(changelog).map((r) => ({ ...r, html: DOMPurify.sanitize(marked.parse(r.notes)) }));
	}
	return rendered;
}
