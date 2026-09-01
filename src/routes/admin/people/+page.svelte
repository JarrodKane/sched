<script lang="ts">
	import { enhance } from '$app/forms';
	import CropModal from '$lib/components/CropModal.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let search = $state('');
	let editingId = $state<string | null>(null);
	let showAddForm = $state(false);
	let addNameInput = $state<HTMLInputElement | undefined>();

	// Local copy so photo updates reflect immediately
	let people = $state(data.people.map(p => ({ ...p })));
	$effect(() => { people = data.people.map(p => ({ ...p })); });

	const filtered = $derived(
		search.trim()
			? people.filter(
					(p) =>
						p.name.toLowerCase().includes(search.toLowerCase()) ||
						(p.instagram ?? '').toLowerCase().includes(search.toLowerCase())
				)
			: people
	);

	function thumbUrl(url: string, size = 80) {
		// Use Supabase Storage image transform to serve a small thumbnail in the list
		return url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')
			+ `?width=${size}&height=${size}&resize=cover&quality=75`;
	}

	function igUrl(handle: string) {
		if (handle.startsWith('http')) return handle;
		return `https://instagram.com/${handle.replace(/^@/, '')}`;
	}

	function igDisplay(handle: string) {
		if (handle.startsWith('http')) {
			try { return '@' + new URL(handle).pathname.replace(/\//g, ''); } catch { return handle; }
		}
		return handle.startsWith('@') ? handle : `@${handle}`;
	}

	function openAdd() {
		showAddForm = true;
		setTimeout(() => addNameInput?.focus(), 50);
	}

	// Photo upload via CropModal
	let cropModal = $state<CropModal | null>(null);
	let cropPersonId = $state('');
	let fileInputEl = $state<HTMLInputElement | null>(null);

	// For the add form: generate a UUID upfront so we have a storage path before the person exists
	let addPhotoUrl = $state('');
	let addPhotoTempId = $state('');
	let isAddingNewPerson = $state(false);

	function openPhotoUpload(personId: string) {
		isAddingNewPerson = false;
		cropPersonId = personId;
		fileInputEl?.click();
	}

	function openAddFormPhoto() {
		isAddingNewPerson = true;
		if (!addPhotoTempId) addPhotoTempId = crypto.randomUUID();
		cropPersonId = addPhotoTempId;
		fileInputEl?.click();
	}

	function onFileChange(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		cropModal?.openWithFile(file, 'feed');
		(e.currentTarget as HTMLInputElement).value = '';
	}

	async function onPhotoDone(url: string) {
		if (isAddingNewPerson) {
			addPhotoUrl = url;
			return;
		}
		await fetch(`/api/people/${cropPersonId}/photo`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ photoUrl: url })
		});
		const p = people.find(x => x.id === cropPersonId);
		if (p) p.photoUrl = url;
	}

	function resetAddForm() {
		showAddForm = false;
		addPhotoUrl = '';
		addPhotoTempId = '';
	}

	// Photo preview lightbox
	let previewUrl = $state<string | null>(null);
	let previewName = $state('');

	function openPreview(url: string, name: string) {
		previewUrl = url;
		previewName = name;
	}

	async function downloadPhoto(url: string, name: string) {
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
</script>

<svelte:head><title>People — Sched</title></svelte:head>

<!-- Shared crop modal — accountId swapped per person before opening -->
<CropModal bind:this={cropModal} accountId={cropPersonId} oncomplete={onPhotoDone} />
<input bind:this={fileInputEl} type="file" accept="image/*" class="hidden" onchange={onFileChange} />

<!-- Photo preview lightbox -->
{#if previewUrl}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
		onclick={() => previewUrl = null}
	>
		<div class="relative max-w-lg w-full" onclick={(e) => e.stopPropagation()}>
			<img src={previewUrl} alt={previewName} class="w-full rounded-2xl shadow-2xl object-contain max-h-[80vh]" />
			<p class="text-white/70 text-sm text-center mt-3">{previewName}</p>
			<div class="flex justify-center gap-2 mt-2">
				<button
					type="button"
					onclick={() => downloadPhoto(previewUrl!, previewName)}
					class="btn btn-sm btn-outline text-white border-white/30 hover:bg-white/10 gap-1.5"
				>
					<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
					Download
				</button>
				<button type="button" onclick={() => previewUrl = null} class="btn btn-sm btn-outline text-white border-white/30 hover:bg-white/10">Close</button>
			</div>
		</div>
	</div>
{/if}

<!-- Header -->
<div class="mb-4 flex items-center justify-between gap-3">
	<div>
		<h1 class="text-xl font-semibold">People</h1>
		<p class="text-sm text-base-content/40 mt-0.5">{data.people.length} {data.people.length === 1 ? 'person' : 'people'}</p>
	</div>
	{#if data.isAdmin && !showAddForm}
		<button type="button" class="btn btn-primary btn-sm shrink-0" onclick={openAdd}>
			+ Add person
		</button>
	{/if}
</div>

{#if form?.error}
	<div role="alert" class="alert alert-error alert-soft mb-4 text-sm">{form.error}</div>
{/if}

<!-- Add form — admin only -->
{#if showAddForm}
	<div class="rounded-2xl bg-base-100 border border-base-200 p-4 mb-4">
		<p class="text-sm font-semibold mb-3">New person</p>
		<form
			method="POST"
			action="?/add"
			use:enhance={() => async ({ result, update }) => {
				if (result.type === 'success') resetAddForm();
				await update();
			}}
			class="flex flex-col gap-3"
		>
			<input type="hidden" name="photoUrl" value={addPhotoUrl} />
			<div class="flex gap-3 items-start">
				<!-- Photo picker -->
				<button
					type="button"
					onclick={openAddFormPhoto}
					class="shrink-0 w-14 h-14 rounded-xl overflow-hidden bg-base-300 border border-base-content/10 hover:opacity-80 transition-opacity"
					title="Add photo"
				>
					{#if addPhotoUrl}
						<img src={thumbUrl(addPhotoUrl, 112)} alt="Preview" class="w-full h-full object-cover" />
					{:else}
						<div class="w-full h-full flex flex-col items-center justify-center gap-0.5">
							<svg class="h-4 w-4 text-base-content/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
							<span class="text-[9px] text-base-content/30 leading-none">Photo</span>
						</div>
					{/if}
				</button>

				<div class="flex-1 flex flex-col gap-2">
					<div class="flex gap-2 flex-wrap">
						<div class="flex-1 min-w-36">
							<p class="text-[11px] text-base-content/40 mb-1">Name</p>
							<input bind:this={addNameInput} name="name" type="text" required class="input input-sm w-full" placeholder="Full name" />
						</div>
						<div class="flex-1 min-w-44">
							<p class="text-[11px] text-base-content/40 mb-1">Instagram <span class="opacity-50">(optional)</span></p>
							<input name="instagram" type="text" class="input input-sm w-full" placeholder="@handle" />
						</div>
					</div>
					<div class="flex gap-2">
						<button type="submit" class="btn btn-sm btn-primary">Add</button>
						<button type="button" class="btn btn-sm btn-outline" onclick={resetAddForm}>Cancel</button>
					</div>
				</div>
			</div>
		</form>
	</div>
{/if}

<!-- Search -->
<input
	type="search"
	bind:value={search}
	placeholder="Search by name or Instagram…"
	class="input w-full mb-3"
/>

<!-- List -->
{#if filtered.length === 0}
	<p class="text-sm text-base-content/40 py-6 text-center">
		{search ? 'No matches.' : 'No people yet. Add someone above.'}
	</p>
{:else}
	<div class="rounded-2xl bg-base-100 border border-base-200 overflow-hidden">
		{#each filtered as person, i}
			<div class="{i > 0 ? 'border-t border-base-200' : ''}">
				{#if editingId === person.id}
					<!-- Inline edit (admin only) -->
					<div class="px-4 py-3 bg-base-200/30">
						<form
							method="POST"
							action="?/update"
							use:enhance={() => async ({ result, update }) => {
								if (result.type === 'success') editingId = null;
								await update({ reset: false });
							}}
							class="flex flex-col gap-2"
						>
							<input type="hidden" name="id" value={person.id} />
							<!-- Photo in edit mode -->
							<div class="flex items-center gap-3 mb-3">
								<button
									type="button"
									onclick={() => openPhotoUpload(person.id)}
									class="shrink-0 w-16 h-16 rounded-xl overflow-hidden bg-base-300 border border-base-content/10 hover:opacity-75 transition-opacity"
									title={person.photoUrl ? 'Change photo' : 'Add photo'}
								>
									{#if person.photoUrl}
										<img src={thumbUrl(person.photoUrl, 128)} alt={person.name} class="w-full h-full object-cover" />
									{:else}
										<div class="w-full h-full flex flex-col items-center justify-center gap-1">
											<svg class="h-5 w-5 text-base-content/25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
										</div>
									{/if}
								</button>
								<div>
									<p class="text-xs text-base-content/50">{person.photoUrl ? 'Click photo to replace' : 'Click to add photo'}</p>
									{#if person.photoUrl}
										<button type="button" onclick={() => downloadPhoto(person.photoUrl!, person.name)} class="btn btn-xs btn-outline mt-1 gap-1">
											<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
											Download
										</button>
									{/if}
								</div>
							</div>
							<div class="flex gap-2 flex-wrap">
								<input name="name" type="text" required value={person.name} placeholder="Name" class="input input-sm flex-1 min-w-36" />
								<input name="instagram" type="text" value={person.instagram ?? ''} placeholder="@handle" class="input input-sm flex-1 min-w-40" />
							</div>
							<div class="flex items-center justify-between gap-2 mt-2">
								<div class="flex gap-2">
									<button type="submit" class="btn btn-sm btn-primary">Save</button>
									<button type="button" class="btn btn-sm btn-outline" onclick={() => editingId = null}>Cancel</button>
								</div>
								<button
									type="submit"
									formaction="?/delete"
									class="btn btn-sm btn-soft btn-error"
									onclick={(e) => { if (!confirm(`Remove ${person.name}?`)) e.preventDefault(); }}
								>Remove</button>
							</div>
						</form>
					</div>
				{:else}
					<!-- Display row -->
					<div class="flex items-center gap-3 px-4 py-2.5 hover:bg-base-200/40 transition-colors">
						<!-- Photo thumbnail — click to preview if exists -->
						<div class="shrink-0 w-10 h-10 rounded-xl overflow-hidden bg-base-300 border border-base-content/10">
							{#if person.photoUrl}
								<button
									type="button"
									onclick={() => openPreview(person.photoUrl!, person.name)}
									class="w-full h-full hover:opacity-75 transition-opacity"
									title="Preview photo"
								>
									<img src={thumbUrl(person.photoUrl)} alt={person.name} class="w-full h-full object-cover" />
								</button>
							{:else}
								<div class="w-full h-full flex items-center justify-center">
									<svg class="h-4 w-4 text-base-content/25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
								</div>
							{/if}
						</div>

						<!-- Name + instagram -->
						<div class="flex-1 min-w-0">
							<p class="font-medium text-sm leading-snug">{person.name}</p>
							{#if person.instagram}
								<a
									href={igUrl(person.instagram)}
									target="_blank"
									rel="noopener"
									class="text-xs text-primary hover:underline"
									onclick={(e) => e.stopPropagation()}
								>{igDisplay(person.instagram)}</a>
							{/if}
						</div>

						<!-- Actions -->
						<div class="flex items-center gap-1 shrink-0">
							{#if person.photoUrl}
								<button
									type="button"
									onclick={() => downloadPhoto(person.photoUrl!, person.name)}
									class="btn btn-xs btn-outline btn-square"
									title="Download photo"
								>
									<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
								</button>
							{/if}
							{#if data.isAdmin}
								<button
									type="button"
									class="btn btn-xs btn-outline shrink-0"
									onclick={() => editingId = person.id}
								>Edit</button>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{/each}
	</div>

	{#if search && filtered.length > 0}
		<p class="text-xs text-base-content/30 text-center mt-3">{filtered.length} of {data.people.length}</p>
	{/if}
{/if}
