# publish-due-posts Edge Function

Publishes Instagram posts whose `scheduled_for <= now()`.

## Deploy

```bash
supabase functions deploy publish-due-posts
```

## pg_cron setup

Run this SQL in the Supabase SQL Editor to trigger the function every 60 seconds:

```sql
-- Enable pg_cron extension (do once)
create extension if not exists pg_cron;

-- Schedule the edge function every minute
select cron.schedule(
  'publish-due-posts',
  '* * * * *',
  $$
  select net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/publish-due-posts',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  )
  $$
);
```

Or use the simpler Supabase Dashboard approach:
1. Go to Database → pg_cron
2. Add a new cron job pointing to `POST /functions/v1/publish-due-posts` every minute

## Storage bucket setup

Create a public bucket named `media` in Supabase Storage.
The Instagram Graph API needs a publicly reachable URL to fetch the image.
