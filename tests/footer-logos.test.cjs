const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const css = fs.readFileSync('footer.css', 'utf8');
test('Footer logos are local SVG masks filled with the theme color, without white badges', () => {
  assert.match(css, /background-color:currentColor/);
  assert.match(css, /-webkit-mask:var\(--technology-mark\)/);
  assert.match(css, /(?:^|;) mask:var\(--technology-mark\)/m);
  assert.doesNotMatch(css, /background:\s*#fff\b|filter:\s*invert/);
  for (const name of ['deepseek', 'openai', 'javascript']) {
    const file = `icons/technology/${name}-mark.svg`;
    assert(css.includes(file));
    const svg = fs.readFileSync(file, 'utf8');
    assert.match(svg, /<svg\b/); assert.match(svg, /<path\b/);
    assert.doesNotMatch(svg, /<script|<image|onload=/);
  }
});
test('Both credit surfaces retain visible accessible brand names without image color isolation', () => {
  for (const file of ['index.html', 'info.html']) {
    const html = fs.readFileSync(file, 'utf8');
    const credits = html.match(/<div class="technology-credits"[^>]*>[\s\S]*?<\/div>/)[0];
    for (const name of ['DeepSeek', 'OpenAI SDK', 'JavaScript']) assert(credits.includes(`<span>${name}</span>`));
    assert.equal((credits.match(/aria-hidden="true"/g) || []).length, 3);
    assert.doesNotMatch(credits, /<img/);
    assert.match(html, /footer.css\?v=(?:monochrome-marks-1|account-lock-1)/);
  }
});
test('JavaScript is a single-ink square with transparent original letter cutouts and retained licence', () => {
  const svg = fs.readFileSync('icons/technology/javascript-mark.svg', 'utf8');
  assert.match(svg, /fill-rule="evenodd"/); assert.match(svg, /The MIT License/);
  assert.match(svg, /M 165\.65,526\.47375 l 48\.2125,-29\.1775/);
  assert.match(svg, /M 375,520\.13 l 48\.20625,-27\.91125/);
  assert.doesNotMatch(svg, /#f7df1e/);
});
