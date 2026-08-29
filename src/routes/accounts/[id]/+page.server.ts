import { error, fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users, socialAccounts, scheduledPosts, captionSnippets } from '$lib/server/db/schema';
import { eq, and, asc, inArray, desc } from 'drizzle-orm';
import { canAccessAccount, canModifyPost } from '$lib/server/access';
import { publishPost } from '$lib/platforms/instagram';
import { supabaseAdmin } from '$lib/server/supabase-admin';
import type { Actions, PageServerLoad } from './$types';

async function getProfile(locals: App.Locals) {
	const { user } = await locals.safeGetSession();
	if (!user) return null;
	const rows = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
	return rows[0] ?? null;
}

export const load: PageServerLoad = async ({ params, parent }) => {
	const { profile } = await parent();
	if (!profile) redirect(303, '/login');

	// Run all independent queries in parallel after the profile is resolved
	const [allowed, accountRows, queue, storageResult, snippets] = await Promise.all([
		canAccessAccount(profile.id, params.id, profile.isAdmin),
		db.select().from(socialAccounts).where(eq(socialAccounts.id, params.id)).limit(1),
		db
			.select()
			.from(scheduledPosts)
			.where(and(eq(scheduledPosts.accountId, params.id), inArray(scheduledPosts.status, ['pending', 'publishing'])))
			.orderBy(asc(scheduledPosts.scheduledFor)),
		supabaseAdmin.storage
			.from('media')
			.list(params.id, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } }),
		db
			.select()
			.from(captionSnippets)
			.where(eq(captionSnippets.accountId, params.id))
			.orderBy(asc(captionSnippets.sortOrder), asc(captionSnippets.createdAt))
	]);

	if (!allowed) error(403, 'Access denied');
	const account = accountRows[0];
	if (!account) error(404, 'Account not found');

	const priorUploads = (storageResult.data ?? []).map((f) => ({
		name: f.name,
		url: supabaseAdmin.storage.from('media').getPublicUrl(`${params.id}/${f.name}`).data.publicUrl
	}));

	return { account, queue, priorUploads, snippets };
};

export const actions: Actions = {
	schedule: async ({ request, params, locals }) => {
		const profile = await getProfile(locals);
		if (!profile) redirect(303, '/login');

		const allowed = await canAccessAccount(profile.id, params.id, profile.isAdmin);
		if (!allowed) return fail(403, { error: 'Access denied' });

		const form = await request.formData();
		const type = form.get('type') as string;
		const caption = form.get('caption') as string | null;
		const mediaUrl = form.get('media_url') as string;
		const scheduledFor = form.get('scheduled_for') as string;
		const thumbnailUrl = (form.get('thumbnail_url') as string | null) || null;

		if (!type || !mediaUrl || !scheduledFor) {
			return fail(400, { error: 'Missing required fields.' });
		}
		if (type !== 'feed' && type !== 'story') {
			return fail(400, { error: 'Invalid post type.' });
		}
		if (!mediaUrl.startsWith('https://')) {
			return fail(400, { error: 'Invalid media URL.' });
		}

		const scheduledDate = new Date(scheduledFor);
		if (isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
			return fail(400, { error: 'Scheduled time must be in the future.' });
		}

		await db.insert(scheduledPosts).values({
			accountId: params.id,
			createdBy: profile.id,
			type,
			caption: type === 'feed' ? (caption || null) : null,
			mediaUrl,
			thumbnailUrl,
			scheduledFor: scheduledDate,
			status: 'pending'
		});

		return { success: true };
	},

	cancel: async ({ request, locals }) => {
		const profile = await getProfile(locals);
		if (!profile) redirect(303, '/login');

		const form = await request.formData();
		const postId = form.get('post_id') as string;
		if (!postId) return fail(400, { error: 'Missing post ID.' });

		const allowed = await canModifyPost(profile.id, postId, profile.isAdmin);
		if (!allowed) return fail(403, { error: 'Access denied' });

		const [post] = await db
			.select()
			.from(scheduledPosts)
			.where(eq(scheduledPosts.id, postId))
			.limit(1);
		if (!post || post.status !== 'pending') {
			return fail(400, { error: 'Post cannot be cancelled.' });
		}

		await db
			.update(scheduledPosts)
			.set({ status: 'cancelled' })
			.where(eq(scheduledPosts.id, postId));

		return { cancelled: true };
	},

	editCaption: async ({ request, locals }) => {
		const profile = await getProfile(locals);
		if (!profile) redirect(303, '/login');

		const form = await request.formData();
		const postId = form.get('post_id') as string;
		const caption = (form.get('caption') as string | null) ?? '';

		if (!postId) return fail(400, { error: 'Missing post ID.' });

		const allowed = await canModifyPost(profile.id, postId, profile.isAdmin);
		if (!allowed) return fail(403, { error: 'Access denied' });

		const [post] = await db
			.select()
			.from(scheduledPosts)
			.where(eq(scheduledPosts.id, postId))
			.limit(1);
		if (!post || post.status !== 'pending') {
			return fail(400, { error: 'Post cannot be edited.' });
		}
		if (post.type !== 'feed') {
			return fail(400, { error: 'Only feed posts have captions.' });
		}

		await db
			.update(scheduledPosts)
			.set({ caption: caption || null })
			.where(eq(scheduledPosts.id, postId));

		return { captionEdited: true };
	},

	reschedule: async ({ request, locals }) => {
		const profile = await getProfile(locals);
		if (!profile) redirect(303, '/login');

		const form = await request.formData();
		const postId = form.get('post_id') as string;
		const scheduledFor = form.get('scheduled_for') as string;

		if (!postId || !scheduledFor) return fail(400, { error: 'Missing fields.' });

		const allowed = await canModifyPost(profile.id, postId, profile.isAdmin);
		if (!allowed) return fail(403, { error: 'Access denied' });

		const [post] = await db
			.select()
			.from(scheduledPosts)
			.where(eq(scheduledPosts.id, postId))
			.limit(1);
		if (!post || post.status !== 'pending') {
			return fail(400, { error: 'Post cannot be rescheduled.' });
		}

		const scheduledDate = new Date(scheduledFor);
		if (isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
			return fail(400, { error: 'New time must be in the future.' });
		}

		await db
			.update(scheduledPosts)
			.set({ scheduledFor: scheduledDate })
			.where(eq(scheduledPosts.id, postId));

		return { rescheduled: true };
	},

	publishNow: async ({ request, params, locals }) => {
		const profile = await getProfile(locals);
		if (!profile) redirect(303, '/login');

		const allowed = await canAccessAccount(profile.id, params.id, profile.isAdmin);
		if (!allowed) return fail(403, { error: 'Access denied' });

		const form = await request.formData();
		const type = form.get('type') as string;
		const caption = form.get('caption') as string | null;
		const mediaUrl = form.get('media_url') as string;
		const thumbnailUrl = (form.get('thumbnail_url') as string | null) || null;

		if (!type || !mediaUrl) return fail(400, { error: 'Missing required fields.' });
		if (type !== 'feed' && type !== 'story') return fail(400, { error: 'Invalid post type.' });
		if (!mediaUrl.startsWith('https://')) return fail(400, { error: 'Invalid media URL.' });

		const [account] = await db
			.select()
			.from(socialAccounts)
			.where(eq(socialAccounts.id, params.id))
			.limit(1);
		if (!account?.accessToken) return fail(400, { error: 'Account not connected.' });

		const now = new Date();
		const [post] = await db
			.insert(scheduledPosts)
			.values({
				accountId: params.id,
				createdBy: profile.id,
				type,
				caption: type === 'feed' ? (caption || null) : null,
				mediaUrl,
				thumbnailUrl,
				scheduledFor: now,
				status: 'publishing'
			})
			.returning({ id: scheduledPosts.id });

		try {
			await publishPost(
				account.igBusinessId,
				account.accessToken,
				type as 'feed' | 'story',
				mediaUrl,
				type === 'feed' ? caption : null
			);

			await db
				.update(scheduledPosts)
				.set({ status: 'published', publishedAt: new Date() })
				.where(eq(scheduledPosts.id, post.id));

			return { published: true };
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Publish failed';
			await db
				.update(scheduledPosts)
				.set({ status: 'failed', errorMessage: message })
				.where(eq(scheduledPosts.id, post.id));
			return fail(500, { error: message });
		}
	}
};
