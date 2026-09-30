import test from 'node:test';
import assert from 'node:assert/strict';
import { cardDragPosition, cardDropIndex } from '../src/lib/cardDrag.js';
import { openApp, hasInstalledApp } from '../src/lib/appLaunch.js';

test('stationary pointer remains anchored through vertical wheel scrolling in both directions', () => {
  const start = { x: 120, y: 240, scrollX: 0, scrollY: 300 };
  for (const scrollY of [650, 900, 210, 0, 300]) {
    const result = cardDragPosition(start, { x: 120, y: 240 }, { x: 0, y: scrollY });
    assert.equal(240 - (scrollY - 300) + result.dy, 240);
    assert.equal(result.dx, 0);
  }
});
test('scrolling and pointer movement combine without a jump on the next move', () => {
  const start = { x: 120, y: 240, scrollX: 10, scrollY: 300 };
  const before = cardDragPosition(start, { x: 120, y: 240 }, { x: 40, y: 700 });
  const after = cardDragPosition(start, { x: 125, y: 247 }, { x: 40, y: 700 });
  assert.equal(after.dy - before.dy, 7);
  assert.equal(after.dx - before.dx, 5);
});
test('drop target uses actual row positions for unequal card heights, gaps and last row', () => {
  const slots = [{left:0,top:0,width:200,height:300},{left:220,top:0,width:200,height:470},{left:0,top:490,width:200,height:260}];
  assert.equal(cardDropIndex({x:50,y:450},slots),2);
  assert.equal(cardDropIndex({x:260,y:450},slots),1);
  assert.equal(cardDropIndex({x:250,y:700},slots),2);
});
function setup({standalone=false,installed=false,prompt=null}={}) {
  const calls=[];
  const win={matchMedia:()=>({matches:standalone}),navigator:{},location:{origin:'https://www.mapmethod.ru',assign:(url)=>calls.push(url)}};
  return {calls,options:{win,installed,prompt,showHelp:()=>calls.push('help'),clearPrompt:()=>calls.push('clear')}};
}
test('unknown or missing installation never launches an unregistered protocol silently',async()=>{
  const {calls,options}=setup();
  assert.equal(await openApp(options),'help');
  assert.deepEqual(calls,['help']);
});
test('standalone app does not recursively launch itself',async()=>{
  const {calls,options}=setup({standalone:true,installed:true});
  assert.equal(await openApp(options),'standalone');
  assert.deepEqual(calls,[]);
});
test('Windows desktop app does not offer browser installation or launch itself again',async()=>{
  const {calls,options}=setup();
  options.win.mapMethodDesktop={isDesktop:true};
  assert.equal(await openApp(options),'standalone');
  assert.deepEqual(calls,[]);
});
test('confirmed installation gets a launch attempt AND instructions if OS handler is missing',async()=>{
  const {calls,options}=setup({installed:true});
  assert.equal(await openApp(options),'requested');
  assert.deepEqual(calls,['help','web+mapmethod://open']);
});
test('installation cancellation and failure consume the prompt without launching a tab or protocol',async()=>{
  for(const fails of [false,true]) {
    const {calls,options}=setup({prompt:{prompt:async()=>{if(fails) throw Error('cancelled');},userChoice:Promise.resolve({outcome:'dismissed'})}});
    assert.equal(await openApp(options),fails?'help':'dismissed');
    assert.deepEqual(calls,fails?['help','clear']:['clear']);
  }
});
test('installed-app detection only accepts this site and handles unsupported or rejected APIs',async()=>{
  const origin='https://www.mapmethod.ru';
  assert.equal(await hasInstalledApp({},origin),false);
  assert.equal(await hasInstalledApp({getInstalledRelatedApps:async()=>{throw Error();}},origin),false);
  assert.equal(await hasInstalledApp({getInstalledRelatedApps:async()=>[{platform:'webapp',url:'https://other.example/manifest.webmanifest'}]},origin),false);
  assert.equal(await hasInstalledApp({getInstalledRelatedApps:async()=>[{platform:'webapp',url:origin+'/manifest.webmanifest'}]},origin),true);
});


test('desktop app is recognised by its manifest id and launches when initial detection was stale',async()=>{
  const origin='https://www.mapmethod.ru';
  const related={platform:'webapp',id:origin+'/'};
  assert.equal(await hasInstalledApp({getInstalledRelatedApps:async()=>[related]},origin),true);
  assert.equal(await hasInstalledApp({getInstalledRelatedApps:async()=>[{platform:'webapp',url:'/manifest.webmanifest',id:origin+'/'}]},origin),true);
  assert.equal(await hasInstalledApp({getInstalledRelatedApps:async()=>[{platform:'webapp',id:'https://other.example/'}]},origin),false);
  const {calls,options}=setup();
  options.win.navigator.getInstalledRelatedApps=async()=>[related];
  assert.equal(await openApp(options),'requested');
  assert.deepEqual(calls,['help','web+mapmethod://open']);
});

test('desktop related-app configuration supplies the canonical app id',async()=>{
  const {readFile}=await import('node:fs/promises');
  const manifest=JSON.parse(await readFile(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'));
  const origin='https://www.mapmethod.ru';
  const self=manifest.related_applications.find((app)=>app.platform==='webapp');
  assert.equal(self.id,new URL(manifest.id,origin).href);
  assert.equal(self.url,origin+'/manifest.webmanifest');
});
