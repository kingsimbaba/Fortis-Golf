import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const context=vm.createContext({window:{},crypto:webcrypto,TextEncoder,Uint8Array});
vm.runInContext(readFileSync(new URL('../scripts/course-photos.js',import.meta.url),'utf8'),context);
const photos=context.window.FortisCoursePhotos;
test('club and nine-hole combinations share one photo key',()=>{
 const courses=[{course_name:'CLUB-A',course_group:'CLUB'},{course_name:'CLUB-B',course_group:'CLUB'},{course_name:'OTHER'}];
 const combos=[{combo_code:'CLUB-AB',parent_course_code:'CLUB'}];
 for(const code of ['CLUB','CLUB-A','CLUB-B','CLUB-AB'])assert.equal(photos.canonicalCourse(code,courses,combos),'CLUB');
 assert.equal(photos.canonicalCourse('OTHER',courses,combos),'OTHER');
});
test('stable paths safely isolate course names',async()=>{
 const a=await photos.photoPath('福岡 / 七又');
 assert.match(a,/^courses\/[a-f0-9]{64}\.jpg$/);
 assert.equal(a,await photos.photoPath('福岡 / 七又'));
 assert.notEqual(a,await photos.photoPath('Other course'));
 await assert.rejects(()=>photos.photoPath(''));
});
test('reject unsupported, empty and oversized uploads',()=>{
 for(const f of [{type:'image/svg+xml',size:10},{type:'image/heic',size:10},{type:'image/jpeg',size:0},{type:'image/jpeg',size:13*1024*1024}])assert.throws(()=>photos.validateFile(f));
 for(const type of ['image/jpeg','image/png','image/webp'])assert.doesNotThrow(()=>photos.validateFile({type,size:1024}));
});

function backgroundHarness(download, decode=async()=>{}) {
 const ctx=vm.createContext({window:{},crypto:webcrypto,TextEncoder,Uint8Array,
   URL:{createObjectURL:()=> 'blob:fixture',revokeObjectURL:()=>{}},Image:class {decode(){return decode();}}});
 vm.runInContext(readFileSync(new URL('../scripts/course-photos.js',import.meta.url),'utf8'),ctx);
 const element=()=>({isConnected:true,style:{backgroundImage:''},classList:{values:new Set(),add(v){this.values.add(v)},remove(v){this.values.delete(v)}}});
 return {api:ctx.window.FortisCoursePhotos,element,options:{client:{storage:{from:()=>({download})}},user:{id:'test'},courses:[{course_name:'A'},{course_name:'B'}],combos:[]}};
}
test('latest round and repeated recent courses share a single download',async()=>{
 const reads=[];const h=backgroundHarness(async p=>{reads.push(p);return {data:{}};});
 const cards=[h.element(),h.element(),h.element()];
 await h.api.mountBackgrounds({...h.options,items:cards.map(element=>({code:'A',element}))});
 assert.equal(reads.length,1);
 for(const c of cards){assert.match(c.style.backgroundImage,/blob:fixture/);assert.ok(c.classList.values.has('has-course-photo'));}
});
test('missing and invalid photos retain the plain background',async()=>{
 for(const invalid of [false,true]){
  const h=backgroundHarness(async()=>invalid?{data:{}}:{error:new Error('Missing')},async()=>{throw Error('Invalid image')});
  const card=h.element();await h.api.mountBackgrounds({...h.options,items:[{code:'B',element:card}]});
  assert.equal(card.style.backgroundImage,'');assert.equal(card.classList.values.size,0);
 }
});
test('background requests require sign-in and ignore obsolete renders',async()=>{
 let complete;let calls=0;
 const h=backgroundHarness(()=>{calls++;return new Promise(resolve=>{complete=resolve;});});
 const old=h.element();
 await h.api.mountBackgrounds({...h.options,user:null,items:[{code:'A',element:old}]});assert.equal(calls,0);
 const pending=h.api.mountBackgrounds({...h.options,items:[{code:'A',element:old}]});
 while(!complete)await new Promise(resolve=>setTimeout(resolve,0));
 await h.api.mountBackgrounds({...h.options,items:[]});
 complete({data:{}});await pending;
 assert.equal(old.style.backgroundImage,'');
});

test('players can manage course photos without rendering privileged admin controls',()=>{
 const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const extract=name=>{const start=source.indexOf('function '+name+'(');const tail=source.slice(start);const end=tail.slice(1).search(/\n(?:async )?function /);return end<0?tail:tail.slice(0,end+1);};
 const root={innerHTML:'previous admin content'};let photos=0,privileged=0;
 const ctx=vm.createContext({currentProfile:{role:'player'},db:{courses:[]},document:{getElementById:()=>root},renderCoursePhotosAdmin:()=>photos++,renderAdminDashboard:()=>privileged++,loadAdminUsers:()=>privileged++,adminLoadCourseManager:()=>privileged++});
 vm.runInContext(extract('renderAdmin')+';renderAdmin();',ctx);
 assert.equal(photos,1);assert.equal(privileged,0);assert.equal(root.innerHTML,'');
 vm.runInContext(extract('renderProductionInfrastructureCard')+';renderProductionInfrastructureCard();',ctx);
 assert.equal(root.innerHTML,'');
});

test('every master record remains selectable, including grouped, inactive and unplayed courses',()=>{
 const courses=[{id:1,course_name:'TPE-A',course_group:'TPE',display_name_zh:'台北 A區',country:'Taiwan',region:'North'},
 {id:2,course_name:'TPE-B',course_group:'TPE',country:'Taiwan',region:'North',active:false},
 {id:3,course_name:'TN',display_name_zh:'台南(新化)',country:'Taiwan',region:'South'},
 {id:4,course_name:'JP-X',display_name:'Test Club',display_name_ja:'テスト',country:'Japan',region:'Kyushu',prefecture:'Fukuoka'}];
 const combos=[{parent_course_code:'TPE',combo_code:'TPE-AB',parent_course_name:'台北'}, {parent_course_code:'TPE',combo_code:'TPE-BA'}];
 const entries=photos.courseEntries(courses,combos,x=>x);
 assert.equal(entries.filter(e=>e.value.startsWith('course:')).length,courses.length);
 for(const c of courses)assert.ok(entries.some(e=>e.code===c.course_name));
 assert.equal(entries.filter(e=>e.code==='TPE').length,1);
 for(const e of entries.filter(e=>e.code.startsWith('TPE')))assert.equal(e.photoCode,'TPE');
 assert.equal(photos.filterEntries(entries,{country:'Japan',region:'Kyushu',prefecture:'Fukuoka',search:'TEST club'}).length,1);
 assert.equal(photos.filterEntries(entries,{country:'Taiwan',search:'JP-X'}).length,0);
 assert.equal(photos.filterEntries(entries,{country:'Taiwan',region:'North',search:'tpe-b'})[0].code,'TPE-B');
 assert.equal(photos.filterEntries(entries,{search:'台南'})[0].code,'TN');
 assert.equal(photos.filterEntries(entries,{search:'テスト'})[0].code,'JP-X');
 assert.equal(photos.filterEntries(entries,{search:'missing'}).length,0);
 assert.equal(photos.filterEntries(entries,{}).length,entries.length);
});

test('course master loader reads beyond API row limits and does not accept partial failures',async()=>{
 const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(source,/db.courses=await loadPaged\('courses\?select=\*&order=id'\)/);
 assert.match(source,/db.course_combos=await loadPaged\('course_combos\?select=\*&order=id'\)/);
 const fn=source.slice(source.indexOf('async function loadPaged('),source.indexOf('async function loadAll('));
 const rows=Array.from({length:2107},(_,id)=>({id})); const calls=[];
 const ctx=vm.createContext({sb:async path=>{calls.push(path);const offset=+path.match(/offset=(\d+)/)[1];return rows.slice(offset,offset+1000);}});
 vm.runInContext(fn,ctx);const loaded=await ctx.loadPaged('courses?select=*&order=id');
 assert.equal(loaded.length,rows.length);assert.equal(new Set(loaded.map(x=>x.id)).size,rows.length);assert.equal(calls.length,3);
 ctx.sb=async path=>{if(path.includes('offset=1000'))throw Error('network');return rows.slice(0,1000);};
 await assert.rejects(()=>ctx.loadPaged('courses?select=*&order=id'),/network/);
});
