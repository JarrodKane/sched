/**
 * +layout.server.ts — /admin
 * Admin section guard. Redirects non-admins to /dashboard and unauthenticated
 * users to /login before any /admin/* page loads.
 *
 * SvelteKit concepts:
 *   load()     — reads parent() for the user's profile; redirects if not admin
 *   parent()   — inherits profile from the root layout load
 *   redirect() — the only mutation here; no data is returned to child pages
 */
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ parent }) => {
	const { profile } = await parent();
	if (!profile) redirect(303, '/login');
	if (!profile.isAdmin) redirect(303, '/dashboard');
};
