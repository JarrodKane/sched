<!--
  +page.svelte — /accounts/[id]/settings
  Settings page for one account. Hosts the location card, AI caption instructions
  card, and delegates snippet and tag CRUD to SnippetsCard and TagsCard components.

  Svelte features:
    $state     — savingLocation, locationId, locationName (bound to the location form),
                 aiInstructions, savingAiInstructions
    $props()   — receives data (location, aiInstructions, snippets, tags, accountMeta)
                 and form (action result for flash messages)
    use:enhance — on the location and AI instructions forms; sets the saving flag to
                  show a spinner, then clears it in the callback
    bind:value — two-way binds locationId and locationName to their inputs so the
                 current values remain visible before the user saves
-->

<script lang="ts">
	import { enhance } from '$app/forms';
	import SnippetsCard from '$lib/components/SnippetsCard.svelte';
	import TagsCard from '$lib/components/TagsCard.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let savingLocation = $state(false);
	let locationId = $state(data.location.id ?? '');
	let locationName = $state(data.location.name ?? '');

	let aiInstructions = $state(data.aiInstructions ?? '');
	let savingAiInstructions = $state(false);
</script>

<svelte:head><title>{data.accountMeta.label} Settings — Sched</title></svelte:head>

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

			<form method="POST" action="?/updateLocation"
				use:enhance={() => {
					savingLocation = true;
					return async ({ update }) => { savingLocation = false; await update(); };
				}}
				class="flex flex-col gap-3"
			>
				<div class="grid sm:grid-cols-2 gap-3">
					<fieldset class="fieldset">
						<legend class="fieldset-legend">Display name</legend>
						<input type="text" name="location_name" bind:value={locationName} placeholder="e.g. Deadfunny Comedy Club" class="input w-full" />
					</fieldset>
					<fieldset class="fieldset">
						<legend class="fieldset-legend">Facebook Place ID</legend>
						<input type="text" name="location_id" bind:value={locationId} placeholder="e.g. 123456789" class="input w-full" autocomplete="off" />
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

	<!-- ── AI caption instructions ──────────────────────────────────────────── -->
	<div class="card bg-base-100">
		<div class="card-body gap-4">
			<div>
				<h2 class="font-semibold">AI caption instructions</h2>
				<p class="text-xs text-base-content/50 mt-0.5">Account-specific instructions for the AI when generating captions — tone, style, anything that's unique to this account. These apply on top of the global structure every caption follows.</p>
			</div>

			{#if form?.aiInstructionsSaved}
				<div role="alert" class="alert alert-success alert-soft text-sm">Saved.</div>
			{/if}

			<form method="POST" action="?/updateAiInstructions"
				use:enhance={() => {
					savingAiInstructions = true;
					return async ({ update }) => { savingAiInstructions = false; await update(); };
				}}
				class="flex flex-col gap-3"
			>
				<textarea name="ai_instructions" bind:value={aiInstructions} rows="5"
					placeholder="Example: Write captions for a Melbourne comedy club. Tone is witty and casual, never corporate. Always end with 2–3 relevant hashtags. Keep under 150 words."
					class="textarea w-full"></textarea>
				<div>
					<button type="submit" disabled={savingAiInstructions} class="btn btn-primary btn-sm">
						{#if savingAiInstructions}<span class="loading loading-spinner loading-xs"></span>{/if}
						Save instructions
					</button>
				</div>
			</form>
		</div>
	</div>

	<SnippetsCard snippets={data.snippets} />
	<TagsCard tags={data.tags} />

</div>
