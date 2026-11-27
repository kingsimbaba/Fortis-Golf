(function(root){
'use strict';
let generation=0;
function clearMemory(){generation++;const box=document.getElementById('highLowHistory');if(box)box.innerHTML='';}
const G=()=>root.FortisHighLow;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sign=n=>n>0?'+'+n:String(n);
function setup(){
 const mode=document.getElementById('gameMode').value,standalone=G().isMode(mode);
 document.getElementById('vegasDrawSetup').hidden=mode!=='vegas';
 document.getElementById('individualMatchupCard').hidden=standalone;
 const count=document.getElementById('playerCount');
 if(standalone&&count.value!=='4'){count.value='4';makePlayers();renderMatchups();}
 for(const id of ['useIndividualMatchups','countPar3Strokes','enableCrossGroup']){const e=document.getElementById(id);if(e){e.disabled=standalone||count.value==='1';if(standalone&&id==='enableCrossGroup')e.checked=false;}}
 count.disabled=standalone;
}
function board(r,h){
 const result=G().calculate(r),pair=G().pairing(r,h),row=result.rows[h];
 const names=team=>team.map(i=>esc(r.players[i])).join(' + ');
 const pairs=p=>names(p.team1)+' vs '+names(p.team2);
 const holes=G().playOrder(r),position=holes.indexOf(h),next=position<17?G().pairing(r,holes[position+1]):null;
 const total= r.gameMode==='highLowTotal';
 return `<h2>${G().title(r.gameMode)} 點數</h2><p class="small">獨立玩法 · 實際桿數 · 不計 8421／Vegas／個人讓桿</p>
 <div class="grid">${r.players.map((name,i)=>`<div><b>${esc(name)}</b><div class="score">${sign(result.totals[i])}</div><span class="small">${r.scores.reduce((s,row)=>s+(Number.isInteger(row[i])?row[i]:0),0)} 桿 · ${r.scores.filter(row=>Number.isInteger(row[i])).length}/18 洞</span></div>`).join('')}</div>
 <p><b>本洞配對：</b>${pair?pairs(pair):'請先完成之前各洞四人的桿數'}</p>
 ${position<17?`<p><b>下一洞（${holes[position+1]+1}）配對：</b>${next?pairs(next):'本洞完成後顯示'}</p>`:''}
 ${row?`<p>${names(row.team1)}：Low ${sign(row.low)} · High ${sign(row.high)}${total?' · Total '+sign(row.total):''} · 淨獎勵 ${sign(row.bonuses)} = 每人 ${sign(row.points)}<br>${names(row.team2)}：每人 ${sign(-row.points)}</p>`:'<p>完成本洞及之前各洞四人的桿數後計算。</p>'}
 <details><summary>規則與逐洞明細</summary><p>第一個打的洞依開球距離順序 1+4 對 2+3；之後依前洞桿數低到高排序，同桿保留前次順序。Low、High${total?'、Total':''} 各 1 點，平手 0 點。Birdie +1、Eagle +3、Albatross（含更低桿）+5；雙方逐人獎勵相減，隊友獎勵可疊加。</p>
 <div class="scroll"><table><thead><tr><th>洞</th><th>配對</th><th>Low</th><th>High</th>${total?'<th>Total</th>':''}<th>淨獎勵</th><th>第一隊每人</th></tr></thead><tbody>${holes.map(i=>{const v=result.rows[i];return `<tr><td>${i+1}</td><td>${v?pairs(v)+' · '+v.a.join('/')+' vs '+v.b.join('/'):'待完成'}</td><td>${v?sign(v.low):'—'}</td><td>${v?sign(v.high):'—'}</td>${total?'<td>'+(v?sign(v.total):'—')+'</td>':''}<td>${v?sign(v.bonuses):'—'}</td><td>${v?sign(v.points):'—'}</td></tr>`;}).join('')}</tbody></table></div></details>`;
}
function render(){
 const h=roundHole,r=round,title=G().title(r.gameMode),holes=G().playOrder(r),p=holes.indexOf(h);
 document.getElementById('scoreContent').innerHTML=`<div class="card"><h2>${title} · 第 ${h+1} 洞 · Par ${r.course[h].par}</h2><p>${esc(r.courseName)} ${esc(r.combo||'')} · ${esc(r.note||'')}</p><button class="btn2" onclick="FortisHighLowUI.save()">儲存 ${title} 回合</button><button class="btn2" onclick="cancelLiveRound()">取消回合</button></div>
 <section id="highLowBoard" class="card">${board(r,h)}</section><div class="card"><h3>本洞實際桿數</h3>${r.players.map((name,i)=>`<label for="highLowScore${i}">${esc(name)}</label><div style="display:flex;align-items:center;gap:8px"><button class="btn2" style="width:auto" aria-label="${esc(name)} 減一桿" onclick="FortisHighLowUI.adjust(${h},${i},-1)">−</button><input data-high-low-score id="highLowScore${i}" type="number" inputmode="numeric" min="1" max="999" step="1" required value="${r.scores[h][i]}" oninput="FortisHighLowUI.score(${h},${i},this)"><button class="btn2" style="width:auto" aria-label="${esc(name)} 加一桿" onclick="FortisHighLowUI.adjust(${h},${i},1)">＋</button></div>`).join('')}
 <button onclick="FortisHighLowUI.next()">${p===17?'查看完成結果':'確認本洞並前往下一洞'}</button><p class="small">空白不會自動補標準桿；完成四人桿數後再前往下一洞。</p></div><div class="card"><h3>選擇球洞</h3><div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px">${holes.map(i=>`<button class="btn2" style="${i===h?'outline:2px solid #38a169;':''}" onclick="roundHole=${i};saveActiveRound();renderScore()">${i+1}${r.scores[i].every(Number.isInteger)?' ✓':''}</button>`).join('')}</div></div>`;
}
function adjust(h,i,delta){
 if(roundActionPending||!round)return;
 const current=round.scores[h][i];round.scores[h][i]=Math.max(1,Math.min(999,(current===''?round.course[h].par:current)+delta));saveActiveRound();render();
}
function score(h,i,input){
 if(roundActionPending||!round)return;
 const v=input.value===''?'':Number(input.value);
 if(v!==''&&(!Number.isInteger(v)||v<1||v>999)){input.setCustomValidity('請輸入 1–999 的整數桿數');input.reportValidity();return;}
 input.setCustomValidity('');round.scores[h][i]=v;saveActiveRound();document.getElementById('highLowBoard').innerHTML=board(round,roundHole);
}
function inputsValid(){return [...document.querySelectorAll('[data-high-low-score]')].every(e=>e.reportValidity());}
function next(){
 if(roundActionPending||!round)return;
 if(!inputsValid()||!round.scores[roundHole].every(Number.isInteger)){alert('請先完成本洞四位球員的桿數。');return;}
 const holes=G().playOrder(round),p=holes.indexOf(roundHole);
 if(p<17)roundHole=holes[p+1];else alert('本洞已完成；請按儲存回合，保存本玩法的結果。');
 saveActiveRound();render();
}
async function save(){
 if(roundActionPending||!round||!G().isMode(round.gameMode))return;
 roundActionPending=true;const accessGeneration=generation;
 try{
  if(!inputsValid())return;
  G().validate(round);if(round.scores.some(row=>!row.every(Number.isInteger)))throw Error('請完成全部 18 洞四位球員的桿數；未完成回合仍保留在此裝置。');
  if(!currentUser?.id)throw Error('請先登入再儲存。');
  round.standaloneId=round.standaloneId||crypto.randomUUID();saveActiveRound();
  document.querySelectorAll('#scoreContent button,#scoreContent input').forEach(e=>e.disabled=true);
  const snapshot=JSON.parse(JSON.stringify(round)),mode=snapshot.gameMode;
  await sb('golf_high_low_rounds?on_conflict=owner_id,id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({id:snapshot.standaloneId,owner_id:currentUser.id,game_kind:mode,round_data:snapshot})});
  if(accessGeneration!==generation)return;
  clearActiveRound();round=null;showPage('home');
  document.getElementById('highLowHistory').innerHTML=`<div class="card"><h2>${G().title(mode)} 已儲存</h2><p>${esc(snapshot.note)} · ${esc(snapshot.courseName)}</p>${board(snapshot,G().playOrder(snapshot).at(-1))}</div>`;
 }catch(e){alert('儲存失敗，回合仍保留：'+e.message);}finally{roundActionPending=false;document.querySelectorAll('#scoreContent button,#scoreContent input').forEach(e=>e.disabled=false);}
}
async function history(mode){
 if(!G().isMode(mode))return;const accessGeneration=generation;
 try{
  const rows=await loadPaged('golf_high_low_rounds?select=*&game_kind=eq.'+mode+'&order=created_at.desc,id');
  if(accessGeneration!==generation)return;
  document.getElementById('highLowHistory').innerHTML=`<h2>${G().title(mode)} 回合紀錄</h2>`+(rows.map(rec=>`<div class="card"><h3>${esc(rec.round_data.note||G().title(mode))}</h3><p>${esc(rec.round_data.created)} · ${esc(rec.round_data.courseName)} ${esc(rec.round_data.combo||'')}</p>${board(rec.round_data,G().playOrder(rec.round_data).at(-1))}</div>`).join('')||'<p>尚無此玩法的已儲存回合。</p>');
 }catch(e){alert('無法讀取回合紀錄：'+e.message);}
}
root.FortisHighLowUI={setup,board,render,adjust,score,next,save,history,clearMemory};
})(window);
