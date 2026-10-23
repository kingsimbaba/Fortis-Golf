import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const {leaderboard,snapshot,errorMessage,validId}=createRequire(import.meta.url)('../scripts/tournament.js');
const course=Array.from({length:18},(_,i)=>({par:i%3===0?3:4,display:'Hole '+(i+1),sourceCourseId:'1'}));
const event={course,status:'live'};
const group=(id,players,scores)=>({id,players,scores:Array.from({length:18},(_,h)=>players.map((_,i)=>scores(h,i)))});
test('12 players across three groups rank by gross relative to completed-hole par',()=>{
 const groups=[0,1,2].map(g=>group('g'+g,Array.from({length:4},(_,i)=>'P'+(g*4+i)),(h,i)=>h<=g?course[h].par+i:null));
 const rows=leaderboard(event,groups);assert.equal(rows.length,12);
 assert.deepEqual(rows.slice(0,3).map(r=>r.rank),[1,1,1]);
 assert.deepEqual(rows.slice(0,3).map(r=>r.thru).sort(),[1,2,3]);
 assert.equal(rows[3].rank,4);
});
test('blank holes do not become par; unstarted players remain unranked',()=>{
 const rows=leaderboard(event,[group('g',['A','B'],(h,i)=>h===10&&i===0?5:null)]);
 assert.deepEqual([rows[0].gross,rows[0].thru,rows[0].relative],[5,1,1]);assert.equal(rows[1].rank,null);
});
test('final ranks use total gross, share ties, and reject missing scores',()=>{
 const g=group('g',['A','B','C','D'],(h,i)=>course[h].par+[0,1,1,2][i]);
 assert.deepEqual(leaderboard({...event,status:'final'},[g]).map(r=>r.rank),[1,2,2,4]);
 g.scores[0][0]=null;assert.throws(()=>leaderboard({...event,status:'final'},[g]));
});
test('corrections and cleared scores recompute without accumulated totals',()=>{
 const g=group('g',['A','B'],h=>h===0?4:null);
 assert.deepEqual(leaderboard(event,[g]).map(r=>r.rank),[1,1]);
 g.scores[0][0]=2;assert.equal(leaderboard(event,[g])[0].relative,-1);
 g.scores[0][0]=null;assert.equal(leaderboard(event,[g])[1].rank,null);
});
test('snapshot preserves missing scores and does not alias the original matrix',()=>{
 const r={players:['A','B'],scores:[['',4]]};const s=snapshot(r);assert.deepEqual(s.scores,[[null,4]]);
 r.scores[0][1]=9;assert.equal(s.scores[0][1],4);
});
test('all inline application scripts compile',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 for(const [,attrs,script] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g))if(!attrs.includes('module'))new vm.Script(script);
});
function syncHarness(){
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const code=html.slice(html.indexOf('let tournamentQueue='),html.lastIndexOf('</script>'));
 const calls=[],pending=[];
 const context=vm.createContext({currentUser:{id:'scorer'},FortisTournament:{snapshot,errorMessage,validId},round:{players:['A','B'],scores:[['',4]],tournament:{eventId:'e',groupId:'g',revision:0},course:[]},
  sb:async(path,options)=>{const data=JSON.parse(options.body);calls.push(data);return new Promise((resolve,reject)=>pending.push({resolve,reject}));},
  document:{getElementById:()=>null},saveActiveRound(){},setInterval(){},console});
 context.FortisTournament.courseFor=()=>[];
 vm.runInContext(code,context);
 return {context,calls,pending,run:s=>vm.runInContext(s,context)};
}
test('sync captures snapshots, serializes corrections and uses returned revisions',async()=>{
 const h=syncHarness();h.run('queueTournamentSync();round.scores[0][1]=5;queueTournamentSync()');
 await new Promise(setImmediate);assert.equal(h.calls.length,1);assert.equal(h.calls[0].payload.scores[0][1],4);
 h.pending[0].resolve({revision:1});await new Promise(setImmediate);
 assert.equal(h.calls.length,2);assert.equal(h.calls[1].payload.revision,1);assert.equal(h.calls[1].payload.scores[0][1],5);
 h.pending[1].resolve({revision:2});await h.run('tournamentQueue');assert.equal(h.context.round.tournament.revision,2);
});
test('failed sync blocks subsequent stale writes and prevents saving until retry or reload',async()=>{
 const h=syncHarness();h.run('queueTournamentSync();queueTournamentSync()');await new Promise(setImmediate);
 h.pending[0].reject(Error('conflict'));await h.run('tournamentQueue');assert.equal(h.calls.length,1);
 await assert.rejects(h.run('flushTournamentSync()'),/conflict/);assert.equal(h.calls.length,1);
});
test('service worker bypasses authenticated database responses',()=>{
 const source=readFileSync(new URL('../sw.js',import.meta.url),'utf8');const listeners={};let intercepted=false;
 const context=vm.createContext({URL,self:{addEventListener:(name,fn)=>listeners[name]=fn}});vm.runInContext(source,context);
 for(const path of ['/rest/v1/golf_event_groups','/auth/v1/user']){
  listeners.fetch({request:{method:'GET',url:'https://example.supabase.co'+path},respondWith(){intercepted=true;}});
  assert.equal(intercepted,false);
 }
});

test('successful flush permits saving a tournament round',async()=>{
 const h=syncHarness();const done=h.run('flushTournamentSync()');await new Promise(setImmediate);
 h.pending[0].resolve({revision:1});await done;assert.equal(h.context.round.tournament.revision,1);
});
test('database UUID errors become actionable instructions without raw JSON',()=>{
 const text=errorMessage(Error(JSON.stringify({code:'22P02',details:null,message:'invalid input syntax for type uuid: "Fukuoka Invitational"'})));
 assert.match(text,/賽事名稱/);assert.doesNotMatch(text,/22P02|uuid|details|[{}]/);
 assert.equal(validId('Fukuoka Invitational'),false);
 assert.equal(validId('00000000-0000-0000-0000-000000000001'),true);
 assert.doesNotMatch(errorMessage(Error('{"code":"PGRST","message":"arbitrary SQL internals"}')),/PGRST|SQL|[{}]/);
});
function setupHarness({hasRound=true,selected='',name='Fukuoka Invitational'}={}){
 const h=syncHarness();const status={textContent:''};
 const fields={tournamentStatus:status,tournamentSelect:{value:selected},tournamentName:{value:name}};
 h.context.document.getElementById=id=>fields[id]||null;
 if(!hasRound)h.context.round=null;else delete h.context.round.tournament;
 return {...h,status,fields};
}
test('a name typed as an event identifier never reaches the database',async()=>{
 const h=setupHarness({selected:'Fukuoka Invitational'});await h.run('openTournament()');
 assert.equal(h.calls.length,0);assert.match(h.status.textContent,/清單選擇賽事/);
});
test('creation guides users to course and group setup before writing',async()=>{
 const h=setupHarness({hasRound:false});await h.run('createTournament()');assert.equal(h.calls.length,0);
 assert.match(h.status.textContent,/設定球場與本組球員/);
});
test('blank tournament name is rejected locally',async()=>{
 const h=setupHarness({name:'  '});await h.run('createTournament()');assert.equal(h.calls.length,0);assert.match(h.status.textContent,/賽事名稱/);
});
test('tournament name is submitted as a name, with null event ID',async()=>{
 const h=setupHarness();const done=h.run('createTournament()');await new Promise(setImmediate);
 assert.equal(h.calls[0].action,'create');assert.equal(h.calls[0].event_id,null);
 assert.equal(h.calls[0].payload.name,'Fukuoka Invitational');
 h.pending[0].reject(Error('offline'));await done;assert.doesNotMatch(h.status.textContent,/offline|[{}]/);
});
