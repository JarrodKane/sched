import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users, shows, ticketSnapshots } from '$lib/server/db/schema';
import { eq, and, desc, gte } from 'drizzle-orm';
import { canAccessAccount } from '$lib/server/access';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) error(401, 'Unauthorized');

	const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
	if (!profile) error(401, 'Unauthorized');

	const allowed = await canAccessAccount(profile.id, params.id, profile.isAdmin);
	if (!allowed) error(403, 'Access denied');

	const accountShows = await db
		.select()
		.from(shows)
		.where(eq(shows.accountId, params.id))
		.orderBy(shows.name);

	const past = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);

	const showsWithLatest = await Promise.all(
		accountShows.map(async (show) => {
			const [latest] = await db
				.select()
				.from(ticketSnapshots)
				.where(and(eq(ticketSnapshots.showId, show.id), gte(ticketSnapshots.showDate, past)))
				.orderBy(desc(ticketSnapshots.showDate))
				.limit(1);
			return { ...show, latestSnapshot: latest ?? null };
		})
	);

	return { shows: showsWithLatest };
};
