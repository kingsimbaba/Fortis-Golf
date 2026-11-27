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
test('menu has four exclusive choices, 8421 default, no combined Vegas option',()=>{
 const select=html.match(/<select id="gameMode"[\s\S]*?<\/select>/)[0];assert.equal((select.match(/<option /g)||[]).length,4);assert.match(select,/value="individual8421" selected>8421/);assert.match(select,/>Vegas<\/option>/);assert.doesNotMatch(select,/Vegas \+/);
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
