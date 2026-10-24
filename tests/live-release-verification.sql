-- Run on the deployed database with a privileged test connection.
-- Every test record and modification is rolled back. No auth users are created.
begin;
do $check$
declare
 users uuid[]; event jsonb; legacy jsonb; course jsonb; matrix jsonb; data jsonb; saved jsonb; st jsonb;
 gid uuid:=gen_random_uuid(); legacy_gid uuid:=gen_random_uuid(); final_action text;
begin
 select array_agg(id order by id) into users from (select id from auth.users order by id limit 3) u;
 if array_length(users,1)<3 then raise exception 'Three existing accounts required for role checks'; end if;
 select jsonb_agg(jsonb_build_object('par',4,'display','Check '||h,'sourceCourseId','release-check') order by h) into course from generate_series(1,18) h;
 select jsonb_agg('[4,5]'::jsonb order by h) into matrix from generate_series(1,18) h;
 perform set_config('request.jwt.claim.sub',users[1]::text,true);
 set local role authenticated;
 event:=public.golf_event_command('create',null,jsonb_build_object('name','Transaction-only release check','course',course,'game_kind','cross'));
 if jsonb_array_length(public.golf_cross_state((event->>'id')::uuid)->'holes')<>12 then raise exception 'Owner hidden holes failed'; end if;
 begin perform 1 from public.golf_cross_secrets; raise exception 'Raw secret access unexpectedly allowed'; exception when insufficient_privilege then null; end;
 begin perform public.golf_cross_command('reroll',(event->>'id')::uuid,'{}'); raise exception 'Private helper unexpectedly callable'; exception when insufficient_privilege then null; end;
 perform public.golf_event_command('invite',(event->>'id')::uuid,jsonb_build_object('user_id',users[2],'can_score',true));
 perform public.golf_event_command('invite',(event->>'id')::uuid,jsonb_build_object('user_id',users[3],'can_score',false));
 data:=jsonb_build_object('group_id',gid,'revision',0,'course',course,'players','["Release Check A","Release Check B"]'::jsonb,'scores',matrix);
 perform set_config('request.jwt.claim.sub',users[2]::text,true);
 saved:=public.golf_event_command('sync',(event->>'id')::uuid,data);
 if saved->>'revision'<>'1' then raise exception 'Initial scorer sync failed'; end if;
 if public.golf_cross_state((event->>'id')::uuid)->'holes'<>'null'::jsonb then raise exception 'Hidden holes leaked to scorer'; end if;
 perform set_config('request.jwt.claim.sub',users[3]::text,true);
 begin perform public.golf_event_command('sync',(event->>'id')::uuid,data); raise exception 'Viewer sync unexpectedly allowed'; exception when others then if sqlerrm not like '%Assigned scorer only%' then raise; end if; end;
 if public.golf_cross_state((event->>'id')::uuid)->'holes'<>'null'::jsonb then raise exception 'Hidden holes leaked to viewer'; end if;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 if exists(select 1 from public.golf_events e where e.id=(event->>'id')::uuid) then raise exception 'Outsider read unexpectedly allowed'; end if;
 begin perform public.golf_cross_state((event->>'id')::uuid); raise exception 'Outsider state unexpectedly allowed'; exception when others then if sqlerrm not like '%Event unavailable%' then raise; end if; end;
 perform set_config('request.jwt.claim.sub',users[1]::text,true);
 saved:=public.golf_event_command('override',(event->>'id')::uuid,data||'{"revision":1}'::jsonb);
 if saved->>'revision'<>'2' then raise exception 'Owner correction failed'; end if;
 perform set_config('request.jwt.claim.sub',users[2]::text,true);
 begin perform public.golf_event_command('sync',(event->>'id')::uuid,data||'{"revision":1}'::jsonb); raise exception 'Stale sync unexpectedly allowed'; exception when others then if sqlerrm not like '%another device%' then raise; end if; end;
 perform set_config('request.jwt.claim.sub',users[1]::text,true);
 perform public.golf_event_command('selection',(event->>'id')::uuid,'{"holes":[1,2,3,4,5,6,7,8,9,10,17,18]}'::jsonb);
 perform public.golf_event_command('rules',(event->>'id')::uuid,'{"rules":{"version":1,"hole_cap":"double_par","handicap_min":0,"handicap_max":36,"decimals":1}}'::jsonb);
 saved:=public.golf_event_command('finalize',(event->>'id')::uuid,'{}');
 if saved->>'status'<>'final' then raise exception 'Finalization failed'; end if;
 foreach final_action in array array['sync','override','reroll','selection','rules','assign','invite','withdraw','finalize'] loop
  begin perform public.golf_event_command(final_action,(event->>'id')::uuid,data||'{"revision":2}'::jsonb); raise exception 'Post-final mutation unexpectedly allowed'; exception when others then if sqlerrm not like '%Finalized game is locked%' then raise; end if; end;
 end loop;
 perform set_config('request.jwt.claim.sub',users[3]::text,true);
 if jsonb_array_length(public.golf_cross_state((event->>'id')::uuid)->'holes')<>12 then raise exception 'Final hidden hole reveal failed'; end if;
 -- New owner-only Vegas storage rejects another user's reads and writes.
 insert into public.golf_vegas_rounds(id,owner_id,round_data) values ('release-check',users[3],'{"gameMode":"vegas"}');
 perform set_config('request.jwt.claim.sub',users[2]::text,true);
 if exists(select 1 from public.golf_vegas_rounds where id='release-check') then raise exception 'Vegas ownership read failed'; end if;
 begin insert into public.golf_vegas_rounds(id,owner_id,round_data) values ('release-check-spoof',users[3],'{"gameMode":"vegas"}'); raise exception 'Vegas ownership insert unexpectedly allowed'; exception when insufficient_privilege then null; end;
 -- The retained gross-event path still allows its historical final-score corrections.
 perform set_config('request.jwt.claim.sub',users[1]::text,true);
 legacy:=public.golf_event_command('create',null,jsonb_build_object('name','Legacy transaction-only check','course',course));
 data:=data||jsonb_build_object('group_id',legacy_gid,'revision',0);
 perform public.golf_event_command('sync',(legacy->>'id')::uuid,data);
 perform public.golf_event_command('finalize',(legacy->>'id')::uuid,'{}');
 saved:=public.golf_event_command('sync',(legacy->>'id')::uuid,data||'{"revision":1}'::jsonb);
 if saved->>'revision'<>'2' then raise exception 'Legacy final correction changed'; end if;
 reset role;
end;
$check$;
rollback;
select 'PASS: owner/scorer/viewer/outsider isolation, secret access, revision protection, final lock/reveal, Vegas ownership, legacy correction; all test records rolled back' as release_validation;
