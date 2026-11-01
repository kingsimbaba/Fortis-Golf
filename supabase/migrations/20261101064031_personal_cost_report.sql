-- A private report with played-date ordering and Taipei calendar-year boundaries.
create function public.golf_personal_cost_report() returns jsonb
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
  'year',extract(year from current_timestamp at time zone 'Asia/Taipei')::int,
  'as_of',to_char(current_timestamp at time zone 'Asia/Taipei','YYYY-MM-DD'),
  'all_time',public.golf_personal_cost_summary(),
  'ytd',( select jsonb_build_object(
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
 where p.user_id=(select auth.uid()) and r.played_at >= (date_trunc('year',current_timestamp at time zone 'Asia/Taipei') at time zone 'Asia/Taipei') and r.played_at <= current_timestamp),
  'recent',coalesce((select jsonb_agg(jsonb_build_object(
   'round_id',round_id::text,'title',coalesce(nullif(round_name,''),course_name,'高爾夫回合'),
   'course',concat_ws(' ',course_name,course_combo),'date',to_char(played_at at time zone 'Asia/Taipei','YYYY-MM-DD'),
   'green_fee',green_fee::text,'game_total',total_amount::text,'net_cost',net_cost::text
  ) order by played_at desc nulls last,round_id desc) from recent),'[]'::jsonb),
  'recent_cost_count',(select count(net_cost) from recent),
  'recent_cost_total',(select sum(net_cost)::text from recent),
  'recent_cost_average',(select round(avg(net_cost),2)::text from recent)
 );
$$;
revoke all on function public.golf_personal_cost_report() from public,anon;
grant execute on function public.golf_personal_cost_report() to authenticated;
