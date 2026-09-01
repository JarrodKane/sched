<!--
  RescheduleModal.svelte
  Small modal for changing the scheduled datetime of a pending post.
  Submits to the ?/reschedule action on the parent schedule page.

  Svelte features:
    $state    — dialog (HTMLDialogElement ref), postId, scheduledFor (bound to datetime input)
    $props()  — receives minDatetime (the earliest allowed datetime for the input)
    use:enhance — intercepts submit to avoid a full page reload

  Exported methods (call via bind:this):
    open(id: string, currentScheduledFor: string) — opens the modal pre-filled
                                                    with the current datetime

  Props:
    minDatetime   string   — ISO datetime string; used as the input's min attribute
-->

<script lang="ts">
	import { enhance } from '$app/forms';

	function toLocalInput(d: Date): string {
		return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
	}

	let { minDatetime }: { minDatetime: string } = $props();

	let dialog = $state<HTMLDialogElement | null>(null);
	let form = $state<HTMLFormElement | null>(null);
	let postId = $state('');
	let time = $state('');
	let rescheduling = $state(false);
	let error = $state('');

	export function open(id: string, currentScheduledFor: string | Date) {
		postId = id;
		error = '';
		const d = new Date(currentScheduledFor);
		const tomorrow = new Date(d);
		tomorrow.setDate(tomorrow.getDate() + 1);
		const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
		time = toLocalInput(tomorrow > oneHourFromNow ? tomorrow : oneHourFromNow);
		dialog?.showModal();
	}
</script>

<dialog bind:this={dialog} class="modal modal-bottom sm:modal-middle">
	<div class="modal-box max-w-sm">
		<h3 class="font-semibold mb-4">Reschedule post</h3>
		<form
			bind:this={form}
			method="POST"
			action="?/reschedule"
			use:enhance={() => {
				rescheduling = true;
				return async ({ result, update }) => {
					rescheduling = false;
					if (result.type === 'failure') {
						error = (result.data as { error?: string })?.error ?? 'Failed to reschedule.';
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
				<legend class="fieldset-legend">New date & time</legend>
				<div class="flex gap-2 items-center">
					<input
						type="datetime-local"
						name="scheduled_for"
						bind:value={time}
						min={minDatetime}
						required
						class="input flex-1 min-w-0"
					/>
					<button type="submit" disabled={rescheduling} class="btn btn-primary shrink-0">
						{#if rescheduling}<span class="loading loading-spinner loading-sm"></span>{/if}
						{rescheduling ? '…' : 'Reschedule'}
					</button>
				</div>
			</fieldset>
			{#if error}
				<div role="alert" class="alert alert-error alert-soft text-sm">{error}</div>
			{/if}
			<div class="flex gap-2">
				<button
					type="button"
					disabled={rescheduling}
					onclick={() => {
						const t = toLocalInput(new Date(Date.now() + 60_000));
						time = t;
						const input = form?.querySelector<HTMLInputElement>('[name="scheduled_for"]');
						if (input) input.value = t;
						form?.requestSubmit();
					}}
					class="btn btn-outline flex-1"
				>Publish now</button>
				<button type="button" onclick={() => dialog?.close()} class="btn btn-ghost flex-1 text-base-content/50">Cancel</button>
			</div>
		</form>
	</div>
	<form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
