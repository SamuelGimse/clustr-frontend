const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const nav=html.match(/<nav class="nav-rail-list"[^>]*>([\s\S]*?)<\/nav>/)[1];
const buttons=[...nav.matchAll(/<button\b[^>]*\bid="(nav\w+)"[\s\S]*?<\/button>/g)];
test('sidebar follows overview, investigation, history and account workflow',()=>{
  const visible=buttons.filter(b=>!['navPolymarket','navSignal','navAdmin'].includes(b[1]));
  assert.deepEqual(visible.map(b=>b[1]),['navDashboard','navEvents','navStocks','navConnections','navMap','navTechnicals','navWeekly','navAtlas','navDays','navWatchlist','navAccount']);
  assert.equal(new Set(buttons.map(b=>b[1])).size,buttons.length);
  assert.match(buttons.find(b=>b[1]==='navEvents')[0],/aria-current="page"/);
  assert.equal(buttons.at(-1)[1], 'navAccount');
});
test('Overview uses a distinct orbital scan instead of the News branches',()=>{
  const overview=buttons.find(b=>b[1]==='navDashboard')[0];
  assert.match(overview,/<ellipse cx="12" cy="12" rx="9" ry="7"/);
  assert.doesNotMatch(overview,/<rect/);
  assert.match(overview,/aria-hidden="true"/);
  assert.match(overview,/aria-label="Overview dashboard"/);
});
