import { error, fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users, scheduledPosts } from '$lib/server/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { canAccessAccount } from '$lib/server/access';
import { supabaseAdmin } from '$lib/server/supabase-admin';
import type { Actions, PageServerLoad } from './$types';

const BUCKET = 'media';

async function getProfile(locals: App.Locals) {
	const { user } = await locals.safeGetSession();
	if (!user) return null;
	const rows = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
	return rows[0] ?? null;
}

export const load: PageServerLoad = async ({ params, parent }) => {
	// Layout already verified access and fetched accountMeta — no need to re-check
	const { profile, accountMeta } = await parent();
	if (!profile) redirect(303, '/login');
	const account = accountMeta;

	const { data: storageFiles, error: listErr } = await supabaseAdmin.storage
		.from(BUCKET)
		.list(params.id, { limit: 200, sortBy: { column: 'created_at', order: 'desc' } });

	if (listErr) {
		console.error('Storage list error:', listErr);
		error(500, 'Could not load media library');
	}

	const files = (storageFiles ?? []).filter((f) => f.name !== '.emptyFolderPlaceholder');

	const filesWithUrl = files.map((f) => {
		const path = `${params.id}/${f.name}`;
		const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
		return {
			name: f.name,
			path,
			url: data.publicUrl,
			size: f.metadata?.size as number | undefined,
			createdAt: f.created_at ?? null
		};
	});

	// Parallel queries for in-use and posted status
	const [activePosts, publishedPosts] = await Promise.all([
		filesWithUrl.length > 0
			? db
					.select({ mediaUrl: scheduledPosts.mediaUrl, carouselItems: scheduledPosts.carouselItems })
					.from(scheduledPosts)
					.where(
						and(
							eq(scheduledPosts.accountId, params.id),
							inArray(scheduledPosts.status, ['pending', 'publishing'])
						)
					)
			: Promise.resolve([]),
		filesWithUrl.length > 0
			? db
					.select({ mediaUrl: scheduledPosts.mediaUrl, carouselItems: scheduledPosts.carouselItems })
					.from(scheduledPosts)
					.where(
						and(
							eq(scheduledPosts.accountId, params.id),
							eq(scheduledPosts.status, 'published')
						)
					)
			: Promise.resolve([])
	]);

	function urlsFromPost(p: { mediaUrl: string; carouselItems: string | null }): string[] {
		const urls = [p.mediaUrl];
		if (p.carouselItems) {
			try { urls.push(...(JSON.parse(p.carouselItems) as string[])); } catch {}
		}
		return urls;
	}

	const lockedUrls = new Set(activePosts.flatMap(urlsFromPost));
	const postedUrls = new Set(publishedPosts.flatMap(urlsFromPost));

	return {
		account,
		files: filesWithUrl.map((f) => ({
			...f,
			inUse: lockedUrls.has(f.url),
			hasBeenPosted: postedUrls.has(f.url)
		}))
	};
};

export const actions: Actions = {
	delete: async ({ request, params, locals }) => {
		const profile = await getProfile(locals);
		if (!profile) redirect(303, '/login');

		const allowed = await canAccessAccount(profile.id, params.id, profile.isAdmin);
		if (!allowed) return fail(403, { error: 'Access denied' });

		const form = await request.formData();
		const path = form.get('path') as string | null;
		if (!path) return fail(400, { error: 'Missing path' });

		if (!path.startsWith(`${params.id}/`)) return fail(400, { error: 'Invalid path' });

		const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
		const publicUrl = urlData.publicUrl;

		// Check both mediaUrl and carousel_items for any pending/publishing post
		const activePosts = await db
			.select({ mediaUrl: scheduledPosts.mediaUrl, carouselItems: scheduledPosts.carouselItems })
			.from(scheduledPosts)
			.where(
				and(
					eq(scheduledPosts.accountId, params.id),
					inArray(scheduledPosts.status, ['pending', 'publishing'])
				)
			);

		const isLocked = activePosts.some((p) => {
			if (p.mediaUrl === publicUrl) return true;
			if (p.carouselItems) {
				try { return (JSON.parse(p.carouselItems) as string[]).includes(publicUrl); } catch {}
			}
			return false;
		});

		if (isLocked) {
			return fail(409, { error: 'Image is used by a scheduled post and cannot be deleted.' });
		}

		const { error: deleteErr } = await supabaseAdmin.storage.from(BUCKET).remove([path]);
		if (deleteErr) {
			console.error('Storage delete error:', deleteErr);
			return fail(500, { error: 'Delete failed' });
		}

		return { deleted: true };
	},

	deleteMany: async ({ request, params, locals }) => {
		const profile = await getProfile(locals);
		if (!profile) redirect(303, '/login');

		const allowed = await canAccessAccount(profile.id, params.id, profile.isAdmin);
		if (!allowed) return fail(403, { error: 'Access denied' });

		const form = await request.formData();
		const paths = form.getAll('path') as string[];

		if (paths.length === 0) return fail(400, { error: 'No paths provided' });

		const invalidPaths = paths.filter((p) => !p.startsWith(`${params.id}/`));
		if (invalidPaths.length > 0) return fail(400, { error: 'Invalid path' });

		// Get URLs for all paths to check against active posts
		const urlMap = new Map(
			paths.map((p) => [p, supabaseAdmin.storage.from(BUCKET).getPublicUrl(p).data.publicUrl])
		);

		const activePosts = await db
			.select({ mediaUrl: scheduledPosts.mediaUrl, carouselItems: scheduledPosts.carouselItems })
			.from(scheduledPosts)
			.where(
				and(
					eq(scheduledPosts.accountId, params.id),
					inArray(scheduledPosts.status, ['pending', 'publishing'])
				)
			);
		const activeUrls = new Set<string>();
		for (const p of activePosts) {
			activeUrls.add(p.mediaUrl);
			if (p.carouselItems) {
				try { for (const u of JSON.parse(p.carouselItems) as string[]) activeUrls.add(u); } catch {}
			}
		}

		// Skip paths that are in use by a pending/publishing post
		const deletable = paths.filter((p) => !activeUrls.has(urlMap.get(p)!));

		if (deletable.length === 0) {
			return fail(409, { error: 'All selected images are in use by scheduled posts.' });
		}

		const { error: deleteErr } = await supabaseAdmin.storage.from(BUCKET).remove(deletable);
		if (deleteErr) {
			console.error('Storage deleteMany error:', deleteErr);
			return fail(500, { error: 'Delete failed' });
		}

		return { deletedCount: deletable.length, skippedCount: paths.length - deletable.length };
	}
};
