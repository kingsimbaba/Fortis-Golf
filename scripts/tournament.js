/* Gross tournament scoring is independent of calcFortis and legacy saved scores. */
(function(root){
'use strict';
function leaderboard(event,groups){
  const rows=[];
  for(const group of groups){
    group.players.forEach((name,i)=>{
      let gross=0,par=0,thru=0;
      event.course.forEach((hole,h)=>{
        const score=group.scores[h]?.[i];
        if(Number.isInteger(score)&&score>0){gross+=score;par+=hole.par;thru++;}
      });
      rows.push({id:group.id+':'+i,name,group:group.id,gross,relative:gross-par,thru});
    });
  }
  const final=event.status==='final';
  if(final&&(!rows.length||rows.some(r=>r.thru!==event.course.length)))throw Error('Final results require every score.');
  const value=r=>final?r.gross:r.relative;
  rows.sort((a,b)=>(a.thru===0)-(b.thru===0)||value(a)-value(b)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
  let previous,rank=0;
  rows.forEach((r,i)=>{if(!r.thru){r.rank=null;return;}if(previous!==value(r))rank=i+1;r.rank=rank;previous=value(r);});
  return rows;
}
function courseFor(r){return r.course.map(h=>({display:h.display,par:h.par,sourceCourseId:String(h.sourceCourseId||'')}));}
function snapshot(r){return {players:[...r.players],scores:r.scores.map(row=>row.map(v=>v===''?null:v))};}
function validId(value){return typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);}
function errorMessage(error){
  let message=error?.message||String(error||'');
  try{message=JSON.parse(message).message||'';}catch{}
  const messages=[
    [/uuid|22P02/i,'請從「已受邀的賽事」清單選擇賽事。建立新賽事時，請在「賽事名稱」輸入名稱。'],
    [/Assigned scorer/i,'你目前只有觀看權限，請主辦人指派你為本組記分者。'],
    [/another device/i,'另一台裝置已更新桿數。請先載入本組雲端桿數，再繼續修改。'],
    [/Course layout/i,'請先選擇與賽事相同的球場與 18 洞配置。'],
    [/Every player|Final results require/i,'所有球員都完成 18 洞後，才能公布最終排名。'],
    [/Player already/i,'有球員已加入其他組別，請確認本組名單。'],
    [/Only organizer|Organizer only/i,'只有賽事主辦人可以執行這個操作。'],
    [/Event unavailable/i,'找不到賽事或尚未獲邀，請向主辦人確認。'],
    [/Group roster/i,'本組球員名單已固定，請確認球員與順序相同。'],
    [/Failed to fetch|NetworkError|offline/i,'目前無法連線，桿數仍保留在本機。連線恢復後請按「重試同步」。'],
    [/relation .* does not exist|schema cache/i,'賽事資料暫時無法讀取，請稍後重試。']
  ];
  for(const [pattern,text] of messages)if(pattern.test(message))return text;
  return /[\u3400-\u9fff]/.test(message)&&!/[{}]/.test(message)?message:'操作未完成，請稍後重試。';
}
root.FortisTournament={leaderboard,courseFor,snapshot,validId,errorMessage};
if(typeof module!=='undefined')module.exports=root.FortisTournament;
})(typeof window==='undefined'?globalThis:window);
