const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const init = source.slice(source.indexOf('  async function init() {'), source.indexOf("  if (navPolymarket) navPolymarket.addEventListener"));

async function check({ user = {}, rows = [{ id: 1 }], error = null, hash = '', recovery = false, authError = '' } = {}) {
  const calls = [];
  const context = {
    window: {
      ClustrAuth: { restore: async () => ({ user, role: 'free', recovery, authError }), foundingStatus: async () => ({ remaining: 15 }) },
      location: {replace:url=>calls.push(`redirect:${url}`)},
      ClustrThemes: { setAccess: role => calls.push(`theme:${role}`) },
      ClustrConnections: { hide() {}, render() {} },
      ClustrApi: { fetchPublishes: async () => { calls.push('fetch'); if (error) throw error; return rows; } }
    },
    runBoot: async () => calls.push('boot'),
    document: {body:{classList:{toggle:(name, locked)=>calls.push(`locked:${locked}`)}}},
    endBoot: async () => calls.push('end'),
    paintCurrent: async () => calls.push('paint'),
    setNav: view => calls.push(`nav:${view}`),
    setBootStage: stage => calls.push(`stage:${stage}`),
    renderAccount: () => calls.push('account'),
    renderProBadges: () => calls.push('badge'),
    renderPlanAccess: () => calls.push('access'),
    hasProAccess: () => false,
    warmGroupsCache: () => {},
    navAdmin: null,
    accountMode: 'signin',
    location: { hash, search: '' },
    status: { textContent: '' },
    console: { error() {} },
    URLSearchParams
  };
  await vm.runInNewContext(`${init}\ninit()`, context);
  assert.equal(calls.filter(call => call === 'end').length, calls.includes('redirect:welcome.html') ? 0 : 1);
  return { calls, status: context.status.textContent, mode:context.accountMode };
}

(async () => {
  const signedIn = await check();
  assert(signedIn.calls.indexOf('badge') < signedIn.calls.indexOf('paint'));
  assert(signedIn.calls.indexOf('paint') < signedIn.calls.indexOf('end'));
  assert(signedIn.calls.indexOf('nav:events') < signedIn.calls.indexOf('end'));
  assert((await check({ hash: '#/events' })).calls.includes('nav:events'));
  assert((await check({ hash: '#/dashboard' })).calls.includes('nav:dashboard'));
  assert((await check({ hash: '#/watchlist' })).calls.includes('nav:watchlist'));
  assert((await check({ rows: [], hash: '#/watchlist' })).calls.includes('nav:watchlist'));
  assert((await check({ hash: '#/connections' })).calls.includes('nav:connections'));
  const signedOut = await check({ user: null, hash:'#/login' });
  assert(signedOut.calls.includes('locked:true'));
  assert(!signedOut.calls.includes('fetch'));
  assert(signedIn.calls.includes('locked:false'));
  assert((await check({recovery:true})).calls.includes('nav:account'));
  assert(signedOut.calls.includes('badge'));
  assert(signedOut.calls.indexOf('nav:account') < signedOut.calls.indexOf('end'));
  const welcome=await check({user:null});
  assert(welcome.calls.includes('redirect:welcome.html'));
  assert(!welcome.calls.includes('fetch'));
  assert(!welcome.calls.includes('nav:account'));
  assert(!(await check({user:null,authError:'OAuth cancelled'})).calls.includes('redirect:welcome.html'));
  assert.equal((await check({user:null,hash:'#/signup'})).mode,'signup');
  assert((await check({user:null,hash:'#/signup'})).calls.includes('nav:account'));
  assert.equal((await check({ rows: [] })).status, 'No publishes yet');
  assert((await check({ rows: [], hash: '#/connections' })).calls.includes('nav:connections'));
  assert.equal((await check({ error: new Error('Offline') })).status, 'Offline');
  console.log('Boot checks passed: signed in, signed out, empty data, fetch failure.');
})().catch(error => { console.error(error); process.exitCode = 1; });
