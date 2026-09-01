<!--
  EditCaptionModal.svelte
  Small modal for editing the caption of an already-scheduled post in place.
  Submits to the ?/editCaption action on the parent schedule page.

  Svelte features:
    $state    — dialog (HTMLDialogElement ref), postId, caption (bound to textarea)
    $props()  — no external props; all state is managed internally
    use:enhance — intercepts submit to avoid a full page reload

  Exported methods (call via bind:this):
    open(id: string, current: string | null) — opens the modal pre-filled with
                                               the current caption
-->

<script lang="ts">
	import { enhance } from '$app/forms';

	let dialog = $state<HTMLDialogElement | null>(null);
	let postId = $state('');
	let captionValue = $state('');
	let editing = $state(false);
	let error = $state('');

	export function open(id: string, current: string | null) {
		postId = id;
		captionValue = current ?? '';
		error = '';
		dialog?.showModal();
	}
</script>

<dialog bind:this={dialog} class="modal modal-bottom sm:modal-middle">
	<div class="modal-box max-w-lg">
		<h3 class="font-semibold mb-4">Edit caption</h3>
		<form
			method="POST"
			action="?/editCaption"
			use:enhance={() => {
				editing = true;
				return async ({ result, update }) => {
					editing = false;
					if (result.type === 'failure') {
						error = (result.data as { error?: string })?.error ?? 'Failed to save caption.';
					} else {
						error = '';
						dialog?.close();
					}
					await update();
				};
			}}
			class="flex flex-col gap-4"
		>
			<input type="hidden" name="post_id" value={postId} />
			<fieldset class="fieldset">
				<legend class="fieldset-legend">Caption</legend>
				<textarea
					name="caption"
					bind:value={captionValue}
					rows="16"
					placeholder="Write your caption…"
					class="textarea w-full"
				></textarea>
			</fieldset>
			{#if error}
				<div role="alert" class="alert alert-error alert-soft text-sm">{error}</div>
			{/if}
			<div class="flex gap-2">
				<button type="submit" disabled={editing} class="btn btn-primary flex-1">
					{#if editing}<span class="loading loading-spinner loading-sm"></span>{/if}
					{editing ? 'Saving…' : 'Save caption'}
				</button>
				<button type="button" onclick={() => dialog?.close()} class="btn btn-outline flex-1">Cancel</button>
			</div>
		</form>
	</div>
	<form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
