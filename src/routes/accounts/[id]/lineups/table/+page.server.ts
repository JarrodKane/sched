/**
 * +page.server.ts — /accounts/[id]/lineups/table
 * Paginated table view of all lineups for a show (15 per page). Loads each
 * lineup's full entry list in one batch query (in-memory join) so every LineupCard
 * can render without additional round trips.
 *
 * Actions:
 *   createLineup  — create a new lineup for a given show + date
 *   removeEntry   — delete an entry (verifies ownership via show → account chain)
 *   updateEntry   — change an entry's status, role, or notes
 *   addEntry      — add a new act (position-based sort order; MC pinned first)
 *   moveEntry     — swap sort order with an adjacent non-MC entry (up/down)
 *
 * SvelteKit concepts:
 *   load()    — reads parent() for canAccessLineups; ?show= selects the active show,
 *               ?page= controls pagination
 *   actions   — five named actions; each re-verifies access before mutating
 *   fail()    — returns 4xx with an error string the page reads as createError
 */
import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { shows, lineups, lineupEntries, people, users } from '$lib/server/db/schema';
import { eq, asc, desc, inArray, sql, and, ne, gt } from 'drizzle-orm';
import { canAccessAsset } from '$lib/server/access';
import type { PageServerLoad, Actions } from './$types';

async function checkLineupAccess(locals: App.Locals, accountId: string) {
	const { user } = await locals.safeGetSession();
	if (!user) return false;
	const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
	if (!profile) return false;
	return canAccessAsset(profile.id, accountId, profile.isAdmin, 'lineups');
}

const PAGE_SIZE = 15;

export const load: PageServerLoad = async ({ params, url, parent }) => {
	const { canAccessLineups } = await parent();
	if (!canAccessLineups) error(403, 'Access denied');

	const now = new Date();
	const today = now.toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });

	const accountShows = await db
		.select({ id: shows.id, name: shows.name, actsPerShow: shows.actsPerShow, scheduleType: shows.scheduleType, scheduleDayOfWeek: shows.scheduleDayOfWeek, canvaTemplateId: shows.canvaTemplateId })
		.from(shows)
		.where(eq(shows.accountId, params.id))
		.orderBy(sql`coalesce(${shows.scheduleDayOfWeek}, 7)`, asc(shows.name));

	if (accountShows.length === 0) {
		return { shows: [], selectedShow: null, tableLineups: [], page: 1, totalPages: 1, today };
	}

	const showParam = url.searchParams.get('show');
	const selectedShow = (showParam ? accountShows.find((s) => s.id === showParam) : undefined) ?? accountShows[0];

	const dateParam = url.searchParams.get('date');
	const focusDate = (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) ? dateParam : null;

	const pageParam = url.searchParams.get('page');
	let page = Math.max(1, parseInt(pageParam ?? '1') || 1);

	if (focusDate) {
		const [{ newerCount }] = await db
			.select({ newerCount: sql<number>`count(*)::int` })
			.from(lineups)
			.where(and(eq(lineups.showId, selectedShow.id), gt(lineups.showDate, focusDate)));
		page = Math.floor((newerCount as number) / PAGE_SIZE) + 1;
	}

	const [{ total }] = await db
		.select({ total: sql<number>`count(*)::int` })
		.from(lineups)
		.where(eq(lineups.showId, selectedShow.id));

	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
	const safePage = Math.min(page, totalPages);

	const showLineups = await db
		.select({ id: lineups.id, showDate: lineups.showDate, notes: lineups.notes })
		.from(lineups)
		.where(eq(lineups.showId, selectedShow.id))
		.orderBy(desc(lineups.showDate))
		.limit(PAGE_SIZE)
		.offset((safePage - 1) * PAGE_SIZE);

	type Entry = {
		id: string;
		lineupId: string;
		name: string;
		role: string;
		status: string;
		notes: string | null;
		instagram: string | null;
		photoUrl: string | null;
	};
	type TableLineup = { id: string; showDate: string; notes: string | null; entries: Entry[] };
	let tableLineups: TableLineup[] = [];

	if (showLineups.length > 0) {
		const lineupIds = showLineups.map((l) => l.id);
		const allEntries = await db
			.select({
				id: lineupEntries.id,
				lineupId: lineupEntries.lineupId,
				name: lineupEntries.name,
				role: lineupEntries.role,
				status: lineupEntries.status,
				notes: lineupEntries.notes,
				instagram: people.instagram,
				photoUrl: people.photoUrl
			})
			.from(lineupEntries)
			.leftJoin(people, eq(lineupEntries.personId, people.id))
			.where(inArray(lineupEntries.lineupId, lineupIds))
			.orderBy(sql`(${lineupEntries.role} = 'mc') DESC`, asc(lineupEntries.sortOrder), asc(lineupEntries.createdAt));

		tableLineups = showLineups.map((lineup) => ({
			...lineup,
			entries: allEntries.filter((e) => e.lineupId === lineup.id)
		}));
	}

	return { shows: accountShows, selectedShow, tableLineups, page: safePage, totalPages, today, focusDate };
};

export const actions: Actions = {
	createLineup: async ({ request, params, locals }) => {
		if (!await checkLineupAccess(locals, params.id)) return fail(403, { error: 'Access denied' });
		const fd = await request.formData();
		const showId = fd.get('show_id') as string;
		const showDate = fd.get('show_date') as string;

		if (!showId || !showDate || !/^\d{4}-\d{2}-\d{2}$/.test(showDate)) {
			return fail(400, { error: 'Invalid date' });
		}

		const [show] = await db
			.select({ id: shows.id })
			.from(shows)
			.where(and(eq(shows.id, showId), eq(shows.accountId, params.id)));

		if (!show) return fail(403, { error: 'Access denied' });

		try {
			await db.insert(lineups).values({ showId, showDate });
		} catch {
			return fail(400, { error: 'A lineup already exists for that date' });
		}

		return { success: true };
	},

	removeEntry: async ({ request, params, locals }) => {
		if (!await checkLineupAccess(locals, params.id)) return fail(403, { error: 'Access denied' });
		const fd = await request.formData();
		const entryId = fd.get('entry_id') as string;

		const [verified] = await db
			.select({ id: lineupEntries.id })
			.from(lineupEntries)
			.innerJoin(lineups, eq(lineupEntries.lineupId, lineups.id))
			.innerJoin(shows, and(eq(lineups.showId, shows.id), eq(shows.accountId, params.id)))
			.where(eq(lineupEntries.id, entryId));

		if (!verified) return fail(403, { error: 'Access denied' });

		await db.delete(lineupEntries).where(eq(lineupEntries.id, entryId));
		return { success: true };
	},

	updateEntry: async ({ request, params, locals }) => {
		if (!await checkLineupAccess(locals, params.id)) return fail(403, { error: 'Access denied' });
		const fd = await request.formData();
		const entryId = fd.get('entry_id') as string;
		const field = fd.get('field') as string;
		const value = fd.get('value') as string;

		const [verified] = await db
			.select({ id: lineupEntries.id })
			.from(lineupEntries)
			.innerJoin(lineups, eq(lineupEntries.lineupId, lineups.id))
			.innerJoin(shows, and(eq(lineups.showId, shows.id), eq(shows.accountId, params.id)))
			.where(eq(lineupEntries.id, entryId));

		if (!verified) return fail(403, { error: 'Access denied' });

		if (field === 'status' && ['to_contact', 'booked', 'cancelled'].includes(value)) {
			await db.update(lineupEntries).set({ status: value }).where(eq(lineupEntries.id, entryId));
		} else if (field === 'role' && ['act', 'headline', 'mc', 'support', 'host'].includes(value)) {
			await db.update(lineupEntries).set({ role: value }).where(eq(lineupEntries.id, entryId));
		} else if (field === 'notes') {
			await db.update(lineupEntries).set({ notes: value || null }).where(eq(lineupEntries.id, entryId));
		}

		return { success: true };
	},

	addEntry: async ({ request, params, locals }) => {
		if (!await checkLineupAccess(locals, params.id)) return fail(403, { error: 'Access denied' });
		const fd = await request.formData();
		const lineupId = fd.get('lineup_id') as string;
		const name = ((fd.get('name') as string) ?? '').trim();
		const role = (fd.get('role') as string) || 'act';
		const status = (fd.get('status') as string) || 'to_contact';
		const personId = (fd.get('person_id') as string) || null;

		if (!name) return fail(400, { error: 'Name required' });

		const [verified] = await db
			.select({ id: lineups.id })
			.from(lineups)
			.innerJoin(shows, and(eq(lineups.showId, shows.id), eq(shows.accountId, params.id)))
			.where(eq(lineups.id, lineupId));

		if (!verified) return fail(403, { error: 'Access denied' });

		const VALID_ROLES = ['act', 'headline', 'mc', 'support', 'host'];
		const VALID_STATUSES = ['to_contact', 'booked', 'cancelled'];
		const roleToUse = VALID_ROLES.includes(role) ? role : 'act';
		const statusToUse = VALID_STATUSES.includes(status) ? status : 'to_contact';

		let sortOrder: number;
		if (roleToUse === 'mc') {
			const [minOrder] = await db
				.select({ min: sql<number>`coalesce(min(sort_order), 10)` })
				.from(lineupEntries)
				.where(eq(lineupEntries.lineupId, lineupId));
			sortOrder = (minOrder?.min ?? 10) - 10;
		} else {
			const [maxOrder] = await db
				.select({ max: sql<number>`coalesce(max(sort_order), -10)` })
				.from(lineupEntries)
				.where(eq(lineupEntries.lineupId, lineupId));
			sortOrder = (maxOrder?.max ?? 0) + 10;
		}

		await db.insert(lineupEntries).values({
			lineupId,
			personId: personId || null,
			name,
			role: roleToUse,
			status: statusToUse,
			sortOrder
		});

		return { success: true };
	},

	moveEntry: async ({ request, params, locals }) => {
		if (!await checkLineupAccess(locals, params.id)) return fail(403, { error: 'Access denied' });
		const fd = await request.formData();
		const entryId = fd.get('entry_id') as string;
		const lineupId = fd.get('lineup_id') as string;
		const direction = fd.get('direction') as string;

		const [verified] = await db
			.select({ id: lineups.id })
			.from(lineups)
			.innerJoin(shows, and(eq(lineups.showId, shows.id), eq(shows.accountId, params.id)))
			.where(eq(lineups.id, lineupId));

		if (!verified) return fail(403, { error: 'Access denied' });

		// Only swap among non-MC entries — MCs are always pinned first by the load query
		const siblings = await db
			.select({ id: lineupEntries.id, sortOrder: lineupEntries.sortOrder })
			.from(lineupEntries)
			.where(and(eq(lineupEntries.lineupId, lineupId), ne(lineupEntries.role, 'mc')))
			.orderBy(asc(lineupEntries.sortOrder), asc(lineupEntries.createdAt));

		const currentIdx = siblings.findIndex((s) => s.id === entryId);
		if (currentIdx === -1) return { success: true };

		const targetIdx = direction === 'up' ? currentIdx - 1 : currentIdx + 1;
		if (targetIdx < 0 || targetIdx >= siblings.length) return { success: true };

		const reordered = [...siblings];
		[reordered[currentIdx], reordered[targetIdx]] = [reordered[targetIdx], reordered[currentIdx]];

		await Promise.all(
			reordered.map((s, idx) =>
				db.update(lineupEntries).set({ sortOrder: idx * 10 }).where(eq(lineupEntries.id, s.id))
			)
		);

		return { success: true };
	}
};
