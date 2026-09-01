/**
 * +page.server.ts — /accounts/[id]/lineups
 * Week view for lineups. Loads all shows for the account plus any lineups in the
 * selected week (Mon–Sun), with active entry counts (excludes cancelled/support acts).
 *
 * Actions:
 *   openLineup — creates a lineup for a show + date if one doesn't exist yet,
 *                then redirects to the new lineup's detail page
 *
 * SvelteKit concepts:
 *   load()     — reads parent() for canAccessLineups; week is derived from the
 *                ?week= query param (ISO Monday date, defaults to current week)
 *   actions    — one named action; uses redirect() after a successful create
 *   redirect() — navigates to /accounts/[id]/lineups/[lineupId] after openLineup
 *   fail()     — returns 4xx if access denied or show not found
 */
import { error, fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { shows, lineups, lineupEntries, users } from '$lib/server/db/schema';
import { eq, asc, and, gte, lte, sql, count } from 'drizzle-orm';
import { getAccessRow } from '$lib/server/access';
import type { Actions, PageServerLoad } from './$types';

async function checkLineupAccess(locals: App.Locals, accountId: string) {
	const { user } = await locals.safeGetSession();
	if (!user) return false;
	const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
	if (!profile) return false;
	if (profile.isAdmin) return true;
	const row = await getAccessRow(profile.id, accountId);
	return row?.canAccessLineups ?? false;
}

function getMondayOf(dateStr: string): string {
	const d = new Date(dateStr + 'T12:00:00');
	const day = d.getDay();
	const daysBack = day === 0 ? 6 : day - 1;
	d.setDate(d.getDate() - daysBack);
	return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, n: number): string {
	const d = new Date(dateStr + 'T12:00:00');
	d.setDate(d.getDate() + n);
	return d.toISOString().slice(0, 10);
}

export const load: PageServerLoad = async ({ params, url, parent }) => {
	const { canAccessLineups } = await parent();
	if (!canAccessLineups) error(403, 'Access denied');

	const today = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Australia/Melbourne',
		year: 'numeric', month: '2-digit', day: '2-digit'
	}).format(new Date());

	const weekParam = url.searchParams.get('week');
	const weekStart = weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)
		? weekParam
		: getMondayOf(today);
	const weekEnd = addDays(weekStart, 6);
	const prevWeek = addDays(weekStart, -7);
	const nextWeek = addDays(weekStart, 7);

	const [accountShows, weekLineupsRaw] = await Promise.all([
		db.select().from(shows).where(eq(shows.accountId, params.id)).orderBy(sql`coalesce(${shows.scheduleDayOfWeek}, 7)`, asc(shows.name)),
		db
			.select({
				id: lineups.id,
				showId: lineups.showId,
				showDate: lineups.showDate,
				entryCount: sql<number>`count(case when ${lineupEntries.status} != 'cancelled' and ${lineupEntries.role} != 'support' then 1 end)::int`
			})
			.from(lineups)
			.leftJoin(lineupEntries, eq(lineupEntries.lineupId, lineups.id))
			.where(and(
				sql`${lineups.showId} in (select id from shows where account_id = ${params.id})`,
				gte(lineups.showDate, weekStart),
				lte(lineups.showDate, weekEnd)
			))
			.groupBy(lineups.id, lineups.showId, lineups.showDate)
			.orderBy(asc(lineups.showDate))
	]);

	return { shows: accountShows, weekLineups: weekLineupsRaw, weekStart, weekEnd, prevWeek, nextWeek, today };
};

export const actions: Actions = {
	openLineup: async ({ request, params, locals }) => {
		if (!await checkLineupAccess(locals, params.id)) return fail(403, { error: 'Access denied' });

		const form = await request.formData();
		const showId = (form.get('show_id') as string)?.trim();
		const showDate = (form.get('show_date') as string)?.trim();

		if (!showId || !showDate) return fail(400, { error: 'Show and date are required.' });

		const [show] = await db
			.select({ id: shows.id })
			.from(shows)
			.where(and(eq(shows.id, showId), eq(shows.accountId, params.id)))
			.limit(1);
		if (!show) return fail(404, { error: 'Show not found.' });

		const [existing] = await db
			.select({ id: lineups.id })
			.from(lineups)
			.where(and(eq(lineups.showId, showId), eq(lineups.showDate, showDate)))
			.limit(1);

		if (existing) redirect(303, `/accounts/${params.id}/lineups/${existing.id}`);

		const [created] = await db
			.insert(lineups)
			.values({ showId, showDate })
			.returning({ id: lineups.id });

		redirect(303, `/accounts/${params.id}/lineups/${created.id}`);
	}
};
