const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = {window:{}};
vm.createContext(context);
for (const name of ['util.js','simple-view.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',name),'utf8'),context);
let source = fs.readFileSync(path.join(__dirname,'../js/render.js'),'utf8');
source=source.replace('  window.ClustrRender = {','  window.cardTrend={html:weeklyVelocityHtml,points:weeklyTrendPoints};\n  window.ClustrRender = {');
vm.runInContext(source,context);
context.window.ClustrApp={getPublishes:()=>[{created_at:'2026-11-07T18:00:00Z'}],getPublishIndex:()=>0};
context.window.ClustrApi={localStanceHistory:()=>[]};
assert.match(context.window.cardTrend.html({name:'Test'}),/No scored history/);
const rows=[-5,-3,-1].map((stanceScore,i)=>({date:`2026-11-0${i+3}T18:00:00Z`,stanceScore}));
context.window.ClustrApi.localStanceHistory=()=>rows;
const html=context.window.cardTrend.html({name:'Test'});
assert.match(html,/7-day impact/);
assert.match(html,/\+2.00 pts\/day/);
assert.match(html,/<svg class="simple-line"/);
assert.match(html,/Nov 1/);assert.match(html,/Nov 7/);
// The same chart renderer as Trends, with one observation per day and real gaps.
const points=context.window.cardTrend.points([...rows,
  {date:'2026-11-04T21:00:00Z',stanceScore:null},
  {date:'2026-11-07T19:00:00Z',stanceScore:10},
  {date:'2026-10-31T18:00:00Z',stanceScore:10}
],'2026-11-07T18:00:00Z');
assert.equal(points.length,7);
assert.deepEqual(Array.from(points,p=>p.value),[null,null,-5,null,-1,null,null]);
assert(html.includes(context.window.ClustrSimple.chart(context.window.cardTrend.points(rows,'2026-11-07T18:00:00Z'),'Test',true)));
let scope;
context.window.ClustrApi.localStanceHistory=(name,context)=>{scope=context;return rows;};
const historical=context.window.cardTrend.html({name:'Test',__historyScope:{market:'US',asOf:'2026-11-04T20:00:00Z'}});
assert.equal(scope.asOf,'2026-11-04T20:00:00Z');
assert(!historical.includes('Nov 7'));
console.log('Card trend checks passed: shared Trends chart, report cutoff, daily gaps.');
