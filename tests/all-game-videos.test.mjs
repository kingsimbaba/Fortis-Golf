import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),H=require('../scripts/high-low.js'),V=require('../scripts/vegas.js'),M=require('../scripts/game-modes.js');
const source=readFileSync(new URL('../index.html',import.meta.url),'utf8'),ui=readFileSync(new URL('../scripts/high-low-ui.js',import.meta.url),'utf8');
const modes=['individual8421','vegas','highLowTotal','highLow'],combinations=Array.from({length:15},(_,i)=>modes.filter((m,n)=>(i+1)&(1<<n)));
const slice=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b));
function harness(games,scores,par=4,hole=0,start=0){
 const boxes={},listeners={},overlays=[],alerts=[],timers=[];let removed=0;
 const video={pause(){},play(){return Promise.resolve();},addEventListener(n,fn){listeners[n]=fn;},querySelector(){return {addEventListener(n,fn){listeners['source-'+n]=fn;}};}};
 const r={gameMode:games[0],selectedGames:games,separateGame:games[0]==='vegas',players:['Paul','Davie','Nick','Ralf'],initialRanks:[1,2,3,4],vegasDraw:[1,2,3,4],matchups:[],larryMode:true,startHoleIndex:start,courseName:'TEST',course:Array.from({length:18},(_,i)=>({par,hcp:i+1})),scores:Array.from({length:18},()=>[par,par,par,par]),putts:Array.from({length:18},()=>[2,2,2,2])};r.scores[hole]=scores;
 const ctx={round:r,roundHole:hole,roundActionPending:false,scoreAnimationPlaying:false,FortisHighLow:H,FortisVegas:V,FortisGameModes:M,adminEscapeHtml:String,document:{getElementById:id=>boxes[id]??={innerHTML:''},querySelectorAll:()=>[],createElement(){const overlay={innerHTML:'',querySelector:()=>video,remove(){removed++;}};overlays.push(overlay);return overlay;},body:{appendChild(){}}},saveActiveRound(){},syncLiveRound(){},alert:m=>alerts.push(m),setTimeout(fn,ms){const t={fn,ms};timers.push(t);if(ms===2200)queueMicrotask(fn);return t;},clearTimeout(t){t.cleared=true;}};
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(slice('function playerPoint(','function eligibleStrokeHoles('),ctx);vm.runInContext(slice('function playScoreAnimation(','  function changeScore('),ctx);vm.runInContext(slice('function vegasLiveScoreboardHtml(','function vegasScoreboardHtml('),ctx);vm.runInContext(ui,ctx);
 return {ctx,r,boxes,overlays,listeners,alerts,timers,get removed(){return removed;}};
}
test('all combinations trigger the existing video from actual gross vs par, independent of team format',async()=>{
 const cases=[{scores:[3,5,4,4],file:'birdie'},{scores:[2,3,8,4],file:'eagle'},{scores:[2,4,7,6],par:5,file:'albatross'},{scores:[1,4,5,3],par:3,file:'hio'},{scores:[4,4,4,4],file:'par'},{scores:[4,5,4,4],file:'bogey'},{scores:[4,6,5,4],file:'double-bogey'},{scores:[4,7,5,4],file:'triple-bogey'},{scores:[4,8,5,4],file:'quadruple-bogey'}];
 for(const games of combinations)for(const c of cases){const h=harness(games,c.scores,c.par||4),before=JSON.stringify(h.r.scores),done=h.ctx.FortisHighLowUI.next();assert.equal(h.overlays.length,1);assert.match(h.overlays[0].innerHTML,new RegExp('animations/'+c.file+'\\.mp4'));assert.equal(h.ctx.scoreAnimationPlaying,true);assert.equal(h.ctx.roundHole,0);if(['double-bogey','triple-bogey'].includes(c.file))h.listeners.ended();await done;assert.equal(h.ctx.roundHole,1);assert.equal(h.ctx.scoreAnimationPlaying,false);assert.equal(JSON.stringify(h.r.scores),before);}
});
test('duplicate confirmation cannot queue a second video, and media error releases scoring',async()=>{
 const h=harness(modes,[4,6,5,4]),first=h.ctx.FortisHighLowUI.next();await h.ctx.FortisHighLowUI.next();assert.equal(h.overlays.length,1);h.listeners.error();await first;assert.equal(h.ctx.roundHole,1);assert.equal(h.ctx.scoreAnimationPlaying,false);assert.equal(h.removed,1);
});
test('blank, locked, or already-saved scores never play or advance',async()=>{
 for(const kind of ['blank','locked','saved']){const h=harness(modes,[3,5,4,4]);if(kind==='blank')h.r.scores[0][0]='';if(kind==='locked')h.r.tournament={locked:true};if(kind==='saved')h.r.vegasFortisRoundId=42;await h.ctx.FortisHighLowUI.next();assert.equal(h.overlays.length,0);assert.equal(h.ctx.roundHole,0);assert.equal(h.alerts.length,1);}
});
test('last played hole still plays gross video and remains ready to save, including wrapped starts',async()=>{
 for(const [hole,start]of [[17,0],[8,9]]){const h=harness(['highLowTotal','highLow'],[3,5,4,4],4,hole,start);await h.ctx.FortisHighLowUI.next();assert.equal(h.overlays.length,1);assert.match(h.overlays[0].innerHTML,/animations\/birdie.mp4/);assert.equal(h.ctx.roundHole,hole);assert.equal(h.alerts.length,1);assert.equal(h.ctx.scoreAnimationPlaying,false);}
});
