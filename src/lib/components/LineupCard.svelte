<!--
  LineupCard.svelte
  Card displaying a single lineup in the paginated table view. Shows a capacity
  progress bar, editable notes, an entry table with status/role cycle buttons,
  move-up/down controls, and an AddActForm for adding acts without leaving the page.

  Mutations are sent via fetch('?/actionName', { method: 'POST', body: fd }) +
  invalidateAll() rather than <form use:enhance>, because this card lives inside a
  paginated list and a traditional form submit would navigate away.

  Svelte features:
    $state       — expandedNotes, editingNotes, notesText, movingId, removingId
    $derived     — activeCount (non-cancelled non-support acts), capacityPct, isPast
    invalidateAll() — from $app/navigation; re-runs all load functions after each
                      mutation so the table refreshes without a hard navigation

  Props:
    lineup        Lineup       — the lineup to display (includes entries[])
    selectedShow  Show | null  — the parent show (provides actsPerShow for capacity)
    today         string       — ISO date (YYYY-MM-DD) for "is this show in the past?"
-->

<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	type Entry = {
		id: string; lineupId: string; name: string; role: string; status: string;
		notes: string | null; instagram: string | null; photoUrl: string | null;
	};
	type Lineup = { id: string; showDate: string; notes: string | null; entries: Entry[] };
	type Show = { id: string; name: string; actsPerShow: number | null };

	let { lineup, selectedShow, today, accountId = '', canvaTemplateId = null }: {
		lineup: Lineup; selectedShow: Show | null; today: string;
		accountId?: string; canvaTemplateId?: string | null;
	} = $props();

	const STATUS_LABELS: Record<string, string> = { to_contact: 'Contact', booked: 'Booked', cancelled: 'Cancelled' };
	const STATUS_BADGE: Record<string, string> = { booked: 'badge-success', to_contact: 'badge-warning', cancelled: 'badge-error badge-soft' };
	const STATUS_CYCLE: Record<string, string> = { to_contact: 'booked', booked: 'cancelled', cancelled: 'to_contact' };
	const ROLE_LABELS: Record<string, string> = { act: 'Act', headline: 'Headliner', mc: 'MC', support: 'Support', host: 'Host' };
	const ROLE_CYCLE: Record<string, string> = { act: 'headline', headline: 'mc', mc: 'support', support: 'host', host: 'act' };

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
		return `https://instagram.com/${igHandle(raw).replace(/^@/, '')}`;
	}

	// Add-act inline form state
	let showAddForm = $state(false);
	let addSearchQuery = $state('');
	let addSearchResults = $state<{ id: string; name: string; instagram: string | null }[]>([]);
	let addSelectedPerson = $state<{ id: string; name: string; instagram: string | null } | null>(null);
	let addRole = $state('act');
	let addStatus = $state('to_contact');
	let addSearchTimeout: ReturnType<typeof setTimeout>;

	let copyDone = $state(false);

	function clearAddForm() {
		addSearchQuery = '';
		addSearchResults = [];
		addSelectedPerson = null;
		addRole = 'act';
		addStatus = 'to_contact';
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

	async function submitAdd() {
		const name = addSearchQuery.trim();
		if (!name) return;
		const fd = new FormData();
		fd.append('lineup_id', lineup.id);
		fd.append('name', name);
		fd.append('role', addRole);
		fd.append('status', addStatus);
		if (addSelectedPerson) fd.append('person_id', addSelectedPerson.id);
		await fetch('?/addEntry', { method: 'POST', body: fd });
		clearAddForm();
		showAddForm = false;
		await invalidateAll();
	}

	async function createPersonAndAdd() {
		const name = addSearchQuery.trim();
		if (!name) return;
		const res = await fetch('/api/people', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
		const json = await res.json();
		if (json?.person) addSelectedPerson = json.person;
		await submitAdd();
	}

	const addShowNewPerson = $derived(
		!!addSearchQuery.trim() && !addSelectedPerson &&
		!addSearchResults.some(p => p.name.toLowerCase() === addSearchQuery.trim().toLowerCase())
	);

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

	async function moveEntry(entryId: string, direction: 'up' | 'down') {
		const fd = new FormData();
		fd.append('entry_id', entryId);
		fd.append('lineup_id', lineup.id);
		fd.append('direction', direction);
		await fetch('?/moveEntry', { method: 'POST', body: fd });
		await invalidateAll();
	}

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

	function copyLineup() {
		const lines: string[] = [`${selectedShow?.name ?? ''} – ${formatDate(lineup.showDate)}`, ''];
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
		copyDone = true;
		setTimeout(() => { copyDone = false; }, 2000);
	}

	const active = $derived(lineup.entries.filter(e => e.status !== 'cancelled' && e.role !== 'support'));
	const cap = $derived(selectedShow?.actsPerShow ?? null);
	const pct = $derived(cap && cap > 0 ? Math.round((active.length / cap) * 100) : null);
	const isPast = $derived(lineup.showDate < today);

	// Promo generation
	type PromoEntry = { id: string; name: string; photoUrl: string };
	let promoDialog = $state<HTMLDialogElement | undefined>();
	let selectedPerformers = $state<PromoEntry[]>([]);
	let promoGenerating = $state(false);
	let promoResult = $state<{ url: string; canvaDesignId: string } | null>(null);
	let promoError = $state<string | null>(null);

	const entriesWithPhotos = $derived(
		lineup.entries.filter(e => e.photoUrl && e.status !== 'cancelled') as (Entry & { photoUrl: string })[]
	);

	function togglePerformer(entry: Entry & { photoUrl: string }) {
		const existing = selectedPerformers.findIndex(p => p.id === entry.id);
		if (existing >= 0) selectedPerformers = selectedPerformers.filter(p => p.id !== entry.id);
		else selectedPerformers = [...selectedPerformers, { id: entry.id, name: entry.name, photoUrl: entry.photoUrl }];
	}

	function openPromoModal() {
		selectedPerformers = [];
		promoResult = null;
		promoError = null;
		promoGenerating = false;
		promoDialog?.showModal();
	}

	async function generatePromo() {
		promoGenerating = true;
		promoError = null;
		try {
			const res = await fetch(`/accounts/${accountId}/lineups/${lineup.id}/generate-promo`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					entries: selectedPerformers.map(p => ({ name: p.name, photoUrl: p.photoUrl })),
					showDate: lineup.showDate
				})
			});
			if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as Record<string, unknown>).message as string ?? `Error ${res.status}`); }
			promoResult = await res.json();
		} catch (err) {
			promoError = err instanceof Error ? err.message : 'Generation failed';
		} finally {
			promoGenerating = false;
		}
	}

	function downloadPromo(url: string) {
		const a = document.createElement('a');
		a.href = url;
		a.download = `${selectedShow?.name ?? 'promo'}-${lineup.showDate}.jpg`.toLowerCase().replace(/\s+/g, '-');
		a.click();
	}
</script>

<div class="rounded-2xl bg-base-100 border border-base-200 overflow-hidden shadow-md min-w-0" class:opacity-70={isPast}>

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
				onclick={copyLineup}
				class="btn btn-xs {copyDone ? 'btn-success' : 'btn-outline'} gap-1 transition-all"
				title="Copy lineup to clipboard"
			>
				{#if copyDone}
					<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
					<span class="hidden sm:inline">Copied</span>
				{:else}
					<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
					<span class="hidden sm:inline">Copy</span>
				{/if}
			</button>
			{#if canvaTemplateId}
				<button
					onclick={openPromoModal}
					disabled={entriesWithPhotos.length === 0}
					class="btn btn-xs btn-outline gap-1"
					title={entriesWithPhotos.length === 0 ? 'No performers with photos' : 'Generate promo image'}
				>
					<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
					<span class="hidden sm:inline">Promo</span>
				</button>
			{/if}
			<button
				onclick={() => { if (showAddForm) { showAddForm = false; clearAddForm(); } else { clearAddForm(); showAddForm = true; } }}
				class="btn btn-xs {showAddForm ? 'btn-soft' : 'btn-outline'} gap-1"
			>
				<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
				Add act
			</button>
		</div>
	</div>

	<!-- Inline add-act form -->
	{#if showAddForm}
		<div class="px-4 py-3 border-b border-base-200/60 bg-base-200/10">
			<div class="flex flex-col gap-2">
				<div class="relative w-full">
					<input
						type="text"
						bind:value={addSearchQuery}
						oninput={onAddSearchInput}
						onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitAdd(); } if (e.key === 'Escape') { showAddForm = false; clearAddForm(); } }}
						placeholder="Search or type a name…"
						autofocus
						class="input input-sm w-full"
					/>
					{#if (addSearchResults.length > 0 || addShowNewPerson) && !addSelectedPerson}
						<div class="absolute left-0 top-full mt-1.5 bg-base-200 border border-base-content/20 rounded-xl shadow-xl z-30 w-full max-h-48 overflow-y-auto divide-y divide-base-content/8">
							{#each addSearchResults as person}
								<button type="button" onclick={() => selectAddPerson(person)}
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
								<button type="button" onclick={createPersonAndAdd}
									class="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-primary/10 active:bg-primary/15 text-left transition-colors text-primary"
								>
									<svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
									<span class="font-medium text-sm">Create "<span class="font-semibold">{addSearchQuery.trim()}</span>" as new person</span>
								</button>
							{/if}
						</div>
					{/if}
				</div>
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
					<button type="button" onclick={submitAdd} disabled={!addSearchQuery.trim()}
						class="btn btn-sm btn-primary shrink-0 disabled:opacity-40">Add</button>
					<button type="button" onclick={() => { showAddForm = false; clearAddForm(); }}
						class="btn btn-sm btn-outline shrink-0">Cancel</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Entries table -->
	{#if lineup.entries.length === 0}
		<p class="px-4 py-3 text-xs text-base-content/30 italic">No acts yet — click Add act to get started.</p>
	{:else}
		<div class="overflow-x-auto">
			<table class="table table-sm w-full">
				<thead class="text-xs text-base-content/40">
					<tr>
						<th class="w-10 pr-1">#</th>
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
							<td class="w-14 pr-1">
								{#if entry.role === 'mc'}
									<div class="w-10 flex justify-center">
										<span class="text-xs font-bold text-primary/50">MC</span>
									</div>
								{:else}
									{@const nonMcEntries = lineup.entries.filter(e => e.role !== 'mc')}
									{@const nonMcIdx = nonMcEntries.findIndex(e => e.id === entry.id)}
									<div class="flex items-center gap-0.5">
										<button onclick={() => moveEntry(entry.id, 'up')} disabled={nonMcIdx === 0}
											class="btn btn-xs btn-outline btn-square w-6 h-6 min-h-0 p-0 disabled:opacity-20" title="Move up">
											<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
										</button>
										<span class="hidden sm:inline text-xs text-base-content/30 tabular-nums w-4 text-center">{nonMcIdx + 1}</span>
										<button onclick={() => moveEntry(entry.id, 'down')} disabled={nonMcIdx === nonMcEntries.length - 1}
											class="btn btn-xs btn-outline btn-square w-6 h-6 min-h-0 p-0 disabled:opacity-20" title="Move down">
											<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
										</button>
									</div>
								{/if}
							</td>
							<td class="min-w-0 overflow-hidden">
								<p class="font-medium text-sm {entry.status === 'cancelled' ? 'line-through' : ''} truncate">{entry.name}</p>
								<button onclick={() => updateEntry(entry.id, 'role', ROLE_CYCLE[entry.role] ?? 'act')}
									class="text-xs text-base-content/40 hover:text-primary transition-colors mt-0.5 leading-none" title="Click to change role">
									{ROLE_LABELS[entry.role] ?? entry.role}
								</button>
								{#if entry.instagram}
									<a href={igUrl(entry.instagram)} target="_blank" rel="noopener"
										class="text-xs text-primary/70 hover:text-primary block truncate sm:hidden mt-0.5 max-w-28"
										title={igHandle(entry.instagram)}>{igHandle(entry.instagram)}</a>
								{/if}
							</td>
							<td class="w-32 max-w-32 hidden sm:table-cell">
								{#if entry.instagram}
									<a href={igUrl(entry.instagram)} target="_blank" rel="noopener"
										class="text-xs text-primary/70 hover:text-primary transition-colors block truncate"
										title={igHandle(entry.instagram)}>{igHandle(entry.instagram)}</a>
								{:else}
									<span class="text-xs text-base-content/20">—</span>
								{/if}
							</td>
							<td class="w-24">
								<button class="badge badge-sm {STATUS_BADGE[entry.status] ?? 'badge-neutral'} cursor-pointer select-none"
									onclick={() => updateEntry(entry.id, 'status', STATUS_CYCLE[entry.status] ?? 'to_contact')}
									title="Click to change status">
									{STATUS_LABELS[entry.status] ?? entry.status}
								</button>
							</td>
							<td class="hidden md:table-cell">
								<input type="text" value={entry.notes ?? ''} placeholder="Add notes…"
									onblur={(e) => {
										if (e.currentTarget.value !== (entry.notes ?? '')) {
											updateEntry(entry.id, 'notes', e.currentTarget.value);
										}
									}}
									class="input input-xs border-transparent bg-transparent hover:bg-base-200 focus:bg-base-100 focus:border-base-300 w-full max-w-52 transition-colors"
								/>
							</td>
							<td class="w-16">
								<div class="flex items-center justify-end gap-1">
									{#if entry.photoUrl}
										<button onclick={() => downloadPersonPhoto(entry.photoUrl!, entry.name)}
											class="btn btn-xs btn-outline btn-square w-6 h-6 min-h-0 p-0"
											title="Download {entry.name}'s photo">
											<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
										</button>
									{/if}
									<button onclick={() => removeEntry(entry.id)}
										class="btn btn-xs btn-outline btn-square w-6 h-6 min-h-0 p-0 border-error/30 text-error hover:bg-error hover:text-error-content hover:border-error"
										title="Remove act">
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

{#if canvaTemplateId}
<dialog bind:this={promoDialog} class="modal">
	<div class="modal-box max-w-md">
		{#if promoResult}
			<h3 class="font-bold text-lg mb-3">Promo image ready</h3>
			<img src={promoResult.url} alt="Generated promo" class="w-full rounded-xl mb-4 object-contain max-h-80" />
			<div class="flex flex-wrap gap-2">
				<button onclick={() => downloadPromo(promoResult!.url)} class="btn btn-primary btn-sm gap-1">
					<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
					Download
				</button>
				<a href="https://www.canva.com/design/{promoResult.canvaDesignId}/edit" target="_blank" rel="noopener" class="btn btn-outline btn-sm gap-1">
					Open in Canva
				</a>
				<button onclick={() => promoDialog?.close()} class="btn btn-ghost btn-sm ml-auto">Close</button>
			</div>
		{:else}
			<h3 class="font-bold text-lg mb-1">Generate promo</h3>
			<p class="text-sm text-base-content/50 mb-4">Select performers to include in the image.</p>
			{#if promoError}
				<div class="alert alert-error alert-soft mb-4 text-sm">{promoError}</div>
			{/if}
			<div class="flex flex-col gap-2 mb-5">
				{#each entriesWithPhotos as entry}
					{@const selected = selectedPerformers.some(p => p.id === entry.id)}
					<button
						type="button"
						onclick={() => togglePerformer(entry)}
						class="flex items-center gap-3 p-2 rounded-xl border transition-colors {selected ? 'border-primary bg-primary/10' : 'border-base-300 hover:border-base-content/30'}"
					>
						<img src={entry.photoUrl} alt={entry.name} class="w-10 h-10 rounded-lg object-cover" />
						<div class="text-left min-w-0">
							<p class="text-sm font-medium truncate">{entry.name}</p>
							<p class="text-xs text-base-content/40">{entry.role === 'mc' ? 'MC' : (entry.role === 'headline' ? 'Headliner' : 'Act')}</p>
						</div>
						{#if selected}
							<svg class="h-4 w-4 text-primary ml-auto shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
						{/if}
					</button>
				{/each}
			</div>
			<div class="flex gap-2">
				<button
					onclick={generatePromo}
					disabled={selectedPerformers.length === 0 || promoGenerating}
					class="btn btn-primary btn-sm flex-1 disabled:opacity-40 gap-1"
				>
					{#if promoGenerating}
						<span class="loading loading-spinner loading-xs"></span>
						Generating…
					{:else}
						Generate
					{/if}
				</button>
				<button onclick={() => promoDialog?.close()} class="btn btn-outline btn-sm" disabled={promoGenerating}>Cancel</button>
			</div>
		{/if}
	</div>
	<form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
{/if}
