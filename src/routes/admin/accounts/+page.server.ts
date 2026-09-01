/**
 * +page.server.ts — /admin/accounts
 * Admin accounts list. Shows all non-deleted social accounts with their token
 * expiry status. Allows adding accounts manually (paste token) or soft-deleting them.
 * Also reads ?message and ?error query params written by the OAuth callback.
 *
 * Actions:
 *   add    — insert a new social_accounts row with a manually pasted long-lived token
 *   remove — soft-delete (sets deletedAt) after the user types "delete" to confirm
 *
 * SvelteKit concepts:
 *   load()    — no explicit admin check (layout guard covers this); reads
 *               ?message and ?error from url.searchParams for OAuth feedback
 *   actions   — two named actions; each calls requireAdmin() before mutating
 *   fail()    — returns 4xx with addError / removeError strings
 */
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users, socialAccounts } from '$lib/server/db/schema';
import { eq, isNull } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

async function requireAdmin(locals: App.Locals) {
	const { user } = await locals.safeGetSession();
	if (!user) return null;
	const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
	return profile?.isAdmin ? profile : null;
}

export const load: PageServerLoad = async ({ url }) => {
	const accounts = await db.select().from(socialAccounts).where(isNull(socialAccounts.deletedAt)).orderBy(socialAccounts.label);
	return {
		accounts,
		connectMessage: url.searchParams.get('message'),
		connectError: url.searchParams.get('error')
	};
};

export const actions: Actions = {
	add: async ({ request, locals }) => {
		if (!await requireAdmin(locals)) return fail(403, { addError: 'Access denied' });

		const form = await request.formData();
		const label = (form.get('label') as string)?.trim();
		const igBusinessId = (form.get('ig_business_id') as string)?.trim();
		const fbPageId = (form.get('fb_page_id') as string)?.trim();
		const accessToken = (form.get('access_token') as string)?.trim();
		const tokenExpiresAt = form.get('token_expires_at') as string | null;

		if (!label || !igBusinessId || !accessToken) {
			return fail(400, { addError: 'Label, IG Business ID, and access token are required.' });
		}

		await db.insert(socialAccounts).values({
			label,
			igBusinessId,
			fbPageId: fbPageId || igBusinessId,
			accessToken,
			tokenExpiresAt: tokenExpiresAt ? new Date(tokenExpiresAt) : null
		});

		return { added: true };
	},

	remove: async ({ request, locals }) => {
		if (!await requireAdmin(locals)) return fail(403, { removeError: 'Access denied' });

		const form = await request.formData();
		const id = form.get('id') as string;
		const confirm = (form.get('confirm') as string)?.toLowerCase().trim();
		if (!id) return fail(400, { removeError: 'Missing account ID.' });
		if (confirm !== 'delete') return fail(400, { removeError: 'Confirmation text did not match.' });

		await db.update(socialAccounts).set({ deletedAt: new Date() }).where(eq(socialAccounts.id, id));
		return { removed: true };
	}
};
