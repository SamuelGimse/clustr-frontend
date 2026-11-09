const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup({ expired = true, refreshStatus = 200, rejectReads = 0 } = {}) {
  const storage = new Map();
  const key = 'clustr-auth-session-v1';
  storage.set(key, JSON.stringify({ access_token: 'old', refresh_token: 'refresh-old', expires_at: Math.floor(Date.now()/1000) + (expired ? -1 : 3600), user: { id: 'alice' } }));
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({url,options});
    if (url.includes('grant_type=refresh_token')) return { ok: refreshStatus === 200, status: refreshStatus, json: async () => refreshStatus === 200 ? { access_token:'new', refresh_token:'refresh-new', expires_in:3600, user:{id:'alice'} } : { message:'Refresh failed' } };
    if (url.includes('/logout')) return {ok:true,json:async()=>({})};
    const status = rejectReads-- > 0 ? 401 : 200;
    return {ok:status===200,status,json:async()=>[],text:async()=>'JWT expired'};
  };
  const window = {ClustrConfig:{SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'public'},fetch,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}};
  const context = vm.createContext({window,fetch,URLSearchParams,Date,console});
  for (const file of ['js/auth.js','js/api.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context);
  return {window,calls,storage,key};
}

test('Concurrent dashboard reads refresh once and preserve account cache ownership', async () => {
  const s=setup();
  await Promise.all([s.window.ClustrApi.fetchHistorySummaries(),s.window.ClustrApi.fetchPublishes()]);
  assert.equal(s.calls.filter(c=>c.url.includes('refresh_token')).length,1);
  assert(s.calls.filter(c=>c.url.includes('/rest/')).every(c=>c.options.headers.Authorization==='Bearer new'));
  assert.equal(s.window.ClustrAuth.sessionKey(),'alice');
  assert.equal(JSON.parse(s.storage.get(s.key)).refresh_token,'refresh-new');
});

test('A server-rejected JWT refreshes and retries the dashboard query once', async () => {
  const s=setup({expired:false,rejectReads:1});
  await s.window.ClustrApi.fetchHistorySummaries();
  const reads=s.calls.filter(c=>c.url.includes('/rest/'));
  assert.equal(reads.length,2);
  assert.equal(reads[0].options.headers.Authorization,'Bearer old');
  assert.equal(reads[1].options.headers.Authorization,'Bearer new');
});

test('Persistent 401 stops after one retry', async () => {
  const s=setup({expired:false,rejectReads:10});
  await assert.rejects(s.window.ClustrApi.fetchPublishes(),/Supabase 401/);
  assert.equal(s.calls.filter(c=>c.url.includes('/rest/')).length,2);
});

test('Revoked refresh sessions ask for sign-in without anonymous fallback', async () => {
  const s=setup({refreshStatus:400});
  const events=[];
  s.window.Event=class {constructor(type){this.type=type;}};
  s.window.dispatchEvent=event=>events.push(event.type);
  await assert.rejects(s.window.ClustrApi.fetchPublishes(),/Sign in again/);
  assert.equal(s.calls.filter(c=>c.url.includes('/rest/')).length,0);
  assert.equal(s.storage.get(s.key),undefined);
  assert.deepEqual(events,['clustr-signed-out']);
});

test('Transient refresh failures retain the session for a later retry', async () => {
  const s=setup({refreshStatus:503});
  await assert.rejects(s.window.ClustrApi.fetchPublishes(),/Refresh failed/);
  assert.equal(JSON.parse(s.storage.get(s.key)).refresh_token,'refresh-old');
});

test('Expired sessions without a refresh token are cleared and return to sign-in', async () => {
  const s=setup();
  const value=JSON.parse(s.storage.get(s.key)); delete value.refresh_token;
  s.storage.set(s.key,JSON.stringify(value));
  const events=[];
  s.window.Event=class {constructor(type){this.type=type;}};
  s.window.dispatchEvent=event=>events.push(event.type);
  await assert.rejects(s.window.ClustrAuth.getAccessToken(),/Sign in again/);
  assert.equal(s.storage.get(s.key),undefined);
  assert.deepEqual(events,['clustr-signed-out']);
  assert.equal(s.calls.length,0);
});

test('Signing out while refreshing cannot restore the old session', async () => {
  const s=setup(); let release;
  s.window.fetch=()=>new Promise(resolve=>{release=resolve;});
  const pending=s.window.ClustrAuth.getAccessToken();
  s.window.fetch=async()=>({ok:true,json:async()=>({})});
  await s.window.ClustrAuth.signOut();
  release({ok:true,json:async()=>({access_token:'new',refresh_token:'refresh-new',expires_in:3600,user:{id:'alice'}})});
  await assert.rejects(pending,/Account changed/);
  assert.equal(s.window.ClustrAuth.accessToken(),'');
});
