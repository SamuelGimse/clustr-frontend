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

test('Native Simple tabs retain their mounted interactive models', () => {
  const host={hidden:false,innerHTML:'keep me'};
  window.document={getElementById:()=>host,documentElement:{dataset:{viewMode:'simple'}}};
  simple.render('stocks');assert.equal(host.hidden,true);assert.equal(host.innerHTML,'keep me');
});

test('Report calendar uses market dates and handles leap months and Monday offsets',()=>{
  assert.equal(simple.etDay('2026-11-09T02:00:00Z'),'2026-11-08');
  const feb=simple.calendarDays('2024-02');assert.equal(feb.filter(Boolean).length,29);assert.equal(feb[3],'2024-02-01');
  const nov=simple.calendarDays('2026-11');assert.equal(nov[6],'2026-11-01');assert.equal(nov.at(-1),'2026-11-30');
});

test('Weekly comparison uses the prior basket, matched positive prices, and unique symbols',()=>{
  const items=[
    {publish:{created_at:'2026-11-01T12:00:00Z'},group:{fixed_stocks:[{symbol:'A',priceAtPublish:100},{symbol:'A',priceAtPublish:100},{symbol:'B',priceAtPublish:50},{symbol:'C',priceAtPublish:0}]}},
    {publish:{created_at:'2026-11-02T12:00:00Z'},group:{fixed_stocks:[{symbol:'A',priceAtPublish:110},{symbol:'D',priceAtPublish:999}]}}
  ];
  const result=simple.basketInterval(items);
  assert.equal(result.count,1);assert.equal(result.total,2);assert.ok(Math.abs(result.value-10)<1e-9);
  assert.equal(simple.basketInterval([]),null);
  assert.equal(simple.basketInterval([items[0],{publish:items[1].publish,group:{fixed_stocks:[{symbol:'A',priceAtPublish:-1}]}}]),null);
});
