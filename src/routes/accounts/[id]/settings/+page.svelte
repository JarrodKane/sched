<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Which snippet/tag is currently in edit mode
	let editingSnippetId = $state<string | null>(null);
	let editingTagId = $state<string | null>(null);

	// Transient loading flags
	let savingLocation = $state(false);
	let addingSnippet = $state(false);
	let deletingSnippetId = $state<string | null>(null);
	let savingSnippetId = $state<string | null>(null);
	let addingTag = $state(false);
	let deletingTagId = $state<string | null>(null);
	let savingTagId = $state<string | null>(null);

	// Location form state (controlled so we can reset)
	let locationId = $state(data.location.id ?? '');
	let locationName = $state(data.location.name ?? '');

	// New snippet form
	let newSnippetLabel = $state('');
	let newSnippetText = $state('');

	// New tag form
	let newTagLabel = $state('');
	let newTagUsername = $state('');
</script>

<svelte:head><title>{data.account.label} Settings — IG Scheduler</title></svelte:head>

<div class="flex flex-col gap-8 max-w-2xl">

	<!-- ── Location ──────────────────────────────────────────────────────────── -->
	<div class="card bg-base-100">
		<div class="card-body gap-4">
			<div>
				<h2 class="font-semibold">Default location</h2>
				<p class="text-xs text-base-content/50 mt-0.5">Applied to all feed posts from this account. Find the Facebook Place ID via the Graph API Explorer.</p>
			</div>

			{#if form?.locationSaved}
				<div role="alert" class="alert alert-success alert-soft text-sm">Location saved.</div>
			{/if}
			{#if form?.error && !form?.snippetAdded && !form?.snippetUpdated && !form?.snippetDeleted && !form?.tagAdded && !form?.tagUpdated && !form?.tagDeleted}
				<div role="alert" class="alert alert-error alert-soft text-sm">{form.error}</div>
			{/if}

			<form
				method="POST"
				action="?/updateLocation"
				use:enhance={() => {
					savingLocation = true;
					return async ({ update }) => {
						savingLocation = false;
						await update();
					};
				}}
				class="flex flex-col gap-3"
			>
				<div class="grid sm:grid-cols-2 gap-3">
					<fieldset class="fieldset">
						<legend class="fieldset-legend">Display name</legend>
						<input
							type="text"
							name="location_name"
							bind:value={locationName}
							placeholder="e.g. Deadfunny Comedy Club"
							class="input w-full"
						/>
					</fieldset>
					<fieldset class="fieldset">
						<legend class="fieldset-legend">Facebook Place ID</legend>
						<input
							type="text"
							name="location_id"
							bind:value={locationId}
							placeholder="e.g. 123456789"
							class="input w-full"
							autocomplete="off"
						/>
					</fieldset>
				</div>
				<div class="flex items-center gap-3">
					<button type="submit" disabled={savingLocation} class="btn btn-primary btn-sm">
						{#if savingLocation}<span class="loading loading-spinner loading-xs"></span>{/if}
						Save location
					</button>
					{#if data.location.id}
						<span class="text-xs text-base-content/40">Currently: {data.location.name} ({data.location.id})</span>
					{:else}
						<span class="text-xs text-base-content/40">No location set — posts won't be tagged</span>
					{/if}
				</div>
			</form>
		</div>
	</div>

	<!-- ── Caption snippets ──────────────────────────────────────────────────── -->
	<div class="card bg-base-100">
		<div class="card-body gap-4">
			<div>
				<h2 class="font-semibold">Caption snippets</h2>
				<p class="text-xs text-base-content/50 mt-0.5">Short-cuts inserted into captions when composing a post.</p>
			</div>

			{#if data.snippets.length > 0}
				<ul class="flex flex-col divide-y divide-base-200 -mx-6 border-y border-base-200">
					{#each data.snippets as snippet (snippet.id)}
						<li class="px-6 py-3">
							{#if editingSnippetId === snippet.id}
								<form
									method="POST"
									action="?/updateSnippet"
									use:enhance={() => {
										savingSnippetId = snippet.id;
										return async ({ result, update }) => {
											savingSnippetId = null;
											if (result.type !== 'failure') editingSnippetId = null;
											await update();
										};
									}}
									class="flex flex-col gap-2"
								>
									<input type="hidden" name="id" value={snippet.id} />
									<div class="grid sm:grid-cols-[1fr_2fr] gap-2">
										<input
											type="text"
											name="label"
											value={snippet.label}
											placeholder="Label"
											required
											class="input input-sm w-full"
										/>
										<textarea
											name="text"
											rows="2"
											placeholder="Snippet text"
											required
											class="textarea textarea-sm w-full"
										>{snippet.text}</textarea>
									</div>
									<div class="flex gap-2">
										<button
											type="submit"
											disabled={savingSnippetId === snippet.id}
											class="btn btn-primary btn-xs"
										>
											{#if savingSnippetId === snippet.id}<span class="loading loading-spinner loading-xs"></span>{/if}
											Save
										</button>
										<button type="button" onclick={() => (editingSnippetId = null)} class="btn btn-ghost btn-xs">Cancel</button>
									</div>
								</form>
							{:else}
								<div class="flex items-start gap-3">
									<div class="flex-1 min-w-0">
										<p class="text-sm font-medium">{snippet.label}</p>
										<p class="text-xs text-base-content/50 mt-0.5 line-clamp-2">{snippet.text}</p>
									</div>
									<div class="flex gap-1 shrink-0">
										<button
											type="button"
											onclick={() => { editingSnippetId = snippet.id; editingTagId = null; }}
											class="btn btn-ghost btn-xs"
										>Edit</button>
										<form
											method="POST"
											action="?/deleteSnippet"
											use:enhance={() => {
												deletingSnippetId = snippet.id;
												return async ({ update }) => {
													deletingSnippetId = null;
													await update();
												};
											}}
										>
											<input type="hidden" name="id" value={snippet.id} />
											<button
												type="submit"
												disabled={deletingSnippetId === snippet.id}
												onclick={(e) => { if (!confirm('Delete this snippet?')) e.preventDefault(); }}
												class="btn btn-ghost btn-xs text-error"
											>
												{#if deletingSnippetId === snippet.id}
													<span class="loading loading-spinner loading-xs"></span>
												{:else}Delete{/if}
											</button>
										</form>
									</div>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{:else}
				<p class="text-sm text-base-content/40">No snippets yet.</p>
			{/if}

			<!-- Add snippet -->
			<form
				method="POST"
				action="?/addSnippet"
				use:enhance={() => {
					addingSnippet = true;
					return async ({ result, update }) => {
						addingSnippet = false;
						if (result.type !== 'failure') {
							newSnippetLabel = '';
							newSnippetText = '';
						}
						await update();
					};
				}}
				class="flex flex-col gap-2 pt-2 border-t border-base-200"
			>
				<p class="text-xs font-semibold text-base-content/50 uppercase tracking-wide">Add snippet</p>
				<div class="grid sm:grid-cols-[1fr_2fr] gap-2">
					<input
						type="text"
						name="label"
						bind:value={newSnippetLabel}
						placeholder="Label (e.g. Promo)"
						required
						class="input input-sm w-full"
					/>
					<textarea
						name="text"
						bind:value={newSnippetText}
						rows="2"
						placeholder="Snippet text…"
						required
						class="textarea textarea-sm w-full"
					></textarea>
				</div>
				<div>
					<button type="submit" disabled={addingSnippet} class="btn btn-sm btn-outline">
						{#if addingSnippet}<span class="loading loading-spinner loading-xs"></span>{/if}
						Add snippet
					</button>
				</div>
			</form>
		</div>
	</div>

	<!-- ── Tag snippets ───────────────────────────────────────────────────────── -->
	<div class="card bg-base-100">
		<div class="card-body gap-4">
			<div>
				<h2 class="font-semibold">Tag shortcuts</h2>
				<p class="text-xs text-base-content/50 mt-0.5">One-click Instagram usernames available when composing a post.</p>
			</div>

			{#if data.tags.length > 0}
				<ul class="flex flex-col divide-y divide-base-200 -mx-6 border-y border-base-200">
					{#each data.tags as tag (tag.id)}
						<li class="px-6 py-3">
							{#if editingTagId === tag.id}
								<form
									method="POST"
									action="?/updateTag"
									use:enhance={() => {
										savingTagId = tag.id;
										return async ({ result, update }) => {
											savingTagId = null;
											if (result.type !== 'failure') editingTagId = null;
											await update();
										};
									}}
									class="flex flex-col gap-2"
								>
									<input type="hidden" name="id" value={tag.id} />
									<div class="grid sm:grid-cols-2 gap-2">
										<input
											type="text"
											name="label"
											value={tag.label}
											placeholder="Label"
											required
											class="input input-sm w-full"
										/>
										<div class="flex items-center gap-1">
											<span class="text-base-content/40 text-sm">@</span>
											<input
												type="text"
												name="username"
												value={tag.username}
												placeholder="username"
												required
												autocorrect="off"
												autocapitalize="off"
												class="input input-sm flex-1"
											/>
										</div>
									</div>
									<div class="flex gap-2">
										<button
											type="submit"
											disabled={savingTagId === tag.id}
											class="btn btn-primary btn-xs"
										>
											{#if savingTagId === tag.id}<span class="loading loading-spinner loading-xs"></span>{/if}
											Save
										</button>
										<button type="button" onclick={() => (editingTagId = null)} class="btn btn-ghost btn-xs">Cancel</button>
									</div>
								</form>
							{:else}
								<div class="flex items-center gap-3">
									<div class="flex-1 min-w-0">
										<p class="text-sm font-medium">{tag.label}</p>
										<p class="text-xs text-base-content/50 mt-0.5">@{tag.username}</p>
									</div>
									<div class="flex gap-1 shrink-0">
										<button
											type="button"
											onclick={() => { editingTagId = tag.id; editingSnippetId = null; }}
											class="btn btn-ghost btn-xs"
										>Edit</button>
										<form
											method="POST"
											action="?/deleteTag"
											use:enhance={() => {
												deletingTagId = tag.id;
												return async ({ update }) => {
													deletingTagId = null;
													await update();
												};
											}}
										>
											<input type="hidden" name="id" value={tag.id} />
											<button
												type="submit"
												disabled={deletingTagId === tag.id}
												onclick={(e) => { if (!confirm('Delete this tag shortcut?')) e.preventDefault(); }}
												class="btn btn-ghost btn-xs text-error"
											>
												{#if deletingTagId === tag.id}
													<span class="loading loading-spinner loading-xs"></span>
												{:else}Delete{/if}
											</button>
										</form>
									</div>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{:else}
				<p class="text-sm text-base-content/40">No tag shortcuts yet.</p>
			{/if}

			<!-- Add tag -->
			<form
				method="POST"
				action="?/addTag"
				use:enhance={() => {
					addingTag = true;
					return async ({ result, update }) => {
						addingTag = false;
						if (result.type !== 'failure') {
							newTagLabel = '';
							newTagUsername = '';
						}
						await update();
					};
				}}
				class="flex flex-col gap-2 pt-2 border-t border-base-200"
			>
				<p class="text-xs font-semibold text-base-content/50 uppercase tracking-wide">Add tag shortcut</p>
				<div class="grid sm:grid-cols-2 gap-2">
					<input
						type="text"
						name="label"
						bind:value={newTagLabel}
						placeholder="Label (e.g. Our venue)"
						required
						class="input input-sm w-full"
					/>
					<div class="flex items-center gap-1">
						<span class="text-base-content/40 text-sm">@</span>
						<input
							type="text"
							name="username"
							bind:value={newTagUsername}
							placeholder="username"
							required
							autocorrect="off"
							autocapitalize="off"
							class="input input-sm flex-1"
						/>
					</div>
				</div>
				<div>
					<button type="submit" disabled={addingTag} class="btn btn-sm btn-outline">
						{#if addingTag}<span class="loading loading-spinner loading-xs"></span>{/if}
						Add tag
					</button>
				</div>
			</form>
		</div>
	</div>

</div>
