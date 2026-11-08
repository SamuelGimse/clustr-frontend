const test=require('node:test');
const assert=require('node:assert/strict');
const {buildGraph,layout,safeUrl}=require('../connections/connections');
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
