import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { shows, lineups, lineupEntries } from '$lib/server/db/schema';
import { eq, asc, and, gte, lte, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url, parent }) => {
	const { canAccessLineups } = await parent();
	if (!canAccessLineups) error(403, 'Access denied');

	const today = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Australia/Melbourne',
		year: 'numeric', month: '2-digit', day: '2-digit'
	}).format(new Date());

	const monthParam = url.searchParams.get('month');
	// If today is Sunday (end of week), default to next week's month so upcoming lineups are visible
	let defaultMonth = today.slice(0, 7);
	if (!monthParam) {
		const todayDate = new Date(today + 'T12:00:00');
		if (todayDate.getDay() === 0) {
			const tomorrow = new Date(todayDate);
			tomorrow.setDate(todayDate.getDate() + 1);
			defaultMonth = tomorrow.toISOString().slice(0, 7);
		}
	}
	const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : defaultMonth;

	const [y, m] = month.split('-').map(Number);
	const monthStart = `${month}-01`;
	// Last day: day 0 of next month = last day of current month (JS Date months are 0-indexed)
	const lastDay = new Date(y, m, 0).getDate();
	const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`;

	const prevMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
	const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;

	const [accountShows, monthLineups] = await Promise.all([
		db
			.select({ id: shows.id, name: shows.name, actsPerShow: shows.actsPerShow })
			.from(shows)
			.where(eq(shows.accountId, params.id))
			.orderBy(sql`coalesce(${shows.scheduleDayOfWeek}, 7)`, asc(shows.name)),
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
				gte(lineups.showDate, monthStart),
				lte(lineups.showDate, monthEnd)
			))
			.groupBy(lineups.id, lineups.showId, lineups.showDate)
			.orderBy(asc(lineups.showDate))
	]);

	return { shows: accountShows, monthLineups, month, monthStart, monthEnd, prevMonth, nextMonth, today };
};
