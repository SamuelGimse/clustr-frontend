const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

test('Network opens the supplied preview snapshot and retains the selected stock when changing range', async()=>{
  const elements=new Map(),created=[];let reads=0;
  const make=()=>({innerHTML:'',textContent:'',value:'',style:{},attrs:{},children:[],classList:{add(){},remove(){}},setAttribute(key,value){this.attrs[key]=value;},focus(){this.focused=true;},scrollIntoView(){},addEventListener(){},append(...nodes){this.children.push(...nodes);},before(node){this.previous=node;},querySelector(selector){if(!elements.has(selector))elements.set(selector,make());return elements.get(selector);}});
  const host=make(),nav=make();
  const document={getElementById:id=>id==='connectionsView'?host:id==='navConnections'?nav:null,createElement:tag=>{const node=make();node.tag=tag;created.push(node);return node;}};
  const publish={id:7,market:'US',created_at:'2026-11-06T12:00:00Z'};
  const groups=[{name:'Chips',fixed_stocks:[{symbol:'NVDA',name:'NVIDIA'}],articles:[{title:'Saved story',link:'https://example.com/saved'}]}];
  const window={matchMedia:()=>({matches:false}),ClustrApi:{fetchPublishesInRange:async()=>{reads++;return [publish];},loadGroupsForPublish:async()=>groups}};
  const context={window,document,module:{exports:{}},URL,Date};vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../connections/connections.js'),'utf8'),context);
  const api=context.module.exports;
  await api.mount([],publish,{days:1,windowGroups:groups,reportCount:1,focusId:'stock:US:NVDA'});
  assert.equal(reads,0);assert.match(elements.get('.cx-inspector').innerHTML,/<h2>NVDA<\/h2>/);assert.match(elements.get('svg').innerHTML,/cx-selected[^>]*data-node="stock:US:NVDA"/);
  assert.match(created.findLast(node=>node.className==='cx-scope').textContent,/Last 1 day.*6 Nov 2026/);
  const period=created.find(node=>node.attrs['aria-label']==='Network time range');assert.equal(period.value,'1');period.value='2';period.onchange();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(reads,1);assert.match(elements.get('.cx-inspector').innerHTML,/<h2>NVDA<\/h2>/);assert.match(created.findLast(node=>node.className==='cx-scope').textContent,/Last 2 days/);
});
