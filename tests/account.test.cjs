const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = process.argv.includes('--staged')
  ? require('node:child_process').execFileSync('git', ['show', ':js/app.js'], { encoding: 'utf8' })
  : fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const elements = Object.fromEntries(['accountTitle', 'accountMessage', 'accountContent'].map(id => [id, {}]));
const badges = [{}, {}];
const context = { authState: {}, accountMode: 'signin', appleSignInEnabled: false, document: { getElementById: id => elements[id], querySelectorAll: () => badges }, window: { ClustrUtil: { escapeHtml: value => value } } };
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('  function isPermanentPro()'), source.indexOf('  function renderAdmin(')), context);
function render(role, plan, user = { email: 'test@example.com' }) {
  context.authState = { role, plan, user };
  vm.runInContext('renderProBadges(); renderAccount();', context);
  return elements.accountContent.innerHTML;
}
const permanent = render('pro', { status: 'active', current_period_end: null, stripe_customer_id: null });
assert.match(permanent, /Permanent Pro/);
assert.match(permanent, /no expiry date and no recurring payments/);
assert(!/data-account-action="(?:portal|checkout)"/.test(permanent));
assert.match(permanent, /data-account-action="logout"/);
assert(badges.every(b => b.hidden === false && b.textContent === 'Permanent Pro'));
const paid = render('pro', { status: 'active', current_period_end: '2099-01-01', stripe_customer_id: 'cus_test' });
assert.match(paid, /Manage subscription/);
assert(!paid.includes('PERMANENT PRO'));
assert(badges.every(b => b.hidden === false && b.textContent === 'Pro'));
assert.match(render('pro', { status: 'active', current_period_end: null, stripe_customer_id: 'cus_test' }), /Manage subscription/);
const trial = render('pro', { status: 'trialing', current_period_end: '2099-01-01', stripe_customer_id: null });
assert(!trial.includes('PERMANENT PRO'));
assert(!trial.includes('data-account-action="portal"'));
const free = render('free', { status: 'active', current_period_end: '2020-01-01', stripe_customer_id: null });
assert.match(free, /data-account-action="checkout"/);
assert(badges.every(b => b.hidden === true && b.textContent === ''));
assert.match(render('free', null, null), /Sign in/);
assert.match(elements.accountContent.innerHTML, /data-account-action="email-link"/);
assert(!elements.accountContent.innerHTML.includes('data-account-action="apple"'));
context.appleSignInEnabled = true;
assert.match(render('free', null, null), /data-account-action="apple"/);
assert(badges.every(b => b.hidden));
const admin = render('admin', null);
assert.match(admin, /Pro is active/);
assert.match(admin, /PRO · ADMIN/);
assert.match(admin, /permanent Pro access/);
assert(!/data-account-action="(?:portal|checkout)"/.test(admin));
assert(badges.every(b => b.hidden === false && b.textContent === 'Pro · Admin'));
render('admin', null, null);
assert(badges.every(b => b.hidden));
console.log('Account checks passed: permanent Pro, recurring Pro, trials, expired/free, signed out and admin.');
