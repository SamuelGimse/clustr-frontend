const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const signal = (rank = 3, time = '2026-11-08T12:00:00Z') => ({ source: 'ApeWisdom', metric: 'reddit_stock_mentions', symbol: 'NVDA', market: 'US', rank, value: 50, available_at: time });
function setup() {
  const c = { window: { addEventListener() {} }, console, URL, URLSearchParams };
  vm.createContext(c);
  vm.runInContext(fs.readFileSync('js/util.js','utf8'), c);
  vm.runInContext(fs.readFileSync('js/stocks.js','utf8').replace('  window.ClustrStocks = {', '  window.stockIndex = buildStockIndex;\n  window.ClustrStocks = {'), c);
  vm.runInContext(fs.readFileSync('js/render.js','utf8').replace('  window.ClustrRender = {', '  window.bubble = bubbleBtn;\n  window.ClustrRender = {'), c);
  return c.window;
}
test('Buzz scores are relative rank, deduplicated across clusters, not accumulated', () => {
  const { ClustrUtil: u } = setup();
  const groups = [{ market_signals: [signal(3)] }, { market_signals: [signal(3), signal(1, '2026-11-08T13:00:00Z')] }];
  const buzz = u.redditBuzzForStock(groups, 'nvda', 'US', '2026-11-08T14:00:00Z');
  assert.equal(buzz.score, 100); assert.equal(buzz.value, 50);
  assert.equal(u.redditBuzzForStock([{ market_signals: [signal(100)] }], 'NVDA', 'US', '2026-11-08T14:00:00Z').score, 1);
  assert.equal(u.redditBuzzForStock(groups, 'AAPL'), null);
  assert.equal(u.redditBuzzHtml(null), '');
});
test('Future, invalid and cross-market data cannot produce a buzz score', () => {
  const { ClustrUtil: u } = setup();
  for (const item of [signal(0), signal(101), { ...signal(), value: null }, { ...signal(), market: 'NO' }, signal(1, '2026-11-09T12:00:00Z')]) {
    assert.equal(u.redditBuzzForStock([{ market_signals: [item] }], 'NVDA', 'US', '2026-11-08T14:00:00Z'), null);
  }
  assert.equal(u.redditBuzzForStock([{ market_signals: [signal()] }], 'NVDA', 'NO'), null);
});
test('Stock explorer uses the newest linked report and does not silently revive an older missing score', () => {
  const w = setup();
  const make = (id, day, signals) => ({ publish: { id, market: 'US', created_at: `2026-11-0${day}T15:00:00Z` }, groups: [{ name: 'AI', mentioned_stocks: [{ symbol: 'NVDA' }], market_signals: signals }] });
  const older = make(1, 7, [signal(3, '2026-11-07T12:00:00Z')]);
  const newer = make(2, 8, []);
  assert.equal(w.stockIndex([older, newer])[0].redditBuzz, null);
  newer.groups[0].market_signals = [signal(2)];
  assert.equal(w.stockIndex([newer, older])[0].redditBuzz.score, 99);
});
test('News badges and detailed stock explanations show score and source, never sentiment colouring', () => {
  const w = setup();
  const buzz = w.ClustrUtil.redditBuzzForStock([{ market_signals: [signal()] }], 'NVDA', 'US', '2026-11-08T14:00:00Z');
  assert.match(w.bubble({ symbol: 'NVDA', __redditBuzz: buzz }), /Reddit buzz <strong>98\/100/);
  const detail = w.ClustrUtil.redditBuzzHtml(buzz, true);
  assert.match(detail, /ApeWisdom/); assert.match(detail, /50 mentions/); assert.match(detail, /snapshot retrieved/);
  assert.match(detail, /not sentiment or a trade score/); assert.doesNotMatch(detail, /tone-up|tone-down/);
});
