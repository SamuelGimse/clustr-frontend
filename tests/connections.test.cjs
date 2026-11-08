const test=require('node:test');
const assert=require('node:assert/strict');
const {buildGraph,layout,safeUrl,matches,windowRange,mergeReports,loadWindow}=require('../connections/connections');
const {simulation}=require('../connections/canvas');
test('connection renderer loads before app boot and navigation entry is present',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  assert.ok(html.indexOf('src="connections/canvas.js')<html.indexOf('src="connections/connections.js'));
  assert.ok(html.indexOf('src="connections/connections.js')<html.indexOf('src="js/app.js'));
  assert.match(html,/id="navConnections"/);
});
test('network deduplicates shared stock/news nodes while preserving relationship types and markets',()=>{
  const article={title:'New factory',link:'https://example.com/factory'};
  const graph=buildGraph([
    {name:'AI',market:'US',stance_score:0,mentioned_stocks:[{symbol:'NVDA'}],stocks:[{symbol:'NVDA'}],articles:[article]},
    {name:'Chips',market:'US',fixed_stocks:[{symbol:'NVDA'}],articles:[article]},
    {name:'Norway',market:'NO',stocks:[{symbol:'NVDA'}],articles:[]}
  ],'US');
  assert.equal(graph.nodes.filter(n=>n.type==='stock').length,1);
  assert.equal(graph.nodes.filter(n=>n.type==='news').length,1);
  assert.equal(graph.nodes.find(n=>n.label==='AI').score,0);
  assert.ok(graph.edges.some(e=>e.kind==='Mentioned'));
  assert.ok(graph.edges.some(e=>e.kind==='Default exposure'));
  assert.ok(graph.edges.every(e=>e.from.startsWith('cluster:')));
  assert.equal(graph.nodes.filter(n=>n.type==='cluster').length,2);
  for(const point of layout(graph.nodes).values())assert.ok(Number.isFinite(point.x)&&point.x>=0&&point.x<=1200&&point.y>=0&&point.y<=800);
});
test('force layout uses stable finite buffers and supports empty graphs',()=>{
  const graph=buildGraph([{name:'AI',stocks:[{symbol:'NVDA'}],articles:[{title:'Story'}]}]);
  const engine=simulation(graph,layout(graph.nodes));
  assert.equal(engine.positions.length,graph.nodes.length*2);
  for(let i=0;i<100;i++)engine.step();
  assert.ok([...engine.positions].every(Number.isFinite));
  assert.equal(simulation(buildGraph([]),new Map()).positions.length,0);
});
test('unsafe source links, unresolved tickers and missing scores are handled without inventing data',()=>{
  const graph=buildGraph([{name:'No score',articles:[{title:'Unsafe',link:'javascript:alert(1)'}],stocks:[{symbol:'BAD',resolved:false}]}]);
  assert.equal(graph.nodes.find(n=>n.type==='cluster').score,null);
  assert.equal(graph.nodes.filter(n=>n.type==='stock').length,0);
  assert.equal(graph.nodes.find(n=>n.type==='news').url,'');
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.deepEqual(buildGraph([]),{nodes:[],edges:[]});
});
test('one edge preserves default and evidenced exposure without alias duplicates',()=>{
  const stock={symbol:'NVDA'};
  const graph=buildGraph([{name:'AI',mentioned_stocks:[stock],fixed_stocks:[stock],stocks:[stock]},
    {name:'Legacy',direct_stocks:[stock],fixed_stocks:[stock]}]);
  assert.equal(graph.nodes.filter(n=>n.type==='stock').length,1);
  assert.equal(graph.edges.length,2);
  assert.deepEqual(graph.edges[0].kinds,['Mentioned','Default exposure']);
  assert.equal(graph.edges[0].kind,'Mentioned');
  assert.deepEqual(graph.edges[1].kinds,['Default exposure','Direct link']);
  assert.equal(graph.edges[1].kind,'Direct link');
});
test('news tracking parameters deduplicate but different article identities remain separate',()=>{
  const graph=buildGraph([{articles:[
    {link:'https://example.com/news?id=1&utm_source=a#story'},
    {link:'https://example.com/news?utm_source=b&id=1'},
    {link:'https://example.com/news?id=2'}]}]);
  assert.equal(graph.nodes.filter(n=>n.type==='news').length,2);
  assert.equal(graph.edges.length,2);
  assert.equal(safeUrl('https://user:secret@example.com/news'),'');
});
test('malformed reports and invalid scores cannot fabricate scored opportunities',()=>{
  assert.deepEqual(buildGraph({groups:[]}),{nodes:[],edges:[]});
  const graph=buildGraph([null,{score:false,stocks:{},articles:[null]},
    {stance_score:20,cluster_score:'-3'}, {stance_score:' ',score:0}]);
  assert.deepEqual(graph.nodes.map(n=>n.score),[null,-3,0]);
});
test('search supports company names, news sources, summaries and type filtering',()=>{
  const graph=buildGraph([{name:'AI',stocks:[{symbol:'NVDA',name:'NVIDIA'}],
    articles:[{title:'Investment',source:'Example Wire',short_summary:'New datacenter capacity'}]}]);
  assert.equal(graph.nodes.filter(n=>matches(n,'NVIDIA','stock')).length,1);
  assert.equal(graph.nodes.filter(n=>matches(n,'example wire','news')).length,1);
  assert.equal(graph.nodes.filter(n=>matches(n,'datacenter','news')).length,1);
  assert.equal(graph.nodes.filter(n=>matches(n,'NVDA','cluster')).length,0);
});
test('Graph palettes keep all node types distinct against light and dark surfaces',()=>{
  const {palette}=require('../connections/canvas');
  const luminance=rgb=>rgb.map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  for(const [light,bg]of[[true,[1,1,1]],[true,[224/255,212/255,172/255]],[false,[16/255,28/255,36/255]]]){
    for(const type of ['cluster','stock','news']){
      const a=luminance(palette(light)[type]),b=luminance(bg);
      assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=3,`${type} needs visible contrast`);
    }
  }
});

test('GPU adapter rejection falls back and gestures do not select accidentally',async()=>{
  const vm=require('node:vm'),fs=require('node:fs');
  let disconnected=false,cancelled=false;
  const ctx=new Proxy({},{get:()=>()=>{}});
  const labels={getContext:()=>ctx,addEventListener(){},setPointerCapture(){}};
  const pixels={width:1200,height:800},backend={};
  const container={querySelector:s=>s==='.cx-pixels'?pixels:s==='.cx-labels'?labels:backend,
    getBoundingClientRect:()=>({width:1200,height:800})};
  const sandbox={navigator:{gpu:{requestAdapter:async()=>{throw Error('Unavailable');}}},
    window:{matchMedia:()=>({matches:true}),devicePixelRatio:1},
    ResizeObserver:class{observe(){}disconnect(){disconnected=true;}},
    requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{cancelled=true;},
    getComputedStyle:()=>({color:'white'})};
  sandbox.window.ClustrConnections={matches};
  vm.runInNewContext(fs.readFileSync(require.resolve('../connections/canvas'),'utf8'),sandbox);
  const graph=buildGraph([{name:'AI'}]);let selections=0;
  const scene=sandbox.window.ClustrGraphCanvas.mount(container,graph,layout(graph.nodes),()=>selections++);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(backend.textContent,'Canvas 2D');
  labels.onpointerdown({pointerId:1,offsetX:600,offsetY:218});
  labels.onpointerdown({pointerId:2,offsetX:700,offsetY:218});
  labels.onpointermove({pointerId:2,offsetX:800,offsetY:218});
  labels.onpointerup({pointerId:2,offsetX:800,offsetY:218});
  labels.onpointerup({pointerId:1,offsetX:600,offsetY:218});
  assert.equal(selections,0);
  scene.reset();
  labels.onpointerdown({pointerId:3,offsetX:600,offsetY:218});
  labels.onpointerup({pointerId:3,offsetX:600,offsetY:218});
  assert.equal(selections,1);
  scene.destroy();assert.ok(disconnected&&cancelled);
});
test('network windows are exactly 24, 48 or 72 hours ending at the selected report',()=>{
  const publish={created_at:'2026-11-08T14:00:00Z'};
  for(const days of [1,2,3])assert.equal(windowRange(publish,days).end-windowRange(publish,days).start,days*86400000);
  assert.throws(()=>windowRange(publish,7));
  assert.throws(()=>windowRange({},1));
});
test('multi-day networks merge clusters and preserve latest scores and evidence',()=>{
  const rows=[{publish:{market:'US',created_at:'2026-11-07T14:00:00Z'},groups:[{name:'AI',stance_score:-4,reason:'Older',mentioned_stocks:[{symbol:'AMD'}],articles:[{title:'Older',link:'https://example.com/old'},{title:'Shared old',link:'https://example.com/shared?utm_source=old'}]}]},
    {publish:{market:'US',created_at:'2026-11-08T14:00:00Z'},groups:[{name:'AI',stance_score:0,reason:'Latest',fixed_stocks:[{symbol:'NVDA'}],articles:[{title:'Shared latest',link:'https://example.com/shared'}]}]},
    {publish:{market:'NO',created_at:'2026-11-08T14:00:00Z'},groups:[{name:'Wrong market'}]}];
  const before=JSON.stringify(rows),groups=mergeReports(rows,'US');
  assert.equal(groups.length,1);assert.equal(groups[0].stance_score,0);assert.equal(groups[0].reason,'Latest');
  assert.equal(groups[0].articles.length,2);assert.equal(groups[0].articles[0].title,'Shared latest');
  assert.equal(buildGraph(groups,'US').nodes.filter(n=>n.type==='stock').length,2);
  assert.equal(JSON.stringify(rows),before,'saved publish objects are not mutated');
});
test('history fetch excludes future, wrong market and out-of-window reports',async()=>{
  const selected={id:3,market:'US',created_at:'2026-11-08T14:00:00Z'};
  const loaded=[];
  const api={fetchPublishesInRange:async(start,end)=>{
    assert.equal(end.toISOString(),selected.created_at.replace('Z','.000Z'));
    assert.equal(end-start,2*86400000);
    return [selected,{id:2,market:'US',created_at:'2026-11-07T14:00:00Z'},
      {id:1,market:'US',created_at:'2026-11-06T14:00:00Z'},
      {id:4,market:'NO',created_at:'2026-11-08T13:00:00Z'},
      {id:5,market:'US',created_at:'2026-11-08T15:00:00Z'}];
  },loadGroupsForPublish:async p=>{loaded.push(p.id);return [{name:'AI'}];}};
  const result=await loadWindow(selected,2,api);
  assert.equal(result.reports,2);assert.deepEqual(loaded.sort(),[2,3]);assert.equal(result.groups.length,1);
});
test('history errors reject rather than silently showing an incomplete window',async()=>{
  const p={id:1,market:'US',created_at:'2026-11-08T14:00:00Z'};
  await assert.rejects(loadWindow(p,1,{fetchPublishesInRange:async()=>{throw Error('Offline');}}),/Offline/);
  await assert.rejects(loadWindow(p,1,{fetchPublishesInRange:async()=>[p],loadGroupsForPublish:async()=>{throw Error('Unavailable');}}),/Unavailable/);
});
