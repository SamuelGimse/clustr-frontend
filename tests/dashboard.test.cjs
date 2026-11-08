const assert = require('node:assert/strict');
const test = require('node:test');
const atlas = require('../atlas/atlas.js');
const { buildSummary, render, invalidate } = require('../dashboard/dashboard.js');

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

test('Cluster trend series never blend clusters or turn missing reports into zero', () => {
  const publishes = [1, 2, 3, 4].map((id, index) => ({ id, market: id === 4 ? 'NO' : 'US', created_at: `2026-11-0${index + 1}T12:00:00Z` }));
  const groups = new Map([
    ['1', [{ name: 'Energy', stance_score: -6 }, { name: 'AI', stance_score: 6 }]],
    ['2', [{ name: 'Energy', stance_score: -4 }]],
    ['3', [{ name: 'Energy', stance_score: -2 }, { name: 'AI', stance_score: 0 }]],
    ['4', [{ name: 'Energy', stance_score: 10 }]]
  ]);
  const summary = buildSummary(publishes, groups, 'US', util, atlas);
  assert.deepEqual(summary.clusterTrends.find(item => item.name === 'Energy').days.map(day => day.score), [-6, -4, -2]);
  assert.deepEqual(summary.clusterTrends.find(item => item.name === 'AI').days.map(day => day.score), [6, null, 0]);
  assert.equal(summary.trend, undefined);
});

test('Dashboard selection, scatter points and all-model comparison remain cluster-specific', async () => {
  const publishes = [1, 2, 3, 4, 5].map(id => ({ id, market: 'US', created_at: `2026-11-0${id}T12:00:00Z` }));
  const groups = new Map(publishes.map(publish => [String(publish.id), [{ name: '<Energy>', stance_score: -6 + publish.id }, { name: 'AI', stance_score: 3 + Math.log(publish.id) }]]));
  window.ClustrApi = { fetchAllPublishes: async () => publishes, loadGroupsForPublish: async publish => groups.get(String(publish.id)) };
  window.ClustrAtlas = atlas;
  const root = { innerHTML: '', querySelector: () => ({ focus() {} }) };
  invalidate(); await render(root, () => {});
  root.onchange({ target: { closest: selector => selector === '[data-dash-cluster]' ? { value: '<Energy>' } : null } });
  assert.match(root.innerHTML, /&lt;Energy&gt;: scatter plot of 5 daily cluster impacts/);
  assert.equal((root.innerHTML.match(/class="dash-observed-dot"/g) || []).length, 5);
  assert.equal((root.innerHTML.match(/class="dash-fit /g) || []).length, 2);
  assert.match(root.innerHTML, /class="dash-confidence"/);
  assert.match(root.innerHTML, /class="dash-prediction"/);
  assert.match(root.innerHTML, /class="dash-forecast-divider"/);
  assert.match(root.innerHTML, /95% prediction interval/);
  assert.match(root.innerHTML, /\+1 DAY · Nov 6/);
  assert(!root.innerHTML.includes('Polynomial'));
  assert(!root.innerHTML.includes('class="dash-observed"'));
  root.onchange({ target: { closest: selector => selector === '[data-dash-show-fits]' ? { checked: true } : null } });
  assert.equal((root.innerHTML.match(/class="dash-fit /g) || []).length, 6);
  assert.match(root.innerHTML, /Original-scale R²/);
  root.onclick({ target: { closest: selector => selector === '[data-dash-market]' ? { dataset: { dashMarket: 'NO' } } : null } });
  assert.match(root.innerHTML, /No approved NO publishes/);
});
