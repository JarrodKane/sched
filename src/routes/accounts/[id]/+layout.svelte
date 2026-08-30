<script lang="ts">
	import { page } from '$app/state';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	const base = `/accounts/${data.accountMeta.id}`;

	function isTab(path: string) {
		return path === base
			? page.url.pathname === base
			: page.url.pathname.startsWith(path);
	}
</script>

<div class="mb-6 flex items-start justify-between gap-4">
	<div>
		<a href="/dashboard" class="text-sm text-base-content/40 hover:text-base-content transition-colors">
			← Dashboard
		</a>
		<h1 class="mt-1 text-xl font-bold">{data.accountMeta.label}</h1>
	</div>
	<a
		href="{base}/settings"
		title="Account settings"
		class="btn btn-ghost btn-sm btn-square mt-2 {isTab(`${base}/settings`) ? 'text-base-content' : 'text-base-content/30 hover:text-base-content/70'}"
	>
		<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<circle cx="12" cy="12" r="3"/>
			<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
		</svg>
	</a>
</div>

<div role="tablist" class="tabs tabs-border mb-6 overflow-x-auto flex-nowrap -mx-3 px-3 sm:mx-0 sm:px-0">
	{#if data.canAccessSocial}
		<a role="tab" href={base} class="tab shrink-0 {isTab(base) && !isTab(`${base}/history`) && !isTab(`${base}/media`) && !isTab(`${base}/settings`) && !isTab(`${base}/tickets`) ? 'tab-active' : ''}">
			Schedule
		</a>
		<a role="tab" href="{base}/history" class="tab shrink-0 {isTab(`${base}/history`) ? 'tab-active' : ''}">
			History
		</a>
		<a role="tab" href="{base}/media" class="tab shrink-0 {isTab(`${base}/media`) ? 'tab-active' : ''}">
			Media library
		</a>
	{/if}
	{#if data.canAccessTickets}
		<a role="tab" href="{base}/tickets" class="tab shrink-0 {isTab(`${base}/tickets`) ? 'tab-active' : ''}">
			Tickets
		</a>
	{/if}
</div>

{@render children()}
