<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const STATUS_LABELS: Record<string, string> = {
		to_contact: 'Contact',
		booked: 'Booked',
		cancelled: 'Cancelled'
	};
	const STATUS_BADGE: Record<string, string> = {
		booked: 'badge-success',
		to_contact: 'badge-warning',
		cancelled: 'badge-error badge-soft'
	};
	const STATUS_CYCLE: Record<string, string> = {
		to_contact: 'booked',
		booked: 'cancelled',
		cancelled: 'to_contact'
	};
	const ROLE_LABELS: Record<string, string> = {
		act: 'Act', headline: 'Headliner', mc: 'MC', support: 'Support', host: 'Host'
	};
	const ROLE_CYCLE: Record<string, string> = {
		act: 'headline', headline: 'mc', mc: 'support', support: 'host', host: 'act'
	};

	function formatDate(iso: string) {
		const [y, m, d] = iso.split('-').map(Number);
		return new Date(y, m - 1, d).toLocaleDateString('en-AU', {
			weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
		});
	}

	function igHandle(raw: string): string {
		if (raw.startsWith('http')) {
			const match = raw.match(/instagram\.com\/([^/?#]+)/);
			return match ? `@${match[1]}` : raw;
		}
		return raw.startsWith('@') ? raw : `@${raw}`;
	}

	function igUrl(raw: string): string {
		const handle = igHandle(raw).replace(/^@/, '');
		return `https://instagram.com/${handle}`;
	}

	const activeId = $derived(data.selectedShow?.id ?? '');

	function pageUrl(p: number) {
		return `?show=${activeId}&page=${p}`;
	}

	// New date form
	let showNewDate = $state(false);
	let newDateValue = $state(data.today);
	let createError = $state<string | null>(null);

	// Add-act inline form
	let addingToLineup = $state<string | null>(null);
	let addSearchQuery = $state('');
	let addSearchResults = $state<{ id: string; name: string; instagram: string | null }[]>([]);
	let addSelectedPerson = $state<{ id: string; name: string; instagram: string | null } | null>(null);
	let addRole = $state('act');
	let addStatus = $state('to_contact');
	let addSearchTimeout: ReturnType<typeof setTimeout>;

	function clearAddForm() {
		addSearchQuery = '';
		addSearchResults = [];
		addSelectedPerson = null;
		addRole = 'act';
		addStatus = 'to_contact';
	}

	function openAddForm(lineupId: string) {
		clearAddForm();
		addingToLineup = lineupId;
	}

	function onAddSearchInput() {
		clearTimeout(addSearchTimeout);
		addSelectedPerson = null;
		if (!addSearchQuery.trim()) { addSearchResults = []; return; }
		addSearchTimeout = setTimeout(async () => {
			const res = await fetch(`/api/people?q=${encodeURIComponent(addSearchQuery)}`);
			const json = await res.json();
			addSearchResults = json?.results ?? [];
		}, 200);
	}

	function selectAddPerson(person: { id: string; name: string; instagram: string | null }) {
		addSelectedPerson = person;
		addSearchQuery = person.name;
		addSearchResults = [];
	}

	async function submitAdd(lineupId: string) {
		const name = addSearchQuery.trim();
		if (!name) return;
		const fd = new FormData();
		fd.append('lineup_id', lineupId);
		fd.append('name', name);
		fd.append('role', addRole);
		fd.append('status', addStatus);
		if (addSelectedPerson) fd.append('person_id', addSelectedPerson.id);
		await fetch('?/addEntry', { method: 'POST', body: fd });
		clearAddForm();
		addingToLineup = null;
		await invalidateAll();
	}

	async function createPersonAndAdd(lineupId: string) {
		const name = addSearchQuery.trim();
		if (!name) return;
		const res = await fetch('/api/people', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
		const json = await res.json();
		if (json?.person) addSelectedPerson = json.person;
		await submitAdd(lineupId);
	}

	const addShowNewPerson = $derived(
		!!addSearchQuery.trim() && !addSelectedPerson &&
		!addSearchResults.some(p => p.name.toLowerCase() === addSearchQuery.trim().toLowerCase())
	);

	// Inline updates
	async function updateEntry(entryId: string, field: string, value: string) {
		const fd = new FormData();
		fd.append('entry_id', entryId);
		fd.append('field', field);
		fd.append('value', value);
		await fetch('?/updateEntry', { method: 'POST', body: fd });
		await invalidateAll();
	}

	async function removeEntry(entryId: string) {
		if (!confirm('Remove this act from the lineup?')) return;
		const fd = new FormData();
		fd.append('entry_id', entryId);
		await fetch('?/removeEntry', { method: 'POST', body: fd });
		await invalidateAll();
	}

	async function moveEntry(entryId: string, lineupId: string, direction: 'up' | 'down') {
		const fd = new FormData();
		fd.append('entry_id', entryId);
		fd.append('lineup_id', lineupId);
		fd.append('direction', direction);
		await fetch('?/moveEntry', { method: 'POST', body: fd });
		await invalidateAll();
	}

	let copyDoneId = $state<string | null>(null);

	async function downloadPersonPhoto(url: string, name: string) {
		try {
			const res = await fetch(url);
			const blob = await res.blob();
			const blobUrl = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = blobUrl;
			a.download = `${name.toLowerCase().replace(/\s+/g, '-')}.jpg`;
			a.click();
			URL.revokeObjectURL(blobUrl);
		} catch {
			window.open(url, '_blank');
		}
	}

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
		// Walk backward until before rangeStart
		while (cursor >= start) cursor.setDate(cursor.getDate() - interval);
		// Walk forward into range
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

		// Use oldest lineup as anchor so fortnightly alternating-week pattern is preserved
		const anchor = lineups[lineups.length - 1].showDate;
		const oldestDate = anchor;
		const lookAheadEnd = addDaysStr(data.today, 28);

		const allExpected = expectedDatesInRange(oldestDate, lookAheadEnd, interval, anchor);
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

	function copyLineup(lineup: (typeof data.tableLineups)[number]) {
		const showName = data.selectedShow?.name ?? '';
		const lines: string[] = [`${showName} – ${formatDate(lineup.showDate)}`, ''];
		const active = lineup.entries.filter((e) => e.status !== 'cancelled' && e.role !== 'support');
		const mcs = active.filter((e) => e.role === 'mc');
		const acts = active.filter((e) => e.role !== 'mc');
		mcs.forEach((e) => lines.push(`MC: ${e.name}`));
		acts.forEach((e, i) => {
			const roleSuffix = e.role !== 'act' ? ` (${ROLE_LABELS[e.role] ?? e.role})` : '';
			lines.push(`${i + 1}. ${e.name}${roleSuffix}`);
		});
		if (active.length === 0) lines.push('(no acts yet)');
		navigator.clipboard.writeText(lines.join('\n'));
		copyDoneId = lineup.id;
		setTimeout(() => { copyDoneId = null; }, 2000);
	}
</script>

<svelte:head><title>Table — Lineups</title></svelte:head>

<!-- View switcher -->
<div class="flex items-center gap-1 mb-5">
	<a href="/accounts/{data.accountMeta.id}/lineups" class="btn btn-xs btn-outline gap-1">
		<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="14" x2="8" y2="18"/></svg>
		Week
	</a>
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
		{#each data.shows as show}
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
			<form
				method="POST"
				action="?/createLineup"
				class="flex items-end gap-2"
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
			{#each displayItems as item, idx}
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
					<div class="rounded-2xl border border-dashed border-base-content/20 px-4 py-3 flex items-center justify-between gap-4">
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
				{@const lineup = item.lineup}
				{@const active = lineup.entries.filter(e => e.status !== 'cancelled' && e.role !== 'support')}
				{@const cap = data.selectedShow?.actsPerShow}
				{@const pct = cap && cap > 0 ? Math.round((active.length / cap) * 100) : null}
				<div class="rounded-2xl bg-base-100 border border-base-200 overflow-hidden shadow-md">

					<!-- Date header -->
					<div class="flex items-center justify-between px-4 py-3 border-b border-base-200/60 bg-base-200/30">
						<div>
							<span class="font-semibold text-sm">{formatDate(lineup.showDate)}</span>
							{#if lineup.notes}
								<p class="text-xs text-base-content/40 mt-0.5 truncate max-w-xs">{lineup.notes}</p>
							{/if}
						</div>
						<div class="flex items-center gap-3 shrink-0">
							{#if cap}
								<div class="flex items-center gap-1.5">
									<div class="w-16 h-1.5 bg-base-300 rounded-full overflow-hidden">
										<div class="h-full rounded-full {pct != null && pct > 100 ? 'bg-error' : pct === 100 ? 'bg-success' : 'bg-primary'}"
											style="width: {Math.min(100, pct ?? 0)}%"></div>
									</div>
									<span class="text-xs tabular-nums text-base-content/50">{active.length}/{cap}</span>
								</div>
							{:else}
								<span class="text-xs text-base-content/40">{active.length} {active.length === 1 ? 'act' : 'acts'}</span>
							{/if}
							<button
								onclick={() => copyLineup(lineup)}
								class="btn btn-xs {copyDoneId === lineup.id ? 'btn-success' : 'btn-outline'} gap-1 transition-all"
								title="Copy lineup to clipboard"
							>
								{#if copyDoneId === lineup.id}
									<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
									<span class="hidden sm:inline">Copied</span>
								{:else}
									<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
									<span class="hidden sm:inline">Copy</span>
								{/if}
							</button>
							<button
								onclick={() => openAddForm(lineup.id)}
								class="btn btn-xs {addingToLineup === lineup.id ? 'btn-soft' : 'btn-outline'} gap-1"
							>
								<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
								Add act
							</button>
						</div>
					</div>

					<!-- Inline add-act form (only when this lineup is active) -->
					{#if addingToLineup === lineup.id}
						<div class="px-4 py-3 border-b border-base-200/60 bg-base-200/10">
							<div class="flex flex-col gap-2">
								<!-- Name search (full width) -->
								<div class="relative w-full">
									<input
										type="text"
										bind:value={addSearchQuery}
										oninput={onAddSearchInput}
										onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitAdd(lineup.id); } if (e.key === 'Escape') { addingToLineup = null; clearAddForm(); } }}
										placeholder="Search or type a name…"
										autofocus
										class="input input-sm w-full"
									/>
									{#if (addSearchResults.length > 0 || addShowNewPerson) && !addSelectedPerson}
										<div class="absolute left-0 top-full mt-1.5 bg-base-200 border border-base-content/20 rounded-xl shadow-xl z-30 w-full max-h-48 overflow-y-auto divide-y divide-base-content/8">
											{#each addSearchResults as person}
												<button
													type="button"
													onclick={() => selectAddPerson(person)}
													class="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-base-content/10 active:bg-base-content/15 text-left transition-colors"
												>
													<svg class="h-3.5 w-3.5 text-base-content/30 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
													<span class="font-medium text-sm">{person.name}</span>
													{#if person.instagram}
														<span class="text-xs text-base-content/40 ml-auto shrink-0">{igHandle(person.instagram)}</span>
													{/if}
												</button>
											{/each}
											{#if addShowNewPerson}
												<button
													type="button"
													onclick={() => createPersonAndAdd(addingToLineup!)}
													class="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-primary/10 active:bg-primary/15 text-left transition-colors text-primary"
												>
													<svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
													<span class="font-medium text-sm">Create "<span class="font-semibold">{addSearchQuery.trim()}</span>" as new person</span>
												</button>
											{/if}
										</div>
									{/if}
								</div>
								<!-- Controls always on their own row -->
								<div class="flex items-center gap-2">
									<select bind:value={addRole} class="select select-sm flex-1 sm:flex-none">
										{#each Object.entries(ROLE_LABELS) as [val, label]}
											<option value={val}>{label}</option>
										{/each}
									</select>
									<select bind:value={addStatus} class="select select-sm flex-1 sm:flex-none">
										{#each Object.entries(STATUS_LABELS) as [val, label]}
											<option value={val}>{label}</option>
										{/each}
									</select>
									<button
										type="button"
										onclick={() => submitAdd(lineup.id)}
										disabled={!addSearchQuery.trim()}
										class="btn btn-sm btn-primary shrink-0 disabled:opacity-40"
									>Add</button>
									<button
										type="button"
										onclick={() => { addingToLineup = null; clearAddForm(); }}
										class="btn btn-sm btn-outline shrink-0"
									>Cancel</button>
								</div>
							</div>
						</div>
					{/if}

					<!-- Table -->
					{#if lineup.entries.length === 0}
						<p class="px-4 py-3 text-xs text-base-content/30 italic">No acts yet — click Add act to get started.</p>
					{:else}
						<div class="overflow-x-auto">
							<table class="table table-sm w-full">
								<thead class="text-xs text-base-content/40">
									<tr>
										<th class="w-14 pr-1">#</th>
										<th class="w-48 max-w-xs">Name</th>
										<th class="w-32 hidden sm:table-cell">Instagram</th>
										<th class="w-24">Status</th>
										<th class="hidden md:table-cell">Notes</th>
										<th class="w-8"></th>
									</tr>
								</thead>
								<tbody>
									{#each lineup.entries as entry, i}
										<tr class="{entry.status === 'cancelled' ? 'opacity-40' : ''}">

											<!-- # with sort arrows (MCs are always first, no reordering) -->
											<td class="w-14 pr-1">
												{#if entry.role === 'mc'}
													<div class="w-14 flex justify-center">
														<span class="text-xs font-bold text-primary/50">MC</span>
													</div>
												{:else}
													{@const nonMcEntries = lineup.entries.filter(e => e.role !== 'mc')}
													{@const nonMcIdx = nonMcEntries.findIndex(e => e.id === entry.id)}
													<div class="flex items-center gap-0.5">
														<button
															onclick={() => moveEntry(entry.id, lineup.id, 'up')}
															disabled={nonMcIdx === 0}
															class="btn btn-xs btn-outline btn-square w-6 h-6 min-h-0 p-0 disabled:opacity-20"
															title="Move up"
														>
															<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
														</button>
														<span class="hidden sm:inline text-xs text-base-content/30 tabular-nums w-4 text-center">{nonMcIdx + 1}</span>
														<button
															onclick={() => moveEntry(entry.id, lineup.id, 'down')}
															disabled={nonMcIdx === nonMcEntries.length - 1}
															class="btn btn-xs btn-outline btn-square w-6 h-6 min-h-0 p-0 disabled:opacity-20"
															title="Move down"
														>
															<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
														</button>
													</div>
												{/if}
											</td>

											<!-- Name + clickable role -->
											<td>
												<p class="font-medium text-sm {entry.status === 'cancelled' ? 'line-through' : ''}">{entry.name}</p>
												<button
													onclick={() => updateEntry(entry.id, 'role', ROLE_CYCLE[entry.role] ?? 'act')}
													class="text-xs text-base-content/40 hover:text-primary transition-colors mt-0.5 leading-none"
													title="Click to change role"
												>
													{ROLE_LABELS[entry.role] ?? entry.role}
												</button>
												{#if entry.instagram}
													<a href={igUrl(entry.instagram)} target="_blank" rel="noopener"
														class="text-xs text-primary/70 hover:text-primary block truncate sm:hidden mt-0.5"
														title={igHandle(entry.instagram)}
													>{igHandle(entry.instagram)}</a>
												{/if}
											</td>

											<!-- Instagram -->
											<td class="w-32 max-w-32 hidden sm:table-cell">
												{#if entry.instagram}
													<a href={igUrl(entry.instagram)} target="_blank" rel="noopener"
														class="text-xs text-primary/70 hover:text-primary transition-colors block truncate"
														title={igHandle(entry.instagram)}>
														{igHandle(entry.instagram)}
													</a>
												{:else}
													<span class="text-xs text-base-content/20">—</span>
												{/if}
											</td>

											<!-- Status — click to cycle -->
											<td class="w-24">
												<button
													class="badge badge-sm {STATUS_BADGE[entry.status] ?? 'badge-neutral'} cursor-pointer select-none"
													onclick={() => updateEntry(entry.id, 'status', STATUS_CYCLE[entry.status] ?? 'to_contact')}
													title="Click to change status"
												>
													{STATUS_LABELS[entry.status] ?? entry.status}
												</button>
											</td>

											<!-- Notes — click to edit -->
											<td class="hidden md:table-cell">
												<input
													type="text"
													value={entry.notes ?? ''}
													placeholder="Add notes…"
													onblur={(e) => {
														if (e.currentTarget.value !== (entry.notes ?? '')) {
															updateEntry(entry.id, 'notes', e.currentTarget.value);
														}
													}}
													class="input input-xs border-transparent bg-transparent hover:bg-base-200 focus:bg-base-100 focus:border-base-300 w-full max-w-52 transition-colors"
												/>
											</td>

											<!-- Download + Remove -->
											<td class="w-16">
												<div class="flex items-center justify-end gap-2">
													{#if entry.photoUrl}
														<button
															onclick={() => downloadPersonPhoto(entry.photoUrl!, entry.name)}
															class="btn btn-xs btn-outline btn-square w-6 h-6 min-h-0 p-0"
															title="Download {entry.name}'s photo"
														>
															<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
														</button>
													{/if}
													<button
														onclick={() => removeEntry(entry.id)}
														class="btn btn-xs btn-outline btn-square w-6 h-6 min-h-0 p-0 border-error/30 text-error hover:bg-error hover:text-error-content hover:border-error"
														title="Remove act"
													>
														<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
													</button>
												</div>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
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
