<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function relativeTime(date: string | Date): string {
		const diff = Date.now() - new Date(date).getTime();
		if (diff < 60_000) return 'just now';
		const mins = Math.round(diff / 60_000);
		if (mins < 60) return `${mins}m ago`;
		const hours = Math.floor(mins / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		if (days < 30) return `${days}d ago`;
		return new Date(date).toLocaleDateString();
	}

	function statusBadge(status: string): string {
		if (status === 'published') return 'badge-success badge-soft';
		if (status === 'failed') return 'badge-error badge-soft';
		if (status === 'cancelled') return 'badge-ghost';
		return 'badge-ghost';
	}

	let brokenImages = $state(new Set<string>());

	function thumbSrc(post: { thumbnailUrl: string | null; mediaUrl: string }) {
		return post.thumbnailUrl ?? post.mediaUrl;
	}
</script>

<svelte:head><title>{data.account.label} History — IG Scheduler</title></svelte:head>

{#if data.posts.length === 0}
	<div role="alert" class="alert alert-soft">No post history in the last 30 days.</div>
{:else}
	<ul class="flex flex-col gap-3">
		{#each data.posts as post}
			{@const scheduledMs = new Date(post.scheduledFor).getTime()}
			{@const publishedMs = post.publishedAt ? new Date(post.publishedAt).getTime() : null}
			<li class="card bg-base-100 {post.status === 'cancelled' ? 'opacity-60' : ''}">
				<div class="card-body flex-row items-start gap-4 p-4">
					{#if brokenImages.has(thumbSrc(post))}
						<div class="h-16 w-16 shrink-0 rounded-box bg-base-200 flex items-center justify-center text-xs text-base-content/40">
							No image
						</div>
					{:else}
						<img
							src={thumbSrc(post)}
							alt=""
							class="h-16 w-16 shrink-0 rounded-box object-cover"
							onerror={() => { brokenImages = new Set([...brokenImages, thumbSrc(post)]); }}
						/>
					{/if}
					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-1.5 mb-1">
							<span class="badge badge-ghost badge-sm">{post.type}</span>
							<span class="badge badge-sm {statusBadge(post.status)}">{post.status}</span>
						</div>
						{#if post.caption}
							<p class="text-sm text-base-content line-clamp-2 mb-1">{post.caption}</p>
						{/if}
						{#if post.publishedAt}
							<p class="text-xs text-base-content/50" title={new Date(post.publishedAt).toLocaleString()}>
								Published {relativeTime(post.publishedAt)}
							</p>
						{:else if post.errorMessage}
							<p class="text-xs text-error">{post.errorMessage}</p>
						{:else if post.status === 'cancelled'}
							<p class="text-xs text-base-content/50">Cancelled</p>
						{/if}
						{#if !publishedMs || Math.abs(scheduledMs - publishedMs) > 120_000}
							<p class="text-xs text-base-content/40 mt-0.5" title={new Date(post.scheduledFor).toLocaleString()}>
								Scheduled for {new Date(post.scheduledFor).toLocaleString()}
							</p>
						{/if}
					</div>
				</div>
			</li>
		{/each}
	</ul>
{/if}
