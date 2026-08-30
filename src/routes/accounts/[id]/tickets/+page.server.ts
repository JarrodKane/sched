import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { shows, ticketSnapshots } from '$lib/server/db/schema';
import { eq, inArray, asc, and, gte, lte, lt } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

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

export const load: PageServerLoad = async ({ params, url, parent, setHeaders }) => {
	const { canAccessTickets } = await parent();
	if (!canAccessTickets) error(403, 'Access denied');

	const today = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Australia/Melbourne',
		year: 'numeric', month: '2-digit', day: '2-digit'
	}).format(new Date());

	const weekParam = url.searchParams.get('week');
	const weekStart = weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)
		? weekParam
		: getMondayOf(today);
	const weekEnd = addDays(weekStart, 6);

	// Historical weeks won't change; current week data refreshes every ~5 min via cron
	const isCurrentWeek = weekStart === getMondayOf(today);
	setHeaders({ 'cache-control': isCurrentWeek ? 'private, max-age=60' : 'private, max-age=3600' });
	const prevWeek = addDays(weekStart, -7);
	const nextWeek = addDays(weekStart, 7);

	const accountShows = await db
		.select()
		.from(shows)
		.where(and(eq(shows.accountId, params.id), eq(shows.isActive, true)))
		.orderBy(shows.name);

	if (!accountShows.length) {
		return { showDates: [], today, weekStart, weekEnd, prevWeek, nextWeek, pastWeeks: [], historyPage: 1, hasOlderHistory: false };
	}

	const showIds = accountShows.map((s) => s.id);

	const PAGE_SIZE = 10;
	const historyPage = Math.max(1, parseInt(url.searchParams.get('hp') ?? '1', 10));
	// Page 1 = most recent 10 weeks; page 2 = the 10 before that; etc.
	const pageEnd = addDays(weekStart, -(historyPage - 1) * PAGE_SIZE * 7);
	const pageStart = addDays(pageEnd, -PAGE_SIZE * 7);

	const [weekSnapshots, pastSnapshots, olderCheck] = await Promise.all([
		db
			.select()
			.from(ticketSnapshots)
			.where(and(
				inArray(ticketSnapshots.showId, showIds),
				gte(ticketSnapshots.showDate, weekStart),
				lte(ticketSnapshots.showDate, weekEnd)
			))
			.orderBy(asc(ticketSnapshots.showDate)),
		db
			.select({ showDate: ticketSnapshots.showDate, totalSold: ticketSnapshots.totalSold, totalCapacity: ticketSnapshots.totalCapacity })
			.from(ticketSnapshots)
			.where(and(
				inArray(ticketSnapshots.showId, showIds),
				gte(ticketSnapshots.showDate, pageStart),
				lt(ticketSnapshots.showDate, pageEnd)
			))
			.orderBy(asc(ticketSnapshots.showDate)),
		db
			.select({ id: ticketSnapshots.id })
			.from(ticketSnapshots)
			.where(and(
				inArray(ticketSnapshots.showId, showIds),
				lt(ticketSnapshots.showDate, pageStart)
			))
			.limit(1)
	]);

	// One entry per (show, date) — multiple shows can share a date, one show can appear multiple dates
	const showDates = weekSnapshots.flatMap((snap) => {
		const show = accountShows.find((s) => s.id === snap.showId);
		return show ? [{ ...show, snapshot: snap }] : [];
	});

	// Group past snapshots by week for the history summary
	const weekMap = new Map<string, { totalSold: number; totalCapacity: number; showCount: number }>();
	for (const snap of pastSnapshots) {
		const wk = getMondayOf(snap.showDate);
		const existing = weekMap.get(wk) ?? { totalSold: 0, totalCapacity: 0, showCount: 0 };
		weekMap.set(wk, {
			totalSold: existing.totalSold + snap.totalSold,
			totalCapacity: existing.totalCapacity + snap.totalCapacity,
			showCount: existing.showCount + 1
		});
	}
	const pastWeeks = [...weekMap.entries()]
		.map(([wk, data]) => ({ weekStart: wk, ...data }))
		.sort((a, b) => b.weekStart.localeCompare(a.weekStart));

	return {
		showDates, today, weekStart, weekEnd, prevWeek, nextWeek,
		pastWeeks, historyPage, hasOlderHistory: olderCheck.length > 0
	};
};
