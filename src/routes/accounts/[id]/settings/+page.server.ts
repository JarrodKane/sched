/**
 * +page.server.ts — /accounts/[id]/settings
 * Account settings page. Loads the account's location tag, AI caption instructions,
 * caption snippets, and tag shortcuts.
 *
 * Actions:
 *   updateLocation       — save the Facebook Place ID + display name
 *   updateAiInstructions — save the account-level AI prompt instructions
 *   addSnippet           — create a new caption snippet
 *   updateSnippet        — update label/text of an existing snippet
 *   deleteSnippet        — delete a snippet
 *   toggleSnippetAi      — flip the useInAi flag on a snippet
 *   addTag               — create a new tag shortcut
 *   updateTag            — update label/username/category of a tag
 *   deleteTag            — delete a tag
 *   toggleTagAi          — flip the useInAi flag on a tag
 *
 * SvelteKit concepts:
 *   load()   — reads parent() for accountMeta + canAccessSocial
 *   actions  — ten named actions; each re-checks access before mutating
 *   fail()   — returns 4xx with field-specific error keys
 */
import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users, socialAccounts, captionSnippets, tagSnippets } from '$lib/server/db/schema';
import { eq, asc } from 'drizzle-orm';
import { canAccessAccount } from '$lib/server/access';
import type { Actions, PageServerLoad } from './$types';

async function getProfile(locals: App.Locals) {
	const { user } = await locals.safeGetSession();
	if (!user) return null;
	const rows = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
	return rows[0] ?? null;
}

async function requireAccess(locals: App.Locals, accountId: string) {
	const profile = await getProfile(locals);
	if (!profile) return null;
	const allowed = await canAccessAccount(profile.id, accountId, profile.isAdmin);
	return allowed ? profile : null;
}

export const load: PageServerLoad = async ({ params, parent }) => {
	const { profile } = await parent();
	if (!profile) redirect(303, '/login');

	const [snippets, tags, accountRows] = await Promise.all([
		db
			.select({ id: captionSnippets.id, accountId: captionSnippets.accountId, label: captionSnippets.label, text: captionSnippets.text, useInAi: captionSnippets.useInAi, sortOrder: captionSnippets.sortOrder, createdAt: captionSnippets.createdAt })
			.from(captionSnippets)
			.where(eq(captionSnippets.accountId, params.id))
			.orderBy(asc(captionSnippets.sortOrder), asc(captionSnippets.createdAt)),
		db
			.select({ id: tagSnippets.id, accountId: tagSnippets.accountId, label: tagSnippets.label, username: tagSnippets.username, category: tagSnippets.category, useInAi: tagSnippets.useInAi, sortOrder: tagSnippets.sortOrder, createdAt: tagSnippets.createdAt })
			.from(tagSnippets)
			.where(eq(tagSnippets.accountId, params.id))
			.orderBy(asc(tagSnippets.sortOrder), asc(tagSnippets.createdAt)),
		db
			.select({ locationId: socialAccounts.locationId, locationName: socialAccounts.locationName, aiInstructions: socialAccounts.aiInstructions })
			.from(socialAccounts)
			.where(eq(socialAccounts.id, params.id))
			.limit(1)
	]);

	return {
		snippets,
		tags,
		location: {
			id: accountRows[0]?.locationId ?? null,
			name: accountRows[0]?.locationName ?? null
		},
		aiInstructions: accountRows[0]?.aiInstructions ?? null
	};
};

export const actions: Actions = {
	updateLocation: async ({ request, params, locals }) => {
		const profile = await requireAccess(locals, params.id);
		if (!profile) return fail(403, { error: 'Access denied' });

		const form = await request.formData();
		const locationId = (form.get('location_id') as string | null)?.trim() || null;
		const locationName = (form.get('location_name') as string | null)?.trim() || null;

		if (locationId && !locationName) return fail(400, { error: 'Provide a display name for the location.' });
		if (locationName && !locationId) return fail(400, { error: 'Provide a Facebook Place ID.' });

		await db
			.update(socialAccounts)
			.set({ locationId, locationName })
			.where(eq(socialAccounts.id, params.id));

		return { locationSaved: true };
	},

	updateAiInstructions: async ({ request, params, locals }) => {
		const profile = await requireAccess(locals, params.id);
		if (!profile) return fail(403, { error: 'Access denied' });

		const form = await request.formData();
		const aiInstructions = (form.get('ai_instructions') as string | null)?.trim() || null;

		await db
			.update(socialAccounts)
			.set({ aiInstructions })
			.where(eq(socialAccounts.id, params.id));

		return { aiInstructionsSaved: true };
	},

	toggleSnippetAi: async ({ request, params, locals }) => {
		const profile = await requireAccess(locals, params.id);
		if (!profile) return fail(403, { error: 'Access denied' });

		const form = await request.formData();
		const id = form.get('id') as string;
		const useInAi = form.get('use_in_ai') === 'true';
		if (!id) return fail(400, { error: 'Missing snippet ID.' });

		await db.update(captionSnippets).set({ useInAi }).where(eq(captionSnippets.id, id));
		return { snippetAiToggled: true };
	},

	toggleTagAi: async ({ request, params, locals }) => {
		const profile = await requireAccess(locals, params.id);
		if (!profile) return fail(403, { error: 'Access denied' });

		const form = await request.formData();
		const id = form.get('id') as string;
		const useInAi = form.get('use_in_ai') === 'true';
		if (!id) return fail(400, { error: 'Missing tag ID.' });

		await db.update(tagSnippets).set({ useInAi }).where(eq(tagSnippets.id, id));
		return { tagAiToggled: true };
	},

	addSnippet: async ({ request, params, locals }) => {
		const profile = await requireAccess(locals, params.id);
		if (!profile) return fail(403, { error: 'Access denied' });

		const form = await request.formData();
		const label = (form.get('label') as string | null)?.trim();
		const text = (form.get('text') as string | null)?.trim();

		if (!label || !text) return fail(400, { error: 'Label and text are required.' });
		if (label.length > 60) return fail(400, { error: 'Label must be 60 characters or less.' });

		await db.insert(captionSnippets).values({ accountId: params.id, label, text });
		return { snippetAdded: true };
	},

	updateSnippet: async ({ request, params, locals }) => {
		const profile = await requireAccess(locals, params.id);
		if (!profile) return fail(403, { error: 'Access denied' });

		const form = await request.formData();
		const id = form.get('id') as string;
		const label = (form.get('label') as string | null)?.trim();
		const text = (form.get('text') as string | null)?.trim();

		if (!id || !label || !text) return fail(400, { error: 'All fields required.' });

		await db
			.update(captionSnippets)
			.set({ label, text })
			.where(eq(captionSnippets.id, id));

		return { snippetUpdated: true };
	},

	deleteSnippet: async ({ request, params, locals }) => {
		const profile = await requireAccess(locals, params.id);
		if (!profile) return fail(403, { error: 'Access denied' });

		const form = await request.formData();
		const id = form.get('id') as string;
		if (!id) return fail(400, { error: 'Missing snippet ID.' });

		await db
			.delete(captionSnippets)
			.where(eq(captionSnippets.id, id));

		return { snippetDeleted: true };
	},

	addTag: async ({ request, params, locals }) => {
		const profile = await requireAccess(locals, params.id);
		if (!profile) return fail(403, { error: 'Access denied' });

		const form = await request.formData();
		const label = (form.get('label') as string | null)?.trim();
		const username = (form.get('username') as string | null)?.trim().replace(/^@/, '');
		const category = (form.get('category') as string | null)?.trim() || null;

		if (!label || !username) return fail(400, { error: 'Label and username are required.' });
		if (label.length > 60) return fail(400, { error: 'Label must be 60 characters or less.' });

		await db.insert(tagSnippets).values({ accountId: params.id, label, username, category });
		return { tagAdded: true };
	},

	updateTag: async ({ request, params, locals }) => {
		const profile = await requireAccess(locals, params.id);
		if (!profile) return fail(403, { error: 'Access denied' });

		const form = await request.formData();
		const id = form.get('id') as string;
		const label = (form.get('label') as string | null)?.trim();
		const username = (form.get('username') as string | null)?.trim().replace(/^@/, '');
		const category = (form.get('category') as string | null)?.trim() || null;

		if (!id || !label || !username) return fail(400, { error: 'All fields required.' });

		await db
			.update(tagSnippets)
			.set({ label, username, category })
			.where(eq(tagSnippets.id, id));

		return { tagUpdated: true };
	},

	deleteTag: async ({ request, params, locals }) => {
		const profile = await requireAccess(locals, params.id);
		if (!profile) return fail(403, { error: 'Access denied' });

		const form = await request.formData();
		const id = form.get('id') as string;
		if (!id) return fail(400, { error: 'Missing tag ID.' });

		await db
			.delete(tagSnippets)
			.where(eq(tagSnippets.id, id));

		return { tagDeleted: true };
	}
};
