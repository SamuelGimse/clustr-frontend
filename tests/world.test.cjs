const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('world markers use real country coordinates and leave unlocated stories off the globe', () => {
  const window = { ClustrConfig: { COUNTRY_COORDS: { Norway: [60.5, 8.5] } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/map.js'), 'utf8'), { window });
  const locate = window.ClustrMap.locationForCountry;
  const features = [{ properties: { ADMIN: 'Kenya', NAME: 'Kenya', LABEL_Y: -.02, LABEL_X: 37.9 } }];
  assert.deepEqual(Array.from(locate('Norway')), [60.5, 8.5]);
  assert.deepEqual(Array.from(locate('Kenya', features)), [-.02, 37.9]);
  assert.equal(locate('Global', features), null);
  assert.equal(locate('Unknown place', features), null);
});
