import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('+3 keeps the triple-bogey animation',()=>{
  assert.match(source,/diff === 3 \? \{\s*icon:'triple-bogey'/);
  assert.match(source,/scene\.icon==='triple-bogey'[\s\S]*?animations\/triple-bogey\.mp4/);
});

test('+4 or worse uses the quadruple-bogey animation',()=>{
  assert.match(source,/\} : \{\s*icon:'quadruple-bogey'/);
  assert.match(source,/scene\.icon==='quadruple-bogey'[\s\S]*?animations\/quadruple-bogey\.mp4/);
});

import vm from 'node:vm';

function animationHarness(diff){
  const listeners={};
  const sourceListeners={};
  const timers=[];
  let removed=false;
  const video={pause(){},play(){return Promise.resolve();},addEventListener(name,fn){listeners[name]=fn;},querySelector(){return {addEventListener(name,fn){sourceListeners[name]=fn;}};}};
  const overlay={querySelector(){return video;},remove(){removed=true;}};
  const context={round:{course:[{par:4}]},roundHole:0,document:{createElement(){return overlay;},body:{appendChild(){}}},setTimeout(fn,ms){const timer={fn,ms};timers.push(timer);return timer;},clearTimeout(timer){timer.cleared=true;}};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function playScoreAnimation('),source.indexOf('  function changeScore(')),context);
  return {completion:context.playScoreAnimation({diff,score:4+diff,player:'Test'}),listeners,sourceListeners,timers,get removed(){return removed;}};
}

test('Double Bogey stays visible until playback ends, including loading time',async()=>{
  const h=animationHarness(2);
  assert.equal(h.removed,false);
  assert.deepEqual(h.timers.map(t=>t.ms),[30000]);
  h.listeners.ended();
  await h.completion;
  assert.equal(h.removed,true);
  assert.equal(h.timers[0].cleared,true);
});

test('Double Bogey releases scoring on media failure or loading timeout',async()=>{
  for(const fail of [h=>h.listeners.error(),h=>h.sourceListeners.error(),h=>h.timers[0].fn()]){
    const h=animationHarness(2);
    fail(h);
    await h.completion;
    assert.equal(h.removed,true);
  }
});

test('Other score animations retain their six-second dismissal',()=>{
  for(const diff of [-3,-2,-1,0,1,3,4]){
    const h=animationHarness(diff);
    assert.equal(h.completion,undefined);
    assert.deepEqual(h.timers.map(t=>t.ms),[6000]);
    h.timers[0].fn();
    assert.equal(h.removed,true);
  }
});
