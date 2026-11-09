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

test('legacy separate watchlist cards migrate to the combined card once',()=>{
  assert.deepEqual(ordered(['watch-workspace','report-totals'],['dash-network-panel','watch-news','report-totals']),['watch-workspace','report-totals']);
});
test('grid layouts persist only valid known geometry and exclude content',()=>{
  const {cleanLayout,loadLayout,saveLayout,LAYOUT_KEY}=require('../dashboard/workspace');
  const good={id:'a',x:0,y:10,w:3,h:20,content:'<script>unsafe</script>'};
  assert.deepEqual(cleanLayout([good,good,{id:'b',x:11,y:0,w:3,h:20},{id:'b',x:0,y:0,w:13,h:20},{id:'gone',x:0,y:0,w:6,h:20}],['a','b']),[{id:'a',x:0,y:10,w:3,h:20}]);
  const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
  assert(saveLayout(storage,[good]));assert(!data.get(LAYOUT_KEY).includes('content'));
  assert.deepEqual(loadLayout(storage,['a']),[{id:'a',x:0,y:10,w:3,h:20}]);
  storage.setItem(LAYOUT_KEY,'bad');assert.deepEqual(loadLayout(storage,['a']),[]);
  assert(!saveLayout({setItem(){throw Error('blocked');}},[good]));
});
test('library is pinned locally and the custom pointer sorter has been removed',()=>{
  const fs=require('node:fs'),path=require('node:path'),html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),source=fs.readFileSync(path.join(__dirname,'../dashboard/workspace.js'),'utf8');
  assert(html.indexOf('vendor/gridstack-14.1.0/gridstack-all.js')<html.indexOf('dashboard/workspace.js'));
  assert(fs.existsSync(path.join(__dirname,'../vendor/gridstack-14.1.0/LICENSE')));
  assert(!source.includes("board.addEventListener('pointermove'"));
  assert(source.includes("mode:'compact'"));assert(source.includes('columnMax:12'));
});

test('freeform sizes include non-preset widths and preserve manual height mode',()=>{
  const {cleanLayout}=require('../dashboard/workspace');
  assert.deepEqual(cleanLayout([{id:'a',x:6,y:4,w:5,h:34,sizeToContent:false}],['a']),[{id:'a',x:6,y:4,w:5,h:34,sizeToContent:false}]);
  assert.deepEqual(cleanLayout([{id:'a',x:8,y:0,w:5,h:2}],['a']),[]);
});
