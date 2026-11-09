const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('js/themes.js','utf8');

function setup({dark=false,saved,blocked=false,welcome=true,locked=false,paidThemeMenu=false}={}) {
  const attributes=new Map(welcome?[['data-system-theme','true']]:[]);
  const storage=new Map(saved?[['clustr-theme',saved]]:[]);
  const listeners={},media={matches:dark,addEventListener(name,fn){this.change=fn;}};
  const root={getAttribute:name=>attributes.get(name),setAttribute:(name,value)=>attributes.set(name,value),removeAttribute:name=>attributes.delete(name)};
  const paidButton={textContent:'Material',getAttribute:()=> 'material',setAttribute(){},addEventListener(){},classList:{toggle(){}}};
  const menu={querySelectorAll:()=>[paidButton]};
  const context={document:{documentElement:root,body:{classList:{contains:()=>locked}},getElementById:id=>paidThemeMenu&&id==='themeMenu'?menu:null,querySelectorAll:()=>[]},
    localStorage:{getItem:key=>{if(blocked)throw Error('Storage blocked');return storage.get(key);},setItem:(key,value)=>{if(blocked)throw Error('Storage blocked');storage.set(key,value);}},
    window:{matchMedia:query=>{assert.equal(query,'(prefers-color-scheme: dark)');return media;},addEventListener:(name,fn)=>{listeners[name]=fn;}}};
  vm.runInNewContext(source,context);
  return {attributes,storage,listeners,media,window:context.window,paidButton};
}

test('Welcome follows system light/dark without saving an implicit preference',()=>{
  for(const dark of [false,true]) {
    const s=setup({dark});
    assert.equal(s.attributes.get('data-theme'),'apple');
    assert.equal(s.attributes.get('data-color-mode'),dark?'dark':'light');
    assert.equal(s.storage.has('clustr-theme'),false);
    s.media.matches=!dark;s.media.change();
    assert.equal(s.attributes.get('data-color-mode'),dark?'light':'dark');
    assert.equal(s.storage.has('clustr-theme'),false);
  }
});

test('A selected theme wins over the system and its changes',()=>{
  for(const [saved,theme,mode] of [['apple','apple','dark'],['apple-light','apple','light'],['material-light','material','light'],['pure-black','pure-black',undefined],['clustr','dark',undefined]]) {
    const s=setup({dark:false,saved});
    assert.equal(s.attributes.get('data-theme'),theme);
    assert.equal(s.attributes.get('data-color-mode'),mode);
    s.media.matches=true;s.media.change();
    assert.equal(s.attributes.get('data-theme'),theme);
    assert.equal(s.attributes.get('data-color-mode'),mode);
    assert.equal(s.storage.get('clustr-theme'),saved);
  }
});

test('Welcome updates when a theme is selected or cleared in another app tab',()=>{
  const s=setup({dark:true});
  s.storage.set('clustr-theme','apple-light');s.listeners.storage({key:'clustr-theme'});
  assert.equal(s.attributes.get('data-color-mode'),'light');
  s.storage.delete('clustr-theme');s.listeners.storage({key:'clustr-theme'});
  assert.equal(s.attributes.get('data-color-mode'),'dark');
  s.media.matches=false;s.listeners.storage({key:null});
  assert.equal(s.attributes.get('data-color-mode'),'light');
});

test('Blocked storage still follows the system; app defaults remain unchanged',()=>{
  assert.equal(setup({blocked:true,dark:false}).attributes.get('data-color-mode'),'light');
  const app=setup({welcome:false,dark:false});
  assert.equal(app.attributes.get('data-color-mode'),'dark');
  assert.equal(app.media.change,undefined);
});

test('Welcome opts into system fallback and applies its theme before body content',()=>{
  const html=fs.readFileSync('welcome.html','utf8');
  assert.match(html,/data-system-theme="true"/);
  const script=html.match(/<script src="js\/themes.js[^>]*>/)[0];
  assert.doesNotMatch(script,/defer|async/);
  assert(html.indexOf(script)<html.indexOf('<body'));
});

test('Login opts into the same system fallback without adding settings',()=>{
  const html=fs.readFileSync('index.html','utf8');
  assert.match(html,/<html[^>]*data-system-theme="true"/);
  assert.match(html,/js\/themes.js\?v=login-system-1/);
  const login=html.match(/<section id="loginView"[\s\S]*?<\/section>/)[0];
  assert.doesNotMatch(login,/themeMenu|account-appearance/);
  for(const dark of [false,true]) {
    const s=setup({dark,locked:true});
    s.window.ClustrThemes.setAccess('free');
    assert.equal(s.attributes.get('data-color-mode'),dark?'dark':'light');
    s.media.matches=!dark;s.media.change();
    assert.equal(s.attributes.get('data-color-mode'),dark?'light':'dark');
    assert.equal(s.storage.has('clustr-theme'),false);
  }
});

test('Login retains a saved custom theme without granting paid theme controls',()=>{
  const login=setup({dark:false,saved:'material',locked:true,paidThemeMenu:true});
  login.window.ClustrThemes.setAccess('free');
  assert.equal(login.attributes.get('data-theme'),'material');
  assert.equal(login.paidButton.disabled,true);
  login.media.matches=true;login.media.change();
  assert.equal(login.attributes.get('data-theme'),'material');
  assert.equal(login.storage.get('clustr-theme'),'material');
  const freeAccount=setup({saved:'material',locked:false,paidThemeMenu:true});
  freeAccount.window.ClustrThemes.setAccess('free');
  assert.equal(freeAccount.attributes.get('data-theme'),'apple');
  freeAccount.window.ClustrThemes.setAccess('pro');
  freeAccount.media.matches=true;freeAccount.media.change();
  assert.equal(freeAccount.attributes.get('data-theme'),'material');
});
