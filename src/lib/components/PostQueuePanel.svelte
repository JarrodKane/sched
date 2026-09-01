<!--
  PostQueuePanel.svelte
  Two-tab panel (Upcoming / History) showing the post queue and recent post history
  for one account. Renders each post's thumbnail, caption, scheduled time, status
  badge, and action buttons (cancel, view caption, edit caption, reschedule, retry).

  Svelte features:
    $state    — activeTab ('queue' | 'history')
    $props()  — receives queue, history arrays plus accountId, form, and four
                on* callback props that the parent wires to its modal open() methods
    use:enhance — on cancel and retry forms

  Props:
    queue          Post[]     — pending/publishing posts
    history        Post[]     — published/failed/cancelled posts
    accountId      string     — used to build media/history links
    form           ActionData — the page's form result (for inline flash messages)
    onViewCaption  (caption: string) => void
    onEditCaption  (id: string, caption: string | null) => void
    onReschedule   (id: string, scheduledFor: string) => void
    onPreview      (url: string, urls?: string[]) => void
-->

<script lang="ts">
	import { enhance } from '$app/forms';

	type Post = {
		id: string;
		mediaUrl: string;
		thumbnailUrl: string | null;
		type: string;
		caption: string | null;
		scheduledFor: string;
		status: string;
		publishedAt: string | null;
		errorMessage: string | null;
		carouselItems?: string | null;
	};

	type FormFlash = {
		cancelled?: boolean;
		rescheduled?: boolean;
		captionEdited?: boolean;
	} | null;

	let {
		queue,
		history,
		accountId,
		form,
		onOpenPreview,
		onOpenEditCaption,
		onOpenReschedule,
		onOpenViewCaption
	}: {
		queue: Post[];
		history: Post[];
		accountId: string;
		form: FormFlash;
		onOpenPreview: (post: Post) => void;
		onOpenEditCaption: (postId: string, caption: string | null) => void;
		onOpenReschedule: (postId: string, scheduledFor: string) => void;
		onOpenViewCaption: (caption: string) => void;
	} = $props();

	let queueTab = $state<'upcoming' | 'history'>('upcoming');
	let cancelling = $state<string | null>(null);
	let retrying = $state<string | null>(null);

	function relativeTime(date: string): string {
		const d = new Date(date);
		const diff = d.getTime() - Date.now();
		const abs = Math.abs(diff);
		const past = diff < 0;
		if (abs < 60_000) return past ? 'just now' : 'in less than a minute';
		const mins = Math.round(abs / 60_000);
		if (mins < 60) return past ? `${mins}m ago` : `in ${mins}m`;
		const hours = Math.floor(mins / 60);
		const remMins = mins % 60;
		if (hours < 24) return past ? `${hours}h ${remMins}m ago` : `in ${hours}h${remMins > 0 ? ` ${remMins}m` : ''}`;
		const midnight = (x: Date) => { const c = new Date(x); c.setHours(0, 0, 0, 0); return c; };
		const days = Math.round(Math.abs(midnight(new Date()).getTime() - midnight(d).getTime()) / 86_400_000);
		return past ? `${days}d ago` : `in ${days}d`;
	}
</script>

<div class="card bg-base-100 overflow-hidden">
	<!-- Tab bar -->
	<div class="flex gap-5 px-6 pt-5 border-b border-base-200">
		<button
			type="button"
			onclick={() => (queueTab = 'upcoming')}
			class="pb-3 text-sm font-semibold border-b-2 -mb-px transition-colors
				{queueTab === 'upcoming'
					? 'border-primary text-base-content'
					: 'border-transparent text-base-content/40 hover:text-base-content/70'}"
		>
			Upcoming{queue.length > 0 ? ` (${queue.length})` : ''}
		</button>
		<button
			type="button"
			onclick={() => (queueTab = 'history')}
			class="pb-3 text-sm font-semibold border-b-2 -mb-px transition-colors
				{queueTab === 'history'
					? 'border-primary text-base-content'
					: 'border-transparent text-base-content/40 hover:text-base-content/70'}"
		>
			History
		</button>
	</div>

	<div class="p-6 flex flex-col gap-4">
		{#if queueTab === 'upcoming'}
			{#if form?.cancelled}
				<div role="alert" class="alert alert-success alert-soft text-sm">Post cancelled.</div>
			{/if}
			{#if form?.rescheduled}
				<div role="alert" class="alert alert-success alert-soft text-sm">Post rescheduled.</div>
			{/if}
			{#if form?.captionEdited}
				<div role="alert" class="alert alert-success alert-soft text-sm">Caption updated.</div>
			{/if}

			{#if queue.length === 0}
				<p class="text-sm text-base-content/40">
					Nothing scheduled yet.{#if history.length > 0}
						{' '}<button
							type="button"
							onclick={() => (queueTab = 'history')}
							class="underline underline-offset-2 hover:text-base-content/60 transition-colors"
						>View recent history</button>
					{/if}
				</p>
			{:else}
				<ul class="list">
					{#each queue as post}
						<li class="list-row items-start py-3">
							<img
								src={post.thumbnailUrl ?? post.mediaUrl}
								alt=""
								class="h-11 w-11 rounded-box object-cover shrink-0 mt-0.5"
							/>
							<div class="list-col-grow min-w-0">
								<div class="flex flex-wrap items-center gap-1.5 mb-1">
									<span class="badge badge-ghost badge-xs capitalize">{post.type}</span>
									{#if post.status === 'publishing'}
										<span class="badge badge-info badge-soft badge-xs">
											<span class="loading loading-ring loading-xs"></span>
											publishing
										</span>
									{/if}
									<span class="text-xs font-medium text-base-content/80">{relativeTime(post.scheduledFor)}</span>
									<span class="text-xs text-base-content/40">
										{new Date(post.scheduledFor).toLocaleString(undefined, {
											weekday: 'short', month: 'short', day: 'numeric',
											hour: '2-digit', minute: '2-digit'
										})}
									</span>
								</div>
								{#if post.caption}
									<p class="text-xs text-base-content/50 leading-snug mb-1.5 line-clamp-2">{post.caption}</p>
								{/if}
								{#if post.status === 'pending'}
									<div class="flex flex-wrap items-center gap-1 mt-0.5">
										<button
											type="button"
											onclick={() => onOpenPreview(post)}
											class="btn btn-xs"
										>Preview</button>
										{#if post.type === 'feed' || post.type === 'carousel'}
											<button
												type="button"
												onclick={() => onOpenEditCaption(post.id, post.caption)}
												class="btn btn-xs"
											>Caption</button>
										{/if}
										<button
											type="button"
											onclick={() => onOpenReschedule(post.id, post.scheduledFor)}
											class="btn btn-xs"
										>Reschedule</button>
										<form
											method="POST"
											action="?/cancel"
											use:enhance={() => {
												cancelling = post.id;
												return async ({ update }) => {
													cancelling = null;
													await update();
												};
											}}
										>
											<input type="hidden" name="post_id" value={post.id} />
											<button
												type="submit"
												disabled={cancelling === post.id}
												class="btn btn-xs btn-error btn-soft"
												onclick={(e) => { if (!confirm('Cancel this scheduled post?')) e.preventDefault(); }}
											>
												{#if cancelling === post.id}
													<span class="loading loading-spinner loading-xs"></span>
												{/if}
												Cancel
											</button>
										</form>
									</div>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		{:else}
			{#if history.length === 0}
				<p class="text-sm text-base-content/40">No recent post history.</p>
			{:else}
				<ul class="flex flex-col divide-y divide-base-200 -mx-6 -mt-4">
					{#each history as post}
						<li
							class="flex items-start gap-3 px-6 py-3.5 {post.caption ? 'cursor-pointer hover:bg-base-200/50 transition-colors' : ''}"
							onclick={() => { if (post.caption) onOpenViewCaption(post.caption); }}
						>
							<img
								src={post.thumbnailUrl ?? post.mediaUrl}
								alt=""
								class="h-11 w-11 rounded-box object-cover shrink-0 mt-0.5"
							/>
							<div class="min-w-0 flex-1">
								<div class="flex flex-wrap items-center gap-1.5 mb-0.5">
									{#if post.status === 'published'}
										<span class="badge badge-success badge-soft badge-xs">published</span>
									{:else if post.status === 'failed'}
										<span class="badge badge-error badge-soft badge-xs">failed</span>
									{:else}
										<span class="badge badge-ghost badge-xs">cancelled</span>
									{/if}
									<span class="badge badge-ghost badge-xs capitalize">{post.type}</span>
									<span class="text-xs text-base-content/40">
										{relativeTime(post.publishedAt ?? post.scheduledFor)}
									</span>
								</div>
								{#if post.caption}
									<p class="text-xs text-base-content/50 line-clamp-1">{post.caption}</p>
								{/if}
								{#if post.errorMessage && post.status === 'failed'}
									<p class="text-xs text-error line-clamp-1 mt-0.5">{post.errorMessage}</p>
								{/if}
								{#if post.status === 'failed'}
									<form
										method="POST"
										action="?/retry"
										use:enhance={() => {
											retrying = post.id;
											return async ({ update }) => {
												retrying = null;
												await update();
											};
										}}
										onclick={(e) => e.stopPropagation()}
										class="mt-1.5"
									>
										<input type="hidden" name="post_id" value={post.id} />
										<button
											type="submit"
											disabled={retrying === post.id}
											class="btn btn-xs btn-outline"
										>
											{#if retrying === post.id}
												<span class="loading loading-spinner loading-xs"></span>
											{/if}
											Try again
										</button>
									</form>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
				<a
					href="/accounts/{accountId}/history"
					class="text-xs text-base-content/40 hover:text-base-content/70 transition-colors self-start"
				>View full history →</a>
			{/if}
		{/if}
	</div>
</div>
