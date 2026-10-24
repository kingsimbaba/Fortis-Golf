-- New Cross Group Games only. Historical tournament behavior and all legacy rows remain intact.
begin;
alter table public.golf_events add column game_kind text not null default 'gross' check(game_kind in ('gross','cross'));
create table public.golf_cross_secrets (
 event_id uuid primary key references public.golf_events(id) on delete cascade,
 hidden_holes jsonb not null,
 rules jsonb
);
alter table public.golf_cross_secrets enable row level security;
revoke all on public.golf_cross_secrets from public,anon,authenticated;
-- No SELECT policy: raw holes must never enter participant-readable event rows.
create function public.golf_cross_draw() returns jsonb language sql volatile set search_path=pg_catalog as $$
 select jsonb_agg(h order by h) from (select h from generate_series(1,18) h order by random() limit 12) selected;
$$;
revoke all on function public.golf_cross_draw() from public,anon,authenticated;
create function public.golf_cross_command(action text, event_id uuid default null, payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 e public.golf_events; g public.golf_event_groups; result jsonb;
 course_data jsonb; roster jsonb; matrix jsonb; hole jsonb; cell jsonb; player jsonb;
 group_id uuid; expected integer; n integer; complete boolean:=true;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if action='create' then
  course_data:=payload->'course';
  if jsonb_typeof(course_data) is distinct from 'array' or jsonb_array_length(course_data)<>18 then raise exception '18 holes required'; end if;
  for hole in select value from jsonb_array_elements(course_data) loop
   if jsonb_typeof(hole->'par') is distinct from 'number' or (hole->>'par')!~'^[3-6]$'
    or coalesce(hole->>'display','')='' or coalesce(hole->>'sourceCourseId','')='' then raise exception 'Invalid course'; end if;
  end loop;
  insert into public.golf_events(owner_id,name,course,game_kind) values(auth.uid(),btrim(payload->>'name'),course_data,'cross') returning * into e;
  insert into public.golf_event_members values(e.id,auth.uid(),true);
  insert into public.golf_cross_secrets(event_id,hidden_holes) values(e.id,public.golf_cross_draw());
  return to_jsonb(e);
 end if;
 select * into e from public.golf_events where id=event_id for update;
 if not found or not public.golf_event_access(e.id) then raise exception 'Event unavailable'; end if;
 if e.game_kind<>'cross' then raise exception 'Cross Group Game required'; end if;
 if e.status='final' then raise exception 'Finalized game is locked'; end if;
 if action in ('selection','reroll','rules') then
  if e.owner_id<>auth.uid() then raise exception 'Organizer only'; end if;
  if action='rules' then
   if payload->'rules' is distinct from '{"version":1,"hole_cap":"double_par","handicap_min":0,"handicap_max":36,"decimals":1}'::jsonb then raise exception 'Unsupported Peoria rules'; end if;
   update public.golf_cross_secrets set rules=payload->'rules' where golf_cross_secrets.event_id=e.id;
  else
   roster:=case when action='reroll' then public.golf_cross_draw() else payload->'holes' end;
   if jsonb_typeof(roster) is distinct from 'array' or jsonb_array_length(roster)<>12 then raise exception '12 unique holes required'; end if;
   if exists(select 1 from jsonb_array_elements(roster) v where jsonb_typeof(v) is distinct from 'number' or v::text !~ '^(1[0-8]|[1-9])$')
    or (select count(distinct v) from jsonb_array_elements(roster) v)<>12 then raise exception '12 unique holes required'; end if;
   update public.golf_cross_secrets set hidden_holes=roster where golf_cross_secrets.event_id=e.id;
  end if;
  return '{}';
 elsif action='assign' then
  if e.owner_id<>auth.uid() then raise exception 'Organizer only'; end if;
  select * into g from public.golf_event_groups where id=(payload->>'group_id')::uuid and golf_event_groups.event_id=e.id;
  if not found then raise exception 'Group unavailable'; end if;
  if g.revision is distinct from (payload->>'revision')::integer then raise exception 'Scores changed on another device'; end if;
  if not exists(select 1 from public.golf_event_members m where m.event_id=e.id and m.user_id=(payload->>'user_id')::uuid and m.can_score) then raise exception 'Assigned scorer only'; end if;
  update public.golf_event_groups set scorer_id=(payload->>'user_id')::uuid,revision=revision+1,updated_at=now() where id=g.id returning to_jsonb(golf_event_groups.*) into result;
  return result;
 elsif action='invite' then
  if e.owner_id<>auth.uid() or e.status<>'live' then raise exception 'Only organizer may invite to a live event'; end if;
  insert into public.golf_event_members values(e.id,(payload->>'user_id')::uuid,coalesce((payload->>'can_score')::boolean,false))
  on conflict on constraint golf_event_members_pkey do update set can_score=excluded.can_score;
  return '{}';
 elsif action in ('sync','override') then
  if action='override' and e.owner_id<>auth.uid() then raise exception 'Organizer only'; end if;
  if action='sync' and not exists(select 1 from public.golf_event_members m where m.event_id=e.id and m.user_id=auth.uid() and m.can_score) then raise exception 'Assigned scorer only'; end if;
  if payload->'course' is distinct from e.course then raise exception 'Course layout must match event'; end if;
  roster:=payload->'players'; matrix:=payload->'scores';
  if jsonb_typeof(roster) is distinct from 'array' or jsonb_array_length(roster) not between 2 and 4 then raise exception '2–4 players required'; end if;
  n:=jsonb_array_length(roster);
  for player in select value from jsonb_array_elements(roster) loop
   if jsonb_typeof(player) is distinct from 'string' or length(btrim(player#>>'{}')) not between 1 and 120 then raise exception 'Invalid player'; end if;
  end loop;
  if (select count(distinct value) from jsonb_array_elements(roster))<>n then raise exception 'Duplicate players'; end if;
  if jsonb_typeof(matrix) is distinct from 'array' or jsonb_array_length(matrix)<>18 then raise exception '18 score rows required'; end if;
  for hole in select value from jsonb_array_elements(matrix) loop
   if jsonb_typeof(hole) is distinct from 'array' or jsonb_array_length(hole)<>n then raise exception 'Invalid score row'; end if;
   for cell in select value from jsonb_array_elements(hole) loop
    if cell='null'::jsonb then complete:=false;
    elsif jsonb_typeof(cell) is distinct from 'number' or cell::text!~'^[1-9][0-9]*$' or (cell::text)::numeric>999 then raise exception 'Scores must be whole positive strokes'; end if;
   end loop;
  end loop;
  if e.status='final' and not complete then raise exception 'Final results require all scores'; end if;
  group_id:=(payload->>'group_id')::uuid;
  expected:=(payload->>'revision')::integer;
  if group_id is null or expected is null then raise exception 'Group and revision required'; end if;
  select * into g from public.golf_event_groups where id=group_id;
  if found then
   if g.event_id<>e.id or (action='sync' and g.scorer_id<>auth.uid()) then raise exception 'Assigned scorer only'; end if;
   if g.revision<>expected then raise exception 'Scores changed on another device; reload group before editing'; end if;
   if g.players is distinct from roster then raise exception 'Group roster is fixed'; end if;
   update public.golf_event_groups set scores=matrix,revision=revision+1,updated_at=now() where id=g.id returning to_jsonb(golf_event_groups.*) into result;
  else
   if action='override' or e.status<>'live' or expected<>0 then raise exception 'Cannot add this group'; end if;
   if exists(select 1 from public.golf_event_groups other, jsonb_array_elements(other.players) p where other.event_id=e.id and roster @> jsonb_build_array(p.value)) then raise exception 'Player already in another group'; end if;
   insert into public.golf_event_groups(id,event_id,scorer_id,players,scores) values(group_id,e.id,auth.uid(),roster,matrix) returning to_jsonb(golf_event_groups.*) into result;
  end if;
  return result;
 elsif action='withdraw' then
  if e.status<>'live' then raise exception 'Final groups cannot withdraw'; end if;
  delete from public.golf_event_groups where id=(payload->>'group_id')::uuid and golf_event_groups.event_id=e.id and scorer_id=auth.uid();
  if not found and exists(select 1 from public.golf_event_groups where id=(payload->>'group_id')::uuid) then raise exception 'Assigned scorer only'; end if;
  return '{}';
 elsif action='finalize' then
  if e.owner_id<>auth.uid() then raise exception 'Organizer only'; end if;
  if not exists(select 1 from public.golf_cross_secrets s where s.event_id=e.id and s.rules is not null) then raise exception 'Confirm Peoria rules before finalization'; end if;
  if not exists(select 1 from public.golf_event_groups where golf_event_groups.event_id=e.id) or exists(
   select 1 from public.golf_event_groups gr, jsonb_array_elements(gr.scores) h, jsonb_array_elements(h.value) c
   where gr.event_id=e.id and c.value='null'::jsonb
  ) then raise exception 'Every player must complete 18 holes'; end if;
  update public.golf_events set status='final' where id=e.id returning to_jsonb(golf_events.*) into result;
  return result;
 else raise exception 'Unknown action'; end if;
end;
$$;

revoke all on function public.golf_cross_command(text,uuid,jsonb) from public,anon,authenticated;
-- Preserve the original command for old events, with no direct client execution path.
alter function public.golf_event_command(text,uuid,jsonb) rename to golf_legacy_event_command;
revoke all on function public.golf_legacy_event_command(text,uuid,jsonb) from public,anon,authenticated;
create function public.golf_event_command(action text,event_id uuid default null,payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if (action='create' and payload->>'game_kind'='cross') or exists(select 1 from public.golf_events e where e.id=event_id and e.game_kind='cross') then
  return public.golf_cross_command(action,event_id,payload);
 end if;
 return public.golf_legacy_event_command(action,event_id,payload);
end;
$$;
revoke all on function public.golf_event_command(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.golf_event_command(text,uuid,jsonb) to authenticated;
-- Owner may inspect/reselect before publication. Other participants only receive holes at finalization.
create function public.golf_cross_state(event_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.golf_events; s public.golf_cross_secrets;
begin
 select * into e from public.golf_events where id=event_id;
 if auth.uid() is null or not found or not public.golf_event_access(e.id) then raise exception 'Event unavailable'; end if;
 select * into s from public.golf_cross_secrets where golf_cross_secrets.event_id=e.id;
 return jsonb_build_object('rules',s.rules,'holes',case when e.owner_id=auth.uid() or e.status='final' then s.hidden_holes else null end);
end;
$$;
revoke all on function public.golf_cross_state(uuid) from public,anon,authenticated;
grant execute on function public.golf_cross_state(uuid) to authenticated;
-- Vegas history is owner-only and separate from 8421 statistics and matchups.
create table public.golf_vegas_rounds (
 id text not null,
 owner_id uuid not null references auth.users(id),
 round_data jsonb not null check(round_data->>'gameMode'='vegas'),
 created_at timestamptz not null default now(),
 primary key(owner_id,id)
);
alter table public.golf_vegas_rounds enable row level security;
revoke all on public.golf_vegas_rounds from public,anon,authenticated;
grant select,insert on public.golf_vegas_rounds to authenticated;
create policy owner_read on public.golf_vegas_rounds for select to authenticated using(owner_id=auth.uid());
create policy owner_insert on public.golf_vegas_rounds for insert to authenticated with check(owner_id=auth.uid());
commit;
