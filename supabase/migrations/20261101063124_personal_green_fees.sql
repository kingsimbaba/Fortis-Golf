-- Blank means unknown. Zero explicitly records a free round or no game result.
alter table public.golf_personal_round_amounts
 add column green_fee numeric(12,2) check (green_fee between 0 and 999999999.99),
 add column net_cost numeric(13,2) generated always as (
  case when green_fee is null or (fortis_amount is null and individual_amount is null and other_amount is null) then null
  else green_fee-coalesce(fortis_amount,0)-coalesce(individual_amount,0)-coalesce(other_amount,0) end
 ) stored;

-- SECURITY INVOKER preserves the caller's ownership policies. No user ID parameter.
create function public.golf_personal_cost_summary() returns jsonb
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
 ) from public.golf_personal_round_amounts where user_id=(select auth.uid());
$$;
revoke all on function public.golf_personal_cost_summary() from public,anon;
grant execute on function public.golf_personal_cost_summary() to authenticated;
