const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));

test('iPhone Home Screen launch is standalone and supports safe areas and zoom', () => {
  assert.equal(manifest.name, 'Clustr Market');
  assert.equal(manifest.short_name, 'Clustr Market');
  assert.match(html, /<title>Clustr Market<\/title>/);
  assert.match(html, /name="apple-mobile-web-app-title" content="Clustr Market"/);
  assert.doesNotMatch(html, />clustr<|CLUSTR \//);
  assert.match(fs.readFileSync(path.join(root, 'js/app.js'), 'utf8'), /Sign in to Clustr Market/);
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(html, /rel="manifest" href="manifest.webmanifest"/);
  assert.match(html, /viewport-fit=cover/);
  assert.doesNotMatch(html, /user-scalable=no/);
  assert.equal(manifest.display, 'standalone');
});

test('manifest URLs stay within the GitHub Pages project, including auth fragments', () => {
  const base = new URL('https://samuelgimse.github.io/clustr-frontend/manifest.webmanifest');
  const scope = new URL(manifest.scope, base);
  const start = new URL(manifest.start_url, base);
  assert.equal(scope.pathname, '/clustr-frontend/');
  assert.equal(start.pathname, scope.pathname);
  assert.equal(start.search, '');
  assert.equal(start.hash, '#/events');
});

test('custom domain, auth redirect and Home Screen launch use the same HTTPS root', () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'js/config.js'), 'utf8'), context);
  const redirect = context.window.ClustrConfig.AUTH_REDIRECT_URL;
  assert.equal(redirect, 'https://clustrmarket.com/');
  assert.equal(fs.readFileSync(path.join(root, 'CNAME'), 'utf8').trim(), new URL(redirect).hostname);
  const base = new URL('manifest.webmanifest', redirect);
  assert.equal(new URL(manifest.scope, base).href, redirect);
  assert.equal(new URL(manifest.start_url, base).href, redirect + '#/events');
  assert.match(html, /<script src="js\/config\.js\?v=[^"\s]+"><\/script>/);
});

test('Home Screen icons exist with the declared PNG dimensions', () => {
  const icons = [...manifest.icons, { src: 'icons/apple-touch-icon.png', sizes: '180x180' }];
  for (const icon of icons) {
    const png = fs.readFileSync(path.join(root, icon.src));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  }
});
