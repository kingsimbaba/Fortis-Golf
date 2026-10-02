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
