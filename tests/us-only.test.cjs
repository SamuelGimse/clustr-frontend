const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('publish and summary requests stay scoped to US', async () => {
  const requests = [];
  const window = { ClustrConfig: { SUPABASE_URL: 'https://example.invalid', SUPABASE_ANON_KEY: 'public' } };
  const context = { window, URLSearchParams, fetch: async url => {
    requests.push(url);
    return { ok: true, json: async () => [] };
  } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/api.js'), 'utf8'), context);
  await window.ClustrApi.fetchPublishes();
  await window.ClustrApi.fetchPublishesInRange('2026-11-01', '2026-11-08');
  await window.ClustrApi.fetchAllPublishes();
  await window.ClustrApi.fetchAiSummaries('2026-11-01');
  assert.equal(requests.length, 4);
  requests.forEach(url => assert.equal(new URL(url).searchParams.get('market'), 'eq.US'));
});
