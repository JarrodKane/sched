import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users, socialAccounts, userAccountAccess } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { supabaseAdmin } from '$lib/server/supabase-admin';
import type { Actions, PageServerLoad } from './$types';

async function requireAdmin(locals: App.Locals) {
	const { user } = await locals.safeGetSession();
	if (!user) return null;
	const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
	return profile?.isAdmin ? profile : null;
}

export const load: PageServerLoad = async () => {
	const [allUsers, allAccounts, allAccess] = await Promise.all([
		db.select().from(users).orderBy(users.name),
		db.select().from(socialAccounts).orderBy(socialAccounts.label),
		db.select().from(userAccountAccess)
	]);

	// Map accountId[] per user
	const accessByUser = new Map<string, string[]>();
	for (const row of allAccess) {
		const existing = accessByUser.get(row.userId) ?? [];
		existing.push(row.accountId);
		accessByUser.set(row.userId, existing);
	}

	const usersWithAccess = allUsers.map((u) => ({
		...u,
		accountIds: accessByUser.get(u.id) ?? []
	}));

	return { users: usersWithAccess, accounts: allAccounts };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (!await requireAdmin(locals)) return fail(403, { createError: 'Access denied' });

		const form = await request.formData();
		const email = (form.get('email') as string)?.trim().toLowerCase();
		const name = (form.get('name') as string)?.trim();
		const password = (form.get('password') as string)?.trim();
		const isAdmin = form.get('is_admin') === 'on';

		if (!email || !name || !password) {
			return fail(400, { createError: 'Email, name, and password are required.' });
		}
		if (password.length < 8) {
			return fail(400, { createError: 'Password must be at least 8 characters.' });
		}

		// Create the auth user via service role
		const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
			email,
			password,
			email_confirm: true
		});
		if (authError) {
			return fail(400, { createError: authError.message });
		}

		// Create profile row
		await db.insert(users).values({ id: authData.user.id, email, name, isAdmin });

		return { created: true };
	},

	delete: async ({ request, locals }) => {
		if (!await requireAdmin(locals)) return fail(403, { deleteError: 'Access denied' });

		const form = await request.formData();
		const userId = form.get('user_id') as string;
		if (!userId) return fail(400, { deleteError: 'Missing user ID.' });

		// Delete auth user (cascades to our users table via FK if RLS allows, or we do it manually)
		const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
		if (authError) return fail(500, { deleteError: authError.message });

		await db.delete(users).where(eq(users.id, userId));
		return { deleted: true };
	},

	setAccess: async ({ request, locals }) => {
		if (!await requireAdmin(locals)) return fail(403, { accessError: 'Access denied' });

		const form = await request.formData();
		const userId = form.get('user_id') as string;
		const accountIds = form.getAll('account_ids') as string[];

		if (!userId) return fail(400, { accessError: 'Missing user ID.' });

		// Replace all access rows for this user
		await db.delete(userAccountAccess).where(eq(userAccountAccess.userId, userId));

		if (accountIds.length > 0) {
			await db.insert(userAccountAccess).values(
				accountIds.map((accountId) => ({ userId, accountId }))
			);
		}

		return { accessSaved: true };
	}
};
