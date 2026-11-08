const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => process.argv.includes('--staged') ? require('node:child_process').execFileSync('git', ['show', `:js/${name}`], {encoding:'utf8'}) : fs.readFileSync(path.join(__dirname, '../js', name), 'utf8');
const context = { window: {}, console, setTimeout, requestAnimationFrame: fn => fn() };
vm.createContext(context);
vm.runInContext(read('util.js'), context);
const util = context.window.ClustrUtil;
let renderSource = read('render.js');
vm.runInContext(renderSource.replace('  window.ClustrRender = {', '  window.audit = {stockBuckets, sameEventHtml, clusterScoreHtml, stanceHtml, historyRowScore, basketSincePublish, weeklyVelocity, attachDefaultReturns, mountStanceChart, renderRelatedClusters};\n  window.ClustrRender = {'), context);
const audit = context.window.audit;
context.window.ClustrTaxonomy = require('../js/cluster-taxonomy.js');
for (const name of ['Earnings shocks','Regulation & policy','Climate & disasters','Aviation accidents','Crypto hacks','Other','Fusion energy']) {
  const input = {name,fixed_stocks:[{symbol:'AAPL'}],default_symbols:['AAPL'],mentioned_stocks:[{symbol:'LLY'}]};
  const [clean] = context.window.ClustrTaxonomy.mergeGroups([input]);
  assert.equal(clean.fixed_stocks.length,0);
  assert.equal(clean.default_symbols.length,0);
  assert.equal(clean.mentioned_stocks[0].symbol,'LLY');
  assert(!audit.stockBuckets(input).groups.some(g=>g.id==='fixed'));
}
const legacyEarnings = {name:'Earnings shocks',fixed_stocks:[{symbol:'AAPL'}],default_symbols:['AAPL'],mentioned_stocks:[{symbol:'KDP'}],articles:[{rating:3}]};
const [cleanEarnings] = require('../js/cluster-taxonomy.js').mergeGroups([legacyEarnings]);
assert.equal(cleanEarnings.fixed_stocks.length,0);
assert.equal(cleanEarnings.default_symbols.length,0);
assert.equal(cleanEarnings.mentioned_stocks[0].symbol,'KDP');
assert.equal(legacyEarnings.fixed_stocks.length,1);
assert(!audit.stockBuckets(legacyEarnings).groups.some(g=>g.id==='fixed'));
const comparison = audit.stockBuckets({...legacyEarnings,name:'Semiconductors'}).groups.find(g=>g.id==='fixed');
assert.equal(comparison.label,'Theme comparison basket');
assert.match(comparison.description,/does not establish exposure/);
const duplicate = { rating: -4, event_id: 'recall', source: '<Source>', title: 'Recall' };
const independent = { rating: 4, event_id: 'approval' };
assert.equal(util.articleImpactScore([...Array(20).fill(duplicate), independent]), 0);
assert.equal(util.articleImpactScore([{rating:0,event_id:'a'},{rating:2,event_id:'a'}]), 1);
assert.equal(util.articleImpactScore([{rating:2},{rating:2}]), 2);
assert.match(audit.clusterScoreHtml({articles:[duplicate,duplicate,independent]}), /Cluster rating 0/);
assert.match(audit.sameEventHtml(duplicate,[duplicate,duplicate,independent]), /Same event ×2/);
assert.match(audit.sameEventHtml(duplicate,[duplicate,duplicate]), /&lt;Source&gt;/);
assert.equal(audit.sameEventHtml(independent,[duplicate,independent]), '');
const taxonomy = require('../js/cluster-taxonomy.js');
assert.equal(taxonomy.clusterScore([duplicate,duplicate,independent]), 0);
const [mergedEvents] = taxonomy.mergeGroups([
  {name:'AI', articles:[{link:'https://a.test/recall',rating:-4,event_id:'event:0'},{link:'https://b.test/recall',rating:-4,event_id:'event:0'}]},
  {name:'Artificial Intelligence', articles:[{link:'https://a.test/approval',rating:4,event_id:'event:0'}]}
]);
assert.equal(mergedEvents.cluster_score,0);
assert.equal(mergedEvents.event_count,2);
const relatedPanel = { innerHTML: '', querySelectorAll: () => [] };
audit.renderRelatedClusters('Related clusters', [
  { name: '<Positive>', articles: [{ rating: 5 }] },
  { name: 'Negative', articles: [{ rating: -4 }] },
  { name: 'Neutral', articles: [{ rating: 0 }] },
  { name: 'Missing', articles: [] }
], { classList: { contains: () => false }, querySelector: () => relatedPanel });
assert.match(relatedPanel.innerHTML, /&lt;Positive&gt;/);
assert.match(relatedPanel.innerHTML, /related-impact--constructive[^>]*>\+5<\/span>/);
assert.match(relatedPanel.innerHTML, /related-impact--cautious[^>]*>-4<\/span>/);
assert.match(relatedPanel.innerHTML, /related-impact--watch[^>]*>0<\/span>/);
assert.match(relatedPanel.innerHTML, /Cluster impact unavailable[^>]*>—<\/span>/);
assert.equal(util.exponentialMeanRating([0, 0]), 0);
assert.equal(util.exponentialMeanRating([null, '', undefined]), null);
assert(util.exponentialMeanRating([1, 0, 0, 0]) >= 0);
assert.match(audit.clusterScoreHtml({articles:[{rating:1}]}), /POS/);
assert.match(audit.stanceHtml({articles:[{rating:1}]}), /Constructive/);
assert(!audit.stanceHtml({articles:[{rating:1}]}).includes('data-stance-history'));
assert(!audit.clusterScoreHtml({articles:[{rating:0}]}).includes('NO SCORES'));
assert.equal(audit.historyRowScore({stance:'constructive'}), null);
assert.equal(audit.historyRowScore({stanceScore:0}), 0);
const history = [-5,-4,-3,-2,-1,0,1].map((stanceScore, i) => ({date:`2026-11-0${i+1}T12:00:00Z`, stanceScore}));
assert.equal(audit.weeklyVelocity(history, '2026-11-07T18:00:00Z').slope, 1);
assert.equal(audit.weeklyVelocity(history.slice(0,2), '2026-11-07'), null);
const dstHistory=[{date:'2026-10-25T00:30:00Z',stanceScore:9},{date:'2026-10-25T02:30:00Z',stanceScore:2},{date:'2026-10-26T12:00:00Z',stanceScore:3},{date:'2026-10-27T12:00:00Z',stanceScore:4}];
assert.equal(audit.weeklyVelocity(dstHistory,'2026-10-27T18:00:00Z').count,3);
assert.equal(audit.weeklyVelocity(dstHistory,'2026-10-27T18:00:00Z').delta,2);

(async () => {
  context.window.ClustrQuotes = { getQuotes: async symbols => Object.fromEntries(symbols.map(symbol => [symbol,{price:symbol==='S12'?200:100}])) };
  const basket = await audit.basketSincePublish(Array.from({length:13},(_,i)=>({symbol:`S${i}`,priceAtPublish:100})));
  assert.equal(basket.priced, 13); assert(Math.abs(basket.average - 100/13) < 1e-9);
  const coverage = await audit.basketSincePublish([{symbol:'S1',priceAtPublish:null},{symbol:'S2',priceAtPublish:100}]);
  assert.equal(coverage.priced,1); assert.equal(coverage.total,2);

  const pending = {};
  const race = { window:{ClustrQuotes:{getQuote:symbol=>new Promise(resolve=>pending[symbol]=resolve)}}, findStock:symbol=>({symbol,priceAtPublish:100}), priceBarHtml:(symbol,name,pub,pct,quote)=>`${symbol}:${quote?.price??'pending'}`, priceMount:{innerHTML:'',querySelector:()=>null}, bubblesEl:{querySelectorAll:()=>[]}, showRelatedForSymbol(){}, applyChartMode(){}, chartMode:'impact', stockRequest:0, activeSymbol:'', activeName:'' };
  vm.createContext(race);
  race.group = { __historyScope: { asOf: '2026-11-01' } };
  const start=renderSource.indexOf('    const showChart = async (symbol, name) => {');
  vm.runInContext(renderSource.slice(start,renderSource.indexOf('    if (chartFolder) {',start))+'\nglobalThis.show=showChart;',race);
  const a=race.show('AAA'), b=race.show('BBB'); pending.BBB({price:200}); await b; pending.AAA({price:101}); await a;
  assert.equal(race.priceMount.innerHTML,'BBB:200');
  const groupPending = {};
  const groupRace = {groupRequest:0, sinceEl:{}, stockGroups:[{id:'a',label:'A',list:['a']},{id:'b',label:'B',list:['b']}],select:{value:'a'}, group:{__historyScope:{}}, basketSincePublish:list=>new Promise(resolve=>groupPending[list[0]]=resolve), util};
  vm.createContext(groupRace);
  const groupStart=renderSource.indexOf('    async function updateGroupSincePublish(');
  vm.runInContext(renderSource.slice(groupStart,renderSource.indexOf('    function renderBubbleGroup(',groupStart))+'\nglobalThis.update=updateGroupSincePublish;',groupRace);
  const oldGroup=groupRace.update('a'); groupRace.select.value='b'; const newGroup=groupRace.update('b');
  groupPending.b({average:2,priced:1,total:1}); await newGroup; groupPending.a({average:-9,priced:1,total:1}); await oldGroup;
  assert.match(groupRace.sinceEl.innerHTML, />B</); assert(!groupRace.sinceEl.innerHTML.includes('-9.00'));

  context.window.ClustrApp = {getPublishes:()=>[{id:2,market:'US',created_at:'2026-11-07'},{id:1,market:'US',created_at:'2026-11-01'}],getPublishIndex:()=>1};
  let quoteCalls=0; context.window.ClustrQuotes={getQuotes:async()=>{quoteCalls++;return {AAA:{price:200}}}};
  const older = await audit.attachDefaultReturns([{date:'2026-11-01',defaults:[{symbol:'AAA',priceAtPublish:100}]}],{market:'US',asOf:'2026-11-01'});
  assert.equal(older[0].defaultRet,null); assert.equal(quoteCalls,0);

  context.window.ClustrTaxonomy={canonicalName:name=>name,mergeGroups:groups=>groups};
  vm.runInContext(read('api.js').replace('  window.ClustrApi = {','  window.historyExtract = stanceHistoryFromPublishes;\n  window.ClustrApi = {'),context);
  const pub=(id,market,date,score)=>({id,market,created_at:date,groups_json:[{name:'Banking',stance_score:score}]});
  const scoped=context.window.historyExtract('Banking',[pub(1,'US','2026-11-01',2),pub(2,'NO','2026-11-01',-4),pub(3,'US','2026-11-07',5)],{}, {market:'US',asOf:'2026-11-02'});
  assert.equal(scoped.length,1); assert.equal(scoped[0].stanceScore,2);
  let chartConfig;
  context.getComputedStyle=()=>({getPropertyValue:()=> '#999999'});
  context.document={documentElement:{}};
  context.window.Chart=function(canvas,config){chartConfig=config;this.destroy=()=>{};};
  audit.mountStanceChart({getContext:()=>({})},[
    {date:'2026-11-01',stanceScore:2,defaultRet:1,priceBasis:'next',sampleN:1,totalN:2},
    {date:'2026-11-04',stance:'constructive',defaultRet:null,priceBasis:'unavailable',sampleN:0,totalN:2}
  ]);
  assert.equal(chartConfig.options.scales.x.type,'linear');
  assert.equal(chartConfig.data.datasets[0].data[1].y,null);
  assert.equal(chartConfig.data.datasets[0].spanGaps,false);
  assert.equal(chartConfig.data.datasets[1].data[1].x,Date.parse('2026-11-04'));
  console.log('Card logic passed: scores, weekly velocity, basket coverage, quote race, market/date scope and historical returns.');
})().catch(error=>{console.error(error);process.exitCode=1;});
