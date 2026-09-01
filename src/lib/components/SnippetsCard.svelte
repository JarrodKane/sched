<!--
  SnippetsCard.svelte
  Full CRUD card for caption snippets — reusable text fragments that can be
  inserted into captions and optionally fed to the AI caption generator.
  Supports add, inline edit, delete, and a "use in AI" toggle via named form
  actions on the parent settings page (?/addSnippet, ?/updateSnippet, etc.).

  Svelte features:
    $state     — editingId, savingId, deletingId, togglingAiId, adding,
                 newLabel, newText (all local UI state — no derived values)
    $props()   — receives snippets array from the page data
    use:enhance — on all four action forms; savingId/deletingId track in-flight
                  requests to show spinners on the active row's button

  Props:
    snippets   Snippet[]   — list of { id, label, text, useInAi }
-->

<script lang="ts">
	import { enhance } from '$app/forms';

	type Snippet = { id: string; label: string; text: string; useInAi: boolean };
	let { snippets }: { snippets: Snippet[] } = $props();

	let editingId = $state<string | null>(null);
	let savingId = $state<string | null>(null);
	let deletingId = $state<string | null>(null);
	let togglingAiId = $state<string | null>(null);
	let adding = $state(false);
	let newLabel = $state('');
	let newText = $state('');
</script>

<div class="card bg-base-100">
	<div class="card-body gap-4">
		<div class="flex flex-col gap-1">
			<h2 class="font-semibold">Caption snippets</h2>
			<p class="text-xs text-base-content/50">Reusable blocks of text — venue address, ticket links, promo copy — that you can insert into a post with one click while composing.</p>
			<p class="text-xs text-base-content/40 mt-1">The <span class="font-semibold text-success">AI</span> button on each snippet controls whether it gets shared with the AI when generating captions. Turn it on for things like your address or ticket URL so the AI can include the exact wording.</p>
		</div>

		{#if snippets.length > 0}
			<ul class="flex flex-col divide-y divide-base-200 -mx-6 border-y border-base-200">
				{#each snippets as snippet (snippet.id)}
					<li class="px-6 py-3">
						{#if editingId === snippet.id}
							<form
								method="POST"
								action="?/updateSnippet"
								use:enhance={() => {
									savingId = snippet.id;
									return async ({ result, update }) => {
										savingId = null;
										if (result.type !== 'failure') editingId = null;
										await update();
									};
								}}
								class="flex flex-col gap-2"
							>
								<input type="hidden" name="id" value={snippet.id} />
								<div class="grid sm:grid-cols-[1fr_2fr] gap-2">
									<input type="text" name="label" value={snippet.label} placeholder="Label" required class="input input-sm w-full" />
									<textarea name="text" rows="2" placeholder="Snippet text" required class="textarea textarea-sm w-full">{snippet.text}</textarea>
								</div>
								<div class="flex gap-2">
									<button type="submit" disabled={savingId === snippet.id} class="btn btn-primary btn-xs">
										{#if savingId === snippet.id}<span class="loading loading-spinner loading-xs"></span>{/if}
										Save
									</button>
									<button type="button" onclick={() => (editingId = null)} class="btn btn-outline btn-xs">Cancel</button>
								</div>
							</form>
						{:else}
							<div class="flex items-start gap-3">
								<div class="flex-1 min-w-0">
									<p class="text-sm font-medium">{snippet.label}</p>
									<p class="text-xs text-base-content/50 mt-0.5 line-clamp-2">{snippet.text}</p>
								</div>
								<div class="flex items-center gap-1 shrink-0">
									<form method="POST" action="?/toggleSnippetAi" use:enhance={() => {
										togglingAiId = snippet.id;
										return async ({ update }) => { togglingAiId = null; await update(); };
									}}>
										<input type="hidden" name="id" value={snippet.id} />
										<input type="hidden" name="use_in_ai" value={snippet.useInAi ? 'false' : 'true'} />
										<button type="submit" disabled={togglingAiId === snippet.id}
											title={snippet.useInAi ? 'Used by AI — click to disable' : 'Not used by AI — click to enable'}
											class="btn btn-xs gap-1 {snippet.useInAi ? 'btn-success' : 'btn-outline opacity-40'}"
										>
											{#if togglingAiId === snippet.id}
												<span class="loading loading-spinner loading-xs"></span>
											{:else}
												<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
											{/if}
											AI
										</button>
									</form>
									<button type="button" onclick={() => (editingId = snippet.id)} class="btn btn-outline btn-xs">Edit</button>
									<form method="POST" action="?/deleteSnippet" use:enhance={() => {
										deletingId = snippet.id;
										return async ({ update }) => { deletingId = null; await update(); };
									}}>
										<input type="hidden" name="id" value={snippet.id} />
										<button type="submit" disabled={deletingId === snippet.id}
											onclick={(e) => { if (!confirm('Delete this snippet?')) e.preventDefault(); }}
											class="btn btn-outline btn-xs text-error"
										>
											{#if deletingId === snippet.id}<span class="loading loading-spinner loading-xs"></span>{:else}Delete{/if}
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

		<form method="POST" action="?/addSnippet"
			use:enhance={() => {
				adding = true;
				return async ({ result, update }) => {
					adding = false;
					if (result.type !== 'failure') { newLabel = ''; newText = ''; }
					await update();
				};
			}}
			class="flex flex-col gap-2 pt-2 border-t border-base-200"
		>
			<p class="text-xs font-semibold text-base-content/50 uppercase tracking-wide">Add snippet</p>
			<div class="grid sm:grid-cols-[1fr_2fr] gap-2">
				<input type="text" name="label" bind:value={newLabel} placeholder="Label (e.g. Promo)" required class="input input-sm w-full" />
				<textarea name="text" bind:value={newText} rows="2" placeholder="Snippet text…" required class="textarea textarea-sm w-full"></textarea>
			</div>
			<div>
				<button type="submit" disabled={adding} class="btn btn-sm btn-outline">
					{#if adding}<span class="loading loading-spinner loading-xs"></span>{/if}
					Add snippet
				</button>
			</div>
		</form>
	</div>
</div>
