(function (root) {
  let currentScene = null;
  let periodDays=1, revision=0;
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
            if(!seen.has(id)){seen.add(id);item[field].push(value);}
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
  async function mount(groups,publish,focus=false) {
    const request=++revision,days=periodDays;
    const change=value=>{periodDays=Number(value);mount(groups,publish,true);};
    const options={days,onDays:change,scope:'Loading saved reports…'};
    render(groups,publish,options);
    if(focus)document.getElementById('connectionsView')?.querySelector('[aria-label="Network time range"]')?.focus();
    try {
      const result=await loadWindow(publish,days,root.ClustrApi);
      if(request!==revision)return;
      const date=new Date(result.end).toLocaleString('en-GB',{timeZone:'Europe/Oslo',dateStyle:'medium',timeStyle:'short'});
      render(result.groups,publish,{...options,scope:`Last ${days} ${days===1?'day':'days'} (${days*24} hours) ending ${date} Oslo · ${result.reports} reports · Latest cluster scores; links and stories combined across the window.`});
    } catch(error) {
      if(request!==revision)return;
      render(groups,publish,{...options,scope:`Could not load the ${days}-day window. Showing the selected report only. ${error.message}`,retry:()=>mount(groups,publish,true)});
    }
    if(focus)document.getElementById('connectionsView')?.querySelector('[aria-label="Network time range"]')?.focus();
  }
  function buildGraph(groups, market) {
    const nodes = new Map(), edges = [], seen = new Set();
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
        const symbol = String(stock.symbol).trim().toUpperCase();
        if (!/^[A-Z0-9.^=-]{1,20}$/.test(symbol)) continue;
        if (!stocks.has(symbol)) stocks.set(symbol, {stock,kinds:new Set([layer])});
        else if(!['direct_stocks','related_stocks','stocks'].includes(field))stocks.get(symbol).kinds.add(layer);
      }
      for (const [symbol, {stock,kinds}] of stocks) {
        const sid = `stock:${market || group.market || 'unknown'}:${symbol}`;
        if (!nodes.has(sid)) nodes.set(sid,{id:sid,type:'stock',label:symbol,name:stock.name || symbol});
        // Default exposure must never hide a legacy direct relationship.
        if(kinds.has('Default exposure')&&(Array.isArray(group.direct_stocks)?group.direct_stocks:[]).some(s=>s?.resolved!==false&&String(s?.symbol).trim().toUpperCase()===symbol))kinds.add('Direct link');
        const labels=[...kinds],kind=labels.find(x=>x!=='Default exposure')||'Default exposure';
        connect(id,sid,kind,labels);
      }
      (Array.isArray(group.articles)?group.articles:[]).forEach((article, j) => {
        if(!article||typeof article!=='object')return;
        const url = safeUrl(article.link);
        const aid = url ? `news:${storyKey(url)}` : `news:${i}:${j}`;
        if (!nodes.has(aid)) nodes.set(aid,{id:aid,type:'news',label:article.title || 'Source story',url,article});
        connect(id,aid,'Source story');
      });
    });
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
    currentScene?.destroy();
    currentScene=null;
    const host = document.getElementById('connectionsView');
    if (!host) return;
    host.classList.remove('hidden');
    const nav = document.getElementById('navConnections');
    nav?.classList.add('is-active'); nav?.setAttribute('aria-current','page');
    const graph = buildGraph(groups,publish?.market), positions = layout(graph.nodes);
    let selected = null, query = '', type='', zoom = 1;
    const trail=[];
    host.innerHTML = `<header class="cx-hero"><div><p class="cx-eyebrow">CLUSTR / CONNECTIONS · ${escape(publish?.market || 'REPORT')}</p><h1>Everything is <em>connected.</em></h1><p>Explore the links between events, companies and source stories.</p></div><div class="cx-counts">${['cluster','stock','news'].map(type=>`<div><b>${graph.nodes.filter(n=>n.type===type).length}</b><span>${type==='news'?'stories':type+'s'}</span></div>`).join('')}</div></header>
      <div class="cx-tools"><label>Find a connection<input type="search" placeholder="Cluster, ticker, company or headline…" aria-label="Search connections"></label><div><button type="button" data-action="out" aria-label="Zoom out">−</button><button type="button" data-action="in" aria-label="Zoom in">+</button><button type="button" data-action="reset">All connections</button></div></div>
      <div class="cx-workspace"><div class="cx-map"><div class="cx-map-caption">01 / THE NETWORK <span>Tap any node to follow its connections</span></div><div class="cx-scroll"><svg class="cx-svg" viewBox="0 0 1200 800" aria-label="Cluster, stock and news network"></svg></div><div class="cx-legend"><span>● Cluster</span><span>◆ Stock</span><span>○ News</span><span>┄ Default exposure</span></div></div><aside class="cx-inspector" aria-label="Selected connection details"></aside></div>
      <section class="cx-index"><h2>Every cluster. One connected market.</h2><div class="cx-clusters"></div></section>`;
    const svg=host.querySelector('svg'), inspector=host.querySelector('.cx-inspector'), index=host.querySelector('.cx-clusters');
    const byId=new Map(graph.nodes.map(n=>[n.id,n]));
    const period=document.createElement('label');period.className='cx-period';period.textContent='Time range';
    const days=document.createElement('select');days.setAttribute('aria-label','Network time range');days.innerHTML='<option value="1">Last 1 day</option><option value="2">Last 2 days</option><option value="3">Last 3 days</option>';days.value=String(options.days||1);days.onchange=()=>options.onDays?.(days.value);days.disabled=!options.onDays;period.append(days);host.querySelector('.cx-tools').append(period);
    const scope=document.createElement('p');scope.className='cx-scope';scope.setAttribute('role','status');scope.textContent=options.scope||'Selected report only';host.querySelector('.cx-workspace').before(scope);
    if(options.retry){const retry=document.createElement('button');retry.type='button';retry.textContent='Retry';retry.onclick=options.retry;scope.append(' ',retry);}
    const browse=document.createElement('select');browse.setAttribute('aria-label','Browse connection types');browse.innerHTML='<option value="">All nodes</option><option value="cluster">Clusters</option><option value="stock">Stocks</option><option value="news">News</option>';host.querySelector('.cx-tools').append(browse);
    browse.onchange=()=>{type=browse.value;selected=null;trail.length=0;paint();};
    const announce=document.createElement('p');announce.className='cx-announcement';announce.setAttribute('role','status');announce.setAttribute('aria-live','polite');host.querySelector('.cx-workspace').before(announce);
    function selectNode(id, record=true){
      if(!byId.has(id))return;
      if(record&&selected&&selected!==id)trail.push(selected);
      selected=id;query='';type='';browse.value='';host.querySelector('input').value='';paint();
      const heading=inspector.querySelector('h2');heading?.setAttribute('tabindex','-1');heading?.focus({preventScroll:true});
      if(window.matchMedia('(max-width:768px)').matches)heading?.scrollIntoView({block:'nearest'});
    }
    host.querySelector('.cx-legend span:nth-child(2)').textContent='● Stock';
    if (root.ClustrGraphCanvas) {
      svg.style.display='none';
      const canvasHost=document.createElement('div');canvasHost.className='cx-canvas';host.querySelector('.cx-scroll').append(canvasHost);
      currentScene=root.ClustrGraphCanvas.mount(canvasHost,graph,positions,selectNode);
    }
    function button(node, description='') { const edge=selected&&graph.edges.find(e=>(e.from===selected&&e.to===node.id)||(e.to===selected&&e.from===node.id));if(edge&&description===edge.kind)description=edge.kinds.join(' · ');return `<button type="button" data-node="${escape(node.id)}"><span>${escape(node.label)}</span>${description?`<small>${escape(description)}</small>`:''}</button>`; }
    function paint() {
      currentScene?.update(selected,query,type);
      const active=new Set();
      if (selected) { active.add(selected); graph.edges.filter(e=>e.from===selected||e.to===selected).forEach(e=>{active.add(e.from);active.add(e.to);}); }
      const matches=n=>matchesNode(n,query,type),match=matches;
      svg.innerHTML = `<g class="cx-lines">${graph.edges.map(e=>{const a=positions.get(e.from),b=positions.get(e.to);return `<path class="${e.kind==='Default exposure'?'cx-default ':''}${selected&&!((e.from===selected)||(e.to===selected))?'cx-dim':''}" d="M${a.x},${a.y} Q600,400 ${b.x},${b.y}"/>`;}).join('')}</g><g>${graph.nodes.map(n=>{const p=positions.get(n.id),dim=(!matches(n)||(selected&&!active.has(n.id))), label=n.type==='cluster'||n.type==='stock'&&(selected?active.has(n.id):graph.nodes.filter(x=>x.type==='stock').length<45);return `<g class="cx-node cx-${n.type} ${dim?'cx-dim':''} ${n.id===selected?'cx-selected':''}" data-node="${escape(n.id)}" role="button" tabindex="0" aria-label="${escape(n.type+': '+n.label)}" aria-pressed="${n.id===selected}" transform="translate(${p.x} ${p.y})"><title>${escape(n.label)}</title>${n.type==='cluster'?`<circle r="${n.id===selected?18:12}"/>`:n.type==='stock'?'<path d="M0 -5 5 0 0 5 -5 0Z"/>':'<circle r="3"/>'}${label?`<text y="${n.type==='cluster'?27:17}" text-anchor="middle">${escape(n.label.length>27?n.label.slice(0,26)+'…':n.label)}</text>`:''}</g>`;}).join('')}</g><text x="600" y="395" text-anchor="middle" class="cx-center">clustr</text><text x="600" y="419" text-anchor="middle" class="cx-center-sub">THE WORLD → YOUR WATCHLIST</text>`;
      index.innerHTML=graph.nodes.filter(n=>n.type==='cluster'&&matchesNode(n,query)).map(n=>button(n,`${n.score==null?'Unscored':(n.score>0?'+':'')+n.score} · ${graph.edges.filter(e=>e.from===n.id&&byId.get(e.to).type==='news').length} stories`)).join('')||'<p>No matching clusters.</p>';
      if (!selected) {
        const found=graph.nodes.filter(match);
        announce.textContent=`${found.length} matching nodes. ${graph.nodes.length?'Select a node to explore.':'No saved connections in this report.'}`;
        inspector.innerHTML=`<p class="cx-eyebrow">02 / EXPLORE</p><h2>Start anywhere.</h2><p>Pick a cluster, stock or story. Its direct connections will light up.</p><p class="cx-note">Lines show saved report relationships—not causation or a trade recommendation. Dashed lines are default sector exposure, not article evidence.</p>${!graph.nodes.length?'<p>No connections in this report.</p>':query?`<h3>${found.length} search results</h3>${found.map(n=>button(n,n.type)).join('')}`:'<h3>Choose a starting point</h3>'+graph.nodes.filter(n=>n.type==='cluster').slice(0,6).map(n=>button(n)).join('')}`;
        if(type&&!query){inspector.querySelector('h3')?.remove();inspector.querySelectorAll('button[data-node]').forEach(button=>button.remove());inspector.insertAdjacentHTML('beforeend',`<h3>${found.length} ${escape(type)} nodes</h3>${found.map(n=>button(n,n.type)).join('')}`);}
        return;
      }
      const node=byId.get(selected), links=graph.edges.filter(e=>e.from===selected||e.to===selected);
      announce.textContent=`Selected ${node.type}: ${node.label}. ${links.length} connected nodes.`;
      inspector.innerHTML=`<p class="cx-eyebrow">02 / ${escape(node.type.toUpperCase())}</p><h2>${escape(node.label)}</h2>${node.type==='cluster'?`<div class="cx-score">${node.score==null?'—':(node.score>0?'+':'')+node.score}<small>CLUSTER SCORE / −10 TO +10</small></div><p>${escape(node.group.reason||'No saved explanation for this cluster.')}</p>`:node.type==='stock'?`<p>${escape(node.name)}</p><p class="cx-note">These are saved cluster relationships. A link does not imply every story mentions this stock.</p>`:`<p>${escape(node.article.source||'Source')} · ${escape(node.article.date||'Date unavailable')}</p><p>${escape(node.article.short_summary||'No saved summary. Read the source for details.')}</p>${node.url?`<a class="cx-source" href="${escape(node.url)}" target="_blank" rel="noopener noreferrer">Read original story ↗</a>`:''}`}<h3>${links.length} direct connections</h3>${links.map(e=>button(byId.get(e.from===selected?e.to:e.from),e.kind)).join('')}`;
      inspector.querySelector('h3').textContent=`${links.length} connected nodes`;
      if(trail.length)inspector.insertAdjacentHTML('afterbegin','<button type="button" data-action="back">← Back to previous node</button>');
    }
    host.onclick=event=>{const target=event.target.closest('[data-node],[data-action]');if(!target||!host.contains(target))return;
      if(target.dataset.node)selectNode(target.dataset.node);
      else if(target.dataset.action==='back'){const previous=trail.pop();if(previous)selectNode(previous,false);}
      else {if(target.dataset.action==='reset'){selected=null;trail.length=0;zoom=1;query='';type='';browse.value='';host.querySelector('input').value='';currentScene?.reset();paint();}else {const amount=target.dataset.action==='in'?.2:-.2;zoom=Math.max(.7,Math.min(2.5,zoom+amount));currentScene?.zoom(amount);}svg.style.width=`${zoom*100}%`;}
    };
    host.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();host.querySelector('[data-action="reset"]').click();host.querySelector('input').focus();}else if(event.target.matches('g[data-node]')&&['Enter',' '].includes(event.key)){event.preventDefault();selectNode(event.target.dataset.node);}};
    host.querySelector('input').oninput=event=>{query=event.target.value.trim().toLowerCase();selected=null;trail.length=0;paint();};
    paint();
  }
  function hide() { revision++;currentScene?.destroy();currentScene=null;document.getElementById('connectionsView')?.classList.add('hidden');const nav=document.getElementById('navConnections');nav?.classList.remove('is-active');nav?.setAttribute('aria-current','false'); }
  const api={buildGraph,layout,safeUrl,matches:matchesNode,windowRange,mergeReports,loadWindow,mount,render,hide};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.ClustrConnections=api;
  if(typeof document!=='undefined')document.getElementById('navConnections')?.addEventListener('click',()=>root.ClustrApp?.showView('connections'));
})(typeof window==='undefined'?globalThis:window);
