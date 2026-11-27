-- New standalone games only. Existing 8421/Vegas data and policies are untouched.
begin;
create table public.golf_high_low_rounds (
 id text not null,
 owner_id uuid not null references auth.users(id),
 game_kind text not null check (game_kind in ('highLowTotal','highLow')),
 round_data jsonb not null,
 created_at timestamptz not null default now(),
 primary key(owner_id,id)
);
create index golf_high_low_history on public.golf_high_low_rounds(owner_id,game_kind,created_at desc,id);
alter table public.golf_high_low_rounds enable row level security;
revoke all on public.golf_high_low_rounds from public,anon,authenticated;
grant select,insert,update on public.golf_high_low_rounds to authenticated;
create policy owner_read on public.golf_high_low_rounds for select to authenticated using(owner_id=(select auth.uid()));
create policy owner_insert on public.golf_high_low_rounds for insert to authenticated with check(owner_id=(select auth.uid()));
create policy owner_update on public.golf_high_low_rounds for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create function public.validate_high_low_round() returns trigger language plpgsql security invoker set search_path='' as $$
declare card jsonb; cell jsonb; player jsonb;
begin
 if new.round_data->>'gameMode' is distinct from new.game_kind then raise exception 'Game mode mismatch'; end if;
 if jsonb_typeof(new.round_data->'players') is distinct from 'array' or jsonb_array_length(new.round_data->'players')<>4 then raise exception 'Four players required'; end if;
 if (select count(distinct value) from jsonb_array_elements(new.round_data->'players'))<>4 then raise exception 'Different players required'; end if;
 for player in select value from jsonb_array_elements(new.round_data->'players') loop
  if jsonb_typeof(player) is distinct from 'string' or length(btrim(player#>>'{}')) not between 1 and 120 then raise exception 'Invalid player'; end if;
 end loop;
 if jsonb_typeof(new.round_data->'initialRanks') is distinct from 'array' or jsonb_array_length(new.round_data->'initialRanks')<>4 or (select count(distinct value) from jsonb_array_elements(new.round_data->'initialRanks'))<>4 then raise exception 'Four unique distance ranks required'; end if;
 for cell in select value from jsonb_array_elements(new.round_data->'initialRanks') loop
  if jsonb_typeof(cell) is distinct from 'number' or cell::text!~'^[1-4]$' then raise exception 'Distance ranks must be 1-4'; end if;
 end loop;
 if coalesce(new.round_data->>'startHoleIndex','0')!~'^(1[0-7]|[0-9])$' then raise exception 'Invalid start hole'; end if;
 if jsonb_typeof(new.round_data->'course') is distinct from 'array' or jsonb_array_length(new.round_data->'course')<>18 then raise exception '18 course holes required'; end if;
 for card in select value from jsonb_array_elements(new.round_data->'course') loop
  if jsonb_typeof(card->'par') is distinct from 'number' or (card->'par')::text!~'^[3-6]$' then raise exception 'Invalid par'; end if;
 end loop;
 if jsonb_typeof(new.round_data->'scores') is distinct from 'array' or jsonb_array_length(new.round_data->'scores')<>18 then raise exception '18 score rows required'; end if;
 for card in select value from jsonb_array_elements(new.round_data->'scores') loop
  if jsonb_typeof(card) is distinct from 'array' or jsonb_array_length(card)<>4 then raise exception 'Four scores required'; end if;
  for cell in select value from jsonb_array_elements(card) loop
   if jsonb_typeof(cell) is distinct from 'number' or cell::text!~'^[1-9][0-9]{0,2}$' then raise exception 'Scores must be whole strokes 1-999'; end if;
  end loop;
 end loop;
 return new;
end $$;
revoke all on function public.validate_high_low_round() from public,anon,authenticated;
create trigger validate_high_low_round before insert or update on public.golf_high_low_rounds for each row execute function public.validate_high_low_round();
notify pgrst,'reload schema';
commit;
