<script lang="ts">
	interface Props {
		success?: string | boolean | null;
		error?: string | boolean | null;
		successText?: string;
	}
	let { success, error, successText = 'Saved.' }: Props = $props();

	const successMsg = typeof success === 'string' ? success : success ? successText : null;
	const errorMsg = typeof error === 'string' ? error : null;
</script>

{#if successMsg}
	<div role="alert" class="alert alert-success alert-soft text-sm">{successMsg}</div>
{/if}
{#if errorMsg}
	<div role="alert" class="alert alert-error alert-soft text-sm">{errorMsg}</div>
{/if}
