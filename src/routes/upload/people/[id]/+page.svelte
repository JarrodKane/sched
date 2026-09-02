<!--
  +page.svelte — /upload/people/[id]
  Public photo upload page. Anyone with the link can upload a photo for the named person.
  No login required — the person UUID in the URL is the unguessable token.

  Uses CropModal with a custom uploadEndpoint (/api/people-upload/[id]) so the upload
  goes through a no-auth endpoint that saves directly to people.photo_url.
-->

<script lang="ts">
	import CropModal from '$lib/components/CropModal.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let cropModal = $state<CropModal | null>(null);
	let fileInputEl = $state<HTMLInputElement | null>(null);
	let uploaded = $state(false);
	let uploadedUrl = $state('');

	function onFileChange(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		cropModal?.openWithFile(file, 'feed');
		(e.currentTarget as HTMLInputElement).value = '';
	}

	function onPhotoDone(url: string) {
		uploadedUrl = url;
		uploaded = true;
	}
</script>

<svelte:head><title>Upload photo — {data.person.name}</title></svelte:head>

<CropModal
	bind:this={cropModal}
	accountId={data.person.id}
	uploadEndpoint="/api/people-upload/{data.person.id}"
	lockRatio="4:5"
	hideTypeSelector
	simpleBgColors
	hideSkip
	oncomplete={onPhotoDone}
/>
<input bind:this={fileInputEl} type="file" accept="image/*" class="hidden" onchange={onFileChange} />

<div class="flex min-h-[80vh] items-center justify-center">
	<div class="card bg-base-100 w-full max-w-sm shadow-xl">
		<div class="card-body gap-5 items-center text-center">

			{#if uploaded}
				<!-- Success state -->
				<div class="w-24 h-24 rounded-2xl overflow-hidden border-4 border-success/30 shadow-lg">
					<img src={uploadedUrl} alt={data.person.name} class="w-full h-full object-cover" />
				</div>
				<div>
					<h1 class="text-xl font-semibold">Photo uploaded!</h1>
					<p class="text-sm text-base-content/50 mt-1">Thanks, {data.person.name.split(' ')[0]}. Your photo has been saved.</p>
				</div>
				<button
					type="button"
					onclick={() => { uploaded = false; fileInputEl?.click(); }}
					class="btn btn-outline btn-sm"
				>Upload a different photo</button>

			{:else}
				<!-- Upload state -->
				<!-- Current photo preview or placeholder avatar -->
				<div class="w-24 h-24 rounded-2xl overflow-hidden bg-base-300 border border-base-content/10 flex items-center justify-center">
					{#if data.person.photoUrl}
						<div class="relative w-full h-full skeleton">
							<img
								src={data.person.photoUrl}
								alt={data.person.name}
								class="w-full h-full object-cover opacity-0 transition-opacity duration-200"
								onload={(e) => {
									e.currentTarget.classList.remove('opacity-0');
									e.currentTarget.parentElement?.classList.remove('skeleton');
								}}
							/>
						</div>
					{:else}
						<svg class="h-10 w-10 text-base-content/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
					{/if}
				</div>

				<div>
					<h1 class="text-xl font-semibold">{data.person.name}</h1>
					<p class="text-sm text-base-content/50 mt-1">
						{data.person.photoUrl ? 'Upload a new photo to replace your current one.' : 'Upload a photo to add yourself to the directory.'}
					</p>
				</div>

				<button
					type="button"
					onclick={() => fileInputEl?.click()}
					class="btn btn-primary btn-block"
				>
					<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
					{data.person.photoUrl ? 'Replace photo' : 'Upload photo'}
				</button>

				<p class="text-xs text-base-content/30">Accepts JPG, PNG, HEIC · max 20 MB</p>
			{/if}

		</div>
	</div>
</div>
