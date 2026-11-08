const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { render } = require('../js/pro-preview.js');

test('Each paid feature has its own illustration, demo disclosure and correct CTA', () => {
  const illustrations = new Set();
  for (const [view, label] of [['stocks','Stocks'], ['weekly','Trends'], ['atlas','History'], ['watchlist','Watchlist']]) {
    const html = render(view);
    assert.match(html, new RegExp(`${label} Pro preview`));
    assert.match(html, /fictional data/);
    assert.match(html, /illustration, not market data/);
    assert.match(html, /99 kr\/month/);
    assert.match(html, /data-account-action="checkout"/);
    assert.match(html, /<svg[^>]+role="img"[^>]+aria-label=/);
    assert.doesNotMatch(render(view, false), /data-account-action="checkout"/);
    assert.match(render(view, false), /data-account-action="account"/);
    illustrations.add(html.match(/<svg[\s\S]*?<\/svg>/)[0]);
  }
  assert.equal(illustrations.size, 4);
  assert.equal(render('unknown'), '');
});

test('Preview component has no data/network access and loads before the app', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/pro-preview.js'), 'utf8');
  assert.doesNotMatch(source, /fetch\(|ClustrApi|ClustrAuth|localStorage|https?:\/\//);
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert(html.indexOf('js/pro-preview.js') < html.indexOf('js/app.js'));
  assert.match(html, /id="proFeatureView" class="hidden"/);
});
