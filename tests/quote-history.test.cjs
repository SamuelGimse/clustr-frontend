const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function setup(fetch) {
  const context = { window: { ClustrConfig: { SUPABASE_URL: 'https://example.com', SUPABASE_ANON_KEY: 'public-test-key' } }, console, fetch, URLSearchParams, AbortSignal };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('js/quotes.js', 'utf8'), context);
  return context.window.ClustrQuotes;
}
test('Concurrent history reads share requests and keep markets separate', async () => {
  let calls = 0;
  const api = setup(async url => { calls++; assert(url.includes('/functions/v1/price-history?')); return { ok: true, json: async () => ({ prices: [{ price: 100, asOf: '2026-11-01T12:00:00Z' }] }) }; });
  const dates = ['2026-11-01T14:00:00Z', '2026-11-02T14:00:00Z'];
  const [a, b] = await Promise.all([api.getHistoricalPrices(['AAPL'], dates), api.getHistoricalPrices(['AAPL'], dates)]);
  assert.equal(calls, 1);
  assert.equal(a.AAPL[0].price, 100);
  assert.equal(b.AAPL[0].price, 100);
  await api.getHistoricalPrices(['AAPL'], dates, 'NO');
  assert.equal(calls, 2);
});
test('Long history ranges use bounded windows; provider failures stay empty', async () => {
  let calls = 0;
  const api = setup(async raw => { calls++; const u = new URL(raw); assert(Date.parse(u.searchParams.get('to')) - Date.parse(u.searchParams.get('from')) <= 90 * 86400000); return { ok: true, json: async () => ({ prices: [] }) }; });
  await api.getHistoricalPrices(['AAPL'], ['2026-06-01T14:00:00Z', '2026-11-01T14:00:00Z']);
  assert.equal(calls, 2);
  const failed = setup(async () => { throw Error('Offline'); });
  assert.equal((await failed.getHistoricalPrices(['AAPL'], ['2026-11-01T14:00:00Z'])).AAPL.length, 0);
});
