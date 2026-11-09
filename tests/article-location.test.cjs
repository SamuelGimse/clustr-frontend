const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const c = {window:{}};
vm.runInNewContext(fs.readFileSync('js/util.js','utf8'), c);
const location = c.window.ClustrUtil.articleLocation;

test('US news shows a state without replacing its country or mislabelling old broad regions', () => {
  for (const country of ['United States','US','USA','U.S.','United States of America']) {
    assert.equal(location({primary_country:country,region:'california'}), `${country} · California`);
  }
  assert.equal(location({primary_country:'USA',region:'District of Columbia'}), 'USA · District of Columbia');
  assert.equal(location({primary_country:'USA',region:'North America'}), 'USA');
  assert.equal(location({primary_country:'USA',region:'<script>'}), 'USA');
  assert.equal(location({primary_country:'Georgia',region:'Georgia'}), 'Georgia');
  assert.equal(location({primary_country:'Norway',region:'Oslo'}), 'Norway');
  assert.equal(location({primary_country:'United States'}), 'United States');
  assert.equal(location({}), '');
  const renderer = fs.readFileSync('js/render.js','utf8');
  assert.match(renderer, /util\.escapeHtml\(\s*util\.articleLocation\(a\)/);
});
