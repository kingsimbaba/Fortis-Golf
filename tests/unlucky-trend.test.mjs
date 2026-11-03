import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const slice=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b));
const ctx=vm.createContext({adminEscapeHtml:v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')});
vm.runInContext(slice('function playerPoint(','function eligibleStrokeHoles(')+slice('function buildUnluckyTrend(','function buildRoundAchievements('),ctx);
const fixture=(n=4,start=0)=>({players:['A','B','C','D'].slice(0,n),initialRanks:[1,2,3,4].slice(0,n),startHoleIndex:start,course:Array.from({length:18},(_,i)=>({par:4,display:'Hole '+(i+1)})),scores:Array.from({length:18},(_,h)=>Array.from({length:n},(_,i)=>4+(h*3+i*2)%5))});
test('trend follows existing 8421 row results for 3/4 players and every start hole',()=>{
 for(const n of [3,4])for(let start=0;start<18;start++){
  const r=fixture(n,start),before=JSON.stringify(r),result=ctx.calcFortis(r),data=ctx.buildUnluckyTrend(r);assert.equal(JSON.stringify(r),before);
  assert.equal(data.series.length,result.totals.filter(v=>v===Math.min(...result.totals)).length);
  for(const s of data.series){assert.equal(s.points.length,19);assert.equal(s.points[0].value,0);assert.equal(s.points[1].hole,start+1);assert.equal(s.points[18].value,result.totals[r.players.indexOf(s.name)]);assert.equal(s.final,s.points[18].value);}
 }
});
test('ties retain every lowest player; zero ties, two-player and incomplete rounds avoid a false loser',()=>{
 const r=fixture();r.scores=Array.from({length:18},()=>[4,5,6,7]);const data=ctx.buildUnluckyTrend(r);assert.ok(data.series.length>1);assert.equal(ctx.buildUnluckyTrend(fixture(2)),null);
 r.scores=Array.from({length:18},()=>[4,4,4,4]);assert.equal(ctx.buildUnluckyTrend(r).tied,true);assert.match(ctx.renderUnluckyTrend(ctx.buildUnluckyTrend(r)),/本場平手/);
 r.scores[17][0]='';assert.equal(ctx.buildUnluckyTrend(r),null);r.scores[17][0]=null;assert.equal(ctx.buildUnluckyTrend(r),null);
});
test('compact SVG uses requested title, zero reference and safe labels, with both summary entry points',()=>{
 const r=fixture();r.players[1]='<img src=x onerror=alert(1)>';const output=ctx.renderUnluckyTrend(ctx.buildUnluckyTrend(r));assert.match(output,/本日地獄倒楣鬼戰況走勢/);assert.match(output,/<polyline/);assert.match(output,/role="img"/);assert.doesNotMatch(output,/<rect|<img|NaN|Infinity/);assert.match(output,/stroke-dasharray/);assert.match(html,/renderUnluckyTrend\(data.unluckyTrend\)/);assert.match(html,/renderUnluckyTrend\(buildUnluckyTrend\(savedRound\)\)/);
});
