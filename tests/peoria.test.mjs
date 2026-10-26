import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
const require=createRequire(import.meta.url),P=require('../scripts/peoria.js');
const roster=[{id:'a',name:'A'},{id:'b',name:'B'},{id:'c',name:'C'}];
const result=(values)=>({rows:values.map((net,i)=>({player_id:roster[i].id,name:roster[i].name,gross:90,handicap:90-net,net}))});
test('three-day averages, exact ranks, shared ties and missing days',()=>{
 const event={roster,day_count:3,days:[{day_no:1,status:'published',result:result([72,73,74])},{day_no:2,status:'published',result:result([74,73,72])},{day_no:3,status:'draft',result:result([1,100,100])}]};
 let board=P.standings(event);assert.equal(board.complete,false);assert.deepEqual(board.rows.map(r=>r.rank),[1,1,1]);assert.deepEqual(board.rows.map(r=>r.average),[73,73,73]);
 event.days[2]={day_no:3,status:'published',result:result([72,73,74])};board=P.standings(event);assert.equal(board.complete,true);assert.deepEqual(board.rows.map(r=>r.id),['a','b','c']);assert.equal(board.rows[0].average,218/3);
 event.days[2].result.rows.pop();board=P.standings(event);assert.equal(board.complete,true);assert.equal(board.rows.find(r=>r.id==='c').rank,null);
 const near={roster:roster.slice(0,2),day_count:3,days:[{day_no:1,status:'published',result:result([72,72])},{day_no:2,status:'published',result:result([72,72])},{day_no:3,status:'published',result:result([72.1,72.2])}]};assert.deepEqual(P.standings(near).rows.map(r=>r.rank),[1,2]);
});
test('saved group imports once by stable player identity without changing source or personal statistics',()=>{
 const round={players:['A','B'],courseName:'Course',course:Array.from({length:18},()=>({par:4,display:'H'})),scores:Array.from({length:18},()=>[4,5])};
 const before=JSON.stringify(round),source=P.sourceRound(round,20),event={roster},blank=P.blankDay(event,1,source),imported=P.importSource(event,blank,source,['a','b']);
 assert.equal(JSON.stringify(round),before);assert.equal(imported.scorecards[0].scores[0],4);assert.equal(imported.scorecards[2].scores[0],null);assert.equal(blank.scorecards[0].scores[0],null);
 assert.throws(()=>P.importSource(event,blank,source,['a','a']),/不同/);assert.throws(()=>P.sourceRound({...round,scores:[['',5]]},20),/完整|18/);
 const wrong={...source,course:source.course.map(h=>({...h,par:3}))};assert.throws(()=>P.importSource(event,blank,wrong,['a','b']),/球場/);
 assert.throws(()=>P.validateRoster([{id:'a',name:'A'},{id:'b',name:' a '}]),/不重複/);
});
test('new UI has no cross-group entry and preserves scoring contracts byte for byte',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const before=html.slice(0,html.indexOf('<script>'));
 assert.doesNotMatch(before,/Cross Group|跨組|enableCrossGroup|value="crossGroup"/);
 assert.match(before,/賽事成績/);assert.match(before,/id="peoriaPage"/);
 const contract=JSON.parse(readFileSync(new URL('./scoring-contract.json',import.meta.url),'utf8'));
 for(const c of contract.regions){const code=html.slice(html.indexOf(c.start),html.indexOf(c.end));assert.equal(createHash('sha256').update(code).digest('hex'),c.sha256,c.start);}
 assert.equal(createHash('sha256').update(readFileSync(new URL('../scripts/vegas.js',import.meta.url))).digest('hex'),contract.vegasModule);
 for(const file of ['../scripts/peoria.js','../scripts/peoria-ui.js'])new vm.Script(readFileSync(new URL(file,import.meta.url),'utf8'));
});
