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
root.FortisTournament={leaderboard,courseFor,snapshot};
if(typeof module!=='undefined')module.exports=root.FortisTournament;
})(typeof window==='undefined'?globalThis:window);
