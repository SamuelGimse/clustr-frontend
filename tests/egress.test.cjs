const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function setup() {
  let owner='Alice'; const calls=[];
  const publish={id:1,title:'Sample',market:'US',notes:'PULSE pipeline',created_at:'2026-11-06T12:00:00Z'};
  const full={...publish,groups_json:[{name:'Semiconductors',stance_score:4,articles:[{title:'Intel update',link:'https://example.com/a',source:'Example',rating:4,short_summary:'Large body'}],fixed_stocks:[{symbol:'INTC',priceAtPublish:25,technical_signals:{volatility:12}}]}]};
  const compact={...publish,groups_json:[{name:'Semiconductors',stance_score:4,articles:[{title:'Intel update',link:'https://example.com/a',source:'Example',rating:4}],fixed_stocks:[{symbol:'INTC',priceAtPublish:25}]}]};
  let hook;
  const window={ClustrConfig:{SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'public'},ClustrAuth:{accessToken:()=>owner}};
  const context={window,URLSearchParams,Date,console,fetch:async(url,options)=>{
    calls.push({url,options});
    if(hook){const result=hook(url,options);if(result)return result;}
    const query=new URL(url).searchParams;
    return {ok:true,json:async()=>url.includes('/rpc/')?[compact]:query.get('select')==='id,groups_json'?[full]:[publish]};
  }};
  vm.createContext(context);
  for(const file of ['js/util.js','js/cluster-taxonomy.js','js/api.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context);
  window.ClustrTaxonomy=context.ClustrTaxonomy;
  return {api:window.ClustrApi,calls,publish,full,compact,setOwner:value=>{owner=value;},setHook:value=>{hook=value;}};
}

test('All report lists omit large bodies; concurrent detail reads share one authenticated request',async()=>{
  const s=setup();
  await s.api.fetchPublishes(100);await s.api.fetchPublishesInRange('2026-11-01','2026-11-08');await s.api.fetchAllPublishes();
  assert.equal(s.calls.length,3);
  for(const call of s.calls)assert(!new URL(call.url).searchParams.get('select').includes('groups_json'));
  const [a,b]=await Promise.all([s.api.loadGroupsForPublish(s.publish),s.api.loadGroupsForPublish(s.publish)]);
  assert.equal(s.calls.length,4);assert.deepEqual(a,b);assert.equal(a[0].articles[0].rating,4);
  assert.equal(a[0].articles[0].short_summary,'Large body');
  assert.equal(s.calls.at(-1).options.headers.Authorization,'Bearer Alice');
  await s.api.loadGroupsForPublish(s.publish);assert.equal(s.calls.length,4);
  s.api.invalidatePublishHistory();await s.api.loadGroupsForPublish(s.publish);assert.equal(s.calls.length,5);
});

test('All cluster histories share compact snapshots and preserve scores and default prices',async()=>{
  const s=setup();
  const [rows]=await Promise.all([s.api.fetchHistorySummaries(),s.api.fetchHistorySummaries()]);
  assert.equal(s.calls.length,1);assert(s.calls[0].url.includes('/rpc/clustr_history_snapshots'));
  const history=await s.api.fetchStanceHistory('Semiconductors',{market:'US',asOf:'2026-11-07'});
  assert.equal(s.calls.length,1);assert.equal(history[0].stanceScore,4);
  assert.equal(history[0].defaults[0].priceAtPublish,25);
  assert.equal(s.api.localStanceHistory('Semiconductors',{market:'US',asOf:'2026-11-07'}).length,1);
  assert(!rows[0].groups_json[0].articles[0].short_summary);
});

test('Caches never cross accounts and failed or unavailable details can retry',async()=>{
  const s=setup();await s.api.loadGroupsForPublish(s.publish);await s.api.fetchHistorySummaries();
  s.setOwner('Bob');await s.api.loadGroupsForPublish(s.publish);await s.api.fetchHistorySummaries();
  assert.equal(s.calls.length,4);assert(s.calls.slice(2).every(call=>call.options.headers.Authorization==='Bearer Bob'));
  s.api.invalidatePublishHistory();s.setHook(()=>({ok:true,json:async()=>[]}));
  await assert.rejects(s.api.loadGroupsForPublish(s.publish),/not available/);
  s.setHook(null);assert.equal((await s.api.loadGroupsForPublish(s.publish)).length,1);
  s.api.invalidatePublishHistory();let release;
  s.setHook(()=>new Promise(resolve=>{release=resolve;}));
  const pending=s.api.fetchHistorySummaries();s.setOwner('Carol');s.setHook(null);
  await s.api.fetchHistorySummaries();release({ok:true,json:async()=>[s.compact]});
  await assert.rejects(pending,/Account changed/);
});
