/**
 * +server.ts — /api/upload
 * POST endpoint for uploading a media image to Supabase Storage.
 * Accepts multipart/form-data with fields: file (required), thumbnail (optional),
 * account_id (required). Verifies the user has access to the account first.
 *
 * Storage layout:
 *   Main image  → [accountId]/[timestamp].[ext]          (appears in media library)
 *   Thumbnail   → _thumbs/[accountId]/[timestamp]_thumb.jpg  (hidden from library)
 *
 * The _thumbs/ prefix keeps thumbnails out of the media library listing.
 * Thumbnail upload failures are silently swallowed (best-effort).
 *
 * Returns: { url, thumbnailUrl } — the public Supabase Storage URLs.
 *
 * SvelteKit concepts:
 *   RequestHandler (POST) — plain JSON endpoint; called by CropModal after cropping
 *   json()   — from @sveltejs/kit; wraps the response
 *   error()  — throws HTTP errors for auth, size, type, or upload failures
 */
import { json, error } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase-admin';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { canAccessAccount } from '$lib/server/access';
import type { RequestHandler } from './$types';

const BUCKET = 'media';
const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) error(401, 'Unauthorized');

	const form = await request.formData();
	const file = form.get('file') as File | null;
	const thumbnail = form.get('thumbnail') as File | null;
	const accountId = form.get('account_id') as string | null;

	if (!file || !accountId) error(400, 'Missing file or account_id');
	if (!file.type.startsWith('image/')) error(400, 'Only image files are supported');
	if (file.size > MAX_SIZE_BYTES) error(400, 'File too large (max 20 MB)');

	const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
	if (!profile || !await canAccessAccount(profile.id, accountId, profile.isAdmin)) {
		error(403, 'Access denied');
	}

	const timestamp = Date.now();
	const ext = file.name.split('.').pop() ?? 'jpg';
	const path = `${accountId}/${timestamp}.${ext}`;
	const buffer = await file.arrayBuffer();

	const { error: uploadError } = await supabaseAdmin.storage
		.from(BUCKET)
		.upload(path, buffer, { contentType: file.type, upsert: false });

	if (uploadError) {
		console.error('Storage upload error:', uploadError);
		error(500, 'Upload failed');
	}

	const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);

	// Upload thumbnail to _thumbs/ prefix so it doesn't appear in the media library
	let thumbnailUrl: string | null = null;
	if (thumbnail && thumbnail.size > 0 && thumbnail.type.startsWith('image/')) {
		try {
			const thumbPath = `_thumbs/${accountId}/${timestamp}_thumb.jpg`;
			const thumbBuffer = await thumbnail.arrayBuffer();
			const { error: thumbErr } = await supabaseAdmin.storage
				.from(BUCKET)
				.upload(thumbPath, thumbBuffer, { contentType: 'image/jpeg', upsert: false });
			if (!thumbErr) {
				const { data: thumbData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(thumbPath);
				thumbnailUrl = thumbData.publicUrl;
			}
		} catch {
			// Thumbnail is best-effort — don't fail the whole upload
		}
	}

	return json({ url: data.publicUrl, thumbnailUrl });
};
