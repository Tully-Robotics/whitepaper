-- migrate:up
-- Waiting list: farmers who signed up on /waitlist (signing up is their statement of interest).
-- One row per email address or phone number.
create table if not exists tw_waitlist (
  id           bigserial primary key,
  name         text not null,
  contact      text not null unique,
  contact_type text not null check (contact_type in ('email', 'phone')),
  hectares     numeric(10, 2) not null check (hectares > 0),
  country      text,
  ip_hash      text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists tw_waitlist_created on tw_waitlist (created_at desc);
create index if not exists tw_waitlist_ip on tw_waitlist (ip_hash, updated_at);

-- migrate:down
drop table if exists tw_waitlist;
