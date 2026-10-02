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
