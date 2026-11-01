create table public.golf_personal_annual_costs (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 year integer not null check (year between 1900 and 2199),
 membership_fee numeric(12,2) check (membership_fee between 0 and 999999999.99),
 insurance_fee numeric(12,2) check (insurance_fee between 0 and 999999999.99),
 other_fixed_costs numeric(12,2) check (other_fixed_costs between 0 and 999999999.99),
 total_amount numeric(13,2) generated always as (
  case when membership_fee is null and insurance_fee is null and other_fixed_costs is null then null
  else coalesce(membership_fee,0)+coalesce(insurance_fee,0)+coalesce(other_fixed_costs,0) end
 ) stored,
 primary key(user_id,year)
);
alter table public.golf_personal_annual_costs enable row level security;
revoke all on public.golf_personal_annual_costs from public,anon,authenticated;
grant select,insert,update on public.golf_personal_annual_costs to authenticated;
create policy annual_costs_read on public.golf_personal_annual_costs for select to authenticated using ((select auth.uid())=user_id);
create policy annual_costs_insert on public.golf_personal_annual_costs for insert to authenticated with check ((select auth.uid())=user_id);
create policy annual_costs_update on public.golf_personal_annual_costs for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

-- Add annual costs without rewriting round records or changing the existing report API.
create function public.golf_personal_annual_cost_report() returns jsonb
language sql stable security invoker set search_path='' as $$
 with base as (select public.golf_personal_cost_report() as report),
 annual as (select * from public.golf_personal_annual_costs where user_id=(select auth.uid())),
 round_years as (
  select extract(year from r.played_at at time zone 'Asia/Taipei')::int as year,
   count(p.net_cost) as cost_count,sum(p.net_cost) as round_cost_total
  from public.golf_personal_round_amounts p join public.fortis_rounds r on r.id=p.round_id
  where p.user_id=(select auth.uid()) and r.played_at<=current_timestamp
  group by extract(year from r.played_at at time zone 'Asia/Taipei')
 ), years as (
  select (report->>'year')::int as year from base
  union select year from annual
  union select year from round_years where year between 1900 and 2199
 ), scopes as (
  select 'all_time' as scope,report->'all_time' as stats,
   (select sum(total_amount) from annual where year<=(report->>'year')::int) as fixed_total from base
  union all
  select 'ytd',report->'ytd',(select total_amount from annual where year=(report->>'year')::int) from base
 ), enriched as (
  select scope,stats||jsonb_build_object(
   'fixed_total',fixed_total::text,
   'fixed_average',round(fixed_total/nullif((stats->>'cost_count')::numeric,0),2)::text,
   'combined_total',case when stats->>'cost_total' is null and fixed_total is null then null else (coalesce((stats->>'cost_total')::numeric,0)+coalesce(fixed_total,0))::text end,
   'combined_average',case when stats->>'cost_total' is null and fixed_total is null then null else round((coalesce((stats->>'cost_total')::numeric,0)+coalesce(fixed_total,0))/nullif((stats->>'cost_count')::numeric,0),2)::text end
  ) as stats from scopes
 )
 select report||(select jsonb_object_agg(scope,stats) from enriched)||jsonb_build_object(
  'annual_years',coalesce((select jsonb_agg(jsonb_build_object(
   'year',y.year,'membership_fee',a.membership_fee::text,'insurance_fee',a.insurance_fee::text,'other_fixed_costs',a.other_fixed_costs::text,
   'fixed_total',a.total_amount::text,'cost_count',coalesce(r.cost_count,0),
   'combined_total',case when r.round_cost_total is null and a.total_amount is null then null else (coalesce(r.round_cost_total,0)+coalesce(a.total_amount,0))::text end,
   'combined_average',case when r.round_cost_total is null and a.total_amount is null then null else round((coalesce(r.round_cost_total,0)+coalesce(a.total_amount,0))/nullif(r.cost_count,0),2)::text end
  ) order by y.year desc) from years y left join annual a on a.year=y.year left join round_years r on r.year=y.year),'[]'::jsonb)
 ) from base;
$$;
revoke all on function public.golf_personal_annual_cost_report() from public,anon;
grant execute on function public.golf_personal_annual_cost_report() to authenticated;
notify pgrst,'reload schema';
