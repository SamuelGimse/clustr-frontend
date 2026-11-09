const test=require('node:test'),assert=require('node:assert/strict');
const {ordered,loadOrder,saveOrder,analysis,extraCards,KEY}=require('../dashboard/workspace');
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
test('saved order restores known cards, deduplicates IDs and appends new cards',()=>{
  assert.deepEqual(ordered(['a','b','c'],['b','b','gone',null,'a']),['b','a','c']);
  assert.deepEqual(ordered(['a'],{a:1}),['a']);
  const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
  assert(saveOrder(storage,['b','a']));assert.equal(data.get(KEY),'["b","a"]');
  assert.deepEqual(loadOrder(storage,['a','b','c']),['b','a','c']);
  storage.setItem(KEY,'invalid json');assert.deepEqual(loadOrder(storage,['a','b']),['a','b']);
  assert(!saveOrder({setItem(){throw Error('Blocked');}},['a']));
  assert.deepEqual(loadOrder({getItem(){throw Error('Blocked');}},['a']),['a']);
});
const summary={latest:{created_at:'2026-11-09T12:00:00Z'},reports:5,themes:[{name:'<Energy>',score:0,articles:3,sources:2,delta:0},{name:'Missing',score:null,articles:0,sources:0,delta:null}],days:[{date:'2026-11-09T12:00:00Z',positive:0,negative:0}],clusterTrends:[{name:'<Energy>',days:[{date:'2026-11-08',score:null},{date:'2026-11-09',score:0}]}],stocks:[],stories:5,rated:2,sourceCount:1,sources:[['A',4]],allSources:[['A',4]],articles:[{rating:0,date:'2026-11-09T11:00:00Z'},{rating:-3,date:'2026-11-09T00:00:00Z'},{rating:'',date:'bad'},{rating:11,date:'2026-11-10T00:00:00Z'},{rating:null,date:'2026-11-07T00:00:00Z'}]};
test('analytics preserve zero ratings and distinguish unavailable and later timestamps',()=>{
  const a=analysis(summary);assert.equal(a.scored,2);assert.equal(a.unscoredClusters,1);
  assert.deepEqual(a.bands,[['Negative',1],['Neutral',1],['Positive',0],['Unrated',3]]);
  assert.deepEqual(a.ages.map(row=>row[1]),[1,1,1,0,2]);
});
test('advanced cards escape labels, keep stable unique IDs and do not mutate source data',()=>{
  const before=JSON.stringify(summary),cards=extraCards(summary,esc),html=cards.map(c=>c.html).join('');
  assert(cards.length>=12);assert.equal(new Set(cards.map(c=>c.id)).size,cards.length);
  assert(html.includes('&lt;Energy&gt;'));assert(!html.includes('<Energy>'));
  assert(html.includes('latest 0.0'));assert(html.includes('Unrated'));
  assert.equal(JSON.stringify(summary),before);
});

test('daily chart labels use the US report date rather than the UTC date',()=>{
  const {marketDay}=require('../dashboard/workspace');
  assert.equal(marketDay('2026-11-09T01:00:00Z'),'2026-11-08');
  assert.equal(marketDay('2026-11-09'),'2026-11-09');assert.equal(marketDay('bad'),'Unavailable');
});
