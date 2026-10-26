import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),V=require('../scripts/vegas.js');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const slice=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b));
const fixture=mode=>({id:123,gameMode:mode,players:['A','B','C','D'],initialRanks:[1,2,3,4],matchups:[],vegasDraw:[1,2,3,4],course:Array.from({length:18},(_,i)=>({par:4,hcp:i+1,display:'Hole '+(i+1)})),scores:Array.from({length:18},()=>[4,5,6,7])});
test('Vegas adds a separate scoreboard while original score UI and default putts stay identical',()=>{
 const box={innerHTML:''};const ctx=vm.createContext({roundHole:0,db:{courses:[],course_combos:[]},document:{getElementById:()=>box},courseLocalizedName:()=>'',individualHtml:()=>'',mountTournamentPanel(){},calcFortis:()=>({totals:[1,2,3,4],rows:[]})});
 ctx.FortisVegas=V;ctx.adminEscapeHtml=String;
 vm.runInContext(slice('function vegasLiveScoreboardHtml(','function vegasScoreboardHtml('),ctx);
 vm.runInContext(slice('function renderScore(){','function individualHtml(){'),ctx);
 ctx.round=fixture('individual8421');ctx.renderScore();const expected=box.innerHTML;
 ctx.round=fixture('vegas');ctx.renderScore();assert.match(box.innerHTML,/Vegas 累計點數/);assert.equal(box.innerHTML.replace(/<section id="vegasLiveScoreboard"[\s\S]*?<\/section>/,''),expected);assert.deepEqual(Array.from(ctx.round.putts,row=>Array.from(row)),Array.from({length:18},()=>[2,2,2,2]));
 assert.equal((box.innerHTML.match(/class="team score-entry"/g)||[]).length,4);assert.doesNotMatch(box.innerHTML,/vegasScore[0-9]|跨組/);
});
test('Vegas saves normal scores and putts plus a separate results snapshot; retry does not repeat completed legacy writes',async()=>{
 const writes=[],alerts=[];let fail=true;const r=fixture('vegas');r.putts=Array.from({length:18},()=>[0,1,2,3]);
 const ctx=vm.createContext({round:r,roundActionPending:false,db:{seasons:[],scores:[]},currentUser:{id:'u'},FortisVegas:V,localRounds:[],sb:async(path,opts)=>{writes.push({path,data:JSON.parse(opts.body)});if(path.startsWith('golf_vegas_rounds')&&fail){fail=false;throw Error('temporary');}return [{id:42}];},calcIndividual:()=>[],saveActiveRound(){},buildRoundAchievements:()=>({}),endActiveScoringSession:async()=>{},loadAll:async()=>{},clearActiveRound(){},renderSummary(){},showPage(){},showRoundAchievements(){},setTimeout(){},alert:m=>alerts.push(m)});
 vm.runInContext(slice('async function saveRound(){','function renderHeadToHead(){'),ctx);
 await ctx.saveRound();assert.equal(ctx.round,r);assert.equal(alerts.length,1);
 await ctx.saveRound();assert.equal(ctx.round,null);
 assert.equal(writes.filter(x=>x.path==='fortis_rounds').length,1);const scores=writes.find(x=>x.path==='hole_scores').data;assert.equal(scores.length,72);assert.deepEqual(scores.slice(0,4).map(x=>x.putts),[0,1,2,3]);
 const snapshot=writes.at(-1).data.round_data;assert.deepEqual(snapshot.scores,r.scores);assert.equal(snapshot.fortisRoundId,42);assert.deepEqual(V.calculate(snapshot).totals,V.calculate(r).totals);
});
test('cross-group panel does nothing for an unlinked Individual or Vegas round',()=>{
 for(const mode of ['individual8421','vegas']){let removed=0;const ctx=vm.createContext({round:fixture(mode),document:{getElementById:()=>({remove(){removed++;}}),createElement(){throw Error('unexpected panel');}}});
 vm.runInContext(slice('function mountTournamentPanel(','async function loadTournamentChoices('),ctx);ctx.mountTournamentPanel();assert.equal(removed,1);}
});

test('live Vegas scoreboard shows drawn pairing before entry, completed points and score-based next pairing',()=>{
 const ctx=vm.createContext({FortisVegas:V,adminEscapeHtml:String});
 vm.runInContext(slice('function vegasLiveScoreboardHtml(','function vegasScoreboardHtml('),ctx);
 const r=fixture('vegas');r.scores=Array.from({length:18},()=>['','','','']);
 const pending=ctx.vegasLiveScoreboardHtml(r,0);assert.match(pending,/本洞配對：<\/b>A \+ D vs B \+ C/);assert.match(pending,/本洞點數待定/);assert.doesNotMatch(pending,/0 \(0\)/);
 r.scores[0]=[4,5,4,7];const scored=ctx.vegasLiveScoreboardHtml(r,0);
 assert.match(scored,/組合數 47 vs 45/);assert.match(scored,/-2 \(-2\)/);assert.match(scored,/\+2 \(\+2\)/);assert.match(scored,/第 2 洞配對：<\/b>A \+ D vs C \+ B/);
 r.scores[0][3]=3;const corrected=ctx.vegasLiveScoreboardHtml(r,1);
 assert.match(corrected,/本洞配對：<\/b>D \+ B vs A \+ C/);assert.notEqual(scored,corrected);
 r.scores[0][0]='';const missing=ctx.vegasLiveScoreboardHtml(r,1);assert.match(missing,/請先完成之前各洞/);assert.doesNotMatch(missing,/\+2 \(\+2\)/);
});

test('real score buttons and hole confirmation update 8421 and Vegas concurrently over four holes',async()=>{
 const box={innerHTML:''},r=fixture('vegas');r.scores=Array.from({length:18},()=>['','','','']);
 r.course.forEach((c,i)=>c.par=[4,3,3,5][i]||4);
 const ctx=vm.createContext({round:r,roundHole:0,scoreAnimationPlaying:false,FortisVegas:V,adminEscapeHtml:String,db:{courses:[],course_combos:[]},document:{getElementById:()=>box},courseLocalizedName:()=>'',individualHtml:()=>'',mountTournamentPanel(){},saveActiveRound(){},syncLiveRound(){},playScoreAnimation:()=>Promise.resolve(),alert:m=>{throw Error(m);}});
 vm.runInContext(slice('function playerPoint(','function eligibleStrokeHoles('),ctx);
 vm.runInContext(slice('function vegasLiveScoreboardHtml(','function vegasScoreboardHtml('),ctx);
 vm.runInContext(slice('function changeScore(','function renderScore(){'),ctx);
 vm.runInContext(slice('function renderScore(){','function individualHtml(){'),ctx);
 const strokes=[[4,5,4,7],[3,4,5,3],[3,3,4,5],[5,6,4,7]],fortis=[[-2,2,2,-2],[3,-3,-3,3],[4,-4,-2,2],[-1,1,3,-3]],vegas=[[-2,2,2,-2],[10,-10,-10,10],[11,-11,-9,9],[-11,11,13,-13]];
 for(let h=0;h<4;h++){
  strokes[h].forEach((score,i)=>{const delta=score-r.course[h].par;for(let n=0;n<Math.abs(delta);n++)ctx.changeScore(h,i,Math.sign(delta));});
  ctx.confirmHoleScores();await Promise.resolve();
  assert.equal(ctx.roundHole,h+1);
  assert.deepEqual(Array.from(ctx.calcFortis(r).totals),fortis[h]);assert.deepEqual(V.calculate(r).totals,vegas[h]);
  assert.deepEqual(Array.from(ctx.calcFortis({...r,gameMode:'individual8421'}).totals),fortis[h]);
  const leaderboard=box.innerHTML.split('<h2>即時排行榜</h2>')[1].split('<section id="vegasLiveScoreboard"')[0];
  r.players.forEach((name,i)=>assert.match(leaderboard,new RegExp('<b>'+name+'</b></div>\\s*<div class="score"[^>]*>'+fortis[h][i]+'</div>')));
 }
 // Correcting a previous score refreshes both totals and the displayed 8421 leaderboard.
 const before=Array.from(ctx.calcFortis(r).totals);ctx.changeScore(0,0,-1);assert.notDeepEqual(Array.from(ctx.calcFortis(r).totals),before);
 assert.deepEqual(Array.from(ctx.calcFortis(r).totals),Array.from(ctx.calcFortis({...r,gameMode:'individual8421'}).totals));
});

test('compact live Vegas view exposes totals and pairing while all hole details start collapsed',()=>{
 const ctx=vm.createContext({FortisVegas:V,adminEscapeHtml:String});vm.runInContext(slice('function vegasLiveScoreboardHtml(','function vegasScoreboardHtml('),ctx);
 const rendered=ctx.vegasLiveScoreboardHtml(fixture('vegas'),2),visible=rendered.split('<details>')[0];
 assert.match(visible,/Vegas 累計點數/);assert.match(visible,/本洞配對/);assert.equal((visible.match(/class="leader-row"/g)||[]).length,4);
 assert.doesNotMatch(visible,/<table|組合數|本洞點數（累計）/);assert.match(rendered,/<details><summary>查看本洞與逐洞明細/);assert.doesNotMatch(rendered,/<details[^>]*\bopen\b/);
});

test('8421 can correctly tie a hole while Vegas awards points from the same strokes',()=>{
 const ctx=vm.createContext({});vm.runInContext(slice('function playerPoint(','function eligibleStrokeHoles('),ctx);
 const r=fixture('vegas');r.scores=Array.from({length:18},()=>['','','','']);r.scores[0]=[4,5,5,7];
 assert.deepEqual(Array.from(ctx.calcFortis(r).totals),[0,0,0,0]);assert.deepEqual(V.calculate(r).totals,[8,-8,-8,8]);
});

test('reported mock strokes reconcile hole gains with cumulative 8421 totals',()=>{
 const ctx=vm.createContext({});vm.runInContext(slice('function playerPoint(','function eligibleStrokeHoles('),ctx);
 const r=fixture('vegas');r.scores=Array.from({length:18},()=>['','','','']);r.course[0].par=4;r.course[1].par=4;r.course[2].par=3;
 const strokes=[[4,5,4,7],[3,4,4,4],[3,2,3,3]],expected=[[-2,2,2,-2],[2,-2,-2,2],[-2,2,2,-2]];
 strokes.forEach((row,h)=>{r.scores[h]=row;const calculated=ctx.calcFortis(r);assert.deepEqual(Array.from(calculated.totals),expected[h]);if(h===1)assert.equal(calculated.rows[h].t1-calculated.rows[h].t2,4);});
 assert.deepEqual(V.calculate(r).totals,[-2,2,2,-2]);
});
