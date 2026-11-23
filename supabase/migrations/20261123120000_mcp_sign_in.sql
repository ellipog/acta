-- MCP clients can sign in through the browser instead of sending a key in a header. Acta is its own OAuth
-- authorization server, and what a client gets at the end is an ordinary agent key, so the key checks in
-- agent_act, agent_apply and agent_board are the same for both. Only the server, with the service role, touches
-- these tables

-- Clients that registered themselves (RFC 7591). Clients that name themselves by the address of a metadata document
-- aren't stored: their document is read when they ask. A secret is only kept, hashed, for the few clients that ask
-- for one
create table public.oauth_clients (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{16,64}$'),
  name text not null check (char_length(name) between 1 and 100),
  redirect_uris text[] not null check (cardinality(redirect_uris) between 1 and 10),
  secret_hash text check (secret_hash ~ '^[0-9a-f]{64}$'),
  uri text check (char_length(uri) <= 2048),
  created_at timestamptz not null default now(),
  used_at timestamptz
);

-- Registrations nobody signed in with are cleared after a day
create index oauth_clients_unused on public.oauth_clients (created_at) where used_at is null;

-- Authorization codes, stored hashed. A code works once, for a few minutes. It stays a day after use, so a second try
-- with it can be told apart from a wrong code and the key it made revoked
create table public.oauth_codes (
  hash text primary key check (hash ~ '^[0-9a-f]{64}$'),
  client_id text not null check (char_length(client_id) <= 2048),
  client_name text not null check (char_length(client_name) between 1 and 100),
  user_id uuid not null references public.profiles (id) on delete cascade,
  redirect_uri text not null check (char_length(redirect_uri) <= 2048),
  challenge text not null check (challenge ~ '^[A-Za-z0-9_-]{43}$'),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  access text not null check (access in ('read', 'write', 'manage')),
  workspaces uuid[] check (workspaces is null or cardinality(workspaces) between 1 and 50),
  expires_at timestamptz not null,
  used_at timestamptz,
  key_id uuid references public.agent_keys (id) on delete set null
);

create index oauth_codes_expiry on public.oauth_codes (expires_at);

alter table public.oauth_clients enable row level security;
alter table public.oauth_codes enable row level security;
revoke all on public.oauth_clients, public.oauth_codes from anon, authenticated;
grant select, insert, update, delete on public.oauth_clients, public.oauth_codes to service_role;

-- A key made by signing in remembers the client it was made for, as its client id and the name the client gave.
-- Keys made by hand leave both empty. People can see them but not set them
alter table public.agent_keys add column client text check (char_length(client) <= 2048);
alter table public.agent_keys add column client_name text check (char_length(client_name) between 1 and 100);
grant select (client, client_name) on public.agent_keys to authenticated;
