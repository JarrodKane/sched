/**
 * Canva Connect API — token management helper.
 * If CANVA_PAT is set in env, uses it directly (Personal Access Token — no DB needed).
 * Otherwise falls back to OAuth: stores access/refresh tokens in the canva_tokens table.
 * Call getCanvaToken() before any Canva API request — it auto-refreshes when expired.
 */
import { CANVA_CLIENT_ID, CANVA_CLIENT_SECRET } from '$env/static/private';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { canvaTokens } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

const TOKEN_URL = 'https://api.canva.com/rest/v1/oauth/token';

function basicAuth() {
	return 'Basic ' + btoa(`${CANVA_CLIENT_ID}:${CANVA_CLIENT_SECRET}`);
}

export async function getCanvaToken(): Promise<string> {
	// PAT takes priority — bypasses OAuth and draft-mode restrictions
	if (env.CANVA_PAT) return env.CANVA_PAT;

	const [row] = await db.select().from(canvaTokens).where(eq(canvaTokens.id, 'default')).limit(1);

	if (!row?.refreshToken) {
		throw new Error('Canva not connected. Visit /admin/canva to connect.');
	}

	// Return cached token if still valid (with 5-min buffer)
	if (row.accessToken && row.expiresAt && row.expiresAt > new Date(Date.now() + 5 * 60 * 1000)) {
		return row.accessToken;
	}

	// Refresh
	const res = await fetch(TOKEN_URL, {
		method: 'POST',
		headers: {
			Authorization: basicAuth(),
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: new URLSearchParams({
			grant_type: 'refresh_token',
			refresh_token: row.refreshToken
		})
	});

	if (!res.ok) {
		const err = await res.text();
		throw new Error(`Canva token refresh failed (${res.status}): ${err}`);
	}

	const data = (await res.json()) as {
		access_token: string;
		refresh_token?: string;
		expires_in: number;
	};

	const expiresAt = new Date(Date.now() + data.expires_in * 1000);

	await db
		.insert(canvaTokens)
		.values({
			id: 'default',
			accessToken: data.access_token,
			refreshToken: data.refresh_token ?? row.refreshToken,
			expiresAt,
			updatedAt: new Date()
		})
		.onConflictDoUpdate({
			target: canvaTokens.id,
			set: {
				accessToken: data.access_token,
				refreshToken: data.refresh_token ?? row.refreshToken,
				expiresAt,
				updatedAt: new Date()
			}
		});

	return data.access_token;
}

export async function saveCanvaTokens(
	accessToken: string,
	refreshToken: string,
	expiresIn: number
) {
	const expiresAt = new Date(Date.now() + expiresIn * 1000);
	await db
		.insert(canvaTokens)
		.values({ id: 'default', accessToken, refreshToken, expiresAt, updatedAt: new Date() })
		.onConflictDoUpdate({
			target: canvaTokens.id,
			set: { accessToken, refreshToken, expiresAt, updatedAt: new Date() }
		});
}

export async function getCanvaConnectionStatus(): Promise<{
	connected: boolean;
	expiresAt: Date | null;
}> {
	const [row] = await db.select().from(canvaTokens).where(eq(canvaTokens.id, 'default')).limit(1);
	return {
		connected: !!row?.refreshToken,
		expiresAt: row?.expiresAt ?? null
	};
}
