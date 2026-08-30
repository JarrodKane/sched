import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users, shows, ticketSnapshots } from '$lib/server/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { canAccessAccount } from '$lib/server/access';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) error(401, 'Unauthorized');

	const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
	if (!profile) error(401, 'Unauthorized');

	const allowed = await canAccessAccount(profile.id, params.id, profile.isAdmin);
	if (!allowed) error(403, 'Access denied');

	const [show] = await db
		.select()
		.from(shows)
		.where(and(eq(shows.id, params.showId), eq(shows.accountId, params.id)))
		.limit(1);

	if (!show) error(404, 'Show not found');

	// Load all snapshots for this show so we know what dates are available
	const allSnapshots = await db
		.select()
		.from(ticketSnapshots)
		.where(eq(ticketSnapshots.showId, show.id))
		.orderBy(asc(ticketSnapshots.showDate));

	const availableDates = allSnapshots.map((s) => s.showDate);

	// Determine which date to show: ?date= param, or the most recent
	const today = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Australia/Melbourne',
		year: 'numeric', month: '2-digit', day: '2-digit'
	}).format(new Date());

	let selectedDate = url.searchParams.get('date') ?? '';
	if (!selectedDate || !availableDates.includes(selectedDate)) {
		// Pick the closest available date to today
		const upcoming = availableDates.filter((d) => d >= today);
		const past = availableDates.filter((d) => d < today);
		selectedDate = upcoming[0] ?? past[past.length - 1] ?? '';
	}

	const currentIndex = availableDates.indexOf(selectedDate);
	const prevDate = currentIndex > 0 ? availableDates[currentIndex - 1] : null;
	const nextDate = currentIndex < availableDates.length - 1 ? availableDates[currentIndex + 1] : null;

	const snapshot = allSnapshots.find((s) => s.showDate === selectedDate) ?? null;

	return {
		show,
		snapshot,
		selectedDate,
		availableDates,
		prevDate,
		nextDate
	};
};
