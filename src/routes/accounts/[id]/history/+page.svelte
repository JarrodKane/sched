<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>{data.account.label} History — IG Scheduler</title></svelte:head>

<div class="mb-6">
	<a href="/accounts/{data.account.id}" class="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">
		← {data.account.label}
	</a>
	<h1 class="mt-1 text-xl font-semibold text-zinc-900 dark:text-white">Post history</h1>
</div>

{#if data.posts.length === 0}
	<p class="text-sm text-zinc-400">No published or failed posts yet.</p>
{:else}
	<ul class="space-y-3">
		{#each data.posts as post}
			<li class="flex items-start gap-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
				<img src={post.mediaUrl} alt="" class="h-16 w-16 flex-shrink-0 rounded object-cover" />
				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-2">
						<span class="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
							{post.type}
						</span>
						<span
							class="rounded px-1.5 py-0.5 text-xs font-medium {post.status === 'published'
								? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300'
								: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'}"
						>
							{post.status}
						</span>
					</div>
					{#if post.caption}
						<p class="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{post.caption}</p>
					{/if}
					{#if post.publishedAt}
						<p class="mt-1 text-xs text-zinc-400">
							Published {new Date(post.publishedAt).toLocaleString()}
						</p>
					{:else if post.errorMessage}
						<p class="mt-1 text-xs text-red-500">{post.errorMessage}</p>
					{/if}
					<p class="mt-0.5 text-xs text-zinc-400">
						Scheduled for {new Date(post.scheduledFor).toLocaleString()}
					</p>
				</div>
			</li>
		{/each}
	</ul>
{/if}
