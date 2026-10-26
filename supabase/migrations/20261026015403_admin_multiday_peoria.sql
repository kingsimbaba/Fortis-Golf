-- Additive event storage. No legacy scoring or statistics tables are modified.
begin;
create table public.peoria_events (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 name text not null check(length(btrim(name)) between 1 and 120),
 day_count integer not null check(day_count between 1 and 14), roster jsonb not null,
 revision integer not null default 0, share_token uuid not null unique default gen_random_uuid(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index peoria_events_owner_idx on public.peoria_events(owner_id);
create table public.peoria_days (
 event_id uuid not null references public.peoria_events(id), day_no integer not null check(day_no between 1 and 14),
 played_on date not null, course_label text not null, course jsonb not null, scorecards jsonb not null,
 source_round_id text, hidden_holes jsonb not null, status text not null default 'draft' check(status in ('draft','published')),
 result jsonb, primary key(event_id,day_no)
);
alter table public.peoria_events enable row level security;
alter table public.peoria_days enable row level security;
revoke all on public.peoria_events,public.peoria_days from public,anon,authenticated;
-- No table writes or draft reads through the Data API; all access is through bounded RPCs.
create function public.peoria_is_admin() returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from auth.users u where u.id=auth.uid() and
  (lower(u.email)='mailhsingchen@gmail.com' or u.raw_app_meta_data->>'role'='admin'));
$$;
revoke all on function public.peoria_is_admin() from public,anon,authenticated;
create function public.peoria_daily_result(roster jsonb,course jsonb,scorecards jsonb,holes jsonb) returns jsonb
language plpgsql immutable set search_path=pg_catalog as $$
declare p jsonb; card jsonb; cell jsonb; total_par integer:=0; gross integer; hidden integer; hdcp integer; rows jsonb:='[]'; result jsonb; idx integer; n integer;
begin
 if jsonb_array_length(holes)<>12 or (select count(distinct value::int) from jsonb_array_elements_text(holes))<>12
  or exists(select 1 from jsonb_array_elements_text(holes) where value::int not between 1 and 18) then raise exception '選洞資料錯誤'; end if;
 select sum((value->>'par')::int) into total_par from jsonb_array_elements(course);
 for p in select value from jsonb_array_elements(roster) loop
  select value into card from jsonb_array_elements(scorecards) where value->>'player_id'=p->>'id';
  if card is null or jsonb_array_length(card->'scores')<>18 then raise exception '請完成所有球員 18 洞桿數'; end if;
  if card->>'absent'='true' then continue;end if;
  gross:=0;hidden:=0;
  for idx in 0..17 loop
   cell:=card->'scores'->idx;
   if jsonb_typeof(cell) is distinct from 'number' or cell::text!~'^[0-9]+$' or cell::text::int not between 1 and 999 then raise exception '請完成所有球員 18 洞整數桿數'; end if;
   n:=cell::text::int;gross:=gross+n;
   if holes @> jsonb_build_array(idx+1) then hidden:=hidden+least(n,(course->idx->>'par')::int*2); end if;
  end loop;
  hdcp:=greatest(0,least(360,round((hidden*1.5-total_par)*8)::int));
  rows:=rows||jsonb_build_array(jsonb_build_object('player_id',p->>'id','name',p->>'name','gross',gross,'handicap',hdcp/10.0,'net',(gross*10-hdcp)/10.0));
 end loop;
 if jsonb_array_length(rows)<2 then raise exception '本日至少需要兩位有完整成績的球員';end if;
 select jsonb_agg(value||jsonb_build_object('rank',rnk) order by (value->>'net')::numeric,value->>'name',value->>'player_id') into result
 from (select value,rank() over(order by (value->>'net')::numeric) rnk from jsonb_array_elements(rows)) ranked;
 return jsonb_build_object('course_par',total_par,'included_holes',holes,'excluded_holes',
  (select jsonb_agg(h order by h) from generate_series(1,18) h where not holes @> jsonb_build_array(h)),
  'rules',jsonb_build_object('hole_cap','double_par','handicap_min',0,'handicap_max',36,'decimals',1),'rows',result);
end $$;
revoke all on function public.peoria_daily_result(jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
create function public.peoria_command(action text,event_id uuid default null,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.peoria_events; v_day public.peoria_days; roster_data jsonb; item jsonb; card jsonb; cell jsonb;
 day_number integer; count_days integer; n integer; selection jsonb; result_data jsonb; course_data jsonb; cards jsonb; revision_number integer;
begin
 if auth.uid() is null or not public.peoria_is_admin() then raise exception '僅管理員可管理新新貝利亞賽事'; end if;
 if action='list' then
  return coalesce((select jsonb_agg(to_jsonb(x) order by updated_at desc) from
   (select p.id,p.name,p.day_count,p.roster,p.revision,p.share_token,p.created_at,p.updated_at,
    (select count(*) from public.peoria_days pd_list where pd_list.event_id=p.id and pd_list.status='published') published_days
    from public.peoria_events p where p.owner_id=auth.uid()) x),'[]');
 end if;
 if action='create' then
  roster_data:=payload->'roster';count_days:=(payload->>'day_count')::int;
  if count_days is null or count_days not between 1 and 14 then raise exception '賽事天數須為 1–14 天'; end if;
  if coalesce(length(btrim(payload->>'name')),0) not between 1 and 120 then raise exception '請輸入賽事名稱（最多 120 字）'; end if;
  if jsonb_typeof(roster_data) is distinct from 'array' or jsonb_array_length(roster_data) not between 2 and 100 then raise exception '參賽人數須為 2–100 人'; end if;
  for item in select value from jsonb_array_elements(roster_data) loop
   if coalesce(length(item->>'id'),0) not between 1 and 80 or coalesce(length(btrim(item->>'name')),0) not between 1 and 80 then raise exception '請填寫球員姓名'; end if;
  end loop;
  if (select count(distinct value->>'id') from jsonb_array_elements(roster_data))<>jsonb_array_length(roster_data)
   or (select count(distinct lower(btrim(value->>'name'))) from jsonb_array_elements(roster_data))<>jsonb_array_length(roster_data) then raise exception '球員識別與姓名不可重複'; end if;
  select jsonb_agg(jsonb_build_object('id',value->>'id','name',btrim(value->>'name')) order by ord) into roster_data from jsonb_array_elements(roster_data) with ordinality as entries(value,ord);
  -- Client supplies a stable request id; a repeated request cannot create a second event.
  insert into public.peoria_events(id,owner_id,name,day_count,roster)
   values(coalesce(event_id,gen_random_uuid()),auth.uid(),btrim(payload->>'name'),count_days,roster_data)
   on conflict(id) do nothing returning * into e;
  if not found then select * into e from public.peoria_events p where p.id=event_id and p.owner_id=auth.uid();
   if not found then raise exception '賽事無法存取'; end if;
  end if;
 else
  select * into e from public.peoria_events p where p.id=event_id for update;
  if not found or e.owner_id<>auth.uid() then raise exception '賽事無法存取'; end if;
  if action not in ('get','save_day','preview','publish','reopen') then raise exception '不支援的操作'; end if;
  if action<>'get' then
   revision_number:=(payload->>'revision')::int;
   if revision_number is distinct from e.revision then raise exception '資料已在其他視窗更新，請重新開啟賽事再試'; end if;
   day_number:=(payload->>'day_no')::int;
   if day_number is null or day_number not between 1 and e.day_count then raise exception '賽事日數錯誤'; end if;
   select * into v_day from public.peoria_days pd where pd.event_id=e.id and pd.day_no=day_number for update;
   if action='save_day' then
    if v_day.status='published' then raise exception '當日成績已公布；請先按更正成績'; end if;
    course_data:=payload->'course';cards:=payload->'scorecards';
    if jsonb_typeof(course_data) is distinct from 'array' or jsonb_array_length(course_data)<>18 then raise exception '需要 18 洞球場資料'; end if;
    for item in select value from jsonb_array_elements(course_data) loop
     if jsonb_typeof(item->'par') is distinct from 'number' or (item->>'par')!~'^[3-6]$' or coalesce(length(item->>'display'),0) not between 1 and 120 then raise exception '球場標準桿資料錯誤'; end if;
    end loop;
    if coalesce(length(btrim(payload->>'course_label')),0) not between 1 and 200 then raise exception '請填寫球場名稱'; end if;
    if jsonb_typeof(cards) is distinct from 'array' or jsonb_array_length(cards)<>jsonb_array_length(e.roster) then raise exception '球員名單與賽事不符'; end if;
    for card in select value from jsonb_array_elements(cards) loop
     if not exists(select 1 from jsonb_array_elements(e.roster) p where p->>'id'=card->>'player_id') then raise exception '球員名單與賽事不符'; end if;
     if jsonb_typeof(card->'scores') is distinct from 'array' or jsonb_array_length(card->'scores')<>18 then raise exception '每位球員需要 18 洞欄位'; end if;
     if card ? 'absent' and jsonb_typeof(card->'absent') is distinct from 'boolean' then raise exception '缺席設定錯誤';end if;
     if card->>'absent'='true' and exists(select 1 from jsonb_array_elements(card->'scores') s where s<>'null'::jsonb) then raise exception '缺席球員不得填入桿數';end if;
     for cell in select value from jsonb_array_elements(card->'scores') loop
      if cell<>'null'::jsonb and (jsonb_typeof(cell) is distinct from 'number' or cell::text!~'^[0-9]+$' or cell::text::int not between 1 and 999) then raise exception '桿數須為 1–999 的整數，未完成請留空'; end if;
     end loop;
    end loop;
    if (select count(distinct value->>'player_id') from jsonb_array_elements(cards))<>jsonb_array_length(e.roster) then raise exception '球員不可重複'; end if;
    if v_day.event_id is null then
     select jsonb_agg(h order by h) into selection from (select h from generate_series(1,18) h order by random() limit 12) draw;
    else selection:=v_day.hidden_holes;end if;
    insert into public.peoria_days(event_id,day_no,played_on,course_label,course,scorecards,source_round_id,hidden_holes)
     values(e.id,day_number,(payload->>'played_on')::date,btrim(payload->>'course_label'),course_data,cards,payload->>'source_round_id',selection)
     on conflict on constraint peoria_days_pkey do update set played_on=excluded.played_on,course_label=excluded.course_label,
      course=excluded.course,scorecards=excluded.scorecards,source_round_id=excluded.source_round_id,result=null;
   elsif action='reopen' then
    if v_day.event_id is null or v_day.status<>'published' then raise exception '當日尚未公布'; end if;
    update public.peoria_days pd set status='draft',result=null where pd.event_id=e.id and pd.day_no=day_number;
   else
    if v_day.event_id is null then raise exception '請先儲存本日草稿'; end if;
    if v_day.status='published' then raise exception '當日成績已公布'; end if;
    result_data:=public.peoria_daily_result(e.roster,v_day.course,v_day.scorecards,v_day.hidden_holes);
    if action='publish' and v_day.result is null then raise exception '請先計算並預覽當日成績'; end if;
    update public.peoria_days pd set result=result_data,status=case when action='publish' then 'published' else 'draft' end
     where pd.event_id=e.id and pd.day_no=day_number;
   end if;
   update public.peoria_events p set revision=p.revision+1,updated_at=now() where p.id=e.id returning * into e;
  end if;
 end if;
 return to_jsonb(e)||jsonb_build_object('days',coalesce((select jsonb_agg(to_jsonb(pd)-'hidden_holes' order by day_no) from public.peoria_days pd where pd.event_id=e.id),'[]'));
end $$;
revoke all on function public.peoria_command(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.peoria_command(text,uuid,jsonb) to authenticated;
create function public.peoria_public_event(token uuid) returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('name',e.name,'day_count',e.day_count,'roster',e.roster,'created_at',e.created_at,'updated_at',e.updated_at,'days',
  (select jsonb_agg(jsonb_build_object('day_no',d.day_no,'played_on',d.played_on,'course_label',d.course_label,'status',d.status,'result',d.result) order by d.day_no)
   from public.peoria_days d where d.event_id=e.id and d.status='published'))
 from public.peoria_events e where e.share_token=token and exists(select 1 from public.peoria_days d where d.event_id=e.id and d.status='published');
$$;
revoke all on function public.peoria_public_event(uuid) from public,anon,authenticated;
grant execute on function public.peoria_public_event(uuid) to anon,authenticated;
create function public.peoria_published_events(search text default '') returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce(jsonb_agg(to_jsonb(x) order by updated_at desc),'[]') from (
  select e.name,e.day_count,e.share_token,e.created_at,e.updated_at,count(d.day_no)::int published_days
  from public.peoria_events e join public.peoria_days d on d.event_id=e.id and d.status='published'
  where position(lower(left(coalesce(search,''),120)) in lower(e.name))>0
  group by e.id order by e.updated_at desc limit 100
 ) x;
$$;
revoke all on function public.peoria_published_events(text) from public,anon,authenticated;
grant execute on function public.peoria_published_events(text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
