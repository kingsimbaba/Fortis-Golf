/* Standalone gross-stroke games. No 8421 or Vegas calculators or handicaps. */
(function(root){
'use strict';
const modes=['highLowTotal','highLow'];
const isMode=mode=>modes.includes(mode);
const title=mode=>mode==='highLowTotal'?'High-Low-Total':'High-Low';
const valid=s=>Number.isInteger(s)&&s>=1&&s<=999;
const RULES=Object.freeze({version:1,birdie:1,eagle:3,albatross:5,tie:0,strokes:'gross',stack:true});
function validate(r){
 if(!isMode(r.gameMode))throw Error('請選擇 High-Low-Total 或 High-Low。');
 if(r.players?.length!==4||new Set(r.players).size!==4)throw Error('此玩法需要四位不同球員。');
 if(r.initialRanks?.length!==4||new Set(r.initialRanks).size!==4||r.initialRanks.some(v=>!Number.isInteger(v)||v<1||v>4))throw Error('第一洞距離順序請各填一次 1–4。');
 if(r.course?.length!==18||r.course.some(h=>!Number.isInteger(h.par)||h.par<3||h.par>6))throw Error('請選擇有效的 18 洞球場。');
 if(r.scores?.length!==18||r.scores.some(row=>row.length!==4||row.some(s=>s!==''&&!valid(s))))throw Error('請輸入 1–999 的整數桿數。');
 if(!Number.isInteger(r.startHoleIndex??0)||(r.startHoleIndex??0)<0||(r.startHoleIndex??0)>17)throw Error('開始洞號須為 1–18。');
}
function bonus(score,par){const d=score-par;return d<=-3?5:d===-2?3:d===-1?1:0;}
function playOrder(r){return Array.from({length:18},(_,i)=>((r.startHoleIndex||0)+i)%18);}
function pairing(r,h){
 validate(r);const holes=playOrder(r),position=holes.indexOf(h);
 if(position<0)return null;
 let order=[0,1,2,3].sort((a,b)=>r.initialRanks[a]-r.initialRanks[b]);
 for(let p=0;p<position;p++){
  const scores=r.scores[holes[p]];if(!scores.every(valid))return null;
  const prev=new Map(order.map((i,n)=>[i,n]));
  order.sort((a,b)=>scores[a]-scores[b]||prev.get(a)-prev.get(b));
 }
 return {order,team1:[order[0],order[3]],team2:[order[1],order[2]]};
}
function calculate(r){
 validate(r);const totals=[0,0,0,0],rows=Array(18).fill(null);
 for(const h of playOrder(r)){
  const pair=pairing(r,h),scores=r.scores[h];if(!pair||!scores.every(valid))continue;
  const a=pair.team1.map(i=>scores[i]).sort((a,b)=>a-b),b=pair.team2.map(i=>scores[i]).sort((a,b)=>a-b);
  const low=Math.sign(b[0]-a[0]),high=Math.sign(b[1]-a[1]);
  const total=r.gameMode==='highLowTotal'?Math.sign(b[0]+b[1]-a[0]-a[1]):0;
  const bonuses=pair.team1.map(i=>bonus(scores[i],r.course[h].par)).reduce((a,b)=>a+b,0)-pair.team2.map(i=>bonus(scores[i],r.course[h].par)).reduce((a,b)=>a+b,0);
  const points=low+high+total+bonuses;
  pair.team1.forEach(i=>totals[i]+=points);pair.team2.forEach(i=>totals[i]-=points);
  rows[h]={...pair,h,a,b,low,high,total,bonuses,points};
 }
 return {totals,rows};
}
root.FortisHighLow={isMode,title,RULES,validate,bonus,playOrder,pairing,calculate};
if(typeof module!=='undefined')module.exports=root.FortisHighLow;
})(typeof window==='undefined'?globalThis:window);
