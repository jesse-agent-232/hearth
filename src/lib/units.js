// Clock and temperature units, as chosen under Configure → Widgets.
// 'auto' follows the browser's language and region. The defaults keep the
// 24-hour clock and Celsius Holm has always shown.

export const DEFAULT_TIME_FORMAT = '24h';
export const DEFAULT_TEMP_UNIT = 'c';

// Where Fahrenheit is the everyday unit.
const FAHRENHEIT_REGIONS = new Set(['US', 'LR', 'MM', 'BS', 'BZ', 'KY', 'PW', 'FM', 'MH']);

function localeRegion(locale) {
	try {
		return new Intl.Locale(locale).maximize().region || '';
	} catch {
		return '';
	}
}

export function uses12Hour(pref = DEFAULT_TIME_FORMAT, locale = undefined) {
	if (pref === '12h') return true;
	if (pref !== 'auto') return false;
	const cycle = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hourCycle;
	return cycle === 'h12' || cycle === 'h11';
}

export function usesFahrenheit(pref = DEFAULT_TEMP_UNIT, locale = globalThis.navigator?.language) {
	if (pref === 'f') return true;
	if (pref !== 'auto') return false;
	return FAHRENHEIT_REGIONS.has(localeRegion(locale));
}

// Whole degrees in the chosen unit, from Celsius.
export function temperature(celsius, pref, locale) {
	return Math.round(usesFahrenheit(pref, locale) ? celsius * 9 / 5 + 32 : celsius);
}

// "16:05", or "4:05" with dayPeriod "PM" on a 12-hour clock.
export function clockParts(t, pref, locale) {
	const twelve = uses12Hour(pref, locale);
	const parts = new Intl.DateTimeFormat(locale, {
		hour: twelve ? 'numeric' : '2-digit',
		minute: '2-digit',
		hourCycle: twelve ? 'h12' : 'h23'
	}).formatToParts(new Date(t));
	const hour = parts.find((p) => p.type === 'hour').value;
	const minute = parts.find((p) => p.type === 'minute').value;
	return { time: `${hour}:${minute}`, dayPeriod: twelve ? parts.find((p) => p.type === 'dayPeriod')?.value || '' : '' };
}

export function formatClock(t, pref, locale) {
	const { time, dayPeriod } = clockParts(t, pref, locale);
	return dayPeriod ? `${time} ${dayPeriod}` : time;
}

export const TIME_FORMATS = [
	{ id: '24h', label: '24-hour' },
	{ id: '12h', label: '12-hour' },
	{ id: 'auto', label: 'Auto' }
];

export const TEMP_UNITS = [
	{ id: 'c', label: '°C' },
	{ id: 'f', label: '°F' },
	{ id: 'auto', label: 'Auto' }
];
