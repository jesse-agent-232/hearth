<script>
	import { getContext } from 'svelte';

	const siteConfig = getContext('config');
	const brandName = siteConfig?.branding?.name || 'Hearth';
	const registration = siteConfig?.auth?.registration;
	const privacyEnabled = siteConfig?.privacy?.enabled !== false;

	let { onOpenPrivacy = null } = $props();
</script>

<div class="dashboard-footer flex items-center gap-3 pt-6 pb-2 text-[0.65rem] text-content-dim">
	<span>{brandName}</span>
	{#if registration?.enabled && registration?.url}
		<span class="opacity-40">&middot;</span>
		<a href={registration.url} class="text-content-dim font-mono text-[0.65rem] no-underline hover:text-content-muted">Register</a>
	{/if}
	{#if privacyEnabled && onOpenPrivacy}
		<span class="opacity-40">&middot;</span>
		<button class="bg-transparent border-none text-content-dim font-mono text-[0.65rem] cursor-pointer p-0 no-underline hover:text-content-muted" onclick={onOpenPrivacy}>Privacy & Terms</button>
	{/if}
</div>
