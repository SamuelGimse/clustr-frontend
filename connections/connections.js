(function (root) {
  let currentScene = null;
  let periodDays=1, revision=0, currentFocus=null;
  const stockFields=['mentioned_stocks','close_stocks','original_stocks','fixed_stocks','default_stocks','direct_stocks','related_stocks','stocks'];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function safeUrl(value) { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; } }
  function storyKey(value) {
    const url=new URL(value);url.hash='';
    for(const key of [...url.searchParams.keys()])if(/^(utm_|at_)|^(fbclid|gclid)$/i.test(key))url.searchParams.delete(key);
    url.searchParams.sort();return url.href;
  }
  function matchesNode(node, query='', type='') {
    return (!type || node.type===type) && `${node.label} ${node.name||''} ${node.article?.source||''} ${node.article?.short_summary||''}`.toLowerCase().includes(query.toLowerCase());
  }
  function windowRange(publish,days) {
    if(![1,2,3].includes(Number(days)))throw new Error('Choose 1, 2 or 3 days');
    const end=Date.parse(publish?.created_at);
    if(!Number.isFinite(end))throw new Error('Report date unavailable');
    return {start:end-Number(days)*86400000,end};
  }
  function mergeReports(rows,market) {
    const merged=new Map();
    for(const {publish,groups} of [...rows].sort((a,b)=>Date.parse(b.publish.created_at)-Date.parse(a.publish.created_at))) {
      if(String(publish.market||'').toUpperCase()!==market)continue;
      for(const group of Array.isArray(groups)?groups:[]) {
        if(!group||group.market&&String(group.market).toUpperCase()!==market)continue;
        const name=root.ClustrTaxonomy?.canonicalName(group.name||group.group)||group.name||group.group||'Unnamed cluster';
        const key=String(name).trim().toLowerCase();
        if(!merged.has(key))merged.set(key,{...group,name,market,articles:[],...Object.fromEntries(stockFields.map(field=>[field,[]]))});
        const item=merged.get(key);
        for(const field of ['articles',...stockFields]) {
          const seen=new Set(item[field].map(value=>field==='articles'?(safeUrl(value?.link)?storyKey(safeUrl(value.link)):JSON.stringify([value?.title,value?.source,value?.date])):String(value?.symbol||'').trim().toUpperCase()));
          for(const value of Array.isArray(group[field])?group[field]:[]) {
            if(!value||typeof value!=='object'||field!=='articles'&&value.resolved===false)continue;
            const id=field==='articles'?(safeUrl(value.link)?storyKey(safeUrl(value.link)):JSON.stringify([value.title,value.source,value.date])):String(value.symbol||'').trim().toUpperCase();
            if(!seen.has(id)){seen.add(id);item[field].push(field==='articles'?value:{...value,_networkReportAt:publish.created_at});}
          }
        }
      }
    }
    return [...merged.values()];
  }
  async function loadWindow(publish,days,api) {
    const range=windowRange(publish,days),market=String(publish.market||'').toUpperCase();
    if(!market)throw new Error('Report market unavailable');
    const rows=await api.fetchPublishesInRange(new Date(range.start),new Date(range.end));
    const reports=new Map([...rows,publish].filter(p=>p&&String(p.market||'').toUpperCase()===market&&Date.parse(p.created_at)>range.start&&Date.parse(p.created_at)<=range.end).map(p=>[String(p.id??p.created_at),p]));
    const data=await Promise.all([...reports.values()].map(async p=>({publish:p,groups:await api.loadGroupsForPublish(p)})));
    return {groups:mergeReports(data,market),reports:reports.size,...range};
  }
  async function mount(groups,publish,settings=false) {
    const context=settings && typeof settings==='object'?settings:{};
    const focus=settings===true || !!context.focusControls;
    if([1,2,3].includes(context.days))periodDays=context.days;
    const request=++revision,days=periodDays;
    const change=value=>{periodDays=Number(value);mount(groups,publish,{focusControls:true,focusId:currentFocus?.id,focusLabel:currentFocus?.type==='cluster'?currentFocus.label:null});};
    const options={days,onDays:change,focusId:context.focusId,focusLabel:context.focusLabel,scope:'Loading saved reports…'};
    if(!Array.isArray(context.windowGroups))render(groups,publish,options);
    if(focus)document.getElementById('connectionsView')?.querySelector('[aria-label="Network time range"]')?.focus();
    try {
      const result=Array.isArray(context.windowGroups)?{groups:context.windowGroups,reports:context.reportCount,...windowRange(publish,days)}:await loadWindow(publish,days,root.ClustrApi);
      if(request!==revision)return;
      const date=new Date(result.end).toLocaleString('en-GB',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'});
      render(result.groups,publish,{...options,scope:`Last ${days} ${days===1?'day':'days'} (${days*24} hours) ending ${date} ET · ${result.reports} reports · Latest cluster scores; links and stories combined across the window.`});
    } catch(error) {
      if(request!==revision)return;
      render(groups,publish,{...options,scope:`Could not load the ${days}-day window. Showing the selected report only. ${error.message}`,retry:()=>mount(groups,publish,{focusControls:true,focusId:currentFocus?.id,focusLabel:currentFocus?.type==='cluster'?currentFocus.label:null})});
    }
    if(focus)document.getElementById('connectionsView')?.querySelector('[aria-label="Network time range"]')?.focus();
  }
  function number(value) {
    return ['number','string'].includes(typeof value) && String(value).trim()!=='' && Number.isFinite(Number(value)) ? Number(value) : null;
  }
  function scoreText(value) { return value==null?'—':`${value>0?'+':''}${Number.isInteger(value)?value:value.toFixed(1)}`; }
  function tone(value) { return value==null||value===0?'flat':value>0?'up':'down'; }
  function priceText(value) { return value==null?'Unavailable':value.toLocaleString('en',{minimumFractionDigits:2,maximumFractionDigits:value<1?4:2}); }
  function savedQuote(stock) {
    for(const [rank,raw]of[stock.priceAtPublish,stock.price_at_publish,stock.price].entries()){
      const price=number(raw);if(price==null||price<=0)continue;
      const change=number(stock.changePercentAtPublish??stock.change_percent_at_publish??stock.changePercent??stock.change_percent);
      return {price,change,rank,at:stock._networkReportAt||stock.published_at||null};
    }
    return null;
  }
  function newerQuote(candidate,previous) {
    if(!previous)return true;
    const a=Date.parse(candidate.at),b=Date.parse(previous.at);
    if(Number.isFinite(a)&&Number.isFinite(b)&&a!==b)return a>b;
    if(Number.isFinite(a)!==Number.isFinite(b))return Number.isFinite(a);
    return candidate.rank<previous.rank;
  }
  function buildGraph(groups, market, util=root.ClustrUtil) {
    const nodes = new Map(), edges = [], seen = new Set(), quotes=new Map();
    function connect(from, to, kind, kinds=[kind]) { const key = `${from}|${to}|${kind}`; if (!seen.has(key)) { seen.add(key); edges.push({from,to,kind,kinds}); } }
    (Array.isArray(groups)?groups:[]).forEach((group, i) => {
      if (!group || typeof group!=='object') return;
      if (market && group.market && group.market !== market) return;
      const id = `cluster:${i}`, label = group.name || group.group || 'Unnamed cluster';
      const value = [group.stance_score,group.cluster_score,group.score].find(v=>['number','string'].includes(typeof v)&&String(v).trim()!==''&&Number.isFinite(Number(v))&&Math.abs(Number(v))<=10);
      const score = value===undefined ? null : Number(value);
      nodes.set(id, {id, type:'cluster', label, score, group});
      const layers = [['mentioned_stocks','Mentioned'],['close_stocks','Close link'],['original_stocks','Second order'],['fixed_stocks','Default exposure'],['default_stocks','Default exposure'],['direct_stocks','Direct link'],['related_stocks','Related link'],['stocks','Stock link']];
      const stocks = new Map();
      for (const [field, layer] of layers) for (const stock of Array.isArray(group[field])?group[field]:[]) {
        if (!stock?.symbol || stock.resolved === false) continue;
        if(stock.market&&(market||group.market)&&String(stock.market).toUpperCase()!==String(market||group.market).toUpperCase())continue;
        const symbol = String(stock.symbol).trim().toUpperCase();
        if (!/^[A-Z0-9.^=-]{1,20}$/.test(symbol)) continue;
        const key=`stock:${market || group.market || 'unknown'}:${symbol}`,quote=savedQuote(stock);
        if(quote&&newerQuote(quote,quotes.get(key)))quotes.set(key,quote);

        if (!stocks.has(symbol)) stocks.set(symbol, {stock,kinds:new Set([layer])});
        else if(!['direct_stocks','related_stocks','stocks'].includes(field))stocks.get(symbol).kinds.add(layer);
      }
      for (const [symbol, {stock,kinds}] of stocks) {
        const sid = `stock:${market || group.market || 'unknown'}:${symbol}`;
        if (!nodes.has(sid)) nodes.set(sid,{id:sid,type:'stock',label:symbol,name:stock.name || symbol});
        else if(nodes.get(sid).name===symbol&&stock.name)nodes.get(sid).name=stock.name;
        // Default exposure must never hide a legacy direct relationship.
        if(kinds.has('Default exposure')&&(Array.isArray(group.direct_stocks)?group.direct_stocks:[]).some(s=>s?.resolved!==false&&String(s?.symbol).trim().toUpperCase()===symbol))kinds.add('Direct link');
        const labels=[...kinds],kind=labels.find(x=>x!=='Default exposure')||'Default exposure';
        connect(id,sid,kind,labels);
      }
      (Array.isArray(group.articles)?group.articles:[]).forEach((article, j) => {
        if(!article||typeof article!=='object')return;
        const url = safeUrl(article.link);
        const aid = url ? `news:${storyKey(url)}` : `news:${i}:${j}`;
        if (!nodes.has(aid)) nodes.set(aid,{id:aid,type:'news',label:article.title || 'Source story',url,article,score:Math.abs(number(article.rating??article.score)??Infinity)<=10?number(article.rating??article.score):null});
        connect(id,aid,'Source story');
      });
    });
    for(const node of nodes.values())if(node.type==='stock'){
      const linked=edges.filter(edge=>edge.to===node.id).map(edge=>nodes.get(edge.from).score);
      node.score=util?.articleImpactScore?.(linked)??null;
      const quote=quotes.get(node.id);
      node.price=quote?.price??null;node.change=quote?.change??null;node.quoteAt=quote?.at??null;
    }
    return {nodes:[...nodes.values()],edges};
  }
  function layout(nodes) {
    const result = new Map();
    for (const [type,rx,ry] of [['cluster',245,182],['stock',420,275],['news',540,355]]) {
      const ring = nodes.filter(n=>n.type===type);
      ring.forEach((node,i)=>{const angle=2*Math.PI*i/ring.length-Math.PI/2;result.set(node.id,{x:600+Math.cos(angle)*rx,y:400+Math.sin(angle)*ry});});
    }
    return result;
  }
  function render(groups, publish, options={}) {
    groups = root.ClustrWatchlist?.filterGroups(groups, publish?.market || 'US') || groups;
    currentScene?.destroy();
    currentScene=null;
    const host = document.getElementById('connectionsView');
    if (!host) return;
    host.classList.remove('hidden');
    const nav = document.getElementById('navConnections');
    nav?.classList.add('is-active'); nav?.setAttribute('aria-current','page');
    const graph = buildGraph(groups,publish?.market), positions = layout(graph.nodes);
    let selected = null, query = '', type='', zoom = 1; currentFocus=null;
    const trail=[];
    host.innerHTML = `<header class="cx-hero"><div><p class="cx-eyebrow">CLUSTR MARKET / CONNECTIONS · ${escape(publish?.market || 'REPORT')}</p><h1>Everything is <em>connected.</em></h1><p>Explore the links between events, companies and source stories.</p></div><div class="cx-counts">${['cluster','stock','news'].map(type=>`<div><b>${graph.nodes.filter(n=>n.type===type).length}</b><span>${type==='news'?'stories':type+'s'}</span></div>`).join('')}</div></header>
      <div class="cx-tools"><label>Find a connection<input type="search" placeholder="Cluster, ticker, company or headline…" aria-label="Search connections"></label><div><button type="button" data-action="out" aria-label="Zoom out">−</button><button type="button" data-action="in" aria-label="Zoom in">+</button><button type="button" data-action="reset">All connections</button></div></div>
      <div class="cx-explorer"><section class="cx-picker cx-cluster-picker"><div class="cx-picker-head"><h2>Clusters</h2><small>Choose a cluster to see its connections</small></div><div class="cx-clusters cx-picker-list" role="group" aria-label="Choose a cluster"></div></section>
      <div class="cx-workspace"><div class="cx-map"><div class="cx-map-caption">01 / THE NETWORK <span>Tap any node to follow its connections</span><button type="button" data-action="fullscreen" aria-label="Enter fullscreen network" aria-pressed="false">Fullscreen ⛶</button></div><div class="cx-scroll"><svg class="cx-svg" viewBox="0 0 1200 800" aria-label="Cluster, stock and news network"></svg></div><div class="cx-legend"><span>● Cluster</span><span>◆ Stock</span><span>○ News</span><span>┄ Default exposure</span></div></div><aside class="cx-inspector" aria-label="Selected connection details"><div class="cx-inspector-body"></div></aside></div>
      <section class="cx-picker cx-watch-picker"><div class="cx-picker-head"><h2 class="cx-watch-title">Watchlist</h2><input type="search" data-watchlist-search aria-label="Search watchlist stocks" placeholder="Search ticker or company…" autocomplete="off"></div><div class="cx-stock-list cx-picker-list" role="group" aria-label="Choose a watchlist stock"></div></section></div>`;
    const svg=host.querySelector('svg'), inspector=host.querySelector('.cx-inspector-body'), index=host.querySelector('.cx-clusters');
    const map=host.querySelector('.cx-explorer'),fullscreenButton=host.querySelector('[data-action="fullscreen"]');
    const isFullscreen=()=>document.fullscreenElement===map||map.classList.contains('cx-fullscreen');
    function syncFullscreen(){const active=isFullscreen();fullscreenButton.textContent=active?'Exit fullscreen ⛶':'Fullscreen ⛶';fullscreenButton.setAttribute('aria-label',active?'Exit fullscreen network':'Enter fullscreen network');fullscreenButton.setAttribute('aria-pressed',String(active));}
    async function toggleFullscreen(){
      if(document.fullscreenElement===map)await document.exitFullscreen();
      else if(map.classList.contains('cx-fullscreen'))map.classList.remove('cx-fullscreen');
      else{try{if(!map.requestFullscreen)throw Error('Unavailable');await map.requestFullscreen();}catch{map.classList.add('cx-fullscreen');}}
      syncFullscreen();fullscreenButton.focus({preventScroll:true});
    }
    map.onfullscreenchange=syncFullscreen;

    const byId=new Map(graph.nodes.map(n=>[n.id,n]));
    const period=document.createElement('label');period.className='cx-period';period.textContent='Time range';
    const days=document.createElement('select');days.setAttribute('aria-label','Network time range');days.innerHTML='<option value="1">Last 1 day</option><option value="2">Last 2 days</option><option value="3">Last 3 days</option>';days.value=String(options.days||1);days.onchange=()=>options.onDays?.(days.value);days.disabled=!options.onDays;period.append(days);host.querySelector('.cx-tools').append(period);
    const scope=document.createElement('p');scope.className='cx-scope';scope.setAttribute('role','status');scope.textContent=options.scope||'Selected report only';host.querySelector('.cx-explorer').before(scope);
    if(options.retry){const retry=document.createElement('button');retry.type='button';retry.textContent='Retry';retry.onclick=options.retry;scope.append(' ',retry);}
    const browse=document.createElement('select');browse.setAttribute('aria-label','Browse connection types');browse.innerHTML='<option value="">All nodes</option><option value="cluster">Clusters</option><option value="stock">Stocks</option><option value="news">News</option>';host.querySelector('.cx-tools').append(browse);
    browse.onchange=()=>{type=browse.value;selected=null;currentFocus=null;trail.length=0;paint();};
    const announce=document.createElement('p');announce.className='cx-announcement';announce.setAttribute('role','status');announce.setAttribute('aria-live','polite');host.querySelector('.cx-explorer').before(announce);
    const savedItems=root.ClustrWatchlist?.getItems?.();
    const watchItems=Array.isArray(savedItems)?savedItems.filter(stock=>String(stock.market||'US').toUpperCase()===String(publish?.market||'US').toUpperCase()):graph.nodes.filter(node=>node.type==='stock').map(node=>({symbol:node.label,name:node.name}));
    if(!Array.isArray(savedItems))host.querySelector('.cx-watch-title').textContent='Stocks';
    let stockQuery='';
    const stockSearch=host.querySelector('[data-watchlist-search]');
    const stockNode=item=>byId.get(`stock:${publish?.market||'US'}:${String(item.symbol).toUpperCase()}`);
    function paintStocks(){
      const stocks=watchItems.filter(item=>matchesNode({label:item.symbol,name:`${item.name||''} ${stockNode(item)?.name||''}`},stockQuery));
      host.querySelector('.cx-stock-list').innerHTML=stocks.length?stocks.map(item=>{
        const node=stockNode(item);
        return node?choice(node):`<button type="button" class="cx-node-choice" disabled title="No connections in this window">${escape(item.symbol)} <small>No links</small></button>`;
      }).join(''):watchItems.length?'<p class="cx-note">No matching stocks.</p>':'<p class="cx-note">Your watchlist is empty.</p><button type="button" class="cx-node-choice" data-action="watchlist">Manage watchlist →</button>';
    }
    stockSearch.oninput=event=>{stockQuery=event.target.value.trim().toLowerCase();paintStocks();};
    function selectNode(id, record=true){
      if(!byId.has(id))return;
      if(record&&selected&&selected!==id)trail.push(selected);
      selected=id;currentFocus=byId.get(id);query='';type='';browse.value='';host.querySelector('input').value='';paint();inspector.scrollTop=0;
      const heading=inspector.querySelector('h2');heading?.setAttribute('tabindex','-1');heading?.focus({preventScroll:true});
      if(window.matchMedia('(max-width:768px)').matches)heading?.scrollIntoView({block:'nearest'});
    }
    host.querySelector('.cx-legend span:nth-child(2)').textContent='● Stock';
    if (root.ClustrGraphCanvas) {
      svg.style.display='none';
      const canvasHost=document.createElement('div');canvasHost.className='cx-canvas';host.querySelector('.cx-scroll').append(canvasHost);
      currentScene=root.ClustrGraphCanvas.mount(canvasHost,graph,positions,selectNode);
    }
    function impact(node){return `<span class="cx-impact cx-impact--${tone(node.score)}">${scoreText(node.score)}</span>`;}
    function choice(node){return `<button type="button" class="cx-node-choice cx-node-choice--${node.type}" data-node="${escape(node.id)}" aria-pressed="${node.id===selected}" aria-label="${escape(node.label)}, impact ${scoreText(node.score)}" title="${escape(node.name||node.label)}"><strong>${escape(node.label)}</strong>${impact(node)}</button>`;}
    function button(node, description='') {
      const edge=selected&&graph.edges.find(e=>(e.from===selected&&e.to===node.id)||(e.to===selected&&e.from===node.id));
      if(edge&&description===edge.kind)description=edge.kinds.join(' · ');
      return `<button type="button" data-node="${escape(node.id)}"><span class="cx-item-head"><span>${escape(node.label)}</span>${impact(node)}</span>${description?`<small>${escape(description)}${node.type==='stock'?` · Saved price ${priceText(node.price)}`:''}</small>`:''}</button>`;
    }
    function metrics(node,links){
      const item=(label,value,kind='')=>`<div><small>${label}</small><strong class="${kind}">${value}</strong></div>`;
      if(node.type==='stock'){
        const date=node.quoteAt||publish?.created_at;
        const stamp=Number.isFinite(Date.parse(date))?new Date(date).toLocaleString('en',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'})+' ET':'Timestamp unavailable';
        return `<div class="cx-detail-metrics">${item('Linked-cluster impact',scoreText(node.score),'cx-impact--'+tone(node.score))}${item('Saved price',priceText(node.price))}${item('Change at publish',node.change==null?'Unavailable':`${node.change>=0?'+':''}${node.change.toFixed(2)}%`,'cx-impact--'+tone(node.change))}</div><p class="cx-note">Report snapshot · ${escape(publish?.market==='US'?'USD · ':'')}${escape(stamp)}. Not a live quote.</p>`;
      }
      return `<div class="cx-detail-metrics">${item(node.type==='news'?'Story impact':'Cluster impact',scoreText(node.score),'cx-impact--'+tone(node.score))}${node.type==='cluster'?item('Linked stocks',String(links.filter(edge=>byId.get(edge.from===node.id?edge.to:edge.from).type==='stock').length)):''}</div>`;
    }
    function paint() {
      currentScene?.update(selected,query,type);
      const active=new Set();
      if (selected) { active.add(selected); graph.edges.filter(e=>e.from===selected||e.to===selected).forEach(e=>{active.add(e.from);active.add(e.to);}); }
      const matches=n=>matchesNode(n,query,type),match=matches;
      svg.innerHTML = `<g class="cx-lines">${graph.edges.map(e=>{const a=positions.get(e.from),b=positions.get(e.to);return `<path class="${e.kind==='Default exposure'?'cx-default ':''}${selected&&!((e.from===selected)||(e.to===selected))?'cx-dim':''}" d="M${a.x},${a.y} Q600,400 ${b.x},${b.y}"/>`;}).join('')}</g><g>${graph.nodes.map(n=>{const p=positions.get(n.id),dim=(!matches(n)||(selected&&!active.has(n.id))), label=n.type==='cluster'||n.type==='stock'&&(selected?active.has(n.id):graph.nodes.filter(x=>x.type==='stock').length<45);return `<g class="cx-node cx-${n.type} ${dim?'cx-dim':''} ${n.id===selected?'cx-selected':''}" data-node="${escape(n.id)}" role="button" tabindex="0" aria-label="${escape(n.type+': '+n.label)}" aria-pressed="${n.id===selected}" transform="translate(${p.x} ${p.y})"><title>${escape(n.label)}</title>${n.type==='cluster'?`<circle r="${n.id===selected?18:12}"/>`:n.type==='stock'?'<path d="M0 -5 5 0 0 5 -5 0Z"/>':'<circle r="3"/>'}${label?`<text y="${n.type==='cluster'?27:17}" text-anchor="middle">${escape(n.label.length>27?n.label.slice(0,26)+'…':n.label)}</text>`:''}</g>`;}).join('')}</g><text x="600" y="395" text-anchor="middle" class="cx-center">Clustr Market</text><text x="600" y="419" text-anchor="middle" class="cx-center-sub">THE WORLD → YOUR WATCHLIST</text>`;
      index.innerHTML=graph.nodes.filter(n=>n.type==='cluster'&&matchesNode(n,query)).map(choice).join('')||'<p class="cx-note">No matching clusters.</p>';
      paintStocks();
      if (!selected) {
        const found=graph.nodes.filter(match);
        announce.textContent=`${found.length} matching nodes. ${graph.nodes.length?'Select a node to explore.':'No saved connections in this report.'}`;
        inspector.innerHTML=`<p class="cx-eyebrow">02 / EXPLORE</p><h2>Start anywhere.</h2><p>Pick a cluster, stock or story. Its direct connections will light up.</p><p class="cx-note">Lines show saved report relationships—not causation or a trade recommendation. Dashed lines are default sector exposure, not article evidence.</p>${!graph.nodes.length?'<p>No connections in this report.</p>':query?`<h3>${found.length} search results</h3>${found.map(n=>button(n,n.type)).join('')}`:'<h3>Choose a starting point</h3>'+graph.nodes.filter(n=>n.type==='cluster').slice(0,6).map(n=>button(n)).join('')}`;
        if(type&&!query){inspector.querySelector('h3')?.remove();inspector.querySelectorAll('button[data-node]').forEach(button=>button.remove());inspector.insertAdjacentHTML('beforeend',`<h3>${found.length} ${escape(type)} nodes</h3>${found.map(n=>button(n,n.type)).join('')}`);}
        return;
      }
      const node=byId.get(selected), links=graph.edges.filter(e=>e.from===selected||e.to===selected);
      announce.textContent=`Selected ${node.type}: ${node.label}. ${links.length} connected nodes.`;
      inspector.innerHTML=`<p class="cx-eyebrow">02 / ${escape(node.type.toUpperCase())}</p><h2>${escape(node.label)}</h2>${metrics(node,links)}${node.type==='cluster'?`<p>${escape(node.group.reason||'Choose a linked stock or story below to explore this cluster.')}</p>`:node.type==='stock'?`<p>${escape(node.name)}</p><p class="cx-note">Cluster links show saved relationships; every linked story does not necessarily mention this stock.</p>`:`<p>${escape(node.article.source||'Source')} · ${escape(node.article.date||'Date unavailable')}</p>${node.article.short_summary?`<p>${escape(node.article.short_summary)}</p>`:''}${node.url?`<a class="cx-source" href="${escape(node.url)}" target="_blank" rel="noopener noreferrer">Read original story ↗</a>`:''}`}<h3>${links.length} connected nodes</h3>${links.map(edge=>button(byId.get(edge.from===selected?edge.to:edge.from),edge.kind)).join('')}`;
      inspector.querySelector('h3').textContent=`${links.length} ${node.type==='cluster'?'connected stocks and stories':links.length===1?'connected cluster':'connected clusters'}`;
      if(trail.length)inspector.insertAdjacentHTML('afterbegin','<button type="button" data-action="back">← Back to previous node</button>');
    }
    host.onclick=event=>{const target=event.target.closest('[data-node],[data-action]');if(!target||!host.contains(target))return;
      if(target.dataset.action==='fullscreen'){toggleFullscreen();return;}
      if(target.dataset.action==='watchlist'){root.ClustrApp?.showView('watchlist');return;}
      if(target.dataset.node)selectNode(target.dataset.node);
      else if(target.dataset.action==='back'){const previous=trail.pop();if(previous)selectNode(previous,false);}
      else {if(target.dataset.action==='reset'){selected=null;currentFocus=null;trail.length=0;zoom=1;query='';type='';browse.value='';host.querySelector('input').value='';currentScene?.reset();paint();}else {const amount=target.dataset.action==='in'?.2:-.2;zoom=Math.max(.7,Math.min(2.5,zoom+amount));currentScene?.zoom(amount);}svg.style.width=`${zoom*100}%`;}
    };
    host.onkeydown=event=>{if(event.key==='Escape'&&isFullscreen()){event.preventDefault();event.stopPropagation();toggleFullscreen();return;}if(event.key==='Escape'&&event.target===stockSearch){event.preventDefault();stockQuery='';stockSearch.value='';paintStocks();return;}if(event.key==='Escape'){event.preventDefault();host.querySelector('[data-action="reset"]').click();host.querySelector('input').focus();}else if(event.target.matches('g[data-node]')&&['Enter',' '].includes(event.key)){event.preventDefault();selectNode(event.target.dataset.node);}};
    host.querySelector('input').oninput=event=>{query=event.target.value.trim().toLowerCase();selected=null;currentFocus=null;trail.length=0;paint();};
    const focusNode=options.focusLabel?graph.nodes.find(node=>node.type==='cluster'&&node.label===options.focusLabel):byId.get(options.focusId);
    if(focusNode)selectNode(focusNode.id,false);else paint();
  }
  function hide() { revision++;currentScene?.destroy();currentScene=null;document.getElementById('connectionsView')?.classList.add('hidden');const nav=document.getElementById('navConnections');nav?.classList.remove('is-active');nav?.setAttribute('aria-current','false'); }
  const api={buildGraph,layout,safeUrl,matches:matchesNode,windowRange,mergeReports,loadWindow,mount,render,hide};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.ClustrConnections=api;
  if(typeof document!=='undefined')document.getElementById('navConnections')?.addEventListener('click',()=>root.ClustrApp?.showView('connections'));
})(typeof window==='undefined'?globalThis:window);
