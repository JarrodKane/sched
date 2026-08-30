import { db } from '$lib/server/db';
import { userAccountAccess, scheduledPosts } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

export type Asset = 'social' | 'tickets' | 'lineups';

/** Returns true if the user has any access to the given account (or is an admin). */
export async function canAccessAccount(
	userId: string,
	accountId: string,
	isAdmin: boolean
): Promise<boolean> {
	if (isAdmin) return true;
	const rows = await db
		.select()
		.from(userAccountAccess)
		.where(and(eq(userAccountAccess.userId, userId), eq(userAccountAccess.accountId, accountId)))
		.limit(1);
	return rows.length > 0;
}

/**
 * Returns true if the user has access to the account AND the specific asset.
 * Admins bypass all checks.
 */
export async function canAccessAsset(
	userId: string,
	accountId: string,
	isAdmin: boolean,
	asset: Asset
): Promise<boolean> {
	if (isAdmin) return true;
	const [row] = await db
		.select()
		.from(userAccountAccess)
		.where(and(eq(userAccountAccess.userId, userId), eq(userAccountAccess.accountId, accountId)))
		.limit(1);
	if (!row) return false;
	if (asset === 'social') return row.canAccessSocial;
	if (asset === 'tickets') return row.canAccessTickets;
	if (asset === 'lineups') return row.canAccessLineups;
	return false;
}

/**
 * Returns the full access row for the user+account, or null if no access.
 * Use this in layout loads to get asset flags in one query.
 */
export async function getAccessRow(userId: string, accountId: string) {
	const [row] = await db
		.select()
		.from(userAccountAccess)
		.where(and(eq(userAccountAccess.userId, userId), eq(userAccountAccess.accountId, accountId)))
		.limit(1);
	return row ?? null;
}

/** Returns true if the user can cancel/modify the given post. */
export async function canModifyPost(
	userId: string,
	postId: string,
	isAdmin: boolean
): Promise<boolean> {
	if (isAdmin) return true;
	const rows = await db
		.select()
		.from(scheduledPosts)
		.where(and(eq(scheduledPosts.id, postId), eq(scheduledPosts.createdBy, userId)))
		.limit(1);
	return rows.length > 0;
}
