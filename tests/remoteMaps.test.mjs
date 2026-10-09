import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {applySyncDelta,knownVersions} from '../src/lib/syncCache.js';import {decodeWire,dataPatch,applyEventDelta,requestMapBundle} from '../src/lib/syncWire.js';
import { rebasePersonalMap } from '../src/lib/personalMapMerge.js';
const cache=new Map(),calls=[];let handle;
// These save/rebase fixtures also cover compatibility with an unupgraded server.
const dependencies={supabase:{rpc:(name,args)=>{if(name!=='sync_map_manifest')calls.push({name,args});const request=Promise.resolve().then(()=>name==='sync_map_manifest'?{error:{code:'PGRST202'}}:handle(name,args));request.abortSignal=signal=>{if(name!=='sync_map_manifest')calls.at(-1).signal=signal;return request};return request}},readAccountCache:async key=>cache.get(key)||[],cacheAccountMaps:async(key,value)=>cache.set(key,structuredClone(value)),applySyncDelta,knownVersions,decodeWire,dataPatch,applyEventDelta,requestMapBundle,rebasePersonalMap};
globalThis.__mmRemoteTest=dependencies;
const source=(await fs.readFile(new URL('../src/lib/remoteMaps.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');
const remote=await import('data:text/javascript;base64,'+Buffer.from('const {supabase,readAccountCache,cacheAccountMaps,applySyncDelta,knownVersions,decodeWire,dataPatch,applyEventDelta,requestMapBundle,rebasePersonalMap}=globalThis.__mmRemoteTest;\n'+source).toString('base64'));
delete globalThis.__mmRemoteTest;
function seed(owner){const row={id:'map',user_id:owner,name:'Map',data:{colors:[null,'#fff'],versions:[]},sync_revision:7,fields:{colors:'color-hash',versions:[]}};cache.set('remote-v1:'+owner,{personal:[row],shared:[],objects:{},histories:{}});return row;}
test('explicit restoration verifies that the server map is absent before recreating it',async()=>{
 calls.length=0;const row=seed('restore-owner');handle=async name=>name==='save_personal_map_patch_v2'?{error:{code:'40001'}}:name==='sync_map_bundle_v2'?wireResponse({personal:{ids:[],changes:[]},shared:{ids:[],changes:[]}}):{data:{id:'map',sync_revision:1,fields:row.fields}};
 const result=await remote.upsertRemoteMap(row);assert.equal(result.error,null);assert.deepEqual(calls.map(c=>c.name),['save_personal_map_patch_v2','sync_map_bundle_v2','create_personal_map']);assert.deepEqual(calls[2].args.map_data,row.data);
});

function wireResponse(data) {
 const encode=value=>Array.isArray(value)?['a',value.map(encode)]:value&&typeof value==='object'?['o',Object.fromEntries(Object.entries(value).map(([key,child])=>[key,encode(child)]))]:value;
 return {data:{format:'mm-wire-1',objects:{},value:encode(data)}};
}

test('simultaneous refreshes reuse checked canonical data but notifications and history requests fetch immediately', async () => {
 calls.length=0; const row=seed('dedup-owner');
 handle=async()=>wireResponse({personal:{ids:['map'],changes:[]},shared:{ids:[],changes:[]}});
 await Promise.all([remote.loadRemoteMaps('dedup-owner'),remote.loadRemoteMaps('dedup-owner')]);
 assert.equal(calls.length,1);
 assert.deepEqual((await remote.loadRemoteMaps('dedup-owner')).personal,[row]); assert.equal(calls.length,1);
 await remote.loadRemoteMaps('dedup-owner',null,{force:true}); assert.equal(calls.length,2);
 await remote.loadRemoteMaps('dedup-owner','team'); assert.equal(calls.length,3);
});

test('a revision conflict refreshes and replays only local edits instead of uploading a stale full map',async()=>{
 calls.length=0;const row=seed('conflict-owner');row.data={isGameMode:true,completed:[0,1,2],progressCompleted:[0],colors:['#fff','#fff','#fff'],activityLog:[],lastPaintedAt:'2026-10-04T10:00:00Z',versions:[]};
 const base=structuredClone(row),local={...row,data:{...row.data,progressCompleted:[0,1],activityLog:[{date:'2026-10-05',cells:1}],lastPaintedAt:'2026-10-05T10:00:00Z'}};
 const latest={...row,name:'Renamed elsewhere',sync_revision:8,data:{...row.data,progressCompleted:[0,2],activityLog:[{date:'2026-10-05',cells:1}],lastPaintedAt:'2026-10-05T11:00:00Z'}};
 let patches=0;
 handle=async(name,args)=>{
  if(name==='sync_map_bundle_v2')return wireResponse({personal:{ids:['map'],changes:[{id:'map',user_id:row.user_id,name:latest.name,sync_revision:8,patch:{fields:Object.fromEntries(Object.keys(latest.data).map(key=>[key,'hash-'+key])),data:latest.data}}]},shared:{ids:[],changes:[]}});
  assert.equal(name,'save_personal_map_patch_v2');
  if(++patches===1)return {error:{code:'40001'}};
  assert.equal(args.expected_revision,8);assert.equal(args.map_name,latest.name);
  assert.deepEqual(new Set(args.patch.fields.progressCompleted),new Set([0,1,2]));
  assert.deepEqual(args.patch.fields.activityLog,[{date:'2026-10-05',cells:2}]);
  assert.equal(Object.hasOwn(args.patch.fields,'lastPaintedAt'),false);
  return {data:{id:'map',sync_revision:9}};
 };
 const result=await remote.upsertRemoteMap(local,base);assert.equal(result.error,null);
 assert.deepEqual(calls.map(call=>call.name),['save_personal_map_patch_v2','sync_map_bundle_v2','save_personal_map_patch_v2']);
 assert.equal(result.data.data.progressCompleted.length,3);
});

test('autosave does not resurrect a map deleted on another device',async()=>{
 calls.length=0;const base=seed('deleted-owner');
 handle=async name=>name==='save_personal_map_patch_v2'?{error:{code:'40001'}}:wireResponse({personal:{ids:[],changes:[]},shared:{ids:[],changes:[]}});
 const result=await remote.upsertRemoteMap(base,base);assert.equal(result.error,null);assert.equal(result.data,null);
 assert.deepEqual(calls.map(call=>call.name),['save_personal_map_patch_v2','sync_map_bundle_v2']);
});
test('a remote resize automatically merges local strokes into the current grid',async()=>{
 calls.length=0;const row=seed('geometry-owner');row.data={mapType:'free',gridMode:'manual',manualRows:'10',manualCols:'10',totalCells:'100',completed:[0],progressCompleted:[],colors:['#fff']};
 const base=structuredClone(row),local={...row,data:{...row.data,completed:[0,1,12],colors:Array.from({length:13},(_,i)=>i===12?'#123':'#fff')}},latest={...row,data:{...row.data,manualCols:'11',totalCells:'110',completed:[0,22],colors:Array.from({length:23},(_,i)=>i===22?'#456':'#fff')}};
 cache.set('remote-v1:geometry-owner',{personal:[latest],shared:[],objects:{},histories:{}});
 handle=async(name)=>{assert.equal(name,'save_personal_map_patch_v2');return {data:{id:'map',sync_revision:8}}};
 const result=await remote.upsertRemoteMap(local,base);
 assert.equal(result.error,null);assert.equal(result.data.data.manualCols,'11');
 assert.deepEqual(new Set(result.data.data.completed),new Set([0,1,13,22]));
 assert.equal(result.data.data.colors[13],'#123');assert.equal(result.data.data.colors[22],'#456');assert.equal(calls.length,1);
});

test('rapid image resizes and external progress converge automatically',async()=>{
 calls.length=0;const row=seed('rapid-image-owner');
 row.data={mapType:'image',gridMode:'auto',totalCells:'100',image:'same-image',imageRatio:1,imageOffset:{cellsEdited:false},completed:[0],progressCompleted:[],colors:['#fff'],activityLog:[],versions:[]};
 const base=structuredClone(row);
 const resized=count=>({...row,data:{...row.data,totalCells:String(count),completed:[0,1],colors:['#fff','#fff']}});
 handle=async(name,args)=>{assert.equal(name,'save_personal_map_patch_v2');return {data:{id:'map',sync_revision:args.expected_revision+1}}};
 const first=await remote.upsertRemoteMap(resized(400),base);assert.equal(first.error,null);
 const second=await remote.upsertRemoteMap(resized(1000),base);assert.equal(second.error,null);
 assert.equal(second.data.data.totalCells,'1000');assert.equal(calls[1].args.expected_revision,8);
 assert.equal(calls[1].args.patch.fields.totalCells,'1000');
 assert.equal(rebasePersonalMap(base,second.data,second.data),second.data);
 const external={...first.data,data:{...first.data.data,progressCompleted:[1]}};
 const combined=rebasePersonalMap(base,resized(1000),external,first.data);
 assert.deepEqual(combined.data.progressCompleted,[1]);assert.equal(combined.data.totalCells,'1000');
 assert.equal(rebasePersonalMap(base,resized(1000),{...first.data,data:{...first.data.data,totalCells:'900'}},first.data).data.totalCells,'1000');
});

test('resizes from the top or left preserve stroke coordinates and clearing progress',()=>{
 const base={name:'Map',data:{mapType:'free',gridMode:'manual',totalCells:4,manualRows:2,manualCols:2,completed:[0],progressCompleted:[0],colors:['red'],imageOffset:{gridOrigin:{x:0,y:0}}}};
 const local={...base,data:{...base.data,completed:[0,3],progressCompleted:[]}};
 const server={...base,data:{...base.data,totalCells:9,manualRows:3,manualCols:3,completed:[4,5],progressCompleted:[4,5],colors:[null,null,null,null,'red','blue'],imageOffset:{gridOrigin:{x:1,y:1}}}};
 const merged=rebasePersonalMap(base,local,server).data;
 assert.deepEqual(new Set(merged.completed),new Set([4,5,8]));assert.deepEqual(merged.progressCompleted,[5]);assert.equal(merged.colors[5],'blue');
});

test('an empty canonical cache fetches the existing map before any write',async()=>{
 calls.length=0;const owner='empty-cache-owner';const row={id:'map',user_id:owner,name:'Map',data:{mapType:'free',totalCells:4,completed:[],progressCompleted:[1],colors:[]}};
 handle=async(name)=>name==='sync_map_bundle_v2'?wireResponse({personal:{ids:['map'],changes:[{...row,sync_revision:7,patch:{fields:{progressCompleted:'remote-progress'},data:{...row.data,progressCompleted:[2]}}}]},shared:{ids:[],changes:[]}}):{data:{id:'map',sync_revision:8}};
 const result=await remote.upsertRemoteMap(row,null);
 assert.equal(result.error,null);assert.deepEqual(new Set(result.data.data.progressCompleted),new Set([1,2]));
 assert.deepEqual(calls.map(call=>call.name),['sync_map_bundle_v2','save_personal_map_patch_v2']);
});

test('a busy map requests automatic retry instead of blocking on a version choice',async()=>{
 calls.length=0;const row=seed('busy-owner');
 handle=async name=>name==='sync_map_bundle_v2'?wireResponse({personal:{ids:['map'],changes:[]},shared:{ids:[],changes:[]}}):{error:{code:'40001'}};
 const result=await remote.upsertRemoteMap(row,row);assert.equal(result.error.code,'MM_SYNC_RETRY');
 assert.equal(calls.filter(call=>call.name==='save_personal_map_patch_v2').length,3);
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
