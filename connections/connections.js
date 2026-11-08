(function (root) {
  let currentScene = null;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function safeUrl(value) { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } }
  function buildGraph(groups, market) {
    const nodes = new Map(), edges = [], seen = new Set();
    function connect(from, to, kind) { const key = `${from}|${to}|${kind}`; if (!seen.has(key)) { seen.add(key); edges.push({from,to,kind}); } }
    (groups || []).forEach((group, i) => {
      if (market && group.market && group.market !== market) return;
      const id = `cluster:${i}`, label = group.name || group.group || 'Unnamed cluster';
      const value = group.stance_score ?? group.cluster_score;
      const score = value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
      nodes.set(id, {id, type:'cluster', label, score, group});
      const layers = [['mentioned_stocks','Mentioned'],['close_stocks','Close link'],['original_stocks','Second order'],['fixed_stocks','Default exposure'],['default_stocks','Default exposure'],['direct_stocks','Direct link'],['related_stocks','Related link'],['stocks','Stock link']];
      const stocks = new Map();
      for (const [field, layer] of layers) for (const stock of group[field] || []) {
        if (!stock?.symbol || stock.resolved === false) continue;
        const symbol = String(stock.symbol).trim().toUpperCase();
        if (!/^[A-Z0-9.^=-]{1,20}$/.test(symbol)) continue;
        if (!stocks.has(symbol)) stocks.set(symbol, {stock,layer});
      }
      for (const [symbol, {stock,layer}] of stocks) {
        const sid = `stock:${market || group.market || 'unknown'}:${symbol}`;
        if (!nodes.has(sid)) nodes.set(sid,{id:sid,type:'stock',label:symbol,name:stock.name || symbol});
        connect(id,sid,layer);
      }
      (group.articles || []).forEach((article, j) => {
        const url = safeUrl(article.link);
        const aid = url ? `news:${url}` : `news:${i}:${j}`;
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
  function render(groups, publish) {
    currentScene?.destroy();
    const host = document.getElementById('connectionsView');
    if (!host) return;
    host.classList.remove('hidden');
    const nav = document.getElementById('navConnections');
    nav?.classList.add('is-active'); nav?.setAttribute('aria-current','page');
    const graph = buildGraph(groups,publish?.market), positions = layout(graph.nodes);
    let selected = null, query = '', zoom = 1;
    host.innerHTML = `<header class="cx-hero"><div><p class="cx-eyebrow">CLUSTR / CONNECTIONS · ${escape(publish?.market || 'REPORT')}</p><h1>Everything is<br><em>connected.</em></h1><p>Follow the thread. From an event to a company,<br>and back to the stories behind it.</p></div><div class="cx-counts">${['cluster','stock','news'].map(type=>`<div><b>${graph.nodes.filter(n=>n.type===type).length}</b><span>${type==='news'?'stories':type+'s'}</span></div>`).join('')}</div></header>
      <div class="cx-tools"><label>Find a connection<input type="search" placeholder="Cluster, ticker, company or headline…" aria-label="Search connections"></label><div><button type="button" data-action="out" aria-label="Zoom out">−</button><button type="button" data-action="in" aria-label="Zoom in">+</button><button type="button" data-action="reset">All connections</button></div></div>
      <div class="cx-workspace"><div class="cx-map"><div class="cx-map-caption">01 / THE NETWORK <span>Tap any node to follow its connections</span></div><div class="cx-scroll"><svg class="cx-svg" viewBox="0 0 1200 800" aria-label="Cluster, stock and news network"></svg></div><div class="cx-legend"><span>● Cluster</span><span>◆ Stock</span><span>○ News</span><span>┄ Default exposure</span></div></div><aside class="cx-inspector" aria-label="Selected connection details"></aside></div>
      <section class="cx-index"><h2>Every cluster. One connected market.</h2><div class="cx-clusters"></div></section>`;
    const svg=host.querySelector('svg'), inspector=host.querySelector('.cx-inspector'), index=host.querySelector('.cx-clusters');
    const byId=new Map(graph.nodes.map(n=>[n.id,n]));
    host.querySelector('.cx-legend span:nth-child(2)').textContent='● Stock';
    if (root.ClustrGraphCanvas) {
      svg.style.display='none';
      const canvasHost=document.createElement('div');canvasHost.className='cx-canvas';host.querySelector('.cx-scroll').append(canvasHost);
      currentScene=root.ClustrGraphCanvas.mount(canvasHost,graph,positions,id=>{selected=id;query='';host.querySelector('input').value='';paint();});
    }
    function button(node, description='') { return `<button type="button" data-node="${escape(node.id)}"><span>${escape(node.label)}</span>${description?`<small>${escape(description)}</small>`:''}</button>`; }
    function paint() {
      currentScene?.update(selected,query);
      const active=new Set();
      if (selected) { active.add(selected); graph.edges.filter(e=>e.from===selected||e.to===selected).forEach(e=>{active.add(e.from);active.add(e.to);}); }
      const matches=n=>!query||`${n.label} ${n.name||''}`.toLowerCase().includes(query);
      svg.innerHTML = `<g class="cx-lines">${graph.edges.map(e=>{const a=positions.get(e.from),b=positions.get(e.to);return `<path class="${e.kind==='Default exposure'?'cx-default ':''}${selected&&!((e.from===selected)||(e.to===selected))?'cx-dim':''}" d="M${a.x},${a.y} Q600,400 ${b.x},${b.y}"/>`;}).join('')}</g><g>${graph.nodes.map(n=>{const p=positions.get(n.id),dim=(!matches(n)||(selected&&!active.has(n.id))), label=n.type==='cluster'||n.type==='stock'&&(selected?active.has(n.id):graph.nodes.filter(x=>x.type==='stock').length<45);return `<g class="cx-node cx-${n.type} ${dim?'cx-dim':''} ${n.id===selected?'cx-selected':''}" data-node="${escape(n.id)}" role="button" tabindex="0" aria-label="${escape(n.type+': '+n.label)}" aria-pressed="${n.id===selected}" transform="translate(${p.x} ${p.y})"><title>${escape(n.label)}</title>${n.type==='cluster'?`<circle r="${n.id===selected?18:12}"/>`:n.type==='stock'?'<path d="M0 -5 5 0 0 5 -5 0Z"/>':'<circle r="3"/>'}${label?`<text y="${n.type==='cluster'?27:17}" text-anchor="middle">${escape(n.label.length>27?n.label.slice(0,26)+'…':n.label)}</text>`:''}</g>`;}).join('')}</g><text x="600" y="395" text-anchor="middle" class="cx-center">clustr</text><text x="600" y="419" text-anchor="middle" class="cx-center-sub">THE WORLD → YOUR WATCHLIST</text>`;
      index.innerHTML=graph.nodes.filter(n=>n.type==='cluster'&&matches(n)).map(n=>button(n,`${n.score==null?'Unscored':(n.score>0?'+':'')+n.score} · ${graph.edges.filter(e=>e.from===n.id&&byId.get(e.to).type==='news').length} stories`)).join('')||'<p>No matching clusters.</p>';
      if (!selected) {
        const found=graph.nodes.filter(matches);
        inspector.innerHTML=`<p class="cx-eyebrow">02 / EXPLORE</p><h2>Start anywhere.</h2><p>Pick a cluster, stock or story. Its direct connections will light up.</p><p class="cx-note">Lines show saved report relationships—not causation or a trade recommendation. Dashed lines are default sector exposure, not article evidence.</p>${!graph.nodes.length?'<p>No connections in this report.</p>':query?`<h3>${found.length} search results</h3>${found.map(n=>button(n,n.type)).join('')}`:'<h3>Choose a starting point</h3>'+graph.nodes.filter(n=>n.type==='cluster').slice(0,6).map(n=>button(n)).join('')}`;
        return;
      }
      const node=byId.get(selected), links=graph.edges.filter(e=>e.from===selected||e.to===selected);
      inspector.innerHTML=`<p class="cx-eyebrow">02 / ${escape(node.type.toUpperCase())}</p><h2>${escape(node.label)}</h2>${node.type==='cluster'?`<div class="cx-score">${node.score==null?'—':(node.score>0?'+':'')+node.score}<small>CLUSTER SCORE / −10 TO +10</small></div><p>${escape(node.group.reason||'No saved explanation for this cluster.')}</p>`:node.type==='stock'?`<p>${escape(node.name)}</p><p class="cx-note">These are saved cluster relationships. A link does not imply every story mentions this stock.</p>`:`<p>${escape(node.article.source||'Source')} · ${escape(node.article.date||'Date unavailable')}</p><p>${escape(node.article.short_summary||'No saved summary. Read the source for details.')}</p>${node.url?`<a class="cx-source" href="${escape(node.url)}" target="_blank" rel="noopener noreferrer">Read original story ↗</a>`:''}`}<h3>${links.length} direct connections</h3>${links.map(e=>button(byId.get(e.from===selected?e.to:e.from),e.kind)).join('')}`;
    }
    host.onclick=event=>{const target=event.target.closest('[data-node],[data-action]');if(!target||!host.contains(target))return;
      if(target.dataset.node){selected=target.dataset.node;query='';host.querySelector('input').value='';paint();host.querySelector('.cx-inspector h2')?.scrollIntoView({block:'nearest',behavior:'auto'});}
      else {if(target.dataset.action==='reset'){selected=null;zoom=1;query='';host.querySelector('input').value='';currentScene?.reset();paint();}else {const amount=target.dataset.action==='in'?.2:-.2;zoom=Math.max(.7,Math.min(2.5,zoom+amount));currentScene?.zoom(amount);}svg.style.width=`${zoom*100}%`;}
    };
    host.onkeydown=event=>{if(event.target.matches('g[data-node]')&&['Enter',' '].includes(event.key)){event.preventDefault();selected=event.target.dataset.node;paint();host.querySelector('.cx-inspector').setAttribute('tabindex','-1');host.querySelector('.cx-inspector').focus();}};
    host.querySelector('input').oninput=event=>{query=event.target.value.trim().toLowerCase();selected=null;paint();};
    paint();
  }
  function hide() { currentScene?.destroy();currentScene=null;document.getElementById('connectionsView')?.classList.add('hidden');const nav=document.getElementById('navConnections');nav?.classList.remove('is-active');nav?.setAttribute('aria-current','false'); }
  const api={buildGraph,layout,safeUrl,render,hide};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.ClustrConnections=api;
  if(typeof document!=='undefined')document.getElementById('navConnections')?.addEventListener('click',()=>root.ClustrApp?.showView('connections'));
})(typeof window==='undefined'?globalThis:window);
