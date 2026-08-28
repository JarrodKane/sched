# Project: IG Scheduler (internal tool)

## What this is

An internal, self-hosted, cut-down social scheduler for a small team.

- 5 Instagram Business/Creator accounts today — architecture should leave
  room to add other platforms later (see "Future-proofing" below), but
  **do not build multi-platform support now** — Instagram only for v1
- 3 team members, each with access to a subset of the accounts
- Only needs: schedule feed image posts, schedule/send Instagram Stories
- No analytics, no comments, no DMs, no other platforms yet

This is deliberately a stripped-down clone of app.publer.com scoped to just
Instagram image posts + stories for a fixed, known set of accounts. It is
NOT a public multi-tenant SaaS — treat all auth/permissions as "internal team
tool" level, not "internet-facing product" level, but still don't cut corners
on basics like password hashing and not leaking tokens.

## Future-proofing (read this, then still build IG-only for v1)

Other platforms (Twitter/X, TikTok, LinkedIn, whatever) may get added down
the line. To keep that from being a rewrite later, without spending any
extra effort now:

- Name the accounts table `social_accounts` (not `ig_accounts`) with a
  `platform` column, hardcoded to `'instagram'` for every row in v1
- Name the join table `user_account_access` (not `user_ig_access`)
- Keep all Instagram-specific publish logic (the two-step container/publish
  flow) inside one module, e.g. `lib/platforms/instagram.ts`, rather than
  scattered through routes/actions — the cron worker should call something
  like `publishPost(account, post)` that internally dispatches on
  `account.platform`, even though `instagram` is the only case handled now
- Don't add a platform picker to the UI, don't add other platforms' auth
  flows, don't build an abstract "publisher interface" beyond the one
  function above — that's speculative work for a need that doesn't exist yet

## Tech stack (decided, don't relitigate)

- **SvelteKit** — use load functions for data fetching and form actions
  (`+page.server.ts` actions) for mutations instead of a separate backend
- **Supabase** for Postgres (via **Drizzle ORM**, `postgres-js` driver),
  **Auth** (use Supabase Auth directly — don't hand-roll password hashing
  or sessions, it's free for this scale and saves real build time), and
  **Storage** (public bucket for uploaded images, since the Instagram Graph
  API requires a publicly reachable image URL to publish from)
- Scheduling worker: **Supabase `pg_cron`** extension triggering a
  **Supabase Edge Function** every 60 seconds, rather than an always-on
  Node process — this is the key move that avoids needing a paid host
- Deploy target: **Vercel** (or Netlify) free tier for the SvelteKit
  frontend — it's a low-traffic internal tool, no persistent server needed
  there once the cron worker lives in Supabase instead of the app process

This whole stack is free at this scale: Supabase free tier (500MB DB, 1GB
storage, 50k MAU auth, 500k edge function invocations/month — we'll use a
tiny fraction of all of these) + Vercel free tier for hosting. No Railway,
no R2, no separate cron host needed.

One thing to sanity-check when you set this up: Supabase free projects
pause after 7 days with zero database activity. A `pg_cron` job hitting the
DB every 60 seconds should itself count as activity and keep the project
alive, but confirm this holds once it's running — if not, a trivial
keep-alive cron is a one-line fix.

## Database schema (Drizzle)

```
users
  -- this is a profile table linked to Supabase's built-in auth.users,
  -- NOT a table you manage passwords/sessions for yourself
  id            (pk, matches auth.users.id)
  email         (unique)
  name
  is_admin      (bool) -- admins can manage accounts/users; others just post

social_accounts
  id                (pk)
  platform          -- always 'instagram' for v1, exists so future
                       platforms don't require a schema migration
  label             -- friendly name, e.g. "Deadfunny Main"
  ig_business_id    -- Instagram Business Account ID from Graph API
  fb_page_id
  access_token      -- long-lived token, encrypt at rest if easy, don't stress if not for v1
  token_expires_at

user_account_access
  user_id       (fk -> users)
  account_id    (fk -> social_accounts)
  -- composite unique on (user_id, account_id)

scheduled_posts
  id               (pk)
  account_id       (fk -> social_accounts)
  created_by       (fk -> users)
  type             -- 'feed' | 'story'
  caption          -- nullable, stories usually won't have one
  media_url        -- public Supabase Storage url
  scheduled_for    -- datetime
  status           -- 'pending' | 'publishing' | 'published' | 'failed'
  error_message    -- nullable
  published_at     -- nullable
  created_at
```

## Pages / routes needed

- `/login` — Supabase Auth email/password (use their client library, don't
  build your own auth flow)
- `/dashboard` — lists the accounts the logged-in user has access to
- `/accounts/[id]` — for one account: upcoming queue + a "schedule new post"
  form (image upload, caption if feed, date/time picker, feed-vs-story toggle)
- `/accounts/[id]/history` — past published/failed posts for that account
- Admin-only, gated by `is_admin`:
  - `/admin/users` — create/remove users, assign which accounts they can post to
  - `/admin/accounts` — add IG accounts (paste in the IG business ID, FB page
    id, and long-lived token generated manually via Graph API Explorer —
    don't build an OAuth connect flow for v1, it's overkill for 5 fixed accounts)

## API / server logic needed

Use SvelteKit form actions (in `+page.server.ts`) and load functions for
these rather than building a separate REST layer, unless a plain endpoint
is genuinely easier (e.g. the upload handler may want a real
`+server.ts` route for multipart form handling):

- `upload` — accepts an image, pushes to Supabase Storage, returns public URL
- `createScheduledPost` — create a scheduled_posts row
- `cancelScheduledPost` — cancel a pending post (only if status = pending)
- Note: the actual publishing logic runs in a Supabase Edge Function on a
  `pg_cron` schedule, not as a SvelteKit route — see the Instagram
  publishing section below

## Instagram publishing logic (this is the fiddly part, get it right)

Two-step publish for a feed image:

1. `POST /{ig_business_id}/media` with `image_url` + `caption` + access_token
   → returns a `creation_id`
2. `POST /{ig_business_id}/media_publish` with `creation_id` + access_token
   → this actually posts it

For a Story, same two-step flow but pass `media_type=STORIES` on step 1
instead of a caption-bearing feed post. Confirm current param names against
the Graph API docs when you implement this — check the latest API version
(v25.0 or whatever is current) rather than trusting an old blog post, the
publishing params have shifted across versions before.

Rate limit: 25 published items per account per 24h via this API — we will
never come close to that with 5 accounts, no need to build limit-handling
logic beyond just surfacing the error if Meta ever returns a rate-limit
error.

**The scheduling worker**, as a Supabase Edge Function triggered by
`pg_cron` every 60 seconds (not an in-app process):

1. Query `scheduled_posts` where `status = 'pending'` and `scheduled_for <= now()`
2. For each: mark `status = 'publishing'`, call the two-step publish flow,
   then set `status = 'published'` + `published_at = now()` on success, or
   `status = 'failed'` + `error_message` on failure
3. Log failures clearly — Supabase Edge Function logs plus the DB row is
   enough, no need for external error tracking in v1

## Auth / access control rules

- A user can only see and post to accounts listed in `user_account_access`
  for their `user_id`
- Enforce this server-side on every route/API call that takes an
  `account_id` or `post_id` — don't rely on the UI hiding things
- Admins bypass the restriction and can see/manage everything

## Explicitly out of scope for v1 (don't build these unless asked)

- Analytics/insights
- Comment management, DMs
- Carousel posts, video/reel scheduling
- Threads or any non-Instagram platform
- Self-serve OAuth account connection flow (accounts are added manually by
  an admin pasting in a token)
- Token auto-refresh automation — flag when tokens are close to expiring
  (e.g. a banner in `/admin/accounts` if `token_expires_at` is within 7 days)
  rather than building automated refresh in v1

## Build order (suggested)

1. Create Supabase project, scaffold SvelteKit project (TypeScript), get a
   "hello world" route rendering and confirm `npm run build && npm run
preview` works locally
2. Set up Drizzle against the Supabase Postgres connection, write schema,
   run first migration
3. Wire up Supabase Auth (login page, protect routes via their session
   helpers)
4. Build admin pages to manually seed a social account (or seed via a
   script for the first account, to unblock testing publish logic early)
5. Get the Instagram publish flow working end-to-end against ONE real
   account before building the scheduling UI — this de-risks the part most
   likely to have surprises. Test it as a plain script first, then move the
   logic into the Edge Function
6. Build the scheduling form + queue UI
7. Build the Supabase Edge Function + `pg_cron` schedule for publishing due
   posts; confirm it actually fires reliably before trusting it
8. Build remaining admin UI (add/remove users and accounts, assign access)
9. Deploy the SvelteKit app to Vercel, confirm the whole flow works
   end-to-end in production — including that the Supabase project doesn't
   pause on inactivity once the cron job is running
