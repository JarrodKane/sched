import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const { session, user } = await locals.safeGetSession();

	if (!session && url.pathname !== '/login') {
		redirect(303, '/login');
	}

	let profile: { id: string; email: string; name: string; isAdmin: boolean } | null = null;
	if (user) {
		const rows = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
		profile = rows[0] ?? null;
	}

	return { session, user, profile };
};
