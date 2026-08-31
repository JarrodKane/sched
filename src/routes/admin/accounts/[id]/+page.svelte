<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let editingShowId = $state<string | null>(null);

	const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
	const SCHEDULE_TYPES = [
		{ value: 'weekly', label: 'Weekly' },
		{ value: 'fortnightly', label: 'Fortnightly' },
		{ value: 'monthly', label: 'Monthly' },
		{ value: 'one_off', label: 'One-off' }
	];

	function scheduleLabel(show: typeof data.shows[0]) {
		if (!show.scheduleType) return null;
		const t = SCHEDULE_TYPES.find((s) => s.value === show.scheduleType)?.label ?? show.scheduleType;
		const day = show.scheduleDayOfWeek != null ? ` – ${DAYS[show.scheduleDayOfWeek]}` : '';
		return `${t}${day}`;
	}
</script>

<svelte:head><title>{data.account.label} — Admin</title></svelte:head>

<!-- Header -->
<div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
	<div class="min-w-0">
		<a href="/admin/accounts" class="text-sm text-base-content/40 hover:text-base-content transition-colors">
			← Accounts
		</a>
		<h1 class="mt-1 text-xl font-semibold">{data.account.label}</h1>
		<p class="text-xs text-base-content/40 font-mono mt-0.5 break-all">{data.account.igBusinessId}</p>
	</div>
	<div class="flex items-center gap-2 shrink-0">
		<a href="/accounts/{data.account.id}/settings" class="btn btn-sm btn-soft btn-neutral">
			Snippets &amp; settings
		</a>
		<a href="/admin/accounts/connect?account_id={data.account.id}" class="btn btn-sm btn-outline">
			Reconnect IG
		</a>
	</div>
</div>

<!-- Flash messages -->
{#if form?.showAdded}<div role="alert" class="alert alert-success alert-soft mb-4 text-sm">Show added.</div>{/if}
{#if form?.showUpdated}<div role="alert" class="alert alert-success alert-soft mb-4 text-sm">Show updated.</div>{/if}
{#if form?.showDeleted}<div role="alert" class="alert alert-success alert-soft mb-4 text-sm">Show removed.</div>{/if}
{#if form?.showToggled}<div role="alert" class="alert alert-success alert-soft mb-4 text-sm">Show updated.</div>{/if}
{#if form?.showError}<div role="alert" class="alert alert-error alert-soft mb-4 text-sm">{form.showError}</div>{/if}

<!-- Shows -->
<div class="mb-2 flex items-center justify-between">
	<h2 class="text-sm font-semibold text-base-content/60 uppercase tracking-wide">Ticket shows</h2>
	{#if data.shows.length > 0}
		<span class="text-xs text-base-content/40">{data.shows.length} show{data.shows.length !== 1 ? 's' : ''}</span>
	{/if}
</div>

<div class="flex flex-col gap-2 mb-4">
	{#if data.shows.length > 0}
		{#each data.shows as show}
			<div class="card bg-base-100">
				<div class="card-body py-3 px-4 gap-3">
					<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
						<div class="min-w-0">
							<div class="flex items-center gap-2">
								<p class="font-medium text-sm">{show.name}</p>
								{#if !show.isActive}
									<span class="badge badge-xs badge-ghost">Paused</span>
								{/if}
							</div>
							{#if editingShowId !== show.id}
								<div class="flex flex-col gap-0.5 mt-0.5 sm:flex-row sm:flex-wrap sm:gap-x-3">
									{#if scheduleLabel(show)}
										<p class="text-xs text-base-content/50">{scheduleLabel(show)}{show.actsPerShow ? ` · ${show.actsPerShow} acts` : ''}</p>
									{/if}
									{#if show.humanitixEventId}
										<p class="text-xs text-base-content/40 font-mono break-all">Humanitix: {show.humanitixEventId}</p>
									{/if}
									{#if show.eventbriteEventId}
										<p class="text-xs text-base-content/40 font-mono break-all">Eventbrite: {show.eventbriteEventId}</p>
									{/if}
									{#if !show.humanitixEventId && !show.eventbriteEventId}
										<p class="text-xs text-base-content/30">No ticket IDs set</p>
									{/if}
								</div>
							{/if}
						</div>
						<div class="flex items-center gap-1 shrink-0">
							<button
								type="button"
								class="btn btn-xs btn-soft btn-neutral"
								onclick={() => editingShowId = editingShowId === show.id ? null : show.id}
							>
								{editingShowId === show.id ? 'Cancel' : 'Edit'}
							</button>
							<form method="POST" action="?/toggleShow" use:enhance>
								<input type="hidden" name="id" value={show.id} />
								<input type="hidden" name="active" value={show.isActive ? 'true' : 'false'} />
								<button type="submit" class="btn btn-xs btn-soft btn-neutral">
									{show.isActive ? 'Pause' : 'Resume'}
								</button>
							</form>
							<form method="POST" action="?/deleteShow" use:enhance>
								<input type="hidden" name="id" value={show.id} />
								<button
									type="submit"
									class="btn btn-xs btn-soft btn-error"
									onclick={(e) => { if (!confirm('Remove this show and all its ticket history?')) e.preventDefault(); }}
								>Remove</button>
							</form>
						</div>
					</div>

					{#if editingShowId === show.id}
						<form
							method="POST"
							action="?/updateShow"
							use:enhance={() => {
								return ({ result }) => {
									if (result.type === 'success') editingShowId = null;
								};
							}}
							class="flex flex-col gap-2 pt-2 border-t border-base-300"
						>
							<input type="hidden" name="id" value={show.id} />
							<div class="flex flex-wrap gap-2">
								<fieldset class="fieldset">
									<legend class="fieldset-legend">Show name</legend>
									<input name="show_name" type="text" required value={show.name} class="input input-sm w-44" />
								</fieldset>
								<fieldset class="fieldset">
									<legend class="fieldset-legend">Schedule</legend>
									<select name="schedule_type" class="select select-sm w-36" value={show.scheduleType ?? ''}>
										<option value="">— none —</option>
										{#each SCHEDULE_TYPES as s}
											<option value={s.value}>{s.label}</option>
										{/each}
									</select>
								</fieldset>
								<fieldset class="fieldset">
									<legend class="fieldset-legend">Day of week</legend>
									<select name="schedule_day_of_week" class="select select-sm w-32" value={show.scheduleDayOfWeek != null ? String(show.scheduleDayOfWeek) : ''}>
										<option value="">—</option>
										{#each DAYS as day, i}
											<option value={String(i)}>{day}</option>
										{/each}
									</select>
								</fieldset>
								<fieldset class="fieldset">
									<legend class="fieldset-legend">Acts per show</legend>
									<input name="acts_per_show" type="number" min="1" value={show.actsPerShow ?? ''} placeholder="e.g. 6" class="input input-sm w-24" />
								</fieldset>
								<fieldset class="fieldset">
									<legend class="fieldset-legend">Venue capacity</legend>
									<input name="capacity" type="number" min="1" value={show.capacity ?? ''} placeholder="e.g. 80" class="input input-sm w-28" />
								</fieldset>
								<fieldset class="fieldset">
									<legend class="fieldset-legend">Humanitix event ID</legend>
									<input name="humanitix_event_id" type="text" value={show.humanitixEventId ?? ''} placeholder="6a575527bd266af6e1..." class="input input-sm w-52 font-mono text-xs" />
								</fieldset>
								<fieldset class="fieldset">
									<legend class="fieldset-legend">Eventbrite event ID</legend>
									<input name="eventbrite_event_id" type="text" value={show.eventbriteEventId ?? ''} placeholder="1991341193114" class="input input-sm w-40 font-mono text-xs" />
								</fieldset>
							</div>
							<div>
								<button type="submit" class="btn btn-sm btn-primary">Save changes</button>
							</div>
						</form>
					{/if}
				</div>
			</div>
		{/each}
	{:else}
		<p class="text-sm text-base-content/40 py-2">No shows yet. Add one below.</p>
	{/if}

	<!-- Add show -->
	<div class="card bg-base-100">
		<div class="card-body py-3 px-4 gap-3">
			<h3 class="text-sm font-medium">Add show</h3>
			<form method="POST" action="?/addShow" use:enhance class="flex flex-wrap items-end gap-2">
				<fieldset class="fieldset">
					<legend class="fieldset-legend">Show name</legend>
					<input name="show_name" type="text" required placeholder="Comedy Therapy" class="input input-sm w-44" />
				</fieldset>
				<fieldset class="fieldset">
					<legend class="fieldset-legend">Schedule</legend>
					<select name="schedule_type" class="select select-sm w-36">
						<option value="">— none —</option>
						{#each SCHEDULE_TYPES as s}
							<option value={s.value}>{s.label}</option>
						{/each}
					</select>
				</fieldset>
				<fieldset class="fieldset">
					<legend class="fieldset-legend">Day of week</legend>
					<select name="schedule_day_of_week" class="select select-sm w-32">
						<option value="">—</option>
						{#each DAYS as day, i}
							<option value={String(i)}>{day}</option>
						{/each}
					</select>
				</fieldset>
				<fieldset class="fieldset">
					<legend class="fieldset-legend">Acts per show</legend>
					<input name="acts_per_show" type="number" min="1" placeholder="e.g. 6" class="input input-sm w-24" />
				</fieldset>
				<fieldset class="fieldset">
					<legend class="fieldset-legend">Venue capacity</legend>
					<input name="capacity" type="number" min="1" placeholder="e.g. 80" class="input input-sm w-28" />
				</fieldset>
				<fieldset class="fieldset">
					<legend class="fieldset-legend">Humanitix event ID</legend>
					<input name="humanitix_event_id" type="text" placeholder="6a575527bd266af6e1..." class="input input-sm w-52 font-mono text-xs" />
				</fieldset>
				<fieldset class="fieldset">
					<legend class="fieldset-legend">Eventbrite event ID</legend>
					<input name="eventbrite_event_id" type="text" placeholder="1991341193114" class="input input-sm w-40 font-mono text-xs" />
				</fieldset>
				<button type="submit" class="btn btn-sm btn-primary">Add show</button>
			</form>
		</div>
	</div>
</div>
