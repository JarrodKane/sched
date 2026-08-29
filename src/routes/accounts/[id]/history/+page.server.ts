import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { scheduledPosts } from '$lib/server/db/schema';
import { eq, and, inArray, desc, gte } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

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
