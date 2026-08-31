import { error, fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { lineups, lineupEntries, shows, people, users } from '$lib/server/db/schema';
import { eq, asc, gte, and, sql } from 'drizzle-orm';
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

export const load: PageServerLoad = async ({ params, parent }) => {
	const { canAccessLineups } = await parent();
	if (!canAccessLineups) error(403, 'Access denied');

	const [lineup] = await db
		.select({
			id: lineups.id,
			showId: lineups.showId,
			showDate: lineups.showDate,
			notes: lineups.notes
		})
		.from(lineups)
		.where(eq(lineups.id, params.lineupId))
		.limit(1);
	if (!lineup) error(404, 'Lineup not found');

	const [show] = await db
		.select({ id: shows.id, name: shows.name, actsPerShow: shows.actsPerShow, accountId: shows.accountId })
		.from(shows)
		.where(eq(shows.id, lineup.showId))
		.limit(1);
	if (!show || show.accountId !== params.id) error(404, 'Lineup not found');

	const entries = await db
		.select({
			id: lineupEntries.id,
			lineupId: lineupEntries.lineupId,
			personId: lineupEntries.personId,
			name: lineupEntries.name,
			role: lineupEntries.role,
			status: lineupEntries.status,
			notes: lineupEntries.notes,
			sortOrder: lineupEntries.sortOrder,
			createdAt: lineupEntries.createdAt,
			instagram: people.instagram
		})
		.from(lineupEntries)
		.leftJoin(people, eq(lineupEntries.personId, people.id))
		.where(eq(lineupEntries.lineupId, params.lineupId))
		.orderBy(asc(lineupEntries.sortOrder), asc(lineupEntries.createdAt));

	return { lineup, show, entries };
};

export const actions: Actions = {
	addEntry: async ({ request, params, locals }) => {
		if (!await checkLineupAccess(locals, params.id)) return fail(403, { error: 'Access denied' });

		const form = await request.formData();
		const lineupId = params.lineupId;
		const name = (form.get('name') as string)?.trim();
		const personId = (form.get('person_id') as string)?.trim() || null;
		const role = (form.get('role') as string)?.trim() || 'act';
		const status = (form.get('status') as string)?.trim() || 'to_contact';
		const notesVal = (form.get('notes') as string)?.trim() || null;
		const positionStr = (form.get('position') as string)?.trim();
		const position = positionStr ? parseInt(positionStr, 10) - 1 : null; // convert to 0-based

		if (!name) return fail(400, { error: 'Name is required.' });

		// Get all current entries to determine sort order
		const existing = await db
			.select({ sortOrder: lineupEntries.sortOrder })
			.from(lineupEntries)
			.where(eq(lineupEntries.lineupId, lineupId))
			.orderBy(asc(lineupEntries.sortOrder));

		let sortOrder: number;
		if (position !== null && !isNaN(position) && position >= 0 && position < existing.length) {
			// Shift entries at or after the target position to make room
			await db
				.update(lineupEntries)
				.set({ sortOrder: sql`${lineupEntries.sortOrder} + 1` })
				.where(and(
					eq(lineupEntries.lineupId, lineupId),
					gte(lineupEntries.sortOrder, position)
				));
			sortOrder = position;
		} else {
			const maxOrder = existing.length > 0 ? Math.max(...existing.map((e) => e.sortOrder)) : -1;
			sortOrder = maxOrder + 1;
		}

		await db.insert(lineupEntries).values({
			lineupId,
			personId,
			name,
			role,
			status,
			notes: notesVal,
			sortOrder
		});
		return { added: true };
	},

	updateEntry: async ({ request, params, locals }) => {
		if (!await checkLineupAccess(locals, params.id)) return fail(403, { error: 'Access denied' });

		const form = await request.formData();
		const id = (form.get('id') as string)?.trim();
		const role = (form.get('role') as string)?.trim() || 'act';
		const status = (form.get('status') as string)?.trim() || 'to_contact';
		const notesVal = (form.get('notes') as string)?.trim() || null;
		const nameRaw = form.get('name') as string | null;
		const name = nameRaw !== null ? nameRaw.trim() : null;

		if (!id) return fail(400, { error: 'Missing entry ID.' });
		if (name !== null && name.length === 0) return fail(400, { error: 'Name cannot be blank.' });

		const setValues: Record<string, unknown> = { role, status, notes: notesVal };
		if (name !== null) setValues.name = name;

		await db
			.update(lineupEntries)
			.set(setValues)
			.where(eq(lineupEntries.id, id));

		return { updated: true };
	},

	removeEntry: async ({ request, params, locals }) => {
		if (!await checkLineupAccess(locals, params.id)) return fail(403, { error: 'Access denied' });

		const form = await request.formData();
		const id = (form.get('id') as string)?.trim();
		if (!id) return fail(400, { error: 'Missing entry ID.' });

		await db.delete(lineupEntries).where(eq(lineupEntries.id, id));
		return { removed: true };
	},

	moveEntry: async ({ request, params, locals }) => {
		if (!await checkLineupAccess(locals, params.id)) return fail(403, { error: 'Access denied' });

		const form = await request.formData();
		const id = (form.get('id') as string)?.trim();
		const direction = form.get('direction') as 'up' | 'down';
		if (!id || !direction) return fail(400, { error: 'Invalid request.' });

		const all = await db
			.select({ id: lineupEntries.id, sortOrder: lineupEntries.sortOrder })
			.from(lineupEntries)
			.where(eq(lineupEntries.lineupId, params.lineupId))
			.orderBy(asc(lineupEntries.sortOrder));

		const idx = all.findIndex((e) => e.id === id);
		if (idx === -1) return fail(404, { error: 'Entry not found.' });

		const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
		if (swapIdx < 0 || swapIdx >= all.length) return {};

		const a = all[idx];
		const b = all[swapIdx];
		await db.update(lineupEntries).set({ sortOrder: b.sortOrder }).where(eq(lineupEntries.id, a.id));
		await db.update(lineupEntries).set({ sortOrder: a.sortOrder }).where(eq(lineupEntries.id, b.id));

		return { moved: true };
	},

	updateLineupNotes: async ({ request, params, locals }) => {
		if (!await checkLineupAccess(locals, params.id)) return fail(403, { error: 'Access denied' });

		const form = await request.formData();
		const notes = (form.get('notes') as string)?.trim() || null;

		await db
			.update(lineups)
			.set({ notes })
			.where(eq(lineups.id, params.lineupId));

		return { notesUpdated: true };
	},

	deleteLineup: async ({ params, locals }) => {
		if (!await checkLineupAccess(locals, params.id)) return fail(403, { error: 'Access denied' });

		await db.delete(lineups).where(eq(lineups.id, params.lineupId));

		redirect(303, `/accounts/${params.id}/lineups`);
	}
};
