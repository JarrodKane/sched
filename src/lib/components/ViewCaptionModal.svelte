<!--
  ViewCaptionModal.svelte
  Read-only modal for viewing the full caption of a post. Includes a
  copy-to-clipboard button using the Clipboard API.

  Svelte features:
    $state   — dialog (HTMLDialogElement ref), text (the caption), copied (flash feedback)

  Exported methods (call via bind:this):
    open(caption: string) — opens the modal displaying the given caption
-->

<script lang="ts">
	let dialog = $state<HTMLDialogElement | null>(null);
	let text = $state('');
	let copied = $state(false);

	export function open(caption: string) {
		text = caption;
		copied = false;
		dialog?.showModal();
	}

	async function copy() {
		await navigator.clipboard.writeText(text);
		copied = true;
		setTimeout(() => { copied = false; }, 1500);
	}
</script>

<dialog bind:this={dialog} class="modal modal-bottom sm:modal-middle">
	<div class="modal-box max-w-sm">
		<h3 class="font-semibold mb-3">Caption</h3>
		<p class="text-sm text-base-content/80 whitespace-pre-line leading-relaxed">{text}</p>
		<div class="modal-action mt-4 gap-2">
			<button class="btn btn-outline btn-sm" onclick={copy}>
				{copied ? 'Copied!' : 'Copy caption'}
			</button>
			<button class="btn btn-sm" onclick={() => dialog?.close()}>Close</button>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
