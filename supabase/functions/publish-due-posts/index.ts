// Supabase Edge Function — runs every 60 seconds via pg_cron
// Picks up pending posts whose scheduled_for <= now() and publishes them to Instagram.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Instagram Business Login tokens are Instagram-scoped — use graph.instagram.com,
// not graph.facebook.com (which requires Facebook-scoped tokens).
const BASE_URL = 'https://graph.instagram.com';

interface ScheduledPost {
	id: string;
	type: 'feed' | 'story';
	caption: string | null;
	media_url: string;
	account_id: string;
}

interface SocialAccount {
	id: string;
	ig_business_id: string;
	access_token: string;
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

async function publishToInstagram(
	account: SocialAccount,
	post: ScheduledPost
): Promise<string> {
	const createParams = new URLSearchParams({
		access_token: account.access_token,
		image_url: post.media_url
	});
	if (post.type === 'story') {
		createParams.set('media_type', 'STORIES');
	} else if (post.caption) {
		createParams.set('caption', post.caption);
	}

	const createRes = await fetch(`${BASE_URL}/${account.ig_business_id}/media`, {
		method: 'POST',
		body: createParams
	});
	const createData = await createRes.json();
	if (!createData.id) {
		throw new Error(createData.error?.message ?? 'Failed to create Instagram media container');
	}

	// Wait for Instagram to finish processing the image before publishing
	await waitForContainerReady(createData.id, account.access_token);

	const publishParams = new URLSearchParams({
		creation_id: createData.id,
		access_token: account.access_token
	});
	const publishRes = await fetch(`${BASE_URL}/${account.ig_business_id}/media_publish`, {
		method: 'POST',
		body: publishParams
	});
	const publishData = await publishRes.json();
	if (!publishData.id) {
		throw new Error(publishData.error?.message ?? 'Failed to publish Instagram media');
	}

	return publishData.id as string;
}

Deno.serve(async () => {
	const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
	const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
	const supabase = createClient(supabaseUrl, serviceRoleKey);

	// Fetch due pending posts
	const { data: duePosts, error: fetchError } = await supabase
		.from('scheduled_posts')
		.select('id, type, caption, media_url, account_id')
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
		.select('id, ig_business_id, access_token')
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

		// Mark as publishing to prevent double-publish if function runs again before this finishes
		await supabase
			.from('scheduled_posts')
			.update({ status: 'publishing' })
			.eq('id', post.id)
			.eq('status', 'pending'); // guard: only update if still pending

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
