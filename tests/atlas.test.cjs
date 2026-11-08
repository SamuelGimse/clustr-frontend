const assert = require('node:assert/strict');
const test = require('node:test');
const { buildModel } = require('../atlas/atlas.js');

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
