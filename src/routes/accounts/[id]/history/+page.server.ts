/**
 * +page.server.ts — /accounts/[id]/history
 * Loads the last 30 days of published, failed, and cancelled posts for one account.
 * Only accessible to users with social access.
 *
 * Actions:
 *   retry   — re-queues a failed post (resets status to 'pending')
 *
 * SvelteKit concepts:
 *   load()    — reads parent() for accountMeta + canAccessSocial; queries Drizzle
 *   actions   — one named action (retry); re-checks access before mutating
 *   fail()    — returns 4xx with an error string
 *   parent()  — inherits canAccessSocial from the account layout load
 */
import { redirect, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users, scheduledPosts } from '$lib/server/db/schema';
import { eq, and, inArray, desc, gte } from 'drizzle-orm';
import { canModifyPost } from '$lib/server/access';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, parent }) => {
	// Layout (+layout.server.ts) already validated access and fetched accountMeta.
	const { profile, accountMeta } = await parent();
	if (!profile) redirect(303, '/login');

	const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

	const posts = await db
		.select()
		.from(scheduledPosts)
		.where(
			and(
				eq(scheduledPosts.accountId, params.id),
				inArray(scheduledPosts.status, ['published', 'failed', 'cancelled']),
				gte(scheduledPosts.scheduledFor, thirtyDaysAgo)
			)
		)
		.orderBy(desc(scheduledPosts.scheduledFor))
		.limit(100);

	return { account: accountMeta, posts };
};

export const actions: Actions = {
	retry: async ({ request, locals }) => {
		const { user } = await locals.safeGetSession();
		if (!user) redirect(303, '/login');

		const [profileRow] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
		if (!profileRow) redirect(303, '/login');

		const form = await request.formData();
		const postId = form.get('post_id') as string;
		if (!postId) return fail(400, { error: 'Missing post ID.' });

		const allowed = await canModifyPost(profileRow.id, postId, profileRow.isAdmin);
		if (!allowed) return fail(403, { error: 'Access denied' });

		const [post] = await db.select().from(scheduledPosts).where(eq(scheduledPosts.id, postId)).limit(1);
		if (!post || post.status !== 'failed') return fail(400, { error: 'Only failed posts can be retried.' });

		await db
			.update(scheduledPosts)
			.set({ status: 'pending', errorMessage: null, scheduledFor: new Date() })
			.where(eq(scheduledPosts.id, postId));

		return { retried: true };
	}
};
