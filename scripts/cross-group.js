/* Net results are withheld until publication, including from the organizer preview. */
(function(root){
'use strict';
const RULES=Object.freeze({version:1,hole_cap:'double_par',handicap_min:0,handicap_max:36,decimals:1});
function netLeaderboard(event,groups,state){
 if(event.status!=='final')return null;
 if(!state?.rules||JSON.stringify(Object.keys(RULES).map(k=>state.rules[k]))!==JSON.stringify(Object.values(RULES)))throw Error('Unsupported Peoria rules');
 const holes=state.holes;
 if(!Array.isArray(holes)||holes.length!==12||new Set(holes).size!==12||holes.some(h=>!Number.isInteger(h)||h<1||h>18))throw Error('Invalid hidden holes');
 const rows=[];const par=event.course.reduce((sum,h)=>sum+h.par,0);
 for(const group of groups)group.players.forEach((name,i)=>{
  const scores=event.course.map((_,h)=>group.scores[h]?.[i]);
  if(scores.some(s=>!Number.isInteger(s)||s<1))throw Error('Final results require every score.');
  const gross=scores.reduce((a,b)=>a+b,0);
  const hidden=holes.reduce((sum,h)=>sum+Math.min(scores[h-1],event.course[h-1].par*2),0);
  const handicapTenths=Math.max(0,Math.min(360,Math.round((hidden*1.5-par)*8)));
  rows.push({id:group.id+':'+i,name,gross,handicap:handicapTenths/10,net:(gross*10-handicapTenths)/10});
 });
 rows.sort((a,b)=>a.net-b.net||a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
 let previous,rank;rows.forEach((r,i)=>{if(r.net!==previous)rank=i+1;r.rank=rank;previous=r.net;});return rows;
}
root.FortisCrossGroup={RULES,netLeaderboard};
if(typeof module!=='undefined')module.exports=root.FortisCrossGroup;
})(typeof window==='undefined'?globalThis:window);
