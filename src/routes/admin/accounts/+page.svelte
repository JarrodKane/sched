<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Track which snippet text areas are expanded (for multiline preview)
	let snippetExpanded = $state<Record<string, boolean>>({});

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
	<div role="alert" class="alert alert-success alert-soft mb-4 text-sm">Caption snippet added.</div>
{/if}
{#if form?.snippetDeleted}
	<div role="alert" class="alert alert-success alert-soft mb-4 text-sm">Caption snippet deleted.</div>
{/if}
{#if form?.snippetError}
	<div role="alert" class="alert alert-error alert-soft mb-4 text-sm">{form.snippetError}</div>
{/if}
{#if form?.tagSnippetAdded}
	<div role="alert" class="alert alert-success alert-soft mb-4 text-sm">Tag saved.</div>
{/if}
{#if form?.tagSnippetDeleted}
	<div role="alert" class="alert alert-success alert-soft mb-4 text-sm">Tag deleted.</div>
{/if}
{#if form?.tagSnippetError}
	<div role="alert" class="alert alert-error alert-soft mb-4 text-sm">{form.tagSnippetError}</div>
{/if}
{#if form?.showAdded}
	<div role="alert" class="alert alert-success alert-soft mb-4 text-sm">Show added.</div>
{/if}
{#if form?.showDeleted}
	<div role="alert" class="alert alert-success alert-soft mb-4 text-sm">Show removed.</div>
{/if}
{#if form?.showToggled}
	<div role="alert" class="alert alert-success alert-soft mb-4 text-sm">Show updated.</div>
{/if}
{#if form?.showError}
	<div role="alert" class="alert alert-error alert-soft mb-4 text-sm">{form.showError}</div>
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
							<div class="flex items-center justify-end gap-1">
								<a
									href="/admin/accounts/connect?account_id={acct.id}"
									class="btn btn-ghost btn-xs"
									title="Re-run Instagram OAuth to refresh this account's token"
								>
									Reconnect
								</a>
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
							</div>
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
		Reusable text bits (addresses, hashtag sets, emojis, multiline blocks) team members can insert with one click.
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
							<legend class="fieldset-legend">Text to insert (multiline ok, emojis welcome)</legend>
							<textarea
								name="snippet_text"
								required
								placeholder="123 Main St, Sydney NSW 2000"
								rows="2"
								class="textarea textarea-sm w-full"
							></textarea>
						</fieldset>
						<button type="submit" class="btn btn-sm btn-neutral">Add</button>
					</form>
				</div>
			</div>
		{/each}
	</div>
</section>

<!-- Tag snippets per account -->
<section class="mb-12">
	<h2 class="mb-1 text-sm font-semibold uppercase tracking-wide text-base-content/50">Tag snippets</h2>
	<p class="mb-5 text-sm text-base-content/50">
		Save Instagram usernames so team members can tag people in feed posts with one click.
	</p>
	<div class="flex flex-col gap-4">
		{#each data.accounts as acct}
			<div class="card bg-base-100">
				<div class="card-body gap-4">
					<h3 class="font-medium">{acct.label}</h3>

					{#if acct.tagSnippets.length > 0}
						<ul class="flex flex-col gap-1.5">
							{#each acct.tagSnippets as tag}
								<li class="flex items-center justify-between gap-3 rounded-box bg-base-200 px-3 py-2">
									<div class="min-w-0">
										<p class="text-xs font-medium">{tag.label}</p>
										<p class="mt-0.5 text-xs text-base-content/50">@{tag.username}</p>
									</div>
									<form method="POST" action="?/deleteTagSnippet" use:enhance class="shrink-0">
										<input type="hidden" name="id" value={tag.id} />
										<button
											type="submit"
											class="btn btn-ghost btn-xs text-error"
											onclick={(e) => { if (!confirm('Delete this tag?')) e.preventDefault(); }}
										>Delete</button>
									</form>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="text-xs text-base-content/40">No tag snippets yet.</p>
					{/if}

					<form method="POST" action="?/addTagSnippet" use:enhance class="flex flex-wrap items-end gap-2">
						<input type="hidden" name="account_id" value={acct.id} />
						<fieldset class="fieldset">
							<legend class="fieldset-legend">Button label</legend>
							<input
								name="tag_label"
								type="text"
								required
								placeholder="Photographer"
								class="input input-sm w-36"
							/>
						</fieldset>
						<fieldset class="fieldset">
							<legend class="fieldset-legend">Instagram username</legend>
							<input
								name="tag_username"
								type="text"
								required
								placeholder="@handle"
								class="input input-sm w-40"
							/>
						</fieldset>
						<button type="submit" class="btn btn-sm btn-neutral">Add</button>
					</form>
				</div>
			</div>
		{/each}
	</div>
</section>

<!-- Shows (ticket tracking) per account -->
<section class="mb-12">
	<h2 class="mb-1 text-sm font-semibold uppercase tracking-wide text-base-content/50">Shows &amp; ticket tracking</h2>
	<p class="mb-5 text-sm text-base-content/50">
		Link shows to Humanitix or Eventbrite events to track ticket sales. Tickets are checked automatically based on Melbourne time — every 5 min at show time, hourly off-peak, quiet midnight–6am.
	</p>
	<div class="flex flex-col gap-4">
		{#each data.accounts as acct}
			<div class="card bg-base-100">
				<div class="card-body gap-4">
					<h3 class="font-medium">{acct.label}</h3>

					{#if acct.shows.length > 0}
						<ul class="flex flex-col gap-1.5">
							{#each acct.shows as show}
								<li class="flex items-center justify-between gap-3 rounded-box bg-base-200 px-3 py-2">
									<div class="min-w-0 flex-1">
										<div class="flex items-center gap-2">
											<p class="text-xs font-medium">{show.name}</p>
											{#if !show.isActive}
												<span class="badge badge-xs badge-ghost">Paused</span>
											{/if}
										</div>
										<p class="mt-0.5 text-xs text-base-content/40">
											{#if show.humanitixEventId}Humanitix: <span class="font-mono">{show.humanitixEventId}</span>{/if}
											{#if show.humanitixEventId && show.eventbriteEventId} · {/if}
											{#if show.eventbriteEventId}Eventbrite: <span class="font-mono">{show.eventbriteEventId}</span>{/if}
										</p>
									</div>
									<div class="flex items-center gap-1 shrink-0">
										<form method="POST" action="?/toggleShow" use:enhance>
											<input type="hidden" name="id" value={show.id} />
											<input type="hidden" name="active" value={show.isActive ? 'true' : 'false'} />
											<button type="submit" class="btn btn-ghost btn-xs">
												{show.isActive ? 'Pause' : 'Resume'}
											</button>
										</form>
										<form method="POST" action="?/deleteShow" use:enhance>
											<input type="hidden" name="id" value={show.id} />
											<button
												type="submit"
												class="btn btn-ghost btn-xs text-error"
												onclick={(e) => { if (!confirm('Remove this show and all its ticket history?')) e.preventDefault(); }}
											>Remove</button>
										</form>
									</div>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="text-xs text-base-content/40">No shows linked yet.</p>
					{/if}

					<form method="POST" action="?/addShow" use:enhance class="flex flex-wrap items-end gap-2">
						<input type="hidden" name="account_id" value={acct.id} />
						<fieldset class="fieldset">
							<legend class="fieldset-legend">Show name</legend>
							<input
								name="show_name"
								type="text"
								required
								placeholder="Comedy Therapy"
								class="input input-sm w-44"
							/>
						</fieldset>
						<fieldset class="fieldset">
							<legend class="fieldset-legend">Humanitix event ID</legend>
							<input
								name="humanitix_event_id"
								type="text"
								placeholder="6a575527bd266af6e1..."
								class="input input-sm w-52 font-mono text-xs"
							/>
						</fieldset>
						<fieldset class="fieldset">
							<legend class="fieldset-legend">Eventbrite event ID</legend>
							<input
								name="eventbrite_event_id"
								type="text"
								placeholder="12345678901"
								class="input input-sm w-40 font-mono text-xs"
							/>
						</fieldset>
						<button type="submit" class="btn btn-sm btn-neutral">Add show</button>
					</form>
				</div>
			</div>
		{/each}
	</div>
</section>
