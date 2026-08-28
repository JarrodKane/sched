<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const EXPIRY_WARN_DAYS = 7;

	function isExpiringSoon(expiresAt: Date | string | null): boolean {
		if (!expiresAt) return false;
		const ms = new Date(expiresAt).getTime() - Date.now();
		return ms > 0 && ms < EXPIRY_WARN_DAYS * 86_400_000;
	}

	function isExpired(expiresAt: Date | string | null): boolean {
		if (!expiresAt) return false;
		return new Date(expiresAt).getTime() < Date.now();
	}
</script>

<svelte:head><title>Accounts — IG Scheduler Admin</title></svelte:head>

<div class="mb-6 flex items-center justify-between">
	<h1 class="text-xl font-semibold text-zinc-900 dark:text-white">Instagram accounts</h1>
	<a
		href="/admin/accounts/connect"
		class="flex items-center gap-2 rounded-md bg-gradient-to-r from-purple-600 to-pink-500 px-4 py-2 text-sm font-medium text-white hover:from-purple-700 hover:to-pink-600"
	>
		<svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
			<path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
		</svg>
		Connect with Instagram
	</a>
</div>

{#if data.connectMessage}
	<p class="mb-4 rounded bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">{data.connectMessage}</p>
{/if}
{#if data.connectError}
	<p class="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{data.connectError}</p>
{/if}
{#if form?.addError}
	<p class="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{form.addError}</p>
{/if}
{#if form?.added}
	<p class="mb-4 rounded bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">Account added.</p>
{/if}
{#if form?.removed}
	<p class="mb-4 rounded bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">Account removed.</p>
{/if}

<!-- Existing accounts -->
{#if data.accounts.length > 0}
	<div class="mb-8 overflow-x-auto">
		<table class="w-full text-sm">
			<thead>
				<tr class="border-b border-zinc-200 text-left dark:border-zinc-800">
					<th class="pb-2 font-medium text-zinc-500">Label</th>
					<th class="pb-2 font-medium text-zinc-500">IG Business ID</th>
					<th class="pb-2 font-medium text-zinc-500">Token expires</th>
					<th class="pb-2"></th>
				</tr>
			</thead>
			<tbody>
				{#each data.accounts as acct}
					<tr class="border-b border-zinc-100 dark:border-zinc-900">
						<td class="py-3 font-medium text-zinc-900 dark:text-white">{acct.label}</td>
						<td class="py-3 font-mono text-xs text-zinc-500">{acct.igBusinessId}</td>
						<td class="py-3">
							{#if acct.tokenExpiresAt}
								<span
									class={isExpired(acct.tokenExpiresAt)
										? 'font-medium text-red-600 dark:text-red-400'
										: isExpiringSoon(acct.tokenExpiresAt)
											? 'font-medium text-yellow-600 dark:text-yellow-400'
											: 'text-zinc-500'}
								>
									{new Date(acct.tokenExpiresAt).toLocaleDateString()}
									{isExpired(acct.tokenExpiresAt) ? '(expired)' : isExpiringSoon(acct.tokenExpiresAt) ? '(expiring soon)' : ''}
								</span>
							{:else}
								<span class="text-zinc-400">—</span>
							{/if}
						</td>
						<td class="py-3 text-right">
							<form method="POST" action="?/remove" use:enhance>
								<input type="hidden" name="id" value={acct.id} />
								<button
									type="submit"
									class="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400"
									onclick={(e) => { if (!confirm('Remove this account?')) e.preventDefault(); }}
								>
									Remove
								</button>
							</form>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<!-- Add account form -->
<section class="max-w-lg">
	<h2 class="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Add account</h2>
	<form method="POST" action="?/add" use:enhance class="space-y-4">
		<div>
			<label for="label" class="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Label</label>
			<input id="label" name="label" type="text" required placeholder="Deadfunny Main"
				class="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-zinc-400" />
		</div>
		<div>
			<label for="ig_business_id" class="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">IG Business ID</label>
			<input id="ig_business_id" name="ig_business_id" type="text" required placeholder="123456789"
				class="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-mono text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-zinc-400" />
		</div>
		<div>
			<label for="fb_page_id" class="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">FB Page ID</label>
			<input id="fb_page_id" name="fb_page_id" type="text" required placeholder="987654321"
				class="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-mono text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-zinc-400" />
		</div>
		<div>
			<label for="access_token" class="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
				Long-lived access token
				<span class="font-normal text-zinc-400">(from Graph API Explorer)</span>
			</label>
			<textarea id="access_token" name="access_token" required rows="3"
				class="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-mono text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-zinc-400"
				placeholder="EAABsbCS..."></textarea>
		</div>
		<div>
			<label for="token_expires_at" class="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
				Token expiry date <span class="font-normal text-zinc-400">(optional)</span>
			</label>
			<input id="token_expires_at" name="token_expires_at" type="date"
				class="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-zinc-400" />
		</div>
		<button type="submit"
			class="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
			Add account
		</button>
	</form>
</section>
