<!--
  AddActForm.svelte
  Inline form for adding an act to a lineup. Includes a live-search against the
  people directory (debounced 200ms via /api/people) with an option to create a
  new person on the fly. Inserts a temporary entry into the parent's localEntries
  list for instant visual feedback, then rolls back if the server action fails.

  Svelte features:
    $state        — showForm, addError, searchQuery, selectedPerson, searchResults,
                    creatingPerson, showCreateForm, newPersonInstagram
    $bindable()   — localEntries is two-way bound from the parent; this component
                    mutates it directly (optimistic insert) and rolls back on failure
    $props()      — receives lineupId (string) and localEntries (LocalEntry[])
    use:enhance   — intercepts submit: optimistically inserts a temp entry and closes
                    the form; on failure filters the temp out and re-opens the form
                    WITHOUT calling update() so the page form state isn't overwritten

  Props:
    lineupId       string       — ID of the lineup this form posts entries to
    localEntries   LocalEntry[] — $bindable; the parent's displayed entry list,
                                  mutated here for optimistic updates
-->

<script lang="ts">
	import { enhance } from '$app/forms';

	type LocalEntry = {
		id: string; lineupId: string; personId: string | null; name: string;
		role: string; status: string; notes: string | null; sortOrder: number;
		createdAt: Date; instagram: string | null; photoUrl: string | null;
	};

	let {
		lineupId,
		localEntries = $bindable()
	}: { lineupId: string; localEntries: LocalEntry[] } = $props();

	const ROLES = ['act', 'headline', 'mc', 'support', 'host'] as const;
	const STATUSES = ['to_contact', 'booked', 'cancelled'] as const;
	const ROLE_LABELS: Record<string, string> = { act: 'Act', headline: 'Headliner', mc: 'MC', support: 'Support', host: 'Host' };
	const STATUS_LABELS: Record<string, string> = { to_contact: 'Contact', booked: 'Booked', cancelled: 'Cancelled' };

	let showForm = $state(false);
	let addError = $state<string | null>(null);
	let searchQuery = $state('');
	let searchResults = $state<{ id: string; name: string; instagram: string | null }[]>([]);
	let selectedPerson = $state<{ id: string; name: string; instagram: string | null } | null>(null);
	let creatingPerson = $state(false);
	let showCreateForm = $state(false);
	let newPersonInstagram = $state('');
	let searchTimeout: ReturnType<typeof setTimeout>;

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
			if (json.person) { selectPerson(json.person); newPersonInstagram = ''; }
		} finally {
			creatingPerson = false;
		}
	}
</script>

{#if showForm}
	<div class="rounded-2xl bg-base-100 border border-base-200 overflow-hidden mb-5">
		<div class="px-4 py-4">
			<p class="text-sm font-semibold mb-3">Add act</p>
			{#if addError}
				<div role="alert" class="alert alert-error alert-soft mb-3 text-sm">{addError}</div>
			{/if}
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
					const newEntry: LocalEntry = {
						id: tempId, lineupId, personId,
						name: name || 'Unknown', role, status, notes, sortOrder: 0, createdAt: new Date(),
						instagram: selectedPerson?.instagram ?? null, photoUrl: null
					};
					if (position !== null && !isNaN(position) && position >= 0 && position < localEntries.length) {
						const copy = [...localEntries];
						copy.splice(position, 0, newEntry);
						localEntries = copy;
					} else {
						localEntries = [...localEntries, newEntry];
					}

					addError = null;
					showForm = false;
					clearPerson();

					return async ({ result, update }) => {
						if (result.type === 'failure' || result.type === 'error') {
							localEntries = localEntries.filter((e) => e.id !== tempId);
							addError = (result.type === 'failure' ? (result.data as Record<string, unknown>)?.error as string : null) ?? 'Failed to add. Please try again.';
							showForm = true;
							return; // don't call update() — avoids setting page form?.error
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

						{#if !showCreateForm && (searchResults.length > 0 || (searchQuery.trim().length >= 2 && !selectedPerson))}
							<ul class="absolute z-10 top-full left-0 right-0 bg-base-100 border border-base-300 rounded-xl shadow-lg mt-1 overflow-hidden">
								{#each searchResults as p}
									<li>
										<button type="button" class="w-full text-left px-4 py-2.5 hover:bg-base-200 flex items-center justify-between gap-2 transition-colors"
											onclick={() => selectPerson(p)}>
											<span class="text-sm font-medium">{p.name}</span>
											{#if p.instagram}
												<span class="text-xs text-base-content/40 truncate max-w-32">{p.instagram}</span>
											{/if}
										</button>
									</li>
								{/each}
								{#if searchQuery.trim().length >= 2 && !selectedPerson}
									<li class="border-t border-base-200">
										<button type="button" class="w-full text-left px-4 py-2.5 hover:bg-base-200 flex items-center gap-2 transition-colors text-primary"
											onclick={() => { showCreateForm = true; searchResults = []; }}>
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
							<input type="text" bind:value={newPersonInstagram} placeholder="Instagram handle (optional)"
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
					<button type="button" class="btn btn-outline" onclick={() => { showForm = false; clearPerson(); addError = null; }}>Cancel</button>
				</div>
			</form>
		</div>
	</div>
{:else}
	<button type="button" class="btn btn-primary w-full" onclick={() => { showForm = true; addError = null; }}>
		+ Add act
	</button>
{/if}
