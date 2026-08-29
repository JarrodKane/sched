<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { tick } from 'svelte';
	import CropModal from '$lib/components/CropModal.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let uploading = $state(false);
	let uploadedUrl = $state('');
	let thumbnailUrlForPost = $state('');
	let uploadError = $state('');
	let scheduling = $state(false);
	let postType = $state<'feed' | 'story'>('feed');
	let postNow = $state(false);
	let caption = $state('');
	let captionEl = $state<HTMLTextAreaElement | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let imageDimensions = $state<{ width: number; height: number } | null>(null);

	// Shared preview modal — used for both the "Preview post" button and queue items
	let previewDialog = $state<HTMLDialogElement | null>(null);
	let previewImageUrl = $state('');
	let previewPostType = $state<'feed' | 'story'>('feed');
	let previewCaption = $state('');

	// Reschedule modal
	let rescheduleDialog = $state<HTMLDialogElement | null>(null);
	let reschedulePostId = $state('');
	let rescheduleTime = $state('');
	let rescheduling = $state(false);

	// Gallery pick modal
	let galleryDialog = $state<HTMLDialogElement | null>(null);

	function pickFromGallery(url: string) {
		uploadedUrl = url;
		thumbnailUrlForPost = '';
		uploadError = '';
		checkDimensions(url);
		galleryDialog?.close();
	}

	// Edit caption modal
	let editCaptionDialog = $state<HTMLDialogElement | null>(null);
	let editCaptionPostId = $state('');
	let editCaptionValue = $state('');
	let editingCaption = $state(false);

	function openEditCaption(postId: string, currentCaption: string | null) {
		editCaptionPostId = postId;
		editCaptionValue = currentCaption ?? '';
		editCaptionDialog?.showModal();
	}

	let cropModal = $state<CropModal | null>(null);

	// ── Helpers ─────────────────────────────────────────────────────────────────

	function relativeTime(date: string | Date): string {
		const diff = new Date(date).getTime() - Date.now();
		const abs = Math.abs(diff);
		const past = diff < 0;
		if (abs < 60_000) return past ? 'just now' : 'in less than a minute';
		const mins = Math.round(abs / 60_000);
		if (mins < 60) return past ? `${mins}m ago` : `in ${mins}m`;
		const hours = Math.floor(mins / 60);
		const remMins = mins % 60;
		if (hours < 24) return past ? `${hours}h ${remMins}m ago` : `in ${hours}h${remMins > 0 ? ` ${remMins}m` : ''}`;
		const days = Math.floor(hours / 24);
		return past ? `${days}d ago` : `in ${days}d`;
	}

	function checkDimensions(url: string) {
		imageDimensions = null;
		const img = new Image();
		img.onload = () => { imageDimensions = { width: img.naturalWidth, height: img.naturalHeight }; };
		img.src = url;
	}

	function getInstagramFit(w: number, h: number, type: 'feed' | 'story'): { ok: boolean; label: string } {
		const ratio = w / h;
		if (type === 'story') {
			const ok = Math.abs(ratio - 9 / 16) < 0.06;
			return { ok, label: ok ? '9:16 — story ready' : 'Not 9:16 — will be cropped by Instagram' };
		}
		if (Math.abs(ratio - 4 / 5) < 0.06) return { ok: true, label: '4:5 portrait — feed ready' };
		if (Math.abs(ratio - 1) < 0.06) return { ok: true, label: '1:1 square — feed ready' };
		if (Math.abs(ratio - 1.91) < 0.08) return { ok: true, label: '1.91:1 landscape — feed ready' };
		if (ratio < 0.75) return { ok: false, label: 'Too tall — Instagram will crop to 4:5' };
		if (ratio > 2) return { ok: false, label: 'Too wide — Instagram will crop to 1.91:1' };
		return { ok: false, label: 'Unusual ratio — Instagram may crop' };
	}

	async function insertSnippet(text: string) {
		if (!captionEl) return;
		const start = captionEl.selectionStart ?? caption.length;
		const end = captionEl.selectionEnd ?? start;
		caption = caption.slice(0, start) + text + caption.slice(end);
		await tick();
		const pos = start + text.length;
		captionEl.setSelectionRange(pos, pos);
		captionEl.focus();
	}

	// ── File / crop actions ──────────────────────────────────────────────────────

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		if (!file.type.startsWith('image/')) {
			uploadError = 'Only image files are supported.';
			return;
		}
		if (file.size > 3 * 1024 * 1024) {
			uploadError = 'Image must be 3 MB or smaller.';
			return;
		}
		uploadError = '';
		cropModal?.openWithFile(file, postType);
	}

	function handleCropComplete(url: string, thumbnailUrl: string | null) {
		uploadedUrl = url;
		thumbnailUrlForPost = thumbnailUrl ?? '';
		uploadError = '';
		checkDimensions(url);
	}

	function handleCropCancel() {
		// Reset file input so it doesn't show a stale filename
		if (fileInput) fileInput.value = '';
	}

	function editCurrentImage() {
		if (uploadedUrl) cropModal?.openWithUrl(uploadedUrl, postType);
	}

	function openFormPreview() {
		previewImageUrl = uploadedUrl;
		previewPostType = postType;
		previewCaption = caption;
		previewDialog?.showModal();
	}

	function openQueueItemPreview(post: { mediaUrl: string; type: string; caption: string | null }) {
		previewImageUrl = post.mediaUrl;
		previewPostType = post.type as 'feed' | 'story';
		previewCaption = post.caption ?? '';
		previewDialog?.showModal();
	}

	function openReschedule(postId: string, currentScheduledFor: string | Date) {
		reschedulePostId = postId;
		const d = new Date(currentScheduledFor);
		// Default to the same time but tomorrow, or 1 hour from now if that's further out
		const tomorrow = new Date(d);
		tomorrow.setDate(tomorrow.getDate() + 1);
		const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
		rescheduleTime = (tomorrow > oneHourFromNow ? tomorrow : oneHourFromNow).toISOString().slice(0, 16);
		rescheduleDialog?.showModal();
	}

	// Smart default: current time rounded up to the next 15-min mark, + 1 hour
	function defaultScheduleTime(): string {
		const d = new Date(Date.now() + 60 * 60 * 1000);
		const mins = d.getMinutes();
		d.setMinutes(Math.ceil(mins / 15) * 15, 0, 0);
		return d.toISOString().slice(0, 16);
	}

	const minDatetime = new Date(Date.now() + 60_000).toISOString().slice(0, 16);
	let scheduledFor = $state(defaultScheduleTime());

	$effect(() => {
		const t = setInterval(() => invalidateAll(), 30_000);
		return () => clearInterval(t);
	});
</script>

<svelte:head><title>{data.account.label} — IG Scheduler</title></svelte:head>

<!-- Crop modal (shared component) -->
<CropModal
	bind:this={cropModal}
	accountId={data.account.id}
	oncomplete={handleCropComplete}
	oncancel={handleCropCancel}
/>

<!-- ── Preview modal (shared for form preview + queue item preview) ───────────── -->
<dialog bind:this={previewDialog} class="modal">
	<div class="modal-box flex flex-col items-center gap-4 bg-transparent shadow-none p-4 max-w-xs">
		<div class="mockup-phone">
			<div class="mockup-phone-camera"></div>
			<div class="mockup-phone-display">
				<div class="bg-base-100 flex flex-col h-full">
					<div class="flex items-center gap-2 p-2 border-b border-base-300 shrink-0">
						<div class="w-7 h-7 rounded-full bg-linear-to-tr from-yellow-400 via-pink-500 to-purple-600"></div>
						<span class="text-xs font-semibold">{data.account.label}</span>
					</div>
					{#if previewPostType === 'story'}
						<div class="aspect-9/16 overflow-hidden bg-black">
							<img src={previewImageUrl} alt="" class="h-full w-full object-cover" />
						</div>
					{:else}
						<div class="aspect-square overflow-hidden bg-base-200">
							<img src={previewImageUrl} alt="" class="h-full w-full object-cover" />
						</div>
					{/if}
					{#if previewPostType === 'feed'}
						<div class="p-2 shrink-0">
							{#if previewCaption}
								<p class="text-xs leading-snug">
									<span class="font-semibold">{data.account.label}</span>
									{' '}{previewCaption}
								</p>
							{:else}
								<p class="text-xs text-base-content/40 italic">No caption</p>
							{/if}
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

<!-- ── Reschedule modal ───────────────────────────────────────────────────────── -->
<dialog bind:this={rescheduleDialog} class="modal">
	<div class="modal-box max-w-sm">
		<h3 class="font-semibold mb-4">Reschedule post</h3>
		<form
			method="POST"
			action="?/reschedule"
			use:enhance={() => {
				rescheduling = true;
				return async ({ result, update }) => {
					rescheduling = false;
					if (result.type !== 'failure') rescheduleDialog?.close();
					await update();
				};
			}}
			class="flex flex-col gap-4"
		>
			<input type="hidden" name="post_id" value={reschedulePostId} />
			<fieldset class="fieldset">
				<legend class="fieldset-legend">New date & time</legend>
				<input
					type="datetime-local"
					name="scheduled_for"
					bind:value={rescheduleTime}
					min={minDatetime}
					required
					class="input w-full"
				/>
			</fieldset>
			{#if form?.error}
				<div role="alert" class="alert alert-error alert-soft text-sm">{form.error}</div>
			{/if}
			<div class="flex gap-2">
				<button type="submit" disabled={rescheduling} class="btn btn-primary flex-1">
					{#if rescheduling}<span class="loading loading-spinner loading-sm"></span>{/if}
					{rescheduling ? 'Saving…' : 'Reschedule'}
				</button>
				<button type="button" onclick={() => rescheduleDialog?.close()} class="btn btn-ghost flex-1">Cancel</button>
			</div>
		</form>
	</div>
	<form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>

<!-- ── Gallery pick modal ─────────────────────────────────────────────────────── -->
<dialog bind:this={galleryDialog} class="modal">
	<div class="modal-box max-w-2xl w-full">
		<div class="flex items-center justify-between mb-4">
			<h3 class="font-semibold">Choose from library</h3>
			<form method="dialog"><button class="btn btn-ghost btn-sm btn-circle">✕</button></form>
		</div>
		{#if data.priorUploads.length === 0}
			<p class="text-sm text-base-content/40">No images in library yet.</p>
		{:else}
			<div class="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-[60vh] overflow-y-auto">
				{#each data.priorUploads as img}
					<button
						type="button"
						onclick={() => pickFromGallery(img.url)}
						class="group relative aspect-square overflow-hidden rounded-box border-2 transition
							{uploadedUrl === img.url ? 'border-primary' : 'border-transparent hover:border-base-300'}"
					>
						<img src={img.url} alt="" class="h-full w-full object-cover transition group-hover:scale-105" />
						{#if uploadedUrl === img.url}
							<span class="absolute inset-0 bg-primary/20 flex items-center justify-center">
								<svg class="h-6 w-6 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
							</span>
						{/if}
						<span class="absolute bottom-0 inset-x-0 bg-black/60 px-1.5 py-1 opacity-0 group-hover:opacity-100 transition">
							<span class="text-white text-xs truncate block">{img.name}</span>
						</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>
	<form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>

<!-- ── Edit caption modal ─────────────────────────────────────────────────────── -->
<dialog bind:this={editCaptionDialog} class="modal">
	<div class="modal-box max-w-sm">
		<h3 class="font-semibold mb-4">Edit caption</h3>
		<form
			method="POST"
			action="?/editCaption"
			use:enhance={() => {
				editingCaption = true;
				return async ({ result, update }) => {
					editingCaption = false;
					if (result.type !== 'failure') editCaptionDialog?.close();
					await update();
				};
			}}
			class="flex flex-col gap-4"
		>
			<input type="hidden" name="post_id" value={editCaptionPostId} />
			<fieldset class="fieldset">
				<legend class="fieldset-legend">Caption</legend>
				<textarea
					name="caption"
					bind:value={editCaptionValue}
					rows="5"
					placeholder="Write your caption…"
					class="textarea w-full"
				></textarea>
			</fieldset>
			{#if form?.error}
				<div role="alert" class="alert alert-error alert-soft text-sm">{form.error}</div>
			{/if}
			<div class="flex gap-2">
				<button type="submit" disabled={editingCaption} class="btn btn-primary flex-1">
					{#if editingCaption}<span class="loading loading-spinner loading-sm"></span>{/if}
					{editingCaption ? 'Saving…' : 'Save caption'}
				</button>
				<button type="button" onclick={() => editCaptionDialog?.close()} class="btn btn-ghost flex-1">Cancel</button>
			</div>
		</form>
	</div>
	<form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>

<!-- ── Main content ───────────────────────────────────────────────────────────── -->
<div class="grid gap-8 lg:grid-cols-2">
	<!-- Schedule new post -->
	<section>
		<div class="card bg-base-100">
			<div class="card-body gap-5">
				<h2 class="card-title text-sm font-semibold uppercase tracking-wide text-base-content/50">
					{postNow ? 'Post now' : 'Schedule post'}
				</h2>

				{#if form?.error}
					<div role="alert" class="alert alert-error alert-soft text-sm">{form.error}</div>
				{/if}
				{#if form?.success}
					<div role="alert" class="alert alert-success alert-soft text-sm">Post scheduled!</div>
				{/if}
				{#if form?.published}
					<div role="alert" class="alert alert-success alert-soft text-sm">Published to Instagram!</div>
				{/if}

				<form
					method="POST"
					action="?/schedule"
					use:enhance={() => {
						scheduling = true;
						return async ({ result, update }) => {
							scheduling = false;
							if (result.type !== 'failure') {
								uploadedUrl = '';
								thumbnailUrlForPost = '';
								caption = '';
								imageDimensions = null;
								if (fileInput) fileInput.value = '';
							}
							await update();
						};
					}}
					class="flex flex-col gap-5"
				>
					<!-- Post type -->
					<div>
						<p class="label mb-2">Type</p>
						<div class="join">
							<button
								type="button"
								onclick={() => (postType = 'feed')}
								class="btn join-item btn-sm {postType === 'feed' ? 'btn-primary' : 'btn-ghost'}"
							>Feed</button>
							<button
								type="button"
								onclick={() => (postType = 'story')}
								class="btn join-item btn-sm {postType === 'story' ? 'btn-primary' : 'btn-ghost'}"
							>Story</button>
						</div>
					</div>
					<input type="hidden" name="type" value={postType} />

					<!-- Image upload -->
					<fieldset class="fieldset">
						<legend class="fieldset-legend">Image</legend>
						<input
							bind:this={fileInput}
							id="image-upload"
							type="file"
							accept="image/*"
							onchange={handleFileSelect}
							class="file-input w-full file-input-sm"
						/>
					</fieldset>

					{#if uploadedUrl}
						<div class="flex items-start gap-3">
							<img src={uploadedUrl} alt="preview" class="h-20 w-20 rounded-box object-cover shrink-0" />
							<div class="min-w-0 flex flex-col gap-1.5">
								{#if imageDimensions}
									{@const fit = getInstagramFit(imageDimensions.width, imageDimensions.height, postType)}
									<p class="text-xs text-base-content/50">{imageDimensions.width} × {imageDimensions.height}px</p>
									<span class="badge badge-soft badge-sm {fit.ok ? 'badge-success' : 'badge-warning'}">
										{fit.label}
									</span>
								{/if}
								<div class="flex flex-wrap gap-1.5 mt-0.5">
									<button
										type="button"
										onclick={openFormPreview}
										class="btn btn-ghost btn-xs"
									>Preview post</button>
									<button
										type="button"
										onclick={editCurrentImage}
										class="btn btn-ghost btn-xs"
									>Edit image</button>
								</div>
							</div>
						</div>
					{/if}
					<input type="hidden" name="media_url" value={uploadedUrl} />
					<input type="hidden" name="thumbnail_url" value={thumbnailUrlForPost} />

					{#if data.priorUploads.length > 0}
						<div>
							<p class="label mb-2">Recent uploads</p>
							<div class="flex flex-wrap items-center gap-2">
								{#each data.priorUploads.slice(0, 2) as img}
									<button
										type="button"
										onclick={() => {
											uploadedUrl = img.url;
											thumbnailUrlForPost = '';
											uploadError = '';
											checkDimensions(img.url);
										}}
										class="relative h-16 w-16 overflow-hidden rounded-box border-2 transition {uploadedUrl === img.url
											? 'border-neutral'
											: 'border-transparent hover:border-base-300'}"
									>
										<img src={img.url} alt="" class="h-full w-full object-cover" />
									</button>
								{/each}
								{#if data.priorUploads.length > 0}
									<button
										type="button"
										onclick={() => galleryDialog?.showModal()}
										class="btn btn-ghost btn-sm gap-1 text-base-content/60"
									>
										<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
											<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
											<polyline points="21 15 16 10 5 21"/>
										</svg>
										Browse library
									</button>
								{/if}
							</div>
						</div>
					{/if}

					{#if uploadError}
						<div role="alert" class="alert alert-error alert-soft text-sm">{uploadError}</div>
					{/if}

					<!-- Caption (feed only) -->
					{#if postType === 'feed'}
						<fieldset class="fieldset">
							<legend class="fieldset-legend">
								Caption <span class="font-normal text-base-content/40">(optional)</span>
							</legend>
							<textarea
								bind:this={captionEl}
								bind:value={caption}
								id="caption"
								name="caption"
								rows="4"
								placeholder="Write your caption…"
								class="textarea w-full"
							></textarea>

							{#if data.snippets.length > 0}
								<div class="mt-2">
									<p class="label mb-1.5">Insert snippet:</p>
									<div class="flex flex-wrap gap-1.5">
										{#each data.snippets as snippet}
											<button
												type="button"
												onclick={() => insertSnippet(snippet.text)}
												title={snippet.text}
												class="btn btn-ghost btn-xs rounded-full border border-base-300"
											>
												{snippet.label}
											</button>
										{/each}
									</div>
								</div>
							{/if}
						</fieldset>
					{/if}

					<!-- When to post -->
					<div>
						<p class="label mb-2">When</p>
						<div class="join mb-3">
							<button
								type="button"
								onclick={() => (postNow = false)}
								class="btn join-item btn-sm {!postNow ? 'btn-primary' : 'btn-ghost'}"
							>Schedule</button>
							<button
								type="button"
								onclick={() => (postNow = true)}
								class="btn join-item btn-sm {postNow ? 'btn-primary' : 'btn-ghost'}"
							>Post now</button>
						</div>
						{#if !postNow}
							<input
								id="scheduled_for"
								name="scheduled_for"
								type="datetime-local"
								bind:value={scheduledFor}
								min={minDatetime}
								required
								class="input input-sm"
							/>
						{/if}
					</div>

					<div class="card-actions">
						<button
							type="submit"
							formaction={postNow ? '?/publishNow' : '?/schedule'}
							disabled={scheduling || !uploadedUrl}
							class="btn btn-primary"
						>
							{#if scheduling}
								<span class="loading loading-spinner loading-sm"></span>
							{/if}
							{scheduling ? (postNow ? 'Publishing…' : 'Scheduling…') : (postNow ? 'Publish now' : 'Schedule post')}
						</button>
					</div>
				</form>
			</div>
		</div>
	</section>

	<!-- Upcoming queue -->
	<section>
		<div class="card bg-base-100">
			<div class="card-body gap-4">
				<h2 class="card-title text-sm font-semibold uppercase tracking-wide text-base-content/50">
					Upcoming ({data.queue.length})
				</h2>

				{#if form?.cancelled}
					<div role="alert" class="alert alert-success alert-soft text-sm">Post cancelled.</div>
				{/if}
				{#if form?.rescheduled}
					<div role="alert" class="alert alert-success alert-soft text-sm">Post rescheduled.</div>
				{/if}
				{#if form?.captionEdited}
					<div role="alert" class="alert alert-success alert-soft text-sm">Caption updated.</div>
				{/if}

				{#if data.queue.length === 0}
					<p class="text-sm text-base-content/40">Nothing scheduled yet.</p>
				{:else}
					<ul class="list">
						{#each data.queue as post}
							<li class="list-row items-start py-3">
								<!-- Thumbnail -->
								<img
									src={post.thumbnailUrl ?? post.mediaUrl}
									alt=""
									class="h-11 w-11 rounded-box object-cover shrink-0 mt-0.5"
								/>
								<!-- Info + actions -->
								<div class="list-col-grow min-w-0">
									<div class="flex flex-wrap items-center gap-1.5 mb-1">
										<span class="badge badge-ghost badge-xs capitalize">{post.type}</span>
										{#if post.status === 'publishing'}
											<span class="badge badge-info badge-soft badge-xs">
												<span class="loading loading-ring loading-xs"></span>
												publishing
											</span>
										{/if}
										<span class="text-xs font-medium text-base-content/80">{relativeTime(post.scheduledFor)}</span>
										<span class="text-xs text-base-content/40">
											{new Date(post.scheduledFor).toLocaleString(undefined, {
												weekday: 'short', month: 'short', day: 'numeric',
												hour: '2-digit', minute: '2-digit'
											})}
										</span>
									</div>
									{#if post.caption}
										<p class="text-xs text-base-content/50 leading-snug mb-1.5 line-clamp-2">{post.caption}</p>
									{/if}
									{#if post.status === 'pending'}
										<div class="flex flex-wrap items-center gap-0.5 -ml-1.5">
											<button
												type="button"
												onclick={() => openQueueItemPreview(post)}
												class="btn btn-ghost btn-xs text-base-content/50"
											>Preview</button>
											{#if post.type === 'feed'}
												<button
													type="button"
													onclick={() => openEditCaption(post.id, post.caption)}
													class="btn btn-ghost btn-xs text-base-content/50"
												>Edit caption</button>
											{/if}
											<button
												type="button"
												onclick={() => openReschedule(post.id, post.scheduledFor)}
												class="btn btn-ghost btn-xs text-base-content/50"
											>Reschedule</button>
											<form method="POST" action="?/cancel" use:enhance>
												<input type="hidden" name="post_id" value={post.id} />
												<button
													type="submit"
													class="btn btn-ghost btn-xs text-error/70"
													onclick={(e) => { if (!confirm('Cancel this scheduled post?')) e.preventDefault(); }}
												>Cancel</button>
											</form>
										</div>
									{/if}
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	</section>
</div>
