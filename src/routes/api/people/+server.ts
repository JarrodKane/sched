/**
 * +server.ts — /api/people
 * Two endpoints for the people directory, used by the AddActForm live search:
 *
 *   GET  — search for people by name or Instagram handle (?q=query); returns up
 *           to 8 results as { results: [...] }. Used for the debounced typeahead
 *           dropdown in AddActForm.
 *
 *   POST — create a new person from JSON { name, instagram? }; returns { person }
 *           with the inserted row. Called when the user picks "Create [name] in
 *           directory" from the AddActForm search dropdown.
 *
 * SvelteKit concepts:
 *   RequestHandler (GET / POST) — plain JSON endpoints; no form actions
 *   json()  — from @sveltejs/kit; wraps the response object
 */
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
