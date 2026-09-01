/**
 * +page.server.ts — /
 * Root route. Redirects authenticated users to /dashboard and
 * unauthenticated users to /login. The page itself has no content.
 *
 * SvelteKit concepts:
 *   load()     — runs on every visit to /; always redirects, never renders
 *   parent()   — reads session from the root layout load
 *   redirect() — the only possible outcome; no data is returned
 */
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { session } = await parent();
	if (session) redirect(303, '/dashboard');
	redirect(303, '/login');
};
