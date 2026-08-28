<script lang="ts">
	import { page } from '$app/state';
</script>

<div class="flex min-h-[60vh] flex-col items-center justify-center text-center">
	<p class="text-5xl font-bold text-zinc-200 dark:text-zinc-700">{page.status}</p>
	<p class="mt-2 text-lg font-medium text-zinc-900 dark:text-white">{page.error?.message ?? 'Something went wrong'}</p>
	<a href="/dashboard" class="mt-6 text-sm text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">
		Back to dashboard
	</a>
</div>
