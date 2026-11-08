const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('Theme picker shows only the requested choices and light variants stay light', () => {
  const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const menu = read('index.html').match(/<div id="themeMenu"[^>]*>([\s\S]*?)<\/div>/)?.[1] || '';
  assert.deepEqual([...menu.matchAll(/data-theme="([^"]+)"[^>]*>([^<]+)</g)].map(match => [match[1], match[2]]), [
    ['apple', 'Glass'], ['apple-light', 'Glass Light'], ['material', 'Material'],
    ['material-light', 'Material Light'], ['clustr', 'Clustr'], ['pure-black', 'Black'],
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
});
