<script lang="ts">
	interface OpenOpts {
		url: string;
		urls?: string[];   // carousel: pass all images; url is used as fallback/single
		type?: 'feed' | 'story';
		ratio?: number;
		caption?: string;
	}

	interface Props {
		accountLabel: string;
		showTypeToggle?: boolean;
	}

	let { accountLabel, showTypeToggle = false }: Props = $props();

	let dialog = $state<HTMLDialogElement | null>(null);
	let imageUrls = $state<string[]>([]);
	let currentIndex = $state(0);
	let postType = $state<'feed' | 'story'>('feed');
	let imageRatio = $state(1);
	let caption = $state('');

	const imageUrl = $derived(imageUrls[currentIndex] ?? '');
	const isCarousel = $derived(imageUrls.length > 1);

	function loadRatio(url: string) {
		const img = new Image();
		img.onload = () => { imageRatio = img.naturalWidth / img.naturalHeight; };
		img.src = url;
	}

	export function open(opts: OpenOpts) {
		imageUrls = opts.urls && opts.urls.length > 1 ? opts.urls : [opts.url];
		currentIndex = 0;
		postType = opts.type ?? 'feed';
		caption = opts.caption ?? '';
		if (opts.ratio) {
			imageRatio = opts.ratio;
		} else {
			loadRatio(opts.url);
		}
		dialog?.showModal();
	}

	function prev() { if (currentIndex > 0) { currentIndex--; loadRatio(imageUrls[currentIndex]); } }
	function next() { if (currentIndex < imageUrls.length - 1) { currentIndex++; loadRatio(imageUrls[currentIndex]); } }

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowLeft') prev();
		else if (e.key === 'ArrowRight') next();
	}

	// Touch swipe
	let touchStartX = $state(0);
	function onTouchStart(e: TouchEvent) { touchStartX = e.touches[0].clientX; }
	function onTouchEnd(e: TouchEvent) {
		const dx = e.changedTouches[0].clientX - touchStartX;
		if (Math.abs(dx) > 40) { if (dx < 0) next(); else prev(); }
	}
</script>

<dialog bind:this={dialog} class="modal modal-bottom sm:modal-middle" onkeydown={onKeydown}>
	<div class="modal-box p-0 max-w-sm w-full flex flex-col max-h-[90dvh] overflow-hidden">
		<!-- Header -->
		<div class="flex items-center justify-between px-3 py-2.5 border-b border-base-300 shrink-0">
			<div class="flex items-center gap-2.5">
				<div class="w-8 h-8 rounded-full bg-linear-to-tr from-yellow-400 via-pink-500 to-purple-600 shrink-0"></div>
				<span class="text-sm font-semibold">{accountLabel}</span>
			</div>
			<div class="flex items-center gap-2">
				{#if isCarousel}
					<span class="text-xs text-base-content/40 tabular-nums">{currentIndex + 1} / {imageUrls.length}</span>
				{/if}
				{#if showTypeToggle}
					<div class="join">
						<button type="button" onclick={() => (postType = 'feed')} class="btn join-item btn-xs {postType === 'feed' ? 'btn-primary' : 'btn-outline'}">Feed</button>
						<button type="button" onclick={() => (postType = 'story')} class="btn join-item btn-xs {postType === 'story' ? 'btn-primary' : 'btn-outline'}">Story</button>
					</div>
				{/if}
			</div>
		</div>

		<!-- Scrollable body: image + caption -->
		<div
			class="overflow-y-auto min-h-0 flex-1 relative"
			ontouchstart={onTouchStart}
			ontouchend={onTouchEnd}
		>
			{#if postType === 'story'}
				<div class="overflow-hidden bg-black mx-auto" style="aspect-ratio: 9/16; width: min(100%, calc(65dvh * 9 / 16))">
					<img src={imageUrl} alt="" class="w-full h-full object-cover" />
				</div>
			{:else}
				<div style="aspect-ratio: {imageRatio}" class="overflow-hidden bg-base-200 w-full relative">
					<img src={imageUrl} alt="" class="w-full h-full object-cover" />

					{#if isCarousel}
						<!-- Prev / Next arrows overlaid on the image -->
						<button
							type="button"
							onclick={prev}
							disabled={currentIndex === 0}
							class="absolute left-1.5 top-1/2 -translate-y-1/2 btn btn-circle btn-sm bg-black/40 border-0 text-white hover:bg-black/60 disabled:opacity-20"
							aria-label="Previous image"
						>‹</button>
						<button
							type="button"
							onclick={next}
							disabled={currentIndex === imageUrls.length - 1}
							class="absolute right-1.5 top-1/2 -translate-y-1/2 btn btn-circle btn-sm bg-black/40 border-0 text-white hover:bg-black/60 disabled:opacity-20"
							aria-label="Next image"
						>›</button>
					{/if}
				</div>
			{/if}

			<!-- Dot indicators -->
			{#if isCarousel && postType !== 'story'}
				<div class="flex justify-center gap-1 py-2">
					{#each imageUrls as _, i}
						<button
							type="button"
							onclick={() => { currentIndex = i; loadRatio(imageUrls[i]); }}
							class="w-1.5 h-1.5 rounded-full transition-colors {i === currentIndex ? 'bg-base-content' : 'bg-base-content/20'}"
							aria-label="Go to image {i + 1}"
						></button>
					{/each}
				</div>
			{/if}

			{#if postType === 'feed' && caption}
				<div class="px-3 py-3 border-t border-base-200">
					<p class="text-sm leading-relaxed whitespace-pre-line">
						<span class="font-semibold mr-1">{accountLabel}</span>{caption}
					</p>
				</div>
			{/if}
		</div>

		<!-- Close -->
		<div class="px-3 py-3 border-t border-base-200 shrink-0">
			<form method="dialog">
				<button class="btn btn-sm w-full">Close</button>
			</form>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
