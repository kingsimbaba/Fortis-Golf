import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function harness({confirmed=true,fail=false}={}){
  const calls=[],alerts=[],storage=new Map([['fortisActiveRound','draft']]);
  const context={round:{id:'test-round'},roundHole:7,currentSession:{access_token:'test'},confirm:()=>confirmed,alert:m=>alerts.push(m),localStorage:{removeItem:k=>storage.delete(k)},document:{getElementById:()=>({innerHTML:'scores'})},showPage:p=>calls.push({page:p}),sb:async(path,opts)=>{calls.push({path,opts});if(fail)throw Error('offline');return [{active:false}];}};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('let roundActionPending=false;'),source.indexOf('async function endActiveScoringSession()')),context);
  vm.runInContext("function clearActiveRound(){localStorage.removeItem('fortisActiveRound');}",context);
  return {context,calls,alerts,storage,run:()=>context.cancelLiveRound()};
}
test('declining leaves the round and storage untouched',async()=>{
  const h=harness({confirmed:false});await h.run();assert.equal(h.calls.length,0);assert.ok(h.context.round);assert.ok(h.storage.has('fortisActiveRound'));
});
test('cancel closes only the live session and removes the unfinished round',async()=>{
  const h=harness();await h.run();assert.equal(h.calls.length,2);assert.equal(h.calls[0].path,'live_rounds?id=eq.test-round');assert.equal(h.calls[0].opts.method,'PATCH');assert.equal(JSON.parse(h.calls[0].opts.body).active,false);assert.equal(h.context.round,null);assert.equal(h.context.roundHole,0);assert.equal(h.storage.size,0);assert.equal(h.calls[1].page,'home');
});
test('failed closure preserves the round and permits retry',async()=>{
  const h=harness({fail:true});await h.run();assert.ok(h.context.round);assert.ok(h.storage.has('fortisActiveRound'));assert.equal(h.alerts.length,1);await h.run();assert.equal(h.calls.length,2);
});
test('cancel waits for in-flight sync and blocks heartbeat and duplicate cancellation',async()=>{
  const h=harness();let release;const pending=new Promise(r=>release=r);h.context.pending=pending;vm.runInContext('pendingLiveSyncs.add(pending)',h.context);
  const done=h.run();await Promise.resolve();await h.context.syncLiveRound();await h.run();assert.equal(h.calls.length,0);release();await done;assert.equal(h.calls.length,2);
});
