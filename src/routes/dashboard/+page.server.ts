/**
 * +page.server.ts — /dashboard
 * Dashboard load. Fetches accounts the logged-in user has access to, plus per-account:
 *   - pending post count + next upcoming post time
 *   - next upcoming lineup (date, show name, fill count vs target)
 *
 * Admins see all accounts; non-admins only see accounts they have a
 * user_account_access row for.
 */
import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { socialAccounts, userAccountAccess, scheduledPosts, shows, lineups, lineupEntries } from '$lib/server/db/schema';
import { eq, and, inArray, count, sql, asc, gte, gt } from 'drizzle-orm';
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
	const now = new Date();
	const today = now.toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });

	const [pendingCounts, nextPostResults, upcomingLineupRows] = await Promise.all([
		accountIds.length > 0
			? db
					.select({ accountId: scheduledPosts.accountId, pending: count() })
					.from(scheduledPosts)
					.where(and(
						inArray(scheduledPosts.status, ['pending', 'publishing']),
						inArray(scheduledPosts.accountId, accountIds)
					))
					.groupBy(scheduledPosts.accountId)
			: [],
		accountIds.length > 0
			? db
					.select({
						accountId: scheduledPosts.accountId,
						nextAt: sql<string>`min(${scheduledPosts.scheduledFor})`
					})
					.from(scheduledPosts)
					.where(and(
						eq(scheduledPosts.status, 'pending'),
						inArray(scheduledPosts.accountId, accountIds),
						gt(scheduledPosts.scheduledFor, now)
					))
					.groupBy(scheduledPosts.accountId)
			: [],
		accountIds.length > 0
			? db
					.select({
						accountId: shows.accountId,
						showName: shows.name,
						lineupId: lineups.id,
						showDate: lineups.showDate,
						actsPerShow: shows.actsPerShow
					})
					.from(lineups)
					.innerJoin(shows, eq(lineups.showId, shows.id))
					.where(and(inArray(shows.accountId, accountIds), gte(lineups.showDate, today)))
					.orderBy(asc(lineups.showDate))
			: []
	]);

	const countMap = new Map(pendingCounts.map((r) => [r.accountId, r.pending]));
	const nextPostMap = new Map(nextPostResults.map((r) => [r.accountId, r.nextAt]));

	// Take the nearest upcoming lineup per account
	const nextLineupMap = new Map<string, (typeof upcomingLineupRows)[number]>();
	for (const row of upcomingLineupRows) {
		if (!nextLineupMap.has(row.accountId)) nextLineupMap.set(row.accountId, row);
	}

	// Entry counts for those lineups
	const nextLineupIds = [...nextLineupMap.values()].map((l) => l.lineupId);
	const entryStats =
		nextLineupIds.length > 0
			? await db
					.select({
						lineupId: lineupEntries.lineupId,
						total: sql<number>`count(*)::int`
					})
					.from(lineupEntries)
					.where(inArray(lineupEntries.lineupId, nextLineupIds))
					.groupBy(lineupEntries.lineupId)
			: [];
	const entryStatsMap = new Map(entryStats.map((e) => [e.lineupId, e]));

	return {
		accounts: accounts.map((a) => {
			const l = nextLineupMap.get(a.id);
			const stats = l ? (entryStatsMap.get(l.lineupId) ?? null) : null;
			return {
				...a,
				pendingCount: countMap.get(a.id) ?? 0,
				nextPostAt: nextPostMap.get(a.id) ?? null,
				nextLineup: l
					? {
							showDate: l.showDate,
							showName: l.showName,
							lineupId: l.lineupId,
							actsPerShow: l.actsPerShow,
							totalEntries: stats?.total ?? 0
						}
					: null
			};
		})
	};
};
