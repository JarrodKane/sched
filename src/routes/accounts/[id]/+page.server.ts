import { error, fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users, socialAccounts, scheduledPosts } from '$lib/server/db/schema';
import { eq, and, asc, inArray } from 'drizzle-orm';
import { canAccessAccount, canModifyPost } from '$lib/server/access';
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

	const allowed = await canAccessAccount(profile.id, params.id, profile.isAdmin);
	if (!allowed) error(403, 'Access denied');

	const [account] = await db
		.select()
		.from(socialAccounts)
		.where(eq(socialAccounts.id, params.id))
		.limit(1);
	if (!account) error(404, 'Account not found');

	const queue = await db
		.select()
		.from(scheduledPosts)
		.where(and(eq(scheduledPosts.accountId, params.id), inArray(scheduledPosts.status, ['pending', 'publishing'])))
		.orderBy(asc(scheduledPosts.scheduledFor));

	return { account, queue };
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
			.set({ status: 'failed', errorMessage: 'Cancelled by user' })
			.where(eq(scheduledPosts.id, postId));

		return { cancelled: true };
	}
};
