import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),V=require('../scripts/vegas.js'),M=require('../scripts/game-modes.js'),H=require('../scripts/high-low.js');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8'),ui=readFileSync(new URL('../scripts/high-low-ui.js',import.meta.url),'utf8');
const modes=['individual8421','vegas','highLowTotal','highLow'];
function harness(games=['vegas'],method='distance',ranks=[4,2,1,3],team=['0','1']){
 const choices=modes.map(value=>({value,checked:games.includes(value)})),distance=Array.from({length:4},()=>({hidden:false}));
 const elements={gameMode:{value:games[0]},playerCount:{value:'4'},vegasDrawSetup:{},vegasPairingChoice:{},vegasPairingMethod:{value:method},vegasManualPairing:{},vegasDistanceNote:{},vegasTeamA0:{value:team[0]},vegasTeamA1:{value:team[1]},vegasTeamB:{},playerSetupHeading:{},individualMatchupCard:{},useIndividualMatchups:{checked:true},countPar3Strokes:{checked:false},enableCrossGroup:{checked:false},course:{value:'TEST'},comboBox:{classList:{contains:()=>true}},roundNote:{value:'Test'},matchupSetup:{querySelector:()=>true}};
 ranks.forEach((v,i)=>{elements['r'+i]={value:String(v)};elements['p'+i]={value:['Paul','Davie','Nick','Ralf'][i]};});
 const alerts=[],ctx={FortisVegas:V,FortisGameModes:M,FortisHighLow:H,document:{getElementById:id=>elements[id],querySelectorAll:s=>s==='[data-game-choice]'?choices:s==='[data-driving-distance]'?distance:[]},round:null,roundActionPending:false,currentPlayers:()=>[0,1,2,3].map(i=>elements['p'+i].value),buildCourse:()=>Array.from({length:18},()=>({par:4})),readMatchups:()=>[],crypto:{randomUUID:()=> 'new-game'},alert:m=>alerts.push(m),prompt:()=> '10',saveRecentCourse(){},syncLiveRound(){},saveActiveRound(){},renderScore(){},showPage(){},makePlayers(){},renderMatchups(){}};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(ui,ctx);vm.runInContext(html.slice(html.indexOf('function startRound(){'),html.indexOf('function playerPoint(')),ctx);return {ctx,elements,choices,distance,alerts};
}
test('Vegas distance defaults use existing ranks without any drawing fields',()=>{
 const h=harness();h.ctx.FortisHighLowUI.setup();assert.equal(h.elements.vegasDrawSetup.hidden,false);assert.equal(h.elements.vegasManualPairing.hidden,true);assert.ok(h.distance.every(e=>!e.hidden));h.ctx.startRound();assert.equal(h.alerts.length,0);const r=h.ctx.round;assert.equal(r.vegasPairingMethod,'distance');assert.deepEqual(Array.from(r.vegasDraw),[4,2,1,3]);assert.deepEqual(V.pairing(r,0).team1,[2,0]);assert.deepEqual(V.pairing(r,0).team2,[1,3]);
});
test('Vegas alone drawing accepts every distinct team, hides distances, and derives valid stored order',()=>{
 for(let a=0;a<4;a++)for(let b=0;b<4;b++){if(a===b)continue;const h=harness(['vegas'],'draw',[1,1,1,1],[String(a),String(b)]);h.ctx.FortisHighLowUI.setup();assert.equal(h.elements.vegasManualPairing.hidden,false);assert.equal(h.elements.vegasDistanceNote.hidden,true);assert.ok(h.distance.every(e=>e.hidden));h.ctx.startRound();assert.equal(h.alerts.length,0);const r=h.ctx.round;assert.equal(r.vegasPairingMethod,'draw');assert.deepEqual(V.pairing(r,0).team1,[a,b]);assert.deepEqual(V.pairing(r,0).team2,[0,1,2,3].filter(i=>i!==a&&i!==b));assert.equal(r.startHoleIndex,0);assert.deepEqual(Array.from(r.initialRanks),Array.from(r.vegasDraw));
  const restored={...r,...M.metadata([{gameMode:'vegas',separateGame:true,selectedGames:['vegas'],vegasDraw:r.vegasDraw,vegasPairingMethod:r.vegasPairingMethod}])};assert.equal(restored.vegasPairingMethod,'draw');restored.scores[0]=[4,4,4,4];assert.deepEqual(V.pairing(restored,1).order,V.pairing(restored,0).order);
 }
});
test('all multiple-game combinations force distance, ignore stale drawn teams, and hide drawing setup',()=>{
 for(let mask=1;mask<16;mask++){const games=modes.filter((_,i)=>mask&(1<<i));if(games.length<2||!games.includes('vegas'))continue;const h=harness(games,'draw',[4,2,1,3],['0','0']);
  // Start validation must protect against a stale draw choice even before setup runs.
  h.ctx.startRound();assert.equal(h.alerts.length,0);assert.equal(h.ctx.round.vegasPairingMethod,'distance');assert.deepEqual(Array.from(h.ctx.round.vegasDraw),[4,2,1,3]);assert.deepEqual(Array.from(h.ctx.round.initialRanks),[4,2,1,3]);
  h.ctx.FortisHighLowUI.setup();assert.equal(h.elements.vegasDrawSetup.hidden,true);assert.equal(h.elements.vegasPairingMethod.value,'distance');assert.equal(h.elements.vegasManualPairing.hidden,true);assert.ok(h.distance.every(e=>!e.hidden));
 }
});
test('switching from drawing to multiple games resets drawing, and returning to Vegas alone defaults to distance',()=>{
 const h=harness(['vegas'],'draw');h.ctx.FortisHighLowUI.setup();assert.ok(h.distance.every(e=>e.hidden));h.choices[0].checked=true;h.ctx.FortisHighLowUI.setup();assert.equal(h.elements.vegasPairingMethod.value,'distance');h.choices[0].checked=false;h.ctx.FortisHighLowUI.setup();assert.equal(h.elements.vegasDrawSetup.hidden,false);assert.equal(h.elements.vegasManualPairing.hidden,true);assert.ok(h.distance.every(e=>!e.hidden));
});
test('invalid distance and missing or duplicate drawn members block starting',()=>{
 for(const [method,ranks,team]of [['distance',[1,1,3,4],['0','1']],['draw',[1,2,3,4],['','1']],['draw',[1,2,3,4],['0','0']],['draw',[1,2,3,4],['0','9']]]){const h=harness(['vegas'],method,ranks,team);h.ctx.startRound();assert.equal(h.ctx.round,null);assert.equal(h.alerts.length,1);}
});
test('name edits refresh safe pairing choices and preserve selected team',()=>{
 const h=harness(['vegas'],'draw');h.ctx.FortisHighLowUI.pairingSetup();h.elements.p2.value='<img src=x onerror=alert(1)>';h.ctx.FortisHighLowUI.pairingSetup();assert.equal(h.elements.vegasTeamA0.value,'0');assert.equal(h.elements.vegasTeamA1.value,'1');assert.match(h.elements.vegasTeamA0.innerHTML,/&lt;img/);assert.doesNotMatch(h.elements.vegasTeamA0.innerHTML,/<img/);assert.match(h.elements.vegasTeamB.textContent,/Ralf/);
});
