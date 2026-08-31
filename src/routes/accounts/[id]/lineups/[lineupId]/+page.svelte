<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const ROLES = ['act', 'headline', 'mc', 'support', 'host'] as const;
	const STATUSES = ['to_contact', 'booked', 'cancelled'] as const;
	const STATUS_CYCLE = ['to_contact', 'booked', 'cancelled'] as const;

	const STATUS_LABELS: Record<string, string> = {
		to_contact: 'To Contact',
		booked: 'Booked',
		cancelled: 'Cancelled'
	};
	const STATUS_STYLES: Record<string, string> = {
		booked:     'badge-success',
		to_contact: 'badge-warning',
		cancelled:  'badge-error badge-soft'
	};
	const ROLE_LABELS: Record<string, string> = {
		act: 'Act', headline: 'Headliner', mc: 'MC', support: 'Support', host: 'Host'
	};

	// Local entries — optimistic updates, synced from server after mutations
	let localEntries = $state([...data.entries]);
	$effect(() => { localEntries = [...data.entries]; });

	let editingId = $state<string | null>(null);
	let showAddForm = $state(false);
	let addError = $state<string | null>(null);
	let movePending = $state(false);
	let copyDone = $state(false);
	let editingNotes = $state(false);

	// People search
	let searchQuery = $state('');
	let searchResults = $state<{ id: string; name: string; instagram: string | null }[]>([]);
	let selectedPerson = $state<{ id: string; name: string; instagram: string | null } | null>(null);
	let creatingPerson = $state(false);
	let showCreateForm = $state(false);
	let newPersonInstagram = $state('');
	let searchTimeout: ReturnType<typeof setTimeout>;

	function formatDate(iso: string) {
		const [y, m, d] = iso.split('-').map(Number);
		return new Date(y, m - 1, d).toLocaleDateString('en-AU', {
			weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
		});
	}

	function igUrl(handle: string) {
		if (handle.startsWith('http')) return handle;
		return `https://instagram.com/${handle.replace(/^@/, '')}`;
	}

	async function onSearchInput() {
		clearTimeout(searchTimeout);
		selectedPerson = null;
		if (!searchQuery.trim()) { searchResults = []; return; }
		searchTimeout = setTimeout(async () => {
			const res = await fetch(`/api/people?q=${encodeURIComponent(searchQuery)}`);
			const json = await res.json();
			searchResults = json?.results ?? [];
		}, 200);
	}

	function selectPerson(p: { id: string; name: string; instagram: string | null }) {
		selectedPerson = p;
		searchQuery = p.name;
		searchResults = [];
	}

	function clearPerson() {
		selectedPerson = null;
		searchQuery = '';
		searchResults = [];
		showCreateForm = false;
		newPersonInstagram = '';
	}

	async function createPerson() {
		const name = searchQuery.trim();
		if (!name) return;
		creatingPerson = true;
		showCreateForm = false;
		try {
			const res = await fetch('/api/people', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name, instagram: newPersonInstagram.trim() || null })
			});
			const json = await res.json();
			if (json.person) {
				selectPerson(json.person);
				newPersonInstagram = '';
			}
		} finally {
			creatingPerson = false;
		}
	}

	function copyLineup() {
		const lines: string[] = [`${data.show.name} – ${formatDate(data.lineup.showDate)}`, ''];
		const active = localEntries.filter((e) => e.status !== 'cancelled');
		active.forEach((e, i) => {
			const roleSuffix = e.role !== 'act' ? ` (${ROLE_LABELS[e.role] ?? e.role})` : '';
			lines.push(`${i + 1}. ${e.name}${roleSuffix}`);
		});
		if (active.length === 0) lines.push('(no acts yet)');
		navigator.clipboard.writeText(lines.join('\n'));
		copyDone = true;
		setTimeout(() => { copyDone = false; }, 2000);
	}

	function nextStatus(current: string): string {
		const idx = STATUS_CYCLE.indexOf(current as typeof STATUS_CYCLE[number]);
		return STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
	}

	const activeCount = $derived(localEntries.filter((e) => e.status !== 'cancelled').length);
	const overCapacity = $derived(data.show.actsPerShow != null && activeCount > data.show.actsPerShow);
	const atCapacity = $derived(data.show.actsPerShow != null && activeCount === data.show.actsPerShow);
</script>

<svelte:head><title>{data.show.name} · {data.lineup.showDate}</title></svelte:head>

<!-- Header -->
<div class="mb-5 flex items-start justify-between gap-3">
	<div class="min-w-0">
		<a href="/accounts/{data.show.accountId}/lineups" class="btn btn-xs btn-outline gap-1">
			<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
			{data.show.name}
		</a>
		<h2 class="mt-2 text-lg font-semibold">{formatDate(data.lineup.showDate)}</h2>
	</div>
	<button type="button" onclick={copyLineup} class="btn btn-sm {copyDone ? 'btn-success' : 'btn-outline'} shrink-0 gap-1.5 mt-1 transition-all" title="Copy lineup">
		{#if copyDone}
			<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
			Copied!
		{:else}
			<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
			Copy
		{/if}
	</button>
</div>

<!-- Capacity bar -->
{#if data.show.actsPerShow}
	<div class="mb-5">
		<div class="flex items-center justify-between mb-1.5">
			<span class="text-xs text-base-content/50">Acts</span>
			<span class="text-xs font-semibold {overCapacity ? 'text-error' : atCapacity ? 'text-success' : 'text-base-content/60'}">
				{activeCount} / {data.show.actsPerShow}{overCapacity ? ' · over capacity' : atCapacity ? ' · full' : ''}
			</span>
		</div>
		<div class="w-full h-2 bg-base-300 rounded-full overflow-hidden">
			<div
				class="h-full rounded-full transition-all duration-300 {overCapacity ? 'bg-error' : atCapacity ? 'bg-success' : 'bg-primary'}"
				style="width: {Math.min(100, (activeCount / data.show.actsPerShow) * 100)}%"
			></div>
		</div>
	</div>
{/if}

<!-- Lineup notes -->
{#if editingNotes}
	<form method="POST" action="?/updateLineupNotes" use:enhance={() => async ({ update }) => {
		editingNotes = false;
		await update({ reset: false });
	}} class="mb-5">
		<textarea name="notes" rows="2" placeholder="Notes for this lineup…" class="textarea w-full text-sm">{data.lineup.notes ?? ''}</textarea>
		<div class="flex gap-2 mt-2">
			<button type="submit" class="btn btn-sm btn-primary">Save</button>
			<button type="button" onclick={() => { editingNotes = false; }} class="btn btn-sm btn-outline">Cancel</button>
		</div>
	</form>
{:else if data.lineup.notes}
	<div class="mb-5 flex items-start gap-2 px-1">
		<p class="text-sm text-base-content/60 flex-1 whitespace-pre-wrap">{data.lineup.notes}</p>
		<button type="button" onclick={() => { editingNotes = true; }} class="btn btn-xs btn-soft shrink-0">Edit</button>
	</div>
{:else}
	<button type="button" onclick={() => { editingNotes = true; }} class="text-xs text-base-content/30 hover:text-base-content/60 transition-colors mb-5 block">+ Add notes</button>
{/if}

{#if addError}
	<div role="alert" class="alert alert-error alert-soft mb-4 text-sm">{addError}</div>
{/if}
{#if form?.error && !addError}
	<div role="alert" class="alert alert-error alert-soft mb-4 text-sm">{form.error}</div>
{/if}

<!-- Lineup entries -->
<div class="flex flex-col gap-2 mb-5">
	{#if localEntries.length === 0}
		<p class="text-sm text-base-content/40 py-3 text-center">No acts yet — add someone below.</p>
	{/if}

	{#each localEntries as entry, i}
		{@const next = nextStatus(entry.status)}
		<div class="rounded-2xl bg-base-100 border border-base-200 overflow-hidden">
			<!-- Main row -->
			<div class="flex items-center gap-2 px-3 py-3 min-h-14">
				<!-- Move + number -->
				<div class="flex flex-col items-center shrink-0 w-7">
					<form method="POST" action="?/moveEntry" use:enhance={() => {
						if (movePending) return () => {};
						movePending = true;
						const snapshot = [...localEntries];
						const copy = [...localEntries];
						[copy[i - 1], copy[i]] = [copy[i], copy[i - 1]];
						localEntries = copy;
						return async ({ result, update }) => {
							if (result.type === 'failure' || result.type === 'error') localEntries = snapshot;
							await update({ reset: false });
							movePending = false;
						};
					}}>
						<input type="hidden" name="id" value={entry.id} />
						<input type="hidden" name="direction" value="up" />
						<button type="submit" disabled={i === 0 || entry.id.startsWith('temp_') || movePending} aria-label="Move up"
							class="btn btn-xs btn-soft h-6 min-h-0 w-7 p-0 disabled:opacity-20">
							<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
						</button>
					</form>
					<span class="text-[11px] font-bold text-base-content/30 leading-none my-0.5 tabular-nums">{i + 1}</span>
					<form method="POST" action="?/moveEntry" use:enhance={() => {
						if (movePending) return () => {};
						movePending = true;
						const snapshot = [...localEntries];
						const copy = [...localEntries];
						[copy[i + 1], copy[i]] = [copy[i], copy[i + 1]];
						localEntries = copy;
						return async ({ result, update }) => {
							if (result.type === 'failure' || result.type === 'error') localEntries = snapshot;
							await update({ reset: false });
							movePending = false;
						};
					}}>
						<input type="hidden" name="id" value={entry.id} />
						<input type="hidden" name="direction" value="down" />
						<button type="submit" disabled={i === localEntries.length - 1 || entry.id.startsWith('temp_') || movePending} aria-label="Move down"
							class="btn btn-xs btn-soft h-6 min-h-0 w-7 p-0 disabled:opacity-20">
							<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
						</button>
					</form>
				</div>

				<!-- Name + role -->
				<div class="flex-1 min-w-0">
					<p class="font-medium text-sm leading-snug {entry.status === 'cancelled' ? 'line-through opacity-35' : ''}">
						{entry.name}
						{#if entry.id.startsWith('temp_')}
							<span class="loading loading-dots loading-xs ml-1 opacity-40"></span>
						{/if}
					</p>
					<div class="flex items-center gap-1.5 mt-0.5 flex-wrap">
						{#if entry.role !== 'act'}
							<span class="text-xs text-base-content/40">{ROLE_LABELS[entry.role] ?? entry.role}</span>
						{/if}
						{#if entry.instagram && editingId !== entry.id}
							<a href={igUrl(entry.instagram)} target="_blank" rel="noopener"
								class="text-xs text-primary/70 hover:text-primary transition-colors truncate max-w-36">
								{entry.instagram.startsWith('@') ? entry.instagram : `@${entry.instagram}`}
							</a>
						{/if}
						{#if entry.notes && editingId !== entry.id}
							<span class="text-xs text-base-content/30 truncate max-w-40">{entry.notes}</span>
						{/if}
					</div>
				</div>

				<!-- Status tap-to-cycle form -->
				<form method="POST" action="?/updateEntry"
					use:enhance={() => {
						localEntries = localEntries.map(e => e.id === entry.id ? { ...e, status: next } : e);
						return async ({ result, update }) => {
							if (result.type !== 'success') {
								localEntries = localEntries.map(e => e.id === entry.id ? { ...e, status: entry.status } : e);
							}
							await update({ reset: false });
						};
					}}
				>
					<input type="hidden" name="id" value={entry.id} />
					<input type="hidden" name="role" value={entry.role} />
					<input type="hidden" name="status" value={next} />
					<input type="hidden" name="notes" value={entry.notes ?? ''} />
					<button
						type="submit"
						disabled={entry.id.startsWith('temp_')}
						title="Tap to advance status"
						class="badge badge-sm {STATUS_STYLES[entry.status] ?? 'badge-ghost'} cursor-pointer hover:opacity-75 transition-opacity border-0 disabled:opacity-50 shrink-0"
					>
						{STATUS_LABELS[entry.status] ?? entry.status}
					</button>
				</form>

				<!-- Edit toggle -->
				<button
					type="button"
					aria-label={editingId === entry.id ? 'Close edit' : 'Edit'}
					disabled={entry.id.startsWith('temp_')}
					onclick={() => editingId = editingId === entry.id ? null : entry.id}
					class="btn btn-xs btn-soft btn-square shrink-0 disabled:opacity-20"
				>
					{#if editingId === entry.id}
						<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
					{:else}
						<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
					{/if}
				</button>
			</div>

			<!-- Inline edit panel -->
			{#if editingId === entry.id}
				<div class="border-t border-base-200 px-3 pb-4 pt-3 bg-base-200/30">
					<form
						method="POST"
						action="?/updateEntry"
						use:enhance={() => async ({ result, update }) => {
							if (result.type === 'success') editingId = null;
							await update({ reset: false });
						}}
						class="flex flex-col gap-3"
					>
						<input type="hidden" name="id" value={entry.id} />
						<div>
							<p class="text-[11px] text-base-content/40 mb-1">Name</p>
							<input name="name" type="text" value={entry.name} required class="input input-sm w-full" />
						</div>
						<div class="flex gap-2 flex-wrap">
							<div>
								<p class="text-[11px] text-base-content/40 mb-1">Role</p>
								<select name="role" class="select select-sm w-32" value={entry.role}>
									{#each ROLES as r}
										<option value={r}>{ROLE_LABELS[r]}</option>
									{/each}
								</select>
							</div>
							<div>
								<p class="text-[11px] text-base-content/40 mb-1">Status</p>
								<select name="status" class="select select-sm w-32" value={entry.status}>
									{#each STATUSES as s}
										<option value={s}>{STATUS_LABELS[s]}</option>
									{/each}
								</select>
							</div>
							<div class="flex-1 min-w-32">
								<p class="text-[11px] text-base-content/40 mb-1">Notes</p>
								<input name="notes" type="text" value={entry.notes ?? ''} placeholder="Optional" class="input input-sm w-full" />
							</div>
						</div>
						<div class="flex items-center justify-between gap-2">
							<div class="flex gap-2">
								<button type="submit" class="btn btn-sm btn-primary">Save</button>
								<button type="button" class="btn btn-sm btn-outline" onclick={() => editingId = null}>Cancel</button>
							</div>
							<button
								type="submit"
								formaction="?/removeEntry"
								class="btn btn-sm btn-soft btn-error"
								onclick={(e) => { if (!confirm(`Remove ${entry.name}?`)) e.preventDefault(); }}
							>Remove</button>
						</div>
					</form>
				</div>
			{/if}
		</div>
	{/each}
</div>

<!-- Add act -->
{#if showAddForm}
	<div class="rounded-2xl bg-base-100 border border-base-200 overflow-hidden mb-5">
		<div class="px-4 py-4">
			<p class="text-sm font-semibold mb-3">Add act</p>
			<form
				method="POST"
				action="?/addEntry"
				use:enhance={({ formData: fd }) => {
					const name = (fd.get('name') as string)?.trim() || searchQuery.trim();
					const role = (fd.get('role') as string) || 'act';
					const status = (fd.get('status') as string) || 'to_contact';
					const notes = (fd.get('notes') as string)?.trim() || null;
					const personId = (fd.get('person_id') as string) || null;
					const positionStr = fd.get('position') as string;
					const position = positionStr ? parseInt(positionStr, 10) - 1 : null;

					const tempId = `temp_${Date.now()}`;
					// Insert at correct position in local state
					const newEntry = {
						id: tempId, lineupId: data.lineup.id, personId,
						name: name || 'Unknown', role, status, notes, sortOrder: 0, createdAt: new Date(),
						instagram: selectedPerson?.instagram ?? null
					};
					if (position !== null && !isNaN(position) && position >= 0 && position < localEntries.length) {
						const copy = [...localEntries];
						copy.splice(position, 0, newEntry);
						localEntries = copy;
					} else {
						localEntries = [...localEntries, newEntry];
					}

					addError = null;
					showAddForm = false;
					clearPerson();

					return async ({ result, update }) => {
						if (result.type === 'failure' || result.type === 'error') {
							localEntries = localEntries.filter((e) => e.id !== tempId);
							addError = (result.type === 'failure' ? (result.data as Record<string, unknown>)?.error as string : null) ?? 'Failed to add. Please try again.';
							showAddForm = true;
						}
						await update();
					};
				}}
				class="flex flex-col gap-3"
			>
				<!-- Name / people search -->
				<div>
					<p class="text-[11px] text-base-content/40 mb-1">Name</p>
					<div class="relative">
						<input
							type="text"
							bind:value={searchQuery}
							oninput={onSearchInput}
							placeholder="Search directory or type a name…"
							class="input w-full"
							autocomplete="off"
						/>
						<input type="hidden" name="name" value={selectedPerson?.name ?? searchQuery} />
						{#if selectedPerson}
							<input type="hidden" name="person_id" value={selectedPerson.id} />
						{/if}

						{#if searchResults.length > 0 || (searchQuery.trim().length >= 2 && !selectedPerson)}
							<ul class="absolute z-10 top-full left-0 right-0 bg-base-100 border border-base-300 rounded-xl shadow-lg mt-1 overflow-hidden">
								{#each searchResults as p}
									<li>
										<button
											type="button"
											class="w-full text-left px-4 py-2.5 hover:bg-base-200 flex items-center justify-between gap-2 transition-colors"
											onclick={() => selectPerson(p)}
										>
											<span class="text-sm font-medium">{p.name}</span>
											{#if p.instagram}
												<span class="text-xs text-base-content/40 truncate max-w-32">{p.instagram}</span>
											{/if}
										</button>
									</li>
								{/each}
								{#if searchQuery.trim().length >= 2 && !selectedPerson}
									<li class="border-t border-base-200">
										<button
											type="button"
											class="w-full text-left px-4 py-2.5 hover:bg-base-200 flex items-center gap-2 transition-colors text-primary"
											onclick={() => { showCreateForm = true; searchResults = []; }}
										>
											<svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
											<span class="text-sm">Create "{searchQuery.trim()}" in directory</span>
										</button>
									</li>
								{/if}
							</ul>
						{/if}
					</div>
					{#if selectedPerson?.instagram}
						<p class="text-xs text-base-content/50 mt-1">
							<a href={igUrl(selectedPerson.instagram)} target="_blank" rel="noopener" class="link link-primary">{selectedPerson.instagram}</a>
						</p>
					{/if}

					{#if showCreateForm}
						<div class="mt-2 p-3 bg-base-200/50 rounded-xl border border-base-300 flex flex-col gap-2">
							<p class="text-xs text-base-content/60">Adding <span class="font-semibold text-base-content">{searchQuery.trim()}</span> to directory</p>
							<input
								type="text"
								bind:value={newPersonInstagram}
								placeholder="Instagram handle (optional)"
								class="input input-sm w-full"
								onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createPerson(); } }}
							/>
							<div class="flex gap-2">
								<button type="button" onclick={createPerson} disabled={creatingPerson} class="btn btn-sm btn-primary">
									{#if creatingPerson}<span class="loading loading-spinner loading-xs"></span>{/if}
									Create
								</button>
								<button type="button" onclick={() => { showCreateForm = false; newPersonInstagram = ''; }} class="btn btn-sm btn-outline">Cancel</button>
							</div>
						</div>
					{/if}
				</div>

				<div class="flex gap-2 flex-wrap">
					{#if localEntries.length > 0}
						<div>
							<p class="text-[11px] text-base-content/40 mb-1">Position</p>
							<select name="position" class="select select-sm w-28">
								<option value="">End</option>
								{#each localEntries.filter(e => !e.id.startsWith('temp_')) as _, j}
									<option value={j + 1}>{j + 1}{j === 0 ? 'st' : j === 1 ? 'nd' : j === 2 ? 'rd' : 'th'}</option>
								{/each}
							</select>
						</div>
					{/if}
					<div>
						<p class="text-[11px] text-base-content/40 mb-1">Role</p>
						<select name="role" class="select select-sm w-32">
							{#each ROLES as r}
								<option value={r}>{ROLE_LABELS[r]}</option>
							{/each}
						</select>
					</div>
					<div>
						<p class="text-[11px] text-base-content/40 mb-1">Status</p>
						<select name="status" class="select select-sm w-32">
							{#each STATUSES as s}
								<option value={s}>{STATUS_LABELS[s]}</option>
							{/each}
						</select>
					</div>
					<div class="flex-1 min-w-32">
						<p class="text-[11px] text-base-content/40 mb-1">Notes <span class="opacity-50">(optional)</span></p>
						<input name="notes" type="text" class="input input-sm w-full" />
					</div>
				</div>

				<div class="flex gap-2 pt-1">
					<button type="submit" class="btn btn-primary flex-1 sm:flex-none">Add to lineup</button>
					<button type="button" class="btn btn-outline" onclick={() => { showAddForm = false; clearPerson(); }}>Cancel</button>
				</div>
			</form>
		</div>
	</div>
{:else}
	<button type="button" class="btn btn-primary w-full" onclick={() => { showAddForm = true; addError = null; }}>
		+ Add act
	</button>
{/if}

<!-- Delete lineup -->
<div class="mt-10 pt-6 border-t border-base-200">
	<form method="POST" action="?/deleteLineup" use:enhance>
		<button
			type="submit"
			class="btn btn-sm btn-soft btn-error"
			onclick={(e) => { if (!confirm('Delete this lineup and all its entries? This cannot be undone.')) e.preventDefault(); }}
		>
			Delete lineup
		</button>
	</form>
</div>
