import { error, fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users, socialAccounts, scheduledPosts, captionSnippets, tagSnippets, shows, ticketSnapshots } from '$lib/server/db/schema';
import { eq, and, asc, desc, gte, lte, inArray } from 'drizzle-orm';
import { canAccessAccount, canModifyPost } from '$lib/server/access';
import { supabaseAdmin } from '$lib/server/supabase-admin';
import type { Actions, PageServerLoad } from './$types';

async function getProfile(locals: App.Locals) {
	const { user } = await locals.safeGetSession();
	if (!user) return null;
	const rows = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
	return rows[0] ?? null;
}

export const load: PageServerLoad = async ({ params, parent }) => {
	const { profile, canAccessSocial, canAccessTickets, accountMeta } = await parent();
	if (!profile) redirect(303, '/login');

	// Layout already enforced account access — just load what's needed for each view
	if (!canAccessSocial) {
		const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
		const d = new Date(today + 'T12:00:00');
		const daysBack = d.getDay() === 0 ? 6 : d.getDay() - 1;
		d.setDate(d.getDate() - daysBack);
		const weekStart = d.toISOString().slice(0, 10);
		const weekEndDate = new Date(d); weekEndDate.setDate(d.getDate() + 6);
		const weekEnd = weekEndDate.toISOString().slice(0, 10);

		const [queue, accountShows] = await Promise.all([
			db
				.select()
				.from(scheduledPosts)
				.where(and(eq(scheduledPosts.accountId, params.id), inArray(scheduledPosts.status, ['pending', 'publishing'])))
				.orderBy(asc(scheduledPosts.scheduledFor)),
			canAccessTickets
				? db.select().from(shows).where(and(eq(shows.accountId, params.id), eq(shows.isActive, true))).orderBy(shows.name)
				: Promise.resolve([])
		]);

		let ticketShowDates: { id: string; name: string; capacity: number | null; snapshot: typeof ticketSnapshots.$inferSelect }[] = [];
		if (canAccessTickets && accountShows.length > 0) {
			const showIds = accountShows.map((s) => s.id);
			const weekSnaps = await db
				.select()
				.from(ticketSnapshots)
				.where(and(inArray(ticketSnapshots.showId, showIds), gte(ticketSnapshots.showDate, weekStart), lte(ticketSnapshots.showDate, weekEnd)))
				.orderBy(asc(ticketSnapshots.showDate));
			ticketShowDates = weekSnaps.flatMap((snap) => {
				const show = accountShows.find((s) => s.id === snap.showId);
				return show ? [{ id: show.id, name: show.name, capacity: show.capacity ?? null, snapshot: snap }] : [];
			});
		}

		return { account: accountMeta, queue, priorUploads: [], snippets: [], tagSnippets: [], history: [], ticketShowDates, today, weekStart };
	}

	const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
	const [accountRows, queue, storageResult, snippets, tags, history] = await Promise.all([
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
			.orderBy(asc(captionSnippets.sortOrder), asc(captionSnippets.createdAt)),
		db
			.select()
			.from(tagSnippets)
			.where(eq(tagSnippets.accountId, params.id))
			.orderBy(asc(tagSnippets.sortOrder), asc(tagSnippets.createdAt)),
		db
			.select({
				id: scheduledPosts.id,
				type: scheduledPosts.type,
				caption: scheduledPosts.caption,
				mediaUrl: scheduledPosts.mediaUrl,
				thumbnailUrl: scheduledPosts.thumbnailUrl,
				carouselItems: scheduledPosts.carouselItems,
				status: scheduledPosts.status,
				errorMessage: scheduledPosts.errorMessage,
				scheduledFor: scheduledPosts.scheduledFor,
				publishedAt: scheduledPosts.publishedAt
			})
			.from(scheduledPosts)
			.where(
				and(
					eq(scheduledPosts.accountId, params.id),
					inArray(scheduledPosts.status, ['published', 'failed', 'cancelled']),
					gte(scheduledPosts.scheduledFor, thirtyDaysAgo)
				)
			)
			.orderBy(desc(scheduledPosts.scheduledFor))
			.limit(20)
	]);

	const account = accountRows[0];
	if (!account) error(404, 'Account not found');

	const priorUploads = (storageResult.data ?? []).map((f) => ({
		name: f.name,
		url: supabaseAdmin.storage.from('media').getPublicUrl(`${params.id}/${f.name}`).data.publicUrl
	}));

	return { account, queue, priorUploads, snippets, tagSnippets: tags, history };
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
		const userTagsRaw = (form.get('user_tags') as string | null) || null;
		const carouselItemsRaw = (form.get('carousel_items') as string | null) || null;

		if (!type || !mediaUrl || !scheduledFor) {
			return fail(400, { error: 'Missing required fields.' });
		}
		if (type !== 'feed' && type !== 'story' && type !== 'carousel') {
			return fail(400, { error: 'Invalid post type.' });
		}
		if (!mediaUrl.startsWith('https://')) {
			return fail(400, { error: 'Invalid media URL.' });
		}
		if (type === 'carousel') {
			let items: string[];
			try { items = JSON.parse(carouselItemsRaw ?? '[]'); } catch { return fail(400, { error: 'Invalid carousel data.' }); }
			if (!Array.isArray(items) || items.length < 2) return fail(400, { error: 'Carousel needs at least 2 images.' });
			if (items.length > 10) return fail(400, { error: 'Carousel supports up to 10 images.' });
		}

		const scheduledDate = new Date(scheduledFor);
		if (isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
			return fail(400, { error: 'Scheduled time must be in the future.' });
		}

		await db.insert(scheduledPosts).values({
			accountId: params.id,
			createdBy: profile.id,
			type,
			caption: (type === 'feed' || type === 'carousel') ? (caption || null) : null,
			mediaUrl,
			carouselItems: type === 'carousel' ? carouselItemsRaw : null,
			userTags: type !== 'story' ? (userTagsRaw || null) : null,
			thumbnailUrl,
			scheduledFor: scheduledDate,
			status: 'pending'
		});

		return { success: true };
	},

	retry: async ({ request, locals }) => {
		const profile = await getProfile(locals);
		if (!profile) redirect(303, '/login');

		const form = await request.formData();
		const postId = form.get('post_id') as string;
		if (!postId) return fail(400, { error: 'Missing post ID.' });

		const allowed = await canModifyPost(profile.id, postId, profile.isAdmin);
		if (!allowed) return fail(403, { error: 'Access denied' });

		const [post] = await db.select().from(scheduledPosts).where(eq(scheduledPosts.id, postId)).limit(1);
		if (!post || post.status !== 'failed') {
			return fail(400, { error: 'Only failed posts can be retried.' });
		}

		await db
			.update(scheduledPosts)
			.set({ status: 'pending', errorMessage: null, scheduledFor: new Date() })
			.where(eq(scheduledPosts.id, postId));

		return { retried: true };
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
		if (post.type !== 'feed' && post.type !== 'carousel') {
			return fail(400, { error: 'Only feed and carousel posts have captions.' });
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
		const userTagsRaw = (form.get('user_tags') as string | null) || null;
		const carouselItemsRaw = (form.get('carousel_items') as string | null) || null;

		if (!type || !mediaUrl) return fail(400, { error: 'Missing required fields.' });
		if (type !== 'feed' && type !== 'story' && type !== 'carousel') return fail(400, { error: 'Invalid post type.' });
		if (!mediaUrl.startsWith('https://')) return fail(400, { error: 'Invalid media URL.' });
		if (type === 'carousel') {
			let items: string[];
			try { items = JSON.parse(carouselItemsRaw ?? '[]'); } catch { return fail(400, { error: 'Invalid carousel data.' }); }
			if (!Array.isArray(items) || items.length < 2) return fail(400, { error: 'Carousel needs at least 2 images.' });
			if (items.length > 10) return fail(400, { error: 'Carousel supports up to 10 images.' });
		}

		// Insert as pending with scheduled_for = now — the Edge Function picks it up within 60s.
		// Avoids running the full publish flow (including Instagram container polling) inside a
		// serverless function that has a short timeout.
		await db.insert(scheduledPosts).values({
			accountId: params.id,
			createdBy: profile.id,
			type,
			caption: (type === 'feed' || type === 'carousel') ? (caption || null) : null,
			mediaUrl,
			carouselItems: type === 'carousel' ? carouselItemsRaw : null,
			userTags: type !== 'story' ? (userTagsRaw || null) : null,
			thumbnailUrl,
			scheduledFor: new Date(),
			status: 'pending'
		});

		return { published: true };
	}
};
