<!--
  +page.svelte — /accounts/[id]/lineups/table
  Paginated table view of lineups. Renders a show tab bar, a "new date" form,
  and a list of LineupCard components (or placeholder rows for expected-but-missing
  weekly/fortnightly dates). Older/newer pagination links sit at the bottom.

  Svelte features:
    $state     — showNewDate, newDateValue, createError
    $derived.by — displayItems: merges real lineups with placeholder dates for
                  weekly/fortnightly shows, sorted newest-first
    $props()   — receives data (shows, selectedShow, tableLineups, page, totalPages, today)
    use:enhance — on the create-lineup form; navigates to page 1 on success
    goto()     — navigates to a different page after lineup creation
    invalidateAll() — refreshes table data after createLineupForDate() direct fetch
-->

<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidateAll, afterNavigate } from '$app/navigation';
	import LineupCard from '$lib/components/LineupCard.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function formatDate(iso: string) {
		const [y, m, d] = iso.split('-').map(Number);
		return new Date(y, m - 1, d).toLocaleDateString('en-AU', {
			weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
		});
	}

	const activeId = $derived(data.selectedShow?.id ?? '');

	function pageUrl(p: number) {
		return `?show=${activeId}&page=${p}`;
	}

	// New date form
	let showNewDate = $state(false);
	let newDateValue = $state(data.today);
	let createError = $state<string | null>(null);

	// --- Placeholder logic for weekly/fortnightly shows ---

	function addDaysStr(dateStr: string, n: number): string {
		const d = new Date(dateStr + 'T12:00:00');
		d.setDate(d.getDate() + n);
		return d.toISOString().slice(0, 10);
	}

	function expectedDatesInRange(rangeStart: string, rangeEnd: string, interval: number, anchor: string): string[] {
		const start = new Date(rangeStart + 'T12:00:00');
		const end = new Date(rangeEnd + 'T12:00:00');
		const cursor = new Date(anchor + 'T12:00:00');
		while (cursor >= start) cursor.setDate(cursor.getDate() - interval);
		cursor.setDate(cursor.getDate() + interval);
		const dates: string[] = [];
		while (cursor <= end) {
			dates.push(cursor.toISOString().slice(0, 10));
			cursor.setDate(cursor.getDate() + interval);
		}
		return dates;
	}

	type LineupItem = { type: 'lineup'; lineup: (typeof data.tableLineups)[number]; date: string };
	type PlaceholderItem = { type: 'placeholder'; date: string };

	const displayItems = $derived.by((): (LineupItem | PlaceholderItem)[] => {
		const show = data.selectedShow;
		const lineups = data.tableLineups;
		const interval =
			show?.scheduleType === 'weekly' ? 7 :
			show?.scheduleType === 'fortnightly' ? 14 : 0;

		const lineupItems: LineupItem[] = lineups.map(l => ({ type: 'lineup', lineup: l, date: l.showDate }));

		if (!interval || lineups.length === 0) return lineupItems;

		const anchor = lineups[lineups.length - 1].showDate;
		const lookAheadEnd = addDaysStr(data.today, 28);
		const allExpected = expectedDatesInRange(anchor, lookAheadEnd, interval, anchor);
		const existingDates = new Set(lineups.map(l => l.showDate));

		const placeholders: PlaceholderItem[] = allExpected
			.filter(d => !existingDates.has(d))
			.map(d => ({ type: 'placeholder', date: d }));

		return [...lineupItems, ...placeholders].sort((a, b) => b.date.localeCompare(a.date));
	});

	async function createLineupForDate(date: string) {
		const fd = new FormData();
		fd.append('show_id', activeId);
		fd.append('show_date', date);
		await fetch('?/createLineup', { method: 'POST', body: fd });
		await invalidateAll();
	}

	afterNavigate(() => {
		if (data.focusDate) {
			const el = document.getElementById(`date-${data.focusDate}`);
			el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	});
</script>

<svelte:head><title>Lineups — Sched</title></svelte:head>

<!-- View switcher -->
<div class="flex items-center gap-1 mb-5">
	<span class="btn btn-xs btn-primary gap-1 cursor-default">
		<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="9" x2="9" y2="21"/><line x1="15" y1="9" x2="15" y2="21"/></svg>
		Table
	</span>
	<a href="/accounts/{data.accountMeta.id}/lineups/calendar" class="btn btn-xs btn-outline gap-1">
		<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
		Calendar
	</a>
</div>

{#if data.shows.length === 0}
	<div class="py-12 text-center text-sm text-base-content/40">
		No shows set up for this account yet.<br />
		An admin can add shows under <a href="/admin/accounts" class="link">Accounts → Manage</a>.
	</div>
{:else}
	<!-- Show tabs -->
	<div role="tablist" class="tabs tabs-border mb-4 overflow-x-auto flex-nowrap -mx-3 px-3 sm:mx-0 sm:px-0">
		{#each data.shows as show (show.id)}
			<a role="tab" href="?show={show.id}" data-sveltekit-preload-data="tap" class="tab shrink-0 {show.id === activeId ? 'tab-active' : ''}">
				{show.name}
			</a>
		{/each}
	</div>

	<!-- Toolbar -->
	<div class="flex items-center justify-between mb-4">
		<p class="text-xs text-base-content/40">
			{data.totalPages > 1 ? `Page ${data.page} of ${data.totalPages} · ` : ''}{data.selectedShow?.name ?? ''}
		</p>
		{#if !showNewDate}
			<button onclick={() => { showNewDate = true; createError = null; }} class="btn btn-sm btn-outline gap-1">
				<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
				New date
			</button>
		{/if}
	</div>

	<!-- New date form -->
	{#if showNewDate}
		<div class="rounded-2xl bg-base-100 border border-base-200 p-4 mb-4">
			<p class="text-sm font-semibold mb-3">Create lineup for {data.selectedShow?.name ?? 'show'}</p>
			{#if createError}
				<p class="text-sm text-error mb-2">{createError}</p>
			{/if}
			<form method="POST" action="?/createLineup" class="flex items-end gap-2"
				use:enhance={() => {
					return async ({ result }) => {
						if (result.type === 'success') {
							showNewDate = false;
							newDateValue = data.today;
							createError = null;
							await goto(pageUrl(1));
						} else if (result.type === 'failure') {
							createError = (result.data as { error?: string })?.error ?? 'Failed to create lineup';
						}
					};
				}}
			>
				<input type="hidden" name="show_id" value={activeId} />
				<fieldset class="fieldset flex-1">
					<legend class="fieldset-legend">Date</legend>
					<input type="date" name="show_date" required bind:value={newDateValue} class="input input-sm w-full" />
				</fieldset>
				<button type="submit" class="btn btn-sm btn-primary mb-0.5">Create</button>
				<button type="button" onclick={() => { showNewDate = false; createError = null; }} class="btn btn-sm btn-outline mb-0.5">Cancel</button>
			</form>
		</div>
	{/if}

	{#if data.tableLineups.length === 0}
		<div class="py-12 text-center text-sm text-base-content/40">No lineups yet for this show.</div>
	{:else}
		<div class="flex flex-col gap-6">
			{#each displayItems as item, idx (item.date + item.type)}
				{#if item.date < data.today && (idx === 0 || displayItems[idx - 1].date >= data.today)}
					<div class="flex items-center gap-3 py-1">
						<div class="flex-1 h-px bg-base-content/20"></div>
						<div class="flex items-center gap-1.5 px-3 py-1 rounded-full bg-base-content/8 border border-base-content/15">
							<svg class="h-3 w-3 text-base-content/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
							<span class="text-xs font-semibold text-base-content/40 uppercase tracking-widest">Past shows</span>
						</div>
						<div class="flex-1 h-px bg-base-content/20"></div>
					</div>
				{/if}

				{#if item.type === 'placeholder'}
					<div id="date-{item.date}" class="rounded-2xl border border-dashed border-base-content/20 px-4 py-3 flex items-center justify-between gap-4">
						<div>
							<span class="text-sm text-base-content/50">{formatDate(item.date)}</span>
							<p class="text-xs text-base-content/30 mt-0.5">No lineup created</p>
						</div>
						<button onclick={() => createLineupForDate(item.date)} class="btn btn-xs btn-outline gap-1 shrink-0">
							<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
							Create lineup
						</button>
					</div>
				{:else}
					<div id="date-{item.date}">
						<LineupCard lineup={item.lineup} selectedShow={data.selectedShow} today={data.today} accountId={data.accountMeta.id} canvaTemplateId={data.selectedShow?.canvaTemplateId ?? null} />
					</div>
				{/if}
			{/each}
		</div>

		{#if data.totalPages > 1}
			<div class="flex items-center justify-between mt-4">
				{#if data.page < data.totalPages}
					<a href={pageUrl(data.page + 1)} class="btn btn-sm btn-outline gap-1">
						<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
						Older
					</a>
				{:else}
					<div></div>
				{/if}
				<span class="text-xs text-base-content/40">{data.page} / {data.totalPages}</span>
				{#if data.page > 1}
					<a href={pageUrl(data.page - 1)} class="btn btn-sm btn-outline gap-1">
						Newer
						<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
					</a>
				{:else}
					<div></div>
				{/if}
			</div>
		{/if}
	{/if}
{/if}
