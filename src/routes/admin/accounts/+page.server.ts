import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users, socialAccounts, captionSnippets, tagSnippets, shows } from '$lib/server/db/schema';
import { eq, asc } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

async function requireAdmin(locals: App.Locals) {
	const { user } = await locals.safeGetSession();
	if (!user) return null;
	const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
	return profile?.isAdmin ? profile : null;
}

export const load: PageServerLoad = async ({ url }) => {
	const [accounts, allSnippets, allTagSnippets, allShows] = await Promise.all([
		db.select().from(socialAccounts).orderBy(socialAccounts.label),
		db.select().from(captionSnippets).orderBy(asc(captionSnippets.sortOrder), asc(captionSnippets.createdAt)),
		db.select().from(tagSnippets).orderBy(asc(tagSnippets.sortOrder), asc(tagSnippets.createdAt)),
		db.select().from(shows).orderBy(asc(shows.createdAt))
	]);

	const snippetsByAccount = new Map<string, typeof allSnippets>();
	for (const s of allSnippets) {
		const existing = snippetsByAccount.get(s.accountId) ?? [];
		existing.push(s);
		snippetsByAccount.set(s.accountId, existing);
	}

	const tagSnippetsByAccount = new Map<string, typeof allTagSnippets>();
	for (const t of allTagSnippets) {
		const existing = tagSnippetsByAccount.get(t.accountId) ?? [];
		existing.push(t);
		tagSnippetsByAccount.set(t.accountId, existing);
	}

	const showsByAccount = new Map<string, typeof allShows>();
	for (const s of allShows) {
		const existing = showsByAccount.get(s.accountId) ?? [];
		existing.push(s);
		showsByAccount.set(s.accountId, existing);
	}

	return {
		accounts: accounts.map((a) => ({
			...a,
			snippets: snippetsByAccount.get(a.id) ?? [],
			tagSnippets: tagSnippetsByAccount.get(a.id) ?? [],
			shows: showsByAccount.get(a.id) ?? []
		})),
		connectMessage: url.searchParams.get('message'),
		connectError: url.searchParams.get('error')
	};
};

export const actions: Actions = {
	add: async ({ request, locals }) => {
		if (!await requireAdmin(locals)) return fail(403, { addError: 'Access denied' });

		const form = await request.formData();
		const label = (form.get('label') as string)?.trim();
		const igBusinessId = (form.get('ig_business_id') as string)?.trim();
		const fbPageId = (form.get('fb_page_id') as string)?.trim();
		const accessToken = (form.get('access_token') as string)?.trim();
		const tokenExpiresAt = form.get('token_expires_at') as string | null;

		if (!label || !igBusinessId || !accessToken) {
			return fail(400, { addError: 'Label, IG Business ID, and access token are required.' });
		}

		await db.insert(socialAccounts).values({
			label,
			igBusinessId,
			fbPageId: fbPageId || igBusinessId,
			accessToken,
			tokenExpiresAt: tokenExpiresAt ? new Date(tokenExpiresAt) : null
		});

		return { added: true };
	},

	remove: async ({ request, locals }) => {
		if (!await requireAdmin(locals)) return fail(403, { removeError: 'Access denied' });

		const form = await request.formData();
		const id = form.get('id') as string;
		if (!id) return fail(400, { removeError: 'Missing account ID.' });

		await db.delete(socialAccounts).where(eq(socialAccounts.id, id));
		return { removed: true };
	},

	addSnippet: async ({ request, locals }) => {
		if (!await requireAdmin(locals)) return fail(403, { snippetError: 'Access denied', snippetAccountId: '' });

		const form = await request.formData();
		const accountId = (form.get('account_id') as string)?.trim();
		const snippetLabel = (form.get('snippet_label') as string)?.trim();
		const snippetText = (form.get('snippet_text') as string) ?? '';

		if (!accountId || !snippetLabel || !snippetText.trim()) {
			return fail(400, { snippetError: 'Label and text are required.', snippetAccountId: accountId });
		}

		await db.insert(captionSnippets).values({
			accountId,
			label: snippetLabel,
			text: snippetText
		});

		return { snippetAdded: true };
	},

	deleteSnippet: async ({ request, locals }) => {
		if (!await requireAdmin(locals)) return fail(403, { snippetError: 'Access denied' });

		const form = await request.formData();
		const id = (form.get('id') as string)?.trim();
		if (!id) return fail(400, { snippetError: 'Missing snippet ID.' });

		await db.delete(captionSnippets).where(eq(captionSnippets.id, id));
		return { snippetDeleted: true };
	},

	addTagSnippet: async ({ request, locals }) => {
		if (!await requireAdmin(locals)) return fail(403, { tagSnippetError: 'Access denied' });

		const form = await request.formData();
		const accountId = (form.get('account_id') as string)?.trim();
		const label = (form.get('tag_label') as string)?.trim();
		const username = (form.get('tag_username') as string)?.trim().replace(/^@/, '');

		if (!accountId || !label || !username) {
			return fail(400, { tagSnippetError: 'Label and username are required.' });
		}

		await db.insert(tagSnippets).values({ accountId, label, username });
		return { tagSnippetAdded: true };
	},

	deleteTagSnippet: async ({ request, locals }) => {
		if (!await requireAdmin(locals)) return fail(403, { tagSnippetError: 'Access denied' });

		const form = await request.formData();
		const id = (form.get('id') as string)?.trim();
		if (!id) return fail(400, { tagSnippetError: 'Missing ID.' });

		await db.delete(tagSnippets).where(eq(tagSnippets.id, id));
		return { tagSnippetDeleted: true };
	},

	addShow: async ({ request, locals }) => {
		if (!await requireAdmin(locals)) return fail(403, { showError: 'Access denied' });

		const form = await request.formData();
		const accountId = (form.get('account_id') as string)?.trim();
		const name = (form.get('show_name') as string)?.trim();
		const humanitixEventId = (form.get('humanitix_event_id') as string)?.trim() || null;
		const eventbriteEventId = (form.get('eventbrite_event_id') as string)?.trim() || null;

		if (!accountId || !name) return fail(400, { showError: 'Show name is required.' });
		if (!humanitixEventId && !eventbriteEventId) {
			return fail(400, { showError: 'At least one ticket platform ID is required.' });
		}

		await db.insert(shows).values({ accountId, name, humanitixEventId, eventbriteEventId });
		return { showAdded: true };
	},

	deleteShow: async ({ request, locals }) => {
		if (!await requireAdmin(locals)) return fail(403, { showError: 'Access denied' });

		const form = await request.formData();
		const id = (form.get('id') as string)?.trim();
		if (!id) return fail(400, { showError: 'Missing show ID.' });

		await db.delete(shows).where(eq(shows.id, id));
		return { showDeleted: true };
	},

	toggleShow: async ({ request, locals }) => {
		if (!await requireAdmin(locals)) return fail(403, { showError: 'Access denied' });

		const form = await request.formData();
		const id = (form.get('id') as string)?.trim();
		const active = form.get('active') === 'true';
		if (!id) return fail(400, { showError: 'Missing show ID.' });

		await db.update(shows).set({ isActive: !active }).where(eq(shows.id, id));
		return { showToggled: true };
	}
};
