<!--
  +page.svelte — /accounts/[id]
  Main schedule page. Hosts the full post scheduling form: image upload via
  CropModal or GalleryPickModal, text overlay via TextOverlayModal, caption input
  with AI generation and undo, tag insertion, feed/story/carousel toggle, and a
  date/time picker. The PostQueuePanel renders the upcoming queue and recent history.

  Carousel mode allows multiple images with per-slide tag maps, drag-to-reorder,
  and individual remove buttons. The AI caption generator calls the
  /accounts/[id]/generate-caption endpoint and stores previous drafts in a local
  captionHistory array for undo.

  Svelte features:
    $state       — uploadedUrl, thumbnailUrlForPost, uploadError, scheduling,
                   generatingCaption, generateError, captionStyle, captionHistory,
                   postType, postNow, caption, carouselUrls, carouselTagMap,
                   dragIndex, dropTargetIndex, selectedTags, tagSearch, imageDimensions,
                   captionEl, fileInput, and bind:this refs for all modal components
    $props()     — receives data (queue, history, uploads, snippets, tags, etc.)
                   and form (action result for flash messages)
    use:enhance  — on the main schedule form; tracks scheduling state for the spinner
    invalidateAll() — refreshes page data after a crop upload completes
    bind:this    — on CropModal, TextOverlayModal, PostPreviewModal, RescheduleModal,
                   GalleryPickModal, EditCaptionModal, ViewCaptionModal; allows calling
                   each component's open() method from parent event handlers
-->

<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { tick } from 'svelte';
	import CropModal from '$lib/components/CropModal.svelte';
	import TextOverlayModal from '$lib/components/TextOverlayModal.svelte';
	import PostPreviewModal from '$lib/components/PostPreviewModal.svelte';
	import RescheduleModal from '$lib/components/RescheduleModal.svelte';
	import GalleryPickModal from '$lib/components/GalleryPickModal.svelte';
	import EditCaptionModal from '$lib/components/EditCaptionModal.svelte';
	import ViewCaptionModal from '$lib/components/ViewCaptionModal.svelte';
	import PostQueuePanel from '$lib/components/PostQueuePanel.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let uploadedUrl = $state('');
	let thumbnailUrlForPost = $state('');
	let uploadError = $state('');
	let scheduling = $state(false);
	let generatingCaption = $state(false);
	let generateError = $state('');
	let captionStyle = $state<'event' | 'recap'>('event');
	let captionHistory = $state<string[]>([]);

	async function generateCaption() {
		generateError = '';
		generatingCaption = true;
		const allTaggedPeople = postType === 'carousel'
			? [...new Set(Object.values(carouselTagMap).flat())]
			: selectedTags;
		try {
			const res = await fetch(`/accounts/${data.account.id}/generate-caption`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ context: caption, taggedPeople: allTaggedPeople, style: captionStyle })
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				generateError = err?.message ?? 'Failed to generate caption.';
			} else {
				const { caption: generated } = await res.json();
				captionHistory = [...captionHistory, caption];
				caption = generated;
			}
		} catch {
			generateError = 'Network error — could not reach the server.';
		} finally {
			generatingCaption = false;
		}
	}

	function undoCaption() {
		if (captionHistory.length === 0) return;
		const prev = captionHistory[captionHistory.length - 1];
		captionHistory = captionHistory.slice(0, -1);
		caption = prev;
	}

	let postType = $state<'feed' | 'story' | 'carousel'>('feed');
	let postNow = $state(false);
	let caption = $state('');
	let captionEl = $state<HTMLTextAreaElement | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let imageDimensions = $state<{ width: number; height: number } | null>(null);

	// Carousel state
	let carouselUrls = $state<string[]>([]);
	let addingToCarousel = $state(false);

	// Carousel drag-to-reorder
	let dragIndex = $state<number | null>(null);
	let dropTargetIndex = $state<number | null>(null);

	function onCarouselDragStart(e: DragEvent, i: number) {
		dragIndex = i;
		if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); }
	}
	function onCarouselDragEnter(i: number) {
		if (dragIndex !== null && dragIndex !== i) dropTargetIndex = i;
	}
	function onCarouselDragEnd() { dragIndex = null; dropTargetIndex = null; }
	function onCarouselContainerDragOver(e: DragEvent) {
		if (dragIndex !== null) e.preventDefault();
	}
	function onCarouselContainerDrop(e: DragEvent) {
		e.preventDefault();
		if (dragIndex === null || dropTargetIndex === null) { dragIndex = null; dropTargetIndex = null; return; }
		const from = dragIndex, to = dropTargetIndex;
		dragIndex = null; dropTargetIndex = null;
		const oldOrder = Array.from({ length: carouselUrls.length }, (_, i) => i);
		const [movedIdx] = oldOrder.splice(from, 1);
		oldOrder.splice(to, 0, movedIdx);
		carouselUrls = oldOrder.map((i) => carouselUrls[i]);
		const newMap: Record<number, string[]> = {};
		for (let newPos = 0; newPos < oldOrder.length; newPos++) {
			const oldPos = oldOrder[newPos];
			const tags = carouselTagMap[oldPos];
			if (tags?.length) newMap[newPos] = tags;
		}
		carouselTagMap = newMap;
		tagImageIndex = oldOrder.indexOf(tagImageIndex);
	}

	// Tag state
	let selectedTags = $state<string[]>([]);
	let customTagInput = $state('');

	let tagImageIndex = $state(0);
	let carouselTagMap = $state<Record<number, string[]>>({});
	const activeTags = $derived(
		postType === 'carousel' ? (carouselTagMap[tagImageIndex] ?? []) : selectedTags
	);

	// Modal refs
	let previewModal = $state<PostPreviewModal | null>(null);
	let cropModal = $state<CropModal | null>(null);
	let textOverlayModal = $state<TextOverlayModal | null>(null);
	let rescheduleModal = $state<RescheduleModal | null>(null);
	let galleryModal = $state<GalleryPickModal | null>(null);
	let editCaptionModal = $state<EditCaptionModal | null>(null);
	let viewCaptionModal = $state<ViewCaptionModal | null>(null);

	// ── Helpers ──────────────────────────────────────────────────────────────────

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

	// ── File / crop actions ───────────────────────────────────────────────────────

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		if (!file.type.startsWith('image/')) { uploadError = 'Only image files are supported.'; return; }
		if (file.size > 15 * 1024 * 1024) { uploadError = 'Image must be 15 MB or smaller.'; return; }
		uploadError = '';
		cropModal?.openWithFile(file, postType);
	}

	function handleCropComplete(url: string, thumbnailUrl: string | null) {
		if (addingToCarousel) {
			carouselUrls = [...carouselUrls, url];
			addingToCarousel = false;
		} else {
			uploadedUrl = url;
			thumbnailUrlForPost = thumbnailUrl ?? '';
			checkDimensions(url);
		}
		uploadError = '';
	}

	function addCarouselImage(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		if (!file.type.startsWith('image/')) { uploadError = 'Only image files are supported.'; return; }
		if (file.size > 15 * 1024 * 1024) { uploadError = 'Image must be 15 MB or smaller.'; return; }
		uploadError = '';
		addingToCarousel = true;
		cropModal?.openWithFile(file, 'feed');
		input.value = '';
	}

	function removeCarouselItem(i: number) {
		const newLength = carouselUrls.length - 1;
		carouselUrls = carouselUrls.filter((_, idx) => idx !== i);
		const newMap: Record<number, string[]> = {};
		for (const [k, v] of Object.entries(carouselTagMap)) {
			const ki = +k;
			if (ki < i) newMap[ki] = v;
			else if (ki > i) newMap[ki - 1] = v;
		}
		carouselTagMap = newMap;
		if (tagImageIndex >= newLength) tagImageIndex = Math.max(0, newLength - 1);
	}

	function moveCarouselItem(i: number, dir: -1 | 1) {
		const j = i + dir;
		if (j < 0 || j >= carouselUrls.length) return;
		const arr = [...carouselUrls];
		[arr[i], arr[j]] = [arr[j], arr[i]];
		carouselUrls = arr;
		const newMap = { ...carouselTagMap };
		const ti = carouselTagMap[i], tj = carouselTagMap[j];
		if (ti?.length) newMap[j] = ti; else delete newMap[j];
		if (tj?.length) newMap[i] = tj; else delete newMap[i];
		carouselTagMap = newMap;
		if (tagImageIndex === i) tagImageIndex = j;
		else if (tagImageIndex === j) tagImageIndex = i;
	}

	function toggleTag(username: string) {
		if (postType === 'carousel') {
			const current = carouselTagMap[tagImageIndex] ?? [];
			carouselTagMap = {
				...carouselTagMap,
				[tagImageIndex]: current.includes(username)
					? current.filter((u) => u !== username)
					: [...current, username]
			};
		} else {
			if (selectedTags.includes(username)) {
				selectedTags = selectedTags.filter((t) => t !== username);
			} else {
				selectedTags = [...selectedTags, username];
			}
		}
	}

	function addCustomTag() {
		const u = customTagInput.trim().replace(/^@/, '');
		if (!u) return;
		customTagInput = '';
		if (postType === 'carousel') {
			const current = carouselTagMap[tagImageIndex] ?? [];
			if (!current.includes(u))
				carouselTagMap = { ...carouselTagMap, [tagImageIndex]: [...current, u] };
		} else {
			if (!selectedTags.includes(u)) selectedTags = [...selectedTags, u];
		}
	}

	function removeCarouselTag(imageIndex: number, username: string) {
		const current = carouselTagMap[imageIndex] ?? [];
		carouselTagMap = { ...carouselTagMap, [imageIndex]: current.filter((u) => u !== username) };
	}

	function handleCropCancel() {
		if (fileInput) fileInput.value = '';
	}

	function editCurrentImage() {
		if (uploadedUrl) cropModal?.openWithUrl(uploadedUrl, postType);
	}

	function openFormPreview() {
		if (postType === 'carousel' && carouselUrls.length > 0) {
			previewModal?.open({ url: carouselUrls[0], urls: carouselUrls, type: 'feed', caption });
		} else {
			previewModal?.open({
				url: uploadedUrl,
				type: postType === 'carousel' ? 'feed' : postType,
				ratio: imageDimensions ? imageDimensions.width / imageDimensions.height : 1,
				caption
			});
		}
	}

	// ── Queue panel callbacks ─────────────────────────────────────────────────────

	function openQueueItemPreview(post: { mediaUrl: string; type: string; caption: string | null; carouselItems?: string | null }) {
		let urls: string[] | undefined;
		if (post.type === 'carousel' && post.carouselItems) {
			try { urls = JSON.parse(post.carouselItems); } catch { /* ignore */ }
		}
		previewModal?.open({
			url: post.mediaUrl,
			urls,
			type: post.type === 'story' ? 'story' : 'feed',
			caption: post.caption ?? ''
		});
	}

	function handleGalleryPick(url: string, mode: 'single' | 'carousel') {
		if (mode === 'carousel') {
			if (carouselUrls.length < 10) carouselUrls = [...carouselUrls, url];
		} else {
			uploadedUrl = url;
			thumbnailUrlForPost = '';
			uploadError = '';
			checkDimensions(url);
		}
	}

	// Smart default: current time rounded up to the next 15-min mark, + 1 hour
	function toLocalInput(d: Date): string {
		return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
	}

	function defaultScheduleTime(): string {
		const d = new Date(Date.now() + 30 * 60 * 1000);
		const mins = d.getMinutes();
		d.setMinutes(Math.ceil(mins / 15) * 15, 0, 0);
		return toLocalInput(d);
	}

	const minDatetime = $derived(toLocalInput(new Date(Date.now() + 60_000)));
	let scheduledFor = $state(defaultScheduleTime());

	$effect(() => {
		const t = setInterval(() => invalidateAll(), 30_000);
		return () => clearInterval(t);
	});
</script>

<svelte:head><title>{data.account.label} — Sched</title></svelte:head>

{#if !data.canAccessSocial}
	<!-- Overview for users without Instagram access -->
	<div class="flex flex-col gap-4">
		<!-- Upcoming posts summary -->
		<div class="card bg-base-100">
			<div class="card-body gap-1 py-3">
				<p class="text-xs font-medium uppercase tracking-wide text-base-content/40">Instagram posts planned</p>
				<p class="text-3xl font-bold">{data.queue.length}</p>
				{#if data.queue.length > 0}
					<p class="text-sm text-base-content/60 mt-1">
						Next: {new Date(data.queue[0].scheduledFor).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
					</p>
				{:else}
					<p class="text-sm text-base-content/40 mt-1">Nothing scheduled</p>
				{/if}
			</div>
		</div>

		{#if data.canAccessTickets}
			<!-- Tickets — this week's shows inline -->
			<div>
				<div class="flex items-center justify-between mb-3">
					<p class="text-sm font-semibold">Tickets this week</p>
					<a href="/accounts/{data.account.id}/tickets" class="text-xs text-primary hover:underline">All weeks →</a>
				</div>
				{#if data.ticketShowDates && data.ticketShowDates.length > 0}
					<div class="flex flex-col gap-3">
						{#each data.ticketShowDates as item}
							{@const snap = item.snapshot}
							{@const cap = item.capacity}
							{@const p = cap && cap > 0 ? Math.round((snap.totalSold / cap) * 100) : 0}
							{@const isTonight = snap.showDate === data.today}
							{@const fillCol = p >= 90 ? 'text-error' : p >= 70 ? 'text-warning' : 'text-primary'}
							{@const progCol = p >= 90 ? 'progress-error' : p >= 70 ? 'progress-warning' : 'progress-primary'}
							<a href="/accounts/{data.account.id}/tickets/{item.id}?date={snap.showDate}"
								class="card bg-base-100 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 cursor-pointer">
								<div class="card-body py-4 px-5 gap-3">
									<div class="flex items-start justify-between gap-4">
										<div class="min-w-0 flex-1">
											<p class="font-semibold text-base leading-tight">{item.name}</p>
											<div class="flex items-center gap-2 mt-1 flex-wrap">
												{#if isTonight}
													<span class="badge badge-sm badge-primary badge-soft">Tonight</span>
												{/if}
												<span class="text-sm text-base-content/60">
													{new Date(snap.showDate + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
												</span>
											</div>
										</div>
										<div class="shrink-0 text-right">
											<p class="text-3xl font-bold tabular-nums leading-none {cap ? fillCol : 'text-base-content'}">{snap.totalSold}</p>
											{#if cap}
												<p class="text-xs text-base-content/40 mt-0.5">of {cap}</p>
											{:else}
												<p class="text-xs text-base-content/40 mt-0.5">sold</p>
											{/if}
										</div>
									</div>
									{#if cap}
										<div class="flex items-center gap-2">
											<progress class="progress {progCol} flex-1 h-2" value={p} max="100"></progress>
											<span class="text-xs font-medium tabular-nums text-base-content/50 w-10 text-right">{p}%</span>
											<svg class="h-4 w-4 text-base-content/30 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
										</div>
									{/if}
								</div>
							</a>
						{/each}
					</div>
				{:else}
					<div class="card bg-base-100">
						<div class="card-body py-4 text-sm text-base-content/40">No shows this week.</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>
{:else}

<!-- Modals -->
<CropModal
	bind:this={cropModal}
	accountId={data.account.id}
	oncomplete={handleCropComplete}
	oncancel={handleCropCancel}
/>
<TextOverlayModal
	bind:this={textOverlayModal}
	accountId={data.account.id}
	oncomplete={(url) => { uploadedUrl = url; thumbnailUrlForPost = ''; checkDimensions(url); }}
/>
<PostPreviewModal bind:this={previewModal} accountLabel={data.account.label} />
<RescheduleModal bind:this={rescheduleModal} {minDatetime} />
<GalleryPickModal bind:this={galleryModal} uploads={data.priorUploads} onpick={handleGalleryPick} />
<EditCaptionModal bind:this={editCaptionModal} />
<ViewCaptionModal bind:this={viewCaptionModal} />

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
					<div role="alert" class="alert alert-success alert-soft text-sm">Queued — will publish within 60 seconds.</div>
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
								carouselUrls = [];
								selectedTags = [];
								carouselTagMap = {};
								tagImageIndex = 0;
								captionHistory = [];
								customTagInput = '';
								scheduledFor = defaultScheduleTime();
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
								onclick={() => { postType = 'feed'; carouselUrls = []; carouselTagMap = {}; tagImageIndex = 0; uploadedUrl = ''; thumbnailUrlForPost = ''; imageDimensions = null; if (fileInput) fileInput.value = ''; }}
								class="btn join-item btn-sm {postType === 'feed' ? 'btn-primary' : ''}"
							>Feed</button>
							<button
								type="button"
								onclick={() => { postType = 'carousel'; uploadedUrl = ''; thumbnailUrlForPost = ''; imageDimensions = null; if (fileInput) fileInput.value = ''; selectedTags = []; carouselTagMap = {}; tagImageIndex = 0; }}
								class="btn join-item btn-sm {postType === 'carousel' ? 'btn-primary' : ''}"
							>Carousel</button>
							<button
								type="button"
								onclick={() => { postType = 'story'; carouselUrls = []; selectedTags = []; carouselTagMap = {}; tagImageIndex = 0; uploadedUrl = ''; thumbnailUrlForPost = ''; imageDimensions = null; if (fileInput) fileInput.value = ''; }}
								class="btn join-item btn-sm {postType === 'story' ? 'btn-primary' : ''}"
							>Story</button>
						</div>
					</div>
					<input type="hidden" name="type" value={postType} />

					{#if postType === 'carousel'}
						<!-- Carousel image upload -->
						<div class="flex flex-col gap-3">
							<p class="label">Images
								<span class="font-normal text-base-content/40">({carouselUrls.length}/10, min 2)</span>
								<span class="hidden sm:inline font-normal text-base-content/40"> — drag to reorder</span>
							</p>
							{#if carouselUrls.length > 0}
								<div
									class="flex flex-wrap gap-2 pb-4 sm:pb-0"
									ondragover={onCarouselContainerDragOver}
									ondrop={onCarouselContainerDrop}
								>
									{#each carouselUrls as url, i}
										<div
											class="relative select-none transition-opacity cursor-grab active:cursor-grabbing
												{dragIndex === i ? 'opacity-30' : ''}
												{dropTargetIndex === i && dragIndex !== i ? 'ring-2 ring-primary ring-offset-1 rounded-box' : ''}"
											draggable="true"
											ondragstart={(e) => onCarouselDragStart(e, i)}
											ondragenter={() => onCarouselDragEnter(i)}
											ondragend={onCarouselDragEnd}
										>
											<img src={url} alt="" class="h-20 w-20 rounded-box object-cover pointer-events-none" />
											<button
												type="button"
												onclick={() => removeCarouselItem(i)}
												class="absolute -top-1.5 -right-1.5 btn btn-circle btn-xs btn-error opacity-90"
												aria-label="Remove"
											>✕</button>
											<span class="absolute bottom-1 left-1 bg-black/60 text-white text-xs rounded px-1 pointer-events-none">{i + 1}</span>
											<!-- Mobile reorder arrows (drag doesn't work on touch) -->
											<div class="sm:hidden absolute -bottom-1.5 inset-x-0 flex justify-center gap-0.5">
												<button
													type="button"
													onclick={() => moveCarouselItem(i, -1)}
													disabled={i === 0}
													class="btn btn-xs btn-circle btn-soft shadow-sm disabled:opacity-20 h-5 w-5 min-h-0 p-0 text-xs"
													aria-label="Move left"
												>‹</button>
												<button
													type="button"
													onclick={() => moveCarouselItem(i, 1)}
													disabled={i === carouselUrls.length - 1}
													class="btn btn-xs btn-circle btn-soft shadow-sm disabled:opacity-20 h-5 w-5 min-h-0 p-0 text-xs"
													aria-label="Move right"
												>›</button>
											</div>
										</div>
									{/each}
								</div>
							{/if}
							{#if carouselUrls.length < 10}
								<div class="flex flex-wrap gap-2">
									<label class="btn btn-sm border border-dashed border-base-300 gap-1">
										<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
										Upload image
										<input type="file" accept="image/*" onchange={addCarouselImage} class="hidden" />
									</label>
									{#if data.priorUploads.length > 0}
										<button
											type="button"
											onclick={() => galleryModal?.open({ mode: 'carousel', carouselUrls })}
											class="btn btn-sm border border-dashed border-base-300 gap-1"
										>
											<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
											From library
										</button>
									{/if}
								</div>
							{/if}
						</div>
						{#if carouselUrls.length >= 2}
							<button
								type="button"
								onclick={openFormPreview}
								class="btn btn-outline btn-xs self-start"
							>Preview carousel</button>
						{/if}

						<input type="hidden" name="media_url" value={carouselUrls[0] ?? ''} />
						<input type="hidden" name="carousel_items" value={JSON.stringify(carouselUrls)} />
						<input type="hidden" name="thumbnail_url" value="" />
					{:else}
						<!-- Single image upload -->
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
										<button type="button" onclick={openFormPreview} class="btn btn-soft btn-xs">Preview</button>
										<button type="button" onclick={editCurrentImage} class="btn btn-soft btn-xs">Edit image</button>
										<button type="button" onclick={() => textOverlayModal?.openWithUrl(uploadedUrl)} class="btn btn-soft btn-xs">Add text</button>
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
									<button
										type="button"
										onclick={() => galleryModal?.open({ mode: 'single', postType: postType === 'story' ? 'story' : 'feed', currentUrl: uploadedUrl })}
										class="btn btn-outline btn-sm gap-1"
									>
										<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
											<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
											<polyline points="21 15 16 10 5 21"/>
										</svg>
										Browse library
									</button>
								</div>
							</div>
						{/if}
					{/if}

					{#if uploadError}
						<div role="alert" class="alert alert-error alert-soft text-sm">{uploadError}</div>
					{/if}

					<!-- Caption (feed + carousel) -->
					{#if postType === 'feed' || postType === 'carousel'}
						<fieldset class="fieldset">
							<legend class="fieldset-legend">
								Caption <span class="font-normal text-base-content/40">(optional)</span>
							</legend>
							<textarea
								bind:this={captionEl}
								bind:value={caption}
								id="caption"
								name="caption"
								rows="8"
								placeholder="Write your caption…"
								class="textarea w-full"
							></textarea>

							<div class="flex flex-wrap items-center gap-2 mt-1.5">
								<div class="flex items-center gap-1.5">
									<span class="text-xs text-base-content/40">Style:</span>
									<div class="join">
										<div class="tooltip tooltip-bottom" data-tip="Promoting an upcoming show — generates a structured caption with venue, date, time and ticket info">
											<button
												type="button"
												onclick={() => captionStyle = 'event'}
												class="btn btn-xs join-item {captionStyle === 'event' ? 'btn-primary' : ''}"
											>Event post</button>
										</div>
										<div class="tooltip tooltip-bottom" data-tip="Posting about a past event — polishes your caption without restructuring it into a promotion">
											<button
												type="button"
												onclick={() => captionStyle = 'recap'}
												class="btn btn-xs join-item {captionStyle === 'recap' ? 'btn-primary' : ''}"
											>Recap</button>
										</div>
									</div>
								</div>
								<button
									type="button"
									onclick={generateCaption}
									disabled={generatingCaption}
									class="btn btn-xs btn-soft btn-primary gap-1"
								>
									{#if generatingCaption}
										<span class="loading loading-spinner loading-xs"></span>
									{:else}
										<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
									{/if}
									{generatingCaption ? 'Generating…' : caption.trim() ? 'Improve with AI' : 'Generate with AI'}
								</button>
								{#if captionHistory.length > 0}
									<button
										type="button"
										onclick={undoCaption}
										class="btn btn-xs btn-outline gap-1"
										title="Undo to previous caption"
									>
										<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
										Undo
									</button>
								{/if}
								{#if generateError}
									<span class="text-xs text-error">{generateError}</span>
								{/if}
							</div>

							{#if data.snippets.length > 0}
								<div class="mt-2">
									<p class="label mb-1.5">Insert snippet:</p>
									<div class="flex flex-wrap gap-1.5">
										{#each data.snippets as snippet}
											<button
												type="button"
												onclick={() => insertSnippet(snippet.text)}
												title={snippet.text}
												class="btn btn-outline btn-xs rounded-full"
											>
												{snippet.label}
											</button>
										{/each}
									</div>
								</div>
							{/if}
						</fieldset>

						<!-- Tag people -->
						<div class="flex flex-col gap-2">
							<p class="label">Tag people <span class="font-normal text-base-content/40">(optional)</span></p>

							{#if postType === 'carousel' && carouselUrls.length > 0}
								<div class="flex flex-wrap gap-1.5">
									{#each carouselUrls as url, i}
										<button
											type="button"
											onclick={() => tagImageIndex = i}
											class="relative h-11 w-11 rounded-box overflow-hidden border-2 shrink-0 transition
												{tagImageIndex === i ? 'border-primary' : 'border-transparent hover:border-base-300'}"
											title="Tag image {i + 1}"
										>
											<img src={url} alt="" class="h-full w-full object-cover" />
											<span class="absolute bottom-0 inset-x-0 text-center text-white text-[9px] leading-3 bg-black/50 py-0.5">{i + 1}</span>
											{#if (carouselTagMap[i]?.length ?? 0) > 0}
												<span class="absolute top-0.5 right-0.5 badge badge-primary badge-xs min-w-3 h-3 p-0 text-[9px]">{carouselTagMap[i].length}</span>
											{/if}
										</button>
									{/each}
								</div>
								<p class="text-xs text-base-content/50">Tagging image {tagImageIndex + 1}</p>
							{/if}

							{#if postType === 'carousel'}
								{@const allCarouselTags = Object.entries(carouselTagMap).flatMap(([idx, tags]) => tags.map(t => ({ tag: t, idx: +idx })))}
								{#if allCarouselTags.length > 0}
									<div class="flex flex-wrap gap-1.5">
										{#each allCarouselTags as { tag, idx }}
											<span class="badge badge-neutral gap-1">
												@{tag}
												<span class="opacity-40 text-[10px]">img {idx + 1}</span>
												<button type="button" onclick={() => removeCarouselTag(idx, tag)} class="opacity-60 hover:opacity-100" aria-label="Remove">✕</button>
											</span>
										{/each}
									</div>
								{/if}
							{:else if selectedTags.length > 0}
								<div class="flex flex-wrap gap-1.5 mb-1">
									{#each selectedTags as tag}
										<span class="badge badge-neutral gap-1">
											@{tag}
											<button type="button" onclick={() => toggleTag(tag)} class="opacity-60 hover:opacity-100" aria-label="Remove">✕</button>
										</span>
									{/each}
								</div>
							{/if}

							{#if data.tagSnippets.length > 0}
								<div class="flex flex-wrap gap-1.5">
									{#each data.tagSnippets as t}
										<button
											type="button"
											onclick={() => toggleTag(t.username)}
											class="btn btn-xs rounded-full {activeTags.includes(t.username) ? 'btn-neutral' : 'btn-outline'}"
										>
											{activeTags.includes(t.username) ? '✓ ' : ''}{t.label}
										</button>
									{/each}
								</div>
							{/if}

							<div class="flex gap-2 items-center">
								<input
									type="text"
									bind:value={customTagInput}
									placeholder="@username"
									class="input input-sm w-36"
									onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(); } }}
									autocorrect="off"
									autocapitalize="off"
								/>
								<button type="button" onclick={addCustomTag} class="btn btn-outline btn-sm">Add</button>
							</div>
						</div>
						{#if postType === 'carousel'}
							<input type="hidden" name="user_tags" value={JSON.stringify(carouselTagMap)} />
						{:else}
							<input type="hidden" name="user_tags" value={JSON.stringify(selectedTags)} />
						{/if}
					{/if}

					<!-- When to post -->
					<div>
						<p class="label mb-2">When</p>
						<div class="join mb-3">
							<button
								type="button"
								onclick={() => (postNow = false)}
								class="btn join-item btn-sm {!postNow ? 'btn-primary' : ''}"
							>Schedule</button>
							<button
								type="button"
								onclick={() => (postNow = true)}
								class="btn join-item btn-sm {postNow ? 'btn-primary' : ''}"
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
								class="input input-sm w-full sm:w-auto"
							/>
						{/if}
					</div>

					<div class="card-actions">
						<button
							type="submit"
							formaction={postNow ? '?/publishNow' : '?/schedule'}
							disabled={scheduling || (postType === 'carousel' ? carouselUrls.length < 2 : !uploadedUrl)}
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

	<!-- Queue + History -->
	<section>
		<PostQueuePanel
			queue={data.queue}
			history={data.history}
			accountId={data.account.id}
			{form}
			onOpenPreview={openQueueItemPreview}
			onOpenEditCaption={(id, cap) => editCaptionModal?.open(id, cap)}
			onOpenReschedule={(id, scheduledFor) => rescheduleModal?.open(id, scheduledFor)}
			onOpenViewCaption={(cap) => viewCaptionModal?.open(cap)}
		/>
	</section>
</div>

{/if}
