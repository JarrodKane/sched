import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { shows, ticketSnapshots } from '$lib/server/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url, parent, setHeaders }) => {
	const { canAccessTickets } = await parent();
	if (!canAccessTickets) error(403, 'Access denied');

	const today = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Australia/Melbourne',
		year: 'numeric', month: '2-digit', day: '2-digit'
	}).format(new Date());

	// Fetch show + available dates+sold in parallel (no JSONB — lightweight)
	const [showResult, dateRows] = await Promise.all([
		db
			.select()
			.from(shows)
			.where(and(eq(shows.id, params.showId), eq(shows.accountId, params.id)))
			.limit(1),
		db
			.select({ showDate: ticketSnapshots.showDate, totalSold: ticketSnapshots.totalSold })
			.from(ticketSnapshots)
			.where(eq(ticketSnapshots.showId, params.showId))
			.orderBy(asc(ticketSnapshots.showDate))
	]);

	const [show] = showResult;
	if (!show) error(404, 'Show not found');

	const availableDates = dateRows.map((r) => r.showDate);

	// Stats from past dates only (excludes today and future — counts are still changing)
	const pastRows = dateRows.filter((r) => r.showDate < today);
	const recentRows = pastRows.slice(-4);
	// Trend is only meaningful when recentRows is a true subset of pastRows
	const hasEnoughForTrend = pastRows.length > recentRows.length;
	const stats = pastRows.length > 0 ? {
		count: pastRows.length,
		avg: Math.round(pastRows.reduce((a, r) => a + r.totalSold, 0) / pastRows.length),
		best: Math.max(...pastRows.map((r) => r.totalSold)),
		worst: Math.min(...pastRows.map((r) => r.totalSold)),
		recentAvg: hasEnoughForTrend
			? Math.round(recentRows.reduce((a, r) => a + r.totalSold, 0) / recentRows.length)
			: null,
		recentCount: recentRows.length
	} : null;

	// Determine which date to show: ?date= param, or next upcoming, or most recent past
	let selectedDate = url.searchParams.get('date') ?? '';
	if (!selectedDate || !availableDates.includes(selectedDate)) {
		const upcoming = availableDates.filter((d) => d >= today);
		const past = availableDates.filter((d) => d < today);
		selectedDate = upcoming[0] ?? past[past.length - 1] ?? '';
	}

	const currentIndex = availableDates.indexOf(selectedDate);
	const prevDate = currentIndex > 0 ? availableDates[currentIndex - 1] : null;
	const nextDate = currentIndex < availableDates.length - 1 ? availableDates[currentIndex + 1] : null;

	// Only fetch the full snapshot (with JSONB) for the selected date
	const [snapshot] = selectedDate
		? await db
				.select()
				.from(ticketSnapshots)
				.where(and(eq(ticketSnapshots.showId, show.id), eq(ticketSnapshots.showDate, selectedDate)))
				.limit(1)
		: [];

	// Past dates are final; today/future are live
	setHeaders({
		'cache-control': selectedDate && selectedDate < today ? 'private, max-age=3600' : 'private, max-age=60'
	});

	return {
		show,
		snapshot: snapshot ?? null,
		selectedDate,
		availableDates,
		prevDate,
		nextDate,
		stats
	};
};
