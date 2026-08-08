import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');

function eligibleStrokeHoles(course,n,startHoleIndex=0,larryMode=false){
  const countPar3=larryMode===true;
  const total=Math.max(0,Math.min(18,Number(n)||0));
  if(!total)return[];
  const startsOnBackNine=Number(startHoleIndex)>=9;
  const firstNineCount=Math.ceil(total/2),secondNineCount=Math.floor(total/2);
  const frontNine=course.filter(h=>h.roundHole<=9),backNine=course.filter(h=>h.roundHole>=10);
  const firstNine=startsOnBackNine?backNine:frontNine,secondNine=startsOnBackNine?frontNine:backNine;
  const eligible=holes=>holes.filter(h=>countPar3||h.strokeEligible).sort((a,b)=>a.hcp-b.hcp);
  const firstEligible=eligible(firstNine),secondEligible=eligible(secondNine);
  let selected=[...firstEligible.slice(0,firstNineCount),...secondEligible.slice(0,secondNineCount)];
  if(selected.length<total){
    const chosen=new Set(selected.map(h=>h.roundHole));
    const remaining=[...firstEligible,...secondEligible].filter(h=>!chosen.has(h.roundHole)).sort((a,b)=>a.hcp-b.hcp);
    selected=selected.concat(remaining.slice(0,total-selected.length));
  }
  return selected.map(h=>h.roundHole);
}

const course=Array.from({length:18},(_,i)=>({
  roundHole:i+1,
  hcp:(i%9)+1,
  par:[2,11].includes(i)?3:4,
  strokeEligible:![2,11].includes(i)
}));

test('Larry mode includes par 3 stroke holes while regular mode excludes them',()=>{
  const regular=eligibleStrokeHoles(course,18,0,false).map(n=>course[n-1]);
  const larry=eligibleStrokeHoles(course,18,0,true).map(n=>course[n-1]);
  assert.ok(regular.every(h=>h.par!==3));
  assert.ok(larry.some(h=>h.par===3));
});

test('Larry mode preserves odd-stroke start-hole-10 allocation',()=>{
  const selected=eligibleStrokeHoles(course,5,9,true);
  assert.equal(selected.filter(n=>n>=10).length,3);
  assert.equal(selected.filter(n=>n<=9).length,2);
});

test('round state is the single source of truth and is persisted',()=>{
  assert.match(source,/larryMode:document\.getElementById\('countPar3Strokes'\)\?\.checked===true/);
  assert.match(source,/eligibleStrokeHoles\(r\.course,\+m\.strokes\|\|0,r\.startHoleIndex\|\|0,r\.larryMode===true\)/);
  assert.match(source,/let isLarryMode = r\.larryMode === true/);
  assert.match(source,/round\.larryMode=round\.larryMode===true/);
  assert.match(source,/larryToggle\.checked=round\.larryMode/);
  assert.match(source,/\.\.\.h,larryMode:round\.larryMode===true/);
  assert.match(source,/larryMode:course\[0\]\?\.larryMode===true/);
});

