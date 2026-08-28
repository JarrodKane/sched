<script lang="ts">
	import './layout.css';

	let { data, children } = $props();
</script>

{#if data.session && data.profile}
	<nav class="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
		<div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
			<div class="flex items-center gap-6">
				<a href="/dashboard" class="text-sm font-semibold text-zinc-900 dark:text-white">
					IG Scheduler
				</a>
				<a
					href="/dashboard"
					class="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
				>
					Dashboard
				</a>
				{#if data.profile.isAdmin}
					<a
						href="/admin/accounts"
						class="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
					>
						Accounts
					</a>
					<a
						href="/admin/users"
						class="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
					>
						Users
					</a>
				{/if}
			</div>
			<div class="flex items-center gap-3">
				<span class="text-sm text-zinc-500 dark:text-zinc-400">{data.profile.name}</span>
				<form method="POST" action="/login?/logout">
					<button
						type="submit"
						class="rounded bg-zinc-100 px-3 py-1 text-sm text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
					>
						Sign out
					</button>
				</form>
			</div>
		</div>
	</nav>
{/if}

<main class="mx-auto max-w-6xl px-4 py-8">
	{@render children()}
</main>
