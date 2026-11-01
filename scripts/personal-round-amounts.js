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
function greenFee(value){const n=cents(value);if(n!==null&&n<0)throw Error('請輸入零或正數的果嶺費。');return n;}
function netCost(values){const fee=greenFee(values.green_fee),game=total(values);return fee===null||game===null?null:fee-game;}
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
 FIELDS.forEach(([key])=>out[key]=decimal(cents(values[key])));out.green_fee=decimal(greenFee(values.green_fee));return out;
}
let active=null,sequence=0;const summaries=new Set();
function clearMemory(){sequence++;active?.element.remove();active=null;for(const el of summaries)el.replaceChildren();summaries.clear();}
function close(){if(active?.saving)return;if(active?.dirty&&!root.confirm('個人收支尚未儲存，確定關閉？'))return;sequence++;active?.element.remove();active=null;}
async function open(roundId,context){
 if(active){if(active.saving)return;if(active.dirty&&!root.confirm('個人收支尚未儲存，確定離開？'))return;}
 sequence++;active?.element.remove();active=null;const seq=sequence,userId=context.getUserId();if(!userId){root.alert('請先登入');return;}
 const element=document.createElement('div');element.id='personalRoundAmounts';element.className='achievement-overlay';
 element.innerHTML='<section class="achievement-panel personal-amount-panel" role="dialog" aria-modal="true" aria-labelledby="personalAmountsTitle"><h2 id="personalAmountsTitle">個人收支</h2><p role="status">正在讀取回合與私人紀錄…</p><button type="button" data-close>關閉</button></section>';
 active={element,dirty:false,saving:false};document.body.appendChild(element);element.querySelector('[data-close]').onclick=close;
 const stillCurrent=()=>active?.element===element&&sequence===seq&&context.getUserId()===userId;
 try{
  const [rec,scores,notes]=await Promise.all([context.getRound(roundId),context.getScores(roundId),context.api(`golf_personal_round_amounts?user_id=eq.${encodeURIComponent(userId)}&round_id=eq.${roundId}&select=*`)]);
  if(!stillCurrent()){if(active?.element===element)clearMemory();return;}
  const saved=notes[0]||{},rows=summary(rec,scores),defaultName=String(context.playerName||'').toLowerCase();
  const chosen=saved.player_name||rows.find(r=>r.name.toLowerCase()===defaultName)?.name||'';
  element.innerHTML=`<section class="achievement-panel personal-amount-panel" role="dialog" aria-modal="true" aria-labelledby="personalAmountsTitle"><div class="personal-amount-heading"><h2 id="personalAmountsTitle">個人收支</h2><button type="button" class="btn2" data-close>關閉</button></div><p><b>${escape(rec.round_name||rec.course_name||'本回合')}</b><br><span class="small">${escape((rec.played_at||'').slice(0,10))} · ${escape([rec.course_name,rec.course_combo].filter(Boolean).join(' '))}</span></p><p class="small">僅自己可查看及修改；正數為贏、負數為輸。金額自行輸入，不會改動比賽計分。</p><div class="scroll"><table><thead><tr><th>球員</th><th>博蒂</th><th>老鷹</th><th>桿數</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${escape(r.name)}</td><td>${r.birdies}</td><td>${r.eagles}</td><td>${r.gross??'—'} <span class="small">${r.holes}/18 洞</span></td></tr>`).join('')}</tbody></table></div><form><label>我的球員名稱<select name="player_name"><option value="">請選擇自己的名字</option>${rows.map(r=>`<option value="${escape(r.name)}"${r.name===chosen?' selected':''}>${escape(r.name)}</option>`).join('')}</select></label><p class="small" data-my-score></p><label>果嶺費（Green fee）<input type="text" inputmode="decimal" name="green_fee" autocomplete="off" placeholder="例如 3000，免費請填 0" value="${escape(saved.green_fee??'')}"></label>${FIELDS.map(([key,label])=>`<label>${label}金額<input type="text" inputmode="text" name="${key}" autocomplete="off" placeholder="例如 +1200 或 -500" value="${escape(saved[key]??'')}"></label>`).join('')}<div class="personal-amount-total"><span>總贏／輸金額</span><output aria-live="polite" data-total></output></div><div class="personal-amount-total"><span>本場淨成本</span><output aria-live="polite" data-net-cost></output></div><p class="small">淨成本＝果嶺費－遊戲淨輸贏；負數表示本場淨賺。沒有遊戲輸贏請填 0；空白不計入相應平均。</p><p class="small" data-status role="status">${notes.length?'已載入儲存紀錄':'尚未儲存，空白表示未填。'}</p><p class="bad" data-error role="alert"></p><button type="submit">儲存個人收支</button></form></section>`;
  const form=element.querySelector('form'),status=element.querySelector('[data-status]'),error=element.querySelector('[data-error]'),output=element.querySelector('[data-total]');
  const values=()=>Object.fromEntries([...FIELDS.map(([key])=>key),'green_fee'].map(key=>[key,form.elements.namedItem(key).value]));
  const refresh=()=>{try{const sum=total(values());output.textContent=money(sum);output.className=sum<0?'bad':sum>0?'ok':'';const cost=netCost(values());const net=element.querySelector('[data-net-cost]');net.textContent=cost===null?'請填果嶺費及遊戲金額':money(cost).replace(/^\+/,'');net.className=cost<0?'ok':'';error.textContent='';}catch(e){output.textContent='請檢查金額';element.querySelector('[data-net-cost]').textContent='—';error.textContent=e.message;}const me=rows.find(r=>r.name===form.elements.namedItem('player_name').value);element.querySelector('[data-my-score]').textContent=me?`我的成績：${me.gross??'—'} 桿 · ${me.birdies} 博蒂 · ${me.eagles} 老鷹（${me.holes}/18 洞）`:'';};
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
    active.dirty=false;status.textContent='已儲存，可隨時從回合紀錄重新開啟。';try{context.onSaved?.();}catch{}
   }catch(e){if(stillCurrent()){error.textContent=e.message?.startsWith('請')||e.message?.startsWith('未能')?e.message:'儲存失敗，請檢查連線後重試；輸入內容仍保留。';status.textContent='尚未儲存';}}
   finally{if(stillCurrent()){active.saving=false;Array.from(form.elements).forEach(e=>e.disabled=false);}}
  };
  refresh();form.elements.namedItem(chosen?'fortis_amount':'player_name').focus();
 }catch(e){if(stillCurrent()){element.querySelector('[role="status"]').textContent='無法讀取個人收支，請檢查連線並關閉後重試。';}}
}
function summaryHtml(stats,{title='我的打球成本',scope='全部歷史 · 僅自己可見',showRules=true}={}){
 const format=(value,signed=false)=>value==null?'—':money(Math.round(Number(value)*100)).replace(signed?/^$/:/^\+/,'');
 const lines=[['果嶺費','fee',false,stats.fee_count],['遊戲贏款','winnings',true,stats.game_count],['遊戲輸款','losses',true,stats.game_count],['遊戲淨輸贏','game',true,stats.game_count],['球局淨成本','cost',false,stats.cost_count]];
 if('fixed_total' in stats)lines.push(['固定費用（已認列）','fixed',false,stats.cost_count],['含已填固定費總成本','combined',false,stats.cost_count]);
 return `<div class="fg-section-heading"><h2>${escape(title)}</h2><span class="small">${escape(scope)}</span></div><div class="scroll"><table><thead><tr><th>項目</th><th>累計金額</th><th>每場平均</th><th>已填場數</th></tr></thead><tbody>${lines.map(([label,key,signed,count])=>`<tr><td>${label}</td><td>${format(stats[key+'_total'],signed)}</td><td>${format(stats[key+'_average'],signed)}</td><td>${Number(count)||0}</td></tr>`).join('')}</tbody></table></div>${showRules?`<p class="small">淨成本＝果嶺費－遊戲淨輸贏，負數表示淨賺。遊戲贏／輸款依每場淨結果分組，平均以已填遊戲金額的場數計算。淨成本平均只計果嶺費及遊戲金額皆已填的場次；空白不當作 0。</p><p class="small">從「回合紀錄 → 個人收支」補填果嶺費與輸贏，儲存後自動更新。</p>`:''}`;
}
const mounts=new WeakMap();
async function mountSummary(element,context){
 if(!element)return;const userId=context.getUserId();if(!userId){element.replaceChildren();return;}
 const token={};mounts.set(element,token);summaries.add(element);element.innerHTML='<h2>我的打球成本</h2><p role="status">正在讀取全部歷史收支…</p>';
 try{
  const stats=await context.api('rpc/golf_personal_cost_summary',{method:'POST',body:'{}'});
  if(mounts.get(element)!==token||context.getUserId()!==userId||!summaries.has(element))return;
  element.innerHTML=summaryHtml(stats);summaries.forEach(el=>{if(!el.isConnected)summaries.delete(el);});
 }catch{if(mounts.get(element)===token&&context.getUserId()===userId&&summaries.has(element))element.innerHTML='<h2>我的打球成本</h2><p role="alert">暫時無法讀取完整收支，請重新整理；未顯示不完整的平均。</p>';}
}
const ANNUAL_FIELDS=[['membership_fee','會員費（Membership fee）'],['insurance_fee','高爾夫保險（Golf insurance）'],['other_fixed_costs','其他固定費用']];
function annualPayload(userId,year,values){
 if(!userId)throw Error('請先登入');
 if(!/^\d{4}$/.test(String(year))||Number(year)<1900||Number(year)>2199)throw Error('請輸入 1900–2199 年份。');
 const out={user_id:userId,year:Number(year)};
 for(const [key] of ANNUAL_FIELDS){const n=cents(values[key]);if(n!==null&&n<0)throw Error('固定費用請填零或正數。');out[key]=decimal(n);}return out;
}
function annualTotal(values){const parts=ANNUAL_FIELDS.map(([key])=>cents(values[key]));if(parts.some(n=>n!==null&&n<0))throw Error('固定費用請填零或正數。');return parts.every(n=>n===null)?null:parts.reduce((sum,n)=>sum+(n||0),0);}
function membershipPeriod(year,month,day){
 const start=new Date(Date.UTC(Number(year),Number(month)-1,Number(day))),end=new Date(Date.UTC(Number(year)+1,Number(month)-1,Number(day)));
 end.setUTCDate(end.getUTCDate()-1);return {start:start.toISOString().slice(0,10),end:end.toISOString().slice(0,10)};
}
function membershipNoticeHtml(report){
 if(!report.membership_prorated)return '';
 const month=Number(report.membership_renewal_month),day=Number(report.membership_renewal_day);
 const missing=report.all_time?.missing_membership_cycles||[];
 return `<section class="card small"><b>會員費按日認列</b><p>每期自 ${month} 月 ${day} 日起，至次年同日前一天。請在期初年份填寫完整會員費，系統按實際 365／366 天計算，截至報表日期且不早於成本起算日。</p>${missing.length?`<p role="status">尚缺涵蓋期間的會員費，含固定費每場平均暫不顯示。請補填，沒有支出請填 0：</p><div class="membership-missing">${missing.map(c=>`<button type="button" class="btn2" data-annual-year="${escape(c.year)}">${escape(c.start)}～${escape(c.end)}</button>`).join('')}</div>`:''}</section>`;
}
function annualYearsHtml(report){
 const trackingYear=Number(String(report.tracking_start_date||'1900').slice(0,4)),entryYear=Math.max(Number(report.year),trackingYear);
 const years=Array.isArray(report.annual_years)&&report.annual_years.length?report.annual_years:[{year:report.year}];
 const fmt=value=>value==null?'未填':money(Math.round(Number(value)*100)).replace(/^\+/,'');
 return `<section class="card"><h2>年度固定費用</h2><p class="small">點選年份填寫會員費、保險及其他固定費用。不會重複加入每場球局；會員費依涵蓋期間認列。</p><div class="annual-cost-years">${years.map(row=>`<button type="button" class="btn2 annual-cost-year" data-annual-year="${escape(row.year)}"><b>${escape(row.year)} 年</b><span>會員費 ${fmt(row.membership_fee)} · 保險 ${fmt(row.insurance_fee)}</span>${report.membership_prorated?`<span class="small">會員期間 ${escape(row.membership_period_start)}～${escape(row.membership_period_end)}</span>`:''}<span>${report.membership_prorated?'已填費用合計':'固定費合計'} ${fmt(row.fixed_total)}</span>${report.membership_prorated?`<span>該曆年已認列固定費 ${row.recognized_fixed_total==null?'—':fmt(row.recognized_fixed_total)}</span>`:''}<span class="small">含已填固定費平均 ${fmt(row.combined_average)}／場 · 完整收支 ${Number(row.cost_count)||0} 場${row.membership_complete===false?' · 會員費待補，平均暫不顯示':''}${Number(row.year)<trackingYear?(row.membership_crosses_tracking_start?' · 會員跨年部分按涵蓋日期計入':' · 不計生涯成本'):Number(row.year)>Number(report.year)?' · 未來年度':''}</span><span>填寫／修改 →</span></button>`).join('')}</div><form class="annual-cost-add"><label>其他年份<input type="number" name="annual_year" aria-label="其他年份" min="1900" max="2199" step="1" value="${entryYear}" required></label><button class="btn2" type="submit">開啟年份</button></form><p class="small">今年及生涯總成本只計起算日後的費用。跨年會員費依實際涵蓋天數分攤，未來涵蓋天數暫不認列。平均以已填完整球局收支的場數計算；零場時不顯示平均。</p></section>`;
}
async function openAnnual(year,context){
 if(active){if(active.saving)return;if(active.dirty&&!root.confirm('收支尚未儲存，確定離開？'))return;}
 const userId=context.getUserId();try{annualPayload(userId,year,{});}catch(e){root.alert(e.message);return;}
 sequence++;active?.element.remove();active=null;const seq=sequence;
 const element=document.createElement('div');element.id='personalAnnualCosts';element.className='achievement-overlay';
 element.innerHTML=`<section class="achievement-panel personal-amount-panel" role="dialog" aria-modal="true" aria-labelledby="annualCostsTitle"><h2 id="annualCostsTitle">${Number(year)} 年固定費用</h2><p role="status">正在讀取…</p><button type="button" data-close>關閉</button></section>`;
 active={element,dirty:false,saving:false};document.body.appendChild(element);element.querySelector('[data-close]').onclick=close;
 const valid=()=>active?.element===element&&sequence===seq&&context.getUserId()===userId;
 try{
  const rows=await context.api(`golf_personal_annual_costs?user_id=eq.${encodeURIComponent(userId)}&year=eq.${Number(year)}&select=*`);if(!valid())return;
  const saved=rows[0]||{},period=context.membershipProrated?membershipPeriod(year,context.renewalMonth,context.renewalDay):null;
  element.querySelector('section').innerHTML=`<div class="personal-amount-heading"><h2 id="annualCostsTitle">${Number(year)} 年固定費用</h2><button type="button" class="btn2" data-close>關閉</button></div><p class="small">僅自己可見。${period?`會員費請填 ${period.start}～${period.end} 的整期金額，系統自動按日認列；保險及其他費用仍屬 ${Number(year)} 曆年。`:'填寫該年度總額，無須按月份攤分。'}不會自動複製到其他年份。沒有支出請填 0；空白表示未填。</p><form>${ANNUAL_FIELDS.map(([key,label])=>`<label>${label}<input type="text" inputmode="decimal" name="${key}" autocomplete="off" placeholder="請輸入金額" value="${escape(saved[key]??'')}"></label>`).join('')}<div class="personal-amount-total"><span>已填費用合計</span><output data-total aria-live="polite"></output></div><p class="small" data-status role="status">${rows.length?'已載入儲存紀錄':'尚未儲存'}</p><p class="bad" data-error role="alert"></p><button type="submit">儲存 ${Number(year)} 年固定費用</button></form>`;
  element.querySelector('[data-close]').onclick=close;
  const form=element.querySelector('form'),status=element.querySelector('[data-status]'),error=element.querySelector('[data-error]');
  const values=()=>Object.fromEntries(ANNUAL_FIELDS.map(([key])=>[key,form.elements.namedItem(key).value]));
  const refresh=()=>{try{const sum=annualTotal(values());element.querySelector('[data-total]').textContent=money(sum).replace(/^\+/,'');error.textContent='';}catch(e){element.querySelector('[data-total]').textContent='請檢查金額';error.textContent=e.message;}};
  form.oninput=()=>{if(!valid())return;active.dirty=true;status.textContent='尚有未儲存的修改';refresh();};
  form.onsubmit=async event=>{
   event.preventDefault();if(!valid()||active.saving)return;
   try{
    const body=annualPayload(userId,year,values());active.saving=true;Array.from(form.elements).forEach(e=>e.disabled=true);error.textContent='';status.textContent='儲存中…';
    const result=await context.api('golf_personal_annual_costs?on_conflict=user_id,year',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(body)});
    if(!valid())return;if(!result?.length)throw Error('未能確認儲存，請重試。');
    active.dirty=false;status.textContent='已儲存，年度與歷史成本已更新。';try{context.onSaved?.();}catch{}
   }catch(e){if(valid()){error.textContent=e.message?.startsWith('請')||e.message?.startsWith('固定')||e.message?.startsWith('未能')?e.message:'儲存失敗，輸入內容仍保留，請稍後重試。';status.textContent='尚未儲存';}}
   finally{if(valid()){active.saving=false;Array.from(form.elements).forEach(e=>e.disabled=false);}}
  };
  refresh();form.elements.namedItem('membership_fee').focus();
 }catch{if(valid())element.querySelector('[role="status"]').textContent='無法讀取年度固定費用，請關閉後重試。';}
}

function reportHtml(report){
 const amount=(value,signed=false)=>value==null?'—':money(Math.round(Number(value)*100)).replace(signed?/^$/:/^\+/,'');
 const recent=Array.isArray(report.recent)?report.recent:[];
 const trackingDate=report.tracking_start_date,trackingYear=Number(String(trackingDate||'1900').slice(0,4)),configured=trackingYear>1900;
 return `<div class="personal-report-heading"><h1>打球收支</h1><p class="small">僅自己可見 · 截至 ${escape(report.as_of)}（台北時間）</p>${configured?`<p class="personal-cost-start">成本統計自 ${escape(trackingDate)} 起。較早球局不計生涯成本；跨越起算日的會員期，只認列起算日後的涵蓋天數。</p>`:''}</div>${membershipNoticeHtml(report)}${annualYearsHtml(report)}<section class="card"><h2>最近五場</h2><p class="small">依打球日期排序，包含尚未填寫收支的回合。此處為球局成本，年度固定費另計於年度及歷史總成本。</p>${recent.length?`<div class="scroll"><table class="personal-recent-costs"><thead><tr><th>日期／球局</th><th>果嶺費</th><th>遊戲淨輸贏</th><th>淨成本</th><th></th></tr></thead><tbody>${recent.map(r=>`<tr><td>${escape(r.date||'日期未填')}<br><b>${escape(r.title)}</b>${r.included_in_career===false?'<br><span class="small">不計生涯成本</span>':''}<br><span class="small">${escape(r.course)}</span></td><td data-label="果嶺費">${amount(r.green_fee)}</td><td data-label="遊戲淨輸贏">${amount(r.game_total,true)}</td><td data-label="淨成本">${amount(r.net_cost)}</td><td><button class="btn2" data-edit-round="${escape(r.round_id)}">填寫／修改</button></td></tr>`).join('')}</tbody></table></div><p class="small">最近五場中符合起算日期且已填完整 ${Number(report.recent_cost_count)||0} 場 · 淨成本合計 ${amount(report.recent_cost_total)} · 每場平均 ${amount(report.recent_cost_average)}</p>`:'<p class="small">尚無對應到你的已儲存回合。請先在個人收支選擇自己的球員名稱，或確認帳號顯示名稱與球員名稱相符。</p>'}</section><div class="personal-report-grid"><section class="card">${summaryHtml(report.ytd,{title:`今年至今（${report.year}）`,scope:'依打球日期 · 台北時間',showRules:false})}</section><section class="card">${summaryHtml(report.all_time,{title:configured?`生涯成本（${trackingYear} 起）`:'全部歷史',scope:configured?'自起算日期計算':'所有已填收支紀錄',showRules:false})}</section></div><section class="card small">淨成本＝果嶺費－遊戲淨輸贏；負數表示淨賺。果嶺費、遊戲及淨成本各依已填場數計算平均，空白不當作 0。遊戲贏／輸款依每場淨結果分組，平均使用已填遊戲金額的場數。</section>`;
}
async function mountReport(element,context){
 if(!element)return;const userId=context.getUserId();if(!userId){element.replaceChildren();return;}
 const token={};mounts.set(element,token);summaries.add(element);element.innerHTML='<h1>打球收支</h1><p role="status">正在整理最近五場、今年及全部歷史收支…</p>';
 const valid=()=>mounts.get(element)===token&&context.getUserId()===userId&&summaries.has(element);
 try{
  const report=await context.api('rpc/golf_personal_annual_cost_report',{method:'POST',body:'{}'});
  if(!valid())return;element.innerHTML=reportHtml(report);
  element.querySelectorAll('[data-edit-round]').forEach(button=>{button.onclick=()=>{if(valid()&&/^\d+$/.test(button.dataset.editRound))context.onEdit?.(button.dataset.editRound);};});
  const editAnnual=year=>openAnnual(year,{getUserId:context.getUserId,api:context.api,membershipProrated:report.membership_prorated,renewalMonth:report.membership_renewal_month,renewalDay:report.membership_renewal_day,onSaved:()=>{if(context.getUserId()===userId&&element.isConnected&&summaries.has(element))void mountReport(element,context);}});
  element.querySelectorAll('[data-annual-year]').forEach(button=>{button.onclick=()=>{if(valid())editAnnual(button.dataset.annualYear);};});
  const addYear=element.querySelector('.annual-cost-add');if(addYear)addYear.onsubmit=event=>{event.preventDefault();if(valid())editAnnual(addYear.elements.namedItem('annual_year').value);};
  summaries.forEach(el=>{if(!el.isConnected)summaries.delete(el);});
 }catch{if(valid())element.innerHTML='<h1>打球收支</h1><p role="alert">暫時無法讀取完整收支，請重新整理；未顯示不完整的平均。</p>';}
}
const api={cents,decimal,total,greenFee,netCost,money,summary,summaryHtml,annualPayload,annualTotal,annualYearsHtml,membershipPeriod,membershipNoticeHtml,openAnnual,reportHtml,mountReport,mountSummary,payload,open,close,clearMemory};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.FortisPersonalAmounts=api;
})(typeof window!=='undefined'?window:globalThis);
