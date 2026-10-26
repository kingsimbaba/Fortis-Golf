/* Admin-managed post-round event workflow. Scoring UI and calculators are not modified. */
(function(root){
'use strict';
const S={event:null,day:null,source:null,pendingSave:false,busy:false,dirty:false,player:0,viewDay:0,public:false,token:null,timer:null};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const admin=()=>typeof currentProfile!=='undefined'&&currentProfile?.role==='admin';
const el=id=>document.getElementById(id);
const button=(action,label,value='',secondary=true)=>`<button type="button" class="${secondary?'btn2':''}" data-peoria-action="${action}" data-value="${esc(value)}">${label}</button>`;
const status=text=>{if(el('peoriaStatus'))el('peoriaStatus').textContent=text;};
function message(error){try{return JSON.parse(error.message).message||'操作失敗，請稍後再試。';}catch{return error.message||'操作失敗，請稍後再試。';}}
async function rpc(name,data){return sb('rpc/'+name,{method:'POST',body:JSON.stringify(data)});}
async function command(action,payload={},id=S.event?.id){return rpc('peoria_command',{action,event_id:id||null,payload});}
function localKey(suffix){return 'fortisPeoria:'+currentUser.id+':'+suffix;}
function closeModal(){el('peoriaDialog')?.remove();}
function modal(body){closeModal();const d=document.createElement('dialog');d.id='peoriaDialog';d.className='peoria-dialog';d.innerHTML=body;document.body.appendChild(d);d.showModal();return d;}
function clearTimer(){if(S.timer)clearInterval(S.timer);S.timer=null;}
function page(body){closeModal();showPage('peoriaPage');el('peoriaContent').innerHTML=body;}
function header(title){return `<div class="card peoria-section-header"><h2>${esc(title)}</h2>${button('list','← 賽事成績')}</div><div id="peoriaStatus" class="peoria-status" role="status"></div>`;}
async function run(fn){if(S.busy)return;S.busy=true;try{await fn();}catch(e){alert(message(e));}finally{S.busy=false;}}
function rememberSource(source){S.source=source;try{localStorage.setItem(localKey('source'),JSON.stringify(source));}catch{}}
function restoreSource(){if(!S.source&&typeof currentUser!=='undefined'&&currentUser){try{S.source=JSON.parse(localStorage.getItem(localKey('source'))||'null');}catch{}}return S.source;}
function draftKey(){return localKey('draft:'+S.event.id+':'+S.day.day_no);}
function stash(){S.dirty=true;try{localStorage.setItem(draftKey(),JSON.stringify({revision:S.event.revision,day:S.day}));}catch{}status('有尚未儲存的修改（已暫存在此裝置）');}
function afterSave(round,id){
 if(!admin())return false;
 try{rememberSource(FortisPeoria.sourceRound(round,id));}catch(e){if(S.pendingSave){S.pendingSave=false;alert(message(e));}return false;}
 if(!S.pendingSave)return false;S.pendingSave=false;void openSetup().catch(e=>alert(message(e)));return true;
}
function saveChoice(){
 modal(`<h2>儲存回合</h2><p>本組成績會照常儲存到個人統計。</p><div class="peoria-actions">${button('normal-save','儲存回合')}${button('ranking-save','儲存並建立新新貝利亞賽事','',false)}</div>${button('close','返回計分')}`);
}
async function saveForRanking(){
 if(!admin())throw Error('僅管理員可建立賽事。');
 FortisPeoria.sourceRound(round,String(round.id)); // Reject incomplete cards before the ordinary save can substitute par.
 closeModal();S.pendingSave=true;try{await saveRound();}finally{S.pendingSave=false;}
}
async function openSetup(){
 if(!admin())throw Error('僅管理員可建立賽事。');restoreSource();if(!S.source){selectInitialSource();return;}
 const events=await command('list',{},null);
 modal(`<h2>建立新新貝利亞賽事</h2><p class="peoria-message">本組回合已正常儲存，不會重複儲存或重複計入統計。<br>${esc(S.source.course_label)} · ${esc(S.source.played_on)}</p>${button('change-source','更換本組已儲存回合')}<form data-peoria-form="setup"><label>賽事名稱</label><input id="peoriaName" required maxlength="120" placeholder="例如：2026 福岡三日高爾夫賽"><label>賽事天數</label><input id="peoriaDays" required type="number" min="1" max="14" step="1" value="3"><div class="peoria-actions"><button type="submit">下一步：參賽人數</button>${button('close','稍後設定')}</div></form>${events.length?`<hr><h3>或加入既有賽事</h3><label>賽事名稱</label><select id="peoriaExisting">${events.map(e=>`<option value="${esc(e.id)}">${esc(e.name)} · ${e.published_days}/${e.day_count} 天已公布</option>`).join('')}</select>${button('existing','選擇賽事並帶入本組回合')}`:''}`);
}
function selectInitialSource(){
 if(!db.rounds.length)throw Error('請先正常儲存完整的 18 洞回合。');
 modal(`<h2>選擇本組已儲存回合</h2><select id="peoriaInitialSource">${db.rounds.map(r=>`<option value="${esc(r.id)}">${esc(r.round_name||r.course_name)} · ${esc(String(r.played_at).slice(0,10))}</option>`).join('')}</select><div class="peoria-actions">${button('initial-source','使用此回合建立賽事','',false)}${button('close','取消')}</div>`);
}
function rosterSetup(){
 const name=el('peoriaName').value.trim(),days=Number(el('peoriaDays').value);if(!name||name.length>120||!Number.isInteger(days)||days<1||days>14)throw Error('請填寫賽事名稱及 1–14 天的整數天數。');
 S.setup={name,days,requestId:crypto.randomUUID()};
 modal(`<h2>${esc(name)}</h2><p>共 ${days} 天。本組 ${S.source.players.length} 位球員已帶入。</p><form data-peoria-form="roster"><label>參賽總人數（包含本組）</label><input id="peoriaCount" type="number" min="${S.source.players.length}" max="100" step="1" value="${Math.max(8,S.source.players.length)}" required><div id="peoriaRosterInputs"></div><div class="peoria-actions"><button type="submit">建立草稿並補登桿數</button>${button('close','稍後設定')}</div></form>`);renderRosterInputs();
}
function renderRosterInputs(){
 const count=Number(el('peoriaCount').value),saved=Array.from(el('peoriaRosterInputs').querySelectorAll('input')).map(i=>i.value);
 if(!Number.isInteger(count)||count<S.source.players.length||count>100){el('peoriaRosterInputs').innerHTML='<p>請填寫有效人數。</p>';return;}
 el('peoriaRosterInputs').innerHTML=Array.from({length:count},(_,i)=>`<label>球員 ${i+1}${i<S.source.players.length?'（本組）':''}</label><input data-roster-name required maxlength="80" ${i<S.source.players.length?'readonly':''} value="${esc(S.source.players[i]||saved[i]||'')}">`).join('');
}
async function createEvent(){
 const roster=Array.from(el('peoriaRosterInputs').querySelectorAll('input')).map(i=>({id:i.dataset.playerId||(i.dataset.playerId=crypto.randomUUID()),name:i.value.trim()}));
 const count=Number(el('peoriaCount').value);if(roster.length!==count||count<S.source.players.length)throw Error('請確認參賽總人數。');FortisPeoria.validateRoster(roster);
 S.event=await command('create',{name:S.setup.name,day_count:S.setup.days,roster},S.setup.requestId);S.public=false;await openDay(1,S.source);
}
async function openList(){
 clearTimer();S.dirty=false;S.public=false;S.event=null;
 page(header('賽事成績')+`<div class="card"><label>搜尋賽事名稱</label><input id="peoriaSearch" type="search" placeholder="輸入賽事名稱"><div class="peoria-actions">${button('search','搜尋')}${admin()?button('setup','從已儲存回合建立賽事'):''}</div><div id="peoriaEventList">載入中…</div></div>`);await searchList();
}
async function searchList(){
 const search=el('peoriaSearch').value.trim(),published=await rpc('peoria_published_events',{search});
 const owned=admin()?await command('list',{},null):[];
 const ownFiltered=owned.filter(e=>e.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));const tokens=new Set(owned.map(e=>e.share_token));
 const rows=[...ownFiltered.map(e=>({...e,owned:true})),...published.filter(e=>!tokens.has(e.share_token))];
 el('peoriaEventList').innerHTML=rows.map(e=>`<div class="peoria-event-row"><b>${esc(e.name)}</b><p class="small">${esc(String(e.created_at).slice(0,10))} · ${e.published_days}/${e.day_count} 天已公布${e.owned?' · 我的賽事':''}</p>${button(e.owned?'event':'public','查看成績'+(e.owned?'／管理':''),e.owned?e.id:e.share_token)}</div>`).join('')||'<p>尚無符合的賽事。</p>';
}
async function openEvent(id){clearTimer();S.event=await command('get',{},id);S.public=false;S.dirty=false;S.viewDay=0;renderBoard();}
async function openPublic(token,deepLink=false){
 if(!/^[0-9a-f-]{36}$/i.test(token))throw Error('成績連結格式錯誤。');clearTimer();
 const event=await rpc('peoria_public_event',{token});if(!event){page(header('賽事成績')+'<div class="card">這場賽事尚未公布成績，或連結無效。</div>');return;}
 S.event=event;S.public=true;S.token=token;S.viewDay=0;
 if(deepLink){document.querySelector('.nav').classList.add('hidden');el('userBar').textContent='新新貝利亞賽事成績';}
 renderBoard();S.timer=setInterval(async()=>{if(document.hidden||!S.public||S.token!==token||el('peoriaDialog'))return;try{const updated=await rpc('peoria_public_event',{token});if(updated){S.event=updated;renderBoard();}}catch{}},30000);
}
function renderBoard(){
 const e=S.event,summary=FortisPeoria.standings(e),daily=S.viewDay?e.days.find(d=>d.day_no===S.viewDay&&d.status==='published'):null;
 let body=header(e.name)+`<div class="card"><p>新新貝利亞 · 共 ${e.day_count} 天 · 已公布 ${summary.publishedDays} 天</p><p class="peoria-message">${summary.complete?'最終排名：平均淨桿最低者為總冠軍；同分並列。':'暫時排名依已公布成績計算。全部天數完成後，才確定總冠軍。'}</p>`;
 if(summary.complete)body+=`<h3>🏆 總冠軍：${summary.rows.filter(r=>r.rank===1).map(r=>esc(r.name)).join('、')}</h3>`;
 body+=`<div class="peoria-day-tabs">${button('tab','總成績榜','0')}${Array.from({length:e.day_count},(_,i)=>button('tab',`第 ${i+1} 天`,String(i+1))).join('')}</div>`;
 if(S.viewDay){body+=daily?`<h3>第 ${daily.day_no} 天 · ${esc(daily.course_label)} · ${esc(daily.played_on)}</h3><div class="scroll"><table><thead><tr><th>名次</th><th>球員</th><th>總桿</th><th>差點</th><th>淨桿</th></tr></thead><tbody>${daily.result.rows.map(r=>`<tr><td>${r.rank}</td><td>${esc(r.name)}</td><td>${r.gross}</td><td>${Number(r.handicap).toFixed(1)}</td><td>${netButton(r.net,daily.day_no,r.player_id)}</td></tr>`).join('')}</tbody></table></div>`:'<p>本日成績尚未公布。</p>';}
 else body+=`<h3>總成績榜</h3><p class="small">點選單日淨桿可查看總桿、差點、淨桿及排除洞號。平均淨桿顯示至小數兩位，排名依未四捨五入數值計算。</p><div class="scroll"><table class="peoria-table"><thead><tr><th>球員</th>${Array.from({length:e.day_count},(_,i)=>`<th>第 ${i+1} 天淨桿</th>`).join('')}<th>已完成</th><th>淨桿合計</th><th>平均淨桿</th><th>${summary.complete?'總排名':'暫時排名'}</th></tr></thead><tbody>${summary.rows.map(r=>`<tr><td>${esc(r.name)}</td>${r.days.map((d,i)=>`<td>${d?netButton(d.net,i+1,r.id):'—'}</td>`).join('')}<td>${r.completed}/${e.day_count}</td><td>${r.completed?(r.totalTenths/10).toFixed(1):'—'}</td><td>${r.average===null?'—':r.average.toFixed(2)}</td><td>${r.rank??'—'}</td></tr>`).join('')}</tbody></table></div>`;
 body+='</div>';
 if(!S.public){body+=`<div class="card"><h3>管理員補登成績</h3><p class="small">其他球員只進入本賽事，不會寫入個人統計或修改對戰讓桿。</p><div class="peoria-actions">${Array.from({length:e.day_count},(_,i)=>{const d=e.days.find(d=>d.day_no===i+1);return button(d?.status==='published'?'preview':'day',`第 ${i+1} 天${d?.status==='published'?' · 已公布':d?' · 繼續草稿':' · 補登成績'}`,String(i+1));}).join('')}</div>${summary.publishedDays?button('share','分享整場賽事成績連結'):''}</div>`;}
 page(body);
}
function netButton(net,day,id){return `<button type="button" class="peoria-net-link" data-peoria-action="detail" data-day="${day}" data-value="${esc(id)}" aria-label="查看單日成績明細">${Number(net).toFixed(1)}</button>`;}
function showDetail(day,id){const d=S.event.days.find(d=>d.day_no===day),r=d?.result?.rows.find(r=>r.player_id===id);if(!r)throw Error('本日成績尚未公布。');modal(`<h2>${esc(r.name)} · 第 ${day} 天</h2><p>${esc(d.played_on)} · ${esc(d.course_label)}</p><div class="peoria-detail-grid"><div>總桿<b>${r.gross}</b></div><div>計算差點<b>${Number(r.handicap).toFixed(1)}</b></div><div>淨桿<b>${Number(r.net).toFixed(1)}</b></div></div><p>淨桿＝總桿 − 計算差點</p><p><b>排除的 6 洞：</b>${d.result.excluded_holes.join('、')}</p><p><b>計算差點的 12 洞：</b>${d.result.included_holes.join('、')}</p><p class="small">同一天所有球員使用相同洞號。差點計算使用每洞兩倍標準桿上限，差點範圍 0–36，保留小數一位；實際總桿不設上限。</p>${button('close','關閉明細')}`);}
function sourceFromRecord(id){const r=db.rounds.find(r=>String(r.id)===String(id));if(!r)throw Error('找不到此回合。');const scores=Array.from({length:18},(_,h)=>r.players.map(name=>{const rows=db.scores.filter(s=>String(s.round_id)===String(id)&&s.player_name===name&&Number(s.hole_number)===h+1);return rows.length===1?Number(rows[0].gross_score):null;}));return FortisPeoria.sourceRound({players:r.players,course:r.course_data,scores,courseName:r.course_name,combo:r.course_combo,created:r.played_at},r.id);}
function chooseSource(day){
 restoreSource();modal(`<h2>第 ${day} 天 · 選擇本組回合</h2><p>選擇當天已正常儲存的完整回合，帶入本組球員、球場及 18 洞桿數。</p><select id="peoriaSource">${S.source?`<option value="recent">最近帶入：${esc(S.source.course_label)} · ${esc(S.source.played_on)}</option>`:''}${db.rounds.map(r=>`<option value="${esc(r.id)}">${esc(r.round_name||r.course_name)} · ${esc(String(r.played_at).slice(0,10))}</option>`).join('')}</select><div class="peoria-actions">${button('source','帶入本組回合',String(day),false)}${button('close','取消')}</div>`);
}
async function openDay(day,source=null){
 if(S.public)throw Error('此頁僅供查看。');const existing=S.event.days.find(d=>d.day_no===day);
 if(existing?.status==='published'){showPreview(day);return;}
 if(!existing&&!source){chooseSource(day);return;}
 S.day=existing?JSON.parse(JSON.stringify(existing)):FortisPeoria.blankDay(S.event,day,source);S.player=0;S.dirty=false;
 let cached=null;try{cached=JSON.parse(localStorage.getItem(draftKey())||'null');}catch{}
 if(cached&&cached.revision===S.event.revision&&confirm('此裝置有尚未儲存的補登資料，要繼續嗎？')){S.day=cached.day;S.dirty=true;}
 else if(cached&&cached.revision!==S.event.revision)alert('雲端賽事已更新，先載入雲端版本；此裝置舊草稿仍保留。');
 if(source){const mapping=source.players.map(name=>S.event.roster.find(p=>p.name===name)?.id);if(mapping.every(Boolean)){S.day=FortisPeoria.importSource(S.event,S.day,source,mapping);stash();}else{mappingDialog(source);return;}}
 renderEditor();
}
function renderEditor(){
 const e=S.event,d=S.day,p=e.roster[S.player],card=d.scorecards.find(c=>c.player_id===p.id);S.public=false;
 page(header(e.name)+`<div class="card"><h2>第 ${d.day_no} 天 · 補登桿數</h2><p>${esc(d.course_label)}</p><label>日期</label><input id="peoriaDate" type="date" value="${esc(d.played_on)}"><label>選擇球員</label><select id="peoriaPlayer">${e.roster.map((p,i)=>`<option value="${i}" ${i===S.player?'selected':''}>${esc(p.name)} · ${d.scorecards.find(c=>c.player_id===p.id).absent?'本日未參賽':d.scorecards.find(c=>c.player_id===p.id).scores.filter(Number.isInteger).length+'/18 洞'}</option>`).join('')}</select><label><input id="peoriaAbsent" type="checkbox" style="width:auto" ${card.absent?'checked':''}> 本日未參賽（不列入當日排名及全程冠軍）</label><p id="peoriaPlayerTotal">已輸入總桿：${card.scores.reduce((n,s)=>n+(Number.isInteger(s)?s:0),0)}</p><div class="peoria-card-grid">${d.course.map((h,i)=>`<label>第 ${i+1} 洞 · Par ${h.par}<input type="number" inputmode="numeric" min="1" max="999" step="1" ${card.absent?'disabled':''} data-peoria-hole="${i}" aria-label="第 ${i+1} 洞桿數" value="${card.scores[i]??''}"></label>`).join('')}</div><div class="peoria-actions">${button('previous-player','上一位')}${button('next-player','下一位')}${button('import','帶入已儲存回合',String(d.day_no))}</div><div class="peoria-actions">${button('save-day','儲存草稿')}${button('calculate','計算新新貝利亞排名','',false)}${button('back-event','返回總成績榜')}</div><p class="small">完整補齊所有球員 18 洞後才能計算。其他球員不用註冊，也不需要輸入推桿。</p></div>`);if(S.dirty)status('有尚未儲存的修改（已暫存在此裝置）');
}
function mappingDialog(source){S.importSource=source;modal(`<h2>對應參賽名單</h2>${source.players.map((name,i)=>`<div class="peoria-import-name"><label>${esc(name)} 對應的參賽者</label><select id="peoriaMap${i}"><option value="">請選擇</option>${S.event.roster.map(p=>`<option value="${esc(p.id)}" ${p.name===name?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div>`).join('')}<div class="peoria-actions">${button('mapping','確認帶入','',false)}${button('close','取消')}</div>`);}
async function saveDay(){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(S.day.played_on)||S.day.scorecards.some(c=>c.scores.some(n=>n!==null&&(!Number.isInteger(n)||n<1||n>999))))throw Error('請確認日期及所有桿數（1–999 整數或留空）。');
 const key=draftKey(),payload={...S.day,revision:S.event.revision};delete payload.result;delete payload.status;
 S.event=await command('save_day',payload);S.day=JSON.parse(JSON.stringify(S.event.days.find(d=>d.day_no===payload.day_no)));S.dirty=false;localStorage.removeItem(key);status('草稿已儲存');
}
async function calculate(){await saveDay();S.event=await command('preview',{day_no:S.day.day_no,revision:S.event.revision});S.day=S.event.days.find(d=>d.day_no===S.day.day_no);showPreview(S.day.day_no);}
function showPreview(day){
 const d=S.event.days.find(d=>d.day_no===day);if(!d?.result)throw Error('請先計算本日成績。');
 page(header(S.event.name)+`<div class="card"><h2>第 ${day} 天 · ${d.status==='published'?'已公布成績':'預覽成績（尚未公布）'}</h2><p>${esc(d.course_label)} · ${esc(d.played_on)}</p><div class="scroll"><table><thead><tr><th>名次</th><th>球員</th><th>總桿</th><th>計算差點</th><th>淨桿</th></tr></thead><tbody>${d.result.rows.map(r=>`<tr><td>${r.rank}</td><td>${esc(r.name)}</td><td>${r.gross}</td><td>${Number(r.handicap).toFixed(1)}</td><td>${netButton(r.net,day,r.player_id)}</td></tr>`).join('')}</tbody></table></div><p>排除洞號：${d.result.excluded_holes.join('、')}</p><p>計算差點洞號：${d.result.included_holes.join('、')}</p><div class="peoria-actions">${d.status==='published'?button('reopen','更正當日成績',String(day)):button('publish','公布當日成績',String(day),false)}${d.status!=='published'?button('day','返回補登',String(day)):''}${button('back-event','返回總成績榜')}</div></div>`);
}
async function share(){const url=new URL(location.origin+location.pathname);url.searchParams.set('peoria',S.event.share_token);await navigator.clipboard.writeText(url.href);status('整場賽事連結已複製；同一連結包含各天成績及總排名。');}
function existingDay(){modal(`<h2>選擇賽事日期</h2><p>${esc(S.event.name)}</p><select id="peoriaJoinDay">${Array.from({length:S.event.day_count},(_,i)=>`<option value="${i+1}">第 ${i+1} 天${S.event.days.some(d=>d.day_no===i+1&&d.status==='published')?'（已公布）':''}</option>`).join('')}</select>${button('join-day','帶入本組回合','',false)}`);}
async function dispatch(action,value,target){
 switch(action){
 case 'close':closeModal();return;
 case 'normal-save':closeModal();await saveRound();return;
 case 'ranking-save':await saveForRanking();return;
 case 'setup':await openSetup();return;
 case 'change-source':selectInitialSource();return;
 case 'initial-source':rememberSource(sourceFromRecord(el('peoriaInitialSource').value));await openSetup();return;
 case 'list':if(S.dirty&&!confirm('尚未儲存到雲端。已保留本機草稿，仍要離開嗎？'))return;await openList();return;
 case 'search':await searchList();return;
 case 'event':await openEvent(value);return;
 case 'public':await openPublic(value);return;
 case 'existing':S.event=await command('get',{},el('peoriaExisting').value);S.public=false;existingDay();return;
 case 'join-day':await openDay(Number(el('peoriaJoinDay').value),S.source);return;
 case 'tab':S.viewDay=Number(value);renderBoard();return;
 case 'detail':showDetail(Number(target.dataset.day),value);return;
 case 'day':await openDay(Number(value));return;
 case 'preview':showPreview(Number(value));return;
 case 'source':{const v=el('peoriaSource').value,source=v==='recent'?S.source:sourceFromRecord(v);await openDay(Number(value),source);return;}
 case 'import':chooseSource(Number(value));return;
 case 'mapping':{const mapping=S.importSource.players.map((_,i)=>el('peoriaMap'+i).value);S.day=FortisPeoria.importSource(S.event,S.day,S.importSource,mapping);stash();renderEditor();return;}
 case 'previous-player':S.player=Math.max(0,S.player-1);renderEditor();return;
 case 'next-player':S.player=Math.min(S.event.roster.length-1,S.player+1);renderEditor();return;
 case 'save-day':await saveDay();renderEditor();status('草稿已儲存');return;
 case 'calculate':await calculate();return;
 case 'back-event':if(S.dirty&&!confirm('尚未儲存到雲端。已保留本機草稿，仍要返回嗎？'))return;S.dirty=false;renderBoard();return;
 case 'publish':modal(`<h2>公布第 ${Number(value)} 天成績？</h2><p>請確認所有桿數與排名正確。公布後，持有賽事連結的人可查看本日球員姓名及成績。</p><div class="peoria-actions">${button('confirm-publish','確認公布成績',value,false)}${button('close','返回檢查')}</div>`);return;
 case 'confirm-publish':closeModal();S.event=await command('publish',{day_no:Number(value),revision:S.event.revision});S.viewDay=0;renderBoard();status('當日成績已公布，同一賽事連結已更新。');return;
 case 'reopen':if(!confirm('更正期間會暫時撤下本日公開成績，其他天不受影響。確定更正？'))return;S.event=await command('reopen',{day_no:Number(value),revision:S.event.revision});await openDay(Number(value));return;
 case 'share':await share();return;
 }
}
document.addEventListener('click',event=>{
 const target=event.target.closest('[data-peoria-action]');if(target){event.preventDefault();void run(()=>dispatch(target.dataset.peoriaAction,target.dataset.value,target));return;}
 const save=event.target.closest('button');if(save&&save.getAttribute('onclick')==='saveRound()'&&save.closest('#scoreContent')&&admin()){
  event.preventDefault();event.stopImmediatePropagation();if(!S.busy&&!roundActionPending)saveChoice();
 }
},true);
document.addEventListener('submit',event=>{const form=event.target.dataset.peoriaForm;if(!form)return;event.preventDefault();void run(()=>form==='setup'?rosterSetup():createEvent());});
document.addEventListener('input',event=>{
 if(event.target.id==='peoriaCount'){renderRosterInputs();return;}
 if(event.target.id==='peoriaDate'&&S.day){S.day.played_on=event.target.value;stash();return;}
 if(event.target.dataset.peoriaHole!==undefined&&S.day){const h=Number(event.target.dataset.peoriaHole),value=event.target.value,score=value===''?null:Number(value),card=S.day.scorecards.find(c=>c.player_id===S.event.roster[S.player].id);card.scores[h]=score;stash();if(score!==null&&(!Number.isInteger(score)||score<1||score>999)){event.target.setCustomValidity('請輸入 1–999 的整數');status('桿數須為 1–999 的整數');return;}event.target.setCustomValidity('');el('peoriaPlayerTotal').textContent='已輸入總桿：'+card.scores.reduce((n,s)=>n+(Number.isInteger(s)?s:0),0);}
});
document.addEventListener('change',event=>{if(event.target.id==='peoriaAbsent'){const card=S.day.scorecards.find(c=>c.player_id===S.event.roster[S.player].id);if(event.target.checked&&card.scores.some(s=>s!==null)&&!confirm('標記未參賽會清除此球員本日桿數，確定嗎？')){event.target.checked=false;return;}card.absent=event.target.checked;if(card.absent)card.scores=Array(18).fill(null);stash();renderEditor();return;}if(event.target.id==='peoriaPlayer'){S.player=Number(event.target.value);renderEditor();}});
root.FortisPeoriaUI={afterSave,openList,openPublic,openSetup,clearMemory(){clearTimer();closeModal();S.source=null;S.event=null;S.day=null;S.dirty=false;}};
})(window);
