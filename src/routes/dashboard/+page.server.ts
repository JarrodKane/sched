import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { socialAccounts, userAccountAccess } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { profile } = await parent();
	if (!profile) redirect(303, '/login');

	let accounts;
	if (profile.isAdmin) {
		accounts = await db.select().from(socialAccounts).orderBy(socialAccounts.label);
	} else {
		accounts = await db
			.select({ id: socialAccounts.id, label: socialAccounts.label, platform: socialAccounts.platform })
			.from(socialAccounts)
			.innerJoin(userAccountAccess, eq(userAccountAccess.accountId, socialAccounts.id))
			.where(eq(userAccountAccess.userId, profile.id))
			.orderBy(socialAccounts.label);
	}

	return { accounts };
};
