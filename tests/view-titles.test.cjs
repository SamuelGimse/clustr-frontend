const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const css=fs.readFileSync(path.join(__dirname,'../styles.css'),'utf8');
test('Redundant view titles take no layout space but stay accessible',()=>{
  const rule=css.match(/(:is\(#dashboardView \.dash-header[^{}]+)\{([^{}]+)\}/);
  assert.ok(rule);
  for(const view of ['dashboardView','stocksView','connectionsView','weeklyView','atlasView','adminView'])assert.ok(rule[1].includes('#'+view));
  assert.match(rule[1],/ h1\s*$/);
  assert.match(rule[2],/position:\s*absolute/);
  assert.match(rule[2],/clip-path:\s*inset\(50%\)/);
  assert.doesNotMatch(rule[2],/display:\s*none|visibility:\s*hidden/);
  assert.doesNotMatch(rule[1],/accountView|h2|h3/);
});
