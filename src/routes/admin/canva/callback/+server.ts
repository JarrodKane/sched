import { redirect, error } from '@sveltejs/kit';
import { CANVA_CLIENT_ID, CANVA_CLIENT_SECRET } from '$env/static/private';
import { saveCanvaTokens } from '$lib/server/canva';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const redirectUri = `${url.origin}/admin/canva/callback`;
	const code = url.searchParams.get('code');
	const errorParam = url.searchParams.get('error');

	if (errorParam) {
		error(400, `Canva authorization denied: ${errorParam}`);
	}
	if (!code) {
		error(400, 'Missing authorization code from Canva');
	}

	// code_verifier is round-tripped via the OAuth state parameter
	const codeVerifier = url.searchParams.get('state');
	if (!codeVerifier) {
		error(400, 'Missing state — please try connecting again from /admin/canva');
	}

	const res = await fetch('https://api.canva.com/rest/v1/oauth/token', {
		method: 'POST',
		headers: {
			Authorization: 'Basic ' + btoa(`${CANVA_CLIENT_ID}:${CANVA_CLIENT_SECRET}`),
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			code_verifier: codeVerifier,
			redirect_uri: redirectUri
		})
	});

	if (!res.ok) {
		const err = await res.text();
		error(502, `Canva token exchange failed (${res.status}): ${err}`);
	}

	const data = (await res.json()) as {
		access_token: string;
		refresh_token: string;
		expires_in: number;
	};

	await saveCanvaTokens(data.access_token, data.refresh_token, data.expires_in);

	redirect(303, '/admin/canva?connected=1');
};
