const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fixture(permission = 'default') {
  let click, requests = 0, saved, unsubscribed = false;
  let user = { id: 'user-1', user_metadata: { unrelated_preference: 'retained' } };
  const button = { disabled: true, setAttribute(name, value) { this[name] = value; }, addEventListener(_, listener) { click = listener; } };
  const status = {};
  const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/test', toJSON: () => ({ endpoint: subscription.endpoint, keys: {} }), unsubscribe: async () => { unsubscribed = true; } };
  let current = null;
  const registration = { pushManager: { getSubscription: async () => current, subscribe: async options => { assert.equal(options.userVisibleOnly, true); current = subscription; return current; } } };
  const root = {
    isSecureContext: true, PushManager: {}, Notification: { permission, requestPermission: async () => { requests++; root.Notification.permission = 'granted'; return 'granted'; } },
    navigator: { serviceWorker: { register: async () => registration, ready: Promise.resolve(registration) } },
    ClustrConfig: { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public', VAPID_PUBLIC_KEY: 'YWJj' },
    ClustrAuth: { getAccessToken: async () => 'user-token', sessionKey: () => 'user-1' },
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    fetch: async (_, options) => {
      if (options.method === 'PUT') { saved = JSON.parse(options.body); user = { ...user, user_metadata: { ...user.user_metadata, ...saved.data } }; }
      return { ok: true, status: 200, json: async () => user };
    }
  };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../js/push.js'), 'utf8'), { window: root, Uint8Array, console });
  const element = { isConnected: true, querySelector: selector => selector === '[data-push-toggle]' ? button : status };
  return { root, element, button, status, click: () => click(), requests: () => requests, saved: () => saved, unsubscribed: () => unsubscribed };
}

test('Account opt-in never prompts on load; enable and disable preserve other account metadata', async () => {
  const f = fixture();
  await f.root.ClustrPush.mount(f.element, 'user-1');
  assert.equal(f.requests(), 0);
  assert.equal(f.button['aria-checked'], 'false');
  await f.click();
  assert.equal(f.requests(), 1);
  assert.equal(f.button['aria-checked'], 'true');
  assert.equal(f.saved().data.clustr_publish_push.subscriptions.length, 1);
  assert.equal(Object.keys(f.saved().data).length, 1);
  await f.click();
  assert.equal(f.button['aria-checked'], 'false');
  assert.equal(f.saved().data.clustr_publish_push.subscriptions.length, 0);
  assert(f.unsubscribed());
});

test('blocked permission is explained and does not repeatedly prompt', async () => {
  const f = fixture('denied');
  await f.root.ClustrPush.mount(f.element, 'user-1');
  assert(f.button.disabled);
  assert.match(f.status.textContent, /blocked/);
  assert.equal(f.requests(), 0);
});

test('service worker shows a push and rejects off-site notification destinations', async () => {
  const handlers = {};
  let shown, destination;
  const self = { location: { origin: 'https://clustrmarket.com' }, addEventListener: (name, fn) => { handlers[name] = fn; },
    registration: { showNotification: async (title, options) => { shown = { title, options }; } },
    clients: { matchAll: async () => [], openWindow: async url => { destination = url; } } };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../sw.js'), 'utf8'), { self, URL });
  let pending;
  handlers.push({ data: { json: () => ({ title: 'New report', body: 'Highest impact: Energy (-6).', url: '/?publish=354#/events' }) }, waitUntil: p => { pending = p; } });
  await pending;
  assert.match(shown.options.body, /Energy/);
  handlers.notificationclick({ notification: { close() {}, data: { url: 'https://evil.example' } }, waitUntil: p => { pending = p; } });
  await pending;
  assert.equal(destination, 'https://clustrmarket.com/');
  handlers.notificationclick({ notification: { close() {}, data: { url: '/?publish=354#/events' } }, waitUntil: p => { pending = p; } });
  await pending;
  assert.equal(destination, 'https://clustrmarket.com/?publish=354#/events');
});
