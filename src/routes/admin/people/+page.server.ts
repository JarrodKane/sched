/**
 * +page.server.ts — /admin/people
 * People directory page. Lists all people (name, Instagram handle, photo URL).
 * Visible to any user who has lineup access on at least one account; add/edit/delete
 * mutations are restricted to admins.
 *
 * Actions:
 *   add    — insert a new person (admin only)
 *   update — edit a person's name and Instagram handle (admin only)
 *   delete — remove a person from the directory (admin only)
 *
 * SvelteKit concepts:
 *   load()   — checks lineup access for non-admins (any account qualifies); loads
 *              all people ordered by name
 *   actions  — three named actions; each calls getProfile() and checks isAdmin
 *   fail()   — returns 4xx with an error string
 *   error()  — throws 403 if the user has no lineup access at all
 */
import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users, people, userAccountAccess } from '$lib/server/db/schema';
import { eq, asc, and } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

async function getProfile(locals: App.Locals) {
	const { user } = await locals.safeGetSession();
	if (!user) return null;
	const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
	return profile ?? null;
}

export const load: PageServerLoad = async ({ locals }) => {
	const profile = await getProfile(locals);
	if (!profile) error(401, 'Unauthorized');

	// Admins see full page; any user with lineup access on at least one account can view
	if (!profile.isAdmin) {
		const [access] = await db
			.select({ userId: userAccountAccess.userId })
			.from(userAccountAccess)
			.where(and(eq(userAccountAccess.userId, profile.id), eq(userAccountAccess.canAccessLineups, true)))
			.limit(1);
		if (!access) error(403, 'Access denied');
	}

	const allPeople = await db
		.select({ id: people.id, name: people.name, instagram: people.instagram, photoUrl: people.photoUrl })
		.from(people)
		.orderBy(asc(people.name));

	return { people: allPeople, isAdmin: profile.isAdmin };
};

export const actions: Actions = {
	add: async ({ request, locals }) => {
		const profile = await getProfile(locals);
		if (!profile?.isAdmin) return fail(403, { error: 'Access denied' });

		const form = await request.formData();
		const name = (form.get('name') as string)?.trim();
		const instagram = (form.get('instagram') as string)?.trim() || null;
		const photoUrl = (form.get('photoUrl') as string)?.trim() || null;

		if (!name) return fail(400, { error: 'Name is required.' });

		await db.insert(people).values({ name, instagram, photoUrl });
		return { added: true };
	},

	update: async ({ request, locals }) => {
		const profile = await getProfile(locals);
		if (!profile?.isAdmin) return fail(403, { error: 'Access denied' });

		const form = await request.formData();
		const id = (form.get('id') as string)?.trim();
		const name = (form.get('name') as string)?.trim();
		const instagram = (form.get('instagram') as string)?.trim() || null;

		if (!id || !name) return fail(400, { error: 'Name is required.' });

		await db.update(people).set({ name, instagram }).where(eq(people.id, id));
		return { updated: true };
	},

	delete: async ({ request, locals }) => {
		const profile = await getProfile(locals);
		if (!profile?.isAdmin) return fail(403, { error: 'Access denied' });

		const form = await request.formData();
		const id = (form.get('id') as string)?.trim();
		if (!id) return fail(400, { error: 'Missing ID.' });

		await db.delete(people).where(eq(people.id, id));
		return { deleted: true };
	}
};
