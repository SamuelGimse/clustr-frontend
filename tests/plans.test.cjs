const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');

function setup(role, signedIn = true) {
  const makeElement = () => ({ hidden: true, innerHTML: '', title: '', attrs: {},
    classList: { add() {}, remove() {}, toggle() {} }, setAttribute(name, value) { this.attrs[name] = value; } });
  const elements = Object.fromEntries(['freePlanBanner', 'navWatchlist', 'navAtlas'].map(id => [id, makeElement()]));
  const calls = [];
  const context = { authState: { role, user: signedIn ? { id: 'user' } : null }, accountPreview: '',
    document: { getElementById: id => elements[id] },
    window: { ClustrConnections: { hide() {} }, ClustrWatchlist: { setView() {}, mount() { calls.push('watchlist'); } },
      ClustrAtlas: { render() { calls.push('history'); } }, matchMedia: () => ({ matches: false }) },
    view: 'events', publishes: [], publishIndex: 0, currentGroups: [], closeEventSortMenu() {},
    location: { hash: '', pathname: '/', search: '' }, history: { replaceState(_state, _title, hash) { context.location.hash = hash; } },
  };
  for (const name of ['navWatchlist', 'navDashboard', 'navEvents', 'navStocks', 'navMap', 'navDays', 'navSignal', 'navMind', 'navWeekly', 'navAtlas', 'navAccount', 'navAdmin', 'navPolymarket', 'polymarketView', 'eventsView', 'mapView', 'daysView', 'signalView', 'mindView', 'weeklyView', 'watchlistView', 'stocksView', 'atlasView', 'dashboardView', 'accountView', 'adminView']) context[name] = makeElement();
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('  function getDisplayAccount('), source.indexOf('  function renderProBadges(')), context);
  vm.runInContext(source.slice(source.indexOf('  function setNav('), source.indexOf('  function weeklyScore(')), context);
  return { context, elements, calls };
}

test('Free sees the delay banner and locked views never call Watchlist or History renderers', () => {
  const { context, elements, calls } = setup('free');
  context.renderPlanAccess();
  assert.equal(elements.freePlanBanner.hidden, false);
  for (const view of ['watchlist', 'atlas']) {
    context.setNav(view);
    const host = context[view === 'atlas' ? 'atlasView' : 'watchlistView'];
    assert.match(host.innerHTML, /PRO FEATURE/);
    assert.match(host.innerHTML, /data-account-action="checkout"/);
    assert.match(host.innerHTML, /99 kr\/month/);
    assert.equal(context.location.hash, `#/${view}`);
  }
  assert.deepEqual(calls, []);
});

test('Pro and admin have full feature access without the Free banner', () => {
  for (const role of ['pro', 'admin']) {
    const { context, elements, calls } = setup(role);
    context.renderPlanAccess();
    assert.equal(elements.freePlanBanner.hidden, true);
    context.setNav('watchlist'); context.setNav('atlas');
    assert.deepEqual(calls, ['watchlist', 'history']);
  }
});

test('Signed-out direct links ask users to sign in, never start checkout or mount paid views', () => {
  const { context, elements, calls } = setup('free', false);
  context.renderPlanAccess();
  assert.equal(elements.freePlanBanner.hidden, true);
  context.setNav('watchlist');
  assert.match(context.watchlistView.innerHTML, /Sign in to upgrade/);
  assert.doesNotMatch(context.watchlistView.innerHTML, /data-account-action="checkout"/);
  assert.deepEqual(calls, []);
});

test('Free messaging and upgrade links are consistent and mobile banner can wrap', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../plans.css'), 'utf8');
  assert.match(html, /id="freePlanBanner"[\s\S]*?yesterday/);
  assert.match(html, /Get the latest data · 99 kr\/month/);
  assert.doesNotMatch(source, /previous trading day/);
  assert.match(css, /\.free-plan-banner\[hidden\] \{ display: none; \}/);
  assert.match(css, /max-width: 768px/);
  assert.match(css, /white-space: normal/);
});

test('Admin can preview every account type without losing actual Admin access', () => {
  const { context } = setup('admin');
  for (const preview of ['free', 'pro', 'permanent', '']) {
    context.accountPreview = preview;
    assert.equal(context.getDisplayAccount().role, preview === 'free' ? 'free' : preview ? 'pro' : 'admin');
    assert.equal(context.hasProAccess(), preview !== 'free');
    assert.equal(context.authState.role, 'admin');
    context.setNav('admin');
    assert.equal(context.view, 'admin');
    assert.equal(context.navAdmin.attrs['aria-current'], 'page');
  }
  const free = setup('free').context;
  free.accountPreview = 'pro';
  assert.equal(free.getDisplayAccount().role, 'free');
  assert.equal(free.hasProAccess(), false);
});

test('Account preview blocks real checkout, billing portal and sign out', async () => {
  const calls = [];
  const context = { authState: { role: 'admin' }, accountPreview: 'free',
    document: { addEventListener: (_type, handler) => { context.handler = handler; } },
    window: { ClustrAuth: { checkout: () => calls.push('checkout'), portal: () => calls.push('portal'), signOut: () => calls.push('logout') } },
    setNav: view => calls.push(view), renderAccount: message => calls.push(message) };
  const start = source.indexOf("  document.addEventListener('click', async event => {");
  const end = source.indexOf('\n  });', start) + '\n  });'.length;
  vm.runInNewContext(source.slice(start, end), context);
  for (const action of ['checkout', 'portal', 'logout']) {
    await context.handler({ target: { closest: () => ({ getAttribute: () => action }) } });
  }
  assert(!calls.some(value => ['checkout', 'portal', 'logout'].includes(value)));
  assert(calls.filter(value => String(value).includes('Exit preview')).length === 3);
});
