(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.ClustrTechnicals=api;})(typeof window==='undefined'?globalThis:window,function(root){
  let host,rows=[],query='',bias='',generation=0;
  const labels={bullish:'Bullish',bearish:'Bearish',neutral:'Neutral',mixed:'Mixed',unavailable:'Unavailable'};
  const esc=value=>root.ClustrUtil.escapeHtml(String(value??''));
  function state(row,now=Date.now()){
    if(!labels[row.bias]||!Number.isFinite(Date.parse(row.generated_at))||Date.parse(row.generated_at)>now+60000)return 'unavailable';
    if(row.bias==='unavailable'||!row.payload?.bar_count||!Number.isFinite(Date.parse(row.as_of)))return 'unavailable';
    return now-Date.parse(row.as_of)>5*86400000?'stale':row.bias;
  }
  const name=value=>labels[value]||'Stale';
  const chip=value=>`<span class="tech-bias tech-bias--${esc(value)}">${name(value)}</span>`;
  function detector(item,title){
    if(!item||item.status!=='ok')return `<section><h3>${title}</h3><p class="tech-muted">${item?.status==='insufficient_history'?'Not enough price history.':'Scan unavailable.'}</p></section>`;
    return `<section><h3>${title} ${chip(item.bias)}</h3>${item.patterns?.length?`<ul>${item.patterns.map(p=>`<li>${esc(p.name)}${Number.isFinite(p.confidence)?` <small>${Math.round(p.confidence*100)}% detection confidence</small>`:''}</li>`).join('')}</ul>`:'<p class="tech-muted">No directional pattern detected.</p>'}</section>`;
  }
  function visibleRows(){
    const watched=new Set((root.ClustrWatchlist?.getItems?.()||[]).map(item=>item.symbol));
    const filtered=root.ClustrWatchlist?.isFiltered?.();
    const clusterSymbols=new Set();
    if(filtered)for(const group of root.ClustrWatchlist?.filterGroups(root.ClustrApp?.getAllGroups?.()||[])||[])for(const stock of root.ClustrWatchlist.groupStocks(group,'US'))clusterSymbols.add(stock.symbol);
    return rows.filter(row=>(!filtered||watched.has(row.symbol)||clusterSymbols.has(row.symbol))&&(!query||`${row.symbol}`.toLowerCase().includes(query))&&(!bias||state(row)===bias));
  }
  function paint(){
    if(!host)return;
    const list=visibleRows();
    host.querySelector('[data-tech-count]').textContent=`${list.length} of ${rows.length} stocks`;
    host.querySelector('[data-tech-list]').innerHTML=list.map(row=>{
      const status=state(row),payload=row.payload||{},date=payload.bar_count?new Date(row.as_of).toLocaleDateString('en',{timeZone:'UTC',month:'short',day:'numeric'}):'Unavailable';
      return `<details class="tech-stock"><summary><div><strong>${esc(row.symbol)}</strong><small>Daily · ${esc(date)}</small></div><div class="tech-stock-price">${Number.isFinite(Number(row.last_close))&&row.last_close!=null?`${esc(payload.currency||'')} ${Number(row.last_close).toLocaleString('en',{minimumFractionDigits:2,maximumFractionDigits:Number(row.last_close)<1?6:2})}`:'—'}</div>${chip(status)}<span aria-hidden="true">⌄</span></summary><div class="tech-detail">${status==='stale'?'<p class="tech-muted">The saved scan is over five calendar days old. Refresh reads saved scans; it does not run the detectors.</p>':''}<div class="tech-detectors">${detector(payload.yolo,'YOLO')}${detector(payload.geometric,'Geometric')}</div><p class="tech-muted">Checked ${esc(new Date(row.generated_at).toLocaleString())} · ${esc(row.detector_version)} · ${esc(payload.bar_count||0)} completed bars</p><p class="tech-muted">${payload.yolo?.bias!==payload.geometric?.bias?'Detectors differ. ':''}Daily pattern bias has no calibrated forecast horizon or probability of a price rise.</p></div></details>`;
    }).join('')||'<p class="tech-empty">No saved scans match this scope. Try All content or clear the filters.</p>';
  }
  async function load(){
    const target=host,id=++generation,owner=root.ClustrAuth?.sessionKey?.();
    target.querySelector('[data-tech-status]').textContent='Loading saved scans…';
    try{
      const data=await root.ClustrApi.fetchTechnicalSignals();
      if(id!==generation||target!==host||owner!==root.ClustrAuth?.sessionKey?.())return;
      rows=data;paint();
      target.querySelector('[data-tech-status]').textContent=rows.length?'Latest independent scans · updated separately from news reports.':'No technical scans have been saved yet.';
    }catch(error){
      if(id===generation&&target===host){rows=[];paint();target.querySelector('[data-tech-status]').textContent='Could not load technical scans. Refresh to retry.';}
    }
  }
  function mount(element){
    host=element;if(!host)return;
    host.innerHTML=`<header class="tech-heading"><div><h1>Technicals <span class="tech-experimental">Experimental</span></h1><p>YOLO patterns and independent price geometry.</p></div><button type="button" class="account-secondary" data-tech-refresh>Refresh</button></header><div class="tech-tools"><label>Find a stock<input type="search" placeholder="Ticker" aria-label="Search technical stocks" data-tech-search></label><label>Bias<select data-tech-bias aria-label="Filter technical bias"><option value="">All signals</option value="bullish">Bullish</option><option value="neutral">Neutral</option><option value="bearish">Bearish</option><option value="mixed">Mixed</option><option value="unavailable">Unavailable</option><option value="stale">Stale</option></select></label><span data-tech-count role="status"></span></div><p class="tech-muted" data-tech-status role="status"></p><div class="tech-column-labels"><span>Stock / data through</span><span>Last close</span><span>Technical bias</span></div><div data-tech-list></div><details class="tech-method"><summary>How to read these signals</summary><p>Bullish and bearish describe detected chart shapes. Neutral means both scans completed without a directional result. Mixed means conflicting patterns. Unavailable means at least one scan failed or lacked enough history. A single directional detector with a neutral second detector can give directional bias; open the row to see both.</p><p>Geometric v1 checks confirmed double tops/bottoms and 20-session range breaks. YOLO uses pinned pretrained chart-pattern weights with an independent chart renderer. Only earlier US calendar dates are included, so the current session is always excluded. Detection confidence is not a probability of a stock rising.</p></details>`;
    host.querySelector('[data-tech-search]').value=query;
    host.querySelector('[data-tech-bias]').value=bias;
    host.querySelector('[data-tech-search]').oninput=event=>{query=event.target.value.trim().toLowerCase();paint();};
    host.querySelector('[data-tech-bias]').onchange=event=>{bias=event.target.value;paint();};
    host.querySelector('[data-tech-refresh]').onclick=load;
    load();
  }
  function leave(){generation++;rows=[];if(host)host.innerHTML='';host=null;}
  return {mount,state,leave,refreshScope:paint};
});
