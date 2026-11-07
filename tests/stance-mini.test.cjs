const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/render.js'), 'utf8');
const helpers = source.slice(source.indexOf('  function stanceScore('), source.indexOf('  async function attachDefaultReturns('));
function render(rows, cutoff = '2026-11-07') {
  return vm.runInNewContext(`${helpers}\nstanceMiniHtml({name:'Test'})`, {
    window: { ClustrApp: { getPublishes: () => [{ created_at: cutoff }], getPublishIndex: () => 0 } },
    stanceHistoryForCluster: () => rows,
    U: () => ({ escapeHtml: value => String(value).replaceAll('<', '&lt;') })
  });
}
assert.match(render([]), /No history yet/);
const one = render([{ date: '2026-11-01', stanceScore: 2 }]);
assert.match(one, /1 publish</);
assert(!one.includes('<polyline'));
const series = render([
  { date: '2026-11-06', stanceScore: 10 },
  { date: '2026-11-01', stanceScore: -10 },
  { date: '2026-11-08', stanceScore: -5 },
  { date: 'invalid', stanceScore: 4 }
]);
assert.match(series, /2 publishes/);
assert.match(series, /16.0,82.0 384.0,14.0/);
assert.match(series, /latest score 10/);
assert(!series.includes('NaN'));
assert.match(render(Array.from({ length: 40 }, (_, i) => ({ date: new Date(Date.UTC(2026, 8, i + 1)).toISOString(), stanceScore: 0 }))), /30 publishes/);
console.log('Stance preview checks passed: empty, single point, chronology, date cutoff and 30-point limit.');
