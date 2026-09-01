<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let showHistory = $state(false);
	let calendarInput = $state<HTMLInputElement | undefined>();

	function addDays(dateStr: string, n: number): string {
		const d = new Date(dateStr + 'T12:00:00');
		d.setDate(d.getDate() + n);
		return d.toISOString().slice(0, 10);
	}

	function getMondayOf(dateStr: string): string {
		const d = new Date(dateStr + 'T12:00:00');
		const day = d.getDay();
		d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
		return d.toISOString().slice(0, 10);
	}

	function pct(sold: number, cap: number): number {
		return cap > 0 ? Math.round((sold / cap) * 100) : 0;
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-AU', {
			weekday: 'short', day: 'numeric', month: 'short'
		});
	}

	function formatWeekRange(startStr: string, endStr: string): string {
		const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
		const start = new Date(startStr + 'T12:00:00').toLocaleDateString('en-AU', opts);
		const end = new Date(endStr + 'T12:00:00').toLocaleDateString('en-AU', opts);
		return `${start} – ${end}`;
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

	const isCurrentWeek = $derived(data.weekStart === getMondayOf(data.today));
</script>

<svelte:head><title>Tickets — Sched</title></svelte:head>

<!-- Week navigation -->
<div class="flex items-center justify-between gap-2 mb-5">
	<a href="?week={data.prevWeek}" class="btn btn-sm btn-outline gap-1">
		<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
		Prev
	</a>
	<div class="flex flex-col items-center gap-1.5 min-w-0">
		<p class="text-sm font-semibold whitespace-nowrap">{formatWeekRange(data.weekStart, data.weekEnd)}</p>
		{#if isCurrentWeek}
			<span class="badge badge-primary badge-sm">This week</span>
		{:else}
			<a href="?" class="badge badge-outline badge-sm cursor-pointer hover:badge-primary transition-colors">↩ This week</a>
		{/if}
	</div>
	<div class="flex items-center gap-1">
		<div class="relative">
			<button
				type="button"
				class="btn btn-sm btn-soft btn-square"
				title="Jump to week"
				onclick={() => calendarInput?.showPicker?.() ?? calendarInput?.click()}
			>
				<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
			</button>
			<input
				bind:this={calendarInput}
				type="date"
				value={data.weekStart}
				onchange={(e) => { if (e.currentTarget.value) goto(`?week=${getMondayOf(e.currentTarget.value)}`); }}
				class="absolute inset-0 opacity-0 pointer-events-none w-px"
				tabindex="-1"
			/>
		</div>
		<a href="?week={data.nextWeek}" class="btn btn-sm btn-outline gap-1">
			Next
			<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
		</a>
	</div>
</div>

{#if data.showDates.length === 0}
	<div role="alert" class="alert alert-soft">
		<svg class="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
		<div>
			<p class="font-medium">No shows this week</p>
			<p class="text-sm opacity-70">Use the arrows above to browse other weeks.</p>
		</div>
	</div>
{:else}
	<div class="flex flex-col gap-3">
		{#each data.showDates as item}
			{@const snap = item.snapshot}
			{@const cap = item.capacity}
			{@const p = cap ? pct(snap.totalSold, cap) : 0}
			{@const isTonight = snap.showDate === data.today}
			<a href="tickets/{item.id}?date={snap.showDate}" class="card bg-base-100 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 cursor-pointer">
				<div class="card-body py-4 px-5 gap-3">
					<div class="flex items-start justify-between gap-4">
						<div class="min-w-0 flex-1">
							<p class="font-semibold text-base leading-tight">{item.name}</p>
							<div class="flex items-center gap-2 mt-1 flex-wrap">
								{#if isTonight}
									<span class="badge badge-sm badge-primary badge-soft">Tonight</span>
								{/if}
								<span class="text-sm text-base-content/60">{formatDate(snap.showDate)}</span>
								{#if snap.fetchedAt}
									<span class="text-xs text-base-content/30">· updated {updatedAgo(snap.fetchedAt as unknown as string)}</span>
								{/if}
							</div>
						</div>
						<div class="shrink-0 text-right">
							<p class="text-3xl font-bold tabular-nums leading-none {cap ? fillColor(p) : 'text-base-content'}">{snap.totalSold}</p>
							{#if cap}
								<p class="text-xs text-base-content/40 mt-0.5">of {cap}</p>
							{:else}
								<p class="text-xs text-base-content/40 mt-0.5">sold</p>
							{/if}
						</div>
					</div>
					{#if cap}
						<div class="flex items-center gap-2">
							<progress
								class="progress {progressColor(p)} flex-1 h-2"
								value={p}
								max="100"
							></progress>
							<span class="text-xs font-medium tabular-nums text-base-content/50 w-10 text-right">{p}%</span>
							<svg class="h-4 w-4 text-base-content/30 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
						</div>
					{:else}
						<div class="flex justify-end">
							<svg class="h-4 w-4 text-base-content/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
						</div>
					{/if}
				</div>
			</a>
		{/each}
	</div>
{/if}

<!-- Weekly history summary -->
{#if data.pastWeeks.length > 0 || data.historyPage > 1}
	{@const weekSold = data.showDates.reduce((s, i) => s + i.snapshot.totalSold, 0)}
	{@const weekCap = data.showDates.reduce((s, i) => s + (i.snapshot.totalCapacity ?? 0), 0)}
	{@const weekFill = weekCap > 0 ? pct(weekSold, weekCap) : null}
	<div class="collapse collapse-arrow bg-base-100 mt-4">
		<input type="checkbox" bind:checked={showHistory} />
		<div class="collapse-title py-3">
			<p class="text-sm font-medium text-base-content/60">
				Weekly history{data.historyPage > 1 ? ` · page ${data.historyPage}` : ''}
			</p>
			<p class="text-xs text-base-content/30 mt-0.5">
				{#if data.showDates.length > 0}
					This week: {weekSold} sold{weekFill !== null ? ` · ${weekFill}% fill` : ''}
				{:else}
					No shows this week · {data.pastWeeks.length} weeks on this page
				{/if}
			</p>
		</div>
		<div class="collapse-content">
			<div class="overflow-x-auto">
				<table class="table table-sm w-auto min-w-full">
					<thead>
						<tr class="text-base-content/40 text-xs">
							<th>Week</th>
							<th class="text-right">Shows</th>
							<th class="text-right">Sold</th>
							<th class="text-right">Fill</th>
						</tr>
					</thead>
					<tbody>
						{#if data.historyPage === 1 && data.showDates.length > 0}
							<tr class="font-medium">
								<td>
									<div class="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
										<span>{formatWeekRange(data.weekStart, data.weekEnd)}</span>
										<span class="badge badge-primary badge-xs w-fit">this week</span>
									</div>
								</td>
								<td class="text-right tabular-nums">{data.showDates.length}</td>
								<td class="text-right tabular-nums">{weekSold}</td>
								<td class="text-right tabular-nums">{weekFill !== null ? `${weekFill}%` : '—'}</td>
							</tr>
						{/if}
						{#each data.pastWeeks as wk}
							{@const fill = wk.totalCapacity > 0 ? pct(wk.totalSold, wk.totalCapacity) : null}
							<tr class="text-base-content/70">
								<td>
									<a href="?week={wk.weekStart}" class="hover:text-base-content transition-colors">
										{formatWeekRange(wk.weekStart, addDays(wk.weekStart, 6))}
									</a>
								</td>
								<td class="text-right tabular-nums">{wk.showCount}</td>
								<td class="text-right tabular-nums">{wk.totalSold}</td>
								<td class="text-right tabular-nums">{fill !== null ? `${fill}%` : '—'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			{#if data.historyPage > 1 || data.hasOlderHistory}
				<div class="flex items-center justify-between pt-2 mt-1 border-t border-base-300">
					{#if data.hasOlderHistory}
						<a href="?week={data.weekStart}&hp={data.historyPage + 1}" class="btn btn-outline btn-xs gap-1">
							<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
							Older
						</a>
					{:else}
						<div></div>
					{/if}
					<span class="text-xs text-base-content/30">page {data.historyPage}</span>
					{#if data.historyPage > 1}
						<a href="?week={data.weekStart}&hp={data.historyPage - 1}" class="btn btn-outline btn-xs gap-1">
							Newer
							<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
						</a>
					{:else}
						<div></div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
{/if}
