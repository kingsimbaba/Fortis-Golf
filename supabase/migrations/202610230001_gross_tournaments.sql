-- Additive migration. Does not modify live_rounds, fortis_rounds, hole_scores or 8421.
begin;
create table public.golf_events (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 name text not null check(length(name) between 1 and 120),
 course jsonb not null check(jsonb_typeof(course)='array' and jsonb_array_length(course)=18),
 status text not null default 'live' check(status in ('live','final')),
 created_at timestamptz not null default now()
);
create table public.golf_event_members (
 event_id uuid not null references public.golf_events(id) on delete cascade,
 user_id uuid not null references auth.users(id),
 can_score boolean not null default false,
 primary key(event_id,user_id)
);
create table public.golf_event_groups (
 id uuid primary key,
 event_id uuid not null references public.golf_events(id) on delete cascade,
 scorer_id uuid not null references auth.users(id),
 players jsonb not null,
 scores jsonb not null,
 revision integer not null default 1,
 updated_at timestamptz not null default now(),
 unique(event_id,scorer_id)
);
create function public.golf_event_access(e uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.golf_event_members where event_id=e and user_id=auth.uid());
$$;
revoke all on function public.golf_event_access(uuid) from public,anon,authenticated;
grant execute on function public.golf_event_access(uuid) to authenticated;
alter table public.golf_events enable row level security;
alter table public.golf_event_members enable row level security;
alter table public.golf_event_groups enable row level security;
create policy participant_read on public.golf_events for select to authenticated using(public.golf_event_access(id));
create policy participant_read on public.golf_event_members for select to authenticated using(public.golf_event_access(event_id));
create policy participant_read on public.golf_event_groups for select to authenticated using(public.golf_event_access(event_id));
revoke all on public.golf_events,public.golf_event_members,public.golf_event_groups from anon,authenticated;
grant select on public.golf_events,public.golf_event_members,public.golf_event_groups to authenticated;

-- All writes pass through one authorized, serialized transaction. Revisions reject stale devices.
create function public.golf_event_command(action text, event_id uuid default null, payload jsonb default '{}')
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
  insert into public.golf_events(owner_id,name,course) values(auth.uid(),btrim(payload->>'name'),course_data) returning * into e;
  insert into public.golf_event_members values(e.id,auth.uid(),true);
  return to_jsonb(e);
 end if;
 select * into e from public.golf_events where id=event_id for update;
 if not found or not public.golf_event_access(e.id) then raise exception 'Event unavailable'; end if;
 if action='invite' then
  if e.owner_id<>auth.uid() or e.status<>'live' then raise exception 'Only organizer may invite to a live event'; end if;
  insert into public.golf_event_members values(e.id,(payload->>'user_id')::uuid,coalesce((payload->>'can_score')::boolean,false))
  on conflict on constraint golf_event_members_pkey do update set can_score=excluded.can_score;
  return '{}';
 elsif action='sync' then
  if not exists(select 1 from public.golf_event_members m where m.event_id=e.id and m.user_id=auth.uid() and m.can_score) then raise exception 'Assigned scorer only'; end if;
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
   if g.event_id<>e.id or g.scorer_id<>auth.uid() then raise exception 'Assigned scorer only'; end if;
   if g.revision<>expected then raise exception 'Scores changed on another device; reload group before editing'; end if;
   if g.players is distinct from roster then raise exception 'Group roster is fixed'; end if;
   update public.golf_event_groups set scores=matrix,revision=revision+1,updated_at=now() where id=g.id returning to_jsonb(golf_event_groups.*) into result;
  else
   if e.status<>'live' or expected<>0 then raise exception 'Cannot add this group'; end if;
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
  if not exists(select 1 from public.golf_event_groups where golf_event_groups.event_id=e.id) or exists(
   select 1 from public.golf_event_groups gr, jsonb_array_elements(gr.scores) h, jsonb_array_elements(h.value) c
   where gr.event_id=e.id and c.value='null'::jsonb
  ) then raise exception 'Every player must complete 18 holes'; end if;
  update public.golf_events set status='final' where id=e.id returning to_jsonb(golf_events.*) into result;
  return result;
 else raise exception 'Unknown action'; end if;
end;
$$;
revoke all on function public.golf_event_command(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.golf_event_command(text,uuid,jsonb) to authenticated;
commit;
