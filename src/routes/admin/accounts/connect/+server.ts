import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, cookies, url }) => {
	const { user } = await locals.safeGetSession();
	if (!user) redirect(303, '/login');

	const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
	if (!profile?.isAdmin) redirect(303, '/dashboard');

	const state = crypto.randomUUID();
	cookies.set('ig_oauth_state', state, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 600 });

	const redirectUri = `${url.origin}/admin/accounts/connect/callback`;

	const oauthUrl = new URL('https://www.instagram.com/oauth/authorize');
	oauthUrl.searchParams.set('client_id', env.FB_APP_ID);
	oauthUrl.searchParams.set('redirect_uri', redirectUri);
	oauthUrl.searchParams.set('scope', 'instagram_business_basic,instagram_business_content_publish');
	oauthUrl.searchParams.set('response_type', 'code');
	oauthUrl.searchParams.set('state', state);

	redirect(303, oauthUrl.toString());
};
