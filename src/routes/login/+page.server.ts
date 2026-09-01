/**
 * +page.server.ts — /login
 * Login / logout page. Redirects already-authenticated users to /dashboard.
 *
 * Actions:
 *   login  — calls Supabase Auth signInWithPassword; on success redirects to
 *             /dashboard; on failure returns fail(400, { error }) for inline display
 *   logout — calls Supabase Auth signOut and redirects to /login
 *
 * SvelteKit concepts:
 *   load()     — reads parent() for session; redirects to /dashboard if already signed in
 *   actions    — two named actions (login, logout)
 *   fail()     — returns 400 with { error } string; the page reads it as `form.error`
 *   redirect() — navigates to /dashboard on login success, or /login after logout
 */
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { session } = await parent();
	if (session) redirect(303, '/dashboard');
};

export const actions: Actions = {
	login: async ({ request, locals }) => {
		const form = await request.formData();
		const email = form.get('email') as string;
		const password = form.get('password') as string;

		if (!email || !password) {
			return fail(400, { error: 'Email and password are required.' });
		}

		const { error } = await locals.supabase.auth.signInWithPassword({ email, password });

		if (error) {
			console.error(`[login] failed for ${email} — ${error.status} ${error.code}: ${error.message}`);
			return fail(400, { error: 'Invalid email or password.' });
		}

		redirect(303, '/dashboard');
	},

	logout: async ({ locals }) => {
		await locals.supabase.auth.signOut();
		redirect(303, '/login');
	}
};
