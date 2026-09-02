import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { people } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { ServerLoadEvent } from '@sveltejs/kit';

export const load = async ({ params }: ServerLoadEvent) => {
	const [person] = await db
		.select({ id: people.id, name: people.name, photoUrl: people.photoUrl })
		.from(people)
		.where(eq(people.id, params.id as string))
		.limit(1);

	if (!person) error(404, 'This link is invalid or has expired.');

	return { person };
};
