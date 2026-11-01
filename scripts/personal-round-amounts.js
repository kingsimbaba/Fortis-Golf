/* Personal reference amounts. Separate from every shared scoring/settlement model. */
(function(root){
'use strict';
const FIELDS=[['fortis_amount','地獄倒霉鬼'],['individual_amount','個人恩怨'],['other_amount','其他遊戲']];
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function cents(value){
 const s=String(value??'').trim();if(!s)return null;
 if(!/^[+-]?\d{1,9}(\.\d{1,2})?$/.test(s))throw Error('請輸入正負金額，最多 9 位整數及兩位小數，例如 +1200 或 -500。');
 return Math.round(Number(s)*100);
}
function decimal(n){return n===null?null:(n/100).toFixed(2);}
function total(values){const parts=FIELDS.map(([key])=>cents(values[key]));return parts.every(v=>v===null)?null:parts.reduce((sum,v)=>sum+(v||0),0);}
function money(n){return n===null?'尚未填寫':(n>0?'+':n<0?'−':'')+new Intl.NumberFormat('zh-TW',{minimumFractionDigits:0,maximumFractionDigits:2}).format(Math.abs(n)/100);}
function summary(rec,scores){
 const names=[...new Set([...(Array.isArray(rec.players)?rec.players:[]),...scores.map(s=>s.player_name)].filter(Boolean))];
 return names.map(name=>{
  const holes=new Map();scores.filter(s=>s.player_name===name&&Number.isInteger(+s.hole_number)&&+s.hole_number>=1&&+s.hole_number<=18&&Number.isInteger(+s.gross_score)&&+s.gross_score>0).forEach(s=>holes.set(+s.hole_number,s));
  const rows=[...holes.values()];return {name,holes:rows.length,gross:rows.length?rows.reduce((n,s)=>n+Number(s.gross_score),0):null,birdies:rows.filter(s=>+s.gross_score-Number(s.par)===-1).length,eagles:rows.filter(s=>+s.gross_score-Number(s.par)===-2&&!(+s.par===3&&+s.gross_score===1)).length};
 });
}
function payload(userId,roundId,player,values){
 if(!userId||!/^\d+$/.test(String(roundId)))throw Error('請先登入並選擇已儲存的回合。');
 const out={user_id:userId,round_id:String(roundId),player_name:player||null};
 FIELDS.forEach(([key])=>out[key]=decimal(cents(values[key])));return out;
}
let active=null,sequence=0;
function clearMemory(){sequence++;active?.element.remove();active=null;}
function close(){if(active?.saving)return;if(active?.dirty&&!root.confirm('個人收支尚未儲存，確定關閉？'))return;clearMemory();}
async function open(roundId,context){
 if(active){if(active.saving)return;if(active.dirty&&!root.confirm('個人收支尚未儲存，確定離開？'))return;}
 clearMemory();const seq=sequence,userId=context.getUserId();if(!userId){root.alert('請先登入');return;}
 const element=document.createElement('div');element.id='personalRoundAmounts';element.className='achievement-overlay';
 element.innerHTML='<section class="achievement-panel personal-amount-panel" role="dialog" aria-modal="true" aria-labelledby="personalAmountsTitle"><h2 id="personalAmountsTitle">個人收支</h2><p role="status">正在讀取回合與私人紀錄…</p><button type="button" data-close>關閉</button></section>';
 active={element,dirty:false,saving:false};document.body.appendChild(element);element.querySelector('[data-close]').onclick=close;
 const stillCurrent=()=>active?.element===element&&sequence===seq&&context.getUserId()===userId;
 try{
  const [rec,scores,notes]=await Promise.all([context.getRound(roundId),context.getScores(roundId),context.api(`golf_personal_round_amounts?user_id=eq.${encodeURIComponent(userId)}&round_id=eq.${roundId}&select=*`)]);
  if(!stillCurrent()){if(active?.element===element)clearMemory();return;}
  const saved=notes[0]||{},rows=summary(rec,scores),defaultName=String(context.playerName||'').toLowerCase();
  const chosen=saved.player_name||rows.find(r=>r.name.toLowerCase()===defaultName)?.name||'';
  element.innerHTML=`<section class="achievement-panel personal-amount-panel" role="dialog" aria-modal="true" aria-labelledby="personalAmountsTitle"><div class="personal-amount-heading"><h2 id="personalAmountsTitle">個人收支</h2><button type="button" class="btn2" data-close>關閉</button></div><p><b>${escape(rec.round_name||rec.course_name||'本回合')}</b><br><span class="small">${escape((rec.played_at||'').slice(0,10))} · ${escape([rec.course_name,rec.course_combo].filter(Boolean).join(' '))}</span></p><p class="small">僅自己可查看及修改；正數為贏、負數為輸。金額自行輸入，不會改動比賽計分。</p><div class="scroll"><table><thead><tr><th>球員</th><th>博蒂</th><th>老鷹</th><th>桿數</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${escape(r.name)}</td><td>${r.birdies}</td><td>${r.eagles}</td><td>${r.gross??'—'} <span class="small">${r.holes}/18 洞</span></td></tr>`).join('')}</tbody></table></div><form><label>我的球員名稱<select name="player_name"><option value="">請選擇自己的名字</option>${rows.map(r=>`<option value="${escape(r.name)}"${r.name===chosen?' selected':''}>${escape(r.name)}</option>`).join('')}</select></label><p class="small" data-my-score></p>${FIELDS.map(([key,label])=>`<label>${label}金額<input type="text" inputmode="decimal" name="${key}" autocomplete="off" placeholder="例如 +1200 或 -500" value="${escape(saved[key]??'')}"></label>`).join('')}<div class="personal-amount-total"><span>總贏／輸金額</span><output aria-live="polite" data-total></output></div><p class="small" data-status role="status">${notes.length?'已載入儲存紀錄':'尚未儲存，空白表示未填。'}</p><p class="bad" data-error role="alert"></p><button type="submit">儲存個人收支</button></form></section>`;
  const form=element.querySelector('form'),status=element.querySelector('[data-status]'),error=element.querySelector('[data-error]'),output=element.querySelector('[data-total]');
  const values=()=>Object.fromEntries(FIELDS.map(([key])=>[key,form.elements.namedItem(key).value]));
  const refresh=()=>{try{const sum=total(values());output.textContent=money(sum);output.className=sum<0?'bad':sum>0?'ok':'';error.textContent='';}catch(e){output.textContent='請檢查金額';error.textContent=e.message;}const me=rows.find(r=>r.name===form.elements.namedItem('player_name').value);element.querySelector('[data-my-score]').textContent=me?`我的成績：${me.gross??'—'} 桿 · ${me.birdies} 博蒂 · ${me.eagles} 老鷹（${me.holes}/18 洞）`:'';};
  element.querySelector('[data-close]').onclick=close;
  form.oninput=()=>{active.dirty=true;status.textContent='尚有未儲存的修改';refresh();};
  form.onsubmit=async event=>{
   event.preventDefault();if(!stillCurrent()||active.saving)return;
   try{
    const player=form.elements.namedItem('player_name').value;
    if(!rows.some(r=>r.name===player))throw Error('請先選擇自己的球員名稱。');
    const body=payload(userId,roundId,player,values());active.saving=true;Array.from(form.elements).forEach(e=>e.disabled=true);status.textContent='儲存中…';error.textContent='';
    const result=await context.api('golf_personal_round_amounts?on_conflict=user_id,round_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(body)});
    if(!stillCurrent())return;if(!result?.length)throw Error('未能確認儲存，請重試。');
    active.dirty=false;status.textContent='已儲存，可隨時從回合紀錄重新開啟。';
   }catch(e){if(stillCurrent()){error.textContent=e.message?.startsWith('請')||e.message?.startsWith('未能')?e.message:'儲存失敗，請檢查連線後重試；輸入內容仍保留。';status.textContent='尚未儲存';}}
   finally{if(stillCurrent()){active.saving=false;Array.from(form.elements).forEach(e=>e.disabled=false);}}
  };
  refresh();form.elements.namedItem(chosen?'fortis_amount':'player_name').focus();
 }catch(e){if(stillCurrent()){element.querySelector('[role="status"]').textContent='無法讀取個人收支，請檢查連線並關閉後重試。';}}
}
const api={cents,decimal,total,money,summary,payload,open,close,clearMemory};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.FortisPersonalAmounts=api;
})(typeof window!=='undefined'?window:globalThis);
