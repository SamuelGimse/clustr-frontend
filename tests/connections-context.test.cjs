const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

test('Network opens the supplied preview snapshot and retains the selected stock when changing range', async()=>{
  const elements=new Map(),created=[];let reads=0;
  const make=()=>({innerHTML:'',textContent:'',value:'',style:{},attrs:{},children:[],contains:()=>true,classList:{add(){},remove(){}},setAttribute(key,value){this.attrs[key]=value;},focus(){this.focused=true;},scrollIntoView(){},addEventListener(){},insertAdjacentHTML(where,html){this.innerHTML=where==='afterbegin'?html+this.innerHTML:this.innerHTML+html;},append(...nodes){this.children.push(...nodes);},before(node){this.previous=node;},querySelector(selector){if(!elements.has(selector))elements.set(selector,make());return elements.get(selector);}});
  const host=make(),nav=make();
  const document={getElementById:id=>id==='connectionsView'?host:id==='navConnections'?nav:null,createElement:tag=>{const node=make();node.tag=tag;created.push(node);return node;}};
  const publish={id:7,market:'US',created_at:'2026-11-06T12:00:00Z'};
  const groups=[{name:'Chips',stance_score:3,fixed_stocks:[{symbol:'NVDA',name:'NVIDIA',priceAtPublish:123.45,changePercentAtPublish:-2.25},{symbol:'AMD',name:'AMD',priceAtPublish:50}],articles:[{title:'Saved story',link:'https://example.com/saved'}]}];
  const window={ClustrWatchlist:{filterGroups:groups=>groups,getItems:()=>[{symbol:'NVDA',name:'NVDA',market:'US'},{symbol:'AMD',name:'AMD',market:'US'}]},matchMedia:()=>({matches:false}),ClustrApi:{fetchPublishesInRange:async()=>{reads++;return [publish];},loadGroupsForPublish:async()=>groups}};
  const context={window,document,module:{exports:{}},URL,Date};vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/util.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../connections/connections.js'),'utf8'),context);
  const api=context.module.exports;
  await api.mount([],publish,{days:1,windowGroups:groups,reportCount:1,focusId:'stock:US:NVDA'});
  assert.equal(reads,0);assert.match(elements.get('.cx-inspector-body').innerHTML,/<h2>NVDA<\/h2>/);assert.match(elements.get('svg').innerHTML,/cx-selected[^>]*data-node="stock:US:NVDA"/);
  assert.match(created.findLast(node=>node.className==='cx-scope').textContent,/Last 1 day.*6 Nov 2026/);
  assert.match(elements.get('.cx-inspector-body').innerHTML,/Saved price/);assert.match(elements.get('.cx-inspector-body').innerHTML,/123.45/);assert.match(elements.get('.cx-inspector-body').innerHTML,/-2.25%/);assert.match(elements.get('.cx-inspector-body').innerHTML,/cx-impact--up">\+3/);
  const search=elements.get('[data-watchlist-search]');search.value='NVIDIA';search.oninput({target:search});
  assert.match(elements.get('.cx-stock-list').innerHTML,/stock:US:NVDA/);assert.doesNotMatch(elements.get('.cx-stock-list').innerHTML,/stock:US:AMD/);
  host.onkeydown({key:'Escape',target:search,preventDefault(){}});assert.match(elements.get('.cx-stock-list').innerHTML,/stock:US:AMD/);
  host.onclick({target:{closest:()=>({dataset:{node:'stock:US:AMD'}})}});
  assert.match(elements.get('.cx-inspector-body').innerHTML,/<h2>AMD<\/h2>/);assert.match(elements.get('.cx-inspector-body').innerHTML,/50.00/);
  const period=created.find(node=>node.attrs['aria-label']==='Network time range');assert.equal(period.value,'1');period.value='2';period.onchange();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(reads,1);assert.match(elements.get('.cx-inspector-body').innerHTML,/<h2>AMD<\/h2>/);assert.match(created.findLast(node=>node.className==='cx-scope').textContent,/Last 2 days/);
  host.onclick({target:{closest:()=>({dataset:{node:'cluster:0'}})}});
  window.ClustrApi.loadGroupsForPublish=async()=>[{name:'Earlier additional cluster'},...groups];
  const currentPeriod=created.findLast(node=>node.attrs['aria-label']==='Network time range');currentPeriod.value='3';currentPeriod.onchange();await new Promise(resolve=>setImmediate(resolve));
  assert.match(elements.get('.cx-inspector-body').innerHTML,/<h2>Chips<\/h2>/);assert.match(elements.get('svg').innerHTML,/cx-selected[^>]*data-node="cluster:1"/);

});
