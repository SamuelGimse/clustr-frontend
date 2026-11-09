const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function setup() {
  const c = { window: {}, document: { hidden: false }, console };
  vm.createContext(c);
  vm.runInContext(fs.readFileSync('js/util.js','utf8'), c);
  vm.runInContext(fs.readFileSync('js/render.js','utf8').replace('  window.ClustrRender = {', '  window.audit = { bubbleBtn, refreshNewsQuotes, quoteSessionLabel, basketSessionChange, priceBarHtml };\n  window.ClustrRender = {'), c);
  return c;
}
test('News chips never present saved percentages as current quotes', () => {
  const c = setup();
  const html = c.window.audit.bubbleBtn({ symbol: 'AAPL', changePercent: 99, changePercentAtPublish: 88 });
  assert.match(html, /Loading quote/);
  assert.doesNotMatch(html, /99\.00%|88\.00%/);
  assert.match(html, /data-news-quote/);
});
test('Session labels use exchange dates and distinguish weekends from today', () => {
  const { window: { audit } } = setup();
  const q = { asOf: '2026-11-06T21:00:00Z' };
  assert.equal(audit.quoteSessionLabel(q, 'US', Date.parse('2026-11-08T14:00:00Z')), 'Last session');
  assert.equal(audit.quoteSessionLabel(q, 'US', Date.parse('2026-11-07T01:00:00Z')), 'Today');
});

test('Weekend cards emphasize session change, not the unchanged publish baseline', async () => {
  const c = setup();
  let requestedMarket;
  c.window.ClustrQuotes = { getLatestQuotes: async (_, market) => {
    requestedMarket = market;
    return { AAPL: { price: 100, changePercent: -2, asOf: '2026-11-06T21:00:00Z' }, MSFT: {price: 110, changePercent: 0, asOf: '2026-11-06T21:00:00Z'}, BAD: { price: 0, changePercent: 20, asOf: '2026-11-06T21:00:00Z' } };
  } };
  const basket = await c.window.audit.basketSessionChange([{symbol:'AAPL'}, {symbol:'AAPL'}, {symbol:'MSFT'}, {symbol:'BAD'}, {symbol:'MISSING'}], 'NO');
  assert.equal(requestedMarket, 'NO');
  assert.equal(basket.average, -1); assert.equal(basket.priced, 2); assert.equal(basket.total, 4);
  const html = c.window.audit.priceBarHtml('AAPL', 'Apple', 100, 99, { price: 100, changePercent: -2, asOf: '2026-11-06T21:00:00Z' }, {__publishAsOf: '2026-11-08T21:00:00Z'});
  assert.match(html, /change<\/div>\s*<div class="price-value tone-down">-2\.00%/);
  assert.match(html, /No regular-session quote since publish/);
  assert.doesNotMatch(html, /99\.00%|\+0\.00%/);
  assert(html.indexOf('change</div>') < html.indexOf('At publish</div>'));
});
test('Latest quotes update chips, clear old tones, and never turn unavailable data into zero', async () => {
  const c = setup(), classes = new Set(['tone-down']), meta = {};
  const button = { dataset: { symbol: 'AAPL', quoteMarket: 'US', quoteName: '<Apple>' }, classList: { remove: v => classes.delete(v), add: v => { assert(v); classes.add(v); } }, querySelector: () => meta };
  const root = { querySelectorAll: selector => selector.includes('data-news-quote') ? [button] : [] };
  c.window.ClustrQuotes = { getLatestQuotes: async () => ({ AAPL: { price: 100, changePercent: 0, asOf: '2026-11-06T21:00:00Z' } }) };
  await c.window.audit.refreshNewsQuotes(root);
  assert.match(meta.textContent, /USD 100\.00 · \+0\.00%/);
  assert(classes.has('tone-up')); assert(!classes.has('tone-down'));
  assert.match(button.title, /may be delayed/);
  c.window.ClustrQuotes.getLatestQuotes = async () => ({});
  await c.window.audit.refreshNewsQuotes(root);
  assert.equal(meta.textContent, 'Quote unavailable');
  assert(!classes.has('tone-up'));
});
