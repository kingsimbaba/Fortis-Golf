alter table public.golf_personal_cost_settings
 add column membership_prorated boolean not null default false,
 add column membership_renewal_month integer not null default 1 check(membership_renewal_month between 1 and 12),
 add column membership_renewal_day integer not null default 1 check(membership_renewal_day between 1 and 31),
 add constraint membership_renewal_valid check(membership_renewal_day<=extract(day from ((make_date(2001,membership_renewal_month,1)+interval '1 month')::date-1)));

-- Half-open date windows; actual 365/366-day periods. Unrounded accrual is returned
-- so report scopes round once after adding recognized costs.
create function public.golf_personal_membership_proration(p_from date,p_until date) returns jsonb
language sql stable security invoker set search_path='' as $$
 with config as (
  select coalesce((select membership_prorated from public.golf_personal_cost_settings where user_id=(select auth.uid())),false) as prorated,
   coalesce((select membership_renewal_month from public.golf_personal_cost_settings where user_id=(select auth.uid())),1) as month,
   coalesce((select membership_renewal_day from public.golf_personal_cost_settings where user_id=(select auth.uid())),1) as day,
   greatest(p_from,public.golf_personal_cost_tracking_start()) as begin_date
 ), periods as (
  select y,make_date(y,case when c.prorated then c.month else 1 end,case when c.prorated then c.day else 1 end) as begin_date,
   make_date(y+1,case when c.prorated then c.month else 1 end,case when c.prorated then c.day else 1 end) as end_date,c.prorated,c.month,c.day,c.begin_date as scope_start
  from config c cross join lateral generate_series(greatest(1900,extract(year from c.begin_date)::int-1),least(2199,extract(year from p_until)::int)) y
  where p_from is not null and p_until is not null and c.begin_date<p_until
 ), covered_periods as (
  select p.*,greatest(0,least(p.end_date,p_until)-greatest(p.begin_date,p.scope_start)) as covered_days,a.membership_fee
  from periods p left join public.golf_personal_annual_costs a on a.user_id=(select auth.uid()) and a.year=p.y
 )
 select jsonb_build_object(
  'recognized_amount',(select sum(case when prorated then membership_fee*covered_days::numeric/(end_date-begin_date) else membership_fee end)::text from covered_periods where covered_days>0 and membership_fee is not null),
  'complete',not exists(select 1 from covered_periods where prorated and covered_days>0 and membership_fee is null),
  'missing_cycles',coalesce((select jsonb_agg(jsonb_build_object('year',y,'start',begin_date::text,'end',(end_date-1)::text) order by y) from covered_periods where prorated and covered_days>0 and membership_fee is null),'[]'::jsonb)
 );
$$;
revoke all on function public.golf_personal_membership_proration(date,date) from public,anon;
grant execute on function public.golf_personal_membership_proration(date,date) to authenticated;

create or replace function public.golf_personal_annual_cost_report() returns jsonb
language sql stable security invoker set search_path='' as $$
 with base as (select public.golf_personal_cost_report() as report),
 config as (
  select (current_timestamp at time zone 'Asia/Taipei')::date as today,public.golf_personal_cost_tracking_start() as start_date,
   coalesce((select membership_prorated from public.golf_personal_cost_settings where user_id=(select auth.uid())),false) as prorated,
   coalesce((select membership_renewal_month from public.golf_personal_cost_settings where user_id=(select auth.uid())),1) as month,
   coalesce((select membership_renewal_day from public.golf_personal_cost_settings where user_id=(select auth.uid())),1) as day
 ), annual as (select * from public.golf_personal_annual_costs where user_id=(select auth.uid())),
 round_years as (
  select extract(year from r.played_at at time zone 'Asia/Taipei')::int as year,count(p.net_cost) as cost_count,sum(p.net_cost) as round_cost_total
  from public.golf_personal_round_amounts p join public.fortis_rounds r on r.id=p.round_id
  where p.user_id=(select auth.uid()) and r.played_at<=current_timestamp and r.played_at >= (public.golf_personal_cost_tracking_start()::timestamp at time zone 'Asia/Taipei')
  group by extract(year from r.played_at at time zone 'Asia/Taipei')
 ), years as (
  select (report->>'year')::int as year from base
  union select extract(year from start_date)::int from config where start_date>date '1900-01-01'
  union select greatest(1900,extract(year from start_date)::int-1) from config where prorated and (month,day)<>(1,1)
  union select extract(year from today)::int-1 from config where prorated and (month,day)<>(1,1)
  union select year from annual
  union select year from round_years where year between 1900 and 2199
 ), windows as (
  select 'all_time' as scope,report->'all_time' as stats,start_date as begin_date,today+1 as end_date from base cross join config
  union all select 'ytd',report->'ytd',greatest(make_date(extract(year from today)::int,1,1),start_date),today+1 from base cross join config
  union all select y.year::text,jsonb_build_object('cost_count',coalesce(r.cost_count,0),'cost_total',r.round_cost_total::text),greatest(make_date(y.year,1,1),c.start_date),least(make_date(y.year+1,1,1),c.today+1)
   from years y cross join config c left join round_years r on r.year=y.year
 ), charges as (
  select w.*,public.golf_personal_membership_proration(w.begin_date,w.end_date) as membership,
   (select sum(coalesce(a.insurance_fee,0)+coalesce(a.other_fixed_costs,0)) from annual a
    where w.begin_date<w.end_date and a.year between extract(year from w.begin_date)::int and extract(year from w.end_date-1)::int and (a.insurance_fee is not null or a.other_fixed_costs is not null)) as other_total
  from windows w
 ), amounts as (
  select c.*,case when membership->>'recognized_amount' is null and other_total is null then null else round(coalesce((membership->>'recognized_amount')::numeric,0)+coalesce(other_total,0),2) end as fixed_total
  from charges c
 ), enriched as (
  select a.*,stats||jsonb_build_object(
   'membership_recognized',round((membership->>'recognized_amount')::numeric,2)::text,
   'membership_complete',(membership->>'complete')::boolean,'missing_membership_cycles',membership->'missing_cycles',
   'fixed_total',fixed_total::text,
   'fixed_average',case when (membership->>'complete')::boolean then round(fixed_total/nullif((stats->>'cost_count')::numeric,0),2)::text else null end,
   'combined_total',case when stats->>'cost_total' is null and fixed_total is null then null else (coalesce((stats->>'cost_total')::numeric,0)+coalesce(fixed_total,0))::text end,
   'combined_average',case when (membership->>'complete')::boolean and (stats->>'cost_total' is not null or fixed_total is not null) then round((coalesce((stats->>'cost_total')::numeric,0)+coalesce(fixed_total,0))/nullif((stats->>'cost_count')::numeric,0),2)::text else null end
  ) as result from amounts a
 )
 select b.report||(select jsonb_object_agg(scope,result) from enriched where scope in('all_time','ytd'))||jsonb_build_object(
  'membership_prorated',c.prorated,'membership_renewal_month',c.month,'membership_renewal_day',c.day,
  'annual_years',coalesce((select jsonb_agg(jsonb_build_object(
   'year',y.year,'included_in_career',y.year>=extract(year from c.start_date)::int,
   'membership_fee',a.membership_fee::text,'insurance_fee',a.insurance_fee::text,'other_fixed_costs',a.other_fixed_costs::text,
   'membership_period_start',make_date(y.year,case when c.prorated then c.month else 1 end,case when c.prorated then c.day else 1 end)::text,
   'membership_period_end',(make_date(y.year+1,case when c.prorated then c.month else 1 end,case when c.prorated then c.day else 1 end)-1)::text,
   'membership_crosses_tracking_start',c.prorated and make_date(y.year,c.month,c.day)<c.start_date and make_date(y.year+1,c.month,c.day)>c.start_date,
   'fixed_total',a.total_amount::text,'recognized_fixed_total',e.result->'fixed_total','membership_complete',e.result->'membership_complete',
   'cost_count',e.result->'cost_count','combined_total',e.result->'combined_total','combined_average',e.result->'combined_average'
  ) order by y.year desc) from years y left join annual a on a.year=y.year left join enriched e on e.scope=y.year::text),'[]'::jsonb)
 ) from base b cross join config c;
$$;
revoke all on function public.golf_personal_annual_cost_report() from public,anon;
grant execute on function public.golf_personal_annual_cost_report() to authenticated;
notify pgrst,'reload schema';
