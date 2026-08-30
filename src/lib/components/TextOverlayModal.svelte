<script lang="ts">
	interface Props {
		accountId: string;
		oncomplete?: (url: string) => void;
		oncancel?: () => void;
	}

	let { accountId, oncomplete, oncancel }: Props = $props();

	let dialog = $state<HTMLDialogElement | null>(null);
	let previewCanvasEl = $state<HTMLCanvasElement | null>(null);

	let sourceObjectUrl = $state('');
	let sourceImg = $state<HTMLImageElement | null>(null);

	let text = $state('');
	let textStyle = $state<'title' | 'body' | 'caption'>('title');
	let fontScale = $state(1.0);
	let textColor = $state('#ffffff');
	let bgType = $state<'pill-dark' | 'pill-light' | 'bar-dark' | 'bar-light' | 'outline' | 'none'>('pill-dark');
	// 0–1 normalised position; default center-x, near-bottom-y
	let textX = $state(0.5);
	let textY = $state(0.85);
	let isDragging = $state(false);

	let uploading = $state(false);
	let loadError = $state('');
	let uploadError = $state('');
	let overlayDone = $state(false);

	const COLOR_PRESETS = [
		{ label: 'White', value: '#ffffff' },
		{ label: 'Black', value: '#1a1a1a' },
		{ label: 'Yellow', value: '#FBBF24' },
		{ label: 'Pink', value: '#EC4899' },
		{ label: 'Cyan', value: '#22D3EE' },
	];

	const BG_OPTIONS: { value: typeof bgType; label: string }[] = [
		{ value: 'pill-dark', label: 'Dark pill' },
		{ value: 'pill-light', label: 'Light pill' },
		{ value: 'bar-dark', label: 'Dark bar' },
		{ value: 'bar-light', label: 'Light bar' },
		{ value: 'outline', label: 'Outline' },
		{ value: 'none', label: 'None' },
	];

	// Re-draw whenever any rendering option changes
	$effect(() => {
		text; textStyle; fontScale; textColor; bgType; textX; textY;
		if (sourceImg && previewCanvasEl) draw(previewCanvasEl, sourceImg, 0.5);
	});

	function wrapText(ctx: CanvasRenderingContext2D, input: string, maxW: number): string[] {
		const words = input.split(/\s+/).filter(Boolean);
		const lines: string[] = [];
		let curr = '';
		for (const w of words) {
			const test = curr ? `${curr} ${w}` : w;
			if (ctx.measureText(test).width > maxW && curr) {
				lines.push(curr);
				curr = w;
			} else {
				curr = test;
			}
		}
		if (curr) lines.push(curr);
		return lines;
	}

	function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
		ctx.beginPath();
		ctx.moveTo(x + r, y);
		ctx.lineTo(x + w - r, y);
		ctx.arcTo(x + w, y, x + w, y + r, r);
		ctx.lineTo(x + w, y + h - r);
		ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
		ctx.lineTo(x + r, y + h);
		ctx.arcTo(x, y + h, x, y + h - r, r);
		ctx.lineTo(x, y + r);
		ctx.arcTo(x, y, x + r, y, r);
		ctx.closePath();
	}

	function draw(c: HTMLCanvasElement, img: HTMLImageElement, scale: number) {
		const W = Math.round(img.naturalWidth * scale);
		const H = Math.round(img.naturalHeight * scale);
		c.width = W;
		c.height = H;
		const ctx = c.getContext('2d')!;
		ctx.drawImage(img, 0, 0, W, H);

		const t = text.trim();
		if (!t) return;

		const baseSize =
			textStyle === 'title'   ? W * 0.08 :
			textStyle === 'body'    ? W * 0.052 :
			                          W * 0.036;
		const fontSize = Math.round(baseSize * fontScale);
		const weight = textStyle === 'title' ? '700' : '500';
		ctx.font = `${weight} ${fontSize}px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif`;
		ctx.textBaseline = 'top';
		ctx.textAlign = 'center';

		// vPad and lineH must satisfy: lineH - fontSize - 2*vPad > 0 (no pill overlap)
		const hPad = Math.round(W * 0.045);
		const vPad = Math.round(fontSize * 0.25);
		const lineH = Math.round(fontSize * 1.6); // gap between pills = 0.1*fontSize
		const lines = wrapText(ctx, t, W * 0.84);
		if (!lines.length) return;
		const blockH = lines.length * lineH;

		// Bars always center horizontally; pills follow the drag position
		const isBar = bgType === 'bar-dark' || bgType === 'bar-light';
		const xCenter = isBar ? Math.round(W / 2) : Math.round(textX * W);
		// Clamp so the full text block stays on-canvas
		const yTop = Math.max(vPad, Math.min(H - blockH - vPad, Math.round(textY * H - blockH / 2)));

		// Background layer
		if (bgType !== 'none' && bgType !== 'outline') {
			const dark = bgType === 'pill-dark' || bgType === 'bar-dark';
			ctx.fillStyle = dark ? 'rgba(0,0,0,0.70)' : 'rgba(255,255,255,0.88)';

			if (bgType === 'pill-dark' || bgType === 'pill-light') {
				lines.forEach((line, i) => {
					const tw = ctx.measureText(line).width;
					const pw = tw + hPad * 2;
					// Pill height sized to the font, not lineH — equal padding top and bottom
					const ph = fontSize + vPad * 2;
					const px = xCenter - tw / 2 - hPad;
					const py = yTop + i * lineH - vPad;
					rrect(ctx, px, py, pw, ph, Math.round(ph * 0.38));
					ctx.fill();
				});
			} else {
				// Full-width band — clip to actual text height (last line has no trailing lineH gap)
				const bandH = (lines.length - 1) * lineH + fontSize + vPad * 2;
				ctx.fillRect(0, yTop - vPad, W, bandH);
			}
		}

		// Stroke outline — auto-contrasting color so text always stands out
		if (bgType === 'outline') {
			const lightText = textColor === '#ffffff' || textColor === '#FBBF24' || textColor === '#22D3EE';
			ctx.strokeStyle = lightText ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)';
			ctx.lineWidth = Math.max(2, Math.round(fontSize * 0.09));
			ctx.lineJoin = 'round';
			lines.forEach((line, i) => ctx.strokeText(line, xCenter, yTop + i * lineH));
		}

		// Text fill
		ctx.fillStyle = textColor;
		ctx.shadowColor = 'rgba(0,0,0,0.28)';
		ctx.shadowBlur = Math.round(fontSize * 0.07);
		lines.forEach((line, i) => ctx.fillText(line, xCenter, yTop + i * lineH));
		ctx.shadowBlur = 0;
	}

	function canvasNorm(e: PointerEvent): { x: number; y: number } {
		const rect = previewCanvasEl!.getBoundingClientRect();
		return {
			x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
			y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
		};
	}

	function onCanvasPointerdown(e: PointerEvent) {
		if (!sourceImg) return;
		isDragging = true;
		previewCanvasEl?.setPointerCapture(e.pointerId);
		const p = canvasNorm(e);
		textX = p.x; textY = p.y;
	}

	function onCanvasPointermove(e: PointerEvent) {
		if (!isDragging || !sourceImg) return;
		const p = canvasNorm(e);
		textX = p.x; textY = p.y;
	}

	function onCanvasPointerup() { isDragging = false; }

	function setPreset(x: number, y: number) { textX = x; textY = y; }

	export async function openWithUrl(imageUrl: string) {
		overlayDone = false;
		loadError = '';
		uploadError = '';
		text = '';
		textX = 0.5;
		textY = 0.85;
		fontScale = 1.0;
		bgType = 'pill-dark';
		textColor = '#ffffff';
		textStyle = 'title';
		sourceImg = null;
		if (sourceObjectUrl) { URL.revokeObjectURL(sourceObjectUrl); sourceObjectUrl = ''; }

		dialog?.showModal();
		try {
			const res = await fetch(imageUrl);
			const blob = await res.blob();
			const objUrl = URL.createObjectURL(blob);
			sourceObjectUrl = objUrl;
			const img = new Image();
			await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject; img.src = objUrl; });
			sourceImg = img;
			if (previewCanvasEl) draw(previewCanvasEl, img, 0.5);
		} catch {
			loadError = 'Could not load image.';
		}
	}

	function onDialogClose() {
		if (!overlayDone) oncancel?.();
		overlayDone = false;
		if (sourceObjectUrl) { URL.revokeObjectURL(sourceObjectUrl); sourceObjectUrl = ''; }
		sourceImg = null;
	}

	const MAX_UPLOAD = 2.8 * 1024 * 1024;

	async function applyOverlay() {
		if (!sourceImg) return;
		uploading = true;
		uploadError = '';
		try {
			const off = document.createElement('canvas');
			draw(off, sourceImg, 1);
			let blob = await new Promise<Blob>((res) => off.toBlob((b) => res(b!), 'image/jpeg', 0.92));
			for (const q of [0.82, 0.72, 0.62]) {
				if (blob.size <= MAX_UPLOAD) break;
				blob = await new Promise<Blob>((res) => off.toBlob((b) => res(b!), 'image/jpeg', q));
			}
			const fd = new FormData();
			fd.append('file', new File([blob], `overlay_${Date.now()}.jpg`, { type: 'image/jpeg' }));
			fd.append('account_id', accountId);
			const r = await fetch('/api/upload', { method: 'POST', body: fd });
			const json = await r.json();
			if (!r.ok) throw new Error(json.error ?? 'Upload failed');
			overlayDone = true;
			dialog?.close();
			oncomplete?.(json.url);
		} catch (err) {
			uploadError = err instanceof Error ? err.message : 'Upload failed';
		} finally {
			uploading = false;
		}
	}
</script>

<dialog bind:this={dialog} class="modal modal-bottom sm:modal-middle" onclose={onDialogClose}>
	<div class="modal-box max-w-lg w-full flex flex-col gap-4 max-h-[94dvh] overflow-y-auto">

		<!-- Header -->
		<div class="flex items-center justify-between">
			<h3 class="font-semibold">Add text overlay</h3>
			<form method="dialog">
				<button class="btn btn-ghost btn-sm btn-square" aria-label="Close" disabled={uploading}>
					<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
				</button>
			</form>
		</div>

		<!-- Canvas preview — fixed-height viewport with dark bg (mirrors CropModal viewport) -->
		<div class="rounded-xl overflow-hidden relative" style="height: clamp(180px, 38dvh, 360px); background:#111;">
			{#if loadError}
				<div class="absolute inset-0 flex items-center justify-center">
					<p class="text-sm text-error p-4">{loadError}</p>
				</div>
			{:else if !sourceImg}
				<div class="absolute inset-0 flex items-center justify-center">
					<span class="loading loading-spinner loading-md text-white/30"></span>
				</div>
			{:else}
				<div class="absolute inset-0 flex items-center justify-center">
					<canvas
						bind:this={previewCanvasEl}
						style="display:block; max-width:100%; max-height:100%; width:auto; height:auto; cursor:{isDragging ? 'grabbing' : 'crosshair'}; touch-action:none;"
						onpointerdown={onCanvasPointerdown}
						onpointermove={onCanvasPointermove}
						onpointerup={onCanvasPointerup}
						onpointercancel={onCanvasPointerup}
					></canvas>
				</div>
			{/if}
		</div>

		<!-- Position hint + presets -->
		{#if sourceImg}
			<div class="flex items-center gap-2 -mt-1">
				<p class="text-xs text-base-content/40 flex-1 leading-tight">
					{text.trim() ? 'Drag the preview to move text' : 'Type your text, then drag to position it'}
				</p>
				<div class="join">
					<button type="button" onclick={() => setPreset(0.5, 0.12)}
						class="btn join-item btn-xs">Top</button>
					<button type="button" onclick={() => setPreset(0.5, 0.5)}
						class="btn join-item btn-xs">Mid</button>
					<button type="button" onclick={() => setPreset(0.5, 0.87)}
						class="btn join-item btn-xs">Bottom</button>
				</div>
			</div>
		{/if}

		<!-- Text input -->
		<fieldset class="fieldset">
			<legend class="fieldset-legend">Text</legend>
			<input
				type="text"
				bind:value={text}
				placeholder="Your text here…"
				class="input w-full"
				maxlength="120"
				autocorrect="off"
				autocapitalize="off"
			/>
		</fieldset>

		<!-- Style + Size in one row -->
		<div class="flex flex-col gap-2">
			<p class="text-xs font-medium uppercase tracking-wide text-base-content/40">Style & size</p>
			<div class="flex items-center gap-3 flex-wrap">
				<div class="join">
					<button type="button" onclick={() => (textStyle = 'title')}
						class="btn join-item btn-sm {textStyle === 'title' ? 'btn-neutral' : ''}">Title</button>
					<button type="button" onclick={() => (textStyle = 'body')}
						class="btn join-item btn-sm {textStyle === 'body' ? 'btn-neutral' : ''}">Body</button>
					<button type="button" onclick={() => (textStyle = 'caption')}
						class="btn join-item btn-sm {textStyle === 'caption' ? 'btn-neutral' : ''}">Caption</button>
				</div>
				<div class="flex items-center gap-2 flex-1 min-w-32">
					<input type="range" min="0.6" max="1.6" step="0.05"
						bind:value={fontScale}
						class="range range-xs flex-1" />
					<span class="text-xs text-base-content/40 tabular-nums w-8 text-right">{Math.round(fontScale * 100)}%</span>
				</div>
			</div>
		</div>

		<!-- Text color -->
		<div class="flex flex-col gap-2">
			<p class="text-xs font-medium uppercase tracking-wide text-base-content/40">Color</p>
			<div class="flex items-center gap-2 flex-wrap">
				{#each COLOR_PRESETS as preset}
					<button
						type="button"
						onclick={() => (textColor = preset.value)}
						title={preset.label}
						class="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 shrink-0
							{textColor === preset.value ? 'border-primary scale-110' : 'border-transparent ring-1 ring-base-300/60'}"
						style="background:{preset.value};"
					></button>
				{/each}
				<label class="flex items-center gap-1.5 cursor-pointer">
					<input
						type="color"
						bind:value={textColor}
						class="h-7 w-10 cursor-pointer rounded border border-base-300 p-0.5 bg-transparent"
					/>
					<span class="text-xs text-base-content/40">Custom</span>
				</label>
			</div>
		</div>

		<!-- Background -->
		<div class="flex flex-col gap-2">
			<p class="text-xs font-medium uppercase tracking-wide text-base-content/40">Background</p>
			<div class="flex flex-wrap gap-1.5">
				{#each BG_OPTIONS as opt}
					<button type="button" onclick={() => (bgType = opt.value)}
						class="btn btn-sm {bgType === opt.value ? 'btn-neutral' : ''}">
						{opt.label}
					</button>
				{/each}
			</div>
		</div>

		{#if uploadError}
			<div role="alert" class="alert alert-error alert-soft text-sm">{uploadError}</div>
		{/if}

		<!-- Actions -->
		<div class="flex gap-2 pt-1">
			<button
				type="button"
				onclick={applyOverlay}
				disabled={uploading || !sourceImg || !text.trim()}
				class="btn btn-primary flex-1"
			>
				{#if uploading}<span class="loading loading-spinner loading-sm"></span>{/if}
				{uploading ? 'Applying…' : 'Apply overlay'}
			</button>
			<form method="dialog">
				<button type="submit" disabled={uploading} class="btn">Cancel</button>
			</form>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
