import { error, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { socialAccounts, scheduledPosts } from '$lib/server/db/schema';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { canAccessAccount } from '$lib/server/access';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, parent }) => {
	const { profile } = await parent();
	if (!profile) redirect(303, '/login');

	const allowed = await canAccessAccount(profile.id, params.id, profile.isAdmin);
	if (!allowed) error(403, 'Access denied');

	const [account] = await db
		.select()
		.from(socialAccounts)
		.where(eq(socialAccounts.id, params.id))
		.limit(1);
	if (!account) error(404, 'Account not found');

	const posts = await db
		.select()
		.from(scheduledPosts)
		.where(
			and(
				eq(scheduledPosts.accountId, params.id),
				inArray(scheduledPosts.status, ['published', 'failed'])
			)
		)
		.orderBy(desc(scheduledPosts.scheduledFor))
		.limit(100);

	return { account, posts };
};
