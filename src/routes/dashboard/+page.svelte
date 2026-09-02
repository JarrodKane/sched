<!--
  +page.svelte — /dashboard
  Dashboard. Shows all accounts the logged-in user has access to as cards,
  each displaying the next scheduled post time, next upcoming lineup (date,
  show name, fill count), pending post count, and quick action links.
-->

<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function formatNextPost(isoString: string): string {
		const d = new Date(isoString);
		const tz = 'Australia/Melbourne';
		const nowStr = new Date().toLocaleDateString('en-CA', { timeZone: tz });
		const postStr = d.toLocaleDateString('en-CA', { timeZone: tz });
		const time = d.toLocaleTimeString('en-AU', { timeZone: tz, hour: 'numeric', minute: '2-digit' });

		if (postStr === nowStr) return `Today · ${time}`;
		const tom = new Date();
		tom.setDate(tom.getDate() + 1);
		if (postStr === tom.toLocaleDateString('en-CA', { timeZone: tz })) return `Tomorrow · ${time}`;
		return `${d.toLocaleDateString('en-AU', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' })} · ${time}`;
	}

	function formatShowDate(dateStr: string): string {
		const [y, m, d] = dateStr.split('-').map(Number);
		const tz = 'Australia/Melbourne';
		const nowStr = new Date().toLocaleDateString('en-CA', { timeZone: tz });
		if (dateStr === nowStr) return 'Tonight';
		const tom = new Date();
		tom.setDate(tom.getDate() + 1);
		if (dateStr === tom.toLocaleDateString('en-CA', { timeZone: tz })) return 'Tomorrow';
		return new Date(y, m - 1, d).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
	}
</script>

<svelte:head><title>Dashboard — Sched</title></svelte:head>

<div class="mb-6">
	<h1 class="text-2xl font-bold">Your accounts</h1>
</div>

{#if data.accounts.length === 0}
	<div role="alert" class="alert alert-soft">
		No accounts assigned yet. Ask an admin to grant you access.
	</div>
{:else}
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each data.accounts as account}
			<div class="card bg-base-100">
				<div class="card-body gap-4 p-4">
					<!-- Header -->
					<div class="flex items-center gap-3">
						<div class="w-10 h-10 rounded-full bg-linear-to-tr from-yellow-400 via-pink-500 to-purple-600 shrink-0"></div>
						<div class="min-w-0">
							<h2 class="font-semibold truncate">{account.label}</h2>
							<span class="text-xs text-base-content/40 uppercase tracking-wide">{account.platform}</span>
						</div>
					</div>

					<!-- Stats -->
					<div class="flex flex-col gap-1.5 text-xs">
						<div class="flex items-baseline gap-2">
							<span class="w-20 shrink-0 text-base-content/40">Next post</span>
							{#if account.nextPostAt}
								<span class="font-medium text-base-content">{formatNextPost(account.nextPostAt)}</span>
								{#if account.pendingCount > 1}
									<span class="ml-auto shrink-0 text-base-content/30">+{account.pendingCount - 1} more</span>
								{/if}
							{:else}
								<span class="text-base-content/30">Nothing scheduled</span>
							{/if}
						</div>

						<div class="flex items-baseline gap-1.5">
							<span class="w-20 shrink-0 text-base-content/40">Next show</span>
							{#if account.nextLineup}
								<span class="font-medium text-base-content">{formatShowDate(account.nextLineup.showDate)}</span>
								<span class="text-base-content/30">·</span>
								<span class="min-w-0 truncate text-base-content/60">{account.nextLineup.showName}</span>
								{#if account.nextLineup.actsPerShow}
									<span class="ml-auto shrink-0 text-base-content/40">{account.nextLineup.totalEntries}/{account.nextLineup.actsPerShow}</span>
								{:else if account.nextLineup.totalEntries > 0}
									<span class="ml-auto shrink-0 text-base-content/30">{account.nextLineup.totalEntries} acts</span>
								{/if}
							{:else}
								<span class="text-base-content/30">No upcoming shows</span>
							{/if}
						</div>
					</div>

					<!-- Actions -->
					<div class="flex gap-2">
						<a href="/accounts/{account.id}" class="btn btn-xs btn-primary flex-1">Open</a>
					</div>
				</div>
			</div>
		{/each}
	</div>
{/if}
