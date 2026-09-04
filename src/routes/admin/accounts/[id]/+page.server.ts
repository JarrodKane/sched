/**
 * +page.server.ts — /admin/accounts/[id]
 * Admin page for managing one social account's ticket shows (linked via Humanitix
 * and/or Eventbrite event IDs). Admins can add, edit, toggle active state, and delete shows.
 *
 * Actions:
 *   addShow     — create a new show for this account
 *   updateShow  — edit a show's name, schedule type, day of week, capacity, event IDs
 *   deleteShow  — permanently delete a show (and all its ticket history)
 *   toggleShow  — flip a show's isActive flag (pause / resume ticket polling)
 *
 * SvelteKit concepts:
 *   load()    — calls requireAdmin() directly (not via layout parent); loads the
 *               account row + its shows from Drizzle
 *   actions   — four named actions; each calls requireAdmin() before mutating
 *   fail()    — returns 4xx with a showError string for inline display
 *   error()   — throws 403/404 from load if access denied or account not found
 */
import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users, socialAccounts, shows } from '$lib/server/db/schema';
import { eq, and, asc, isNull } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

async function requireAdmin(locals: App.Locals) {
	const { user } = await locals.safeGetSession();
	if (!user) return null;
	const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
	return profile?.isAdmin ? profile : null;
}

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!await requireAdmin(locals)) error(403, 'Access denied');

	const [account] = await db
		.select()
		.from(socialAccounts)
		.where(eq(socialAccounts.id, params.id) /* soft-deleted accounts still accessible to admin */)
		.limit(1);
	if (!account) error(404, 'Account not found');

	const accountShows = await db
		.select()
		.from(shows)
		.where(eq(shows.accountId, params.id))
		.orderBy(asc(shows.createdAt));

	return { account, shows: accountShows };
};

export const actions: Actions = {
	addShow: async ({ request, locals, params }) => {
		if (!await requireAdmin(locals)) return fail(403, { showError: 'Access denied' });

		const form = await request.formData();
		const name = (form.get('show_name') as string)?.trim();
		const humanitixEventId = (form.get('humanitix_event_id') as string)?.trim() || null;
		const eventbriteEventId = (form.get('eventbrite_event_id') as string)?.trim() || null;
		const capacityRaw = (form.get('capacity') as string)?.trim();
		const capacity = capacityRaw ? parseInt(capacityRaw, 10) || null : null;
		const scheduleType = (form.get('schedule_type') as string)?.trim() || null;
		const schedDayRaw = (form.get('schedule_day_of_week') as string)?.trim();
		const scheduleDayOfWeek = schedDayRaw !== '' && schedDayRaw != null ? parseInt(schedDayRaw, 10) : null;
		const actsRaw = (form.get('acts_per_show') as string)?.trim();
		const actsPerShow = actsRaw ? parseInt(actsRaw, 10) || null : null;

		if (!name) return fail(400, { showError: 'Show name is required.' });

		await db.insert(shows).values({
			accountId: params.id, name, humanitixEventId, eventbriteEventId, capacity,
			scheduleType, scheduleDayOfWeek, actsPerShow
		});
		return { showAdded: true };
	},

	updateShow: async ({ request, locals, params }) => {
		if (!await requireAdmin(locals)) return fail(403, { showError: 'Access denied' });

		const form = await request.formData();
		const id = (form.get('id') as string)?.trim();
		const name = (form.get('show_name') as string)?.trim();
		const humanitixEventId = (form.get('humanitix_event_id') as string)?.trim() || null;
		const eventbriteEventId = (form.get('eventbrite_event_id') as string)?.trim() || null;
		const capacityRaw = (form.get('capacity') as string)?.trim();
		const capacity = capacityRaw ? parseInt(capacityRaw, 10) || null : null;
		const scheduleType = (form.get('schedule_type') as string)?.trim() || null;
		const schedDayRaw = (form.get('schedule_day_of_week') as string)?.trim();
		const scheduleDayOfWeek = schedDayRaw !== '' && schedDayRaw != null ? parseInt(schedDayRaw, 10) : null;
		const actsRaw = (form.get('acts_per_show') as string)?.trim();
		const actsPerShow = actsRaw ? parseInt(actsRaw, 10) || null : null;
		const canvaTemplateId = (form.get('canva_template_id') as string)?.trim() || null;

		if (!id || !name) return fail(400, { showError: 'Show name is required.' });

		await db.update(shows)
			.set({ name, humanitixEventId, eventbriteEventId, capacity, scheduleType, scheduleDayOfWeek, actsPerShow, canvaTemplateId })
			.where(and(eq(shows.id, id), eq(shows.accountId, params.id)));

		return { showUpdated: true };
	},

	deleteShow: async ({ request, locals, params }) => {
		if (!await requireAdmin(locals)) return fail(403, { showError: 'Access denied' });

		const form = await request.formData();
		const id = (form.get('id') as string)?.trim();
		if (!id) return fail(400, { showError: 'Missing show ID.' });

		await db.delete(shows).where(and(eq(shows.id, id), eq(shows.accountId, params.id)));
		return { showDeleted: true };
	},

	toggleShow: async ({ request, locals, params }) => {
		if (!await requireAdmin(locals)) return fail(403, { showError: 'Access denied' });

		const form = await request.formData();
		const id = (form.get('id') as string)?.trim();
		const active = form.get('active') === 'true';
		if (!id) return fail(400, { showError: 'Missing show ID.' });

		await db.update(shows).set({ isActive: !active }).where(and(eq(shows.id, id), eq(shows.accountId, params.id)));
		return { showToggled: true };
	}
};
