/**
 * +layout.server.ts — /accounts/[id]
 * Account layout load. Verifies the user has access to this account via
 * user_account_access, loads the account's metadata, and exposes per-asset
 * permission flags to all child pages.
 *
 * SvelteKit concepts:
 *   load()     — runs before every /accounts/[id]/* page; returns
 *                { accountMeta, canAccessSocial, canAccessTickets, canAccessLineups }
 *                which child loads read via await parent()
 *   parent()   — reads session + profile from the root layout load
 *   error()    — throws 403 if the user has no access row for this account
 *   redirect() — sends unauthenticated users to /login
 */
import { error, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { socialAccounts } from '$lib/server/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { getAccessRow } from '$lib/server/access';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ params, parent }) => {
	const { profile } = await parent();
	if (!profile) redirect(303, '/login');

	let canAccessSocial = true;
	let canAccessTickets = true;
	let canAccessLineups = true;

	if (!profile.isAdmin) {
		const row = await getAccessRow(profile.id, params.id);
		if (!row) error(403, 'Access denied');
		canAccessSocial = row.canAccessSocial;
		canAccessTickets = row.canAccessTickets;
		canAccessLineups = row.canAccessLineups;
	}

	const [account] = await db
		.select({ id: socialAccounts.id, label: socialAccounts.label })
		.from(socialAccounts)
		.where(and(eq(socialAccounts.id, params.id), isNull(socialAccounts.deletedAt)))
		.limit(1);
	if (!account) error(404, 'Account not found');

	return { accountMeta: account, canAccessSocial, canAccessTickets, canAccessLineups };
};
