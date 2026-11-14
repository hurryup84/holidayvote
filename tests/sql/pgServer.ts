import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Runs the real Supabase migrations against Postgres (PGlite) with small stand-ins for the
 * Supabase-provided `auth` and `storage` schemas. (Publication + pg_cron migrations are
 * Supabase-only and skipped.)
 */
const MIGRATIONS = join(__dirname, '../../supabase/migrations');
const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant usage on schema storage to authenticated;
  grant select, insert, update, delete on storage.objects to authenticated;
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  create schema realtime;
  create table realtime.messages (id bigserial primary key, topic text, extension text, payload jsonb, event text,
                                  private boolean, inserted_at timestamp default now());
  alter table realtime.messages enable row level security;
  grant usage on schema realtime to authenticated;
  grant select on realtime.messages to authenticated;
  create function realtime.topic() returns text language sql stable as
    $$ select nullif(current_setting('realtime.topic', true), '') $$;
  grant execute on function realtime.topic() to authenticated;
  create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void
    language sql as $$ insert into realtime.messages (topic, extension, payload, event, private)
                       values (topic, 'broadcast', payload, event, private) $$;
`;

export interface Server {
  db: PGlite;
  /** Runs `sql` as `user` (role authenticated, auth.uid() = user); null = admin. */
  as<T = Record<string, unknown>>(user: string | null, sql: string, params?: unknown[]): Promise<T[]>;
  asAdmin<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export async function startServer(): Promise<Server> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  for (const f of readdirSync(MIGRATIONS).sort()) {
    if (f.includes('cron')) continue;
    await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
  }
  // PGlite runs one query at a time; keep role switches and the query together.
  let chain: Promise<unknown> = Promise.resolve();
  const as = <T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []): Promise<T[]> => {
    const run = async () => {
      await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ?? ''}', false);`);
      if (user) await db.exec('set role authenticated');
      try {
        return (await db.query<T>(sql, params)).rows;
      } finally {
        await db.exec('reset role');
      }
    };
    const p = chain.then(run, run);
    chain = p.catch(() => undefined);
    return p;
  };
  return { db, as, asAdmin: (sql, params) => as(null, sql, params) };
}
