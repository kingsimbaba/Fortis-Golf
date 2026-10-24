/* Separate opt-in mode. Never calls or changes Individual 8421 calculators. */
(function(root){
'use strict';
function drawOrder(draw){
 if(!Array.isArray(draw)||draw.length!==4||new Set(draw).size!==4||draw.some(n=>!Number.isInteger(n)||n<1||n>4))throw Error('請為四位球員分別輸入不重複的抽籤號碼 1–4。');
 return [0,1,2,3].sort((a,b)=>draw[a]-draw[b]);
}
function pairing(r,h){
 let order=drawOrder(r.vegasDraw);
 if(r.players.length!==4)throw Error('Vegas 需要四位球員。');
 // Hole indices are fixed, even when navigation jumps to a later hole.
 for(let prev=0;prev<h;prev++){
  if(order.some(i=>!Number.isInteger(r.scores[prev]?.[i])||r.scores[prev][i]<1))return null;
  const prior=new Map(order.map((i,p)=>[i,p]));
  order.sort((a,b)=>r.scores[prev][a]-r.scores[prev][b]||prior.get(a)-prior.get(b));
 }
 return {order,team1:[order[0],order[3]],team2:[order[1],order[2]]};
}
const RULES=Object.freeze({version:1,flip:false,birdie:2,eagle:5,holeInOne:10,stack:false,doubleDigits:'largerFirst'});
function teamNumber(a,b){
 if(![a,b].every(s=>Number.isInteger(s)&&s>=1&&s<=999))throw Error('Invalid Vegas strokes');
 const low=Math.min(a,b),high=Math.max(a,b);
 // Concatenate full scores; never truncate 10+ to its final digit.
 return Number(high>=10?String(high)+String(low):String(low)+String(high));
}
function playerMultiplier(score,par){
 if(score===1)return RULES.holeInOne;
 if(score<=par-2)return RULES.eagle;
 if(score===par-1)return RULES.birdie;
 return 1;
}
function calculate(r){
 const totals=[0,0,0,0],rows=[];
 for(let h=0;h<18;h++){
  const pair=pairing(r,h);
  if(!pair||r.scores[h].some(s=>!Number.isInteger(s)||s<1||s>999)){rows[h]=null;continue;}
  const t1=teamNumber(...pair.team1.map(i=>r.scores[h][i]));
  const t2=teamNumber(...pair.team2.map(i=>r.scores[h][i]));
  const winners=t1<t2?pair.team1:t2<t1?pair.team2:[];
  const multiplier=winners.length?Math.max(...winners.map(i=>playerMultiplier(r.scores[h][i],r.course[h].par))):1;
  const difference=t2-t1,points=difference*multiplier;
  pair.team1.forEach(i=>totals[i]+=points);pair.team2.forEach(i=>totals[i]-=points);
  rows[h]={...pair,h,t1,t2,difference,multiplier,points};
 }
 return {totals,rows};
}
root.FortisVegas={RULES,drawOrder,pairing,teamNumber,playerMultiplier,calculate};
if(typeof module!=='undefined')module.exports=root.FortisVegas;
})(typeof window==='undefined'?globalThis:window);
