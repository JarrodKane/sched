import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users, people } from '$lib/server/db/schema';
import { eq, asc } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

async function requireAdmin(locals: App.Locals) {
	const { user } = await locals.safeGetSession();
	if (!user) return null;
	const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
	return profile?.isAdmin ? profile : null;
}

export const load: PageServerLoad = async ({ locals }) => {
	if (!await requireAdmin(locals)) error(403, 'Access denied');

	const allPeople = await db
		.select()
		.from(people)
		.orderBy(asc(people.name));

	return { people: allPeople };
};

export const actions: Actions = {
	add: async ({ request, locals }) => {
		if (!await requireAdmin(locals)) return fail(403, { error: 'Access denied' });

		const form = await request.formData();
		const name = (form.get('name') as string)?.trim();
		const instagram = (form.get('instagram') as string)?.trim() || null;

		if (!name) return fail(400, { error: 'Name is required.' });

		await db.insert(people).values({ name, instagram });
		return { added: true };
	},

	update: async ({ request, locals }) => {
		if (!await requireAdmin(locals)) return fail(403, { error: 'Access denied' });

		const form = await request.formData();
		const id = (form.get('id') as string)?.trim();
		const name = (form.get('name') as string)?.trim();
		const instagram = (form.get('instagram') as string)?.trim() || null;

		if (!id || !name) return fail(400, { error: 'Name is required.' });

		await db.update(people).set({ name, instagram }).where(eq(people.id, id));
		return { updated: true };
	},

	delete: async ({ request, locals }) => {
		if (!await requireAdmin(locals)) return fail(403, { error: 'Access denied' });

		const form = await request.formData();
		const id = (form.get('id') as string)?.trim();
		if (!id) return fail(400, { error: 'Missing ID.' });

		await db.delete(people).where(eq(people.id, id));
		return { deleted: true };
	}
};
