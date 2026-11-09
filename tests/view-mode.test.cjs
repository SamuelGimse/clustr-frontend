const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('Simple and Advanced follow data pages, preserve mode, and leave account pages alone', () => {
  const app = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  const controller = app.slice(app.indexOf('  const dataViews ='), app.indexOf('  const meta ='));
  const buttons = ['simple', 'advanced'].map(mode => ({ dataset: { viewMode: mode }, setAttribute(name, value) { this[name] = value; } }));
  const bar = { hidden: true }, hint = { textContent: '' }, more = { open: false };
  const document = { documentElement: { dataset: {} }, getElementById: id => id === 'viewModeBar' ? bar : hint, querySelectorAll: () => buttons };
  const context = { document, window: {}, hasProAccess: () => true, localStorage: { getItem: () => 'advanced' }, view: 'dashboard', authState: { user: { id: 1 } }, dashboardView: { querySelector: () => more } };
  vm.createContext(context);
  vm.runInContext(controller + '\nupdateViewMode()', context);
  assert.equal(bar.hidden, false);
  assert.equal(more.open, true);
  assert.equal(buttons[1]['aria-pressed'], 'true');
  vm.runInContext("viewMode = 'simple'; view = 'weekly'; updateViewMode()", context);
  assert.equal(document.documentElement.dataset.viewMode, 'simple');
  assert.equal(more.open, false);
  assert.match(hint.textContent, /week/);
  vm.runInContext("view = 'account'; updateViewMode()", context);
  assert.equal(bar.hidden, true);
});
