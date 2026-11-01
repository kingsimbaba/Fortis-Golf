import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),P=require('../scripts/personal-round-amounts.js');
test('signed amounts retain cents, distinguish blank from zero, and reject invalid input',()=>{
 assert.equal(P.cents('+1200.10'),120010);assert.equal(P.cents('-500.25'),-50025);assert.equal(P.cents(''),null);assert.equal(P.cents('0'),0);
 assert.equal(P.total({fortis_amount:'+1200.10',individual_amount:'-500.25',other_amount:'-99.85'}),60000);
 assert.equal(P.total({}),null);assert.equal(P.total({other_amount:'0'}),0);
 for(const invalid of ['NaN','Infinity','1e5','1,200','12.345','1000000000','--1'])assert.throws(()=>P.cents(invalid));
 const payload=P.payload('u','42','Paul',{fortis_amount:'-100',individual_amount:'+50.01',other_amount:''});
 assert.deepEqual(payload,{user_id:'u',round_id:'42',player_name:'Paul',fortis_amount:'-100.00',individual_amount:'50.01',other_amount:null,green_fee:null});
 assert.equal(P.money(-4999),'−49.99');assert.equal(P.money(100),'+1');
});
test('round reference derives names, real played holes, gross, birdies and eagles without changing scores',()=>{
 const scores=[{player_name:'Paul',hole_number:1,gross_score:3,par:4},{player_name:'Paul',hole_number:2,gross_score:3,par:5},{player_name:'Paul',hole_number:3,gross_score:1,par:3},{player_name:'Paul',hole_number:1,gross_score:3,par:4},{player_name:'A',hole_number:1,gross_score:4,par:4}];
 const before=JSON.stringify(scores),rows=P.summary({players:['Paul','A','B']},scores);
 assert.deepEqual(rows[0],{name:'Paul',holes:3,gross:7,birdies:1,eagles:1});assert.equal(rows[2].gross,null);assert.equal(JSON.stringify(scores),before);
});
test('private persistence: two users, upsert, generated total, ownership checks and anonymous denial',async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite'),db=new PGlite();
 const a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002';
 try{
  await db.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create table public.fortis_rounds(id bigint primary key);insert into fortis_rounds values(42),(43);");
  await db.query('insert into auth.users values($1),($2)',[a,b]);
  await db.exec(readFileSync(new URL('../supabase/migrations/20261101062220_personal_round_amounts.sql',import.meta.url),'utf8'));
  const as=async(id,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role);};
  const save=async(id,round=42,fortis='1200.10',individual='-500.25',other='-99.85')=>db.query('insert into golf_personal_round_amounts(user_id,round_id,player_name,fortis_amount,individual_amount,other_amount) values($1,$2,$3,$4,$5,$6) on conflict(user_id,round_id) do update set fortis_amount=excluded.fortis_amount,individual_amount=excluded.individual_amount,other_amount=excluded.other_amount returning total_amount',[id,round,'Paul',fortis,individual,other]);
  await as(a);assert.equal((await save(a)).rows[0].total_amount,'600.00');assert.equal((await save(a,42,'-100','0',null)).rows[0].total_amount,'-100.00');
  assert.equal((await db.query('select * from golf_personal_round_amounts')).rows.length,1);
  await assert.rejects(save(b),/row-level security/);await assert.rejects(save(a,43,'NaN'),/check constraint/);
  await as(b);assert.equal((await db.query('select * from golf_personal_round_amounts')).rows.length,0);
  assert.equal((await db.query('update golf_personal_round_amounts set other_amount=999 returning *')).rows.length,0);
  await save(b);assert.equal((await db.query('select * from golf_personal_round_amounts')).rows.length,1);
  await assert.rejects(db.query('update golf_personal_round_amounts set user_id=$1',[a]),/row-level security/);
  await as(a);assert.equal((await save(a,43,null,null,null)).rows[0].total_amount,null);assert.equal((await save(a,43,'0',null,null)).rows[0].total_amount,'0.00');
  await as('', 'anon');await assert.rejects(db.query('select * from golf_personal_round_amounts'),/permission denied/);
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from fortis_rounds')).rows[0].n,2);
 }finally{await db.close();}
});

test('green fee and per-round net cost handle wins, losses, free rounds and unknown values',()=>{
 assert.equal(P.netCost({green_fee:'3000',fortis_amount:'1000'}),200000);
 assert.equal(P.netCost({green_fee:'3000',fortis_amount:'-500'}),350000);
 assert.equal(P.netCost({green_fee:'3000',fortis_amount:'4000'}),-100000);
 assert.equal(P.netCost({green_fee:'0',other_amount:'0'}),0);
 assert.equal(P.netCost({green_fee:'3000'}),null);assert.equal(P.netCost({other_amount:'0'}),null);
 assert.throws(()=>P.greenFee('-1'));assert.throws(()=>P.greenFee('1.234'));
 assert.equal(P.payload('u',42,'Paul',{green_fee:'3200.50',fortis_amount:'100'}).green_fee,'3200.50');
});
test('all-time totals and averages use the full private history, separate denominators and update after edits',async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite'),db=new PGlite();
 const a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002';
 try{
  await db.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create table public.fortis_rounds(id bigint primary key);insert into fortis_rounds select generate_series(1,1005);");
  await db.query('insert into auth.users values($1),($2)',[a,b]);
  for(const f of ['20261101062220_personal_round_amounts.sql','20261101063124_personal_green_fees.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
  const as=async(id,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role);};
  const stats=async()=>(await db.query('select golf_personal_cost_summary() as s')).rows[0].s;
  await as(a);let s=await stats();assert.equal(s.fee_count,0);assert.equal(s.fee_average,null);assert.equal(s.cost_total,null);
  await db.query('insert into golf_personal_round_amounts(user_id,round_id,green_fee,fortis_amount) values($1,1,3000,1000),($1,2,4000,-500),($1,3,2000,null),($1,4,null,200),($1,5,0,0)',[a]);
  s=await stats();assert.equal(s.record_count,5);assert.equal(s.fee_count,4);assert.equal(s.game_count,4);assert.equal(s.cost_count,3);
  assert.equal(s.fee_total,'9000.00');assert.equal(s.fee_average,'2250.00');assert.equal(s.game_total,'700.00');assert.equal(s.game_average,'175.00');
  assert.equal(s.winnings_total,'1200.00');assert.equal(s.losses_total,'-500.00');assert.equal(s.winnings_average,'300.00');assert.equal(s.losses_average,'-125.00');
  assert.equal(s.cost_total,'6500.00');assert.equal(s.cost_average,'2166.67');
  await assert.rejects(db.query('update golf_personal_round_amounts set green_fee=-1 where round_id=1'),/check constraint/);
  await assert.rejects(db.query("update golf_personal_round_amounts set green_fee='NaN' where round_id=1"),/check constraint/);
  await db.query('update golf_personal_round_amounts set green_fee=3500 where round_id=1');s=await stats();assert.equal(s.cost_total,'7000.00');
  await as(b);assert.equal((await stats()).record_count,0);
  await db.query('insert into golf_personal_round_amounts(user_id,round_id,green_fee,other_amount) values($1,1,9000,-1000)',[b]);assert.equal((await stats()).cost_total,'10000.00');
  await as(a);assert.equal((await stats()).record_count,5);
  // More than both the 30-round home/history limit and the 1000-row API limit.
  await db.query('insert into golf_personal_round_amounts(user_id,round_id,green_fee,other_amount) select $1,n,100,0 from generate_series(6,1005) n',[a]);
  s=await stats();assert.equal(s.record_count,1005);assert.equal(s.fee_count,1004);assert.equal(s.cost_count,1003);assert.equal(s.cost_total,'107000.00');
  await as('','anon');await assert.rejects(db.query('select golf_personal_cost_summary()'),/permission denied/);
 }finally{await db.close();}
});
