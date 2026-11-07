const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/render.js'), 'utf8');
const helpers = source.slice(source.indexOf('  function stanceScore('), source.indexOf('  async function attachDefaultReturns('));
const cutoff = '2026-11-07T18:00:00Z';
function evaluate(expression, history = [], selectedDate = cutoff) {
  return vm.runInNewContext(`${helpers}\n${expression}`, {
    history, selectedDate,
    window: { ClustrApp: { getPublishes: () => [{ created_at: selectedDate }], getPublishIndex: () => 0 } },
    stanceHistoryForCluster: () => history,
    U: () => ({ escapeHtml: value => String(value).replaceAll('<', '&lt;') })
  });
}
const data = (rows, date) => evaluate('stanceTrendData(history, selectedDate)', rows, date);
const rows = scores => scores.map((stanceScore, i) => ({date: `2026-11-0${i + 1}T12:00:00Z`, stanceScore}));
assert.equal(data([]).direction, 'insufficient');
assert.equal(data(rows([1, 2])).direction, 'insufficient');
assert.equal(data(rows([-5, -4, -3])).direction, 'up');
assert.equal(data(rows([6, 4, 2])).direction, 'down');
assert.equal(data(rows([1, 1.1, .9, 1])).direction, 'stable');
assert.equal(data(rows([5, -10, 0, 4])).direction, 'mixed');
const daily = data([
  ...rows([1, 2, 3]),
  {date:'2026-11-01T20:00:00Z', stanceScore:4},
  {date:'2026-11-08T12:00:00Z', stanceScore:9},
  {date:'2026-11-07T20:00:00Z', stanceScore:9},
  {date:'2026-10-31T12:00:00Z', stanceScore:9},
  {date:'bad', stanceScore:3},
  {date:'2026-11-04T12:00:00Z', stanceScore:null, stance:'constructive'},
  {date:'2026-11-05T12:00:00Z', stanceScore:11}
]);
assert.equal(daily.rows.length, 3);
assert.equal(daily.rows[0].score, 4);
assert.equal(daily.delta, -1);
const oslo = data([{date:'2026-11-01T23:30:00Z',stanceScore:1},{date:'2026-11-02T12:00:00Z',stanceScore:2}]);
assert.equal(oslo.rows.length, 1);
assert.equal(oslo.rows[0].score, 2);
const dst = data([{date:'2026-10-25T00:30:00Z',stanceScore:1},{date:'2026-10-25T02:30:00Z',stanceScore:2}], '2026-10-26T12:00:00Z');
assert.equal(dst.rows.length, 1);
assert.equal(dst.rows[0].score, 2);
const html = evaluate("stanceMiniHtml({name:'Test'})", rows([-5, -4, -3]));
assert.match(html, /Strengthening/);
assert.match(html, /Latest −3.0/);
assert.match(html, /\+2.0 pts overall/);
const gap = evaluate("stanceMiniHtml({name:'Test'})", [{date:'2026-11-01',stanceScore:1},{date:'2026-11-04',stanceScore:2}]);
assert.match(gap, /stance-mini-gap/);
assert(!gap.includes('NaN'));
assert.match(evaluate("stanceMiniHtml({name:'Test'})"), /No numeric stance scores/);
console.log('Stance trend checks passed: daily deduplication, 7-day cutoff, Oslo/DST dates, missing scores, trend direction and gaps.');
