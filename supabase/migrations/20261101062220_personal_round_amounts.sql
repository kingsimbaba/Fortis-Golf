-- A private per-account reference ledger; never part of shared round/scoring data.
create table public.golf_personal_round_amounts (
 user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
 round_id bigint not null references public.fortis_rounds(id),
 player_name text check (char_length(player_name) between 1 and 200),
 fortis_amount numeric(12,2) check (fortis_amount between -999999999.99 and 999999999.99),
 individual_amount numeric(12,2) check (individual_amount between -999999999.99 and 999999999.99),
 other_amount numeric(12,2) check (other_amount between -999999999.99 and 999999999.99),
 total_amount numeric(13,2) generated always as (case when fortis_amount is null and individual_amount is null and other_amount is null then null else coalesce(fortis_amount,0)+coalesce(individual_amount,0)+coalesce(other_amount,0) end) stored,
 primary key(user_id,round_id)
);
alter table public.golf_personal_round_amounts enable row level security;
revoke all on public.golf_personal_round_amounts from public,anon,authenticated;
grant select,insert,update on public.golf_personal_round_amounts to authenticated;
create policy personal_amounts_read on public.golf_personal_round_amounts for select to authenticated using ((select auth.uid())=user_id);
create policy personal_amounts_insert on public.golf_personal_round_amounts for insert to authenticated with check ((select auth.uid())=user_id);
create policy personal_amounts_update on public.golf_personal_round_amounts for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create index personal_amounts_round on public.golf_personal_round_amounts(round_id);
