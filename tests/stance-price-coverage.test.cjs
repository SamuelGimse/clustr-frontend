const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function setup() {
  const context = { window: {}, console };
  vm.createContext(context);
  const read = file => fs.readFileSync(path.join(__dirname, '../js', file), 'utf8');
  vm.runInContext(read('util.js'), context);
  context.window.ClustrTaxonomy = { canonicalName: name => name, mergeGroups: groups => groups };
  context.window.ClustrQuotes = { getQuotes: async () => ({}) };
  vm.runInContext(read('api.js').replace('  window.ClustrApi = {', '  window.extractRows = stanceHistoryFromPublishes;\n  window.ClustrApi = {'), context);
  vm.runInContext(read('render.js').replace('  window.ClustrRender = {', '  window.enrichRows = attachDefaultReturns;\n  window.ClustrRender = {'), context);
  return context.window;
}
const publish = (id, groups, market = 'US') => ({ id, market, created_at: `2026-11-0${id}T15:00:00Z`, groups_json: groups });
const near = (a, b) => assert(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('A removed default can use its price elsewhere in the next same-market publish', async () => {
  const app = setup();
  const publishes = [
    publish(1, [{ name: 'AI', fixed_stocks: [{ symbol: 'AAA', priceAtPublish: 100 }] }]),
    publish(2, [{ name: 'AI', fixed_stocks: [{ symbol: 'BBB', priceAtPublish: 300 }] }, { name: 'Energy', close_stocks: [{ symbol: 'AAA', priceAtPublish: 110 }, { symbol: 'EXTRA', priceAtPublish: 900 }] }]),
    publish(3, [{ name: 'AI', fixed_stocks: [{ symbol: 'AAA', priceAtPublish: 900 }] }]),
  ];
  const before = JSON.stringify(publishes);
  const rows = app.extractRows('AI', publishes, {}, { market: 'US', asOf: publishes[1].created_at });
  const enriched = await app.enrichRows(rows);
  near(enriched[0].defaultRet, 10);
  assert.equal(enriched[0].sampleN, 1);
  assert.equal(enriched[0].totalN, 1);
  assert.equal(rows[0].defaults[0].symbol, 'AAA');
  assert.equal(rows[1].defaults[0].symbol, 'BBB');
  assert.equal(rows.length, 2);
  assert.equal(JSON.stringify(publishes), before);
});

test('String defaults, empty aliases and snake-case snapshots work without cross-market contamination', async () => {
  const app = setup();
  const publishes = [
    publish(1, [{ name: 'AI', fixed_stocks: [], default_symbols: ['AAA'] }, { name: 'Other', stocks: [{ symbol: 'AAA', price_at_publish: 50 }] }]),
    publish(2, [{ name: 'AI', fixed_stocks: [], default_stocks: [{ symbol: 'AAA' }] }, { name: 'Other', stocks: [{ symbol: 'AAA', price: 999, market: 'NO' }, { symbol: 'AAA', price_at_publish: 55 }] }]),
  ];
  const rows = app.extractRows('AI', publishes, {}, { market: 'US', asOf: publishes[1].created_at });
  const enriched = await app.enrichRows(rows);
  assert.equal(rows[0].defaults[0].priceAtPublish, 50);
  assert.equal(rows[1].prices.AAA, 55);
  near(enriched[0].defaultRet, 10);
});

test('Invalid snapshots cannot become zero returns or borrow prices from other markets', async () => {
  const app = setup();
  const publishes = [
    publish(1, [{ name: 'AI', fixed_stocks: [{ symbol: 'AAA', priceAtPublish: 100 }] }]),
    publish(2, [{ name: 'AI', fixed_stocks: [{ symbol: 'AAA', priceAtPublish: '', price: null }] }, { name: 'Other', stocks: [{ symbol: 'AAA', price: false }, { symbol: 'AAA', price: 50, market: 'NO' }, { symbol: 'AAA', price: 200, resolved: false }] }]),
  ];
  const rows = app.extractRows('AI', publishes, {}, { market: 'US', asOf: publishes[1].created_at });
  assert.equal(rows[1].prices.AAA, undefined);
  assert.equal((await app.enrichRows(rows))[0].defaultRet, null);
});
