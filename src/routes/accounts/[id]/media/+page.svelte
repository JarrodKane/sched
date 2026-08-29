<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import CropModal from '$lib/components/CropModal.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	function formatSize(bytes: number | undefined): string {
		if (!bytes) return '';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
		return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	}

	function formatDate(iso: string | null): string {
		if (!iso) return '';
		return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	}

	let deleting = $state<string | null>(null);
	let downloading = $state<string | null>(null);
	let cropModal = $state<CropModal | null>(null);

	// Preview dialog state
	let previewDialog = $state<HTMLDialogElement | null>(null);
	let previewUrl = $state('');
	let previewType = $state<'feed' | 'story'>('feed');

	// Select mode
	let selectMode = $state(false);
	let selected = $state(new Set<string>());
	let massDeleting = $state(false);
	let massDeleteResult = $state('');

	// Filter: 'all' | 'posted'
	let filter = $state<'all' | 'posted'>('all');

	const visibleFiles = $derived(
		filter === 'posted' ? data.files.filter((f) => f.hasBeenPosted) : data.files
	);

	const allVisibleSelected = $derived(
		visibleFiles.length > 0 && visibleFiles.every((f) => selected.has(f.path))
	);

	const selectedDeletable = $derived(
		[...selected].filter((p) => !data.files.find((f) => f.path === p)?.inUse)
	);

	function openPreview(url: string) {
		previewUrl = url;
		previewDialog?.showModal();
	}

	async function downloadImage(url: string, filename: string) {
		downloading = url;
		try {
			const res = await fetch(url);
			const blob = await res.blob();
			const objectUrl = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = objectUrl;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(objectUrl);
		} finally {
			downloading = null;
		}
	}

	function toggleSelectMode() {
		selectMode = !selectMode;
		if (!selectMode) selected = new Set();
	}

	function toggleItem(path: string) {
		const next = new Set(selected);
		if (next.has(path)) next.delete(path);
		else next.add(path);
		selected = next;
	}

	function toggleSelectAll() {
		if (allVisibleSelected) {
			selected = new Set();
		} else {
			selected = new Set(visibleFiles.map((f) => f.path));
		}
	}

	async function massDelete() {
		if (selectedDeletable.length === 0) return;
		const count = selectedDeletable.length;
		if (!confirm(`Delete ${count} image${count === 1 ? '' : 's'}? This cannot be undone.`)) return;

		massDeleting = true;
		massDeleteResult = '';
		try {
			const fd = new FormData();
			for (const p of selectedDeletable) fd.append('path', p);
			const res = await fetch('?/deleteMany', { method: 'POST', body: fd });
			const json = await res.json().catch(() => null);
			if (res.ok) {
				await invalidateAll();
				selected = new Set();
				const skipped = json?.data?.skippedCount ?? 0;
				massDeleteResult = skipped > 0 ? `Deleted. ${skipped} skipped (in use).` : 'Deleted.';
			} else {
				massDeleteResult = json?.error ?? 'Delete failed';
			}
		} catch {
			massDeleteResult = 'Delete failed';
		} finally {
			massDeleting = false;
		}
	}
</script>

<svelte:head><title>{data.account.label} Media — IG Scheduler</title></svelte:head>

<!-- Crop modal -->
<CropModal
	bind:this={cropModal}
	accountId={data.account.id}
	oncomplete={() => invalidateAll()}
/>

<!-- Preview modal -->
<dialog bind:this={previewDialog} class="modal">
	<div class="modal-box flex flex-col items-center gap-4 bg-transparent shadow-none p-4 max-w-xs">
		<div class="join">
			<button
				type="button"
				onclick={() => (previewType = 'feed')}
				class="btn join-item btn-sm {previewType === 'feed' ? 'btn-primary' : 'btn-ghost'}"
			>Feed</button>
			<button
				type="button"
				onclick={() => (previewType = 'story')}
				class="btn join-item btn-sm {previewType === 'story' ? 'btn-primary' : 'btn-ghost'}"
			>Story</button>
		</div>

		<div class="mockup-phone">
			<div class="mockup-phone-camera"></div>
			<div class="mockup-phone-display">
				<div class="bg-base-100 flex flex-col h-full">
					<div class="flex items-center gap-2 p-2 border-b border-base-300 shrink-0">
						<div class="w-7 h-7 rounded-full bg-linear-to-tr from-yellow-400 via-pink-500 to-purple-600"></div>
						<span class="text-xs font-semibold">{data.account.label}</span>
					</div>
					{#if previewType === 'story'}
						<div class="aspect-9/16 overflow-hidden bg-black">
							<img src={previewUrl} alt="" class="h-full w-full object-cover" />
						</div>
					{:else}
						<div class="aspect-square overflow-hidden bg-base-200">
							<img src={previewUrl} alt="" class="h-full w-full object-cover" />
						</div>
					{/if}
				</div>
			</div>
		</div>

		<div class="modal-action w-full m-0">
			<form method="dialog" class="w-full">
				<button class="btn btn-sm w-full">Close preview</button>
			</form>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>

{#if form?.error}
	<div role="alert" class="alert alert-error alert-soft mb-4 text-sm">{form.error}</div>
{/if}
{#if form?.deleted}
	<div role="alert" class="alert alert-success alert-soft mb-4 text-sm">Image deleted.</div>
{/if}

{#if data.files.length === 0}
	<div role="alert" class="alert alert-soft">No images uploaded yet.</div>
{:else}
	<!-- Toolbar -->
	<div class="mb-4 flex flex-col gap-2">
		<div class="flex items-center justify-between gap-2">
			<div class="join">
				<button
					type="button"
					onclick={() => { filter = 'all'; }}
					class="btn btn-xs join-item {filter === 'all' ? 'btn-neutral' : 'btn-ghost'}"
				>All ({data.files.length})</button>
				<button
					type="button"
					onclick={() => { filter = 'posted'; }}
					class="btn btn-xs join-item {filter === 'posted' ? 'btn-neutral' : 'btn-ghost'}"
				>Posted ({data.files.filter(f => f.hasBeenPosted).length})</button>
			</div>
			<button
				type="button"
				onclick={toggleSelectMode}
				class="btn btn-xs btn-ghost"
			>{selectMode ? 'Done' : 'Select'}</button>
		</div>

		{#if selectMode}
			<div class="flex flex-wrap items-center gap-2 pl-0.5">
				<span class="text-xs text-base-content/50">{selected.size} selected</span>
				<button type="button" onclick={toggleSelectAll} class="btn btn-xs btn-ghost">
					{allVisibleSelected ? 'Deselect all' : 'Select all'}
				</button>
				{#if selectedDeletable.length > 0}
					<button
						type="button"
						onclick={massDelete}
						disabled={massDeleting}
						class="btn btn-xs btn-error btn-soft"
					>
						{massDeleting ? 'Deleting…' : `Delete ${selectedDeletable.length}`}
					</button>
				{:else if selected.size > 0}
					<span class="text-xs text-base-content/40">Selected images are in use</span>
				{/if}
				{#if massDeleteResult}
					<span class="text-xs {massDeleteResult.includes('failed') ? 'text-error' : 'text-success'}">
						{massDeleteResult}
					</span>
				{/if}
			</div>
		{/if}
	</div>

	{#if visibleFiles.length === 0}
		<div role="alert" class="alert alert-soft">
			{filter === 'posted' ? 'No posted images yet.' : 'No images uploaded yet.'}
		</div>
	{:else}
		<div class="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
			{#each visibleFiles as file}
				<div class="card bg-base-100 overflow-hidden group {selectMode && selected.has(file.path) ? 'ring-2 ring-primary' : ''}">
					<figure class="aspect-square overflow-hidden bg-base-200 relative">
						<img
							src={file.url}
							alt=""
							class="h-full w-full object-cover transition-transform group-hover:scale-105"
							loading="lazy"
						/>

						<!-- Status badge -->
						{#if file.inUse}
							<span class="absolute top-2 left-2 badge badge-warning badge-xs shadow">Scheduled</span>
						{:else if file.hasBeenPosted}
							<span class="absolute top-2 left-2 badge badge-success badge-xs shadow">Posted</span>
						{/if}

						{#if selectMode}
							<!-- Tap to select -->
							<button
								type="button"
								onclick={() => toggleItem(file.path)}
								class="absolute inset-0 z-10 cursor-pointer"
								aria-label="Select {file.name}"
							>
								<span class="absolute top-2 right-2 h-5 w-5 rounded border-2 flex items-center justify-center shadow
									{selected.has(file.path) ? 'bg-primary border-primary text-primary-content' : 'bg-base-100/80 border-base-300'}">
									{#if selected.has(file.path)}
										<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
									{/if}
								</span>
							</button>
						{:else}
							<!-- Hover overlay: Preview (left) + Delete (right) -->
							<div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-2 gap-2">
								<button
									type="button"
									onclick={() => openPreview(file.url)}
									class="btn btn-xs text-white border-white/30 bg-white/10 hover:bg-white/25"
								>
									<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
									Preview
								</button>
								{#if file.inUse}
									<span class="text-xs text-white/50 self-center">In use</span>
								{:else}
									<form
										method="POST"
										action="?/delete"
										use:enhance={() => {
											deleting = file.path;
											return async ({ result, update }) => {
												deleting = null;
												await update();
											};
										}}
									>
										<input type="hidden" name="path" value={file.path} />
										<button
											type="submit"
											disabled={deleting === file.path}
											onclick={(e) => { if (!confirm('Delete this image? This cannot be undone.')) e.preventDefault(); }}
											class="btn btn-xs btn-error"
										>
											{#if deleting === file.path}
												<span class="loading loading-spinner loading-xs"></span>
											{:else}
												<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
												Delete
											{/if}
										</button>
									</form>
								{/if}
							</div>
						{/if}
					</figure>

					<div class="card-body p-3 gap-0.5">
						<p class="text-xs font-medium truncate" title={file.name}>{file.name}</p>
						<p class="text-xs text-base-content/40">
							{formatDate(file.createdAt)}{file.size ? ` · ${formatSize(file.size)}` : ''}
						</p>
						{#if !selectMode}
							<div class="flex gap-1 mt-1.5">
								<button
									type="button"
									onclick={() => cropModal?.openWithUrl(file.url)}
									class="btn btn-ghost btn-xs"
								>Edit</button>
								<button
									type="button"
									onclick={() => downloadImage(file.url, file.name)}
									disabled={downloading === file.url}
									class="btn btn-ghost btn-xs"
								>{downloading === file.url ? '…' : 'Download'}</button>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
{/if}
