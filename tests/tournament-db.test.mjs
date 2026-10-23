// Run with PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js node --test tests/tournament-db.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const modulePath=process.env.PGLITE_MODULE||'@electric-sql/pglite';
test('migration, participant isolation, scorer ownership, stale writes and final corrections',async()=>{
 const {PGlite}=await import(modulePath);const db=new PGlite();
 try{
 await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
 await db.exec(readFileSync(new URL('../supabase/migrations/202610230001_gross_tournaments.sql',import.meta.url),'utf8'));
 const ids=[1,2,3].map(n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0'));
 for(const id of ids)await db.query('insert into auth.users values ($1)',[id]);
 async function user(i){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[i]]);await db.exec('set role authenticated');}
 async function cmd(action,id,payload={}){return (await db.query('select public.golf_event_command($1,$2,$3) as result',[action,id,JSON.stringify(payload)])).rows[0].result;}
 const course=Array.from({length:18},(_,i)=>({par:4,display:'Hole '+i,sourceCourseId:'1'}));
 await user(0);const e=await cmd('create',null,{name:'Cup',course});
 const gId='10000000-0000-0000-0000-000000000001';
 const data={group_id:gId,revision:0,course,players:['A','B'],scores:Array.from({length:18},()=>[null,null])};
 let g=await cmd('sync',e.id,data);assert.equal(g.revision,1);
 await assert.rejects(cmd('sync',e.id,data),/another device/);
 await assert.rejects(cmd('finalize',e.id),/complete/);
 await user(2);assert.equal((await db.query('select * from golf_events')).rows.length,0);assert.equal((await db.query('select * from golf_event_groups')).rows.length,0);
 await assert.rejects(cmd('sync',e.id,{...data,revision:1}),/unavailable/);
 await assert.rejects(db.query("update golf_events set status='final'"),/permission denied/);
 await user(0);await cmd('invite',e.id,{user_id:ids[2]});
 await user(2);assert.equal((await db.query('select * from golf_events')).rows.length,1);
 await assert.rejects(cmd('sync',e.id,data),/Assigned scorer/);
 await user(0);await cmd('invite',e.id,{user_id:ids[1],can_score:true});
 await user(1);assert.equal((await db.query('select * from golf_event_groups')).rows.length,1);
 await assert.rejects(cmd('sync',e.id,{...data,revision:1}),/Assigned scorer/);
 await assert.rejects(cmd('invite',e.id,{user_id:ids[2]}),/organizer/);
 await assert.rejects(cmd('finalize',e.id),/Organizer/);
 await assert.rejects(cmd('sync',e.id,{...data,group_id:'10000000-0000-0000-0000-000000000002'}),/already/);
 await user(0);
 for(const invalid of [0,-1,1.5,'4',1000]){const scores=data.scores.map(r=>[...r]);scores[0][0]=invalid;await assert.rejects(cmd('sync',e.id,{...data,revision:1,scores}),/whole positive/);}
 await assert.rejects(cmd('sync',e.id,{...data,revision:1,course:course.map(h=>({...h,par:3}))}),/layout/);
 await assert.rejects(cmd('sync',e.id,{...data,revision:1,players:['A','C']}),/roster/);
 const full=data.scores.map(()=>[4,5]);g=await cmd('sync',e.id,{...data,revision:1,scores:full});
 await user(1);await assert.rejects(cmd('withdraw',e.id,{group_id:gId}),/Assigned scorer/);
 await user(0);
 assert.equal(g.revision,2);assert.equal((await cmd('finalize',e.id)).status,'final');
 await assert.rejects(cmd('withdraw',e.id,{group_id:gId}),/Final groups/);
 full[0][0]=3;g=await cmd('sync',e.id,{...data,revision:2,scores:full});assert.equal(g.scores[0][0],3);
 await assert.rejects(cmd('sync',e.id,{...data,revision:3}),/all scores/);
 await user(1);await assert.rejects(cmd('sync',e.id,{...data,players:['C','D'],group_id:'10000000-0000-0000-0000-000000000002',scores:full}),/Cannot add/);
 }finally{await db.close();}
});
