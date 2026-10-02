import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const renderer=source.slice(source.indexOf('function showReplayPanel()'),source.indexOf('function closeReplay()'));

test('replay shows recorded putts per player and hole, including zero and missing history',()=>{
  const box={innerHTML:'',scrollIntoView(){}};
  const context=vm.createContext({
    document:{getElementById:()=>box},
    replayRoundObj:{players:['A','B'],course:[{par:4},{par:4}]},
    replayHoles:[1,2],replayIndex:0,
    replayCalc:{rows:[{},{}]},
    replayScores:[
      {hole_number:1,player_name:'B',gross_score:5,putts:3},
      {hole_number:1,player_name:'A',gross_score:4,putts:0},
      {hole_number:2,player_name:'A',gross_score:4,putts:null},
      {hole_number:2,player_name:'B',gross_score:4,putts:2}
    ]
  });
  vm.runInContext(renderer,context);
  vm.runInContext('showReplayPanel()',context);
  assert.match(box.innerHTML,/<th>推桿<\/th>/);
  assert.match(box.innerHTML,/<td>A<\/td>\s*<td>4<\/td>\s*<td>0<\/td>/);
  assert.match(box.innerHTML,/<td>B<\/td>\s*<td>5<\/td>\s*<td>3<\/td>/);
  vm.runInContext('nextReplayHole()',context);
  assert.match(box.innerHTML,/<td>A<\/td>\s*<td>4<\/td>\s*<td>—<\/td>/);
  assert.match(box.innerHTML,/<td>B<\/td>\s*<td>4<\/td>\s*<td>2<\/td>/);
  vm.runInContext('prevReplayHole()',context);
  assert.match(box.innerHTML,/<td>A<\/td>\s*<td>4<\/td>\s*<td>0<\/td>/);
});
