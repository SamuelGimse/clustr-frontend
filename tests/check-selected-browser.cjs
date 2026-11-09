const fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
  const tab=await(await fetch('http://127.0.0.1:9331/json/new?about:blank',{method:'PUT'})).json();
  const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(resolve=>ws.onopen=resolve);
  let seq=0;const pending=new Map();
  ws.onmessage=event=>{const msg=JSON.parse(event.data);if(msg.id){const task=pending.get(msg.id);msg.error?task.reject(new Error(msg.error.message)):task.resolve(msg.result);pending.delete(msg.id);}};
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
  const settle=()=>new Promise(resolve=>setTimeout(resolve,150));
  const go=async view=>{await evaluate(`preview('${view}')`);await settle();};
  try{
    await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await call('Page.navigate',{url:'http://127.0.0.1:8874/tests/selected-layout-preview.html'});
    await evaluate(`new Promise((resolve,reject)=>{const end=Date.now()+15000;const timer=setInterval(()=>{if(window.readyView){clearInterval(timer);resolve()}else if(Date.now()>end){clearInterval(timer);reject(new Error('Fixture did not boot'))}},50)})`);
    await go('events');
    assert.equal(await evaluate(`(()=>{const s=document.querySelector('[data-simple-cluster]');s.value='Energy supply';s.dispatchEvent(new Event('change',{bubbles:true}));return s===document.querySelector('[data-simple-cluster]')&&document.querySelector('.simple-desk-top').textContent.includes('Energy supply')})()`),true);
    assert.equal(await evaluate(`(()=>{const s=document.querySelector('[data-simple-sort]');s.value='negative';s.dispatchEvent(new Event('change',{bubbles:true}));return s===document.querySelector('[data-simple-sort]')})()`),true);
    await evaluate(`document.querySelector('[data-simple-layout="desk"]').click()`);
    assert.equal(await evaluate(`document.querySelector('[data-simple-grid]').hidden`),true);
    await go('dashboard');
    assert.equal(await evaluate(`(()=>{const s=document.querySelector('[data-dash-cluster]');s.value='Energy supply';s.dispatchEvent(new Event('change',{bubbles:true}));return s===document.querySelector('[data-dash-cluster]')&&document.querySelector('.dash-impact-chart').getAttribute('aria-label').includes('Energy supply')})()`),true);
    await go('stocks');
    await evaluate(`ClustrStocks.selectSymbol('JPM')`);
    assert.match(await evaluate(`document.getElementById('stocksSelectedHeading').textContent`),/JPM/);
    assert.equal(await evaluate(`(()=>{const s=document.getElementById('stocksSearch');s.value='NVDA';s.dispatchEvent(new Event('input',{bubbles:true}));return s===document.getElementById('stocksSearch')&&document.querySelectorAll('#stocksGrid .stocks-tile').length===1})()`),true);
    await go('connections');
    await evaluate(`(()=>{const s=document.querySelector('[aria-label="Network time range"]');s.value='3';s.dispatchEvent(new Event('change',{bubbles:true}))})()`);await settle();
    assert.equal(await evaluate(`document.querySelector('[aria-label="Network time range"]').value`),'3');
    await go('map');
    assert.equal(await evaluate(`(()=>{const s=document.querySelector('#simpleWorldRail input');s.value='Norway';s.dispatchEvent(new Event('input',{bubbles:true}));return [...document.querySelectorAll('#countryPanel button')].filter(b=>!b.hidden).length})()`),1);
    await evaluate(`ClustrSimple.hide()`);
    assert.equal(await evaluate(`!document.getElementById('simpleWorldRail')&&[...document.querySelectorAll('#countryPanel button')].every(b=>!b.hidden)`),true);
    await go('weekly');
    await evaluate(`document.querySelector('[data-week-day]:not([data-week-day=""])').click()`);
    assert.equal(await evaluate(`document.querySelector('#simpleWeekStrip [aria-pressed="true"]').dataset.weekDay.length>0`),true);
    await go('atlas');
    await evaluate(`document.querySelector('[data-atlas-entity="stocks"]').click()`);
    assert.equal(await evaluate(`!!document.querySelector('[data-atlas-stock]')`),true);
    await go('days');
    assert.equal(await evaluate(`(()=>{const s=document.querySelector('[data-simple-month]');s.dispatchEvent(new Event('change',{bubbles:true}));return s===document.querySelector('[data-simple-month]')&&document.querySelectorAll('[data-simple-day]').length>27})()`),true);
    await go('watchlist');
    assert.equal(await evaluate(`document.querySelectorAll('[data-watch-saved] .watchlist-stock').length`),3);
    await evaluate(`ClustrWatchlist.setSaved({symbol:'AAPL',name:'Apple'},'US',true)`);await settle();
    assert.equal(await evaluate(`document.querySelectorAll('[data-watch-saved] .watchlist-stock').length`),4);
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    for(const view of ['events','stocks','dashboard','map','connections','weekly','atlas','days','watchlist']){
      await go(view);
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,view+' overflows on phone');
      const shot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(process.env.TEMP+'/clustr-selected-final-'+view+'.png',Buffer.from(shot.data,'base64'));
    }
    assert.deepEqual(await evaluate('window.errors'),[]);
    console.log('Selected layouts: News layout/cluster/sort, Overview chart, stock navigation/search, Network range, World search/restore, weekly day filter, History stocks, report calendar, watchlist save, and nine phone widths passed.');
  }finally{await call('Browser.close');ws.close();}
})().catch(error=>{console.error(error);process.exit(1)});
