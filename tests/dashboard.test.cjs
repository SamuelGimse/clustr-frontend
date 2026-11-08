const assert = require('node:assert/strict');
const test = require('node:test');
const atlas = require('../atlas/atlas.js');
const { buildSummary, linearTrend } = require('../dashboard/dashboard.js');

global.window = {};
require('../js/util.js');
const util = window.ClustrUtil;

test('Dashboard uses the latest report per day and keeps markets separate', () => {
  const publishes = [
    { id: 1, market: 'US', created_at: '2026-11-05T09:00:00Z' },
    { id: 2, market: 'US', created_at: '2026-11-05T17:00:00Z' },
    { id: 3, market: 'US', created_at: '2026-11-06T17:00:00Z' },
    { id: 4, market: 'NO', created_at: '2026-11-06T18:00:00Z' }
  ];
  const groups = new Map([
    ['1', [{ name: 'Energy', articles: [{ link: 'a', source: 'Source A', rating: -5 }] }]],
    ['2', [{ name: 'Energy', articles: [{ link: 'b', source: 'Source A', rating: -2 }] }]],
    ['3', [
      { name: 'Energy', articles: [{ link: 'c', source: 'Source A', rating: 4 }], fixed_stocks: [{ symbol: 'XOM' }] },
      { name: 'AI', articles: [{ link: 'c', source: 'Source A', rating: 4 }, { link: 'd', source: 'Source B', rating: 0 }], mentioned_stocks: [{ symbol: 'NVDA' }] }
    ]],
    ['4', [{ name: 'Norway', articles: [{ link: 'e', source: 'Source C', rating: -8 }] }]]
  ]);
  const us = buildSummary(publishes, groups, 'US', util, atlas);
  assert.equal(us.latest.id, 3);
  assert.equal(us.reports, 3);
  assert.deepEqual(us.days.map(day => [day.positive, day.negative]), [[0, 1], [2, 0]]);
  assert.equal(us.stories, 2);
  assert.equal(us.rated, 2);
  assert.equal(us.sourceCount, 2);
  assert.deepEqual(us.days.map(day => [day.stories, day.sources]), [[1, 1], [2, 2]]);
  assert.deepEqual(us.distribution.map(([, count]) => count), [0, 0, 0, 2, 0]);
  assert.equal(us.stocks.length, 2);
  assert.equal(us.themes.find(theme => theme.name === 'Energy').delta, 6);
  const no = buildSummary(publishes, groups, 'NO', util, atlas);
  assert.equal(no.latest.id, 4);
  assert.equal(no.stocks.length, 0);
  assert.equal(no.days.length, 1);
});

test('Dashboard trend fits scored report days in calendar time', () => {
  const days = [
    { date: '2026-11-01T12:00:00Z', meanScore: -2 },
    { date: '2026-11-02T12:00:00Z', meanScore: 0 },
    { date: '2026-11-03T12:00:00Z', meanScore: null },
    { date: '2026-11-04T12:00:00Z', meanScore: 4 }
  ];
  const trend = linearTrend(days);
  assert.ok(Math.abs(trend.slope - 2) < 1e-10);
  assert.ok(Math.abs(trend.r2 - 1) < 1e-10);
  assert.equal(trend.count, 3);
  assert.equal(linearTrend(days.slice(0, 2)), null);
});
