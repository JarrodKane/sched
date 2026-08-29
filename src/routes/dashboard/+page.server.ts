import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { socialAccounts, userAccountAccess, scheduledPosts } from '$lib/server/db/schema';
import { eq, and, inArray, count } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { profile } = await parent();
	if (!profile) redirect(303, '/login');

	let accounts;
	if (profile.isAdmin) {
		accounts = await db
			.select({ id: socialAccounts.id, label: socialAccounts.label, platform: socialAccounts.platform })
			.from(socialAccounts)
			.orderBy(socialAccounts.label);
	} else {
		accounts = await db
			.select({ id: socialAccounts.id, label: socialAccounts.label, platform: socialAccounts.platform })
			.from(socialAccounts)
			.innerJoin(userAccountAccess, eq(userAccountAccess.accountId, socialAccounts.id))
			.where(eq(userAccountAccess.userId, profile.id))
			.orderBy(socialAccounts.label);
	}

	const accountIds = accounts.map((a) => a.id);
	const pendingCounts =
		accountIds.length > 0
			? await db
					.select({ accountId: scheduledPosts.accountId, pending: count() })
					.from(scheduledPosts)
					.where(
						and(
							inArray(scheduledPosts.status, ['pending', 'publishing']),
							inArray(scheduledPosts.accountId, accountIds)
						)
					)
					.groupBy(scheduledPosts.accountId)
			: [];

	const countMap = new Map(pendingCounts.map((r) => [r.accountId, r.pending]));

	return {
		accounts: accounts.map((a) => ({ ...a, pendingCount: countMap.get(a.id) ?? 0 }))
	};
};
