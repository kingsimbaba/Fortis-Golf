import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),C=require('../scripts/cross-group.js'),P=require('../scripts/peoria.js');
const sql=readFileSync(new URL('../supabase/migrations/20261026015403_admin_multiday_peoria.sql',import.meta.url),'utf8');
test('admin-only drafts, server calculations, atomic publication, multi-day links and corrections',async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite'),db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
  const ids=[1,2,3].map(n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0'));
  for(let i=0;i<3;i++)await db.query('insert into auth.users values($1,$2,$3)',[ids[i],i===0?'mailhsingchen@gmail.com':'p'+i+'@example.com',JSON.stringify(i===1?{role:'admin'}:{})]);
  await db.exec(sql);
  const user=async i=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[i]]);await db.exec('set role authenticated');};
  const anon=async()=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)");await db.exec('set role anon');};
  const cmd=async(action,id=null,payload={})=>(await db.query('select peoria_command($1,$2,$3) result',[action,id,JSON.stringify(payload)])).rows[0].result;
  const pub=async token=>(await db.query('select peoria_public_event($1) result',[token])).rows[0].result;
  const list=async search=>(await db.query('select peoria_published_events($1) result',[search])).rows[0].result;
  const roster=Array.from({length:12},(_,i)=>({id:'p'+i,name:'Player '+i})),course=Array.from({length:18},(_,i)=>({par:i<2?3:4,display:'H'+(i+1)}));
  await user(2);await assert.rejects(cmd('create',null,{name:'Bad',day_count:3,roster}),/管理員/);
  await user(0);for(const payload of [{name:'',day_count:3,roster},{name:'Cup',day_count:0,roster},{name:'Cup',day_count:3,roster:[roster[0],roster[0]]}])await assert.rejects(cmd('create',null,payload));
  const request='10000000-0000-0000-0000-000000000001';let e=await cmd('create',request,{name:'福岡三日賽',day_count:3,roster});
  const repeated=await cmd('create',request,{name:'福岡三日賽',day_count:3,roster});assert.equal(repeated.id,e.id);assert.equal((await cmd('list')).length,1);
  const eventId=e.id,token=e.share_token;
  await user(1);await assert.rejects(cmd('get',eventId),/無法存取/);await assert.rejects(cmd('create',request,{name:'Hijack',day_count:3,roster}),/無法存取/);
  await anon();assert.equal(await pub(token),null);assert.deepEqual(await list(''),[]);await assert.rejects(cmd('get',eventId),/permission denied/);await assert.rejects(db.query('select * from peoria_events'),/permission denied/);await assert.rejects(db.query('select * from peoria_days'),/permission denied/);await assert.rejects(db.query('select peoria_daily_result($1,$2,$3,$4)',['[]','[]','[]','[]']),/permission denied/);
  await user(0);
  for(let day=1;day<=3;day++){
   const cards=roster.map((p,i)=>({player_id:p.id,scores:course.map(h=>h.par+i%4+(day===3&&i===0?-1:0))}));
   let payload={revision:e.revision,day_no:day,played_on:'2026-10-'+(25+day),course_label:'Course '+day,course,scorecards:cards,source_round_id:'legacy-unchanged'};
   const missing=structuredClone(payload);missing.scorecards[0].scores[0]=null;e=await cmd('save_day',eventId,missing);
   assert.equal('hidden_holes' in e.days.find(d=>d.day_no===day),false);
   await assert.rejects(cmd('preview',eventId,{day_no:day,revision:e.revision}),/完成/);
   await assert.rejects(cmd('save_day',eventId,payload),/其他視窗/);
   payload.revision=e.revision;e=await cmd('save_day',eventId,payload);
   await assert.rejects(cmd('publish',eventId,{day_no:day,revision:e.revision}),/預覽/);
   e=await cmd('preview',eventId,{day_no:day,revision:e.revision});const d=e.days.find(d=>d.day_no===day),r=d.result;
   assert.equal(r.rows.length,12);assert.equal(r.excluded_holes.length,6);assert.equal(r.included_holes.length,12);assert.equal(new Set([...r.included_holes,...r.excluded_holes]).size,18);
   const expected=C.netLeaderboard({status:'final',course},[{id:'g',players:roster.map(p=>p.name),scores:course.map((_,h)=>cards.map(c=>c.scores[h]))}],{holes:r.included_holes,rules:C.RULES});
   for(const row of r.rows){const old=expected.find(p=>p.name===row.name);assert.deepEqual([row.gross,Number(row.handicap),Number(row.net),row.rank],[old.gross,old.handicap,old.net,old.rank]);}
   await anon();const before=await pub(token);assert.equal(before?.days.length||0,day-1);assert.equal((await list('福岡')).length,day===1?0:1);
   await user(0);e=await cmd('publish',eventId,{day_no:day,revision:e.revision});
   await assert.rejects(cmd('save_day',eventId,{...payload,revision:e.revision}),/公布/);
   await anon();const published=await pub(token);assert.equal(published.days.length,day);assert.equal(published.owner_id,undefined);assert.equal(published.share_token,undefined);assert.equal(published.days[0].scorecards,undefined);assert.equal(published.days[0].source_round_id,undefined);
   const board=P.standings(published);assert.equal(board.complete,day===3);assert.equal(board.rows[0].completed,day);
   await user(0);
  }
  const original=e.days[0].result.included_holes;
  e=await cmd('reopen',eventId,{day_no:1,revision:e.revision});await anon();assert.equal((await pub(token)).days.length,2);
  await user(0);const d=e.days[0];d.scorecards[0].scores[0]=999;
  e=await cmd('save_day',eventId,{...d,revision:e.revision});e=await cmd('preview',eventId,{day_no:1,revision:e.revision});assert.deepEqual(e.days[0].result.included_holes,original);
  const high=e.days[0].result.rows.find(r=>r.player_id==='p0');assert.ok(high.gross>999);assert.ok(high.handicap<=36);
  for(const invalid of [0,-1,1.5,'4',1000]){const scores=structuredClone(d.scorecards);scores[0].scores[0]=invalid;await assert.rejects(cmd('save_day',eventId,{...d,scorecards:scores,revision:e.revision}));}
  const absentCards=structuredClone(e.days[0].scorecards);absentCards[11].absent=true;absentCards[11].scores=Array(18).fill(null);
  e=await cmd('save_day',eventId,{...e.days[0],scorecards:absentCards,revision:e.revision});e=await cmd('preview',eventId,{day_no:1,revision:e.revision});e=await cmd('publish',eventId,{day_no:1,revision:e.revision});
  await anon();const final=P.standings(await pub(token));assert.equal(final.complete,true);assert.equal(final.rows.find(r=>r.id==='p11').rank,null);await user(0);
  await assert.rejects(cmd('get', '20000000-0000-0000-0000-000000000001'),/無法存取/);
 }finally{await db.close();}
});
