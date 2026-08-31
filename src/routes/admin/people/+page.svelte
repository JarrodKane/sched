<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let search = $state('');
	let editingId = $state<string | null>(null);
	let showAddForm = $state(false);
	let addNameInput = $state<HTMLInputElement | undefined>();

	const filtered = $derived(
		search.trim()
			? data.people.filter(
					(p) =>
						p.name.toLowerCase().includes(search.toLowerCase()) ||
						(p.instagram ?? '').toLowerCase().includes(search.toLowerCase())
				)
			: data.people
	);

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
</script>

<svelte:head><title>People — Admin</title></svelte:head>

<!-- Header -->
<div class="mb-4 flex items-center justify-between gap-3">
	<div>
		<h1 class="text-xl font-semibold">Talent directory</h1>
		<p class="text-sm text-base-content/40 mt-0.5">{data.people.length} {data.people.length === 1 ? 'person' : 'people'}</p>
	</div>
	{#if !showAddForm}
		<button type="button" class="btn btn-primary btn-sm shrink-0" onclick={openAdd}>
			+ Add person
		</button>
	{/if}
</div>

{#if form?.error}
	<div role="alert" class="alert alert-error alert-soft mb-4 text-sm">{form.error}</div>
{/if}

<!-- Add form — collapses after submit -->
{#if showAddForm}
	<div class="rounded-2xl bg-base-100 border border-base-200 p-4 mb-4">
		<p class="text-sm font-semibold mb-3">New person</p>
		<form
			method="POST"
			action="?/add"
			use:enhance={() => async ({ result, update }) => {
				if (result.type === 'success') showAddForm = false;
				await update();
			}}
			class="flex flex-col gap-3"
		>
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
				<button type="button" class="btn btn-sm btn-ghost" onclick={() => showAddForm = false}>Cancel</button>
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
					<!-- Inline edit -->
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
							<div class="flex gap-2 flex-wrap">
								<input name="name" type="text" required value={person.name} placeholder="Name" class="input input-sm flex-1 min-w-36" />
								<input name="instagram" type="text" value={person.instagram ?? ''} placeholder="@handle" class="input input-sm flex-1 min-w-40" />
							</div>
							<div class="flex items-center justify-between gap-2">
								<div class="flex gap-2">
									<button type="submit" class="btn btn-sm btn-primary">Save</button>
									<button type="button" class="btn btn-sm btn-ghost" onclick={() => editingId = null}>Cancel</button>
								</div>
								<button
									type="submit"
									formaction="?/delete"
									class="btn btn-sm btn-ghost text-error"
									onclick={(e) => { if (!confirm(`Remove ${person.name}?`)) e.preventDefault(); }}
								>Remove</button>
							</div>
						</form>
					</div>
				{:else}
					<!-- Display row -->
					<div class="flex items-center gap-3 px-4 py-3 min-h-13 hover:bg-base-200/40 transition-colors">
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
						<button
							type="button"
							class="btn btn-ghost btn-xs shrink-0 text-base-content/40 hover:text-base-content"
							onclick={() => editingId = person.id}
						>Edit</button>
					</div>
				{/if}
			</div>
		{/each}
	</div>

	{#if search && filtered.length > 0}
		<p class="text-xs text-base-content/30 text-center mt-3">{filtered.length} of {data.people.length}</p>
	{/if}
{/if}
