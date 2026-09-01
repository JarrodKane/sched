<!--
  GalleryPickModal.svelte
  Modal that lets the user pick an image from the account's uploaded media library.
  Calls onpick with the selected URL and a mode so the caller can decide whether to
  use it directly or pass it to the crop/overlay flow.

  Svelte features:
    $state   — isOpen, mode, postType, currentUrl, carouselUrls

  Exported methods (call via bind:this):
    open(opts) — opens the modal; opts shape depends on the calling context

  Props:
    uploads   Array<{url, name}>                        — the media library items to show
    onpick    (url: string, mode: string) => void        — called when the user picks
-->

<script lang="ts">
	let { uploads, onpick }: {
		uploads: Array<{ url: string; name: string }>;
		onpick: (url: string, mode: 'single' | 'carousel') => void;
	} = $props();

	let dialog = $state<HTMLDialogElement | null>(null);
	let mode = $state<'single' | 'carousel'>('single');
	let postType = $state<'feed' | 'story'>('feed');
	let snapshotUrl = $state('');
	let snapshotCarouselUrls = $state<string[]>([]);

	export function open(opts: {
		mode: 'single' | 'carousel';
		postType?: 'feed' | 'story';
		currentUrl?: string;
		carouselUrls?: string[];
	}) {
		mode = opts.mode;
		postType = opts.postType ?? 'feed';
		snapshotUrl = opts.currentUrl ?? '';
		snapshotCarouselUrls = opts.carouselUrls ?? [];
		dialog?.showModal();
	}

	function pick(url: string) {
		onpick(url, mode);
		dialog?.close();
	}
</script>

<dialog bind:this={dialog} class="modal modal-bottom sm:modal-middle">
	<div class="modal-box max-w-xl w-full overflow-hidden">
		<div class="flex items-center justify-between mb-4">
			<h3 class="font-semibold">Choose from library</h3>
			<form method="dialog"><button class="btn btn-soft btn-sm btn-circle">✕</button></form>
		</div>
		{#if uploads.length === 0}
			<p class="text-sm text-base-content/40">No images in library yet.</p>
		{:else}
			<div class="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-[60dvh] overflow-y-auto overflow-x-hidden">
				{#each uploads as img}
					{@const isSelected = mode === 'carousel' ? snapshotCarouselUrls.includes(img.url) : snapshotUrl === img.url}
					<button
						type="button"
						onclick={() => pick(img.url)}
						class="group relative overflow-hidden rounded-box border-2 transition min-w-0
							{mode === 'single' && postType === 'story' ? 'aspect-9/16' : 'aspect-square'}
							{isSelected ? 'border-primary' : 'border-transparent hover:border-base-300'}"
					>
						<img src={img.url} alt="" class="h-full w-full object-cover transition group-hover:scale-105" />
						{#if isSelected}
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
