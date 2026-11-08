const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/render.js'), 'utf8');
function setup() {
  const charts = [];
  const context = { window: {}, document: { documentElement: {} }, console,
    getComputedStyle: () => ({ getPropertyValue: () => '#999999' }) };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/util.js'), 'utf8'), context);
  context.window.Chart = function (_canvas, config) { this.config = config; this.destroy = () => { this.destroyed = true; }; charts.push(this); };
  vm.runInContext(source.replace('  window.ClustrRender = {', '  window.audit = { stanceChartSeries, mountStanceChart, mountStanceHistory, stanceChartShellHtml };\n  window.ClustrRender = {'), context);
  return { audit: context.window.audit, charts };
}
const plain = value => JSON.parse(JSON.stringify(value));
const near = (a, b) => assert(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const rows = [
  { date: '2026-11-01T12:00:00Z', stanceScore: -2, defaultRet: 10, priceBasis: 'next', sampleN: 2, totalN: 2 },
  { date: '2026-11-01T20:00:00Z', stanceScore: -3, defaultRet: -10, priceBasis: 'next', sampleN: 1, totalN: 2 },
  { date: '2026-11-02T20:00:00Z', stanceScore: -2, defaultRet: 0, priceBasis: 'latest quote', sampleN: 2, totalN: 2 },
];

test('Cumulative price compounds returns with a zero baseline and interval endpoint timestamps', () => {
  const { audit } = setup();
  const before = JSON.stringify(rows), now = Date.parse('2026-11-03T12:00:00Z');
  const series = audit.stanceChartSeries(rows, { cumulativePrice: true }, now);
  assert.equal(series.retData[0].y, 0);
  near(series.retData[1].y, 10);
  near(series.retData[2].y, -1);
  near(series.retData[3].y, -1);
  assert.equal(series.retData[1].x, Date.parse(rows[1].date));
  assert.equal(series.retData[3].x, now);
  assert.equal(series.priceIncomplete, false);
  assert.equal(JSON.stringify(rows), before);
});

test('Cumulative stance uses the last publish per US calendar day, retains zero and gaps', () => {
  const { audit } = setup();
  const data = rows.concat([
    { date: '2026-11-03T20:00:00Z', stanceScore: null },
    { date: '2026-11-04T20:00:00Z', stanceScore: 0 },
    { date: '2026-11-05T20:00:00Z', stanceScore: 4 },
  ]);
  assert.deepEqual(plain(audit.stanceChartSeries(data, { cumulativeStance: true }).stanceData.map(point => point.y)), [-3, -5, null, -5, -1]);
  assert.deepEqual(plain(audit.stanceChartSeries(rows).stanceData.map(point => point.y)), [-2, -3, -2]);
  const midnight = [
    { date: '2026-11-02T01:00:00Z', stanceScore: 2 },
    { date: '2026-11-02T04:00:00Z', stanceScore: 3 },
    { date: '2026-11-02T06:00:00Z', stanceScore: 4 },
  ];
  assert.deepEqual(plain(audit.stanceChartSeries(midnight, { cumulativeStance: true }).stanceData.map(point => point.y)), [3, 7]);
});

test('Missing prices leave gaps but accumulation never resets to zero', () => {
  const { audit } = setup();
  const incomplete = rows.map((row, i) => ({ ...row, defaultRet: i === 1 ? null : row.defaultRet }));
  const series = audit.stanceChartSeries(incomplete, { cumulativePrice: true });
  assert.equal(series.retData[0].y, 0); near(series.retData[1].y, 10);
  assert.equal(series.retData[2].y, null);
  near(series.retData[3].y, 10); near(series.retData[4].y, 10);
  assert.equal(series.retData[3].baseline, true);
  assert.equal(series.retData[3].segment, 2);
  assert.equal(series.priceSegments, 2);
  assert.equal(series.priceIncomplete, true);
  assert.deepEqual(plain(audit.stanceChartSeries(incomplete).retData.map(point => point.y)), [10, null, 0]);
  for (const bad of [Infinity, NaN, -101]) {
    assert.equal(audit.stanceChartSeries([{ ...rows[0], defaultRet: bad }], { cumulativePrice: true }).retData[0].y, null);
  }
  near(audit.stanceChartSeries([{ ...rows[0], defaultRet: -100 }, rows[1]], { cumulativePrice: true }).retData[2].y, -100);
});

test('Missing leading prices do not create a false baseline or hide later usable returns', () => {
  const { audit } = setup();
  const series = audit.stanceChartSeries(rows.map((row, i) => ({ ...row, defaultRet: i === 0 ? null : 5 })), { cumulativePrice: true });
  assert.equal(series.retData[0].y, null);
  assert.equal(series.retData[1].baseline, true);
  assert.equal(series.retData[1].x, Date.parse(rows[1].date));
  near(series.retData[2].y, 5); near(series.retData[3].y, 10.25);
  assert.equal(series.priceSegments, 1);
});

test('Switches independently rebuild the chart, preserve zero-centered axes and restore original data', () => {
  const { audit, charts } = setup();
  const button = () => ({ checked: 'true', getAttribute() { return this.checked; }, setAttribute(_name, value) { this.checked = value; }, addEventListener(_name, fn) { this.click = fn; } });
  const stance = button(), price = button(), note = {};
  const canvas = { getContext: () => ({}) };
  const elements = { '.stance-history-canvas': canvas, '[data-cumulative-stance]': stance, '[data-cumulative-price]': price, '[data-stance-chart-note]': note };
  audit.mountStanceHistory({ querySelector: key => elements[key] }, rows.map((row, i) => ({ ...row, date: `2026-11-0${i+1}T20:00:00Z`, stanceScore: -8 })));
  let config = charts.at(-1).config;
  assert.equal(config.data.datasets[0].label, 'Cumulative stance index');
  assert(config.options.scales.yStance.max >= 24);
  assert.equal(config.options.scales.yStance.min, -config.options.scales.yStance.max);
  assert.equal(config.options.scales.yRet.min, -config.options.scales.yRet.max);
  assert.equal(config.options.maintainAspectRatio, false);
  stance.click(); config = charts.at(-1).config;
  assert.equal(charts[0].destroyed, true);
  assert.equal(config.data.datasets[0].label, 'Stance');
  assert.equal(config.options.scales.yStance.max, 10);
  assert.equal(config.data.datasets[1].data[0].baseline, true);
  price.click(); config = charts.at(-1).config;
  assert.equal(config.data.datasets[1].data.length, rows.length);
  assert.equal(config.data.datasets[1].data[0].y, 10);
  assert.equal(config.data.datasets[1].label, 'Defaults → next publish / latest quote %');
  assert.equal(stance.checked, 'false'); assert.equal(price.checked, 'false');
  assert.match(note.textContent, /Summary cards below remain interval averages/);
  assert.match(audit.stanceChartShellHtml(), /role="switch" aria-checked="true"/);
  assert.equal((audit.stanceChartShellHtml().match(/role="switch"/g) || []).length, 2);
});
