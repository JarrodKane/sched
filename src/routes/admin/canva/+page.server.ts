import { redirect } from '@sveltejs/kit';
import { CANVA_CLIENT_ID } from '$env/static/private';
import { getCanvaConnectionStatus } from '$lib/server/canva';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const status = await getCanvaConnectionStatus();
	return {
		connected: status.connected,
		expiresAt: status.expiresAt?.toISOString() ?? null,
		justConnected: url.searchParams.has('connected')
	};
};

export const actions: Actions = {
	connect: async ({ url }) => {
		const redirectUri = `${url.origin}/admin/canva/callback`;
		const codeVerifier =
			crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');

		const encoder = new TextEncoder();
		const digest = await crypto.subtle.digest('SHA-256', encoder.encode(codeVerifier));
		const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=/g, '');

		const scopes = [
			'asset:read',
			'asset:write',
			'brandtemplate:content:read',
			'brandtemplate:meta:read',
			'design:content:read',
			'design:content:write'
		].join(' ');

		const authUrl = new URL('https://www.canva.com/api/oauth/authorize');
		authUrl.searchParams.set('client_id', CANVA_CLIENT_ID);
		authUrl.searchParams.set('redirect_uri', redirectUri);
		authUrl.searchParams.set('response_type', 'code');
		authUrl.searchParams.set('scope', scopes);
		authUrl.searchParams.set('code_challenge', codeChallenge);
		authUrl.searchParams.set('code_challenge_method', 's256');
		// Pass verifier in state — Canva round-trips it back in the callback URL,
		// avoiding hostname cookie issues between localhost and 127.0.0.1.
		authUrl.searchParams.set('state', codeVerifier);

		redirect(303, authUrl.toString());
	}
};
