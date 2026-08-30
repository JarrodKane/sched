<script lang="ts">
	import { page } from '$app/state';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let showBreakdown = $state(false);

	interface TicketType {
		id: string;
		name: string;
		sold: number;
		capacity: number;
		price: number;
	}

	interface TicketData {
		date_id: string;
		total_sold: number;
		total_capacity: number;
		ticket_types: TicketType[];
	}

	const humanitixData = $derived(data.snapshot?.humanitixData as TicketData | null);
	const eventbriteData = $derived(data.snapshot?.eventbriteData as TicketData | null);

	const allTicketTypes = $derived<TicketType[]>(() => {
		const map = new Map<string, TicketType>();
		for (const tt of humanitixData?.ticket_types ?? []) {
			map.set('h:' + tt.id, { ...tt });
		}
		for (const tt of eventbriteData?.ticket_types ?? []) {
			map.set('e:' + tt.id, { ...tt });
		}
		return [...map.values()];
	});

	function pct(sold: number, cap: number): number {
		return cap > 0 ? Math.round((sold / cap) * 100) : 0;
	}

	function formatDate(dateStr: string): string {
		if (!dateStr) return '—';
		return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-AU', {
			weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
		});
	}

	function formatTime(iso: string): string {
		return new Date(iso).toLocaleTimeString('en-AU', {
			hour: 'numeric', minute: '2-digit', hour12: true,
			timeZone: 'Australia/Melbourne'
		});
	}

	const base = `/accounts/${page.params.id}/tickets/${page.params.showId}`;

	function dateLink(d: string): string {
		return `${base}?date=${d}`;
	}
</script>

<svelte:head><title>{data.show.name} Tickets — IG Scheduler</title></svelte:head>

<div class="mb-5 flex items-center justify-between gap-2">
	<div>
		<a href="/accounts/{page.params.id}/tickets" class="text-sm text-base-content/40 hover:text-base-content transition-colors">
			← All shows
		</a>
		<h2 class="mt-1 text-lg font-semibold">{data.show.name}</h2>
	</div>
	{#if data.snapshot}
		<p class="text-xs text-base-content/40">
			Updated {formatTime(data.snapshot.fetchedAt as string)}
		</p>
	{/if}
</div>

<!-- Week navigation -->
<div class="flex items-center justify-between gap-2 mb-6">
	{#if data.prevDate}
		<a href={dateLink(data.prevDate)} class="btn btn-ghost btn-sm gap-1">
			<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
			{new Date(data.prevDate + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
		</a>
	{:else}
		<div></div>
	{/if}

	<div class="text-center">
		<p class="text-sm font-medium">{formatDate(data.selectedDate)}</p>
		{#if !data.selectedDate}
			<p class="text-xs text-base-content/40">No data yet</p>
		{/if}
	</div>

	{#if data.nextDate}
		<a href={dateLink(data.nextDate)} class="btn btn-ghost btn-sm gap-1">
			{new Date(data.nextDate + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
			<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
		</a>
	{:else}
		<div></div>
	{/if}
</div>

{#if !data.snapshot}
	<div role="alert" class="alert alert-soft">
		<svg class="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
		<div>
			<p class="font-medium">No ticket data yet</p>
			<p class="text-sm opacity-70">Data updates automatically based on Melbourne time. Check back shortly.</p>
		</div>
	</div>
{:else}
	<!-- Hero totals -->
	<div class="grid grid-cols-2 gap-3 mb-6">
		<div class="stat bg-base-100 rounded-box">
			<div class="stat-title text-xs">Total sold</div>
			<div class="stat-value text-3xl tabular-nums">{data.snapshot.totalSold}</div>
			<div class="stat-desc">of {data.snapshot.totalCapacity} capacity</div>
		</div>
		<div class="stat bg-base-100 rounded-box">
			<div class="stat-title text-xs">Fill rate</div>
			<div class="stat-value text-3xl tabular-nums">{pct(data.snapshot.totalSold, data.snapshot.totalCapacity)}%</div>
			<div class="stat-desc">
				<progress
					class="progress progress-primary w-full"
					value={pct(data.snapshot.totalSold, data.snapshot.totalCapacity)}
					max="100"
				></progress>
			</div>
		</div>
	</div>

	<!-- Ticket type breakdown -->
	{#if allTicketTypes.length > 0}
		<div class="card bg-base-100 mb-4">
			<div class="card-body py-3 px-4 gap-2">
				<h3 class="text-sm font-medium">By ticket type</h3>
				<div class="overflow-x-auto">
					<table class="table table-sm">
						<thead>
							<tr>
								<th>Type</th>
								<th class="text-right">Sold</th>
								<th class="text-right">Cap</th>
								<th class="text-right">Price</th>
								<th></th>
							</tr>
						</thead>
						<tbody>
							{#each allTicketTypes as tt}
								<tr>
									<td class="font-medium text-sm">{tt.name}</td>
									<td class="text-right tabular-nums">{tt.sold}</td>
									<td class="text-right tabular-nums text-base-content/50">{tt.capacity}</td>
									<td class="text-right tabular-nums text-base-content/50">{tt.price === 0 ? 'Free' : `$${tt.price.toFixed(0)}`}</td>
									<td class="w-24">
										<div class="flex items-center gap-1.5">
											<progress
												class="progress progress-primary flex-1"
												value={pct(tt.sold, tt.capacity)}
												max="100"
											></progress>
											<span class="text-xs text-base-content/40 w-8 text-right tabular-nums">{pct(tt.sold, tt.capacity)}%</span>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	{/if}

	<!-- Source breakdown (expandable) -->
	{#if humanitixData || eventbriteData}
		<div class="collapse collapse-arrow bg-base-100">
			<input type="checkbox" bind:checked={showBreakdown} />
			<div class="collapse-title text-sm font-medium py-3">
				Platform breakdown
			</div>
			<div class="collapse-content">
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
					{#if humanitixData}
						<div class="rounded-box bg-base-200 p-3">
							<p class="text-xs font-semibold mb-2 text-base-content/60 uppercase tracking-wide">Humanitix</p>
							<p class="text-2xl font-bold tabular-nums">{humanitixData.total_sold}</p>
							<p class="text-xs text-base-content/50">of {humanitixData.total_capacity}</p>
							{#if humanitixData.ticket_types?.length > 0}
								<ul class="mt-2 flex flex-col gap-1">
									{#each humanitixData.ticket_types as tt}
										<li class="flex items-center justify-between text-xs">
											<span class="text-base-content/60 truncate mr-2">{tt.name}</span>
											<span class="tabular-nums shrink-0">{tt.sold} / {tt.capacity}</span>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					{/if}
					{#if eventbriteData}
						<div class="rounded-box bg-base-200 p-3">
							<p class="text-xs font-semibold mb-2 text-base-content/60 uppercase tracking-wide">Eventbrite</p>
							<p class="text-2xl font-bold tabular-nums">{eventbriteData.total_sold}</p>
							<p class="text-xs text-base-content/50">of {eventbriteData.total_capacity}</p>
							{#if eventbriteData.ticket_types?.length > 0}
								<ul class="mt-2 flex flex-col gap-1">
									{#each eventbriteData.ticket_types as tt}
										<li class="flex items-center justify-between text-xs">
											<span class="text-base-content/60 truncate mr-2">{tt.name}</span>
											<span class="tabular-nums shrink-0">{tt.sold} / {tt.capacity}</span>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}
{/if}
