/**
 * +server.ts — /accounts/[id]/generate-caption
 * POST endpoint that generates an Instagram caption via the Groq API (LLaMA model).
 * Builds a prompt from the account's AI instructions, enabled caption snippets,
 * enabled tag shortcuts, and the last 10 published captions for style context.
 *
 * Two caption styles, chosen by the caller:
 *   'event'  — structured prompt for upcoming show announcements
 *   'recap'  — polish/rewrite prompt for post-show recap captions
 *
 * SvelteKit concepts:
 *   RequestHandler (POST) — plain JSON endpoint; returns { caption } on success
 *                           or { message } with a 4xx/5xx on failure
 *   json()   — from @sveltejs/kit; wraps the response object
 *   error()  — throws HTTP errors for missing params or access denied
 */
import { json, error } from '@sveltejs/kit';
import { GROQ_API_KEY } from '$env/static/private';
import { db } from '$lib/server/db';
import { users, socialAccounts, captionSnippets, tagSnippets, scheduledPosts } from '$lib/server/db/schema';
import { eq, asc, and, desc, isNotNull } from 'drizzle-orm';
import { canAccessAccount } from '$lib/server/access';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) error(401, 'Unauthorized');

	const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
	if (!profile) error(401, 'Unauthorized');

	const allowed = await canAccessAccount(profile.id, params.id, profile.isAdmin);
	if (!allowed) error(403, 'Access denied');

	const [[account], snippets, tags, recentPosts] = await Promise.all([
		db
			.select({ label: socialAccounts.label, aiInstructions: socialAccounts.aiInstructions })
			.from(socialAccounts)
			.where(eq(socialAccounts.id, params.id))
			.limit(1),
		db
			.select({ label: captionSnippets.label, text: captionSnippets.text })
			.from(captionSnippets)
			.where(and(eq(captionSnippets.accountId, params.id), eq(captionSnippets.useInAi, true)))
			.orderBy(asc(captionSnippets.sortOrder), asc(captionSnippets.createdAt)),
		db
			.select({ label: tagSnippets.label, username: tagSnippets.username, category: tagSnippets.category })
			.from(tagSnippets)
			.where(and(eq(tagSnippets.accountId, params.id), eq(tagSnippets.useInAi, true)))
			.orderBy(asc(tagSnippets.sortOrder), asc(tagSnippets.createdAt)),
		db
			.select({ caption: scheduledPosts.caption })
			.from(scheduledPosts)
			.where(and(
				eq(scheduledPosts.accountId, params.id),
				eq(scheduledPosts.status, 'published'),
				isNotNull(scheduledPosts.caption)
			))
			.orderBy(desc(scheduledPosts.publishedAt))
			.limit(5)
	]);

	if (!account) error(404, 'Account not found');

	const { context, taggedPeople, style } = await request.json().catch(() => ({ context: '', taggedPeople: [], style: 'event' }));
	const captionStyle: 'event' | 'recap' = style === 'recap' ? 'recap' : 'event';

	const structureTemplate = `You write Instagram captions for comedy shows.

STRICT RULES — never break these:
- Never use em dashes (—), en dashes (–), or hyphens as connectors between clauses. Use a period, new line, or rewrite the sentence instead.
- No section headers or numbers in the output.
- Include everything from the snippets — rules, instructions, details — do not skip or summarise anything.
- Use line breaks generously. Each new idea or piece of info should be on its own line.
- Write like a real person, not a copywriter.

Structure to follow in this exact order:

1. Opening — two short lines only. First line: announce the show with something fun and punchy. Second line: drop in where it is, using the venue's @handle. Keep it brief and casual. E.g. "Something fun is happening this Wednesday.\nAt @fadgallerybar in the heart of Melbourne."

2. Details block — immediately after the opener, no filler in between. List each piece of info on its own line using emojis:
   📅 [Day or frequency]
   ⏰ [Time]
   📍 [Address]
   💰 [Ticket cost]

3. Ticket / entry CTA — one or two lines. Read the ticket info carefully. If tickets need to be booked (paid entry or a reservation link was provided), write something like "Grab your spot via the link in bio" and put the URL on its own line. If it is free entry with no booking required, write something like "No booking needed, just turn up on the night" or "Free entry — doors open at [time], just show up." Do not say "link in bio" for free walk-in events.

4. Acts — only include this section if performers or an MC were provided. Mention them naturally in one or two lines. E.g. "Hosted by @mc_handle with sets from @act1 and @act2." Skip this section entirely if no acts were given.

5. Body — three to five sentences that flesh out the night. Write about: the vibe and atmosphere, the type of comedy and what audiences can expect, the venue and the area it is in, why it is worth coming to. This section should be rich with natural detail that helps people discover the show — mention the suburb, the street, the venue style, the format of the night. Draw from everything in the snippets. Be warm and specific, never hype-y.

6. A line of local SEO hashtags — suburb, city, comedy-specific, and venue tags. E.g. #Melbourne #FlindersLane #MelbourneComedy #ComedyNight`;

	const recapTemplate = `You polish Instagram captions for a comedy brand. The user has written a casual post-event recap — your job is to lightly improve it, not rewrite it.

STRICT RULES — never break these:
- Preserve their voice, casual tone, sentence structure, and general content
- Fix any typos or awkward phrasing, smooth it out where it reads rough
- Use line breaks generously — each new thought or sentence should be on its own line
- Never use em dashes (—), en dashes (–), or hyphens as connectors between clauses
- Do NOT add extra filler lines or pad the caption out — only keep what the user wrote, polished
- Do NOT turn this into an event promotion
- Do NOT add a formal details block with 📅 ⏰ 📍 💰
- Do NOT add a ticket CTA or "link in bio"
- If tagged people are provided, weave their @handles into the caption body naturally — do not list them separately
- End the caption body (before the hashtags) with exactly two lines: first, a short punchy line that captures the vibe of the night (e.g. "Who knew comedy could be this therapeutic?"); second, a casual one-liner inviting people to follow for more Melbourne comedy shows (e.g. "Follow along and never miss a show.")
- Add 3–5 relevant hashtags at the end if none are present
- Write like a real person reflecting on a fun night, not a marketer`;

	const accountInstructions = account.aiInstructions?.trim()
		? `\n\nAccount-specific instructions for ${account.label}:\n${account.aiInstructions.trim()}`
		: `\n\nThis caption is for: ${account.label}.`;

	const snippetSection = snippets.length
		? `\n\nContent snippets — include ALL of this information in the caption. Do not skip or summarise rules, instructions, or important details:\n${snippets.map((s) => `- ${s.label}: ${s.text}`).join('\n')}`
		: '';

	let tagSection = '';
	if (tags.length) {
		const grouped: Record<string, string[]> = { venue: [], act: [], mc: [], other: [] };
		for (const t of tags) {
			const key = t.category && ['venue', 'act', 'mc'].includes(t.category) ? t.category : 'other';
			grouped[key].push(`@${t.username}`);
		}
		const lines: string[] = [];
		if (grouped.venue.length) lines.push(`Venue: ${grouped.venue.join(', ')} — tag in the post body`);
		if (grouped.act.length) lines.push(`Act(s): ${grouped.act.join(', ')} — tag the performers`);
		if (grouped.mc.length) lines.push(`MC/Host: ${grouped.mc.join(', ')} — mention as MC or host`);
		if (grouped.other.length) lines.push(`Other: ${grouped.other.join(', ')} — include where appropriate`);
		tagSection = `\n\nInstagram handles to always include in the caption:\n${lines.join('\n')}`;
	}

	const taggedPeopleSection = Array.isArray(taggedPeople) && taggedPeople.length
		? `\n\nThis post tags the following people — include their @handles naturally in the caption body:\n${(taggedPeople as string[]).map((u) => `@${u}`).join(', ')}`
		: '';

	const pastCaptionsSection = recentPosts.length
		? `\n\nHere are recent published captions from this account. Study these carefully — they are the reference for how this account sounds. Mirror their sentence length, vocabulary, use of line breaks, level of warmth, and overall personality. The new caption should feel like it came from the same person who wrote these:\n\n${recentPosts.map((p, i) => `--- Caption ${i + 1} ---\n${p.caption}`).join('\n\n')}`
		: '';

	const systemPrompt = captionStyle === 'recap'
		? recapTemplate + accountInstructions + taggedPeopleSection + pastCaptionsSection
		: structureTemplate + accountInstructions + snippetSection + tagSection + taggedPeopleSection + pastCaptionsSection;

	const userPrompt = context?.trim()
		? `Write an Instagram caption for this post: ${context.trim()}`
		: 'Write an Instagram caption for a new post.';

	const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${GROQ_API_KEY}`
		},
		body: JSON.stringify({
			model: 'openai/gpt-oss-120b',
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userPrompt }
			],
			max_tokens: 2000,
			temperature: 0.8
		})
	});

	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		error(502, err?.error?.message ?? 'Groq API error');
	}

	const data = await res.json();
	const caption = data.choices?.[0]?.message?.content?.trim() ?? '';
	return json({ caption });
};
