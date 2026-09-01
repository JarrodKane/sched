<!--
  TagsCard.svelte
  Full CRUD card for tag shortcuts — Instagram @handles (and optionally categories)
  that can be inserted into captions and fed to the AI generator. Same CRUD pattern
  as SnippetsCard but for tag entries (label, username, category, useInAi).

  Svelte features:
    $state     — editingId, savingId, deletingId, togglingAiId, adding,
                 newLabel, newUsername, newCategory (local UI state)
    $props()   — receives tags array from the page data
    use:enhance — on all four action forms (?/addTag, ?/updateTag, etc.)

  Props:
    tags   Tag[]   — list of { id, label, username, category, useInAi }
-->

<script lang="ts">
	import { enhance } from '$app/forms';

	type Tag = { id: string; label: string; username: string; category: string | null; useInAi: boolean };
	let { tags }: { tags: Tag[] } = $props();

	let editingId = $state<string | null>(null);
	let savingId = $state<string | null>(null);
	let deletingId = $state<string | null>(null);
	let togglingAiId = $state<string | null>(null);
	let adding = $state(false);
	let newLabel = $state('');
	let newUsername = $state('');
</script>

<div class="card bg-base-100">
	<div class="card-body gap-4">
		<div class="flex flex-col gap-1">
			<h2 class="font-semibold">Tag shortcuts</h2>
			<p class="text-xs text-base-content/50">Instagram @usernames saved for quick tagging when composing a post — one click adds them to the people tagged in the image.</p>
			<p class="text-xs text-base-content/40 mt-1">The <span class="font-semibold text-success">AI</span> button tells the AI to include that handle in generated captions. Set the category so it knows how to reference them: <span class="font-medium">Venue</span> = the bar/club, <span class="font-medium">Act</span> = a performer, <span class="font-medium">MC</span> = the host.</p>
		</div>

		{#if tags.length > 0}
			<ul class="flex flex-col divide-y divide-base-200 -mx-6 border-y border-base-200">
				{#each tags as tag (tag.id)}
					<li class="px-6 py-3">
						{#if editingId === tag.id}
							<form
								method="POST"
								action="?/updateTag"
								use:enhance={() => {
									savingId = tag.id;
									return async ({ result, update }) => {
										savingId = null;
										if (result.type !== 'failure') editingId = null;
										await update();
									};
								}}
								class="flex flex-col gap-2"
							>
								<input type="hidden" name="id" value={tag.id} />
								<div class="grid sm:grid-cols-3 gap-2">
									<input type="text" name="label" value={tag.label} placeholder="Label" required class="input input-sm w-full" />
									<div class="flex items-center gap-1">
										<span class="text-base-content/40 text-sm">@</span>
										<input type="text" name="username" value={tag.username} placeholder="username" required autocorrect="off" autocapitalize="off" class="input input-sm flex-1" />
									</div>
									<select name="category" class="select select-sm w-full">
										<option value="" selected={!tag.category}>No category</option>
										<option value="venue" selected={tag.category === 'venue'}>Venue</option>
										<option value="act" selected={tag.category === 'act'}>Act</option>
										<option value="mc" selected={tag.category === 'mc'}>MC</option>
									</select>
								</div>
								<div class="flex gap-2">
									<button type="submit" disabled={savingId === tag.id} class="btn btn-primary btn-xs">
										{#if savingId === tag.id}<span class="loading loading-spinner loading-xs"></span>{/if}
										Save
									</button>
									<button type="button" onclick={() => (editingId = null)} class="btn btn-outline btn-xs">Cancel</button>
								</div>
							</form>
						{:else}
							<div class="flex items-center gap-3">
								<div class="flex-1 min-w-0">
									<div class="flex items-center gap-1.5">
										<p class="text-sm font-medium">{tag.label}</p>
										{#if tag.category}
											<span class="badge badge-xs badge-ghost capitalize">{tag.category}</span>
										{/if}
									</div>
									<p class="text-xs text-base-content/50 mt-0.5">@{tag.username}</p>
								</div>
								<div class="flex items-center gap-1 shrink-0">
									<form method="POST" action="?/toggleTagAi" use:enhance={() => {
										togglingAiId = tag.id;
										return async ({ update }) => { togglingAiId = null; await update(); };
									}}>
										<input type="hidden" name="id" value={tag.id} />
										<input type="hidden" name="use_in_ai" value={tag.useInAi ? 'false' : 'true'} />
										<button type="submit" disabled={togglingAiId === tag.id}
											title={tag.useInAi ? 'Used by AI — click to disable' : 'Not used by AI — click to enable'}
											class="btn btn-xs gap-1 {tag.useInAi ? 'btn-success' : 'btn-outline opacity-40'}"
										>
											{#if togglingAiId === tag.id}
												<span class="loading loading-spinner loading-xs"></span>
											{:else}
												<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
											{/if}
											AI
										</button>
									</form>
									<button type="button" onclick={() => (editingId = tag.id)} class="btn btn-outline btn-xs">Edit</button>
									<form method="POST" action="?/deleteTag" use:enhance={() => {
										deletingId = tag.id;
										return async ({ update }) => { deletingId = null; await update(); };
									}}>
										<input type="hidden" name="id" value={tag.id} />
										<button type="submit" disabled={deletingId === tag.id}
											onclick={(e) => { if (!confirm('Delete this tag shortcut?')) e.preventDefault(); }}
											class="btn btn-outline btn-xs text-error"
										>
											{#if deletingId === tag.id}<span class="loading loading-spinner loading-xs"></span>{:else}Delete{/if}
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

		<form method="POST" action="?/addTag"
			use:enhance={() => {
				adding = true;
				return async ({ result, update }) => {
					adding = false;
					if (result.type !== 'failure') { newLabel = ''; newUsername = ''; }
					await update();
				};
			}}
			class="flex flex-col gap-2 pt-2 border-t border-base-200"
		>
			<p class="text-xs font-semibold text-base-content/50 uppercase tracking-wide">Add tag shortcut</p>
			<div class="grid sm:grid-cols-3 gap-2">
				<input type="text" name="label" bind:value={newLabel} placeholder="Label (e.g. Our venue)" required class="input input-sm w-full" />
				<div class="flex items-center gap-1">
					<span class="text-base-content/40 text-sm">@</span>
					<input type="text" name="username" bind:value={newUsername} placeholder="username" required autocorrect="off" autocapitalize="off" class="input input-sm flex-1" />
				</div>
				<select name="category" class="select select-sm w-full">
					<option value="">No category</option>
					<option value="venue">Venue</option>
					<option value="act">Act</option>
					<option value="mc">MC</option>
				</select>
			</div>
			<div>
				<button type="submit" disabled={adding} class="btn btn-sm btn-outline">
					{#if adding}<span class="loading loading-spinner loading-xs"></span>{/if}
					Add tag
				</button>
			</div>
		</form>
	</div>
</div>
