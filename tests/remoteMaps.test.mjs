import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {applySyncDelta,knownVersions} from '../src/lib/syncCache.js';import {decodeWire,dataPatch,applyEventDelta} from '../src/lib/syncWire.js';
const cache=new Map(),calls=[];let handle;
const dependencies={supabase:{rpc:(name,args)=>{calls.push({name,args});const request=Promise.resolve().then(()=>handle(name,args));request.abortSignal=signal=>{calls.at(-1).signal=signal;return request};return request}},readAccountCache:async key=>cache.get(key)||[],cacheAccountMaps:async(key,value)=>cache.set(key,structuredClone(value)),applySyncDelta,knownVersions,decodeWire,dataPatch,applyEventDelta};
globalThis.__mmRemoteTest=dependencies;
const source=(await fs.readFile(new URL('../src/lib/remoteMaps.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');
const remote=await import('data:text/javascript;base64,'+Buffer.from('const {supabase,readAccountCache,cacheAccountMaps,applySyncDelta,knownVersions,decodeWire,dataPatch,applyEventDelta}=globalThis.__mmRemoteTest;\n'+source).toString('base64'));
delete globalThis.__mmRemoteTest;
function seed(owner){const row={id:'map',user_id:owner,name:'Map',data:{colors:[null,'#fff'],versions:[]},sync_revision:7,fields:{colors:'color-hash',versions:[]}};cache.set('remote-v1:'+owner,{personal:[row],shared:[],objects:{},histories:{}});return row;}
test('a restored map validates existence even when its canonical cached data is unchanged',async()=>{
 calls.length=0;const row=seed('restore-owner');handle=async name=>name==='save_personal_map_patch'?{error:{code:'40001'}}:{data:{id:'map',sync_revision:1,fields:row.fields}};
 const result=await remote.upsertRemoteMap(row);assert.equal(result.error,null);assert.deepEqual(calls.map(c=>c.name),['save_personal_map_patch','save_personal_map']);assert.deepEqual(calls[1].args.map_data,row.data);
});
test('a validated no-op receipt retains field manifests for the next small refresh',async()=>{
 calls.length=0;const row=seed('noop-owner');handle=async()=>({data:{id:'map',sync_revision:7,updated_at:'unchanged'}});await remote.upsertRemoteMap(row);
 assert.deepEqual(calls[0].args.patch,{fields:{},removed:[],versions:null});assert.deepEqual(cache.get('remote-v1:noop-owner').personal[0].fields,row.fields);
 handle=async()=>({data:{format:'mm-wire-1',objects:{},value:['o',{personal:['o',{ids:['a',['map']],changes:['a',[]]}],shared:['o',{ids:['a',[]],changes:['a',[]]}]}]}});
 await remote.loadRemoteMaps('noop-owner');assert.deepEqual(calls.at(-1).args.known_private.map.fields,row.fields);
});
test('a revoked public link never displays its durable cached body',async()=>{
 cache.set('public-share-v2:revoked',{row:{id:'revoked',data:{name:'Cached map'},fields:{},updated_at:'before'},objects:{}});handle=async()=>({data:null});assert.equal(await remote.loadPublicMap('revoked'),null);assert.equal(cache.get('public-share-v2:revoked'),null);
});

test('a stalled refresh releases the account queue and ignores its late stale response',async(t)=>{
 t.mock.timers.enable({apis:['setTimeout']});
 calls.length=0;const row=seed('mobile-timeout-owner');let release;
 const unchanged={data:{format:'mm-wire-1',objects:{},value:['o',{personal:['o',{ids:['a',['map']],changes:['a',[]]}],shared:['o',{ids:['a',[]],changes:['a',[]]}]}]}};
 handle=()=>calls.length===1?new Promise(resolve=>{release=resolve}):unchanged;
 const stalled=remote.loadRemoteMaps('mobile-timeout-owner');
 const rejected=assert.rejects(stalled,/map-sync-timeout/);
 const recovery=remote.loadRemoteMaps('mobile-timeout-owner');
 for(let i=0;i<30&&!release;i++)await Promise.resolve();
 assert.equal(typeof release,'function');assert.equal(calls.length,1);
 t.mock.timers.tick(15000);
 await rejected;const recovered=await recovery;
 assert.equal(calls[0].signal.aborted,true);assert.equal(calls.length,2);
 assert.deepEqual(recovered.personal,[row]);
 release({data:{format:'mm-wire-1',objects:{},value:['o',{personal:['o',{ids:['a',[]],changes:['a',[]]}],shared:['o',{ids:['a',[]],changes:['a',[]]}]}]}});
 for(let i=0;i<10;i++)await Promise.resolve();
 assert.deepEqual((await remote.loadRemoteMaps('mobile-timeout-owner')).personal,[row]);
});
