import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),P=require('../scripts/personal-round-amounts.js');
const migration=readFileSync(new URL('../supabase/migrations/20261101065957_cost_tracking_start_2027.sql',import.meta.url),'utf8');
test('account-specific 2027 cutoff excludes prior rounds and fees, handles Taipei midnight and preserves records',async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite'),db=new PGlite();
 const a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002';
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
   create table profiles(id uuid primary key,display_name text);
   create table fortis_rounds(id bigint primary key,round_name text,course_name text,course_combo text,played_at timestamptz,players jsonb);
   create table hole_scores(round_id bigint,player_name text);grant select on profiles,fortis_rounds,hole_scores to authenticated;`);
  await db.query('insert into auth.users values($1),($2)',[a,b]);await db.query("insert into profiles values($1,'Paul'),($2,'Other')",[a,b]);
  await db.exec(`insert into fortis_rounds(id,played_at,players) values
   (1,'2026-12-31T15:59:59.999Z','["Paul"]'),(2,'2026-12-31T16:00:00Z','["Paul"]'),
   (3,'2027-01-01T00:00:00Z','["Paul"]'),(4,'2027-09-01T00:00:00Z','["Paul"]'),(5,null,'["Paul"]'),(6,'2025-01-01','["Paul"]');`);
  for(const file of ['20261101062220_personal_round_amounts.sql','20261101063124_personal_green_fees.sql','20261101064031_personal_cost_report.sql','20261101064954_annual_fixed_golf_costs.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  // Freeze only the database clock; execute the exact production query expressions.
  await db.exec(migration.replaceAll('current_timestamp',"timestamptz '2027-08-01T00:00:00+08'"));
  const as=async(id,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role);};
  const report=async()=>(await db.query('select golf_personal_annual_cost_report() as r')).rows[0].r;
  await as(a);await db.query('insert into golf_personal_cost_settings values($1,2027)',[a]);
  await db.query(`insert into golf_personal_round_amounts(user_id,round_id,player_name,green_fee,fortis_amount) values($1,1,'Paul',3000,0),($1,2,'Paul',4000,1000),($1,3,'Paul',2000,-500),($1,4,'Paul',9000,0),($1,5,'Paul',5000,0),($1,6,'Paul',10000,0)`,[a]);
  await db.query('insert into golf_personal_annual_costs(user_id,year,membership_fee,insurance_fee) values($1,2026,12000,600),($1,2027,10000,500),($1,2028,50000,0)',[a]);
  let r=await report();assert.equal(r.tracking_start_date,'2027-01-01');assert.equal(r.all_time.record_count,2);assert.equal(r.all_time.cost_total,'5500.00');assert.equal(r.all_time.cost_average,'2750.00');
  assert.equal(r.all_time.fixed_total,'10500.00');assert.equal(r.all_time.combined_total,'16000.00');assert.equal(r.all_time.combined_average,'8000.00');assert.equal(r.ytd.combined_total,'16000.00');
  assert.equal(r.recent_cost_count,2);assert.equal(r.recent_cost_total,'5500.00');
  assert.equal(r.recent.find(x=>x.round_id==='1').included_in_career,false);assert.equal(r.recent.find(x=>x.round_id==='2').included_in_career,true);
  assert.equal(r.recent.find(x=>x.round_id==='5').included_in_career,false);assert.equal(r.recent.some(x=>x.round_id==='4'),false);
  const old=r.annual_years.find(x=>x.year===2026);assert.equal(old.fixed_total,'12600.00');assert.equal(old.combined_total,null);assert.equal(old.combined_average,null);assert.equal(old.included_in_career,false);
  assert.equal((await db.query('select count(*)::int n from golf_personal_round_amounts')).rows[0].n,6,'old records remain saved');
  assert.equal((await db.query('select golf_personal_cost_summary() s')).rows[0].s.cost_total,'5500.00','legacy summary observes cutoff');
  await as(b);assert.equal((await db.query('select * from golf_personal_cost_settings')).rows.length,0);
  await db.query('insert into golf_personal_round_amounts(user_id,round_id,green_fee,fortis_amount) values($1,1,1000,0)',[b]);
  await db.query('insert into golf_personal_annual_costs(user_id,year,membership_fee) values($1,2026,2000)',[b]);
  r=await report();assert.equal(r.all_time.combined_total,'3000.00','another account retains its earlier history');assert.equal(r.tracking_start_date,'1900-01-01');
  await assert.rejects(db.query('insert into golf_personal_cost_settings values($1,2028)',[a]),/row-level security/);
  assert.equal((await db.query('update golf_personal_cost_settings set start_year=2028 returning *')).rows.length,0);
  await as(a);assert.equal((await report()).tracking_start_date,'2027-01-01');
  // Reinstall the function definitions with the real clock to check the current pre-start state.
  await db.exec('reset role');await db.exec(migration.slice(migration.indexOf('create or replace function public.golf_personal_cost_summary()')));await as(a);
  const today=(await db.query('select current_date::text d')).rows[0].d;
  if(today<'2027-01-01'){r=await report();assert.equal(r.all_time.record_count,0);assert.equal(r.all_time.fixed_total,null);assert.equal(r.all_time.combined_average,null);assert.equal(r.ytd.record_count,0);assert.equal(r.recent_cost_count,0);}
  await as('','anon');await assert.rejects(db.query('select * from golf_personal_cost_settings'),/permission denied/);await assert.rejects(db.query('select golf_personal_cost_tracking_start()'),/permission denied/);
 }finally{await db.close();}
});
test('cost page announces cutoff, labels earlier records and defaults annual entry to the start year',()=>{
 const stats={fee_count:0,game_count:0,cost_count:0};
 const html=P.reportHtml({year:2026,as_of:'2026-11-01',tracking_start_date:'2027-01-01',all_time:stats,ytd:stats,recent:[{round_id:'1',title:'Old round',date:'2026-12-31',included_in_career:false}],annual_years:[{year:2027},{year:2026}]});
 assert.match(html,/成本統計自 2027-01-01 起/);assert.match(html,/生涯成本（2027 起）/);assert.match(html,/不計生涯成本/);assert.match(html,/value="2027" required/);
});
