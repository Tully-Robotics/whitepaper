-- migrate:up
-- Invites: one row per person you send the site to. Only a hash of the password is stored.
create table if not exists tw_invites (
  id         text primary key,
  name       text not null,
  email      text,
  firm       text,
  note       text,
  pw_hash    text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_seen  timestamptz
);

-- Every sign-in attempt: kind is 'invite', 'master' or 'failed'. Raw IPs are never stored.
create table if not exists tw_logins (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  kind       text not null check (kind in ('invite', 'master', 'failed')),
  invite_id  text references tw_invites (id) on delete set null,
  name       text,
  email      text,
  firm       text,
  country    text,
  city       text,
  ip_hash    text,
  user_agent text
);

create index if not exists tw_logins_at on tw_logins (at desc);
create index if not exists tw_logins_ip on tw_logins (ip_hash, at);
create index if not exists tw_logins_invite on tw_logins (invite_id);

-- migrate:down
drop table if exists tw_logins;
drop table if exists tw_invites;
