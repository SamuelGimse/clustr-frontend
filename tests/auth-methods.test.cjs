const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/auth.js'), 'utf8');
const calls = [];
const providers = [];
const root = {
  ClustrConfig: { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public-test-key', AUTH_REDIRECT_URL: 'https://clustrmarket.com/' },
  fetch: async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({}) }; },
  supabase: { createClient: () => ({ auth: { signInWithOAuth: async options => { providers.push(options); return { error: null }; } } }) },
  localStorage: { getItem: () => null, removeItem: () => {} },
  location: { href: 'https://clustrmarket.com/', origin: 'https://clustrmarket.com', pathname: '/', search: '', hash: '' },
  history: { replaceState: (...args) => { root.replacedUrl = args[2]; } }
};
vm.runInNewContext(source, { window: root, URL, URLSearchParams });

(async () => {
  await root.ClustrAuth.signInWithEmailLink('existing@example.com');
  await root.ClustrAuth.signInWithEmailLink('new@example.com', true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://example.supabase.co/auth/v1/otp?redirect_to=https%3A%2F%2Fclustrmarket.com%2F');
  assert.deepEqual(JSON.parse(calls[0].options.body), { email: 'existing@example.com', create_user: false });
  assert.deepEqual(JSON.parse(calls[1].options.body), { email: 'new@example.com', create_user: true });
  await root.ClustrAuth.signInWithGoogle();
  assert.equal(providers[0].provider, 'google');
  assert.equal(providers[0].options.redirectTo, 'https://clustrmarket.com/');
  root.location.href = 'https://clustrmarket.com/#error=access_denied&error_description=Expired+link';
  root.location.hash = '#error=access_denied&error_description=Expired+link';
  const state = await root.ClustrAuth.restore();
  assert.equal(state.authError, 'Expired link');
  assert.equal(root.replacedUrl, '/#/account');
  console.log('Email link sign-in and callback error checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
