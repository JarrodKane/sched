import { error, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { socialAccounts } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { canAccessAccount } from '$lib/server/access';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ params, parent }) => {
	const { profile } = await parent();
	if (!profile) redirect(303, '/login');

	const allowed = await canAccessAccount(profile.id, params.id, profile.isAdmin);
	if (!allowed) error(403, 'Access denied');

	const [account] = await db
		.select({ id: socialAccounts.id, label: socialAccounts.label })
		.from(socialAccounts)
		.where(eq(socialAccounts.id, params.id))
		.limit(1);
	if (!account) error(404, 'Account not found');

	return { accountMeta: account };
};
