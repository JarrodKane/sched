import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { people } from '$lib/server/db/schema';
import { ilike, or } from 'drizzle-orm';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return json({ results: [] }, { status: 401 });

	const q = url.searchParams.get('q')?.trim();
	if (!q) return json({ results: [] });

	const results = await db
		.select({ id: people.id, name: people.name, instagram: people.instagram })
		.from(people)
		.where(or(ilike(people.name, `%${q}%`), ilike(people.instagram, `%${q}%`)))
		.limit(8);

	return json({ results });
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = await request.json();
	const name = body.name?.trim();
	const instagram = body.instagram?.trim() || null;

	if (!name) return json({ error: 'Name required' }, { status: 400 });

	const [person] = await db.insert(people).values({ name, instagram }).returning();
	return json({ person });
};
