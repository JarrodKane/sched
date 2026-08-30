<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function pct(sold: number, cap: number): number {
		return cap > 0 ? Math.round((sold / cap) * 100) : 0;
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-AU', {
			weekday: 'short', day: 'numeric', month: 'short'
		});
	}
</script>

<svelte:head><title>Tickets — IG Scheduler</title></svelte:head>

{#if data.shows.length === 0}
	<div role="alert" class="alert alert-soft">
		<svg class="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
		<div>
			<p class="font-medium">No shows linked yet</p>
			<p class="text-sm opacity-70">An admin can add shows in <a href="/admin/accounts" class="link">Admin → Accounts → Shows</a>.</p>
		</div>
	</div>
{:else}
	<div class="flex flex-col gap-3">
		{#each data.shows as show}
			<a href="tickets/{show.id}" class="card bg-base-100 hover:bg-base-200 transition-colors cursor-pointer">
				<div class="card-body py-4 flex-row items-center justify-between gap-4">
					<div class="min-w-0">
						<div class="flex items-center gap-2">
							<p class="font-medium truncate">{show.name}</p>
							{#if !show.isActive}
								<span class="badge badge-xs badge-ghost shrink-0">Paused</span>
							{/if}
						</div>
						{#if show.latestSnapshot}
							<p class="text-xs text-base-content/50 mt-0.5">
								Last checked {formatDate(show.latestSnapshot.showDate)}
								· {show.latestSnapshot.totalSold}/{show.latestSnapshot.totalCapacity} sold
							</p>
						{:else}
							<p class="text-xs text-base-content/40 mt-0.5">No ticket data yet</p>
						{/if}
					</div>
					<div class="flex items-center gap-3 shrink-0">
						{#if show.latestSnapshot && show.latestSnapshot.totalCapacity > 0}
							<div class="text-right">
								<p class="text-2xl font-bold tabular-nums leading-none">{show.latestSnapshot.totalSold}</p>
								<p class="text-xs text-base-content/40">of {show.latestSnapshot.totalCapacity}</p>
							</div>
							<div
								class="radial-progress text-primary text-xs font-bold"
								style="--value:{pct(show.latestSnapshot.totalSold, show.latestSnapshot.totalCapacity)};--size:3rem;--thickness:4px"
								aria-label="{pct(show.latestSnapshot.totalSold, show.latestSnapshot.totalCapacity)}% sold"
							>
								{pct(show.latestSnapshot.totalSold, show.latestSnapshot.totalCapacity)}%
							</div>
						{/if}
						<svg class="h-4 w-4 text-base-content/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
					</div>
				</div>
			</a>
		{/each}
	</div>
{/if}
