<!--
  +page.svelte — /accounts/[id]/lineups
  Week view for lineups. Shows prev/next week navigation, a calendar-jump input,
  and a card per show with its lineup for the selected week (or an "open lineup"
  button if none exists). Weekly shows get a computed "expected date" for the week.

  Svelte features:
    $state     — calendarValue (date input for jumping to a specific week)
    $derived   — weekShows: merges data.shows with the selected week's lineups
                 and computes expectedDate for weekly/fortnightly show schedules
    $props()   — receives data (shows, lineups, weekStart, weekEnd) and form
    use:enhance — on the openLineup form; on success, the server redirects to the
                  lineup page (the action uses redirect(), not return data)
    goto()     — navigates to the selected week when the calendar input changes
-->

<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let calendarInput = $state<HTMLInputElement | undefined>();

	const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	function formatDate(iso: string) {
		return new Date(iso + 'T12:00:00').toLocaleDateString('en-AU', {
			weekday: 'short', day: 'numeric', month: 'short'
		});
	}

	function formatWeekRange(start: string, end: string) {
		const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
		return `${new Date(start + 'T12:00:00').toLocaleDateString('en-AU', opts)} – ${new Date(end + 'T12:00:00').toLocaleDateString('en-AU', opts)}`;
	}

	function getMondayOf(dateStr: string) {
		const d = new Date(dateStr + 'T12:00:00');
		const day = d.getDay();
		d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
		return d.toISOString().slice(0, 10);
	}

	// Given a show with a scheduleDayOfWeek, return that day's date within the current week
	function showDateInWeek(scheduleDayOfWeek: number | null): string | null {
		if (scheduleDayOfWeek == null) return null;
		// weekStart is Monday; daysFromMonday: Mon=0, Tue=1 ... Sun=6
		const offset = scheduleDayOfWeek === 0 ? 6 : scheduleDayOfWeek - 1;
		const d = new Date(data.weekStart + 'T12:00:00');
		d.setDate(d.getDate() + offset);
		return d.toISOString().slice(0, 10);
	}

	const isCurrentWeek = $derived(data.weekStart === getMondayOf(data.today));

	// Build per-show view: lineup exists this week, or weekly show with expected date
	const weekShows = $derived(
		data.shows.flatMap((show) => {
			const existingLineup = data.weekLineups.find((l) => l.showId === show.id);
			const expectedDate = show.scheduleType === 'weekly' ? showDateInWeek(show.scheduleDayOfWeek) : null;
			if (existingLineup || expectedDate) {
				return [{ show, existingLineup: existingLineup ?? null, expectedDate }];
			}
			// Non-weekly shows: only appear if they have a lineup this week
			const anyLineup = data.weekLineups.find((l) => l.showId === show.id);
			return anyLineup ? [{ show, existingLineup: anyLineup, expectedDate: null }] : [];
		})
	);
</script>

<svelte:head><title>Lineups</title></svelte:head>

{#if form?.error}
	<div role="alert" class="alert alert-error alert-soft mb-4 text-sm">{form.error}</div>
{/if}

<!-- View switcher -->
<div class="flex items-center gap-1 mb-3">
	<span class="btn btn-xs btn-primary gap-1 cursor-default">
		<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="14" x2="8" y2="18"/></svg>
		Week
	</span>
	<a href="lineups/table" class="btn btn-xs btn-outline gap-1">
		<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="9" x2="9" y2="21"/><line x1="15" y1="9" x2="15" y2="21"/></svg>
		Table
	</a>
	<a href="lineups/calendar" class="btn btn-xs btn-outline gap-1">
		<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
		Calendar
	</a>
</div>

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
		<!-- Week jump -->
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

{#if data.shows.length === 0}
	<div class="py-12 text-center text-sm text-base-content/40">
		No shows set up for this account yet.<br />
		An admin can add shows under <a href="/admin/accounts" class="link">Accounts → Manage</a>.
	</div>
{:else if weekShows.length === 0}
	<div role="alert" class="alert alert-soft">
		<svg class="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
		<div>
			<p class="font-medium">No lineups this week</p>
			<p class="text-sm opacity-70">Use the arrows to browse other weeks, or jump to a date with the calendar.</p>
		</div>
	</div>
{:else}
	<div class="flex flex-col gap-3">
		{#each weekShows as { show, existingLineup, expectedDate }}
			{@const showDate = existingLineup?.showDate ?? expectedDate}
			<div class="rounded-2xl bg-base-100 border border-base-200 overflow-hidden">
				<div class="px-4 py-3 border-b border-base-200/60">
					<p class="font-semibold text-sm">{show.name}</p>
					{#if show.scheduleType}
						<p class="text-xs text-base-content/40 mt-0.5">
							{show.scheduleType === 'weekly' ? 'Weekly' : show.scheduleType === 'fortnightly' ? 'Fortnightly' : show.scheduleType === 'monthly' ? 'Monthly' : 'One-off'}
							{show.scheduleDayOfWeek != null ? ` · ${DAYS[show.scheduleDayOfWeek]}s` : ''}
						</p>
					{/if}
				</div>

				{#if existingLineup}
					{@const count = existingLineup.entryCount}
					{@const cap = show.actsPerShow}
					{@const pct = cap && cap > 0 ? Math.round((count / cap) * 100) : null}
					{@const isFull = cap != null && count >= cap}
					{@const isOver = cap != null && count > cap}
					<a
						href="/accounts/{data.accountMeta.id}/lineups/{existingLineup.id}"
						class="flex items-center justify-between px-4 py-3 hover:bg-base-200/50 transition-colors gap-3"
					>
						<div class="min-w-0 flex-1">
							<p class="text-sm font-medium">{formatDate(existingLineup.showDate)}</p>
							{#if cap}
								<div class="flex items-center gap-2 mt-1.5">
									<progress
										class="progress flex-1 h-1.5 {isOver ? 'progress-error' : pct != null && pct >= 100 ? 'progress-success' : pct != null && pct >= 70 ? 'progress-warning' : 'progress-primary'}"
										value={count}
										max={cap}
									></progress>
									<span class="text-xs tabular-nums text-base-content/50 shrink-0">
										{#if isOver}
											<span class="text-error font-medium">{count}/{cap} · over</span>
										{:else if isFull}
											<span class="text-success font-medium">Full ({count}/{cap})</span>
										{:else}
											{count}/{cap} acts
										{/if}
									</span>
								</div>
							{:else}
								<p class="text-xs text-base-content/40 mt-0.5">{count} {count === 1 ? 'act' : 'acts'}</p>
							{/if}
						</div>
						<svg class="h-4 w-4 text-base-content/30 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
					</a>
				{:else if expectedDate}
					<form method="POST" action="?/openLineup" use:enhance class="flex items-center justify-between px-4 py-3">
						<input type="hidden" name="show_id" value={show.id} />
						<input type="hidden" name="show_date" value={expectedDate} />
						<div>
							<p class="text-sm font-medium">{formatDate(expectedDate)}</p>
							<p class="text-xs text-base-content/40 mt-0.5">No lineup yet</p>
						</div>
						<button type="submit" class="btn btn-sm btn-primary shrink-0">Create lineup</button>
					</form>
				{/if}
			</div>
		{/each}
	</div>
{/if}

<!-- All shows for non-weekly (only shown when they don't appear in the week view) -->
{#if data.shows.some(s => s.scheduleType !== 'weekly' && !data.weekLineups.find(l => l.showId === s.id))}
	<details class="mt-5 text-sm">
		<summary class="cursor-pointer text-base-content/40 select-none py-2">Other shows (no lineup this week)</summary>
		<div class="flex flex-col gap-2 mt-2">
			{#each data.shows.filter(s => s.scheduleType !== 'weekly' && !data.weekLineups.find(l => l.showId === s.id)) as show}
				<div class="rounded-2xl bg-base-100 border border-base-200 overflow-hidden">
					<div class="px-4 py-3">
						<p class="font-medium text-sm">{show.name}</p>
						{#if show.scheduleType}
							<p class="text-xs text-base-content/40">{show.scheduleType}</p>
						{/if}
					</div>
					<form method="POST" action="?/openLineup" use:enhance class="px-4 pb-3 flex items-end gap-2">
						<input type="hidden" name="show_id" value={show.id} />
						<fieldset class="fieldset flex-1">
							<legend class="fieldset-legend">Date</legend>
							<input type="date" name="show_date" required class="input input-sm w-full" value={data.today} />
						</fieldset>
						<button type="submit" class="btn btn-sm btn-primary mb-0.5">Open lineup</button>
					</form>
				</div>
			{/each}
		</div>
	</details>
{/if}
