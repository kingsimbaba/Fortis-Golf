import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),P=require('../scripts/personal-round-amounts.js');
test('cost report uses Taipei YTD, actual played-date recent five including blanks, and per-account isolation',async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite'),db=new PGlite();
 const a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002';
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
   create table profiles(id uuid primary key,display_name text);
   create table fortis_rounds(id bigint primary key,round_name text,course_name text,course_combo text,played_at timestamptz,players jsonb);
   create table hole_scores(round_id bigint,player_name text);
   grant select on profiles,fortis_rounds,hole_scores to authenticated;`);
  await db.query('insert into auth.users values($1),($2)',[a,b]);await db.query("insert into profiles values($1,'Paul'),($2,'Other')",[a,b]);
  await db.exec(`insert into fortis_rounds(id,round_name,course_name,played_at,players) select n,'Round '||n,'Course',case
   when n=1 then (date_trunc('year',current_timestamp at time zone 'Asia/Taipei') at time zone 'Asia/Taipei')-interval '1 second'
   when n=2 then date_trunc('year',current_timestamp at time zone 'Asia/Taipei') at time zone 'Asia/Taipei'
   when n=10 then (date_trunc('year',current_timestamp at time zone 'Asia/Taipei') at time zone 'Asia/Taipei')-interval '1 day'
   when n=8 then current_timestamp+interval '1 day'
   when n=9 then current_timestamp-interval '1 hour'
   when n in(6,7) then current_timestamp-interval '1 day'
   else current_timestamp-(7-n)*interval '1 day' end,
   case when n=5 then null when n=9 then '["Other"]'::jsonb else '["Paul","Friend"]'::jsonb end from generate_series(1,10) n;
   insert into hole_scores values(5,'Paul');`);
  for(const name of ['20261101062220_personal_round_amounts.sql','20261101063124_personal_green_fees.sql','20261101064031_personal_cost_report.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
  const as=async(id,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role);};
  const report=async()=>(await db.query('select golf_personal_cost_report() as r')).rows[0].r;
  await as(a);await db.query(`insert into golf_personal_round_amounts(user_id,round_id,player_name,green_fee,fortis_amount) values($1,1,'Paul',1000,100),($1,2,'Paul',2000,0),($1,3,'Paul',3000,1000),($1,4,'Paul',4000,-500),($1,5,'Paul',5000,0),($1,7,'Paul',7000,500),($1,10,'Paul',10000,0)`,[a]);
  let r=await report();assert.equal(r.all_time.record_count,7);assert.equal(r.all_time.cost_total,'30900.00');
  assert.equal(r.ytd.record_count,5);assert.equal(r.ytd.cost_total,'20000.00');assert.equal(r.ytd.cost_average,'4000.00');
  assert.deepEqual(r.recent.map(x=>x.round_id),['7','6','5','4','3']);assert.equal(r.recent[1].green_fee,null);
  assert.equal(r.recent_cost_count,4);assert.equal(r.recent_cost_total,'18000.00');assert.equal(r.recent_cost_average,'4500.00');
  const year=Number((await db.query("select extract(year from current_timestamp at time zone 'Asia/Taipei') y")).rows[0].y);assert.equal(r.year,year);
  await db.query('update golf_personal_round_amounts set green_fee=8000 where round_id=7');r=await report();assert.equal(r.recent[0].net_cost,'7500.00');assert.equal(r.ytd.cost_total,'21000.00');
  await as(b);r=await report();assert.equal(r.all_time.record_count,0);assert.deepEqual(r.recent.map(x=>x.round_id),['9']);assert.equal(r.recent[0].net_cost,null);
  await db.query("insert into golf_personal_round_amounts(user_id,round_id,green_fee,fortis_amount) values($1,9,99999,-999)",[b]);
  await as(a);r=await report();assert.equal(r.all_time.cost_total,'31900.00');assert.equal(r.recent.some(x=>x.round_id==='9'),false);
  await as('','anon');await assert.rejects(db.query('select golf_personal_cost_report()'),/permission denied/);
 }finally{await db.close();}
});
test('dedicated report escapes metadata and distinguishes missing values from zero',()=>{
 const stats={fee_count:0,game_count:0,cost_count:0};
 const html=P.reportHtml({year:2026,as_of:'2026-11-01',ytd:stats,all_time:stats,recent:[{round_id:'1',title:'<img src=x onerror=alert(1)>',course:'A & B',date:'2026-10-31',green_fee:'0',game_total:null,net_cost:null}],recent_cost_count:0});
 assert.match(html,/今年至今（2026）/);assert.match(html,/全部歷史/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img/);assert.match(html,/<td data-label="果嶺費">0<\/td><td data-label="遊戲淨輸贏">—<\/td>/);
});
test('costs navigation mounts its report and refreshes after a save',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8'),calls=[],box={};
 assert.match(html,/id="navCosts" onclick="showPage\('costs'\)"/);assert.match(html,/id="costs" class="page hidden"/);assert.doesNotMatch(html,/id="personalCostSummary"/);
 const ctx=vm.createContext({currentUser:{id:'u'},currentPage:'costs',document:{getElementById:()=>box},getDashboardPlayerName:()=> 'Paul',sb(){},db:{rounds:[]},roundLibrarySearchResults:[],loadPaged(){},window:{FortisPersonalAmounts:{mountReport:(element,context)=>calls.push({element,context}),open:(id,context)=>{context.onSaved();}}}});
 vm.runInContext(html.slice(html.indexOf('function renderPersonalCosts(){'),html.indexOf('function renderRoundHistory(){')),ctx);
 ctx.renderPersonalCosts();assert.equal(calls[0].element,box);assert.equal(calls[0].context.getUserId(),'u');
 calls[0].context.onEdit('42');assert.equal(calls.length,2);
});
