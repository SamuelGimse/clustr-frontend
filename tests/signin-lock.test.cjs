const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('js/app.js','utf8');

test('Every app route is account-only when signed out or resetting a password', () => {
  const start = source.indexOf('  function setNav(');
  const guard = source.slice(start, source.indexOf('    window.ClustrConnections?.hide();',start)) + 'return which; }';
  for (const state of [{user:null}, {user:{id:'user'},recovery:true}]) {
    const c = {authState:state}; vm.createContext(c); vm.runInContext(guard,c);
    for (const route of ['account','events','dashboard','stocks','watchlist','connections','map','days','weekly','atlas','admin']) assert.equal(c.setNav(route),'account');
  }
  const c = {authState:{user:{id:'user'}}}; vm.createContext(c); vm.runInContext(guard,c);
  assert.equal(c.setNav('events'),'events');
  assert.equal(c.setNav('dashboard'),'dashboard');
  const html = fs.readFileSync('index.html','utf8');
  assert.match(html, /<body class="auth-locked">/);
  assert.match(html, /id="accountTechnologyCredits"/);
  assert.match(html, /account-brand-logo/);
  const css = fs.readFileSync('footer.css','utf8');
  assert.match(css, /body\.auth-locked #main > :not\(#accountView\).*display:none !important/);
  assert.match(source, /event.key === 'clustr-auth-session-v1' && !event.newValue/);
});

test('Account reuses the theme-aware footer logos without duplicating them on rerender', () => {
  let copies=0;
  const credits = {childElementCount:0,append(){copies++;this.childElementCount++;}};
  const elements={accountTitle:{},accountMessage:{},accountContent:{},accountTechnologyCredits:credits};
  const c={getDisplayAccount:()=>({user:null}),accountMode:'signin',foundingStatus:null,
    document:{getElementById:id=>elements[id],querySelector:()=>({cloneNode:()=>({})})}};
  const start=source.indexOf('  function renderAccount(');
  vm.runInNewContext(source.slice(start,source.indexOf('  function renderAdmin(',start))+'renderAccount();renderAccount();',c);
  assert.equal(copies,1);
  assert.match(elements.accountContent.innerHTML,/Continue with Google/);
});
