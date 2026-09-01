<!--
  +error.svelte — /
  SvelteKit's top-level error page. Displayed whenever an unhandled error is
  thrown from a load function or action anywhere in the app.

  SvelteKit / Svelte features:
    page   — imported from $app/state (the Svelte 5 way, not $app/stores);
             page.status is the HTTP error code, page.error.message is the reason
-->

<script lang="ts">
	import { page } from '$app/state';
</script>

<div class="flex min-h-[60vh] flex-col items-center justify-center text-center">
	<p class="text-5xl font-bold text-zinc-200 dark:text-zinc-700">{page.status}</p>
	<p class="mt-2 text-lg font-medium text-zinc-900 dark:text-white">{page.error?.message ?? 'Something went wrong'}</p>
	<a href="/dashboard" class="mt-6 btn btn-outline btn-sm">
		Back to dashboard
	</a>
</div>
