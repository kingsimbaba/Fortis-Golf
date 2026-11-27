import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),H=require('../scripts/high-low.js'),V=require('../scripts/vegas.js'),M=require('../scripts/game-modes.js');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8'),ui=readFileSync(new URL('../scripts/high-low-ui.js',import.meta.url),'utf8');
const slice=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b));
const modes=['individual8421','vegas','highLowTotal','highLow'];
const fixture=mode=>({id:123,gameMode:mode,separateGame:mode==='vegas',standaloneId:'test-round',players:['Paul','Davie','Nick','Ralf'],initialRanks:[1,2,3,4],vegasDraw:[1,2,3,4],startHoleIndex:0,courseName:'TEST',matchups:[{id:17,a:'Paul',b:'Davie',giver:'Paul',receiver:'Davie',strokes:2,active:true}],larryMode:false,course:Array.from({length:18},(_,i)=>({par:4,hcp:i+1,roundHole:i+1,strokeEligible:true})),scores:Array.from({length:18},()=>[3,5,4,4]),putts:Array.from({length:18},()=>[1,2,3,2])});
function context(r){const boxes={},ctx={round:r,roundHole:0,roundActionPending:false,FortisGameModes:M,FortisHighLow:H,FortisVegas:V,adminEscapeHtml:String,document:{getElementById:id=>boxes[id]??={innerHTML:''},querySelectorAll:()=>[]},saveActiveRound(){},alert(){},currentUser:{id:'owner'}};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(slice('function eligibleStrokeHoles(','function playScoreAnimation('),ctx);vm.runInContext(slice('function individualHtml(){','function buildUnluckyTrend('),ctx);vm.runInContext(slice('function vegasLiveScoreboardHtml(','function vegasScoreboardHtml('),ctx);vm.runInContext(ui,ctx);return {ctx,boxes};}
test('menu offers four independent checkboxes with only 8421 checked by default',()=>{
 const choices=html.match(/<fieldset id="gameChoices"[\s\S]*?<\/fieldset>/)[0];assert.equal((choices.match(/data-game-choice/g)||[]).length,4);assert.equal((choices.match(/ checked /g)||[]).length,1);assert.match(choices,/value="individual8421" checked/);assert.match(choices,/可複選/);
});
test('all four modes use identical individual-battle math and preserve gross team scoring',()=>{
 let expected;
 for(const mode of modes){const r=fixture(mode),{ctx}=context(r);const battle=JSON.parse(JSON.stringify(ctx.calcIndividual(r)[0]));if(!expected)expected=battle;assert.deepEqual(battle,expected);
  assert.equal(battle.totalResult,36);assert.equal(ctx.nextGive(battle).strokes,14);
  const individual=ctx.individualBattleHtml(r);assert.match(individual,/Paul vs Davie/);assert.match(individual,/個人對戰即時戰況/);
  if(mode.startsWith('highLow')){const before=H.calculate(r).totals;r.matchups[0].strokes=18;r.larryMode=true;assert.deepEqual(H.calculate(r).totals,before);}
 }
});
test('new Vegas, High-Low-Total and High-Low show gross totals above selected points and battles',()=>{
 for(const mode of modes.slice(1)){const r=fixture(mode),{ctx,boxes}=context(r);ctx.FortisHighLowUI.render();const rendered=boxes.scoreContent.innerHTML;
  assert.ok(rendered.indexOf('目前總桿')<rendered.indexOf(M.title(r)+' 點數')||mode==='vegas');assert.match(rendered,/個人對戰即時戰況/);assert.match(rendered,/Paul vs Davie/);assert.match(rendered,/推桿/);
  const gross=rendered.slice(0,rendered.indexOf('</section>'));assert.match(gross,/>54<\/div>/);assert.match(gross,/>90<\/div>/);assert.match(gross,/>72<\/div>/);
  if(mode==='vegas'){assert.match(rendered,/Vegas 累計點數/);assert.doesNotMatch(rendered,/即時排行榜|Individual 8421 點數|目前配對/);}
 }
});
test('all four save score and putt statistics and individual handicap history exactly once',async()=>{
 for(const mode of modes){const r=fixture(mode),{ctx}=context(r),writes=[];Object.assign(ctx,{db:{seasons:[],scores:[]},localRounds:[],sb:async(path,opts)=>{writes.push({path,data:JSON.parse(opts.body)});return [{id:42}];},buildRoundAchievements:()=>({}),endActiveScoringSession:async()=>{},loadAll:async()=>{},clearActiveRound(){},renderSummary(){},showPage(){},showRoundAchievements(){},setTimeout(){}});
 vm.runInContext(slice('async function saveRound(){','function renderHeadToHead(){'),ctx);await ctx.saveRound();assert.equal(ctx.round,null,mode);
 assert.equal(writes.filter(w=>w.path==='fortis_rounds').length,1);const scores=writes.find(w=>w.path==='hole_scores').data;assert.equal(scores.length,72);assert.deepEqual(scores.slice(0,4).map(s=>s.putts),[1,2,3,2]);
 const update=writes.find(w=>w.path==='matchups?id=eq.17');assert.equal(update.data.holes_given,14);const history=writes.find(w=>w.path==='matchup_history');assert.equal(history.data.result_holes,36);
 const stored=writes[0].data.course_data,restored={...r,...M.metadata(stored)};assert.equal(M.title(restored),M.title(r));
 if(mode==='individual8421')assert.ok(!writes.some(w=>/golf_(vegas|high_low)_rounds/.test(w.path)));else assert.equal(writes.filter(w=>/golf_(vegas|high_low)_rounds/.test(w.path)).length,1);
 }
});
test('retrying a supplemental snapshot does not repeat gross records or individual updates',async()=>{
 for(const mode of modes.slice(1)){const r=fixture(mode),{ctx}=context(r),writes=[];let failed=false;Object.assign(ctx,{db:{seasons:[],scores:[]},localRounds:[],sb:async(path,opts)=>{writes.push({path,data:JSON.parse(opts.body)});if(/golf_(vegas|high_low)_rounds/.test(path)&&!failed){failed=true;throw Error('offline');}return [{id:42}];},buildRoundAchievements:()=>({}),endActiveScoringSession:async()=>{},loadAll:async()=>{},clearActiveRound(){},renderSummary(){},showPage(){},showRoundAchievements(){},setTimeout(){}});
 vm.runInContext(slice('async function saveRound(){','function renderHeadToHead(){'),ctx);await ctx.saveRound();assert.equal(ctx.round,r);await ctx.saveRound();assert.equal(ctx.round,null);for(const path of ['fortis_rounds','hole_scores','matchups?id=eq.17','matchup_history'])assert.equal(writes.filter(w=>w.path===path).length,1,path);
 }
});
test('stored mode metadata selects only its own calculator and legacy data retains original behavior',()=>{
 for(const mode of modes.slice(1)){const r=fixture(mode),restored={...r,...M.metadata([{gameMode:mode,separateGame:true,vegasDraw:r.vegasDraw}])};assert.equal(M.separate(restored),true);const result=M.result(restored,()=>{throw Error('8421 must not run');});assert.equal(result.totals.length,4);}
 let calls=0;M.result({...fixture('vegas'),separateGame:false},()=>{calls++;return {};});assert.equal(calls,1);assert.equal(M.metadata([]).gameMode,'individual8421');
});

const combinations=Array.from({length:15},(_,i)=>modes.filter((m,n)=>(i+1)&(1<<n)));
function multiFixture(games){return {...fixture(games[0]),selectedGames:games,gameMode:games[0],separateGame:games[0]==='vegas'};}
function scoring(ctx){vm.runInContext(slice('function playerPoint(','function eligibleStrokeHoles('),ctx);}
function saveHarness(r,failMode){
 const {ctx,boxes}=context(r),writes=[];let failed=false,id=0;
 Object.assign(ctx,{crypto:{randomUUID:()=>`uuid-${++id}`},db:{seasons:[],scores:[]},localRounds:[],sb:async(path,opts)=>{const data=JSON.parse(opts.body);writes.push({path,data});if(failMode&&data.game_kind===failMode&&!failed){failed=true;throw Error('offline');}return [{id:42}];},buildRoundAchievements:()=>({}),endActiveScoringSession:async()=>{},loadAll:async()=>{},clearActiveRound(){},renderSummary(){},showPage(){},showRoundAchievements(){},setTimeout(){}});
 vm.runInContext(slice('async function saveRound(){','function renderHeadToHead(){'),ctx);return {ctx,boxes,writes};
}
test('all 15 game combinations show only selected games and one gross/battle record',()=>{
 for(const games of combinations){const r=multiFixture(games),{ctx,boxes}=context(r);scoring(ctx);ctx.FortisHighLowUI.render();const rendered=boxes.scoreContent.innerHTML;
  assert.equal((rendered.match(/aria-label="目前總桿"/g)||[]).length,1);
  assert.equal((rendered.match(/個人對戰即時戰況/g)||[]).length,1);
  assert.equal((rendered.match(/id="highLowScore0"/g)||[]).length,1);
  for(const m of modes)assert.equal(rendered.includes(`data-game-result="${m}"`),games.includes(m));
  const boards=ctx.FortisHighLowUI.allBoards(r,0);for(const m of games){const one=M.forMode(r,m);assert.deepEqual(M.result(one,ctx.calcFortis).totals,m==='individual8421'?ctx.calcFortis(r).totals:m==='vegas'?V.calculate(r).totals:H.calculate({...r,gameMode:m}).totals);}
  const totals=Object.fromEntries(games.map(m=>[m,Array.from(M.result(M.forMode(r,m),ctx.calcFortis).totals)]));
  ctx.FortisHighLowUI.score(0,0,{value:'4',setCustomValidity(){},reportValidity(){return true;}});
  assert.equal(r.scores[0][0],4);assert.match(boxes.sharedGrossBoard.innerHTML,/>55<\/div>/);assert.match(boxes.individualBattleBoard.innerHTML,/Paul vs Davie/);
  for(const m of games)assert.notDeepEqual(Array.from(M.result(M.forMode(r,m),ctx.calcFortis).totals),totals[m],m);
 }
});
test('all 15 combinations save one gross/putt set and one battle update, with distinct selected snapshots',async()=>{
 for(const games of combinations){const r=multiFixture(games),{ctx,writes}=saveHarness(r);await ctx.saveRound();assert.equal(ctx.round,null,games.join(','));
  for(const path of ['fortis_rounds','hole_scores','matchups?id=eq.17','matchup_history'])assert.equal(writes.filter(w=>w.path===path).length,1,path);
  assert.equal(writes.find(w=>w.path==='hole_scores').data.length,72);
  assert.deepEqual(M.metadata(writes[0].data.course_data).selectedGames,games);
  assert.equal(M.separate({...r,...M.metadata(writes[0].data.course_data)}),!games.includes('individual8421'));
  const snapshots=writes.filter(w=>/golf_(vegas|high_low)_rounds/.test(w.path));assert.equal(snapshots.length,games.filter(m=>m!=='individual8421').length);
  assert.equal(new Set(snapshots.map(w=>w.data.id)).size,snapshots.length);
  for(const w of snapshots){assert.equal(w.data.round_data.fortisRoundId,42);const m=w.data.game_kind||'vegas';assert.equal(w.data.round_data.gameMode,m);assert.deepEqual(w.data.round_data.selectedGames,[m]);assert.deepEqual(w.data.round_data.scores,r.scores);}
 }
});
test('retry after last game snapshot failure preserves IDs and never repeats previous games or individual updates',async()=>{
 const r=multiFixture(modes),{ctx,writes}=saveHarness(r,'highLow');await ctx.saveRound();assert.equal(ctx.round,r);const ids={...r.gameSnapshotIds};
 ctx.FortisHighLowUI.adjust(0,0,1);assert.equal(r.scores[0][0],3);
 const input={value:'8'};ctx.FortisHighLowUI.score(0,0,input);assert.equal(input.value,3);assert.equal(r.scores[0][0],3);
 await ctx.saveRound();assert.equal(ctx.round,null);assert.deepEqual(JSON.parse(JSON.stringify(r.gameSnapshotIds)),ids);
 for(const path of ['fortis_rounds','hole_scores','matchups?id=eq.17','matchup_history'])assert.equal(writes.filter(w=>w.path===path).length,1,path);
 assert.equal(writes.filter(w=>w.path.startsWith('golf_vegas_rounds')).length,1);assert.equal(writes.filter(w=>w.data.game_kind==='highLowTotal').length,1);assert.equal(writes.filter(w=>w.data.game_kind==='highLow').length,2);
});
test('actual round setup starts every selected combination, validates no games, and shows Vegas draw when selected',()=>{
 for(const games of [...combinations,[]]){
  const choices=modes.map(m=>({value:m,checked:games.includes(m)})),elements={gameMode:{value:'individual8421'},playerCount:{value:'4'},vegasDrawSetup:{},individualMatchupCard:{},useIndividualMatchups:{checked:true},course:{value:'TEST'},comboBox:{classList:{contains:()=>true}},roundNote:{value:'Test'},countPar3Strokes:{checked:true},enableCrossGroup:{checked:false},matchupSetup:{querySelector:()=>true}};
  [1,2,3,4].forEach((v,i)=>{elements['r'+i]={value:String(v)};elements['vegasDraw'+i]={value:String(5-v)};});
  const errors=[],{ctx}=context(null);Object.assign(ctx,{document:{getElementById:id=>elements[id],querySelectorAll:()=>choices},currentPlayers:()=>['A','B','C','D'],buildCourse:()=>Array.from({length:18},()=>({par:4})),readMatchups:()=>[{active:true,a:'A',b:'B'}],crypto:{randomUUID:()=> 'new-game'},alert:m=>errors.push(m),prompt:()=> '10',saveRecentCourse(){},syncLiveRound(){},renderScore(){},showPage(){}});
  ctx.FortisHighLowUI.setup();assert.equal(elements.vegasDrawSetup.hidden,!games.includes('vegas'));
  vm.runInContext(slice('function startRound(){','function playerPoint('),ctx);ctx.startRound();
  if(!games.length){assert.equal(ctx.round,null);assert.equal(errors.length,1);continue;}
  assert.deepEqual(Array.from(ctx.round.selectedGames),games);assert.equal(ctx.round.gameMode,games[0]);assert.equal(ctx.round.matchups.length,1);assert.equal(ctx.round.startHoleIndex,games.includes('vegas')?0:9);assert.equal(errors.length,0);
  if(games.includes('vegas'))assert.deepEqual(Array.from(ctx.round.vegasDraw),[4,3,2,1]);
 }
});
