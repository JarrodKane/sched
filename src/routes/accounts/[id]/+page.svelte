<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let uploading = $state(false);
	let uploadedUrl = $state('');
	let uploadError = $state('');
	let scheduling = $state(false);
	let postType = $state<'feed' | 'story'>('feed');

	async function handleUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		if (!file.type.startsWith('image/')) {
			uploadError = 'Only image files are supported.';
			return;
		}

		uploading = true;
		uploadError = '';
		uploadedUrl = '';

		const fd = new FormData();
		fd.append('file', file);
		fd.append('account_id', data.account.id);

		try {
			const res = await fetch('/api/upload', { method: 'POST', body: fd });
			const json = await res.json();
			if (!res.ok) throw new Error(json.error ?? 'Upload failed');
			uploadedUrl = json.url;
		} catch (err: unknown) {
			uploadError = err instanceof Error ? err.message : 'Upload failed';
		} finally {
			uploading = false;
		}
	}

	// min datetime for the picker — now + 1 min
	const minDatetime = new Date(Date.now() + 60_000).toISOString().slice(0, 16);
</script>

<svelte:head><title>{data.account.label} — IG Scheduler</title></svelte:head>

<div class="mb-6 flex items-center justify-between">
	<div>
		<a href="/dashboard" class="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">← Dashboard</a>
		<h1 class="mt-1 text-xl font-semibold text-zinc-900 dark:text-white">{data.account.label}</h1>
	</div>
	<a
		href="/accounts/{data.account.id}/history"
		class="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
	>
		History →
	</a>
</div>

<div class="grid gap-8 lg:grid-cols-2">
	<!-- Schedule new post -->
	<section>
		<h2 class="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
			Schedule new post
		</h2>

		{#if form?.error}
			<p class="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
				{form.error}
			</p>
		{/if}
		{#if form?.success}
			<p class="mb-3 rounded bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
				Post scheduled!
			</p>
		{/if}

		<form
			method="POST"
			action="?/schedule"
			use:enhance={() => {
				scheduling = true;
				return async ({ update }) => {
					scheduling = false;
					uploadedUrl = '';
					await update();
				};
			}}
			class="space-y-4"
		>
			<!-- Post type -->
			<div class="flex gap-3">
				{#each ['feed', 'story'] as t}
					<button
						type="button"
						onclick={() => (postType = t as 'feed' | 'story')}
						class="rounded-full px-4 py-1.5 text-sm font-medium transition {postType === t
							? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
							: 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'}"
					>
						{t.charAt(0).toUpperCase() + t.slice(1)}
					</button>
				{/each}
			</div>
			<input type="hidden" name="type" value={postType} />

			<!-- Image upload -->
			<div>
				<label for="image-upload" class="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Image</label>
				<input
					id="image-upload"
					type="file"
					accept="image/*"
					onchange={handleUpload}
					class="block w-full text-sm text-zinc-600 file:mr-3 file:rounded file:border-0 file:bg-zinc-100 file:px-3 file:py-1 file:text-sm file:font-medium file:text-zinc-700 hover:file:bg-zinc-200 dark:text-zinc-400 dark:file:bg-zinc-800 dark:file:text-zinc-300"
				/>
				{#if uploading}
					<p class="mt-1 text-xs text-zinc-400">Uploading…</p>
				{/if}
				{#if uploadError}
					<p class="mt-1 text-xs text-red-500">{uploadError}</p>
				{/if}
				{#if uploadedUrl}
					<p class="mt-1 text-xs text-green-600 dark:text-green-400">Uploaded ✓</p>
					<img src={uploadedUrl} alt="preview" class="mt-2 h-32 w-32 rounded object-cover" />
				{/if}
				<input type="hidden" name="media_url" value={uploadedUrl} />
			</div>

			<!-- Caption (feed only) -->
			{#if postType === 'feed'}
				<div>
					<label for="caption" class="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
						Caption <span class="font-normal text-zinc-400">(optional)</span>
					</label>
					<textarea
						id="caption"
						name="caption"
						rows="3"
						class="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-zinc-400"
					></textarea>
				</div>
			{/if}

			<!-- Scheduled time -->
			<div>
				<label for="scheduled_for" class="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
					Scheduled time
				</label>
				<input
					id="scheduled_for"
					name="scheduled_for"
					type="datetime-local"
					min={minDatetime}
					required
					class="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-zinc-400"
				/>
			</div>

			<button
				type="submit"
				disabled={scheduling || !uploadedUrl}
				class="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
			>
				{scheduling ? 'Scheduling…' : 'Schedule post'}
			</button>
		</form>
	</section>

	<!-- Upcoming queue -->
	<section>
		<h2 class="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
			Upcoming queue ({data.queue.length})
		</h2>

		{#if form?.cancelled}
			<p class="mb-3 rounded bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
				Post cancelled.
			</p>
		{/if}

		{#if data.queue.length === 0}
			<p class="text-sm text-zinc-400">No pending posts.</p>
		{:else}
			<ul class="space-y-3">
				{#each data.queue as post}
					<li class="flex items-start gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
						<img src={post.mediaUrl} alt="" class="h-14 w-14 flex-shrink-0 rounded object-cover" />
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<span class="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
									{post.type}
								</span>
								<span class="rounded bg-yellow-50 px-1.5 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300">
									{post.status}
								</span>
							</div>
							{#if post.caption}
								<p class="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">{post.caption}</p>
							{/if}
							<p class="mt-1 text-xs text-zinc-400">
								{new Date(post.scheduledFor).toLocaleString()}
							</p>
						</div>
						{#if post.status === 'pending'}
							<form method="POST" action="?/cancel" use:enhance>
								<input type="hidden" name="post_id" value={post.id} />
								<button
									type="submit"
									class="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400"
								>
									Cancel
								</button>
							</form>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>
