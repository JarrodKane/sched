<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Per-user: which accounts are checked (so asset checkboxes can be shown/hidden)
	let checkedAccounts = $state<Record<string, Set<string>>>({});

	$effect(() => {
		const initial: Record<string, Set<string>> = {};
		for (const user of data.users) {
			initial[user.id] = new Set(user.access.map((a) => a.accountId));
		}
		checkedAccounts = initial;
	});

	function isChecked(userId: string, accountId: string) {
		return checkedAccounts[userId]?.has(accountId) ?? false;
	}

	function toggleAccount(userId: string, accountId: string, checked: boolean) {
		const set = new Set(checkedAccounts[userId] ?? []);
		if (checked) set.add(accountId);
		else set.delete(accountId);
		checkedAccounts = { ...checkedAccounts, [userId]: set };
	}

	function getAsset(userId: string, accountId: string, asset: 'canAccessSocial' | 'canAccessTickets' | 'canAccessLineups') {
		return data.users.find((u) => u.id === userId)?.access.find((a) => a.accountId === accountId)?.[asset] ?? (asset === 'canAccessLineups' ? false : true);
	}
</script>

<svelte:head><title>Users — IG Scheduler Admin</title></svelte:head>

<h1 class="mb-6 text-xl font-semibold">Users</h1>

{#if form?.createError}
	<div role="alert" class="alert alert-error alert-soft mb-4 text-sm">{form.createError}</div>
{/if}
{#if form?.created}
	<div role="alert" class="alert alert-success alert-soft mb-4 text-sm">User created.</div>
{/if}
{#if form?.deleted}
	<div role="alert" class="alert alert-success alert-soft mb-4 text-sm">User deleted.</div>
{/if}
{#if form?.accessSaved}
	<div role="alert" class="alert alert-success alert-soft mb-4 text-sm">Access updated.</div>
{/if}

<!-- User list -->
{#if data.users.length > 0}
	<div class="mb-10 flex flex-col gap-4">
		{#each data.users as user}
			<div class="card bg-base-100">
				<div class="card-body gap-4">
					<div class="flex items-start justify-between gap-3">
						<div>
							<p class="font-medium">{user.name}</p>
							<p class="text-sm text-base-content/60">{user.email}</p>
							{#if user.isAdmin}
								<span class="badge badge-info badge-soft badge-sm mt-1">Admin</span>
							{/if}
						</div>
						<form method="POST" action="?/delete" use:enhance>
							<input type="hidden" name="user_id" value={user.id} />
							<button
								type="submit"
								class="btn btn-ghost btn-xs text-error"
								onclick={(e) => { if (!confirm('Delete this user?')) e.preventDefault(); }}
							>
								Delete
							</button>
						</form>
					</div>

					<!-- Account access with per-asset permissions -->
					<form method="POST" action="?/setAccess" use:enhance class="flex flex-col gap-3">
						<input type="hidden" name="user_id" value={user.id} />
						<p class="text-xs font-medium text-base-content/50">Account access:</p>
						<div class="flex flex-col gap-2">
							{#each data.accounts as acct}
								{@const checked = isChecked(user.id, acct.id)}
								<div class="rounded-box bg-base-200 px-3 py-2">
									<label class="flex items-center gap-2 cursor-pointer">
										<input
											type="checkbox"
											name="account_ids"
											value={acct.id}
											checked={checked}
											onchange={(e) => toggleAccount(user.id, acct.id, (e.target as HTMLInputElement).checked)}
											class="checkbox checkbox-sm"
										/>
										<span class="text-sm font-medium">{acct.label}</span>
									</label>

									{#if checked}
										<div class="mt-2 ml-6 flex flex-wrap gap-x-4 gap-y-1">
											<label class="flex items-center gap-1.5 text-xs cursor-pointer">
												<input
													type="checkbox"
													name="social_{acct.id}"
													checked={getAsset(user.id, acct.id, 'canAccessSocial')}
													class="checkbox checkbox-xs"
												/>
												Social
											</label>
											<label class="flex items-center gap-1.5 text-xs cursor-pointer">
												<input
													type="checkbox"
													name="tickets_{acct.id}"
													checked={getAsset(user.id, acct.id, 'canAccessTickets')}
													class="checkbox checkbox-xs"
												/>
												Tickets
											</label>
											<label class="flex items-center gap-1.5 text-xs cursor-pointer text-base-content/40">
												<input
													type="checkbox"
													name="lineups_{acct.id}"
													checked={getAsset(user.id, acct.id, 'canAccessLineups')}
													class="checkbox checkbox-xs"
													disabled
												/>
												Lineups <span class="badge badge-xs badge-ghost">v3</span>
											</label>
										</div>
									{/if}
								</div>
							{/each}
						</div>
						<div>
							<button type="submit" class="btn btn-sm btn-neutral">
								Save access
							</button>
						</div>
					</form>
				</div>
			</div>
		{/each}
	</div>
{/if}

<!-- Create user form -->
<section class="max-w-sm">
	<h2 class="mb-4 text-sm font-semibold uppercase tracking-wide text-base-content/50">Create user</h2>
	<div class="card bg-base-100">
		<div class="card-body gap-4">
			<form method="POST" action="?/create" use:enhance class="flex flex-col gap-4">
				<fieldset class="fieldset">
					<legend class="fieldset-legend">Name</legend>
					<input id="name" name="name" type="text" required class="input w-full" />
				</fieldset>
				<fieldset class="fieldset">
					<legend class="fieldset-legend">Email</legend>
					<input id="email" name="email" type="email" required class="input w-full" />
				</fieldset>
				<fieldset class="fieldset">
					<legend class="fieldset-legend">
						Password <span class="font-normal text-base-content/40">(min 8 chars)</span>
					</legend>
					<input id="password" name="password" type="password" required minlength="8" class="input w-full" />
				</fieldset>
				<label class="flex items-center gap-2 text-sm cursor-pointer">
					<input type="checkbox" name="is_admin" class="checkbox checkbox-sm" />
					Admin
				</label>
				<div class="card-actions">
					<button type="submit" class="btn btn-neutral">Create user</button>
				</div>
			</form>
		</div>
	</div>
</section>
