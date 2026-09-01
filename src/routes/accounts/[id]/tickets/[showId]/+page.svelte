<script lang="ts">
	import { page } from '$app/state';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let showBreakdown = $state(false);
	let showStats = $state(false);

	interface TicketType {
		id: string;
		name: string;
		sold: number;
		capacity: number;
		price: number;
		platform: 'H' | 'E';
	}

	interface TicketData {
		date_id: string;
		total_sold: number;
		total_capacity: number;
		ticket_types: TicketType[];
	}

	const humanitixData = $derived(data.snapshot?.humanitixData as TicketData | null);
	const eventbriteData = $derived(data.snapshot?.eventbriteData as TicketData | null);

	const allTicketTypes = $derived.by<TicketType[]>(() => {
		const map = new Map<string, TicketType>();
		for (const tt of humanitixData?.ticket_types ?? []) map.set('h:' + tt.id, { ...tt, platform: 'H' as const });
		for (const tt of eventbriteData?.ticket_types ?? []) map.set('e:' + tt.id, { ...tt, platform: 'E' as const });
		return [...map.values()];
	});

	const today = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Australia/Melbourne',
		year: 'numeric', month: '2-digit', day: '2-digit'
	}).format(new Date());

	const isTonight = $derived(data.selectedDate === today);
	const isPast = $derived(data.selectedDate < today);

	// Current week bounds (Monday-anchored, matching the list page logic)
	const thisWeekStart = (() => {
		const d = new Date();
		const day = d.getDay();
		const daysBack = day === 0 ? 6 : day - 1;
		d.setDate(d.getDate() - daysBack);
		return d.toISOString().slice(0, 10);
	})();
	const thisWeekEnd = (() => {
		const d = new Date(thisWeekStart + 'T12:00:00');
		d.setDate(d.getDate() + 6);
		return d.toISOString().slice(0, 10);
	})();
	const isThisWeek = $derived(data.selectedDate >= thisWeekStart && data.selectedDate <= thisWeekEnd);

	function pct(sold: number, cap: number): number {
		return cap > 0 ? Math.round((sold / cap) * 100) : 0;
	}

	function formatDate(dateStr: string): string {
		if (!dateStr) return '—';
		return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-AU', {
			weekday: 'long', day: 'numeric', month: 'long'
		});
	}

	function formatShortDate(dateStr: string): string {
		return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-AU', {
			day: 'numeric', month: 'short'
		});
	}

	function updatedAgo(iso: string | Date): string {
		const diffMs = Date.now() - new Date(iso).getTime();
		const mins = Math.floor(diffMs / 60_000);
		if (mins < 2) return 'just now';
		if (mins < 60) return `${mins} min ago`;
		const hrs = Math.floor(mins / 60);
		return `${hrs}h ago`;
	}

	function fillColor(p: number): string {
		if (p >= 90) return 'text-error';
		if (p >= 70) return 'text-warning';
		return 'text-primary';
	}

	function progressColor(p: number): string {
		if (p >= 90) return 'progress-error';
		if (p >= 70) return 'progress-warning';
		return 'progress-primary';
	}

	const base = `/accounts/${page.params.id}/tickets/${page.params.showId}`;

	function dateLink(d: string): string {
		return `${base}?date=${d}`;
	}

	const venueCap = $derived(data.show.capacity ?? null);
	const fillPct = $derived(data.snapshot && venueCap ? pct(data.snapshot.totalSold, venueCap) : 0);
</script>

<svelte:head><title>{data.show.name} — Tickets</title></svelte:head>

<!-- Back link -->
<a href="/accounts/{page.params.id}/tickets" class="inline-flex items-center gap-1 text-sm text-base-content/40 hover:text-base-content/70 transition-colors mb-4">
	<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
	All tickets
</a>

<!-- Show name + date label -->
<div class="mb-5">
	<div class="flex items-center gap-2 flex-wrap">
		<h2 class="text-lg font-semibold">{data.show.name}</h2>
		{#if isTonight}
			<span class="badge badge-primary">Tonight</span>
		{:else if isPast}
			<span class="badge badge-ghost">Past</span>
		{:else}
			<span class="badge badge-soft">Upcoming</span>
		{/if}
	</div>
	<p class="text-sm text-base-content/60 mt-0.5">{formatDate(data.selectedDate)}</p>
</div>

<!-- Date navigation -->
<div class="flex items-center justify-between gap-2 mb-1">
	{#if data.prevDate}
		<a href={dateLink(data.prevDate)} class="btn btn-soft btn-sm gap-1 text-base-content/50">
			<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
			{formatShortDate(data.prevDate)}
		</a>
	{:else}
		<div></div>
	{/if}

	<p class="text-xs text-base-content/30">
		{data.availableDates.indexOf(data.selectedDate) + 1} of {data.availableDates.length} dates
	</p>

	{#if data.nextDate}
		<a href={dateLink(data.nextDate)} class="btn btn-soft btn-sm gap-1 text-base-content/50">
			{formatShortDate(data.nextDate)}
			<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
		</a>
	{:else}
		<div></div>
	{/if}
</div>
{#if isTonight}
	<div class="flex justify-center mb-5">
		<span class="badge badge-primary badge-sm">Tonight</span>
	</div>
{:else if isThisWeek}
	<div class="flex justify-center mb-5">
		<span class="badge badge-primary badge-sm">This week</span>
	</div>
{:else}
	<div class="flex justify-center mb-5">
		<a href={base} class="badge badge-ghost badge-sm cursor-pointer hover:badge-primary transition-colors">↩ This week</a>
	</div>
{/if}

{#if !data.snapshot}
	<div role="alert" class="alert alert-soft">
		<svg class="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
		<div>
			<p class="font-medium">No ticket data yet</p>
			<p class="text-sm opacity-70">Data updates automatically based on Melbourne time. Check back shortly.</p>
		</div>
	</div>
{:else}
	<!-- Hero: big numbers -->
	<div class="card bg-base-100 mb-4">
		<div class="card-body py-6 px-6 items-center text-center gap-2">
			<p class="text-8xl font-black tabular-nums leading-none {venueCap ? fillColor(fillPct) : 'text-base-content'}">{data.snapshot.totalSold}</p>
			<p class="text-base text-base-content/50">tickets sold</p>
			{#if venueCap}
				<div class="w-full max-w-xs mt-2">
					<progress
						class="progress {progressColor(fillPct)} w-full"
						value={fillPct}
						max="100"
					></progress>
					<p class="text-sm font-medium text-base-content/60 mt-1">{fillPct}% of {venueCap} capacity</p>
				</div>
			{/if}
			{#if data.snapshot.fetchedAt}
				<p class="text-xs text-base-content/30 mt-1">Updated {updatedAgo(data.snapshot.fetchedAt as unknown as string)}</p>
			{/if}
		</div>
	</div>

	<!-- Ticket type breakdown -->
	{#if allTicketTypes.length > 0}
		<div class="card bg-base-100 mb-4">
			<div class="card-body py-3 px-4 gap-3">
				<h3 class="text-sm font-semibold text-base-content/60 uppercase tracking-wide">By ticket type</h3>
				<ul class="flex flex-col gap-2">
					{#each allTicketTypes as tt}
						{@const tp = pct(tt.sold, tt.capacity)}
						<li class="flex flex-col gap-1">
							<div class="flex items-center justify-between gap-2">
								<div class="flex items-center gap-1.5 min-w-0">
									<span class="badge badge-xs badge-ghost font-mono shrink-0">{tt.platform}</span>
									<span class="text-sm font-medium truncate">{tt.name}</span>
								</div>
								<div class="flex items-center gap-2 shrink-0">
									{#if tt.price > 0}
										<span class="text-xs text-base-content/40">${tt.price.toFixed(0)}</span>
									{/if}
									<span class="text-sm tabular-nums font-semibold">{tt.sold}</span>
									<span class="text-xs text-base-content/40">/ {tt.capacity}</span>
								</div>
							</div>
							<div class="flex items-center gap-2">
								<progress
									class="progress progress-primary flex-1 h-1.5"
									value={tp}
									max="100"
								></progress>
								<span class="text-xs text-base-content/40 w-8 text-right tabular-nums">{tp}%</span>
							</div>
						</li>
					{/each}
				</ul>
			</div>
		</div>
	{/if}

	<!-- Platform breakdown (expandable) -->
	{#if humanitixData || eventbriteData}
		<div class="collapse collapse-arrow bg-base-100">
			<input type="checkbox" bind:checked={showBreakdown} />
			<div class="collapse-title text-sm font-medium py-3 text-base-content/60">
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

	<!-- Historical stats -->
	{#if data.stats}
		{@const s = data.stats}
		{@const current = data.snapshot?.totalSold ?? null}
		{@const diff = current !== null ? current - s.avg : null}
		{@const diffPct = current !== null && s.avg > 0 ? Math.round(((current - s.avg) / s.avg) * 100) : null}
		{@const avgFill = venueCap && venueCap > 0 ? Math.round((s.avg / venueCap) * 100) : null}
		{@const trendDiff = s.recentAvg !== null ? s.recentAvg - s.avg : null}
		<div class="collapse collapse-arrow bg-base-100 mt-2">
			<input type="checkbox" bind:checked={showStats} />
			<div class="collapse-title py-3">
				<p class="text-sm font-medium text-base-content/60">Historical stats</p>
				<p class="text-xs text-base-content/30 mt-0.5">{s.count} past shows · {s.avg} avg sold{avgFill !== null ? ` (${avgFill}% fill)` : ''}</p>
			</div>
			<div class="collapse-content flex flex-col gap-2">
				<p class="text-xs text-base-content/30 pt-1">Based on past show dates for this show — today and future dates are excluded since sales are still live.</p>
				<!-- 2×2 grid: avg, best, worst, count -->
				<div class="grid grid-cols-2 gap-2">
					<div class="rounded-box bg-base-200 p-3 text-center">
						<p class="text-2xl font-bold tabular-nums">{s.avg}</p>
						<p class="text-xs text-base-content/50 mt-0.5">avg sold{avgFill !== null ? ` (${avgFill}%)` : ''}</p>
					</div>
					<div class="rounded-box bg-base-200 p-3 text-center">
						<p class="text-2xl font-bold tabular-nums text-success">{s.best}</p>
						<p class="text-xs text-base-content/50 mt-0.5">best show</p>
					</div>
					<div class="rounded-box bg-base-200 p-3 text-center">
						<p class="text-2xl font-bold tabular-nums text-error">{s.worst}</p>
						<p class="text-xs text-base-content/50 mt-0.5">worst show</p>
					</div>
					<div class="rounded-box bg-base-200 p-3 text-center">
						<p class="text-2xl font-bold tabular-nums">{s.count}</p>
						<p class="text-xs text-base-content/50 mt-0.5">shows tracked</p>
					</div>
				</div>

				<!-- How this date compares to the all-time avg -->
				{#if diff !== null && diffPct !== null}
					<div class="rounded-box bg-base-200 px-4 py-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
						<div class="min-w-0">
							<p class="text-sm text-base-content/60">{formatShortDate(data.selectedDate)} vs avg</p>
							<p class="text-xs text-base-content/30 mt-0.5">This show date vs the {s.avg} all-time avg</p>
						</div>
						<div class="flex items-center gap-1.5 shrink-0">
							{#if diff > 0}
								<svg class="h-4 w-4 text-success shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
								<span class="text-sm font-semibold text-success tabular-nums">+{diff} (+{diffPct}%)</span>
							{:else if diff < 0}
								<svg class="h-4 w-4 text-error shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
								<span class="text-sm font-semibold text-error tabular-nums">−{Math.abs(diff)} (−{Math.abs(diffPct)}%)</span>
							{:else}
								<span class="text-sm font-semibold text-base-content/60">Right on average</span>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Recent trend: last 4 shows vs all-time -->
				{#if trendDiff !== null && s.recentAvg !== null}
					<div class="rounded-box bg-base-200 px-4 py-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
						<div class="min-w-0">
							<p class="text-sm text-base-content/60">Recent trend</p>
							<p class="text-xs text-base-content/30 mt-0.5">Last {s.recentCount} shows vs {s.avg} all-time avg</p>
						</div>
						<div class="flex items-center gap-2 shrink-0">
							<div class="text-right">
								<p class="text-sm font-semibold tabular-nums">{s.recentAvg} avg</p>
								{#if trendDiff > 0}
									<p class="text-xs text-success">↑ +{trendDiff}</p>
								{:else if trendDiff < 0}
									<p class="text-xs text-error">↓ −{Math.abs(trendDiff)}</p>
								{:else}
									<p class="text-xs text-base-content/40">= same</p>
								{/if}
							</div>
						</div>
					</div>
				{:else}
					<div class="rounded-box bg-base-200 px-4 py-3">
						<p class="text-sm text-base-content/60">Recent trend</p>
						<p class="text-xs text-base-content/30 mt-0.5">Need at least 5 past shows to show a trend — {s.count} tracked so far.</p>
					</div>
				{/if}
			</div>
		</div>
	{/if}
{/if}
