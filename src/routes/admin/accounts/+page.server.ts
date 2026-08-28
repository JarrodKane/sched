import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { socialAccounts } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const accounts = await db.select().from(socialAccounts).orderBy(socialAccounts.label);
	return {
		accounts,
		connectMessage: url.searchParams.get('message'),
		connectError: url.searchParams.get('error')
	};
};

export const actions: Actions = {
	add: async ({ request }) => {
		const form = await request.formData();
		const label = (form.get('label') as string)?.trim();
		const igBusinessId = (form.get('ig_business_id') as string)?.trim();
		const fbPageId = (form.get('fb_page_id') as string)?.trim();
		const accessToken = (form.get('access_token') as string)?.trim();
		const tokenExpiresAt = form.get('token_expires_at') as string | null;

		if (!label || !igBusinessId || !fbPageId || !accessToken) {
			return fail(400, { addError: 'All fields except expiry date are required.' });
		}

		await db.insert(socialAccounts).values({
			label,
			igBusinessId,
			fbPageId,
			accessToken,
			tokenExpiresAt: tokenExpiresAt ? new Date(tokenExpiresAt) : null
		});

		return { added: true };
	},

	remove: async ({ request }) => {
		const form = await request.formData();
		const id = form.get('id') as string;
		if (!id) return fail(400, { removeError: 'Missing account ID.' });

		await db.delete(socialAccounts).where(eq(socialAccounts.id, id));
		return { removed: true };
	}
};
