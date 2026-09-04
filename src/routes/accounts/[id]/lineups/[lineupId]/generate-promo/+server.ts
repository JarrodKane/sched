/**
 * +server.ts — /accounts/[id]/lineups/[lineupId]/generate-promo
 * POST endpoint that generates a promotional image via Canva's Connect API.
 * Uploads performer photos to Canva, runs the autofill job on a brand template,
 * exports the result as JPEG, and returns the download URL + design ID.
 *
 * The caller gets back { url, canvaDesignId } — url is the Canva export download
 * URL (valid for several minutes), canvaDesignId lets the user open the design
 * in Canva for further editing at https://www.canva.com/design/{id}/edit
 *
 * Body: { entries: [{ name, photoUrl }], showDate: "YYYY-MM-DD" }
 * Entries map to performer_1…N in the Canva brand template.
 */
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users, lineups, shows } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { canAccessAsset } from '$lib/server/access';
import { getCanvaToken } from '$lib/server/canva';
import type { RequestHandler } from './$types';

export const config = { maxDuration: 60 };

const CANVA_BASE = 'https://api.canva.com/rest/v1';

async function authHeader() {
	const token = await getCanvaToken();
	return { Authorization: `Bearer ${token}` };
}

async function sleep(ms: number) {
	return new Promise((r) => setTimeout(r, ms));
}

async function pollUntilDone(endpoint: string, maxAttempts = 20): Promise<Record<string, unknown>> {
	for (let i = 0; i < maxAttempts; i++) {
		const res = await fetch(`${CANVA_BASE}${endpoint}`, { headers: await authHeader() });
		if (!res.ok) throw new Error(`Canva poll ${endpoint} failed: ${res.status}`);
		const data = (await res.json()) as Record<string, unknown>;
		const job = data.job as Record<string, unknown> | undefined;
		if (job?.status === 'success') return data;
		if (job?.status === 'failed') throw new Error(`Canva job failed: ${JSON.stringify(job)}`);
		if (i < maxAttempts - 1) await sleep(2000);
	}
	throw new Error('Canva job timed out after 40 seconds');
}

async function uploadPhotoToCanva(photoUrl: string, filename: string): Promise<string> {
	const imgRes = await fetch(photoUrl);
	if (!imgRes.ok) throw new Error(`Could not fetch photo (${imgRes.status}): ${photoUrl}`);

	// Read content-type from source before consuming body
	let contentType = imgRes.headers.get('content-type')?.split(';')[0].trim() ?? '';
	if (!contentType.startsWith('image/')) {
		const lower = photoUrl.toLowerCase().split('?')[0];
		contentType = lower.endsWith('.png') ? 'image/png'
			: lower.endsWith('.gif') ? 'image/gif'
			: lower.endsWith('.webp') ? 'image/webp'
			: 'image/jpeg';
	}

	const imgBytes = await imgRes.arrayBuffer();

	// Asset-Upload-Metadata must be base64-encoded JSON with name_base64 field
	const metaJson = JSON.stringify({ name_base64: btoa(filename) });

	const uploadRes = await fetch(`${CANVA_BASE}/assets`, {
		method: 'POST',
		headers: {
			...await authHeader(),
			'Content-Type': contentType,
			'Asset-Upload-Metadata': btoa(metaJson)
		},
		body: imgBytes
	});

	if (!uploadRes.ok) {
		const errText = await uploadRes.text().catch(() => '(no body)');
		throw new Error(`Canva asset upload failed (${uploadRes.status}) [Content-Type: ${contentType}]: ${errText}`);
	}

	const uploadData = (await uploadRes.json()) as Record<string, unknown>;

	// Synchronous response shape: { asset: { id } }
	const directAsset = uploadData.asset as Record<string, unknown> | undefined;
	if (directAsset?.id) return directAsset.id as string;

	// Job-based response shape: { job: { id, status, asset? } }
	const job = uploadData.job as Record<string, unknown> | undefined;
	if (job?.status === 'success') {
		const jobAsset = job.asset as Record<string, unknown> | undefined;
		if (jobAsset?.id) return jobAsset.id as string;
	}
	if (job?.id) {
		const polled = await pollUntilDone(`/assets/${job.id as string}`);
		const polledJob = polled.job as Record<string, unknown> | undefined;
		const polledAsset = (polledJob?.asset ?? polled.asset) as Record<string, unknown> | undefined;
		if (polledAsset?.id) return polledAsset.id as string;
	}

	throw new Error('Canva asset upload: could not extract asset ID from response');
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) error(401, 'Unauthorized');

	const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
	if (!profile) error(401, 'Unauthorized');

	const allowed = await canAccessAsset(profile.id, params.id, profile.isAdmin, 'lineups');
	if (!allowed) error(403, 'Access denied');

	const [lineup] = await db
		.select({ id: lineups.id, showId: lineups.showId, showDate: lineups.showDate })
		.from(lineups)
		.where(eq(lineups.id, params.lineupId))
		.limit(1);
	if (!lineup) error(404, 'Lineup not found');

	const [show] = await db
		.select({ id: shows.id, name: shows.name, accountId: shows.accountId, canvaTemplateId: shows.canvaTemplateId })
		.from(shows)
		.where(eq(shows.id, lineup.showId))
		.limit(1);
	if (!show || show.accountId !== params.id) error(404, 'Show not found');
	if (!show.canvaTemplateId) error(400, 'No Canva template configured for this show');

	const body = await request.json().catch(() => null) as { entries?: { name: string; photoUrl: string }[]; showDate?: string } | null;
	if (!body?.entries || body.entries.length === 0) error(400, 'At least one performer entry is required');
	if (body.entries.some((e) => !e.photoUrl || !e.name)) error(400, 'All entries must have a name and photo URL');

	// Format the date for the template text field
	const dateStr = body.showDate ?? lineup.showDate;
	const [y, m, d] = dateStr.split('-').map(Number);
	const showDateFormatted = new Date(y, m - 1, d).toLocaleDateString('en-AU', {
		day: 'numeric', month: 'long'
	});

	// Step 1: Upload all performer photos to Canva in parallel
	const assetIds = await Promise.all(
		body.entries.map((e, i) => uploadPhotoToCanva(e.photoUrl, `performer_${i + 1}.jpg`))
	);

	// Step 2: Build autofill data — performer_1..N image + name fields, plus show_date
	const autofillData: Record<string, { type: string; asset_id?: string; text?: string }> = {
		show_date: { type: 'text', text: showDateFormatted }
	};
	body.entries.forEach((e, i) => {
		autofillData[`performer_${i + 1}`] = { type: 'image', asset_id: assetIds[i] };
		autofillData[`performer_${i + 1}_name`] = { type: 'text', text: e.name };
	});

	// Step 3: Start autofill job
	const autofillRes = await fetch(`${CANVA_BASE}/autofills`, {
		method: 'POST',
		headers: { ...await authHeader(), 'Content-Type': 'application/json' },
		body: JSON.stringify({
			brand_template_id: show.canvaTemplateId,
			title: `${show.name} – ${lineup.showDate}`,
			data: autofillData
		})
	});

	if (!autofillRes.ok) {
		const err = (await autofillRes.json().catch(() => ({}))) as Record<string, unknown>;
		error(502, (err?.message as string) ?? `Canva autofill request failed: ${autofillRes.status}`);
	}

	const autofillData2 = (await autofillRes.json()) as Record<string, unknown>;
	const autofillJobId = ((autofillData2.job as Record<string, unknown>)?.id) as string | undefined;
	if (!autofillJobId) error(502, 'Canva autofill: no job ID in response');

	// Step 4: Poll until autofill is complete → get design ID
	const autofillDone = await pollUntilDone(`/autofills/${autofillJobId}`);
	const autofillResult = ((autofillDone.job as Record<string, unknown>)?.result) as Record<string, unknown> | undefined;
	const designId = ((autofillResult?.design) as Record<string, unknown> | undefined)?.id as string | undefined;
	if (!designId) error(502, 'Canva autofill: no design ID in result');

	// Step 5: Start export job
	const exportRes = await fetch(`${CANVA_BASE}/exports`, {
		method: 'POST',
		headers: { ...await authHeader(), 'Content-Type': 'application/json' },
		body: JSON.stringify({ design_id: designId, format: 'jpg', export_quality: 'pro' })
	});

	if (!exportRes.ok) {
		const err = (await exportRes.json().catch(() => ({}))) as Record<string, unknown>;
		error(502, (err?.message as string) ?? `Canva export request failed: ${exportRes.status}`);
	}

	const exportData = (await exportRes.json()) as Record<string, unknown>;
	const exportJobId = ((exportData.job as Record<string, unknown>)?.id) as string | undefined;
	if (!exportJobId) error(502, 'Canva export: no job ID in response');

	// Step 6: Poll until export is complete → get download URL
	const exportDone = await pollUntilDone(`/exports/${exportJobId}`);
	const exportUrls = ((exportDone.job as Record<string, unknown>)?.urls) as string[] | undefined;
	if (!exportUrls?.[0]) error(502, 'Canva export: no download URL in result');

	return json({ url: exportUrls[0], canvaDesignId: designId });
};
