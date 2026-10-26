import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),V=require('../scripts/vegas.js'),C=require('../scripts/cross-group.js');
const course=Array.from({length:18},(_,i)=>({par:4,display:'Hole '+i,sourceCourseId:'1'}));
test('Vegas draw, gross order, stable ties, earlier corrections and incomplete scores',()=>{
 const r={players:['A','B','C','D'],vegasDraw:[3,1,4,2],scores:Array.from({length:18},()=>['','','',''])};
 assert.deepEqual(V.pairing(r,0),{order:[1,3,0,2],team1:[1,2],team2:[3,0]});assert.equal(V.pairing(r,1),null);
 r.scores[0]=[4,5,4,5];assert.deepEqual(V.pairing(r,1).order,[0,2,1,3]);r.scores[1]=[5,4,5,4];assert.deepEqual(V.pairing(r,2).order,[1,3,0,2]);
 r.scores[0][2]=3;r.scores[1]=[4,4,4,4];assert.deepEqual(V.pairing(r,2).order,[2,0,1,3]);
 for(const draw of [[1,1,3,4],[0,2,3,4],[1,2,3],['1',2,3,4]])assert.throws(()=>V.drawOrder(draw));
});
test('Peoria hides live net; handicap caps never alter gross; ties share ranks',()=>{
 const g=[{id:'g',players:['A','B','C','D'],scores:Array.from({length:18},()=>[5,5,4,20])}],state={holes:Array.from({length:12},(_,i)=>i+1),rules:C.RULES};
 assert.equal(C.netLeaderboard({course,status:'live'},g,state),null);
 const rows=C.netLeaderboard({course,status:'final'},g,state),a=rows.find(r=>r.name==='A'),d=rows.find(r=>r.name==='D');
 assert.deepEqual([a.gross,a.handicap,a.net],[90,14.4,75.6]);assert.deepEqual([d.gross,d.handicap,d.net],[360,36,324]);assert.equal(a.rank,rows.find(r=>r.name==='B').rank);
 assert.throws(()=>C.netLeaderboard({course,status:'final'},g,{...state,holes:Array(12).fill(1)}));g[0].scores[0][0]=null;assert.throws(()=>C.netLeaderboard({course,status:'final'},g,state));
});
test('Cross migration preserves history, authorizes corrections, hides holes and locks finalized games',async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite'),db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 await db.exec(readFileSync(new URL('../supabase/migrations/202610230001_gross_tournaments.sql',import.meta.url),'utf8'));
 const ids=[1,2,3,4].map(n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0'));for(const id of ids)await db.query('insert into auth.users values ($1)',[id]);
 async function user(i){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[i]]);await db.exec('set role authenticated');}
 const cmd=async(a,e,p={})=>(await db.query('select golf_event_command($1,$2,$3) result',[a,e,JSON.stringify(p)])).rows[0].result;
 const state=async e=>(await db.query('select golf_cross_state($1) result',[e])).rows[0].result;
 await user(0);const old=await cmd('create',null,{name:'History',course}),oldData={group_id:'10000000-0000-0000-0000-000000000001',revision:0,course,players:['Old A','Old B'],scores:Array.from({length:18},()=>[4,5])};
 await cmd('sync',old.id,oldData);await cmd('finalize',old.id);await db.exec('reset role');
 const before=(await db.query('select to_jsonb(e) value from golf_events e where id=$1',[old.id])).rows[0].value;
 await db.exec(readFileSync(new URL('../supabase/migrations/202610240001_cross_group_games.sql',import.meta.url),'utf8'));
 const after=(await db.query('select to_jsonb(e) value from golf_events e where id=$1',[old.id])).rows[0].value;delete after.game_kind;assert.deepEqual(before,after);
 await user(0);await cmd('sync',old.id,{...oldData,revision:1});
 const e=await cmd('create',null,{name:'Cross',course,game_kind:'cross'});assert.equal(e.game_kind,'cross');assert.equal((await state(e.id)).holes.length,12);assert.equal('holes' in e,false);
 await assert.rejects(db.query('select * from golf_cross_secrets'),/permission denied/);
 for(const fn of ['golf_cross_command','golf_legacy_event_command'])await assert.rejects(db.query(`select ${fn}($1,$2,$3)`,['reroll',e.id,'{}']),/permission denied/);
 for(let i=1;i<3;i++)await cmd('invite',e.id,{user_id:ids[i],can_score:i===1});
 const data={group_id:'20000000-0000-0000-0000-000000000001',revision:0,course,players:['A','B'],scores:Array.from({length:18},()=>[4,5])};
 await user(1);let g=await cmd('sync',e.id,data);assert.equal(g.revision,1);assert.equal((await state(e.id)).holes,null);
 await assert.rejects(cmd('reroll',e.id),/Organizer/);await assert.rejects(cmd('override',e.id,{...data,revision:1}),/Organizer/);
 await user(2);assert.equal((await state(e.id)).holes,null);await assert.rejects(cmd('sync',e.id,data),/Assigned scorer/);
 await user(3);await assert.rejects(state(e.id),/unavailable/);assert.equal((await db.query('select * from golf_events')).rows.length,0);
 await user(0);await assert.rejects(cmd('sync',e.id,{...data,revision:1}),/Assigned scorer/);g=await cmd('override',e.id,{...data,revision:1});assert.equal(g.revision,2);
 await user(1);await assert.rejects(cmd('sync',e.id,{...data,revision:1}),/another device/);await user(0);
 for(const holes of [Array(12).fill(1),Array.from({length:12},(_,i)=>i),[1,2,3],['1',2,3,4,5,6,7,8,9,10,11,12]])await assert.rejects(cmd('selection',e.id,{holes}),/12 unique/);
 const holes=[1,2,3,4,5,6,7,8,9,10,17,18];await cmd('selection',e.id,{holes});assert.deepEqual((await state(e.id)).holes,holes);
 await assert.rejects(cmd('finalize',e.id),/Peoria rules/);await cmd('rules',e.id,{rules:C.RULES});await cmd('invite',e.id,{user_id:ids[2],can_score:true});
 g=await cmd('assign',e.id,{group_id:data.group_id,revision:2,user_id:ids[2]});assert.equal(g.scorer_id,ids[2]);
 await user(1);await assert.rejects(cmd('sync',e.id,{...data,revision:3}),/Assigned scorer/);await user(2);g=await cmd('sync',e.id,{...data,revision:3});assert.equal(g.revision,4);
 await user(0);await cmd('finalize',e.id);for(const action of ['sync','override','selection','reroll','invite','assign','rules','withdraw','finalize'])await assert.rejects(cmd(action,e.id,{...data,revision:4,holes}),/locked/);
 await user(2);assert.deepEqual((await state(e.id)).holes,holes);await assert.rejects(cmd('sync',e.id,{...data,revision:4}),/locked/);
 await db.query('insert into golf_vegas_rounds values ($1,$2,$3,now())',['v',ids[2],JSON.stringify({gameMode:'vegas'})]);await user(1);assert.equal((await db.query('select * from golf_vegas_rounds')).rows.length,0);
 await assert.rejects(db.query('insert into golf_vegas_rounds values ($1,$2,$3,now())',['x',ids[2],JSON.stringify({gameMode:'vegas'})]),/row-level security/);
 await db.exec('reset role');const counts=Array(18).fill(0);for(let i=0;i<180;i++){const h=(await db.query('select golf_cross_draw() holes')).rows[0].holes;assert.equal(new Set(h).size,12);h.forEach(n=>counts[n-1]++);}assert.ok(counts.every(n=>n>70&&n<170));
 await db.exec('set role anon');await assert.rejects(db.query('select * from golf_cross_secrets'),/permission denied/);
 }finally{await db.close();}
});

test('Individual 8421 calculators are byte-identical and default stays Individual',async()=>{
 const {createHash}=await import('node:crypto'),html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 for(const [start,end,hash] of [
 ['function playerPoint(','function eligibleStrokeHoles(','c0033f90e6c638327412f6f502e53d0ac0b03cd8eb96fb7eec9096904fc0dca3'],
 ['function eligibleStrokeHoles(','function playScoreAnimation(','3b969a6c72e89796222bc7f4d915c195013c19b96e8c37b2e06a7171ae97f539']])assert.equal(createHash('sha256').update(html.slice(html.indexOf(start),html.indexOf(end))).digest('hex'),hash);
 assert.match(html,/<option value="individual8421" selected>/);
});
test('Peoria works on non-72 courses, negative handicaps clamp to zero, twelve players rank',()=>{
 const c=course.map(()=>({par:3})),state={holes:Array.from({length:12},(_,i)=>i+1),rules:C.RULES};
 const groups=[0,1,2].map(g=>({id:'g'+g,players:[0,1,2,3].map(i=>'P'+(g*4+i)),scores:Array.from({length:18},()=>[2,3,4,5])}));
 const rows=C.netLeaderboard({status:'final',course:c},groups,state);assert.equal(rows.length,12);
 assert.equal(rows[0].handicap,0);assert.deepEqual(rows.slice(0,4).map(r=>r.rank),[1,1,1,4]);
});
test('standalone Cross Group rendering does not require a Vegas draw',async()=>{
 const {default:vm}=await import('node:vm'),html=readFileSync(new URL('../index.html',import.meta.url),'utf8'),content={innerHTML:''};
 const code=html.slice(html.indexOf('function renderCrossScore(){'),html.indexOf('function setCrossScore('));
 const ctx=vm.createContext({round:{gameMode:'crossGroup',players:['A','B'],scores:Array.from({length:18},()=>['','']),course},roundHole:0,adminEscapeHtml:String,document:{getElementById:()=>content},mountTournamentPanel(){}});
 vm.runInContext(code,ctx);vm.runInContext('renderCrossScore()',ctx);assert.match(content.innerHTML,/Cross Group Game/);assert.doesNotMatch(content.innerHTML.replace(/<[^>]*>/g,''),/開球順序與配對|Vegas/);
});

function vegasRound(par=4){return {players:['A','B','C','D'],vegasDraw:[1,2,3,4],course:Array.from({length:18},()=>({par})),scores:Array.from({length:18},()=>['','','',''])};}
function vegasHole(a,b,c,d,par=4){const r=vegasRound(par);r.scores[0]=[a,c,d,b];return {r,result:V.calculate(r)};}
test('confirmed Vegas concatenates full strokes, including both scores of 10+',()=>{
 for(const [a,b,n] of [[4,5,45],[5,4,45],[10,3,103],[3,10,103],[12,10,1210],[10,12,1210],[10,10,1010],[999,3,9993]])assert.equal(V.teamNumber(a,b),n);
 for(const pair of [[0,4],[-1,3],[4.5,3],['4',3],[1000,3]])assert.throws(()=>V.teamNumber(...pair));
});
test('user par-3 example is 2 × (33 − 25) = 16, with no flip',()=>{
 const {result}=vegasHole(2,5,3,3,3),row=result.rows[0];
 assert.deepEqual([row.t1,row.t2,row.multiplier,row.points],[25,33,2,16]);assert.deepEqual(result.totals,[16,-16,-16,16]);
 const ordinary=vegasHole(3,5,4,6).result.rows[0];assert.equal(ordinary.points,22);assert.equal(ordinary.t2,46);
});
test('eagle ×5 and hole-in-one ×10; only winning team highest multiplier applies',()=>{
 assert.equal(vegasHole(2,5,4,4).result.rows[0].points,95);
 for(const par of [3,4,5,6])assert.equal(vegasHole(1,5,3,3,par).result.rows[0].multiplier,10);
 assert.equal(vegasHole(1,2,4,5).result.rows[0].points,330);
 assert.equal(vegasHole(3,3,4,5).result.rows[0].points,24);
 // Losing side's birdie does not multiply the winner's points.
 assert.equal(vegasHole(10,3,9,9).result.rows[0].points,-4);
});
test('Vegas equal numbers score zero; multi-digit holes have no cap; totals stay zero sum',()=>{
 const tie=vegasHole(3,5,3,5).result;assert.equal(tie.rows[0].points,0);assert.deepEqual(tie.totals,[0,0,0,0]);
 const high=vegasHole(12,10,13,11).result;assert.equal(high.rows[0].points,101);
 assert.equal(high.totals.reduce((a,b)=>a+b,0),0);
});
test('Vegas recalculates point totals and downstream teams after earlier edits; missing holes stay pending',()=>{
 const r=vegasRound(3);r.scores[0]=[2,3,3,5];r.scores[1]=[3,3,3,3];
 const before=V.calculate(r);assert.deepEqual(before.rows[1].team1,[0,3]);
 r.scores[0][3]=1;const after=V.calculate(r);assert.deepEqual(after.rows[1].team1,[3,2]);assert.notDeepEqual(before.totals,after.totals);
 r.scores[0][0]='';const missing=V.calculate(r);assert.equal(missing.rows[0],null);assert.equal(missing.rows[1],null);assert.deepEqual(missing.totals,[0,0,0,0]);
});
test('confirmed Peoria caps use each hidden hole par and preserve actual gross',()=>{
 const c=course.map((h,i)=>({...h,par:i===0?3:i===1?5:4})),g=[{id:'g',players:['A'],scores:Array.from({length:18},()=>[4])}];
 g[0].scores[0][0]=7;g[0].scores[1][0]=11;
 const row=C.netLeaderboard({status:'final',course:c},g,{rules:C.RULES,holes:Array.from({length:12},(_,i)=>i+1)})[0];
 assert.equal(row.gross,82);assert.equal(row.handicap,9.6);assert.equal(row.net,72.4);
});

test('new modes and linked Cross Groups never write publicly readable legacy live snapshots',async()=>{
 const {default:vm}=await import('node:vm'),html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const code=html.slice(html.indexOf('let roundActionPending=false;'),html.indexOf('setInterval(()=>{\n  if(round&&currentSession'));
 for(const r of [{gameMode:'vegas'},{gameMode:'crossGroup'},{gameMode:'individual8421',tournament:{gameKind:'cross'}}]){
  const calls=[],ctx=vm.createContext({round:{id:'r',...r},currentSession:{},roundHole:0,queueTournamentSync(){calls.push('event');},sb(){throw Error('Public write attempted');}});
  vm.runInContext(code,ctx);await ctx.syncLiveRound();await ctx.writeLiveRound();await ctx.endActiveScoringSession();assert.equal(calls.length,r.tournament?1:0);
 }
});
test('unlinked standalone rounds cancel locally without accessing legacy live_rounds',async()=>{
 const {default:vm}=await import('node:vm'),html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const code=html.slice(html.indexOf('let roundActionPending=false;'),html.indexOf('async function endActiveScoringSession()'));
 for(const gameMode of ['vegas','crossGroup']){
  const ctx=vm.createContext({round:{id:'r',gameMode},currentSession:{},roundHole:2,confirm:()=>true,alert:m=>{throw Error(m);},clearActiveRound(){},document:{getElementById:()=>({innerHTML:''})},showPage(){},sb(){throw Error('Public write attempted');}});
  vm.runInContext(code,ctx);await ctx.cancelLiveRound();assert.equal(ctx.round,null);
 }
});
