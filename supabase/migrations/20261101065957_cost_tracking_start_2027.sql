-- Account-specific year boundary. Existing accounts without a preference retain historical totals.
create table public.golf_personal_cost_settings (
 user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
 start_year integer not null check (start_year between 1900 and 2199)
);
alter table public.golf_personal_cost_settings enable row level security;
revoke all on public.golf_personal_cost_settings from public,anon,authenticated;
grant select,insert,update on public.golf_personal_cost_settings to authenticated;
create policy cost_settings_read on public.golf_personal_cost_settings for select to authenticated using ((select auth.uid())=user_id);
create policy cost_settings_insert on public.golf_personal_cost_settings for insert to authenticated with check ((select auth.uid())=user_id);
create policy cost_settings_update on public.golf_personal_cost_settings for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create function public.golf_personal_cost_tracking_start() returns date
language sql stable security invoker set search_path='' as $$
 select make_date(coalesce((select start_year from public.golf_personal_cost_settings where user_id=(select auth.uid())),1900),1,1);
$$;
revoke all on function public.golf_personal_cost_tracking_start() from public,anon;
grant execute on function public.golf_personal_cost_tracking_start() to authenticated;

create or replace function public.golf_personal_cost_summary() returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'record_count',count(*),
  'fee_count',count(green_fee),'game_count',count(total_amount),'cost_count',count(net_cost),
  'fee_total',sum(green_fee)::text,'fee_average',round(avg(green_fee),2)::text,
  'game_total',sum(total_amount)::text,'game_average',round(avg(total_amount),2)::text,
  'cost_total',sum(net_cost)::text,'cost_average',round(avg(net_cost),2)::text,
  'winnings_total',(sum(greatest(total_amount,0)) filter(where total_amount is not null))::text,
  'losses_total',(sum(least(total_amount,0)) filter(where total_amount is not null))::text,
  'winnings_average',round((sum(greatest(total_amount,0)) filter(where total_amount is not null))/nullif(count(total_amount),0),2)::text,
  'losses_average',round((sum(least(total_amount,0)) filter(where total_amount is not null))/nullif(count(total_amount),0),2)::text
 ) from public.golf_personal_round_amounts p join public.fortis_rounds r on r.id=p.round_id
 where p.user_id=(select auth.uid())
 and r.played_at >= (public.golf_personal_cost_tracking_start()::timestamp at time zone 'Asia/Taipei')
 and r.played_at <= current_timestamp;
$$;
revoke all on function public.golf_personal_cost_summary() from public,anon;
grant execute on function public.golf_personal_cost_summary() to authenticated;

-- A private report with played-date ordering and Taipei calendar-year boundaries.
create or replace function public.golf_personal_cost_report() returns jsonb
language sql stable security invoker set search_path='' as $$
 with aliases as (
  select lower(btrim(display_name)) as name from public.profiles where id=(select auth.uid()) and nullif(btrim(display_name),'') is not null
  union
  select lower(btrim(player_name)) from public.golf_personal_round_amounts where user_id=(select auth.uid()) and player_name is not null
 ), recent as (
  select r.id as round_id,r.round_name,r.course_name,r.course_combo,r.played_at,p.green_fee,p.total_amount,p.net_cost
  from public.fortis_rounds r left join public.golf_personal_round_amounts p on p.round_id=r.id and p.user_id=(select auth.uid())
  where (r.played_at<=current_timestamp or r.played_at is null) and (
   p.user_id is not null
   or exists(select 1 from jsonb_array_elements_text(case when jsonb_typeof(r.players)='array' then r.players else '[]'::jsonb end) n where lower(btrim(n)) in (select name from aliases))
   or exists(select 1 from public.hole_scores h where h.round_id=r.id and lower(btrim(h.player_name)) in (select name from aliases))
  )
  order by r.played_at desc nulls last,r.id desc limit 5
 )
 select jsonb_build_object(
  'tracking_start_date',public.golf_personal_cost_tracking_start()::text,
  'year',extract(year from current_timestamp at time zone 'Asia/Taipei')::int,
  'as_of',to_char(current_timestamp at time zone 'Asia/Taipei','YYYY-MM-DD'),
  'all_time',public.golf_personal_cost_summary(),
  'ytd',( select jsonb_build_object(
  'record_count',count(*),
  'fee_count',count(green_fee),'game_count',count(total_amount),'cost_count',count(net_cost) filter(where played_at >= (public.golf_personal_cost_tracking_start()::timestamp at time zone 'Asia/Taipei')),
  'fee_total',sum(green_fee)::text,'fee_average',round(avg(green_fee),2)::text,
  'game_total',sum(total_amount)::text,'game_average',round(avg(total_amount),2)::text,
  'cost_total',sum(net_cost) filter(where played_at >= (public.golf_personal_cost_tracking_start()::timestamp at time zone 'Asia/Taipei'))::text,'cost_average',round(avg(net_cost) filter(where played_at >= (public.golf_personal_cost_tracking_start()::timestamp at time zone 'Asia/Taipei')),2)::text,
  'winnings_total',(sum(greatest(total_amount,0)) filter(where total_amount is not null))::text,
  'losses_total',(sum(least(total_amount,0)) filter(where total_amount is not null))::text,
  'winnings_average',round((sum(greatest(total_amount,0)) filter(where total_amount is not null))/nullif(count(total_amount),0),2)::text,
  'losses_average',round((sum(least(total_amount,0)) filter(where total_amount is not null))/nullif(count(total_amount),0),2)::text
 ) from public.golf_personal_round_amounts p join public.fortis_rounds r on r.id=p.round_id
 where p.user_id=(select auth.uid()) and r.played_at >= greatest((date_trunc('year',current_timestamp at time zone 'Asia/Taipei') at time zone 'Asia/Taipei'),(public.golf_personal_cost_tracking_start()::timestamp at time zone 'Asia/Taipei')) and r.played_at <= current_timestamp),
  'recent',coalesce((select jsonb_agg(jsonb_build_object(
   'round_id',round_id::text,'title',coalesce(nullif(round_name,''),course_name,'高爾夫回合'),
   'course',concat_ws(' ',course_name,course_combo),'date',to_char(played_at at time zone 'Asia/Taipei','YYYY-MM-DD'),
   'included_in_career',coalesce(played_at >= (public.golf_personal_cost_tracking_start()::timestamp at time zone 'Asia/Taipei'),false),
   'green_fee',green_fee::text,'game_total',total_amount::text,'net_cost',net_cost::text
  ) order by played_at desc nulls last,round_id desc) from recent),'[]'::jsonb),
  'recent_cost_count',(select count(net_cost) filter(where played_at >= (public.golf_personal_cost_tracking_start()::timestamp at time zone 'Asia/Taipei')) from recent),
  'recent_cost_total',(select sum(net_cost) filter(where played_at >= (public.golf_personal_cost_tracking_start()::timestamp at time zone 'Asia/Taipei'))::text from recent),
  'recent_cost_average',(select round(avg(net_cost) filter(where played_at >= (public.golf_personal_cost_tracking_start()::timestamp at time zone 'Asia/Taipei')),2)::text from recent)
 );
$$;
revoke all on function public.golf_personal_cost_report() from public,anon;
grant execute on function public.golf_personal_cost_report() to authenticated;

create or replace function public.golf_personal_annual_cost_report() returns jsonb
language sql stable security invoker set search_path='' as $$
 with base as (select public.golf_personal_cost_report() as report),
 annual as (select * from public.golf_personal_annual_costs where user_id=(select auth.uid())),
 round_years as (
  select extract(year from r.played_at at time zone 'Asia/Taipei')::int as year,
   count(p.net_cost) as cost_count,sum(p.net_cost) as round_cost_total
  from public.golf_personal_round_amounts p join public.fortis_rounds r on r.id=p.round_id
  where p.user_id=(select auth.uid()) and r.played_at<=current_timestamp and r.played_at >= (public.golf_personal_cost_tracking_start()::timestamp at time zone 'Asia/Taipei')
  group by extract(year from r.played_at at time zone 'Asia/Taipei')
 ), years as (
  select (report->>'year')::int as year from base
  union select extract(year from public.golf_personal_cost_tracking_start())::int where public.golf_personal_cost_tracking_start()>date '1900-01-01'
  union select year from annual
  union select year from round_years where year between 1900 and 2199
 ), scopes as (
  select 'all_time' as scope,report->'all_time' as stats,
   (select sum(total_amount) from annual where year between extract(year from public.golf_personal_cost_tracking_start())::int and (report->>'year')::int) as fixed_total from base
  union all
  select 'ytd',report->'ytd',(select total_amount from annual where year=(report->>'year')::int and year>=extract(year from public.golf_personal_cost_tracking_start())::int) from base
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
   'year',y.year,'included_in_career',y.year>=extract(year from public.golf_personal_cost_tracking_start())::int,
   'membership_fee',a.membership_fee::text,'insurance_fee',a.insurance_fee::text,'other_fixed_costs',a.other_fixed_costs::text,
   'fixed_total',a.total_amount::text,'cost_count',coalesce(r.cost_count,0),
   'combined_total',case when y.year<extract(year from public.golf_personal_cost_tracking_start())::int then null when r.round_cost_total is null and a.total_amount is null then null else (coalesce(r.round_cost_total,0)+coalesce(a.total_amount,0))::text end,
   'combined_average',case when y.year<extract(year from public.golf_personal_cost_tracking_start())::int then null when r.round_cost_total is null and a.total_amount is null then null else round((coalesce(r.round_cost_total,0)+coalesce(a.total_amount,0))/nullif(r.cost_count,0),2)::text end
  ) order by y.year desc) from years y left join annual a on a.year=y.year left join round_years r on r.year=y.year),'[]'::jsonb)
 ) from base;
$$;
revoke all on function public.golf_personal_annual_cost_report() from public,anon;
grant execute on function public.golf_personal_annual_cost_report() to authenticated;
notify pgrst,'reload schema';
