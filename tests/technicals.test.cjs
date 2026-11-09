const test=require('node:test');
const assert=require('node:assert/strict');
const {state}=require('../js/technicals.js');
test('Technical scans distinguish neutral, unavailable, disagreement, and stale data',()=>{
  const now=Date.parse('2026-11-09T12:00:00Z');
  const row={bias:'neutral',as_of:'2026-11-06T00:00:00Z',generated_at:'2026-11-09T10:00:00Z',payload:{bar_count:240}};
  assert.equal(state(row,now),'neutral');
  assert.equal(state({...row,bias:'mixed'},now),'mixed');
  assert.equal(state({...row,bias:'unavailable'},now),'unavailable');
  assert.equal(state({...row,payload:{bar_count:0}},now),'unavailable');
  assert.equal(state({...row,as_of:'2026-10-31T00:00:00Z'},now),'stale');
  assert.equal(state({...row,generated_at:'2030-01-01T00:00:00Z'},now),'unavailable');
});
