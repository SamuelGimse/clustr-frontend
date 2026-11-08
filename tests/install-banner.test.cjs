const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/install.js'), 'utf8');
function setup({ phone = true, standalone = false, iosStandalone = false, dismissed = false, storageFails = false } = {}) {
  const inserted = [], listeners = {}, stored = {};
  function element() { return { hidden: false, attrs: {}, handlers: {}, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(k, fn) { this.handlers[k] = fn; } }; }
  const install = element(), close = element();
  const body = { prepend: (...els) => inserted.push(...els) };
  const context = {
    navigator: { userAgent: 'iPhone', standalone: iosStandalone },
    sessionStorage: { getItem() { if (storageFails) throw Error('denied'); return dismissed ? '1' : null; }, setItem(k,v) { if (storageFails) throw Error('denied'); stored[k] = v; } },
    document: { body, createElement: () => ({ ...element(), querySelector: s => s === '.install-open' ? install : close }) },
    window: { matchMedia: query => ({ matches: query.includes('max-width') ? phone : standalone, addEventListener() {} }), addEventListener: (k,fn) => { listeners[k] = fn; } }
  };
  vm.runInNewContext(source, context);
  return { inserted, install, close, listeners, stored };
}
test('banner is phone-only and never appears in an installed app or dismissed session', () => {
  for (const options of [{phone:false}, {standalone:true}, {iosStandalone:true}, {dismissed:true}]) assert.equal(setup(options).inserted.length, 0);
});
test('iPhone install opens instructions and X dismisses both banner and instructions', async () => {
  const r = setup();
  assert.equal(r.inserted.length, 2);
  assert.match(r.inserted[1].textContent, /Safari.*Share.*Add to Home Screen/);
  await r.install.handlers.click();
  assert.equal(r.inserted[1].hidden, false);
  assert.equal(r.install.attrs['aria-expanded'], 'true');
  r.close.handlers.click();
  assert.ok(r.inserted.every(el => el.hidden));
  assert.equal(r.stored['clustr-install-dismissed'], '1');
});
test('banner works when browser storage is unavailable and hides after installation', () => {
  const r = setup({storageFails:true});
  assert.doesNotThrow(() => r.close.handlers.click());
  r.listeners.appinstalled();
  assert.ok(r.inserted.every(el => el.hidden));
});
