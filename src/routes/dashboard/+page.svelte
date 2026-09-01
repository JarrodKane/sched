<!--
  +page.svelte — /dashboard
  Dashboard. Shows all accounts the logged-in user has access to as cards, each
  displaying the account name, platform label, and a "N scheduled" badge when
  there are pending or publishing posts.

  Svelte features:
    $props() — receives data (accounts[] with pendingCount per account)
    — no local $state; the page is entirely driven by server data
-->

<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Dashboard — Sched</title></svelte:head>

<div class="mb-8 flex items-center justify-between">
	<h1 class="text-2xl font-bold">Your accounts</h1>
</div>

{#if data.accounts.length === 0}
	<div role="alert" class="alert alert-soft">
		No accounts assigned yet. Ask an admin to grant you access.
	</div>
{:else}
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each data.accounts as account}
			<a
				href="/accounts/{account.id}"
				class="card bg-base-100 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-150"
			>
				<div class="card-body gap-4">
					<div class="flex items-center gap-3">
						<div class="w-10 h-10 rounded-full bg-linear-to-tr from-yellow-400 via-pink-500 to-purple-600 shrink-0"></div>
						<div class="min-w-0">
							<h2 class="font-semibold truncate">{account.label}</h2>
							<span class="text-xs text-base-content/40 uppercase tracking-wide">{account.platform}</span>
						</div>
					</div>
					<div class="flex items-center justify-between">
						{#if account.pendingCount > 0}
							<span class="badge badge-primary badge-soft badge-sm">
								{account.pendingCount} scheduled
							</span>
						{:else}
							<span class="text-xs text-base-content/40">Nothing scheduled</span>
						{/if}
						<span class="text-xs text-primary font-medium">Open →</span>
					</div>
				</div>
			</a>
		{/each}
	</div>
{/if}
