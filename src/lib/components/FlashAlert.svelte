<!--
  FlashAlert.svelte
  Stateless alert banner for surfacing a success or error message returned by a
  SvelteKit form action. Renders nothing when both props are falsy. No reactivity —
  it is purely a display component driven by its props.

  Props:
    success?      string | boolean | null  — shows a success alert; if boolean true,
                                             displays successText instead
    error?        string | boolean | null  — shows an error alert with this message
    successText?  string                   — text shown when success === true
                                             (default: "Done.")
-->

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
