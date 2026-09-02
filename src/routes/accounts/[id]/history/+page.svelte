<!--
  +page.svelte — /accounts/[id]/history
  Post history page. Groups posts by day (Today / Yesterday / date label) and
  shows each post's thumbnail, caption (collapsible), status badge, and a copy
  button for the caption. Failed posts display their error message and a retry form.

  Svelte features:
    $state       — expandedIds (Set<string>): which long captions are expanded
    $derived.by  — dayGroups: buckets posts into ordered { label, posts[] } groups
    $props()     — receives data (history[], accountMeta) and form (action result)
    use:enhance  — on the retry form
-->

<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import { relativeTimePast } from '$lib/format';

	let { data }: { data: PageData } = $props();

	type Post = (typeof data.posts)[0];

	function formatTime(date: string | Date): string {
		return new Date(date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
	}

	const groups = $derived.by(() => {
		const map = new Map<string, Post[]>();
		const todayMs = new Date().setHours(0, 0, 0, 0);
		const yesterdayMs = todayMs - 86_400_000;

		for (const post of data.posts) {
			const d = new Date(post.scheduledFor);
			const dayMs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
			let label: string;
			if (dayMs === todayMs) label = 'Today';
			else if (dayMs === yesterdayMs) label = 'Yesterday';
			else label = d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

			const arr = map.get(label);
			if (arr) arr.push(post);
			else map.set(label, [post]);
		}

		return [...map.entries()].map(([label, posts]) => ({ label, posts: [...posts].reverse() }));
	});

	function carouselCount(post: Post): number {
		if (!post.carouselItems) return 0;
		try { return (JSON.parse(post.carouselItems) as string[]).length; } catch { return 0; }
	}

	let brokenImages = $state(new Set<string>());
	let expandedPosts = $state(new Set<string>());
	let copiedPost = $state<string | null>(null);
	let retrying = $state<string | null>(null);

	function thumbSrc(post: Post) {
		return post.thumbnailUrl ?? post.mediaUrl;
	}

	function toggleCaption(id: string) {
		const next = new Set(expandedPosts);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		expandedPosts = next;
	}

	async function copyCaption(id: string, caption: string) {
		await navigator.clipboard.writeText(caption);
		copiedPost = id;
		setTimeout(() => { copiedPost = null; }, 1500);
	}
</script>

<svelte:head><title>{data.account.label} History — Sched</title></svelte:head>

{#if data.posts.length === 0}
	<div class="flex flex-col items-center justify-center py-20 text-center">
		<p class="text-base-content/40 text-sm">No posts in the last 30 days.</p>
	</div>
{:else}
	<div class="flex flex-col gap-8">
		{#each groups as group}
			<div>
				<p class="text-xs font-semibold uppercase tracking-wider text-base-content/40 mb-3 px-1">
					{group.label}
				</p>
				<ul class="flex flex-col gap-2">
					{#each group.posts as post}
						{@const thumb = thumbSrc(post)}
						{@const count = post.type === 'carousel' ? carouselCount(post) : 0}
						<li class="card bg-base-100 {post.status === 'cancelled' ? 'opacity-60' : ''}">
							<div class="card-body flex-row items-start gap-4 p-4">
								<!-- Thumbnail -->
								{#if brokenImages.has(thumb)}
									<div class="h-14 w-14 shrink-0 rounded-box bg-base-200 flex items-center justify-center text-xs text-base-content/30">
										—
									</div>
								{:else}
									<div class="relative h-14 w-14 shrink-0 rounded-box overflow-hidden skeleton">
										<img
											src={thumb}
											alt=""
											class="h-14 w-14 object-cover opacity-0 transition-opacity duration-200"
											onerror={() => { brokenImages = new Set([...brokenImages, thumb]); }}
											onload={(e) => {
												e.currentTarget.classList.remove('opacity-0');
												e.currentTarget.parentElement?.classList.remove('skeleton');
											}}
										/>
									</div>
								{/if}

								<!-- Content -->
								<div class="min-w-0 flex-1">
									<!-- Status row -->
									<div class="flex flex-wrap items-center gap-1.5 mb-1">
										{#if post.status === 'published'}
											<span class="badge badge-success badge-soft badge-sm">Published</span>
										{:else if post.status === 'failed'}
											<span class="badge badge-error badge-soft badge-sm">Failed</span>
										{:else}
											<span class="badge badge-ghost badge-sm">Cancelled</span>
										{/if}
										<span class="badge badge-ghost badge-sm capitalize">{post.type}</span>
										{#if count > 1}
											<span class="badge badge-ghost badge-sm">{count} images</span>
										{/if}
									</div>

									<!-- Time -->
									{#if post.publishedAt}
										<p class="text-xs text-base-content/60">
											{relativeTimePast(post.publishedAt)}
											<span class="text-base-content/30 ml-1">· {formatTime(post.publishedAt)}</span>
										</p>
									{:else if post.status === 'failed'}
										<p class="text-xs text-base-content/40">Scheduled {formatTime(post.scheduledFor)}</p>
									{:else}
										<p class="text-xs text-base-content/40">{formatTime(post.scheduledFor)}</p>
									{/if}

									<!-- Caption -->
									{#if post.caption}
										{@const expanded = expandedPosts.has(post.id)}
										<p
											class="text-xs text-base-content/60 mt-1 leading-snug whitespace-pre-line cursor-pointer {expanded ? '' : 'line-clamp-2'}"
											onclick={() => toggleCaption(post.id)}
											title={expanded ? 'Click to collapse' : 'Click to expand'}
										>{post.caption}</p>
										{#if expanded}
											<div class="flex items-center gap-2 mt-1.5">
												<button
													class="btn btn-xs btn-soft btn-neutral"
													onclick={() => toggleCaption(post.id)}
												>Show less</button>
												<button
													class="btn btn-xs btn-soft btn-neutral"
													onclick={() => copyCaption(post.id, post.caption!)}
												>{copiedPost === post.id ? 'Copied!' : 'Copy caption'}</button>
											</div>
										{/if}
									{/if}

									<!-- Error + retry -->
									{#if post.status === 'failed'}
										{#if post.errorMessage}
											<p class="text-xs text-error mt-1 leading-snug">{post.errorMessage}</p>
										{/if}
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
											class="mt-2"
										>
											<input type="hidden" name="post_id" value={post.id} />
											<button type="submit" disabled={retrying === post.id} class="btn btn-xs btn-outline">
												{#if retrying === post.id}
													<span class="loading loading-spinner loading-xs"></span>
												{/if}
												Try again
											</button>
										</form>
									{/if}
								</div>
							</div>
						</li>
					{/each}
				</ul>
			</div>
		{/each}

		<p class="text-xs text-base-content/30 text-center pb-4">Showing last 30 days</p>
	</div>
{/if}
