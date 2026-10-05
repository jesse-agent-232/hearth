import { getNewsConfig } from './config.js';

const NEWS_TTL = 15 * 60 * 1000; // 15 minutes
let cache = { ts: 0, items: [] };

export async function fetchNews() {
	const newsConfig = getNewsConfig();
	if (!newsConfig.enabled) return [];

	if (Date.now() - cache.ts < NEWS_TTL && cache.items.length) {
		return cache.items;
	}

	const rssUrl = newsConfig.rss_url || 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en';

	try {
		const res = await fetch(rssUrl, { signal: AbortSignal.timeout(5000) });
		const xml = await res.text();
		const items = [];
		const regex = /<item>([\s\S]*?)<\/item>/g;
		let match;
		while ((match = regex.exec(xml)) !== null && items.length < 10) {
			const block = match[1];
			// Extract title (with or without CDATA)
			const titleMatch = block.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/);
			let title = titleMatch ? titleMatch[1].replace(/\s*-\s*[^-]+$/, '').trim() : '';
			if (!title) continue;
			// Extract link
			const linkMatch = block.match(/<link>(.*?)<\/link>/);
			const link = linkMatch ? linkMatch[1].trim() : null;
			items.push({ title, link });
		}

		cache = { ts: Date.now(), items };
		return items;
	} catch {
		return cache.items.length ? cache.items : [];
	}
}
