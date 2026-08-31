<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
	const MONTHS = [
		'January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'September', 'October', 'November', 'December'
	];

	// Palette per show — cycles if more than 6 shows.
	// Avoid 'secondary' — it varies wildly across themes and is often unreadable at low opacity.
	const PALETTES = [
		'bg-primary/25 text-primary hover:bg-primary/35',
		'bg-success/25 text-success hover:bg-success/35',
		'bg-warning/35 text-warning hover:bg-warning/45',
		'bg-info/25 text-info hover:bg-info/35',
		'bg-error/20 text-error hover:bg-error/30',
		'bg-accent/25 text-accent hover:bg-accent/35',
	];

	const showMap = $derived(new Map(data.shows.map((s) => [s.id, s])));
	const showPalette = $derived(new Map(data.shows.map((s, i) => [s.id, PALETTES[i % PALETTES.length]])));

	// Group lineups by date
	const lineupsByDate = $derived(
		data.monthLineups.reduce((map, l) => {
			if (!map.has(l.showDate)) map.set(l.showDate, []);
			map.get(l.showDate)!.push(l);
			return map;
		}, new Map<string, typeof data.monthLineups>())
	);

	// Build calendar grid: array of { date: string | null, day: number | null }
	const calendarCells = $derived.by(() => {
		const [y, m] = data.month.split('-').map(Number);
		const firstDOW = new Date(y, m - 1, 1).getDay(); // 0=Sun..6=Sat
		const leadingBlanks = firstDOW === 0 ? 6 : firstDOW - 1; // convert to Mon-first
		const lastDay = new Date(y, m, 0).getDate();

		const cells: Array<{ date: string | null; day: number | null }> = [];
		for (let i = 0; i < leadingBlanks; i++) cells.push({ date: null, day: null });
		for (let d = 1; d <= lastDay; d++) {
			cells.push({ date: `${data.month}-${String(d).padStart(2, '0')}`, day: d });
		}
		while (cells.length % 7 !== 0) cells.push({ date: null, day: null });
		return cells;
	});

	const monthLabel = $derived.by(() => {
		const [y, m] = data.month.split('-').map(Number);
		return `${MONTHS[m - 1]} ${y}`;
	});
	const isCurrentMonth = $derived(data.month === data.today.slice(0, 7));
</script>

<svelte:head><title>Calendar — Lineups</title></svelte:head>

<!-- View switcher -->
<div class="flex items-center gap-1 mb-5">
	<a href="/accounts/{data.accountMeta.id}/lineups" class="btn btn-xs btn-outline gap-1">
		<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="14" x2="8" y2="18"/></svg>
		Week
	</a>
	<a href="/accounts/{data.accountMeta.id}/lineups/table" class="btn btn-xs btn-outline gap-1">
		<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="9" x2="9" y2="21"/><line x1="15" y1="9" x2="15" y2="21"/></svg>
		Table
	</a>
	<span class="btn btn-xs btn-primary gap-1 cursor-default">
		<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
		Calendar
	</span>
</div>

<!-- Month navigation -->
<div class="mb-5 flex items-center justify-center gap-2">
	<a href="?month={data.prevMonth}" class="btn btn-sm btn-outline btn-square" aria-label="Previous month">
		<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
	</a>
	<div class="text-center min-w-36">
		<p class="font-semibold text-sm">{monthLabel}</p>
		{#if !isCurrentMonth}
			<a href="?" class="text-xs text-base-content/40 hover:text-primary transition-colors">↩ This month</a>
		{/if}
	</div>
	<a href="?month={data.nextMonth}" class="btn btn-sm btn-outline btn-square" aria-label="Next month">
		<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
	</a>
</div>

<!-- Show legend -->
{#if data.shows.length > 0}
	<div class="flex flex-wrap gap-2 mb-4">
		{#each data.shows as show, i}
			<span class="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full {PALETTES[i % PALETTES.length].split(' ').slice(0, 2).join(' ')}">
				{show.name}
			</span>
		{/each}
	</div>
{/if}

<!-- Calendar grid -->
<div class="rounded-2xl overflow-hidden border border-base-200">
	<!-- Day headers -->
	<div class="grid grid-cols-7 border-b border-base-200">
		{#each DAYS as day}
			<div class="py-2 text-center text-xs font-semibold text-base-content/40 bg-base-200/50">{day}</div>
		{/each}
	</div>

	<!-- Weeks -->
	<div class="grid grid-cols-7 divide-x divide-y divide-base-200">
		{#each calendarCells as cell}
			<div class="min-h-20 p-1.5 bg-base-100 relative
				{cell.date === data.today ? 'bg-primary/5' : ''}">
				{#if cell.day !== null && cell.date !== null}
					<span class="text-xs font-medium leading-none
						{cell.date === data.today ? 'inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-content font-bold' : 'text-base-content/40'}">
						{cell.day}
					</span>
					{@const dayLineups = lineupsByDate.get(cell.date) ?? []}
					{#if dayLineups.length > 0}
						<div class="flex flex-col gap-0.5 mt-1">
							{#each dayLineups as lineup}
								{@const show = showMap.get(lineup.showId)}
								{@const palette = showPalette.get(lineup.showId) ?? PALETTES[0]}
								<a
									href="/accounts/{data.accountMeta.id}/lineups/{lineup.id}"
									class="block text-xs px-1.5 py-0.5 rounded transition truncate {palette}"
									title="{show?.name ?? ''} · {lineup.entryCount} acts"
								>
									<span class="truncate">{show?.name ?? '–'}</span>
									{#if show?.actsPerShow}
										<span class="opacity-50 ml-1 tabular-nums">{lineup.entryCount}/{show.actsPerShow}</span>
									{:else}
										<span class="opacity-50 ml-1 tabular-nums">{lineup.entryCount}</span>
									{/if}
								</a>
							{/each}
						</div>
					{/if}
				{/if}
			</div>
		{/each}
	</div>
</div>

{#if data.monthLineups.length === 0}
	<p class="text-center text-sm text-base-content/40 mt-6">No lineups this month.</p>
{/if}
