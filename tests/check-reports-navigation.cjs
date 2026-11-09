const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
  const tab=await(await fetch('http://127.0.0.1:9331/json/new?about:blank',{method:'PUT'})).json();
  const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(resolve=>ws.onopen=resolve);
  let seq=0;const pending=new Map();
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  const mocked=`window.errors=[];addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
    const fixtureReports=[{id:100,market:'US',title:'Latest sample report',created_at:'2026-11-09T12:00:00Z'},{id:99,market:'US',title:'Earlier sample report',created_at:'2026-11-05T12:00:00Z'}];
    const fixtureStock={symbol:'XOM',name:'ExxonMobil',priceAtPublish:100,technical_signals:{asOf:'2026-11-06',status:'ok',momentum5dPct:2,momentum20dPct:4,annualizedVolatility20dPct:20,avgDailyTurnover20d:1000000,relativeVolume20d:1.2,currency:'USD'}};
    const fixtureGroups=['Energy','Shipping'].map(name=>({name,reason:'Sample cluster summary',stance_score:4,opportunity_angles:['Sample driver'],market_signals:[{source:'FRED',metric:'unemployment_rate',value:4.1,unit:'%',observed_at:'2026-11-01'}],mentioned_stocks:[fixtureStock],fixed_stocks:[fixtureStock],articles:[{title:'Sample story',rating:4,impact:5,impact_timeframe:{duration_min_days:3,duration_max_days:14},source:'Sample source',link:'https://example.com/story',mentioned_companies:[fixtureStock]}]}));
    ClustrAuth.restore=async()=>({user:{id:'fixture'},role:'pro'});ClustrAuth.foundingStatus=async()=>null;
    ClustrWatchlist.init=async()=>{};ClustrUtil.sleep=async()=>{};
    ClustrApi.fetchPublishes=async()=>fixtureReports;ClustrApi.loadGroupsForPublish=async()=>fixtureGroups;
    ClustrApi.fetchHistorySummaries=async()=>{throw Error('Test unavailable history summaries')};
    const fixtureHistory=fixtureReports.slice().reverse().map(p=>({date:p.created_at,stanceScore:4,stance:'constructive',defaults:[],prices:{}}));
    ClustrApi.fetchStanceHistory=async(name,scope)=>fixtureHistory.filter(row=>Date.parse(row.date)<=Date.parse(scope.asOf));
    ClustrApi.localStanceHistory=()=>fixtureHistory;
    ClustrQuotes.getLatestQuotes=async symbols=>Object.fromEntries(symbols.map(symbol=>[symbol,{price:105,changePercent:1,asOf:'2026-11-09T13:00:00Z'}]));
    ClustrQuotes.getQuotes=ClustrQuotes.getLatestQuotes;ClustrRender.renderMoversStrip=()=>{};
    ClustrStocks.mount=()=>{};
    localStorage.setItem('clustr-view-mode','advanced');localStorage.setItem('clustr-news-view','desk');localStorage.removeItem('clustr-news-modes');
  `;
  ws.onmessage=async event=>{
    const msg=JSON.parse(event.data);
    if(msg.id){const task=pending.get(msg.id);msg.error?task.reject(new Error(msg.error.message)):task.resolve(msg.result);pending.delete(msg.id);}
    if(msg.method==='Fetch.requestPaused')await call('Fetch.fulfillRequest',{requestId:msg.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/javascript'}],body:Buffer.from(mocked+fs.readFileSync('js/app.js','utf8')).toString('base64')});
  };
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const wait=expression=>evaluate(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const t=setInterval(()=>{if(window.errors?.length){clearInterval(t);reject(Error(window.errors.slice(0,3).join('; ')));return;}if(${expression}){clearInterval(t);resolve()}else if(Date.now()>end){clearInterval(t);reject(Error('App state timed out: '+JSON.stringify({errors:window.errors,status:document.getElementById('status')?.textContent}))) }},50)})`);
  try{
    await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await call('Fetch.enable',{patterns:[{urlPattern:'*js/app.js*',requestStage:'Request'}]});
    await call('Page.navigate',{url:(process.env.PREVIEW_URL||'http://127.0.0.1:8874')+'/index.html'});
    await wait(`window.ClustrApp?.getPublishes().length===2&&!document.body.classList.contains('auth-locked')`);
    await wait(`document.querySelector('[data-simple-desk]')&&!document.querySelector('[data-simple-desk]').hidden`);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('button[data-news-view]')].map(button=>button.textContent)`),['Connection desk','Full feed']);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('button[data-view-mode]')].map(button=>button.textContent)`),['Simple','Advanced']);
    assert.equal(await evaluate(`document.querySelector('.simple-layout-switch').hidden&&document.querySelector('[data-simple-grid]').hidden`),true);
    await evaluate(`document.querySelector('button[data-view-mode="advanced"]').click()`);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-simple-center]')].map(button=>button.textContent)`),['Summary','Impact chart','Context','Market data','Stock data','Charts','Sources']);
    assert.equal(await evaluate(`!document.querySelector('.desk-advanced-analysis')&&!document.querySelector('[data-desk-analysis] .cluster-card')&&!!document.querySelector('.simple-desk-cluster [data-desk-analysis]')`),true);
    await evaluate(`document.querySelector('[data-simple-center="stocks"]').click()`);
    await wait(`document.querySelector('[data-desk-analysis] .technical-metrics')&&document.querySelector('[data-desk-analysis] .stance-history-canvas')`);
    assert.equal(await evaluate(`!document.getElementById('simpleView').hidden&&document.querySelector('[data-desk-analysis] .cluster-market-signals').textContent.includes('FRED')`),true);
    assert.equal(await evaluate(`document.querySelectorAll('[data-desk-analysis] iframe').length`),0);
    await evaluate(`window.deskCard=document.querySelector('[data-desk-analysis] .cluster-card');window.deskCanvas=deskCard.querySelector('.stance-history-canvas');window.deskNews=document.querySelector('.simple-desk-news');window.deskStocks=document.querySelector('.simple-desk-stocks')`);
    for(const [tab,shown,hidden]of [['context','.cluster-context','.cluster-market-signals'],['market','.cluster-market-signals','.stock-sidebar'],['sources','.articles-panel','.chart-folder'],['charts','.chart-folder','.stock-sidebar']]){
      await evaluate(`document.querySelector('[data-simple-center="${tab}"]').click()`);
      assert.equal(await evaluate(`getComputedStyle(deskCard.querySelector('${shown}')).display!=='none'&&getComputedStyle(deskCard.querySelector('${hidden}')).display==='none'`),true,tab+' content visibility');
      assert.equal(await evaluate(`document.querySelector('[data-desk-analysis] .cluster-card')===deskCard&&document.querySelector('.simple-desk-news')===deskNews&&document.querySelector('.simple-desk-stocks')===deskStocks`),true,'tabs must retain mounted components');
    }
    await evaluate(`document.querySelector('[data-desk-analysis] [data-chart-mode="impact"]').click()`);
    assert.equal(await evaluate(`!document.querySelector('[data-desk-analysis] .chart-mode-impact').classList.contains('is-hidden')`),true);
    await evaluate(`document.querySelector('[data-simple-center="summary"]').click();document.querySelector('[data-simple-center="charts"]').click()`);
    assert.equal(await evaluate(`deskCard.querySelector('.stance-history-canvas')===deskCanvas&&!deskCard.querySelector('.chart-mode-impact').classList.contains('is-hidden')`),true);
    await evaluate(`document.querySelector('[data-desk-analysis] [data-chart-mode="stance"]').click()`);
    await wait(`deskCanvas._clustrChart?.width>0`);
    const chartShot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(process.env.TEMP+'/clustr-news-center-charts.png',Buffer.from(chartShot.data,'base64'));
    await evaluate(`document.querySelector('[data-simple-center="charts"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))`);
    assert.equal(await evaluate(`document.activeElement.dataset.simpleCenter`),'sources');
    assert.equal(await evaluate(`(()=>{const ids=[...document.querySelectorAll('[id]')].map(node=>node.id);return new Set(ids).size===ids.length})()`),true);
    await evaluate(`document.querySelector('[data-simple-center="stocks"]').click();document.querySelector('.simple-desk-columns').scrollIntoView()`);
    const deskShot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(process.env.TEMP+'/clustr-news-desk-advanced.png',Buffer.from(deskShot.data,'base64'));
    await evaluate(`ClustrApp.jumpToCluster('Shipping')`);
    assert.equal(await evaluate(`document.querySelector('.simple-desk-top h2').textContent`),'Shipping');
    await evaluate(`document.querySelector('button[data-news-view="feed"]').click()`);
    assert.equal(await evaluate(`document.getElementById('simpleView').hidden&&getComputedStyle(document.getElementById('eventsView')).display!=='none'`),true);
    await evaluate(`document.querySelector('#eventsList .cluster-expand').click()`);
    await wait(`document.querySelector('#eventsList .technical-metrics')&&document.querySelector('#eventsList .stance-history-canvas')`);
    await evaluate(`document.querySelector('button[data-view-mode="simple"]').click()`);
    assert.equal(await evaluate(`['.cluster-news-ratings','.cluster-context','.group-since-publish','.technical-metrics','.related-under-chart','.stance-chart-controls','.stance-stat-grid'].every(selector=>[...document.querySelectorAll('#eventsList '+selector)].every(node=>getComputedStyle(node).display==='none'))`),true);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('#eventsList .chart-folder')).display!=='none'&&getComputedStyle(document.querySelector('#eventsList .price-bar-grid')).display!=='none'`),true);
    await evaluate(`document.querySelector('#eventsList .stock-analysis').scrollIntoView()`);
    const feedShot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(process.env.TEMP+'/clustr-news-feed-simple.png',Buffer.from(feedShot.data,'base64'));
    await evaluate(`document.querySelector('button[data-news-view="desk"]').click()`);
    assert.equal(await evaluate(`document.querySelector('button[data-view-mode="advanced"]').getAttribute('aria-pressed')`),'true');
    await evaluate(`document.querySelector('button[data-view-mode="simple"]').click()`);
    assert.equal(await evaluate(`!document.querySelector('[data-desk-analysis]')`),true);
    await evaluate(`document.querySelector('button[data-news-view="feed"]').click()`);
    assert.equal(await evaluate(`document.querySelector('button[data-view-mode="simple"]').getAttribute('aria-pressed')`),'true');
    assert.deepEqual(await evaluate(`JSON.parse(localStorage.getItem('clustr-news-modes'))`),{desk:'simple',feed:'simple'});
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await new Promise(resolve=>setTimeout(resolve,250));
    for(const news of ['desk','feed'])for(const detail of ['simple','advanced']){
      await evaluate(`document.querySelector('[data-news-view="${news}"]').click();document.querySelector('[data-view-mode="${detail}"]').click()`);
      assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),true,news+' '+detail+' overflows on phone');
      if(news==='desk'&&detail==='advanced'){
        await evaluate(`document.querySelector('[data-simple-pane="cluster"]').click()`);
        for(const tab of ['context','market','stocks','charts','sources']){
          await evaluate(`document.querySelector('[data-simple-center="${tab}"]').click()`);
          assert.equal(await evaluate(`(()=>{const box=document.querySelector('[data-desk-analysis]').getBoundingClientRect();return document.documentElement.scrollWidth<=innerWidth&&box.width>0&&box.left>=0&&box.right<=innerWidth})()`),true,'phone centre '+tab);
        }
        await evaluate(`document.querySelector('.simple-desk-cluster').scrollIntoView({block:'start'});scrollTo(0,scrollY)`);
        const phoneShot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(process.env.TEMP+'/clustr-news-center-phone.png',Buffer.from(phoneShot.data,'base64'));
        await evaluate(`document.querySelector('button[data-view-mode="simple"]').click()`);
        assert.equal(await evaluate(`document.querySelector('[data-simple-center="summary"]').getAttribute('aria-selected')`),'true');
      }
    }
    await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await evaluate(`document.getElementById('navStocks').click()`);
    assert.equal(await evaluate(`document.documentElement.dataset.viewMode`),'advanced');
    assert.equal(await evaluate(`document.getElementById('newsViewSwitch').hidden`),true);
    await evaluate(`document.getElementById('navDays').click()`);
    await wait(`document.querySelectorAll('[data-simple-day]').length>27`);
    assert.equal(await evaluate(`getComputedStyle(document.getElementById('simpleView')).display!=='none'&&document.querySelector('.simple-report-calendar').getBoundingClientRect().height>0`),true);
    await evaluate(`ClustrSimple.setReports([{publish:ClustrApp.getPublishes()[1],index:1}])`);
    assert.equal(await evaluate(`document.querySelectorAll('[data-simple-report]').length`),1);
    assert.equal(await evaluate(`document.querySelector('[data-simple-day][aria-pressed="true"]').dataset.simpleDay`),'2026-11-05');
    await evaluate(`document.querySelector('[data-simple-report]').click()`);
    await wait(`document.documentElement.dataset.activeView==='events'&&ClustrApp.getPublishIndex()===1`);
    assert.deepEqual(await evaluate('window.errors'),[]);
    console.log('Real app navigation: centre analysis tabs, retained stock/chart state, keyboard navigation, lazy TradingView, four News modes, mobile tabs, Simple cleanup and Reports selection passed.');
  }finally{await call('Browser.close');ws.close();}
})().catch(error=>{console.error(error);process.exit(1)});
