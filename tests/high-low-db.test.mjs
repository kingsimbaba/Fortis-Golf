import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const migration=readFileSync(new URL('../supabase/migrations/20261127055542_high_low_games.sql',import.meta.url),'utf8');
test('standalone history RLS, mode validation, full score validation and safe retries',async()=>{
 const db=new PGlite(),a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002';
 try{
  await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${a}'),('${b}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
  await db.exec(migration);
  const data={gameMode:'highLow',players:['A','B','C','D'],initialRanks:[1,2,3,4],startHoleIndex:0,course:Array.from({length:18},()=>({par:4})),scores:Array.from({length:18},()=>[3,4,5,6])};
  const as=async id=>db.exec(`reset role;set request.jwt.claim.sub='${id}';set role authenticated`);
  const save=async(owner,mode,body,id='test')=>db.query('insert into golf_high_low_rounds(owner_id,id,game_kind,round_data) values($1,$2,$3,$4) on conflict(owner_id,id) do update set round_data=excluded.round_data',[owner,id,mode,JSON.stringify(body)]);
  await as(a);await save(a,'highLow',data);await save(a,'highLow',data);
  assert.equal((await db.query('select * from golf_high_low_rounds')).rows.length,1);
  await save(a,'highLowTotal',{...data,gameMode:'highLowTotal'},'test-total');
  assert.equal((await db.query("select * from golf_high_low_rounds where game_kind='highLow'")).rows.length,1);
  await assert.rejects(save(b,'highLow',data),/row-level security/);
  await assert.rejects(save(a,'highLowTotal',data),/mismatch/);
  await assert.rejects(save(a,'highLow',{...data,scores:[[3,4,5,6]]}),/18 score/);
  const incomplete=structuredClone(data);incomplete.scores[0][0]='';await assert.rejects(save(a,'highLow',incomplete),/whole strokes/);
  await as(b);assert.equal((await db.query('select * from golf_high_low_rounds')).rows.length,0);
  assert.equal((await db.query("update golf_high_low_rounds set game_kind='highLow' returning id")).rows.length,0);
  await assert.rejects(save(a,'highLow',data),/row-level security/);
  await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from golf_high_low_rounds'),/permission denied/);
 }finally{await db.close();}
});
