const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('index.html', 'utf8');
const ids = ['navDashboard', 'navEvents', 'navStocks', 'navConnections', 'navMap', 'navWeekly', 'navAtlas', 'navDays', 'navWatchlist', 'navAdmin', 'navAccount'];
test('All visible navigation uses the original signal icon family with inherited theme colors', () => {
  const icons = new Set();
  for (const id of ids) {
    const button = html.match(new RegExp('<button[^>]*id="' + id + '"[\\s\\S]*?</button>'))?.[0];
    assert(button, id);
    const svg = button.match(/<svg[\s\S]*?<\/svg>/)?.[0];
    assert.match(svg, /class="nav-signal-icon"/);
    assert.match(svg, /viewBox="0 0 24 24"/);
    assert.match(svg, /width="24" height="24"/);
    assert.match(svg, /stroke="currentColor"/);
    assert.match(svg, /fill="currentColor" stroke="none"/);
    assert.doesNotMatch(svg, /#[0-9a-f]{3,8}\b|rgba?\(|style=|<image|<use|<script/i);
    assert.match(svg, /aria-hidden="true" focusable="false"/);
    assert.match(button, /aria-label="[^"]+"/);
    assert.match(button, /class="nav-rail-label"/);
    icons.add(svg);
  }
  assert.equal(icons.size, ids.length, 'Each view retains its own symbol');
});
test('New icons preserve News as default and existing navigation order', () => {
  assert.match(html, /id="navEvents"[^>]*class="nav-rail-btn is-active"[^>]*aria-current="page"/);
  for (let i = 1; i < ids.length; i++) assert(html.indexOf('id="' + ids[i - 1] + '"') < html.indexOf('id="' + ids[i] + '"'));
});
test('Trends uses a readable rising node path instead of overlapping ribbons', () => {
  const trends = html.match(/<button[^>]*id="navWeekly"[\s\S]*?<\/button>/)[0];
  assert.match(trends, /d="m3 18 5-6 5 3 7-11"/);
  assert.equal((trends.match(/<circle /g) || []).length, 4);
  assert.doesNotMatch(trends, /<path[^>]*d="[^"]*[cC]/);
});
