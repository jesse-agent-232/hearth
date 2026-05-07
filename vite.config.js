import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
	// Load all .env vars into process.env so server-side config.yml
	// ${VAR} substitution works in dev mode.
	const env = loadEnv(mode, process.cwd(), '');
	Object.assign(process.env, env);

	return {
		plugins: [tailwindcss(), sveltekit()],
		server: {
			host: true,
			allowedHosts: true
		}
	};
});
