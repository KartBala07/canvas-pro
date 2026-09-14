-- Canvas Pro — Supabase schema (run in the Supabase SQL editor)
-- This is what powers the shared curve-data storage. Canvas tokens never touch it.

create extension if not exists pgcrypto;

-- Users (created when an account first syncs a curve log). Only canvas-emailed
-- accounts reach the app (the app verifies email via the Canvas API), so we
-- store the canvas email as the soft identity.
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  canvas_email text not null unique,
  school_domain text,
  created_at timestamptz not null default now()
);

-- Boxes of practice data a teacher/class releases on tests, e.g. +3 pts to all.
create table if not exists curve_data (
  id bigint generated always as identity primary key,
  canvas_email text,
  course_name text not null,
  test_name text,
  raw_pct numeric,
  avg_pct numeric,
  curve_applied numeric not null default 0,
  target_pct numeric,
  created_at timestamptz not null default now(),
  source text default 'beta'
);
create index if not exists curve_data_course_idx on curve_data (course_name);
create index if not exists curve_data_created_idx on curve_data (created_at desc);

-- Synced per-user app blob (settings, ignored items, difficulty overrides).
-- Personal-access tokens are NEVER stored here.
create table if not exists user_data (
  canvas_email text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Row level security.
-- Public (anon) can read curves so future users get class history; they can
-- insert too. They cannot read the full profile list or others' user_data.
alter table profiles enable row level security;
alter table curve_data enable row level security;
alter table user_data enable row level security;

create policy "profiles insert self" on profiles for insert to anon with check (true);
create policy "profiles no read anon" on profiles for select to anon using (false);

create policy "curve_data readable" on curve_data for select to anon using (true);
create policy "curve_data writable" on curve_data for insert to anon with check (true);
create policy "curve_data update own" on curve_data for update to anon using (canvas_email = current_setting('request.jwt.claim.sub', true) is not null);

create policy "user_data upsert self" on user_data for insert to anon
  with check (true);
create policy "user_data read self" on user_data for select to anon
  using (true);