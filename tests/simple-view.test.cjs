const test = require('node:test');
const assert = require('node:assert/strict');
global.window = {};
require('../js/util.js');
const simple = require('../js/simple-view.js');
const util = window.ClustrUtil;

test('Simple trend uses the latest matching daily score, excludes future and other markets, and leaves missing scores missing', () => {
  const reports = [
    {market:'US',created_at:'2026-11-01T12:00:00Z',groups_json:[{name:'Energy',stance_score:-4}]},
    {market:'US',created_at:'2026-11-01T18:00:00Z',groups_json:[{name:'Energy',stance_score:2}]},
    {market:'NO',created_at:'2026-11-02T12:00:00Z',groups_json:[{name:'Energy',stance_score:9}]},
    {market:'US',created_at:'2026-11-02T18:00:00Z',groups_json:[{name:'Energy'}]},
    {market:'US',created_at:'2026-11-03T18:00:00Z',groups_json:[{name:'Energy',stance_score:10}]}
  ];
  const points = simple.historyPoints(reports,'Energy',Date.parse('2026-11-02T20:00:00Z'));
  assert.deepEqual(points.map(p=>p.value),[2,null]);
  const svg = simple.chart(points,'<Energy>');
  assert.match(svg,/&lt;Energy&gt;/);
  assert.equal((svg.match(/<circle /g)||[]).length,1);
  assert.doesNotMatch(svg,/NaN|Infinity/);
});

test('Simple stock page renders a separate price and news layout without advanced indicators', async () => {
  const price={innerHTML:''}, linked={innerHTML:''}, body={innerHTML:'',querySelector:s=>s==='[data-simple-price]'?price:linked};
  const host={hidden:true,innerHTML:'',querySelector:()=>body};
  const group={name:'Banks',stance_score:3,articles:[{title:'JPM expands',source:'Test',rating:3}],momentum_5d:5};
  Object.assign(window,{
    document:{getElementById:()=>host,documentElement:{dataset:{viewMode:'simple'}}},
    ClustrApp:{getPublishes:()=>[{created_at:'2026-11-09T12:00:00Z',market:'US'}],getPublishIndex:()=>0,getGroups:()=>[group]},
    ClustrConnections:{buildGraph:()=>({nodes:[{id:'stock:US:JPM',type:'stock',label:'JPM',name:'JPMorgan'},{id:'cluster:0',type:'cluster',group}],edges:[{from:'cluster:0',to:'stock:US:JPM'}]}),safeUrl:()=>null},
    ClustrWatchlist:{getItems:()=>[],button:()=>''},
    ClustrQuotes:{getLatestQuotes:async()=>({JPM:{price:334.49,changePercent:-.84,asOf:'2026-11-09T12:00:00Z'}})}
  });
  await simple.render('stocks');
  assert.match(body.innerHTML,/simple-stock-browser/);
  assert.match(price.innerHTML,/334.49/);
  assert.match(price.innerHTML,/-0.84%/);
  assert.match(linked.innerHTML,/JPM expands/);
  assert.doesNotMatch(body.innerHTML+price.innerHTML+linked.innerHTML,/Momentum|Volatility|Volume vs|Saved price baseline|Since publish|price-bar|stock-analysis/);
  simple.hide();assert.equal(host.hidden,true);
});
