/* Event-only helpers; never read or mutate 8421, Vegas or personal statistics. */
(function(root){
'use strict';
function validateRoster(roster){
 if(!Array.isArray(roster)||roster.length<2||roster.length>100)throw Error('參賽人數須為 2–100 人。');
 const ids=new Set(),names=new Set();
 for(const p of roster){const name=String(p.name||'').trim();if(!p.id||!name||name.length>80||ids.has(p.id)||names.has(name.toLocaleLowerCase()))throw Error('請填寫不重複的球員姓名；同名球員請加上識別文字。');ids.add(p.id);names.add(name.toLocaleLowerCase());}
 return roster;
}
function sourceRound(round,id){
 if(!id||!round||round.course?.length!==18||round.scores?.length!==18||round.players?.length<2||round.players.length>4)throw Error('請選擇完整的已儲存回合。');
 if(round.scores.some(row=>row.length!==round.players.length||row.some(s=>!Number.isInteger(s)||s<1||s>999)))throw Error('建立賽事前，請先完成本組全部 18 洞。');
 return {id:String(id),course_label:[round.courseName,round.combo].filter(Boolean).join(' · '),course:round.course.map((h,i)=>({par:Number(h.par),display:String(h.display||`第 ${i+1} 洞`)})),players:[...round.players],scores:round.scores.map(row=>[...row]),played_on:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(round.created||Date.now()))};
}
function blankDay(event,day,source){
 return {day_no:day,played_on:source.played_on,course_label:source.course_label,course:source.course.map(h=>({...h})),source_round_id:source.id,status:'draft',scorecards:event.roster.map(p=>({player_id:p.id,scores:Array(18).fill(null)}))};
}
function importSource(event,day,source,mapping){
 if(day.status==='published')throw Error('請先更正當日成績，再帶入回合。');
 if(JSON.stringify(day.course)!==JSON.stringify(source.course)||day.course_label!==source.course_label)throw Error('本日球場與所選回合不同，請確認日期及球場。');
 if(mapping.length!==source.players.length||new Set(mapping).size!==mapping.length||mapping.some(id=>!event.roster.some(p=>p.id===id)))throw Error('請為本組每位球員選擇不同的參賽者。');
 const result=JSON.parse(JSON.stringify(day));
 mapping.forEach((id,i)=>{const card=result.scorecards.find(c=>c.player_id===id);card.scores=source.scores.map(row=>row[i]);card.absent=false;});
 result.source_round_id=source.id;return result;
}
function standings(event){
 const published=(event.days||[]).filter(d=>d.status==='published'&&d.result).sort((a,b)=>a.day_no-b.day_no);
 const rows=event.roster.map(p=>{
  const days=Array.from({length:event.day_count},(_,i)=>{const d=published.find(d=>d.day_no===i+1),r=d?.result.rows.find(r=>r.player_id===p.id);return r?{...r,day_no:i+1}:null;});
  const results=days.filter(Boolean),totalTenths=results.reduce((n,r)=>n+Math.round(r.net*10),0);
  return {id:p.id,name:p.name,days,completed:results.length,totalTenths,average:results.length?totalTenths/(results.length*10):null,eligible:published.length>0&&results.length===published.length,championEligible:results.length===event.day_count};
 });
 rows.sort((a,b)=>Number(b.eligible)-Number(a.eligible)||(a.eligible?(a.totalTenths*b.completed-b.totalTenths*a.completed):b.completed-a.completed)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
 let previous=null,rank=null;rows.forEach((r,i)=>{if(!r.eligible){r.rank=null;return;}if(!previous||r.totalTenths*previous.completed!==previous.totalTenths*r.completed)rank=i+1;r.rank=rank;previous=r;});
 return {rows,publishedDays:published.length,complete:published.length===event.day_count};
}
root.FortisPeoria={validateRoster,sourceRound,blankDay,importSource,standings};
if(typeof module!=='undefined')module.exports=root.FortisPeoria;
})(typeof window==='undefined'?globalThis:window);
