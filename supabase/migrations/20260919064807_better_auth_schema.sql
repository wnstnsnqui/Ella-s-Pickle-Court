-- Spec 0004 (revised): Better Auth's own tables, in their own schema, owned by
-- their own role.
--
-- Identity and sessions move out of Clerk and into this database. Everything
-- Better Auth stores lives in the `better_auth` schema, reached only through
-- the `better_auth_app` role over its own connection pool. The schema is never
-- exposed to PostgREST and carries no grant to `anon`, `authenticated` or
-- `public`, so nothing on the API side can read a session token or a password
-- hash. `public.staff` stays the only place a role lives; these tables hold
-- identity, not authorization (spec 0004, AC-10, AC-11).
--
-- Column names are what Better Auth generates: camel case, quoted. Nothing of
-- ours reads them except by user id through Better Auth's own adapter, so the
-- project's lowercase convention stops at the schema boundary on purpose.

-- ---------------------------------------------------------------------------
-- The role and the schema
-- ---------------------------------------------------------------------------

-- `login` with no password yet: the password is set once by hand
-- (`alter role better_auth_app password '...'`) and lives only in
-- BETTER_AUTH_DATABASE_URL. `nobypassrls` and no `createrole` or `createdb`,
-- so this role can never reach past its own schema and the three functions
-- migration B grants it.
create role better_auth_app login nobypassrls;

-- Postgres 16 and later: creating a role grants the creator ADMIN OPTION only,
-- and both `create schema ... authorization` and `alter table ... owner to`
-- below need the migration role to be able to `set role` to the new owner.
-- Membership with SET gives it that; nothing about the app's own connection
-- changes, which still authenticates as better_auth_app directly.
grant better_auth_app to postgres;

comment on role better_auth_app is
  'Better Auth''s connection role. Owns the better_auth schema; may execute claim_staff_invite, claim_staff_reset and peek_staff_invite in public and nothing else. Spec 0004.';

create schema better_auth authorization better_auth_app;

comment on schema better_auth is
  'Better Auth''s identity and session tables. Not exposed to PostgREST; no grant to anon, authenticated or public. Spec 0004.';

-- Every unqualified name Better Auth's adapter sends resolves here and nowhere
-- else. A role level setting so it applies through the Supavisor pooler, where
-- per connection startup options cannot be relied on.
alter role better_auth_app set search_path = better_auth;

-- The functions in migration B are the only things this role may touch in
-- `public`. Usage on the schema is the door; execute on each function is the
-- key, granted there.
grant usage on schema public to better_auth_app;

-- ---------------------------------------------------------------------------
-- The five tables, as `better-auth` 1.7 lays them out
-- ---------------------------------------------------------------------------

create table better_auth."user" (
  "id"            text primary key,
  "name"          text not null,
  "email"         text not null unique,
  "emailVerified" boolean not null default false,
  "image"         text,
  "createdAt"     timestamptz not null default now(),
  "updatedAt"     timestamptz not null default now()
);

comment on table better_auth."user" is
  'Identity only: the role lives on public.staff, keyed by this id. Spec 0004.';

create table better_auth."session" (
  "id"        text primary key,
  "expiresAt" timestamptz not null,
  "token"     text not null unique,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null,
  "ipAddress" text,
  "userAgent" text,
  "userId"    text not null references better_auth."user" ("id") on delete cascade
);

comment on table better_auth."session" is
  '30 day life, refreshed daily while used. Deleted on sign out, deactivation, password reset (all) and password change (all others). Spec 0004, AC-4, AC-7, AC-8, AC-9.';

create index "session_userId_idx" on better_auth."session" ("userId");

create table better_auth."account" (
  "id"                    text primary key,
  "accountId"             text not null,
  "providerId"            text not null,
  "userId"                text not null references better_auth."user" ("id") on delete cascade,
  "accessToken"           text,
  "refreshToken"          text,
  "idToken"               text,
  "accessTokenExpiresAt"  timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope"                 text,
  "password"              text,
  "createdAt"             timestamptz not null default now(),
  "updatedAt"             timestamptz not null
);

comment on table better_auth."account" is
  'One row per sign in method: credential (the scrypt password hash) and google once linked. Spec 0004, AC-4, AC-9.';

create index "account_userId_idx" on better_auth."account" ("userId");

create table better_auth."verification" (
  "id"         text primary key,
  "identifier" text not null,
  "value"      text not null,
  "expiresAt"  timestamptz not null,
  "createdAt"  timestamptz not null default now(),
  "updatedAt"  timestamptz not null default now()
);

comment on table better_auth."verification" is
  'Better Auth internal: OAuth state and similar short lived values.';

create index "verification_identifier_idx" on better_auth."verification" ("identifier");

-- Present because `rateLimit.storage` is "database" (spec 0004, AC-14), so
-- the counters survive a serverless instance being replaced.
create table better_auth."rateLimit" (
  "id"          text primary key,
  "key"         text not null unique,
  "count"       integer not null,
  "lastRequest" bigint not null
);

comment on table better_auth."rateLimit" is
  'Better Auth''s rate limit counters. Spec 0004, AC-14.';

-- ---------------------------------------------------------------------------
-- Ownership and grants
-- ---------------------------------------------------------------------------

-- The migration role creates the tables; Better Auth's role owns them. Owner
-- rights are the only rights anyone holds on this schema.
alter table better_auth."user"         owner to better_auth_app;
alter table better_auth."session"      owner to better_auth_app;
alter table better_auth."account"      owner to better_auth_app;
alter table better_auth."verification" owner to better_auth_app;
alter table better_auth."rateLimit"    owner to better_auth_app;

-- Restated so nobody has to trust the defaults: the API roles have no way in.
revoke all on schema better_auth from public, anon, authenticated;
revoke all on all tables in schema better_auth from public, anon, authenticated;
