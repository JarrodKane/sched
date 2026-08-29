<script lang="ts">
	import Cropper from 'cropperjs';
	import 'cropperjs/dist/cropper.css';

	interface Props {
		accountId: string;
		oncomplete?: (url: string, thumbnailUrl: string | null) => void;
		oncancel?: () => void;
	}

	let { accountId, oncomplete, oncancel }: Props = $props();

	type CropRatio = '9:16' | '4:5' | '1:1' | '1.91:1';
	type BgType = 'blur' | 'color';
	type CropType = 'story' | 'feed';

	const STORY_RATIOS = [
		{ label: '9:16', value: '9:16' as CropRatio, ar: 9 / 16, outW: 1080, outH: 1920 }
	];
	const FEED_RATIOS = [
		{ label: '4:5', value: '4:5' as CropRatio, ar: 4 / 5, outW: 1080, outH: 1350 },
		{ label: '1:1', value: '1:1' as CropRatio, ar: 1, outW: 1080, outH: 1080 },
		{ label: 'Wide', value: '1.91:1' as CropRatio, ar: 1.91, outW: 1080, outH: 566 }
	];
	const ALL_RATIOS = [...STORY_RATIOS, ...FEED_RATIOS];

	let dialog = $state<HTMLDialogElement | null>(null);
	let cropImgEl = $state<HTMLImageElement | null>(null);
	let cropObjectUrl = $state('');
	let rawFile = $state<File | null>(null);
	let cropDone = $state(false);
	let cropUploading = $state(false);
	let uploadError = $state('');
	let cropRatio = $state<CropRatio>('4:5');
	let cropType = $state<CropType>('feed');
	let bgType = $state<BgType>('blur');
	let bgColor = $state('#1a1a1a');
	let cropperInstance: Cropper | null = null;

	// True when opened from an already-uploaded image (e.g. media library Edit button).
	// Hides "Skip — use original" since the image already exists in storage.
	let isEditingExisting = $state(false);

	// Preview overlay state
	let bgPreviewUrl = $state('');
	let showBgPreview = $state(false);
	let previewGenerating = $state(false);

	// Any setting change clears the preview so it doesn't show stale output
	$effect(() => {
		bgType; bgColor; cropRatio; cropType;
		showBgPreview = false;
	});

	function getRatio(v: CropRatio) {
		return ALL_RATIOS.find((r) => r.value === v)!;
	}

	const activeRatios = $derived(cropType === 'story' ? STORY_RATIOS : FEED_RATIOS);

	// Auto-select first valid ratio when type changes
	$effect(() => {
		const ratios = cropType === 'story' ? STORY_RATIOS : FEED_RATIOS;
		if (!ratios.find((r) => r.value === cropRatio)) {
			cropRatio = ratios[0].value;
		}
	});

	// Initialize / destroy Cropper.js whenever image, url, or ratio changes
	$effect(() => {
		const img = cropImgEl;
		const url = cropObjectUrl;
		const ar = getRatio(cropRatio).ar;
		if (!img || !url) return;

		const instance = new Cropper(img, {
			aspectRatio: ar,
			// viewMode 0: canvas can move freely so zooming out creates empty areas
			// that get filled with the chosen background on export
			viewMode: 0,
			dragMode: 'move',
			autoCropArea: 1,
			cropBoxResizable: false,
			cropBoxMovable: false,
			guides: true,
			center: false,
			highlight: false,
			rotatable: false,
			scalable: false
		});
		cropperInstance = instance;
		return () => {
			instance.destroy();
			cropperInstance = null;
		};
	});

	function loadImage(src: string): Promise<HTMLImageElement> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => resolve(img);
			img.onerror = reject;
			img.src = src;
		});
	}

	// Shared compositing: crop + background at any output resolution.
	// Returns a canvas with the background drawn first, then the cropped image on top.
	// Transparent pixels in the crop (image zoomed out) are filled by the background.
	async function composite(outW: number, outH: number): Promise<HTMLCanvasElement> {
		if (!cropperInstance) throw new Error('Cropper not ready — try again');

		const croppedCanvas = cropperInstance.getCroppedCanvas({
			width: outW,
			height: outH,
			imageSmoothingEnabled: true,
			imageSmoothingQuality: outW >= 800 ? 'high' : 'medium',
			fillColor: 'transparent'
		});

		const canvas = document.createElement('canvas');
		canvas.width = outW;
		canvas.height = outH;
		const ctx = canvas.getContext('2d')!;

		if (bgType === 'blur') {
			const img = await loadImage(cropObjectUrl);
			const nw = img.naturalWidth;
			const nh = img.naturalHeight;
			const bgScale = Math.max(outW / nw, outH / nh);
			// Blur radius proportional to output width so it looks the same at any size
			const blurPx = Math.round(outW / 22);
			ctx.filter = `blur(${blurPx}px)`;
			ctx.drawImage(img, (outW - nw * bgScale) / 2, (outH - nh * bgScale) / 2, nw * bgScale, nh * bgScale);
			ctx.filter = 'none';
		} else {
			ctx.fillStyle = bgColor;
			ctx.fillRect(0, 0, outW, outH);
		}

		ctx.drawImage(croppedCanvas, 0, 0);
		return canvas;
	}

	// Zoom the image canvas to fill the entire crop box (crop mode)
	function fillFrame() {
		if (!cropperInstance) return;
		const imgData = cropperInstance.getImageData();
		const cropBox = cropperInstance.getCropBoxData();
		const scale = Math.max(cropBox.width / imgData.naturalWidth, cropBox.height / imgData.naturalHeight);
		const w = imgData.naturalWidth * scale;
		const h = imgData.naturalHeight * scale;
		cropperInstance.setCanvasData({
			left: cropBox.left + (cropBox.width - w) / 2,
			top: cropBox.top + (cropBox.height - h) / 2,
			width: w,
			height: h
		});
	}

	// Zoom the image canvas so the whole image is visible — empty edges get the background
	function fitInFrame() {
		if (!cropperInstance) return;
		const imgData = cropperInstance.getImageData();
		const cropBox = cropperInstance.getCropBoxData();
		const scale = Math.min(cropBox.width / imgData.naturalWidth, cropBox.height / imgData.naturalHeight);
		const w = imgData.naturalWidth * scale;
		const h = imgData.naturalHeight * scale;
		cropperInstance.setCanvasData({
			left: cropBox.left + (cropBox.width - w) / 2,
			top: cropBox.top + (cropBox.height - h) / 2,
			width: w,
			height: h
		});
	}

	// Render at half resolution and toggle as an overlay — lets you see the exact
	// composited output (background + crop) before committing to the upload.
	async function togglePreview() {
		if (showBgPreview) {
			showBgPreview = false;
			return;
		}
		if (!cropperInstance || !cropObjectUrl) return;
		previewGenerating = true;
		try {
			const { outW, outH } = getRatio(cropRatio);
			const canvas = await composite(Math.round(outW / 2), Math.round(outH / 2));
			bgPreviewUrl = canvas.toDataURL('image/jpeg', 0.8);
			showBgPreview = true;
		} catch {
			// preview is best-effort
		} finally {
			previewGenerating = false;
		}
	}

	export function openWithFile(file: File, postType: 'feed' | 'story' = 'feed', editingExisting = false) {
		rawFile = file;
		isEditingExisting = editingExisting;
		uploadError = '';
		cropDone = false;
		cropType = postType;
		cropRatio = postType === 'story' ? '9:16' : '4:5';
		showBgPreview = false;
		bgPreviewUrl = '';
		if (cropObjectUrl) URL.revokeObjectURL(cropObjectUrl);
		dialog?.showModal();
		requestAnimationFrame(() => {
			cropObjectUrl = URL.createObjectURL(file);
		});
	}

	export async function openWithUrl(url: string, postType: 'feed' | 'story' = 'feed') {
		uploadError = '';
		try {
			const res = await fetch(url);
			const blob = await res.blob();
			const filename = url.split('/').pop()?.split('?')[0] ?? 'image.jpg';
			openWithFile(new File([blob], filename, { type: blob.type }), postType, true);
		} catch {
			uploadError = 'Could not load image for editing.';
		}
	}

	function onDialogClose() {
		if (!cropDone) oncancel?.();
		cropDone = false;
		showBgPreview = false;
		bgPreviewUrl = '';
		if (cropObjectUrl) {
			URL.revokeObjectURL(cropObjectUrl);
			cropObjectUrl = '';
		}
		rawFile = null;
		uploadError = '';
	}

	const MAX_UPLOAD = 2.8 * 1024 * 1024; // stay comfortably under the server's 3 MB limit

	async function compressBlob(canvas: HTMLCanvasElement): Promise<Blob> {
		let blob = await new Promise<Blob>((resolve) =>
			canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.92)
		);
		// Iteratively lower quality until under the upload limit
		for (const q of [0.82, 0.72, 0.62]) {
			if (blob.size <= MAX_UPLOAD) break;
			blob = await new Promise<Blob>((resolve) =>
				canvas.toBlob((b) => resolve(b!), 'image/jpeg', q)
			);
		}
		return blob;
	}

	async function doCrop(useOriginal = false) {
		if (!rawFile) return;
		cropUploading = true;
		uploadError = '';
		try {
			let fileToUpload: File = rawFile;
			let thumbnailFile: File | null = null;

			if (!useOriginal) {
				const { outW, outH } = getRatio(cropRatio);
				const canvas = await composite(outW, outH);
				const blob = await compressBlob(canvas);
				const name = rawFile.name.replace(/\.\w+$/, '') + '_cropped.jpg';
				fileToUpload = new File([blob], name, { type: 'image/jpeg' });

				// Thumbnail at 200px wide for post history — stored separately from the media library
				const thumbW = 200;
				const thumbH = Math.round((outH / outW) * thumbW);
				const thumbCanvas = await composite(thumbW, thumbH);
				const thumbBlob = await new Promise<Blob>((resolve) =>
					thumbCanvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.55)
				);
				thumbnailFile = new File([thumbBlob], name.replace('_cropped.jpg', '_thumb.jpg'), { type: 'image/jpeg' });
			} else if (rawFile.size > MAX_UPLOAD) {
				// "Skip — use original" was clicked but the raw file is too large; compress via canvas
				const img = await new Promise<HTMLImageElement>((resolve, reject) => {
					const el = new Image();
					const url = URL.createObjectURL(rawFile);
					el.onload = () => { URL.revokeObjectURL(url); resolve(el); };
					el.onerror = reject;
					el.src = url;
				});
				const canvas = document.createElement('canvas');
				canvas.width = img.naturalWidth;
				canvas.height = img.naturalHeight;
				canvas.getContext('2d')!.drawImage(img, 0, 0);
				const blob = await compressBlob(canvas);
				const name = rawFile.name.replace(/\.\w+$/, '') + '.jpg';
				fileToUpload = new File([blob], name, { type: 'image/jpeg' });
			}

			const fd = new FormData();
			fd.append('file', fileToUpload);
			if (thumbnailFile) fd.append('thumbnail', thumbnailFile);
			fd.append('account_id', accountId);
			const res = await fetch('/api/upload', { method: 'POST', body: fd });
			const json = await res.json();
			if (!res.ok) throw new Error(json.error ?? 'Upload failed');

			cropDone = true;
			dialog?.close();
			oncomplete?.(json.url, json.thumbnailUrl ?? null);
		} catch (err) {
			uploadError = err instanceof Error ? err.message : 'Upload failed';
		} finally {
			cropUploading = false;
		}
	}
</script>

<dialog bind:this={dialog} class="modal" onclose={onDialogClose}>
	<div class="modal-box max-w-xl w-full p-6 flex flex-col gap-5">

		<!-- Header -->
		<div class="flex items-center justify-between">
			<h3 class="text-base font-semibold">Adjust image</h3>
			<form method="dialog">
				<button class="btn btn-ghost btn-sm btn-square" aria-label="Close" disabled={cropUploading}>
					<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
				</button>
			</form>
		</div>

		<!-- Type + Ratio controls -->
		<div class="flex flex-wrap gap-x-6 gap-y-4">
			<div class="flex flex-col gap-1.5">
				<p class="text-xs font-medium uppercase tracking-wide text-base-content/40">Type</p>
				<div class="join">
					<button
						type="button"
						onclick={() => (cropType = 'feed')}
						class="btn join-item btn-xs {cropType === 'feed' ? 'btn-primary' : 'btn-ghost'}"
					>Feed post</button>
					<button
						type="button"
						onclick={() => (cropType = 'story')}
						class="btn join-item btn-xs {cropType === 'story' ? 'btn-primary' : 'btn-ghost'}"
					>Story</button>
				</div>
			</div>

			<div class="flex flex-col gap-1.5">
				<p class="text-xs font-medium uppercase tracking-wide text-base-content/40">Ratio</p>
				<div class="join">
					{#each activeRatios as r}
						<button
							type="button"
							onclick={() => (cropRatio = r.value)}
							class="btn join-item btn-xs {cropRatio === r.value ? 'btn-primary' : 'btn-ghost'}"
						>{r.label}</button>
					{/each}
				</div>
			</div>
		</div>

		<!-- Viewport: background layer sits behind Cropper.js — visible in empty
		     areas when the image is zoomed out. Preview overlay appears on top. -->
		<div class="relative w-full overflow-hidden rounded-box" style="height: 420px;">
			<!-- Background preview layer (always rendered, sits behind cropper) -->
			<div class="absolute inset-0 overflow-hidden" style="z-index: 0;">
				{#if bgType === 'blur' && cropObjectUrl}
					<img
						src={cropObjectUrl}
						alt=""
						class="w-full h-full pointer-events-none select-none"
						style="object-fit: cover; filter: blur(20px); transform: scale(1.1);"
					/>
				{:else}
					<div class="w-full h-full" style="background-color: {bgType === 'color' ? bgColor : '#111'};"></div>
				{/if}
			</div>

			<!-- Cropper.js target -->
			{#if cropObjectUrl}
				<img
					bind:this={cropImgEl}
					src={cropObjectUrl}
					alt=""
					style="display: block; max-width: 100%; position: relative;"
				/>
			{:else}
				<div class="absolute inset-0 flex items-center justify-center" style="z-index: 1;">
					<span class="loading loading-spinner loading-md text-base-content/30"></span>
				</div>
			{/if}

			<!-- Output preview overlay — click the button in the bg controls to toggle.
			     Shows the exact composited result (background + crop) at half resolution.
			     Clicking the overlay also dismisses it. -->
			{#if showBgPreview && bgPreviewUrl}
				<button
					type="button"
					onclick={() => (showBgPreview = false)}
					class="absolute inset-0 flex items-center justify-center cursor-pointer"
					style="z-index: 50; background: rgba(0,0,0,0.6);"
					aria-label="Dismiss preview"
				>
					<img
						src={bgPreviewUrl}
						alt="Output preview"
						class="max-h-full max-w-full object-contain shadow-2xl"
					/>
					<span
						class="absolute bottom-3 text-xs text-white/70 bg-black/40 px-2 py-0.5 rounded-full"
					>click to dismiss</span>
				</button>
			{/if}
		</div>

		<!-- Viewport controls -->
		<div class="flex items-center justify-between gap-3 flex-wrap">
			<span class="text-xs text-base-content/40">Drag to move · scroll or pinch to zoom</span>
			<div class="flex gap-1 flex-wrap">
				<button
					type="button"
					onclick={() => cropperInstance?.zoom(-0.1)}
					class="btn btn-ghost btn-xs btn-square font-bold text-base"
					aria-label="Zoom out"
				>−</button>
				<button
					type="button"
					onclick={() => cropperInstance?.zoom(0.1)}
					class="btn btn-ghost btn-xs btn-square font-bold text-base"
					aria-label="Zoom in"
				>+</button>
				<button type="button" onclick={fillFrame} class="btn btn-ghost btn-xs" title="Fill the frame — crops edges">Fill</button>
				<button type="button" onclick={fitInFrame} class="btn btn-ghost btn-xs" title="Fit whole image in frame — uses background to fill gaps">Fit</button>
				<button type="button" onclick={() => cropperInstance?.reset()} class="btn btn-ghost btn-xs">Reset</button>
			</div>
		</div>

		<!-- Background controls + preview toggle in one row -->
		<div class="flex flex-col gap-2">
			<p class="text-xs font-medium uppercase tracking-wide text-base-content/40">
				Background <span class="normal-case font-normal text-base-content/30">(fills empty areas)</span>
			</p>
			<div class="flex items-center gap-3 flex-wrap">
				<div class="join">
					<button
						type="button"
						onclick={() => (bgType = 'blur')}
						class="btn join-item btn-xs {bgType === 'blur' ? 'btn-primary' : 'btn-ghost'}"
					>Blurred photo</button>
					<button
						type="button"
						onclick={() => (bgType = 'color')}
						class="btn join-item btn-xs {bgType === 'color' ? 'btn-primary' : 'btn-ghost'}"
					>Solid color</button>
				</div>
				{#if bgType === 'color'}
					<label class="flex items-center gap-2 cursor-pointer">
						<input
							type="color"
							bind:value={bgColor}
							class="h-7 w-10 cursor-pointer rounded border border-base-300 p-0.5 bg-transparent"
						/>
						<span class="text-xs text-base-content/50 font-mono">{bgColor}</span>
					</label>
				{/if}
				<!-- Preview toggle sits in the same row as the bg options so the connection is clear -->
				<button
					type="button"
					onclick={togglePreview}
					disabled={!cropObjectUrl || (previewGenerating && !showBgPreview) || cropUploading}
					class="btn btn-xs ml-auto {showBgPreview ? 'btn-neutral btn-soft' : 'btn-ghost'} gap-1"
				>
					{#if previewGenerating && !showBgPreview}
						<span class="loading loading-spinner loading-xs"></span>
					{/if}
					{showBgPreview ? '✕ Close preview' : 'Preview'}
				</button>
			</div>
		</div>

		<!-- Error -->
		{#if uploadError}
			<div role="alert" class="alert alert-error alert-soft text-sm">{uploadError}</div>
		{/if}

		<!-- Actions -->
		<div class="flex flex-col gap-2">
			<button
				type="button"
				onclick={() => doCrop(false)}
				disabled={cropUploading || !cropObjectUrl}
				class="btn btn-primary w-full"
			>
				{#if cropUploading}<span class="loading loading-spinner loading-sm"></span>{/if}
				{cropUploading ? 'Processing & uploading…' : 'Save & use this image'}
			</button>
			<div class="flex gap-2">
				{#if !isEditingExisting}
					<button
						type="button"
						onclick={() => doCrop(true)}
						disabled={cropUploading}
						class="btn btn-ghost btn-sm flex-1 text-xs"
					>Skip — use original</button>
				{/if}
				<form method="dialog" class={isEditingExisting ? 'flex-1' : 'flex-1'}>
					<button type="submit" disabled={cropUploading} class="btn btn-ghost btn-sm w-full text-xs">
						Cancel
					</button>
				</form>
			</div>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
