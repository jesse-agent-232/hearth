// Client-side weather and location lookups. All free, keyless services:
// Open-Meteo (forecast, place search) and Nominatim (reverse geocode).
import { WEATHER_TTL } from '$lib/constants.js';

const WEATHER_CACHE_KEY = 'weather_cache';
const PLACE_CACHE_KEY = 'weather_location';
const LATER_HOURS = 6;

function readCache(key) {
	try {
		return JSON.parse(localStorage.getItem(key) || 'null');
	} catch {
		return null;
	}
}

// Current conditions plus the forecast LATER_HOURS from now.
export async function fetchWeather(lat, lon) {
	const c = readCache(WEATHER_CACHE_KEY);
	if (c?.data?.later && c.lat === lat && c.lon === lon && Date.now() - c.ts < WEATHER_TTL) return c.data;
	try {
		const r = await fetch(
			`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&hourly=temperature_2m,weather_code&forecast_hours=${LATER_HOURS + 1}&timezone=auto`
		);
		const d = await r.json();
		const data = {
			temp: Math.round(d.current.temperature_2m),
			code: d.current.weather_code,
			later: {
				hours: LATER_HOURS,
				temp: Math.round(d.hourly.temperature_2m[LATER_HOURS]),
				code: d.hourly.weather_code[LATER_HOURS]
			}
		};
		localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ ts: Date.now(), lat, lon, data }));
		return data;
	} catch {
		return null;
	}
}

export async function reverseGeocode(lat, lon) {
	const c = readCache(PLACE_CACHE_KEY);
	if (c && c.lat === lat && c.lon === lon) return c.name;
	try {
		const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10`);
		const addr = (await r.json()).address || {};
		const name = (addr.city || addr.town || addr.village || addr.county || '')
			.replace(/\s+(Municipal Corporation|District|Tehsil|Taluk|Block)$/i, '');
		if (name) localStorage.setItem(PLACE_CACHE_KEY, JSON.stringify({ lat, lon, name }));
		return name;
	} catch {
		return '';
	}
}

export async function searchPlaces(query) {
	const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&format=json`);
	return (await r.json()).results || [];
}
