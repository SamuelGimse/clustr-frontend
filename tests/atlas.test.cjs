const assert = require('node:assert/strict');
const test = require('node:test');
const { buildModel, pageStocks } = require('../atlas/atlas.js');

global.window = {};
require('../js/util.js');
const util = window.ClustrUtil;

test('Zero-rated articles do not dilute a cluster impact score', () => {
  assert.equal(util.articleImpactScore([0, 2]), 2);
  assert.equal(util.articleImpactScore([0, 0]), 0);
});

test('Atlas keeps all snapshots and uses the latest report on each US market day', () => {
  const publishes = [
    { id: 1, created_at: '2026-11-06T08:00:00Z' },
    { id: 2, created_at: '2026-11-06T14:00:00Z' },
    { id: 3, created_at: '2026-11-07T10:00:00Z' }
  ];
  const group = articles => [{ name: 'Energy', articles }];
  const groups = new Map([
    ['1', group([{ link: 'https://example.com/a', rating: -3 }])],
    ['2', group([{ link: 'https://example.com/a', rating: 0 }, { link: 'https://example.com/b', rating: 2 }])],
    ['3', group([{ link: 'https://example.com/c', rating: 4 }])]
  ]);
  const days = buildModel(publishes, groups, 'days', util);
  assert.deepEqual(days.columns.map(publish => publish.id), [2, 3]);
  assert.equal(days.themes[0].entries[0].score, 2);
  assert.equal(days.themes[0].entries[0].articles, 2);
  assert.equal(days.storyCount, 3);
  assert.equal(days.themeCount, 1);
  const snapshots = buildModel(publishes, groups, 'publishes', util);
  assert.deepEqual(snapshots.columns.map(publish => publish.id), [1, 2, 3]);
  assert.equal(snapshots.themes[0].count, 3);
});

test('Stock rows combine linked cluster scores once per cluster and keep link types', () => {
  const publishes = [{ id: 4, created_at: '2026-11-07T10:00:00Z', market: 'US' }];
  const groups = new Map([['4', [
    { name: 'Defense', articles: [{ rating: 3 }], fixed_stocks: [{ symbol: 'LMT', name: 'Lockheed Martin' }], close_stocks: [{ symbol: 'LMT' }] },
    { name: 'Conflict', articles: [{ rating: -2 }], mentioned_stocks: [{ symbol: 'LMT' }] },
    { name: 'Energy', articles: [{ rating: 0 }], fixed_stocks: [{ symbol: 'XOM' }] }
  ]]]);
  const model = buildModel(publishes, groups, 'days', util);
  const lmt = model.stocks.find(stock => stock.symbol === 'LMT');
  assert.equal(lmt.company, 'Lockheed Martin');
  assert.equal(lmt.entries[0].links.length, 2);
  assert.equal(lmt.entries[0].score, util.articleImpactScore([3, -2]));
  assert.deepEqual(lmt.entries[0].links[0].layers, ['Close link', 'Cluster default']);
  assert.equal(model.stocks.find(stock => stock.symbol === 'XOM').entries[0].score, 0);
});

test('Stock search is applied before ten-row paging', () => {
  const stocks = Array.from({ length: 25 }, (_, index) => ({ symbol: `S${index}`, company: index % 2 ? 'Alpha' : 'Beta' }));
  const first = pageStocks(stocks, '', 10);
  assert.equal(first.matches.length, 25);
  assert.equal(first.visible.length, 10);
  assert.deepEqual(pageStocks(stocks, '', 20).visible.slice(10).map(stock => stock.symbol), stocks.slice(10, 20).map(stock => stock.symbol));
  const filtered = pageStocks(stocks, 'alpha', 10);
  assert.equal(filtered.matches.length, 12);
  assert.equal(filtered.visible.length, 10);
  assert.equal(pageStocks(stocks, 'alpha', 20).visible.length, 12);
});


test('Default basket changes use prior constituents, equal weights, paired coverage and no input mutation', () => {
  const publishes=[1,2,3,4].map(id=>({id,market:'US',created_at:`2026-11-0${id}T12:00:00Z`}));
  const groups=new Map([
    ['1',[{name:'Energy',stance_score:3,fixed_stocks:[{symbol:'AAA',priceAtPublish:100},{symbol:'BBB',priceAtPublish:1000},{symbol:'NOQUOTE'},{symbol:'AAA',priceAtPublish:100}]}]],
    ['2',[{name:'Energy',stance_score:-2,fixed_stocks:[{symbol:'CCC',priceAtPublish:500}]},{name:'Other',close_stocks:[{symbol:'AAA',priceAtPublish:110},{symbol:'BBB',priceAtPublish:900}]}]],
    ['3',[{name:'Energy',stance_score:4,default_symbols:['CCC'],stocks:[{symbol:'CCC',price_at_publish:1000}]}]],
    ['4',[{name:'Energy',stance_score:1,default_symbols:['CCC']}]]
  ]);
  const before=JSON.stringify([...groups]);
  const entries=buildModel(publishes,groups,'days',util).themes.find(row=>row.name==='Energy').entries;
  assert.equal(entries[0].priceChange,null);
  assert(Math.abs(entries[1].priceChange)<1e-10);assert.equal(entries[1].priced,2);assert.equal(entries[1].priceTotal,3);
  assert.equal(entries[1].score,-2);assert.equal(entries[2].priceChange,100);assert.equal(entries[2].priceTotal,1);
  assert.equal(entries[3].priceChange,null);assert.equal(entries[3].priced,0);assert.equal(entries[3].priceTotal,1);
  assert.equal(JSON.stringify([...groups]),before);
});

test('Stock prices prefer saved snapshot fields, deduplicate aliases, preserve missing prices and avoid later data', () => {
  const publishes=[1,2,3,4].map(id=>({id,market:'US',created_at:`2026-11-0${id}T12:00:00Z`}));
  const groups=new Map([
    ['1',[{name:'Chips',stance_score:3,close_stocks:[{symbol:'INTC',priceAtPublish:'10',price:999}],stocks:[{symbol:'INTC',price:100}]}]],
    ['2',[{name:'Chips',stance_score:-4,close_stocks:[{symbol:'INTC',price_at_publish:11}]}]],
    ['3',[{name:'Chips',stance_score:2,close_stocks:[{symbol:'INTC',priceAtPublish:0},{symbol:'BAD',priceAtPublish:-1,resolved:false}]}]],
    ['4',[{name:'Chips',stance_score:1,close_stocks:[{symbol:'INTC',price:15}]}]]
  ]);
  const model=buildModel(publishes,groups,'days',util),row=model.stocks.find(stock=>stock.symbol==='INTC');
  assert.deepEqual(row.entries.map(entry=>entry.price),[10,11,null,15]);
  assert(Math.abs(row.entries[1].priceChange-10)<1e-10);assert.equal(row.entries[2].priceChange,null);assert.equal(row.entries[3].priceChange,null);
  assert.equal(row.entries[0].priceChange,null);assert.equal(row.entries[0].links.length,1);assert.equal(model.stocks.length,1);
  assert.equal(row.entries[1].score,-4);
  const earlier=buildModel(publishes.slice(0,2),groups,'days',util).stocks[0];
  assert.deepEqual(earlier.entries,row.entries.slice(0,2));
});

test('Price comparisons follow daily granularity and remain isolated by market', () => {
  const publishes=[{id:1,market:'US',created_at:'2026-11-01T10:00:00Z'},{id:2,market:'US',created_at:'2026-11-01T16:00:00Z'},{id:3,market:'NO',created_at:'2026-11-02T12:00:00Z'},{id:4,market:'US',created_at:'2026-11-03T12:00:00Z'},{id:5,market:'NO',created_at:'2026-11-04T12:00:00Z'}];
  const groups=new Map([10,20,500,30,505].map((price,i)=>[String(i+1),[{name:'Chips',fixed_stocks:[{symbol:'INTC',priceAtPublish:price}]}]]));
  const reports=buildModel(publishes,groups,'publishes',util);
  assert.equal(reports.stocks.find(row=>row.market==='US').entries[1].priceChange,100);
  const days=buildModel(publishes,groups,'days',util);
  assert.deepEqual(days.columns.map(row=>row.id),[2,3,4,5]);
  const us=days.stocks.find(row=>row.market==='US'),no=days.stocks.find(row=>row.market==='NO');
  assert.equal(us.entries[2].priceChange,50);assert(Math.abs(no.entries[3].priceChange-1)<1e-10);
  const theme=days.themes[0];assert.equal(theme.entries[1].priceChange,null);assert.equal(theme.entries[2].priceChange,50);assert(Math.abs(theme.entries[3].priceChange-1)<1e-10);
});

test('History renders price and impact together for clusters and stocks without additional data requests', async () => {
  const atlas=require('../atlas/atlas.js');
  const nodes=new Map();
  const element=()=>({innerHTML:'',textContent:'',firstChild:{},scrollLeft:0,scrollTop:0,scrollWidth:100,handlers:{},classList:{add(){},remove(){}},querySelector:()=>null,addEventListener(type,fn){this.handlers[type]=fn;}});
  const root={innerHTML:'',querySelector:selector=>{if(!nodes.has(selector))nodes.set(selector,element());return nodes.get(selector);},querySelectorAll:()=>[]};
  const publishes=[1,2,3].map(id=>({id,market:'US',created_at:`2026-11-0${id}T12:00:00Z`}));let reads=0;
  global.window={ClustrUtil:util,ClustrApi:{fetchHistorySummaries:async()=>{reads++;return publishes;},loadGroupsForPublish:async publish=>[{name:'Chips',stance_score:publish.id,articles:[{title:'<sample>',rating:-4,impact_timeframe:{duration_min_days:5,duration_max_days:60}}],fixed_stocks:[{symbol:'INTC',priceAtPublish:publish.id===2?null:publish.id*10}]}]}};
  atlas.invalidate();await atlas.render(root);
  assert.match(nodes.get('#atlasMatrix').innerHTML,/Defaults —/);assert.match(nodes.get('#atlasDetail').innerHTML,/Default-stock price change/);
  nodes.get('[aria-label="Atlas rows"]').handlers.click({target:{closest:()=>({dataset:{atlasEntity:'stocks'}})}});
  assert.match(nodes.get('#atlasMatrix').innerHTML,/Price 30.00/);assert.match(nodes.get('#atlasDetail').innerHTML,/Stock price/);assert.match(nodes.get('#atlasDetail').innerHTML,/linked-cluster news impact/);
  const priceChart=nodes.get('#atlasDetail').innerHTML.split('Saved stock price over report history')[1].split('</svg>')[0];
  assert.match(priceChart,/d="M[^L]+M/,'missing prices must break the line');assert.equal(reads,1);
  global.window.document={documentElement:{dataset:{viewMode:'simple'}}};
  await atlas.render(root);
  assert.doesNotMatch(root.innerHTML,/data-atlas-mode|data-atlas-entity/);
  assert.doesNotMatch(nodes.get('#atlasMatrix').innerHTML,/atlas-price-change|saved price|default-stock price/);
  assert.doesNotMatch(nodes.get('#atlasDetail').innerHTML,/Default-stock price change|Stock price|Source breadth/);
  global.window.document.documentElement.dataset.viewMode='advanced';await atlas.render(root);
  nodes.get('[aria-label="Atlas rows"]').handlers.click({target:{closest:()=>({dataset:{atlasEntity:'clusters'}})}});
  assert.match(nodes.get('#atlasDetail').innerHTML,/Article evidence/);
  assert.match(nodes.get('#atlasDetail').innerHTML,/5–60 days/);
  assert.doesNotMatch(nodes.get('#atlasDetail').innerHTML,/\[object Object\]/);
  assert.equal(reads,1);delete global.window.document;
  atlas.invalidate();delete global.window.ClustrApi;
});
