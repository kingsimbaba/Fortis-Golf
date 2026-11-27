import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url),G=require('../scripts/high-low.js');
const fixture=(gameMode='highLowTotal')=>({id:123,standaloneId:'test-snapshot',gameMode,players:['Paul','Davie','Nick','Ralf'],initialRanks:[1,2,3,4],startHoleIndex:0,course:Array.from({length:18},()=>({par:4})),scores:Array.from({length:18},()=>['','','','']),created:'2026-11-27',note:'Synthetic game'});
test('user example: independent HLT +4 and HL +3 with next-hole score pairing',()=>{
 for(const [mode,points] of [['highLowTotal',4],['highLow',3]]){
  const r=fixture(mode);r.scores[0]=[3,5,4,4];
  const v=G.calculate(r);assert.deepEqual(v.totals,[points,-points,-points,points]);
  assert.deepEqual(G.pairing(r,1).team1,[0,1]);assert.deepEqual(G.pairing(r,1).team2,[2,3]);
  assert.equal(v.rows[0].low,1);assert.equal(v.rows[0].high,1);assert.equal(v.rows[0].bonuses,1);
 }
});
test('ties give zero, per-player bonuses stack and both teams offset each other',()=>{
 const r=fixture();r.scores[0]=[4,4,4,4];assert.deepEqual(G.calculate(r).totals,[0,0,0,0]);
 r.scores[0]=[3,4,4,3];assert.equal(G.calculate(r).rows[0].bonuses,2);assert.equal(G.calculate(r).rows[0].points,5);
 r.scores[0]=[3,3,4,4];assert.equal(G.calculate(r).rows[0].bonuses,0);assert.equal(G.calculate(r).rows[0].points,0);
 r.scores[0]=[2,3,3,6];const row=G.calculate(r).rows[0];assert.equal(row.low,1);assert.equal(row.high,-1);assert.equal(row.bonuses,1);assert.equal(row.total,-1);assert.equal(row.points,0);
 for(const [score,par,expected] of [[3,4,1],[2,4,3],[2,5,5],[1,3,3],[1,4,5],[4,4,0]])assert.equal(G.bonus(score,par),expected);
});
test('High-Low never awards Total even when totals differ',()=>{
 const r=fixture('highLow');r.scores[0]=[3,4,4,5];assert.equal(G.calculate(r).rows[0].total,0);
 const withTotal={...r,gameMode:'highLowTotal'};assert.equal(G.calculate(withTotal).rows[0].total,0);
 r.scores[0]=[3,4,5,5];assert.equal(G.calculate(r).rows[0].total,0);assert.equal(G.calculate({...r,gameMode:'highLowTotal'}).rows[0].total,1);
});
test('stable ties, missing holes, any starting hole and earlier corrections recompute pairing',()=>{
 const r=fixture();r.initialRanks=[4,3,2,1];r.scores[0]=[4,4,4,4];assert.deepEqual(G.pairing(r,1).order,[3,2,1,0]);
 r.scores[0]=[3,5,4,4];assert.deepEqual(G.pairing(r,1).order,[0,3,2,1]);
 r.scores[0][3]=2;assert.deepEqual(G.pairing(r,1).order,[3,0,2,1]);
 r.scores[0][0]='';assert.equal(G.pairing(r,1),null);assert.equal(G.calculate(r).rows[0],null);
 r.startHoleIndex=9;r.scores[9]=[3,5,4,4];assert.deepEqual(G.pairing(r,10).team1,[0,1]);assert.equal(G.playOrder(r).at(-1),8);
 assert.equal(G.calculate(r).totals.reduce((a,b)=>a+b),0);
});
test('invalid mode, players, distance ranks and strokes rejected',()=>{
 for(const change of [{gameMode:'vegas'},{players:['A','B','C']},{initialRanks:[1,1,3,4]}])assert.throws(()=>G.calculate({...fixture(),...change}));
 for(const score of [0,-1,1.2,1000,NaN]){const r=fixture();r.scores[0][0]=score;assert.throws(()=>G.calculate(r));}
});
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8'),ui=readFileSync(new URL('../scripts/high-low-ui.js',import.meta.url),'utf8');
function uiHarness(mode='highLow'){
 const r=fixture(mode);r.scores=Array.from({length:18},()=>[3,5,4,4]);const writes=[],alerts=[],storage=[],boxes={};
 const ctx={FortisHighLow:G,round:r,roundHole:0,currentUser:{id:'owner'},roundActionPending:false,crypto:{randomUUID:()=> 'stable-test'},document:{getElementById:id=>boxes[id]??=( {innerHTML:''}),querySelectorAll:()=>[]},saveActiveRound:()=>storage.push('saved'),clearActiveRound:()=>storage.push('cleared'),showPage:()=>{},alert:m=>alerts.push(m),sb:async(path,opts)=>{writes.push({path,data:JSON.parse(opts.body)});return [{}];},loadPaged:async path=>{writes.push({path});return [];}};
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(ui,ctx);return {ctx,writes,alerts,storage,r,boxes};
}
test('each standalone saves only its own mode and never calls legacy scoring or stats writes',async()=>{
 for(const mode of ['highLow','highLowTotal']){
  const {ctx,writes,storage}=uiHarness(mode);await ctx.FortisHighLowUI.save();
  assert.equal(writes.length,1);assert.match(writes[0].path,/^golf_high_low_rounds/);assert.equal(writes[0].data.game_kind,mode);assert.equal(writes[0].data.round_data.gameMode,mode);assert.equal(ctx.round,null);assert.ok(storage.includes('cleared'));
  await ctx.FortisHighLowUI.history(mode);assert.match(writes[1].path,new RegExp('game_kind=eq.'+mode));
 }
});
test('incomplete and failed saves keep draft; retries use the same ID',async()=>{
 const {ctx,writes,r,storage,alerts}=uiHarness();r.scores[0][0]='';await ctx.FortisHighLowUI.save();assert.equal(writes.length,0);assert.equal(ctx.round,r);
 r.scores[0][0]=3;ctx.sb=async(path,opts)=>{writes.push(JSON.parse(opts.body));throw Error('offline');};await ctx.FortisHighLowUI.save();await ctx.FortisHighLowUI.save();assert.equal(writes.length,2);assert.equal(writes[0].id,writes[1].id);assert.equal(ctx.round,r);assert.ok(!storage.includes('cleared'));assert.ok(alerts.length);
});
test('own score UI routes before 8421 calculation and own save routes before legacy writes',()=>{
 const {ctx,boxes}=uiHarness();ctx.FortisHighLowUI.render();assert.match(boxes.scoreContent.innerHTML,/High-Low ·/);assert.doesNotMatch(boxes.highLowBoard?.innerHTML||'',/8421 點數/);
 const slice=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b));
 let render=0,save=0;ctx.FortisHighLowUI={render(){render++;},save(){save++;}};ctx.calcFortis=()=>{throw Error('Legacy calculator called');};
 vm.runInContext(slice('function renderScore(){','function individualHtml(){'),ctx);ctx.renderScore();assert.equal(render,1);
 vm.runInContext(slice('async function saveRound(){','function renderHeadToHead(){'),ctx);ctx.saveRound();assert.equal(save,1);
});
test('startRound uses distance ranks, no handicaps/cross-group, and keeps modes distinct',()=>{
 for(const mode of ['highLow','highLowTotal']){
  const elements={gameMode:{value:mode},course:{value:'TEST'},comboBox:{classList:{contains:()=>true}},roundNote:{value:'Test'},countPar3Strokes:{checked:true},enableCrossGroup:{checked:true},matchupSetup:{querySelector:()=>true}};
  [1,2,3,4].forEach((v,i)=>elements['r'+i]={value:String(v)});
  const ctx={document:{getElementById:id=>elements[id]},roundActionPending:false,currentPlayers:()=>['A','B','C','D'],buildCourse:()=>Array.from({length:18},()=>({par:4})),readMatchups:()=>{throw Error('Legacy handicaps read');},crypto:{randomUUID:()=> 'new-game'},FortisHighLow:G,alert:m=>{throw Error(m);},prompt:()=> '10',saveRecentCourse(){},saveActiveRound(){},syncLiveRound(){},renderScore(){},showPage(){}};
  vm.createContext(ctx);const start=html.indexOf('function startRound(){'),end=html.indexOf('function playerPoint(');vm.runInContext(html.slice(start,end),ctx);ctx.startRound();
  assert.equal(ctx.round.gameMode,mode);assert.equal(ctx.round.crossGroupEnabled,false);assert.equal(ctx.round.larryMode,false);assert.equal(ctx.round.matchups.length,0);assert.equal(ctx.round.startHoleIndex,9);assert.equal(ctx.round.standaloneId,'new-game');
 }
});
test('signout clears standalone results and rejects late history responses',async()=>{
 const {ctx,boxes}=uiHarness();let finish;ctx.loadPaged=()=>new Promise(resolve=>finish=resolve);
 const pending=ctx.FortisHighLowUI.history('highLow');ctx.FortisHighLowUI.clearMemory();finish([]);await pending;
 assert.equal(boxes.highLowHistory.innerHTML,'');
});
