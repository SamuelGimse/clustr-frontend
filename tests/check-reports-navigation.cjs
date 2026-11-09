const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
  const tab=await(await fetch('http://127.0.0.1:9331/json/new?about:blank',{method:'PUT'})).json();
  const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(resolve=>ws.onopen=resolve);
  let seq=0;const pending=new Map();
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  const mocked=`window.errors=[];addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
    const fixtureReports=[{id:100,market:'US',title:'Latest sample report',created_at:'2026-11-09T12:00:00Z'},{id:99,market:'US',title:'Earlier sample report',created_at:'2026-11-05T12:00:00Z'}];
    const fixtureGroups=[{name:'Energy',stance_score:4,articles:[{title:'Sample story',rating:4}]}];
    ClustrAuth.restore=async()=>({user:{id:'fixture'},role:'pro'});ClustrAuth.foundingStatus=async()=>null;
    ClustrWatchlist.init=async()=>{};ClustrUtil.sleep=async()=>{};
    ClustrApi.fetchPublishes=async()=>fixtureReports;ClustrApi.loadGroupsForPublish=async()=>fixtureGroups;
    ClustrApi.fetchHistorySummaries=async()=>{throw Error('Test unavailable history summaries')};
    ClustrRender.renderEvents=async()=>{document.getElementById('eventsView').innerHTML='<article id="fixtureFullFeed">Sample full feed</article>'};ClustrRender.renderMoversStrip=()=>{};
    ClustrStocks.mount=()=>{};
    localStorage.setItem('clustr-view-mode','advanced');localStorage.setItem('clustr-news-view','desk');
  `;
  ws.onmessage=async event=>{
    const msg=JSON.parse(event.data);
    if(msg.id){const task=pending.get(msg.id);msg.error?task.reject(new Error(msg.error.message)):task.resolve(msg.result);pending.delete(msg.id);}
    if(msg.method==='Fetch.requestPaused')await call('Fetch.fulfillRequest',{requestId:msg.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/javascript'}],body:Buffer.from(mocked+fs.readFileSync('js/app.js','utf8')).toString('base64')});
  };
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const wait=expression=>evaluate(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const t=setInterval(()=>{if(window.errors?.length){clearInterval(t);reject(Error(window.errors.slice(0,3).join('; ')));return;}if(${expression}){clearInterval(t);resolve()}else if(Date.now()>end){clearInterval(t);reject(Error('App state timed out: '+JSON.stringify({errors:window.errors,status:document.getElementById('status')?.textContent}))) }},50)})`);
  try{
    await call('Fetch.enable',{patterns:[{urlPattern:'*js/app.js*',requestStage:'Request'}]});
    await call('Page.navigate',{url:(process.env.PREVIEW_URL||'http://127.0.0.1:8874')+'/index.html'});
    await wait(`window.ClustrApp?.getPublishes().length===2&&!document.body.classList.contains('auth-locked')`);
    await wait(`document.querySelector('[data-simple-desk]')&&!document.querySelector('[data-simple-desk]').hidden`);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('button[data-view-mode]')].map(button=>button.textContent)`),['Connection desk','Full feed']);
    assert.equal(await evaluate(`document.querySelector('.simple-layout-switch').hidden&&document.querySelector('[data-simple-grid]').hidden`),true);
    await evaluate(`document.querySelector('button[data-view-mode="advanced"]').click()`);
    assert.equal(await evaluate(`document.getElementById('simpleView').hidden&&getComputedStyle(document.getElementById('eventsView')).display!=='none'&&!!document.getElementById('fixtureFullFeed')`),true);
    assert.deepEqual(await evaluate(`[localStorage.getItem('clustr-news-view'),localStorage.getItem('clustr-view-mode')]`),['feed','advanced']);
    await evaluate(`document.getElementById('navStocks').click()`);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('button[data-view-mode]')].map(button=>button.textContent)`),['Simple','Advanced']);
    assert.equal(await evaluate(`document.documentElement.dataset.viewMode`),'advanced');
    await evaluate(`document.querySelector('button[data-view-mode="simple"]').click();document.getElementById('navEvents').click()`);
    assert.equal(await evaluate(`document.querySelector('button[data-view-mode="advanced"]').getAttribute('aria-pressed')`),'true');
    await evaluate(`document.querySelector('button[data-view-mode="simple"]').click();document.getElementById('navStocks').click()`);
    assert.equal(await evaluate(`document.documentElement.dataset.viewMode`),'simple');
    assert.deepEqual(await evaluate(`[localStorage.getItem('clustr-news-view'),localStorage.getItem('clustr-view-mode')]`),['desk','simple']);
    await evaluate(`document.getElementById('navEvents').click()`);
    assert.equal(await evaluate(`document.querySelector('button[data-view-mode="simple"]').textContent`),'Connection desk');
    await evaluate(`document.getElementById('navDays').click()`);
    await wait(`document.querySelectorAll('[data-simple-day]').length>27`);
    assert.equal(await evaluate(`getComputedStyle(document.getElementById('simpleView')).display!=='none'&&document.querySelector('.simple-report-calendar').getBoundingClientRect().height>0`),true);
    await evaluate(`ClustrSimple.setReports([{publish:ClustrApp.getPublishes()[1],index:1}])`);
    assert.equal(await evaluate(`document.querySelectorAll('[data-simple-report]').length`),1);
    assert.equal(await evaluate(`document.querySelector('[data-simple-day][aria-pressed="true"]').dataset.simpleDay`),'2026-11-05');
    await evaluate(`document.querySelector('[data-simple-report]').click()`);
    await wait(`document.documentElement.dataset.activeView==='events'&&ClustrApp.getPublishIndex()===1`);
    assert.deepEqual(await evaluate('window.errors'),[]);
    console.log('Real app navigation: independent News views, direct Connection desk, Full feed, retained detail preferences, Reports calendar and correct publish selection passed.');
  }finally{await call('Browser.close');ws.close();}
})().catch(error=>{console.error(error);process.exit(1)});
