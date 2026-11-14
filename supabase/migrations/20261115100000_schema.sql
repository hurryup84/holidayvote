-- HolidayVote – schema (concept/03_data_model.md). Same architecture as Esstisch: the phones keep a
-- full SQLite copy and sync with sync_pull (…_changefeed.sql). IDs are created on the device (uuid v7).
--
-- No pictures of holiday homes are stored anywhere: a property keeps only its link; the app fetches
-- the preview picture live from that page.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  terms_accepted_at timestamptz,
  terms_version text,
  banned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A vacation = the shared space a group decides in (a "table" in Esstisch).
create table public.vacations (
  id uuid primary key,
  name text not null check (char_length(name) between 1 and 120),
  description text check (char_length(description) <= 2000),
  destination text check (char_length(destination) <= 200),
  start_date date,
  end_date date,
  owner_id uuid not null references public.profiles (id),
  settings text, -- JSON (field config), written by the app as a string
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.vacation_members (
  id uuid primary key default gen_random_uuid(),
  vacation_id uuid not null references public.vacations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  display_name text, -- copy of profiles.display_name (other members can't read profiles)
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vacation_id, user_id)
);

create table public.vacation_invites (
  id uuid primary key default gen_random_uuid(),
  vacation_id uuid not null references public.vacations (id) on delete cascade,
  code text not null unique,
  created_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null default now() + interval '14 days',
  max_uses int not null default 30,
  uses int not null default 0,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- A holiday home: link + what the group typed in. Deliberately no image column.
create table public.properties (
  id uuid primary key,
  vacation_id uuid not null references public.vacations (id) on delete cascade,
  url text not null check (url ~* '^https?://' and char_length(url) <= 2000),
  title text check (char_length(title) <= 200),
  description text check (char_length(description) <= 2000),
  provider text check (char_length(provider) <= 100),
  price numeric(12, 2) check (price >= 0),
  beds int check (beds between 0 and 999),
  bedrooms int check (bedrooms between 0 and 999),
  bathrooms int check (bathrooms between 0 and 999),
  has_pool smallint not null default 0 check (has_pool in (0, 1)),
  address text check (char_length(address) <= 300),
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  avatar text check (char_length(avatar) <= 40),
  status text not null default 'active' check (status in ('active', 'eliminated', 'booked')),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Stars 1–5 per person and house.
create table public.votes (
  id uuid primary key,
  vacation_id uuid not null references public.vacations (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  value smallint not null check (value between 1 and 5),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (property_id, user_id)
);

-- One veto per person and vacation (the row stays, property_id moves).
create table public.vetoes (
  id uuid primary key,
  vacation_id uuid not null references public.vacations (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (vacation_id, user_id)
);

-- One favourite per person and vacation.
create table public.favorites (
  id uuid primary key,
  vacation_id uuid not null references public.vacations (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (vacation_id, user_id)
);

-- Comments; author = created_by (kept when the author leaves, shown without name).
create table public.comments (
  id uuid primary key,
  vacation_id uuid not null references public.vacations (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 1000),
  stars smallint check (stars between 1 and 5),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Settings editable without an app release.
create table public.app_config (
  key text primary key,
  value jsonb not null
);
insert into public.app_config (key, value) values
  ('max_properties_per_vacation', '300'),
  ('max_comments_per_vacation', '3000'),
  ('max_vacations_per_owner', '50');

create index vacations_owner_idx on public.vacations (owner_id);
create index vacation_members_user_idx on public.vacation_members (user_id);
create index properties_vacation_idx on public.properties (vacation_id);
create index votes_vacation_idx on public.votes (vacation_id);
create index vetoes_property_idx on public.vetoes (property_id);
create index favorites_property_idx on public.favorites (property_id);
create index comments_property_idx on public.comments (property_id);
create index comments_vacation_idx on public.comments (vacation_id);
