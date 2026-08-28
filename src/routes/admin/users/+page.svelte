<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>Users — IG Scheduler Admin</title></svelte:head>

<h1 class="mb-6 text-xl font-semibold text-zinc-900 dark:text-white">Users</h1>

{#if form?.createError}
	<p class="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{form.createError}</p>
{/if}
{#if form?.created}
	<p class="mb-4 rounded bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">User created.</p>
{/if}
{#if form?.deleted}
	<p class="mb-4 rounded bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">User deleted.</p>
{/if}
{#if form?.accessSaved}
	<p class="mb-4 rounded bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">Access updated.</p>
{/if}

<!-- User list -->
{#if data.users.length > 0}
	<div class="mb-10 space-y-4">
		{#each data.users as user}
			<div class="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
				<div class="mb-3 flex items-start justify-between">
					<div>
						<p class="font-medium text-zinc-900 dark:text-white">{user.name}</p>
						<p class="text-sm text-zinc-500">{user.email}</p>
						{#if user.isAdmin}
							<span class="mt-1 inline-block rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">Admin</span>
						{/if}
					</div>
					<form method="POST" action="?/delete" use:enhance>
						<input type="hidden" name="user_id" value={user.id} />
						<button
							type="submit"
							class="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400"
							onclick={(e) => { if (!confirm('Delete this user?')) e.preventDefault(); }}
						>
							Delete
						</button>
					</form>
				</div>

				<!-- Account access -->
				<form method="POST" action="?/setAccess" use:enhance class="space-y-2">
					<input type="hidden" name="user_id" value={user.id} />
					<p class="text-xs font-medium text-zinc-500 dark:text-zinc-400">Account access:</p>
					<div class="flex flex-wrap gap-3">
						{#each data.accounts as acct}
							<label class="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
								<input
									type="checkbox"
									name="account_ids"
									value={acct.id}
									checked={user.accountIds.includes(acct.id)}
									class="rounded border-zinc-300 dark:border-zinc-700"
								/>
								{acct.label}
							</label>
						{/each}
					</div>
					<button
						type="submit"
						class="rounded bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
					>
						Save access
					</button>
				</form>
			</div>
		{/each}
	</div>
{/if}

<!-- Create user form -->
<section class="max-w-sm">
	<h2 class="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Create user</h2>
	<form method="POST" action="?/create" use:enhance class="space-y-4">
		<div>
			<label for="name" class="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Name</label>
			<input id="name" name="name" type="text" required
				class="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-zinc-400" />
		</div>
		<div>
			<label for="email" class="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Email</label>
			<input id="email" name="email" type="email" required
				class="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-zinc-400" />
		</div>
		<div>
			<label for="password" class="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
				Password <span class="font-normal text-zinc-400">(min 8 chars)</span>
			</label>
			<input id="password" name="password" type="password" required minlength="8"
				class="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-zinc-400" />
		</div>
		<label class="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
			<input type="checkbox" name="is_admin" class="rounded border-zinc-300 dark:border-zinc-700" />
			Admin
		</label>
		<button type="submit"
			class="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
			Create user
		</button>
	</form>
</section>
