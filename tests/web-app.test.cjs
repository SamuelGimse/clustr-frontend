const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));

test('iPhone Home Screen launch is standalone and supports safe areas and zoom', () => {
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

test('Home Screen icons exist with the declared PNG dimensions', () => {
  const icons = [...manifest.icons, { src: 'icons/apple-touch-icon.png', sizes: '180x180' }];
  for (const icon of icons) {
    const png = fs.readFileSync(path.join(root, icon.src));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  }
});
