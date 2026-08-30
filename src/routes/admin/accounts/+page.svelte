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

	let deleteTarget = $state<{ id: string; label: string } | null>(null);
	let confirmText = $state('');

	function openDelete(id: string, label: string) {
		deleteTarget = { id, label };
		confirmText = '';
	}

	function closeDelete() {
		deleteTarget = null;
		confirmText = '';
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

<!-- Token expiry banners -->
{#if data.accounts.some((a) => isExpired(a.tokenExpiresAt))}
	<div role="alert" class="alert alert-error mb-4">
		<svg class="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
		<div>
			<p class="font-semibold">Token expired — posts are failing</p>
			<p class="text-sm opacity-80">
				{data.accounts.filter((a) => isExpired(a.tokenExpiresAt)).map((a) => a.label).join(', ')} — reconnect to restore publishing.
			</p>
		</div>
	</div>
{:else if data.accounts.some((a) => isExpiringSoon(a.tokenExpiresAt))}
	<div role="alert" class="alert alert-warning mb-4">
		<svg class="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
		<div>
			<p class="font-semibold">Token expiring within 7 days</p>
			<p class="text-sm opacity-80">
				{data.accounts.filter((a) => isExpiringSoon(a.tokenExpiresAt)).map((a) => a.label).join(', ')} — reconnect soon to avoid publishing failures.
			</p>
		</div>
	</div>
{/if}

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

<!-- Accounts list -->
{#if data.accounts.length > 0}
	<ul class="flex flex-col gap-2 mb-10">
		{#each data.accounts as acct}
			<li class="card bg-base-100">
				<div class="card-body py-3 px-4 flex-row items-center gap-4">
					<div class="flex-1 min-w-0">
						<p class="font-medium">{acct.label}</p>
						<div class="flex items-center gap-2 mt-0.5">
							{#if acct.tokenExpiresAt}
								{#if isExpired(acct.tokenExpiresAt)}
									<span class="badge badge-error badge-soft badge-xs">Token expired</span>
								{:else if isExpiringSoon(acct.tokenExpiresAt)}
									<span class="badge badge-warning badge-soft badge-xs">Expires {new Date(acct.tokenExpiresAt).toLocaleDateString()}</span>
								{:else}
									<span class="text-xs text-base-content/40">Token valid until {new Date(acct.tokenExpiresAt).toLocaleDateString()}</span>
								{/if}
							{:else}
								<span class="text-xs text-base-content/30">No token expiry set</span>
							{/if}
						</div>
					</div>
					<div class="flex items-center gap-1 shrink-0">
						<a href="/admin/accounts/{acct.id}" class="btn btn-sm btn-soft btn-neutral">Manage</a>
						<a href="/admin/accounts/connect?account_id={acct.id}" class="btn btn-sm btn-outline">Reconnect</a>
						<button
							type="button"
							class="btn btn-sm btn-soft btn-error"
							onclick={() => openDelete(acct.id, acct.label)}
						>Remove</button>
					</div>
				</div>
			</li>
		{/each}
	</ul>
{/if}

<!-- Remove confirmation modal -->
{#if deleteTarget}
	<dialog class="modal modal-open">
		<div class="modal-box">
			<h3 class="font-bold text-lg mb-1">Remove account</h3>
			<p class="text-sm text-base-content/70 mb-1">
				You're about to remove <strong>{deleteTarget.label}</strong>.
			</p>
			<p class="text-sm text-base-content/70 mb-4">
				The account will be hidden from the app. All data (shows, posts, ticket history) is preserved and can be restored from the database if needed.
			</p>
			<p class="text-sm font-medium mb-2">
				Type <span class="font-mono bg-base-200 px-1.5 py-0.5 rounded text-error">delete</span> to confirm
			</p>
			<input
				type="text"
				bind:value={confirmText}
				placeholder="delete"
				autocomplete="off"
				class="input input-bordered w-full mb-4"
			/>
			<div class="modal-action mt-0">
				<button type="button" class="btn btn-ghost" onclick={closeDelete}>Cancel</button>
				<form method="POST" action="?/remove" use:enhance={() => { closeDelete(); }}>
					<input type="hidden" name="id" value={deleteTarget.id} />
					<input type="hidden" name="confirm" value={confirmText} />
					<button
						type="submit"
						class="btn btn-error"
						disabled={confirmText.toLowerCase().trim() !== 'delete'}
					>
						Remove account
					</button>
				</form>
			</div>
		</div>
		<div class="modal-backdrop" role="button" tabindex="-1" onclick={closeDelete} onkeydown={() => {}}></div>
	</dialog>
{/if}
