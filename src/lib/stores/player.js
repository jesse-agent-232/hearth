import { writable } from 'svelte/store';

// The song in the corner player, or null when nothing is playing. Set from
// search (a Navidrome result's `meta.track`); MiniPlayer owns the audio.
export const nowPlaying = writable(null);
