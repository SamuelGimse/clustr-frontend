const assert = require('node:assert/strict');
const test = require('node:test');
const { buildModel, pageStocks } = require('../atlas/atlas.js');

global.window = {};
require('../js/util.js');
const util = window.ClustrUtil;

test('Zero-rated articles do not dilute a cluster impact score', () => {
  assert.equal(util.articleImpactScore([0, 2]), 2);
  assert.equal(util.articleImpactScore([0, 0]), 0);
});

test('Atlas keeps all snapshots and uses the latest report on each Oslo day', () => {
  const publishes = [
    { id: 1, created_at: '2026-11-06T08:00:00Z' },
    { id: 2, created_at: '2026-11-06T14:00:00Z' },
    { id: 3, created_at: '2026-11-07T10:00:00Z' }
  ];
  const group = articles => [{ name: 'Energy', articles }];
  const groups = new Map([
    ['1', group([{ link: 'https://example.com/a', rating: -3 }])],
    ['2', group([{ link: 'https://example.com/a', rating: 0 }, { link: 'https://example.com/b', rating: 2 }])],
    ['3', group([{ link: 'https://example.com/c', rating: 4 }])]
  ]);
  const days = buildModel(publishes, groups, 'days', util);
  assert.deepEqual(days.columns.map(publish => publish.id), [2, 3]);
  assert.equal(days.themes[0].entries[0].score, 2);
  assert.equal(days.themes[0].entries[0].articles, 2);
  assert.equal(days.storyCount, 3);
  assert.equal(days.themeCount, 1);
  const snapshots = buildModel(publishes, groups, 'publishes', util);
  assert.deepEqual(snapshots.columns.map(publish => publish.id), [1, 2, 3]);
  assert.equal(snapshots.themes[0].count, 3);
});

test('Stock rows combine linked cluster scores once per cluster and keep link types', () => {
  const publishes = [{ id: 4, created_at: '2026-11-07T10:00:00Z', market: 'US' }];
  const groups = new Map([['4', [
    { name: 'Defense', articles: [{ rating: 3 }], fixed_stocks: [{ symbol: 'LMT', name: 'Lockheed Martin' }], close_stocks: [{ symbol: 'LMT' }] },
    { name: 'Conflict', articles: [{ rating: -2 }], mentioned_stocks: [{ symbol: 'LMT' }] },
    { name: 'Energy', articles: [{ rating: 0 }], fixed_stocks: [{ symbol: 'XOM' }] }
  ]]]);
  const model = buildModel(publishes, groups, 'days', util);
  const lmt = model.stocks.find(stock => stock.symbol === 'LMT');
  assert.equal(lmt.company, 'Lockheed Martin');
  assert.equal(lmt.entries[0].links.length, 2);
  assert.equal(lmt.entries[0].score, util.articleImpactScore([3, -2]));
  assert.deepEqual(lmt.entries[0].links[0].layers, ['Close link', 'Cluster default']);
  assert.equal(model.stocks.find(stock => stock.symbol === 'XOM').entries[0].score, 0);
});

test('Stock search is applied before ten-row paging', () => {
  const stocks = Array.from({ length: 25 }, (_, index) => ({ symbol: `S${index}`, company: index % 2 ? 'Alpha' : 'Beta' }));
  const first = pageStocks(stocks, '', 10);
  assert.equal(first.matches.length, 25);
  assert.equal(first.visible.length, 10);
  assert.deepEqual(pageStocks(stocks, '', 20).visible.slice(10).map(stock => stock.symbol), stocks.slice(10, 20).map(stock => stock.symbol));
  const filtered = pageStocks(stocks, 'alpha', 10);
  assert.equal(filtered.matches.length, 12);
  assert.equal(filtered.visible.length, 10);
  assert.equal(pageStocks(stocks, 'alpha', 20).visible.length, 12);
});
