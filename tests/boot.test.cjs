const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const init = source.slice(source.indexOf('  async function init() {'), source.indexOf("  if (navPolymarket) navPolymarket.addEventListener"));

async function check({ user = {}, rows = [{ id: 1 }], error = null, hash = '' } = {}) {
  const calls = [];
  const context = {
    window: {
      ClustrAuth: { restore: async () => ({ user, role: 'free' }) },
      ClustrConnections: { hide() {}, render() {} },
      ClustrApi: { fetchPublishes: async () => { if (error) throw error; return rows; } }
    },
    runBoot: async () => calls.push('boot'),
    endBoot: async () => calls.push('end'),
    paintCurrent: async () => calls.push('paint'),
    setNav: view => calls.push(`nav:${view}`),
    setBootStage: stage => calls.push(`stage:${stage}`),
    renderAccount: () => calls.push('account'),
    renderProBadges: () => calls.push('badge'),
    warmGroupsCache: () => {},
    navAdmin: null,
    location: { hash, search: '' },
    status: { textContent: '' },
    console: { error() {} },
    URLSearchParams
  };
  await vm.runInNewContext(`${init}\ninit()`, context);
  assert.equal(calls.filter(call => call === 'end').length, 1);
  return { calls, status: context.status.textContent };
}

(async () => {
  const signedIn = await check();
  assert(signedIn.calls.indexOf('badge') < signedIn.calls.indexOf('paint'));
  assert(signedIn.calls.indexOf('paint') < signedIn.calls.indexOf('end'));
  assert(signedIn.calls.indexOf('nav:events') < signedIn.calls.indexOf('end'));
  assert((await check({ hash: '#/events' })).calls.includes('nav:events'));
  assert((await check({ hash: '#/dashboard' })).calls.includes('nav:dashboard'));
  assert((await check({ hash: '#/connections' })).calls.includes('nav:connections'));
  const signedOut = await check({ user: null });
  assert(signedOut.calls.includes('badge'));
  assert(signedOut.calls.indexOf('nav:account') < signedOut.calls.indexOf('end'));
  assert.equal((await check({ rows: [] })).status, 'No publishes yet');
  assert.equal((await check({ error: new Error('Offline') })).status, 'Offline');
  console.log('Boot checks passed: signed in, signed out, empty data, fetch failure.');
})().catch(error => { console.error(error); process.exitCode = 1; });
