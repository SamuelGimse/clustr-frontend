const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/watchlist.js'), 'utf8');

function session() {
  const storage = new Map(), cloud = new Map(), calls = [], events = [];
  let token = 'Alice', hook = null;
  const window = {
    ClustrConfig: { SUPABASE_URL: 'https://example.invalid', SUPABASE_ANON_KEY: 'public' },
    ClustrAuth: { accessToken: () => token },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    dispatchEvent: event => events.push(event),
    fetch: async (url, options) => {
      calls.push({ url, ...options });
      if (hook) { const result = hook(url, options); if (result) return result; }
      const owner = options.headers.Authorization;
      if (!cloud.has(owner)) cloud.set(owner, new Map());
      const rows = cloud.get(owner), query = new URL(url).searchParams;
      if (options.method === 'POST') {
        const row = JSON.parse(options.body);
        assert.deepEqual(Object.keys(row).sort(), ['market', 'name', 'symbol']);
        rows.set(`${row.market}:${row.symbol}`, row);
      }
      if (options.method === 'DELETE') rows.delete(`${query.get('market').slice(3)}:${query.get('symbol').slice(3)}`);
      const offset = Number(query.get('offset') || 0);
      return { ok: true, status: options.method === 'GET' ? 200 : 204, json: async () => [...rows.values()].slice(offset, offset + 250) };
    }
  };
  const context = { window }; vm.createContext(context); vm.runInContext(source, context);
  return { api: window.ClustrWatchlist, cloud, calls, events, setToken: value => { token = value; }, setHook: value => { hook = value; } };
}

test('Watchlists persist per account with authenticated add/remove and no supplied owner', async () => {
  const s = session(); await s.api.init({ id: 'Alice' });
  await s.api.setSaved({ symbol: ' nvda ', name: 'NVIDIA' }, 'US', true);
  await s.api.setSaved({ symbol: 'NVDA' }, 'US', true);
  assert.equal(s.calls.filter(call => call.method === 'POST').length, 1);
  assert(s.api.includes({ symbol: 'NVDA' }, 'US'));
  assert(!s.api.includes({ symbol: 'NVDA' }, 'NO'));
  s.api.setScope('watchlist'); assert(s.api.isFiltered());
  s.setToken('Bob'); await s.api.init({ id: 'Bob' });
  assert.equal(s.api.getItems().length, 0); assert(!s.api.isFiltered());
  s.setToken('Alice'); await s.api.init({ id: 'Alice' });
  assert(s.api.includes({ symbol: 'NVDA' }, 'US')); assert(s.api.isFiltered());
  await s.api.setSaved({ symbol: 'NVDA' }, 'US', false);
  assert.equal(s.api.getItems().length, 0);
  assert.equal(s.cloud.get('Bearer Alice').size, 0);
});

test('Scope matches every relationship layer and article-only links without altering scores or raw data', () => {
  const { api } = session(), keys = new Set(['US:INTC']);
  const fields = ['mentioned_stocks','close_stocks','direct_stocks','original_stocks','related_stocks','fixed_stocks','default_stocks','default_symbols','stocks','connected_winners','connected_losers','movers'];
  for (const field of fields) {
    const group = { name: field, [field]: [{ symbol: 'INTC' }, { symbol: 'AMD' }], articles: [{ rating: 5 }, { rating: -2 }] };
    const result = api.scopeGroups([group], 'US', keys);
    assert.equal(result.length, 1); assert.equal(result[0][field].length, 1);
    assert.equal(group[field].length, 2);
    assert.deepEqual(Array.from(result[0].articles, item => item.rating), [5, -2]);
  }
  const articles = [{ rating: 4, mentioned_companies: [{ symbol: 'INTC' }, { symbol: 'AMD' }] }, { rating: -5 }];
  const result = api.scopeGroups([{ name: 'Article only', articles }], 'US', keys);
  assert.equal(result.length, 1); assert.equal(result[0].articles.length, 2);
  assert.equal(result[0].articles[0].mentioned_companies.length, 1);
  assert.equal(articles[0].mentioned_companies.length, 2);
  assert.equal(api.scopeGroups([{ fixed_stocks: [{ symbol: 'INTC' }] }], 'NO', keys).length, 0);
  assert.equal(api.scopeGroups([{ fixed_stocks: [{ symbol: 'AMD' }] }], 'US', keys).length, 0);
  assert.equal(api.scopeGroups([{ fixed_stocks: [{ symbol: 'INTC' }] }], 'US', new Set()).length, 0);
});

test('Failures never pretend to save, and an older refresh cannot undo a completed edit', async () => {
  const s = session(); await s.api.init({ id: 'Alice' });
  s.setHook((url, options) => options.method === 'POST' ? Promise.reject(Error('offline')) : null);
  await assert.rejects(s.api.setSaved({ symbol: 'INTC' }, 'US', true), /offline/);
  assert.equal(s.api.getItems().length, 0);
  let resolve;
  s.setHook((url, options) => options.method === 'GET' ? new Promise(done => { resolve = done; }) : null);
  const old = s.api.refresh();
  await s.api.setSaved({ symbol: 'INTC' }, 'US', true);
  resolve({ ok: true, status: 200, json: async () => [] }); await old;
  assert(s.api.includes({ symbol: 'INTC' }, 'US'));
});

test('Late responses cannot populate another account and saved names are escaped', async () => {
  const s = session(); await s.api.init({ id: 'Alice' });
  let resolve;
  s.setHook((url, options) => options.method === 'POST' ? new Promise(done => { resolve = done; }) : null);
  const pending = s.api.setSaved({ symbol: 'NVDA' }, 'US', true);
  s.setToken('Bob'); await s.api.init({ id: 'Bob' });
  resolve({ ok: true, status: 204 }); await pending;
  assert.equal(s.api.getItems().length, 0);
  s.setHook(null);
  await s.api.setSaved({ symbol: 'INTC', name: '<img "x">' }, 'US', true);
  assert.match(s.api.button({ symbol: 'INTC', name: '<img "x">' }, 'US'), /&lt;img &quot;x&quot;&gt;/);
  assert(!s.api.button({ symbol: 'not a ticker' }, 'US'));
  await assert.rejects(s.api.setSaved({ symbol: 'not a ticker' }, 'US', true), /valid ticker/);
});

test('Restore paginates beyond 250 saved stocks', async () => {
  const s = session();
  s.cloud.set('Bearer Alice', new Map(Array.from({ length: 251 }, (_, i) => [`US:S${i}`, { market: 'US', symbol: `S${i}`, name: `Stock ${i}` }])));
  await s.api.init({ id: 'Alice' });
  assert.equal(s.api.getItems().length, 251);
  assert.equal(s.calls.length, 2);
  assert(s.calls[1].url.includes('offset=250'));
});


test('Overview and history consume watchlist-scoped data without changing cluster scores or cached reports', async () => {
  const s = session(); await s.api.init({ id: 'Alice' });
  await s.api.setSaved({ symbol: 'INTC' }, 'US', true); s.api.setScope('watchlist');
  const atlas = require('../atlas/atlas.js'), dashboard = require('../dashboard/dashboard.js');
  const utilContext = { window: {} }; vm.createContext(utilContext);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/util.js'), 'utf8'), utilContext);
  const util = utilContext.window.ClustrUtil;
  const publishes = [{ id: 1, market: 'US', created_at: '2026-11-06T12:00:00Z' }, { id: 2, market: 'NO', created_at: '2026-11-06T12:00:00Z' }];
  const groups = new Map([['1', [
    { name: 'Chips', fixed_stocks: [{ symbol: 'INTC' }, { symbol: 'NVDA' }], articles: [{ link: 'a', rating: 5, source: 'A' }, { link: 'b', rating: -2, source: 'B' }] },
    { name: 'Oil', fixed_stocks: [{ symbol: 'XOM' }], articles: [{ link: 'c', rating: -7 }] }
  ]], ['2', [{ name: 'Other market', fixed_stocks: [{ symbol: 'INTC' }] }]]]);
  const filtered = s.api.filterGroupMap(groups, publishes);
  const all = dashboard.buildSummary(publishes, groups, 'US', util, atlas);
  const scoped = dashboard.buildSummary(publishes, filtered, 'US', util, atlas);
  assert.deepEqual(scoped.themes.map(theme => theme.name), ['Chips']);
  assert.deepEqual(scoped.stocks.map(stock => stock.symbol), ['INTC']);
  assert.equal(scoped.stories, 2);
  assert.equal(scoped.themes[0].score, all.themes.find(theme => theme.name === 'Chips').score);
  assert.equal(filtered.get('2').length, 0);
  assert.equal(groups.get('1').length, 2); assert.equal(groups.get('1')[0].fixed_stocks.length, 2);
  s.api.setScope('all'); assert.equal(s.api.filterGroupMap(groups, publishes), groups);
});

test('Filtered reports keep original publish selection indices and surface archive load failures', async () => {
  const s = session(); await s.api.init({ id: 'Alice' });
  await s.api.setSaved({ symbol: 'INTC' }, 'US', true); s.api.setScope('watchlist');
  const publishes = [{ id: 1, market: 'NO' }, { id: 2, market: 'US' }, { id: 3, market: 'US' }];
  let selectedRows, onSelect;
  const context = { reportRevision: 0, publishes, publishIndex: 0, groupsCache: {}, daysView: {},
    window: { ClustrWatchlist: s.api, ClustrApi: { loadGroupsForPublish: async p => [{ name: 'Cluster', stocks: [{ symbol: p.id === 2 ? 'XOM' : 'INTC' }] }] }, ClustrRender: { renderDaysList: (rows, index, callback) => { selectedRows = rows; onSelect = callback; } } },
    scopedGroups: (groups, market) => s.api.filterGroups(groups, market), paintCurrent() {}, setNav() {} };
  vm.createContext(context);
  const app = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  vm.runInContext(app.slice(app.indexOf('  async function renderReportDays()'), app.indexOf("  window.addEventListener('clustr:watchlist-change'")), context);
  await vm.runInContext('renderReportDays()', context);
  assert.deepEqual(selectedRows.map(row => row.id), [3]); onSelect(0); assert.equal(context.publishIndex, 2);
  context.groupsCache = {}; context.window.ClustrApi.loadGroupsForPublish = async () => { throw Error('Offline'); };
  await vm.runInContext('renderReportDays()', context); assert.match(context.daysView.innerHTML, /Could not load reports/);
});
