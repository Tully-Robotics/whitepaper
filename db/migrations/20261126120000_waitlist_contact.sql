-- migrate:up
-- Waiting list: farmers who sign up on /waitlist (signing up is their statement of interest).
-- tw_waitlist already exists (20261015120000_waitlist) with a longer form: email, region, seasonal workers and
-- harvest crew were required. The page now asks only for name, one email-or-phone field and hectares, so:
--   email -> contact (an email address or a phone number), plus contact_type to say which;
--   region, seasonal_workers and harvest_people become optional (kept in case the form asks again).
-- One row per contact. The API stores emails lowercased and phones as "+<digits>", so a plain unique key is enough.
alter table tw_waitlist rename column email to contact;
alter table tw_waitlist add column contact_type text not null default 'email' check (contact_type in ('email', 'phone'));
alter table tw_waitlist alter column contact_type drop default;
alter table tw_waitlist alter column region drop not null;
alter table tw_waitlist alter column seasonal_workers drop not null;
alter table tw_waitlist alter column harvest_people drop not null;
drop index if exists tw_waitlist_email;
alter table tw_waitlist add constraint tw_waitlist_contact_key unique (contact);

-- migrate:down
-- Fails if a phone-number sign-up or a row without region / workers exists, so no sign-up is lost silently.
alter table tw_waitlist drop constraint if exists tw_waitlist_contact_key;
alter table tw_waitlist alter column region set not null;
alter table tw_waitlist alter column seasonal_workers set not null;
alter table tw_waitlist alter column harvest_people set not null;
alter table tw_waitlist drop column contact_type;
alter table tw_waitlist rename column contact to email;
create unique index if not exists tw_waitlist_email on tw_waitlist (lower(email));
