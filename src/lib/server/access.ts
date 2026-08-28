import { db } from '$lib/server/db';
import { userAccountAccess, scheduledPosts } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

/** Returns true if the user has access to the given account (or is an admin). */
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
