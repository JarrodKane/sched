/**
 * +server.ts — /api/people-upload/[id]
 * Public endpoint for a person to upload their own profile photo.
 * No auth required — the person UUID in the URL acts as the unguessable token.
 *
 * POST multipart/form-data with a 'file' field:
 *   - Verifies the person exists
 *   - Uploads to media bucket at people/[id]/[timestamp].[ext]
 *   - Updates people.photo_url and deletes the previous photo from storage
 *   - Returns { url, thumbnailUrl: null }
 */
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { people } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { supabaseAdmin } from '$lib/server/supabase-admin';
import type { RequestEvent } from '@sveltejs/kit';

const BUCKET = 'media';
const MAX_SIZE = 20 * 1024 * 1024;

function storagePathFromUrl(url: string): string | null {
	const marker = '/object/public/' + BUCKET + '/';
	const idx = url.indexOf(marker);
	if (idx < 0) return null;
	return url.slice(idx + marker.length).split('?')[0];
}

export const POST = async ({ request, params }: RequestEvent) => {
	const [person] = await db
		.select({ id: people.id, photoUrl: people.photoUrl })
		.from(people)
		.where(eq(people.id, params.id as string))
		.limit(1);

	if (!person) error(404, 'Not found');

	const form = await request.formData();
	const file = form.get('file') as File | null;

	if (!file) error(400, 'Missing file');
	if (!file.type.startsWith('image/')) error(400, 'Only image files are supported');
	if (file.size > MAX_SIZE) error(400, 'File too large (max 20 MB)');

	const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
	const path = `people/${params.id as string}/${Date.now()}.${ext}`;
	const buffer = await file.arrayBuffer();

	const { error: uploadError } = await supabaseAdmin.storage
		.from(BUCKET)
		.upload(path, buffer, { contentType: file.type, upsert: false });

	if (uploadError) error(500, 'Upload failed');

	const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
	const photoUrl = data.publicUrl;

	const oldUrl = person.photoUrl;
	await db.update(people).set({ photoUrl }).where(eq(people.id, params.id as string));

	if (oldUrl) {
		const oldPath = storagePathFromUrl(oldUrl);
		if (oldPath) await supabaseAdmin.storage.from(BUCKET).remove([oldPath]).catch(() => {});
	}

	return json({ url: photoUrl, thumbnailUrl: null });
};
