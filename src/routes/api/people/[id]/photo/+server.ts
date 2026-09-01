import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { people } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { supabaseAdmin } from '$lib/server/supabase-admin';
import type { RequestHandler } from './$types';

const BUCKET = 'media';
const PEOPLE_MAX_SIZE = 20 * 1024 * 1024; // 20 MB — people photos are reference images, preserve quality

function storagePathFromUrl(url: string): string | null {
	const marker = '/object/public/' + BUCKET + '/';
	const idx = url.indexOf(marker);
	if (idx < 0) return null;
	// Strip any query string (Supabase transform params etc.)
	return url.slice(idx + marker.length).split('?')[0];
}

async function deleteOldPhoto(oldUrl: string | null | undefined) {
	if (!oldUrl) return;
	const oldPath = storagePathFromUrl(oldUrl);
	if (oldPath) await supabaseAdmin.storage.from(BUCKET).remove([oldPath]).catch(() => {});
}

// POST multipart file — uploads the file directly to storage (preserves original format/quality)
// and updates people.photo_url, deleting any previous photo.
export const POST: RequestHandler = async ({ request, locals, params }) => {
	const { user } = await locals.safeGetSession();
	if (!user) error(401, 'Unauthorized');

	const form = await request.formData();
	const file = form.get('file') as File | null;
	if (!file) error(400, 'Missing file');
	if (!file.type.startsWith('image/')) error(400, 'Only image files are supported');
	if (file.size > PEOPLE_MAX_SIZE) error(400, 'File too large (max 20 MB)');

	const [existing] = await db.select({ photoUrl: people.photoUrl }).from(people).where(eq(people.id, params.id));

	const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
	const path = `people/${params.id}/${Date.now()}.${ext}`;
	const buffer = await file.arrayBuffer();

	const { error: uploadError } = await supabaseAdmin.storage
		.from(BUCKET)
		.upload(path, buffer, { contentType: file.type, upsert: false });
	if (uploadError) error(500, 'Upload failed');

	const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
	const photoUrl = data.publicUrl;

	await db.update(people).set({ photoUrl }).where(eq(people.id, params.id));
	await deleteOldPhoto(existing?.photoUrl);

	return json({ url: photoUrl });
};

// PATCH { photoUrl } — saves a URL that was already uploaded (e.g. via CropModal) to people.photo_url
// and deletes the previous photo from storage if one existed.
export const PATCH: RequestHandler = async ({ request, locals, params }) => {
	const { user } = await locals.safeGetSession();
	if (!user) error(401, 'Unauthorized');

	const body = await request.json();
	const photoUrl = (body.photoUrl as string | null)?.trim() || null;

	// Fetch old URL before overwriting
	const [existing] = await db.select({ photoUrl: people.photoUrl }).from(people).where(eq(people.id, params.id));
	const oldUrl = existing?.photoUrl ?? null;

	await db.update(people).set({ photoUrl }).where(eq(people.id, params.id));
	await deleteOldPhoto(oldUrl);

	return json({ ok: true });
};
