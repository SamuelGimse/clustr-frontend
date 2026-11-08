const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
test('Reddit attention is attributed, neutral, escaped and separate from news scores', () => {
  const c = { window: {}, console }; vm.createContext(c);
  vm.runInContext(fs.readFileSync('js/util.js','utf8'), c);
  vm.runInContext(fs.readFileSync('js/render.js','utf8').replace('  window.ClustrRender = {', '  window.signalHtml = marketSignalsHtml;\n  window.ClustrRender = {'), c);
  const html = c.window.signalHtml({ market_signals: [{ source: 'ApeWisdom', symbol: '<NVDA>', value: 20, rank: 2, upvotes: 90, mentions_change_pct: 100, available_at: '2026-11-08T21:00:00Z' }] });
  assert.match(html, /20 mentions/); assert.match(html, /&lt;NVDA&gt;/); assert.match(html, /href="https:\/\/apewisdom.io\/"/);
  assert.match(html, /not bullish\/bearish sentiment/); assert.match(html, /retrieved/); assert.doesNotMatch(html, /tone-up|tone-down/);
  assert.match(html, /does not change news scores/);
});
