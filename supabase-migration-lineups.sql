-- v3 Lineups feature migration
-- Run this in Supabase SQL editor

-- 1. Extend shows table with lineup scheduling fields
ALTER TABLE shows
  ADD COLUMN IF NOT EXISTS schedule_type text,            -- 'weekly' | 'fortnightly' | 'monthly' | 'one_off'
  ADD COLUMN IF NOT EXISTS schedule_day_of_week integer,  -- 0=Sun … 6=Sat
  ADD COLUMN IF NOT EXISTS acts_per_show integer;         -- target act count for over-capacity warning

-- 2. Global talent directory
CREATE TABLE IF NOT EXISTS people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  instagram text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. One lineup per show per date
CREATE TABLE IF NOT EXISTS lineups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  show_date text NOT NULL,  -- YYYY-MM-DD Melbourne time
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_lineups_show_date UNIQUE (show_id, show_date)
);

-- 4. Individual act slots within a lineup
CREATE TABLE IF NOT EXISTS lineup_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lineup_id uuid NOT NULL REFERENCES lineups(id) ON DELETE CASCADE,
  person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'act',      -- 'act' | 'headline' | 'mc' | 'support' | 'host'
  status text NOT NULL DEFAULT 'contacted', -- 'contacted' | 'booked' | 'confirmed' | 'cancelled'
  sort_order integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. RLS: allow authenticated users full access (this is an internal tool)
ALTER TABLE people ENABLE ROW LEVEL SECURITY;
ALTER TABLE lineups ENABLE ROW LEVEL SECURITY;
ALTER TABLE lineup_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users can manage people"
  ON people FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated users can manage lineups"
  ON lineups FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated users can manage lineup_entries"
  ON lineup_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);
