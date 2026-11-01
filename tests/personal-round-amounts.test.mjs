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
 assert.deepEqual(payload,{user_id:'u',round_id:'42',player_name:'Paul',fortis_amount:'-100.00',individual_amount:'50.01',other_amount:null});
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
