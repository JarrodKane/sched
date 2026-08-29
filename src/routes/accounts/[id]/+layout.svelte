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

<div class="mb-6">
	<a href="/dashboard" class="text-sm text-base-content/40 hover:text-base-content transition-colors">
		← Dashboard
	</a>
	<h1 class="mt-1 text-xl font-bold">{data.accountMeta.label}</h1>
</div>

<div role="tablist" class="tabs tabs-border mb-6">
	<a role="tab" href={base} class="tab {isTab(base) && !isTab(`${base}/history`) && !isTab(`${base}/media`) ? 'tab-active' : ''}">
		Schedule
	</a>
	<a role="tab" href="{base}/history" class="tab {isTab(`${base}/history`) ? 'tab-active' : ''}">
		History
	</a>
	<a role="tab" href="{base}/media" class="tab {isTab(`${base}/media`) ? 'tab-active' : ''}">
		Media library
	</a>
</div>

{@render children()}
