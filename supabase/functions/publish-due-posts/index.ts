// Supabase Edge Function — runs every 60 seconds via pg_cron
// Picks up pending posts whose scheduled_for <= now() and publishes them to Instagram.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Instagram Business Login tokens are Instagram-scoped — use graph.instagram.com,
// not graph.facebook.com (which requires Facebook-scoped tokens).
const BASE_URL = 'https://graph.instagram.com';

interface ScheduledPost {
	id: string;
	type: 'feed' | 'story' | 'carousel';
	caption: string | null;
	media_url: string;
	carousel_items: string | null; // JSON: string[]
	user_tags: string | null; // JSON: string[]
	account_id: string;
}

interface SocialAccount {
	id: string;
	ig_business_id: string;
	access_token: string;
	location_id: string | null;
}

async function waitForContainerReady(
	containerId: string,
	accessToken: string,
	maxAttempts = 12,
	delayMs = 2000
): Promise<void> {
	for (let i = 0; i < maxAttempts; i++) {
		const res = await fetch(
			`${BASE_URL}/${containerId}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`
		);
		const data = await res.json();
		if (data.status_code === 'FINISHED') return;
		if (data.status_code === 'ERROR') throw new Error('Instagram media container failed to process');
		await new Promise((r) => setTimeout(r, delayMs));
	}
	throw new Error('Instagram media container timed out (still processing after ~24s)');
}

async function createMediaContainer(
	igBusinessId: string,
	accessToken: string,
	params: Record<string, string>
): Promise<string> {
	const body = new URLSearchParams({ access_token: accessToken, ...params });
	const res = await fetch(`${BASE_URL}/${igBusinessId}/media`, { method: 'POST', body });
	const data = await res.json();
	if (data.error) console.error('Instagram media API error:', JSON.stringify(data.error));
	if (!data.id) throw new Error(data.error?.message ?? 'Failed to create Instagram media container');
	return data.id as string;
}

async function publishToInstagram(
	account: SocialAccount,
	post: ScheduledPost
): Promise<string> {
	if (post.type === 'carousel') {
		return publishCarousel(account, post);
	}

	const params: Record<string, string> = { image_url: post.media_url };
	if (post.type === 'story') {
		params.media_type = 'STORIES';
	} else {
		if (post.caption) params.caption = post.caption;
		if (post.user_tags) {
			const usernames: string[] = JSON.parse(post.user_tags);
			if (usernames.length > 0) {
				params.user_tags = JSON.stringify(usernames.map((u, i) => {
						const count = usernames.length;
						const x = count === 1 ? 0.5 : Math.round((0.1 + (0.8 / (count - 1)) * i) * 100) / 100;
						const y = count === 1 ? 0.5 : (i % 2 === 0 ? 0.35 : 0.65);
						return { username: u, x, y };
					}));
			}
		}
		if (account.location_id) params.location_id = account.location_id;
	}

	let containerId: string;
	try {
		containerId = await createMediaContainer(account.ig_business_id, account.access_token, params);
	} catch (err) {
		const msg = err instanceof Error ? err.message : '';
		if (params.location_id && msg.toLowerCase().includes('location')) {
			// Invalid location ID — retry without it so the post still goes out
			console.warn(`Location ID "${params.location_id}" rejected by Instagram — retrying without location`);
			delete params.location_id;
			containerId = await createMediaContainer(account.ig_business_id, account.access_token, params);
		} else {
			throw err;
		}
	}
	await waitForContainerReady(containerId, account.access_token);

	const publishBody = new URLSearchParams({ creation_id: containerId, access_token: account.access_token });
	const publishRes = await fetch(`${BASE_URL}/${account.ig_business_id}/media_publish`, {
		method: 'POST',
		body: publishBody
	});
	const publishData = await publishRes.json();
	if (!publishData.id) throw new Error(publishData.error?.message ?? 'Failed to publish Instagram media');
	return publishData.id as string;
}

async function publishCarousel(account: SocialAccount, post: ScheduledPost): Promise<string> {
	const urls: string[] = JSON.parse(post.carousel_items ?? '[]');
	if (urls.length < 2) throw new Error('Carousel requires at least 2 images');

	// Per-image tags: Record<string, string[]> keyed by image index
	let tagMap: Record<string, string[]> = {};
	if (post.user_tags) {
		try {
			const parsed = JSON.parse(post.user_tags);
			// Carousel format is an object; flat array means legacy/non-carousel — skip
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				tagMap = parsed;
			}
		} catch { /* ignore */ }
	}
	console.log(`[carousel ${post.id}] tagMap:`, JSON.stringify(tagMap));

	// Step 1: create a container for each image
	const itemIds: string[] = [];
	for (let idx = 0; idx < urls.length; idx++) {
		const itemParams: Record<string, string> = {
			image_url: urls[idx],
			is_carousel_item: 'true'
		};
		const imageTags = tagMap[String(idx)];
		if (imageTags?.length) {
			const tagPayload = imageTags.map((u, i) => {
				const count = imageTags.length;
				const x = count === 1 ? 0.5 : Math.round((0.1 + (0.8 / (count - 1)) * i) * 100) / 100;
				const y = count === 1 ? 0.5 : (i % 2 === 0 ? 0.35 : 0.65);
				return { username: u, x, y };
			});
			itemParams.user_tags = JSON.stringify(tagPayload);
			console.log(`[carousel ${post.id}] image ${idx} tags:`, JSON.stringify(tagPayload));
		} else {
			console.log(`[carousel ${post.id}] image ${idx}: no tags`);
		}
		const id = await createMediaContainer(account.ig_business_id, account.access_token, itemParams);
		console.log(`[carousel ${post.id}] image ${idx} container id:`, id);
		itemIds.push(id);
	}

	// Wait for all item containers to finish processing
	for (const id of itemIds) {
		await waitForContainerReady(id, account.access_token);
	}

	// Step 2: create carousel container
	const carouselParams: Record<string, string> = {
		media_type: 'CAROUSEL',
		children: itemIds.join(',')
	};
	if (post.caption) carouselParams.caption = post.caption;

	const carouselId = await createMediaContainer(account.ig_business_id, account.access_token, carouselParams);
	await waitForContainerReady(carouselId, account.access_token);

	// Step 3: publish
	const publishBody = new URLSearchParams({ creation_id: carouselId, access_token: account.access_token });
	const publishRes = await fetch(`${BASE_URL}/${account.ig_business_id}/media_publish`, {
		method: 'POST',
		body: publishBody
	});
	const publishData = await publishRes.json();
	if (!publishData.id) throw new Error(publishData.error?.message ?? 'Failed to publish carousel');
	return publishData.id as string;
}

Deno.serve(async () => {
	const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
	const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
	const supabase = createClient(supabaseUrl, serviceRoleKey);

	// Fetch due pending posts
	const { data: duePosts, error: fetchError } = await supabase
		.from('scheduled_posts')
		.select('id, type, caption, media_url, carousel_items, user_tags, account_id')
		.eq('status', 'pending')
		.lte('scheduled_for', new Date().toISOString());

	if (fetchError) {
		console.error('Failed to fetch due posts:', fetchError);
		return new Response('error', { status: 500 });
	}

	if (!duePosts || duePosts.length === 0) {
		return new Response('ok: no posts due', { status: 200 });
	}

	// Load accounts we need
	const accountIds = [...new Set(duePosts.map((p: ScheduledPost) => p.account_id))];
	const { data: accounts, error: acctError } = await supabase
		.from('social_accounts')
		.select('id, ig_business_id, access_token, location_id')
		.in('id', accountIds);

	if (acctError) {
		console.error('Failed to fetch accounts:', acctError);
		return new Response('error', { status: 500 });
	}

	const accountMap = new Map<string, SocialAccount>(
		(accounts ?? []).map((a: SocialAccount) => [a.id, a])
	);

	for (const post of duePosts as ScheduledPost[]) {
		const account = accountMap.get(post.account_id);
		if (!account) {
			console.error(`Account not found for post ${post.id}`);
			continue;
		}

		// Mark as publishing; guard against double-publish if two function instances overlap
		const { data: marked } = await supabase
			.from('scheduled_posts')
			.update({ status: 'publishing' })
			.eq('id', post.id)
			.eq('status', 'pending')
			.select('id');

		if (!marked || marked.length === 0) {
			console.log(`Post ${post.id} already claimed by another instance — skipping`);
			continue;
		}

		try {
			await publishToInstagram(account, post);

			await supabase
				.from('scheduled_posts')
				.update({ status: 'published', published_at: new Date().toISOString() })
				.eq('id', post.id);

			console.log(`Published post ${post.id}`);
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Unknown error';
			console.error(`Failed to publish post ${post.id}:`, message);

			await supabase
				.from('scheduled_posts')
				.update({ status: 'failed', error_message: message })
				.eq('id', post.id);
		}
	}

	return new Response(`ok: processed ${duePosts.length} post(s)`, { status: 200 });
});
