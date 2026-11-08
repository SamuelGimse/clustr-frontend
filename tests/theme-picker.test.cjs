const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('Theme picker shows only the requested choices and light variants stay light', () => {
  const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const html = read('index.html');
  const menu = html.match(/<div id="themeMenu"[^>]*>([\s\S]*?)<\/div>/)?.[1] || '';
  assert.match(html, /<section id="accountView"[\s\S]*?<div id="themeMenu"/);
  assert.doesNotMatch(html, /id="themeBtn"/);
  assert.deepEqual([...menu.matchAll(/data-theme="([^"]+)"[^>]*>([^<]+)</g)].map(match => [match[1], match[2]]), [
    ['apple', 'Glass'], ['apple-light', 'Glass Light'], ['material', 'Material'],
    ['material-light', 'Material Light'], ['clustr', 'Clustr'], ['minimal', 'Minimal'], ['minimal-dark', 'Minimal Dark'], ['pure-black', 'Black'],
    ['crt', 'CRT Tube'], ['dos-amber', 'DOS Amber'], ['grassy-hill', 'Grassy Hill'],
    ['aqua-classic', 'Aqua Classic'], ['aurora-glass', 'Aurora Glass'],
    ['old-school-rpg', 'Old School RPG']
  ]);
  for (const name of ['grassy-hill', 'aqua-classic', 'aurora-glass']) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'wallpapers', `${name}.png`)));
  }

  const attributes = new Map();
  const storage = new Map();
  const root = {
    getAttribute: name => attributes.get(name) || null,
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: name => attributes.delete(name)
  };
  const wallpaperToggle = { checked: false, addEventListener(_name, handler) { this.change = handler; } };
  const context = {
    document: { documentElement: root, getElementById: id => id === 'wallpaperToggle' ? wallpaperToggle : null, querySelectorAll: () => [] },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    window: { matchMedia: () => ({ matches: true }) }
  };
  vm.createContext(context);
  vm.runInContext(read('js/util.js'), context);
  vm.runInContext(read('js/themes.js'), context);

  context.window.ClustrThemes.applyTheme('apple-light');
  assert.equal(root.getAttribute('data-theme'), 'apple');
  assert.equal(root.getAttribute('data-color-mode'), 'light');
  assert.equal(context.window.ClustrUtil.isLightTheme(), true);
  assert.equal(root.getAttribute('data-wallpaper'), null);
  wallpaperToggle.checked = true;
  wallpaperToggle.change();
  assert.equal(root.getAttribute('data-wallpaper'), 'on');
  assert.equal(storage.get('clustr-wallpaper'), 'on');
  assert.equal(storage.get('clustr-theme'), 'apple-light');

  context.window.ClustrThemes.applyTheme('clustr');
  assert.equal(root.getAttribute('data-theme'), 'dark');
  assert.equal(root.getAttribute('data-color-mode'), null);
  context.window.ClustrThemes.applyTheme('material-light');
  assert.equal(root.getAttribute('data-theme'), 'material');
  assert.equal(root.getAttribute('data-color-mode'), 'light');
  assert.equal(context.window.ClustrUtil.isLightTheme(), true);
  context.window.ClustrThemes.applyTheme('hidden-old-theme');
  assert.equal(root.getAttribute('data-theme'), 'hidden-old-theme');
  storage.set('clustr-theme', 'apple-light');
  context.window.ClustrThemes.initTheme();
  assert.equal(root.getAttribute('data-color-mode'), 'light');
  context.window.ClustrThemes.applyTheme('grassy-hill');
  assert.equal(context.window.ClustrUtil.isLightTheme(), true);
  context.window.ClustrThemes.applyTheme('aurora-glass');
  assert.equal(context.window.ClustrUtil.isLightTheme(), true);
  context.window.ClustrThemes.applyTheme('old-school-rpg');
  assert.equal(context.window.ClustrUtil.isLightTheme(), true);
  context.window.ClustrThemes.applyTheme('minimal');
  assert.equal(context.window.ClustrUtil.isLightTheme(), true);
  context.window.ClustrThemes.applyTheme('minimal-dark');
  assert.equal(context.window.ClustrUtil.isLightTheme(), false);
});

test('Pro theme badges follow subscription access and keep the saved choice', () => {
  const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const html = read('index.html');
  const proIds = [...html.matchAll(/<button[^>]+data-theme="([^"]+)"[^>]+data-pro-theme[^>]*>/g)].map(match => match[1]);
  assert.deepEqual(proIds, ['pure-black', 'crt', 'dos-amber', 'grassy-hill', 'aqua-classic', 'aurora-glass', 'old-school-rpg']);
  const buttons = proIds.map(theme => ({
    theme, textContent: theme, disabled: true, classList: { toggle() {} },
    getAttribute(name) { return name === 'data-theme' ? this.theme : null; },
    setAttribute() {}, addEventListener() {}
  }));
  const menu = { querySelectorAll(selector) { return selector === '[data-pro-theme]' ? buttons : buttons; } };
  const attributes = new Map();
  const storage = new Map([['clustr-theme', 'pure-black']]);
  const context = {
    document: {
      documentElement: {
        getAttribute: name => attributes.get(name) || null,
        setAttribute: (name, value) => attributes.set(name, value),
        removeAttribute: name => attributes.delete(name)
      },
      getElementById: id => id === 'themeMenu' ? menu : null,
      querySelectorAll: () => []
    },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    window: { matchMedia: () => ({ matches: true }) }
  };
  vm.createContext(context);
  vm.runInContext(read('js/util.js'), context);
  vm.runInContext(read('js/themes.js'), context);
  assert.equal(attributes.get('data-theme'), 'apple');
  assert.equal(storage.get('clustr-theme'), 'pure-black');
  context.window.ClustrThemes.applyTheme('crt');
  assert.equal(attributes.get('data-theme'), 'apple');
  context.window.ClustrThemes.setAccess('pro');
  assert.equal(attributes.get('data-theme'), 'pure-black');
  assert.ok(buttons.every(button => !button.disabled));
  context.window.ClustrThemes.setAccess('free');
  assert.equal(attributes.get('data-theme'), 'apple');
  assert.ok(buttons.every(button => button.disabled));
  assert.equal(storage.get('clustr-theme'), 'pure-black');
});
