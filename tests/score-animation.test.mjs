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

test('only quadruple bogey or worse displays for nine seconds',()=>{
  assert.match(source,/animationDuration=scene\.icon==='quadruple-bogey' \? 9000 : 6000/);
  assert.match(source,/setTimeout\(\(\)=>\{\s*overlay\.remove\(\);\s*\},animationDuration\)/);
});
