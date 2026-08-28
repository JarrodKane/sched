import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { users, socialAccounts } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, cookies, url }) => {
	const { user } = await locals.safeGetSession();
	if (!user) redirect(303, '/login');

	const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
	if (!profile?.isAdmin) redirect(303, '/dashboard');

	// Verify CSRF state
	const state = url.searchParams.get('state');
	const storedState = cookies.get('ig_oauth_state');
	cookies.delete('ig_oauth_state', { path: '/' });
	if (!state || state !== storedState) {
		redirect(303, '/admin/accounts?error=' + encodeURIComponent('Invalid state — please try again'));
	}

	const code = url.searchParams.get('code');
	if (!code) {
		const msg = url.searchParams.get('error_description') ?? 'Connection cancelled';
		redirect(303, '/admin/accounts?error=' + encodeURIComponent(msg));
	}

	try {
		const redirectUri = `${url.origin}/admin/accounts/connect/callback`;

		// Exchange code for short-lived Instagram user token (POST)
		const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
			method: 'POST',
			body: new URLSearchParams({
				client_id: env.FB_APP_ID,
				client_secret: env.FB_APP_SECRET,
				grant_type: 'authorization_code',
				redirect_uri: redirectUri,
				code
			})
		});
		const tokenData = (await tokenRes.json()) as {
			access_token?: string;
			user_id?: number;
			error?: { message: string };
		};
		if (!tokenData.access_token) throw new Error(tokenData.error?.message ?? 'Token exchange failed');

		// Extend to long-lived Instagram token (~60 days)
		const llRes = await fetch(
			'https://graph.instagram.com/access_token?' +
				new URLSearchParams({
					grant_type: 'ig_exchange_token',
					client_secret: env.FB_APP_SECRET,
					access_token: tokenData.access_token
				})
		);
		const llData = (await llRes.json()) as {
			access_token?: string;
			expires_in?: number;
			error?: { message: string };
		};
		if (!llData.access_token) throw new Error(llData.error?.message ?? 'Failed to extend token');

		// Get the Instagram account info for the authenticated user
		const igRes = await fetch(
			'https://graph.instagram.com/me?' +
				new URLSearchParams({
					fields: 'id,username,name',
					access_token: llData.access_token
				})
		);
		const igData = (await igRes.json()) as {
			id?: string;
			username?: string;
			name?: string;
			error?: { message: string };
		};
		if (igData.error) throw new Error(igData.error.message);
		if (!igData.id) throw new Error('No Instagram account returned');

		const expiresAt = llData.expires_in ? new Date(Date.now() + llData.expires_in * 1000) : null;
		const added: string[] = [];
		const refreshed: string[] = [];

		const igId = igData.id;
		const label = igData.username ? `@${igData.username}` : (igData.name ?? igId);

		const existing = await db
			.select({ id: socialAccounts.id })
			.from(socialAccounts)
			.where(eq(socialAccounts.igBusinessId, igId))
			.limit(1);

		if (existing.length > 0) {
			await db
				.update(socialAccounts)
				.set({ accessToken: llData.access_token, tokenExpiresAt: expiresAt, label })
				.where(eq(socialAccounts.igBusinessId, igId));
			refreshed.push(label);
		} else {
			await db.insert(socialAccounts).values({
				platform: 'instagram',
				label,
				igBusinessId: igId,
				fbPageId: igId,
				accessToken: llData.access_token,
				tokenExpiresAt: expiresAt
			});
			added.push(label);
		}

		let message = '';
		if (added.length) message += `Connected: ${added.join(', ')}`;
		if (refreshed.length) message += (message ? '. ' : '') + `Token refreshed: ${refreshed.join(', ')}`;
		if (!message) message = 'No Instagram Business accounts found on this Facebook account';

		redirect(303, '/admin/accounts?message=' + encodeURIComponent(message));
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'Connection failed';
		redirect(303, '/admin/accounts?error=' + encodeURIComponent(msg));
	}
};
