<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Dashboard — IG Scheduler</title></svelte:head>

<h1 class="mb-6 text-xl font-semibold text-zinc-900 dark:text-white">Your accounts</h1>

{#if data.accounts.length === 0}
	<p class="text-sm text-zinc-500 dark:text-zinc-400">
		No accounts assigned yet. Ask an admin to grant you access.
	</p>
{:else}
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each data.accounts as account}
			<a
				href="/accounts/{account.id}"
				class="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-5 transition hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
			>
				<span class="font-medium text-zinc-900 dark:text-white">{account.label}</span>
				<span class="text-xs uppercase tracking-wide text-zinc-400">{account.platform}</span>
			</a>
		{/each}
	</div>
{/if}
