/* Shared presentation and metadata; each team's calculator remains independent. */
(function(root){
'use strict';
const MODES=['individual8421','vegas','highLowTotal','highLow'];
const selected=r=>Array.isArray(r?.selectedGames)?MODES.filter(m=>r.selectedGames.includes(m)):[r?.gameMode||'individual8421'];
const has=(r,m)=>selected(r).includes(m);
const multiple=r=>selected(r).length>1;
const forMode=(r,m)=>({...r,gameMode:m,separateGame:m!=='individual8421',selectedGames:[m]});
function choices(doc=root.document){const boxes=[...doc.querySelectorAll('[data-game-choice]')];return boxes.length?MODES.filter(m=>boxes.some(e=>e.value===m&&e.checked)):[doc.getElementById('gameMode')?.value||'individual8421'];}
const separate=r=>Array.isArray(r?.selectedGames)?!has(r,'individual8421'):['highLowTotal','highLow'].includes(r?.gameMode)||(r?.gameMode==='vegas'&&r.separateGame===true);
const title=r=>({highLowTotal:'High-Low-Total',highLow:'High-Low',vegas:'Vegas',solo:'個人計分'}[r?.gameMode]||'8421');
function metadata(course){const m=course?.[0]||{};return {gameMode:m.gameMode||'individual8421',separateGame:m.separateGame===true,vegasDraw:m.vegasDraw,...(Array.isArray(m.selectedGames)?{selectedGames:MODES.filter(x=>m.selectedGames.includes(x))}:{})};}
function result(r,legacy){
 if(['highLowTotal','highLow'].includes(r.gameMode))return root.FortisHighLow.calculate(r);
 if(r.gameMode==='vegas'&&r.separateGame)return root.FortisVegas.calculate(r);
 return legacy(r);
}
function gross(r,escape){return `<section class="card" aria-label="目前總桿"><h2>目前總桿</h2><div class="grid">${r.players.map((p,i)=>`<div><b>${escape(p)}</b><div class="score">${r.scores.reduce((s,row)=>s+(row[i]===''?0:Number(row[i])||0),0)}</div><span class="small">${r.scores.filter(row=>row[i]!==''&&Number.isFinite(Number(row[i]))).length}/18 洞</span></div>`).join('')}</div></section>`;}
root.FortisGameModes={MODES,selected,has,multiple,forMode,choices,separate,title,metadata,result,gross};
if(typeof module!=='undefined')module.exports=root.FortisGameModes;
})(typeof window==='undefined'?globalThis:window);
