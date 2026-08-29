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
	<h1 class="text-xl font-semibold">Instagram accounts</h1>
	<a
		href="/admin/accounts/connect"
		class="btn gap-2 text-white border-none shadow-md hover:brightness-110 transition-all"
		style="background: linear-gradient(135deg, #f9ce34 0%, #ee2a7b 50%, #6228d7 100%);"
	>
		<svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
			<path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
		</svg>
		Connect with Instagram
	</a>
</div>

<!-- Flash messages -->
{#if data.connectMessage}
	<div role="alert" class="alert alert-success alert-soft mb-4 text-sm">{data.connectMessage}</div>
{/if}
{#if data.connectError}
	<div role="alert" class="alert alert-error alert-soft mb-4 text-sm">{data.connectError}</div>
{/if}
{#if form?.addError}
	<div role="alert" class="alert alert-error alert-soft mb-4 text-sm">{form.addError}</div>
{/if}
{#if form?.added}
	<div role="alert" class="alert alert-success alert-soft mb-4 text-sm">Account added.</div>
{/if}
{#if form?.removed}
	<div role="alert" class="alert alert-success alert-soft mb-4 text-sm">Account removed.</div>
{/if}
{#if form?.snippetAdded}
	<div role="alert" class="alert alert-success alert-soft mb-4 text-sm">Snippet added.</div>
{/if}
{#if form?.snippetDeleted}
	<div role="alert" class="alert alert-success alert-soft mb-4 text-sm">Snippet deleted.</div>
{/if}
{#if form?.snippetError}
	<div role="alert" class="alert alert-error alert-soft mb-4 text-sm">{form.snippetError}</div>
{/if}

<!-- Accounts table -->
{#if data.accounts.length > 0}
	<div class="overflow-x-auto mb-10">
		<table class="table">
			<thead>
				<tr>
					<th>Label</th>
					<th>IG Business ID</th>
					<th>Token expires</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each data.accounts as acct}
					<tr>
						<td class="font-medium">{acct.label}</td>
						<td class="font-mono text-xs text-base-content/50">{acct.igBusinessId}</td>
						<td>
							{#if acct.tokenExpiresAt}
								<span class={isExpired(acct.tokenExpiresAt) ? 'text-error font-medium' : isExpiringSoon(acct.tokenExpiresAt) ? 'text-warning font-medium' : 'text-base-content/60'}>
									{new Date(acct.tokenExpiresAt).toLocaleDateString()}
									{isExpired(acct.tokenExpiresAt) ? '(expired)' : isExpiringSoon(acct.tokenExpiresAt) ? '(expiring soon)' : ''}
								</span>
							{:else}
								<span class="text-base-content/30">—</span>
							{/if}
						</td>
						<td class="text-right">
							<form method="POST" action="?/remove" use:enhance>
								<input type="hidden" name="id" value={acct.id} />
								<button
									type="submit"
									class="btn btn-ghost btn-xs text-error"
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

<!-- Caption snippets per account -->
<section class="mb-12">
	<h2 class="mb-1 text-sm font-semibold uppercase tracking-wide text-base-content/50">Caption snippets</h2>
	<p class="mb-5 text-sm text-base-content/50">
		Reusable text bits (addresses, hashtag sets, emojis) team members can insert with one click.
	</p>
	<div class="flex flex-col gap-4">
		{#each data.accounts as acct}
			<div class="card bg-base-100">
				<div class="card-body gap-4">
					<h3 class="font-medium">{acct.label}</h3>

					<!-- Existing snippets -->
					{#if acct.snippets.length > 0}
						<ul class="flex flex-col gap-1.5">
							{#each acct.snippets as snippet}
								<li class="flex items-start justify-between gap-3 rounded-box bg-base-200 px-3 py-2">
									<div class="min-w-0">
										<p class="text-xs font-medium">{snippet.label}</p>
										<p class="mt-0.5 text-xs text-base-content/50 break-all">{snippet.text}</p>
									</div>
									<form method="POST" action="?/deleteSnippet" use:enhance class="shrink-0">
										<input type="hidden" name="id" value={snippet.id} />
										<button
											type="submit"
											class="btn btn-ghost btn-xs text-error"
											onclick={(e) => { if (!confirm('Delete this snippet?')) e.preventDefault(); }}
										>
											Delete
										</button>
									</form>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="text-xs text-base-content/40">No snippets yet.</p>
					{/if}

					<!-- Add snippet form -->
					<form method="POST" action="?/addSnippet" use:enhance class="flex flex-wrap items-end gap-2">
						<input type="hidden" name="account_id" value={acct.id} />
						<fieldset class="fieldset">
							<legend class="fieldset-legend">Button label</legend>
							<input
								name="snippet_label"
								type="text"
								required
								placeholder="Street address"
								class="input input-sm w-40"
							/>
						</fieldset>
						<fieldset class="fieldset flex-1 min-w-48">
							<legend class="fieldset-legend">Text to insert (emojis welcome)</legend>
							<input
								name="snippet_text"
								type="text"
								required
								placeholder="123 Main St, Sydney NSW 2000"
								class="input input-sm w-full"
							/>
						</fieldset>
						<button type="submit" class="btn btn-sm btn-neutral">Add</button>
					</form>
				</div>
			</div>
		{/each}
	</div>
</section>

