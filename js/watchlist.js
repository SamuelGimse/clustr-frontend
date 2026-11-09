(function (root, factory) {
  const watchlist = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = watchlist;
  else root.ClustrWatchlist = watchlist;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  const FIELDS = ['mentioned_stocks', 'close_stocks', 'direct_stocks', 'original_stocks', 'related_stocks', 'fixed_stocks', 'default_stocks', 'default_symbols', 'stocks', 'connected_winners', 'connected_losers', 'movers'];
  const LINK_TYPES={mentioned:['mentioned_stocks'],close:['close_stocks','direct_stocks'],related:['original_stocks','related_stocks','stocks'],defaults:['fixed_stocks','default_stocks','default_symbols'],movers:['connected_winners','connected_losers','movers']};
  const FIELD_TYPE=Object.fromEntries(Object.entries(LINK_TYPES).flatMap(([type,fields])=>fields.map(field=>[field,type])));
  let linkTypes=new Set(Object.keys(LINK_TYPES));
  let user = null, entries = new Map(), clusters = new Map(), scope = 'all', ready = false, loading = false, message = '', version = 0, epoch = 0, reads = 0, view = 'events';
  let pending = new Set(), manager = null, search = '', clusterSearch = '', limit = 12;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function stockRecord(raw, market = 'US') {
    const stock = typeof raw === 'string' ? { symbol: raw } : raw;
    const symbol = String(stock?.symbol || '').trim().toUpperCase();
    const exchange = String(stock?.market || market || 'US').toUpperCase();
    if (stock?.resolved === false || exchange !== 'US' || !/^[A-Z0-9^][A-Z0-9.^:=/\-]{0,31}$/.test(symbol)) return null;
    return { market: exchange, symbol, name: String(stock?.name || stock?.company || symbol).slice(0, 200), key: `${exchange}:${symbol}` };
  }

  function clusterRecord(raw, market = 'US') {
    const item = typeof raw === 'string' ? { name: raw } : raw;
    const supplied = String(item?.name || item?.cluster_name || '').replace(/\s+/g, ' ').trim();
    const name = root.ClustrTaxonomy?.canonicalName(supplied) || supplied;
    const exchange = String(item?.market || market || 'US').toUpperCase();
    const cluster_key = name.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
    if (exchange !== 'US' || !cluster_key || cluster_key.length > 180 || name.length > 200 || item?.cluster_key && item.cluster_key !== cluster_key) return null;
    return {market:exchange,cluster_key,name,key:`${exchange}:${cluster_key}`};
  }

  function includesCluster(raw, market = 'US') {
    const cluster = clusterRecord(raw, market);
    return !!cluster && clusters.has(cluster.key);
  }

  function groupLinks(group, market = 'US') {
    const all = new Map(), fallback = group.market || market;
    function add(raw,type,alias=''){
      const stock = stockRecord(raw, fallback);
      if(!stock)return;
      const previous=all.get(stock.key);
      // Aggregate/legacy aliases must not reclassify a disabled evidence layer.
      if(alias&&previous&&(alias==='stocks'||[...previous.types].some(kind=>['mentioned','close','related'].includes(kind))))return;
      if(!previous)all.set(stock.key,{stock,types:new Set([type])});
      else previous.types.add(type);
    }
    const aliases=['direct_stocks','related_stocks','stocks'];
    for (const field of FIELDS.filter(field=>!aliases.includes(field))) for (const raw of Array.isArray(group[field]) ? group[field] : []) add(raw,FIELD_TYPE[field]);
    for (const article of group.articles || []) for (const raw of article.mentioned_companies || []) {
      add(raw,'mentioned');
    }
    for(const field of aliases)for(const raw of Array.isArray(group[field])?group[field]:[])add(raw,FIELD_TYPE[field],field);
    return all;
  }
  function groupStocks(group,market='US'){
    return [...groupLinks(group,market).values()].map(link=>link.stock);
  }

  function scopeGroups(groups, market, keys, types=new Set(Object.keys(LINK_TYPES)), clusterKeys=new Set()) {
    const result=[];
    for(const group of groups||[]){
      const cluster=clusterRecord(group,market);
      if(cluster && clusterKeys.has(cluster.key)){result.push(group);continue;}
      const links=groupLinks(group,market),fallback=group.market||market;
      const keep=(raw,type)=>{const stock=stockRecord(raw,fallback),link=stock&&links.get(stock.key);return stock&&keys.has(stock.key)&&link&&[...link.types].some(kind=>types.has(kind)&&(!type||type===kind));};
      if(![...links.values()].some(link=>keys.has(link.stock.key)&&[...link.types].some(type=>types.has(type))))continue;
      const item={...group};
      for(const field of FIELDS)if(Array.isArray(group[field]))item[field]=group[field].filter(raw=>keep(raw,FIELD_TYPE[field]));
      // Keep all ratings and story context; only hide disabled stock relationships.
      if(Array.isArray(group.articles))item.articles=group.articles.map(article=>Array.isArray(article.mentioned_companies)?{...article,mentioned_companies:article.mentioned_companies.filter(raw=>keep(raw,'mentioned'))}:article);
      result.push(item);
    }
    return result;
  }

  const isFiltered = () => scope === 'watchlist';
  const linkedGroups=(groups,market='US')=>scopeGroups(groups,market,new Set(entries.keys()),linkTypes,new Set(clusters.keys()));
  const filterGroups = (groups, market = 'US') => isFiltered() ? linkedGroups(groups,market) : groups;
  function filterGroupMap(groups, publishes) {
    if (!isFiltered()) return groups;
    const markets = new Map(publishes.map(publish => [String(publish.id), publish.market || 'US']));
    return new Map([...groups].map(([id, rows]) => [id, filterGroups(rows, markets.get(String(id)))]));
  }
  function includes(raw, market = 'US') { const stock = stockRecord(raw, market); return !!stock && entries.has(stock.key); }
  function allows(raw, market = 'US') {
    if (!isFiltered() || includes(raw, market)) return true;
    const stock=stockRecord(raw,market);
    if (!stock) return false;
    const groups=raw?.links?.values ? [...raw.links.values()].map(link=>link.group) : root.ClustrApp?.getAllGroups?.() || root.ClustrApp?.getGroups?.() || [];
    return groups.some(group=>group && includesCluster(group,market) && groupStocks(group,market).some(item=>item.key===stock.key));
  }

  async function request(method, stock, offset = 0, kind = 'stock') {
    const token = root.ClustrAuth?.accessToken();
    if (!user || !token) throw new Error('Sign in to use your watchlist.');
    const cfg = root.ClustrConfig || {};
    const field=kind==='cluster'?'cluster_key':'symbol';
    let path = '/rest/v1/' + (kind==='cluster'?'clustr_cluster_watchlist':'clustr_watchlist');
    if (method === 'GET') path += `?select=market,${field},name&order=created_at.asc,market.asc,${field}.asc&limit=250&offset=${offset}`;
    if (method === 'DELETE') path += `?market=eq.${encodeURIComponent(stock.market)}&${field}=eq.${encodeURIComponent(stock[field])}`;
    const response = await root.fetch(String(cfg.SUPABASE_URL || '').replace(/\/$/, '') + path, {
      method,
      headers: { apikey: cfg.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(method === 'POST' ? { Prefer: 'resolution=ignore-duplicates,return=minimal' } : {}) },
      ...(method === 'POST' ? { body: JSON.stringify({ market: stock.market, [field]: stock[field], name: stock.name }) } : {})
    });
    if (!response.ok) throw new Error(response.status === 401 ? 'Sign in again to update your watchlist.' : 'Could not update your watchlist. Please retry.');
    return response.status === 204 || method !== 'GET' ? null : response.json();
  }

  function notify(scopeChanged = false, savedChanged = false) {
    paintControls(); paintManager();
    if (root.dispatchEvent && root.CustomEvent) root.dispatchEvent(new root.CustomEvent('clustr:watchlist-change', { detail: { scopeChanged, savedChanged, version } }));
  }

  async function refresh() {
    if (!user) return;
    const current = epoch, read = ++reads;
    loading = true; message = ''; paintControls(); paintManager();
    try {
      const saved={stock:[],cluster:[]};
      for (const kind of ['stock','cluster']) {
        for (let offset = 0; ; offset += 250) {
          const page = await request('GET', null, offset, kind);
          if (current !== epoch || read !== reads) return;
          saved[kind].push(...page);
          if (page.length < 250) break;
        }
      }
      if (current !== epoch || read !== reads) return;
      entries = new Map(saved.stock.map(row => stockRecord(row, row.market)).filter(Boolean).map(stock => [stock.key, stock]));
      clusters = new Map(saved.cluster.map(row => clusterRecord(row, row.market)).filter(Boolean).map(cluster => [cluster.key, cluster]));
      ready = true; version++;
      notify(false, true);
    } catch (error) {
      if (current !== epoch || read !== reads) return;
      message = ready ? 'Could not refresh. Showing your last saved watchlist. Retry when connected.' : 'Could not load your watchlist. Retry when connected.';
      notify();
    } finally { if (current === epoch && read === reads) { loading = false; paintControls(); paintManager(); } }
  }

  async function init(account) {
    epoch++; reads++; user = account || null; entries = new Map(); clusters = new Map(); pending = new Set(); ready = false; loading = false; message = ''; scope = 'all'; manager = null; version++;
    if (user) { try { if (root.localStorage.getItem(`clustr-watchlist-scope:${user.id}`) === 'watchlist') scope = 'watchlist'; } catch {} }
    linkTypes=new Set(Object.keys(LINK_TYPES));
    if(user)try{const saved=JSON.parse(root.localStorage.getItem(`clustr-watchlist-links:${user.id}`));if(Array.isArray(saved))linkTypes=new Set(saved.filter(type=>Object.hasOwn(LINK_TYPES,type)));}catch{}
    paintControls();
    if (user) await refresh();
  }

  function setScope(value) {
    if (!['all', 'watchlist'].includes(value) || value === scope || !user) return;
    if (value === 'watchlist' && !ready) return;
    scope = value; version++;
    try { if (!root.ClustrApp?.isAccountPreview?.()) root.localStorage.setItem(`clustr-watchlist-scope:${user.id}`, scope); } catch {}
    notify(true);
  }
  function setLinkType(type,enabled){
    if(!user||!Object.hasOwn(LINK_TYPES,type)||linkTypes.has(type)===enabled)return;
    if(enabled)linkTypes.add(type);else linkTypes.delete(type);
    version++;
    try{if(!root.ClustrApp?.isAccountPreview?.())root.localStorage.setItem(`clustr-watchlist-links:${user.id}`,JSON.stringify([...linkTypes]));}catch{}
    notify(true);
  }

  async function setSaved(raw, market, desired, kind = 'stock') {
    if (root.ClustrApp?.isAccountPreview?.()) throw new Error('Watchlist edits are disabled in account preview.');
    const stock = kind==='cluster'?clusterRecord(raw,market):stockRecord(raw, market);
    const collection = kind==='cluster'?clusters:entries;
    if (!stock) throw new Error(kind==='cluster'?'Choose a valid cluster and market.':'Enter a valid ticker and market.');
    if (!user || !ready) throw new Error('Load your signed-in watchlist before making changes.');
    if (pending.has(stock.key) || collection.has(stock.key) === desired) return;
    const current = epoch;
    reads++; loading = false;
    pending.add(stock.key); message = ''; paintControls(); paintManager();
    try {
      await request(desired ? 'POST' : 'DELETE', stock, 0, kind);
      if (current !== epoch) return;
      reads++; loading=false;
      const target=kind==='cluster'?clusters:entries;
      if (desired) target.set(stock.key, stock); else target.delete(stock.key);
      version++; notify(false, true);
    } catch (error) {
      if (current === epoch) { message = error.message; notify(); }
      throw error;
    } finally { if (current === epoch) { pending.delete(stock.key); paintControls(); paintManager(); } }
  }

  const setClusterSaved=(raw,market,desired)=>setSaved(raw,market,desired,'cluster');

  function button(raw, market = 'US', kind = 'stock') {
    const stock = kind==='cluster'?clusterRecord(raw,market):stockRecord(raw, market);
    if (!user || !stock) return '';
    const saved = (kind==='cluster'?clusters:entries).has(stock.key), busy = pending.has(stock.key);
    const label = `${saved ? 'Remove' : 'Add'} ${kind==='cluster'?stock.name+' cluster':stock.symbol} ${saved ? 'from' : 'to'} watchlist`;
    if (kind==='cluster') return `<button type="button" class="watch-star${saved?' is-saved':''}" data-watch-cluster-toggle data-watch-market="${stock.market}" data-watch-cluster="${esc(stock.name)}" aria-label="${esc(label)}" title="${esc(label)}" aria-pressed="${saved}"${busy||!ready||root.ClustrApp?.isAccountPreview?.()?' disabled':''}${busy?' aria-busy="true"':''}><svg viewBox="0 0 24 24" width="18" height="18" fill="${saved?'currentColor':'none'}" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m6 6 12 3-6 9Z"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="9" r="3"/><circle cx="12" cy="18" r="3"/></svg></button>`;
    return `<button type="button" class="watch-star${saved ? ' is-saved' : ''}" data-watch-toggle data-watch-market="${stock.market}" data-watch-symbol="${esc(stock.symbol)}" data-watch-name="${esc(stock.name)}" aria-label="${esc(label)}" title="${esc(label)}" aria-pressed="${saved}"${busy || !ready || root.ClustrApp?.isAccountPreview?.() ? ' disabled' : ''}${busy ? ' aria-busy="true"' : ''}><svg viewBox="0 0 24 24" width="18" height="18" fill="${saved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.6l6.2-.9Z"/></svg></button>`;
  }

  function paintControls() {
    if (!root.document) return;
    root.document.documentElement?.toggleAttribute('data-watchlist-filtered', !!user && isFiltered());
    const nav = root.document.getElementById('navWatchlist');
    nav?.setAttribute?.('aria-label', isFiltered() ? 'My watchlist, filter active' : 'My watchlist');
    if (nav?.setAttribute) nav.title = isFiltered() ? 'Watchlist filter active' : 'My watchlist';
    const bar = root.document.getElementById('watchlistScope');
    if (bar) {
      bar.hidden = !user || ['account', 'admin', 'watchlist', 'polymarket'].includes(view);
      const indicator = bar.querySelector('[data-watch-indicator]');
      if (indicator) indicator.hidden = !isFiltered();
      bar.querySelectorAll('[data-watch-scope]').forEach(control => {
        const selected = control.dataset.watchScope === scope;
        control.setAttribute('aria-pressed', String(selected));
        if (control.dataset.watchScope === 'watchlist') {
          control.disabled = !ready;
          control.querySelector('[data-watch-count]').textContent = String(entries.size+clusters.size);
        }
      });
      const menu = bar.querySelector('[data-watch-menu]');
      if (menu) { menu.hidden = !isFiltered(); if (bar.hidden || menu.hidden) menu.open = false; }
      const count = bar.querySelector('[data-watch-links-count]');
      if (count) count.textContent = `${linkTypes.size}/${Object.keys(LINK_TYPES).length}`;
      const note = bar.querySelector('[data-watch-note]');
      note.textContent = message || (loading ? 'Loading watchlist…' : isFiltered() ? clusters.size?'Saved clusters are included in full. Link filters apply to watched stocks.':!linkTypes.size?'No link types selected. Turn on a link type to show matching clusters.':entries.size ? '' : 'Your watchlist is empty. Add stocks or clusters to see matching content.' : '');
      const links=bar.querySelector('[data-watch-links]');
      if(links){links.querySelectorAll('[data-watch-link]').forEach(control=>{control.checked=linkTypes.has(control.dataset.watchLink);control.disabled=!ready;});}
      bar.querySelector('[data-watch-refresh]').hidden = !message;
    }
    root.document.querySelectorAll('[data-watch-toggle], [data-watch-cluster-toggle]').forEach(control => {
      const isCluster=control.dataset.watchCluster!==undefined;
      const stock = isCluster?clusterRecord(control.dataset.watchCluster,control.dataset.watchMarket):stockRecord({ symbol: control.dataset.watchSymbol, name: control.dataset.watchName }, control.dataset.watchMarket);
      if (!stock) return;
      const saved = (isCluster?clusters:entries).has(stock.key), busy = pending.has(stock.key);
      control.disabled = !ready || busy || !!root.ClustrApp?.isAccountPreview?.();
      control.setAttribute('aria-pressed', String(saved)); control.classList.toggle('is-saved', saved);
      control.setAttribute('aria-label', `${saved ? 'Remove' : 'Add'} ${isCluster?stock.name+' cluster':stock.symbol} ${saved ? 'from' : 'to'} watchlist`);
      control.title = control.getAttribute('aria-label');
      if (busy) control.setAttribute('aria-busy', 'true'); else control.removeAttribute('aria-busy');
      control.querySelector('svg')?.setAttribute('fill', saved ? 'currentColor' : 'none');
    });
  }

  function recentStocks() {
    const app = root.ClustrApp, publish = app?.getPublishes?.()[app.getPublishIndex?.() || 0];
    const groups = app?.getAllGroups?.() || app?.getGroups?.() || [];
    const all = new Map();
    groups.forEach(group => groupStocks(group, publish?.market).forEach(stock => all.set(stock.key, stock)));
    return [...all.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  function recentClusters() {
    const app=root.ClustrApp,publish=app?.getPublishes?.()[app.getPublishIndex?.()||0];
    const groups=app?.getAllGroups?.()||app?.getGroups?.()||[];
    return [...new Map(groups.map(group=>clusterRecord(group,publish?.market)).filter(Boolean).map(item=>[item.key,item])).values()].sort((a,b)=>a.name.localeCompare(b.name));
  }

  function clusterRow(cluster) {
    const groups=root.ClustrApp?.getAllGroups?.()||root.ClustrApp?.getGroups?.()||[];
    const group=groups.find(group=>clusterRecord(group,cluster.market)?.key===cluster.key);
    return `<div class="watchlist-stock"><div>${group?`<button type="button" class="watchlist-company-open" data-watch-cluster-open="${esc(group.name)}">${esc(cluster.name)}</button>`:`<strong>${esc(cluster.name)}</strong>`}<small>Cluster · ${cluster.market} · ${group?`${(group.articles||[]).length} articles in selected report`:'Not in selected report; stays saved for future reports'}</small></div>${button(cluster,cluster.market,'cluster')}</div>`;
  }

  function stockRow(stock) {
    const groups=(root.ClustrApp?.getGroups?.()||[]).filter(group=>groupStocks(group,stock.market).some(item=>item.key===stock.key));
    return `<div class="watchlist-stock"><div><button type="button" class="watchlist-company-open" data-watch-stock-open="${esc(stock.symbol)}">${esc(stock.symbol)}</button><small>${esc(stock.name)} · ${stock.market}</small></div>${button(stock, stock.market)}<div class="watchlist-card-price" data-watch-card-price="${esc(stock.symbol)}">Loading quote…</div><div class="watchlist-card-themes">${groups.slice(0,2).map(group=>`<span>${esc(group.name)}</span>`).join('')||'<small>No linked themes in this report</small>'}</div></div>`;
  }

  function paintManager() {
    if (!manager || view !== 'watchlist') return;
    const rows = [...entries.values()].sort((a, b) => a.symbol.localeCompare(b.symbol) || a.market.localeCompare(b.market));
    manager.querySelector('[data-watch-count]').textContent = `${rows.length} stock${rows.length === 1 ? '' : 's'} · ${clusters.size} cluster${clusters.size===1?'':'s'}`;
    manager.querySelector('[data-watch-manager-status]').textContent = message || (loading ? 'Syncing your account watchlist…' : 'Saved to your account.');
    manager.querySelector('[data-watch-saved]').innerHTML = rows.length ? rows.map(stockRow).join('') : '<p class="watchlist-empty">No saved stocks yet. Add a ticker below or save a stock in Stocks.</p>';
    const clusterHost=manager.querySelector('[data-watch-saved-clusters]');
    if(clusterHost)clusterHost.innerHTML=clusters.size?[...clusters.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(clusterRow).join(''):'<p class="watchlist-empty">No saved clusters yet. Follow a cluster below or from its News card.</p>';
    const clusterChoices=manager.querySelector('[data-watch-recent-clusters]');
    if(clusterChoices)clusterChoices.innerHTML=recentClusters().filter(item=>item.name.toLowerCase().includes(clusterSearch.trim().toLowerCase())).map(clusterRow).join('')||'<p class="watchlist-empty">No clusters match in the selected report.</p>';
    const matches = recentStocks().filter(stock => `${stock.symbol} ${stock.name}`.toLowerCase().includes(search.trim().toLowerCase()));
    manager.querySelector('[data-watch-recent]').innerHTML = matches.slice(0, limit).map(stockRow).join('') || '<p class="watchlist-empty">No recent stocks match. You can add a ticker manually.</p>';
    manager.querySelector('[data-watch-results]').textContent = `Matches: ${matches.length}`;
    manager.querySelector('[data-watch-more]').hidden = matches.length <= limit;
    manager.querySelector('[data-watch-add]').disabled = !ready || pending.size > 0;
    if(root.ClustrQuotes){
      const current=epoch,host=manager;
      root.ClustrQuotes.getLatestQuotes(rows.map(stock=>stock.symbol),'US').then(quotes=>{
        if(current!==epoch||host!==manager||view!=='watchlist')return;
        host.querySelectorAll('[data-watch-card-price]').forEach(node=>{const quote=quotes[node.dataset.watchCardPrice];node.innerHTML=quote?`<strong>${esc(new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(quote.price))}</strong><span class="${quote.changePercent<0?'down':'up'}">${Number.isFinite(quote.changePercent)?`${quote.changePercent>0?'+':''}${quote.changePercent.toFixed(2)}% session`:'Session change unavailable'}</span><small>${esc(new Date(quote.asOf).toLocaleString())} · may be delayed</small>`:'<small>Latest quote unavailable</small>';});
      }).catch(()=>{});
    }
  }

  function mount(host) {
    manager = host;
    if (!host) return;
    host.innerHTML = `<div class="watchlist-heading"><div><h1>Watchlist</h1><p data-watch-count></p></div><button type="button" class="watchlist-action" data-watch-refresh>Refresh</button></div><p class="watchlist-status" data-watch-manager-status role="status"></p><h2>Saved clusters</h2><div class="watchlist-grid" data-watch-saved-clusters></div><h2>Saved stocks</h2><div class="watchlist-grid" data-watch-saved></div><section class="watchlist-panel"><h2>Follow a cluster</h2><label class="watchlist-search">Find clusters in this report<input type="search" data-watch-cluster-search placeholder="AI, energy, cybersecurity…" autocomplete="off"></label><p class="watchlist-status">Saved clusters follow the same theme across reports, including all of its stories and stocks.</p><div class="watchlist-grid" data-watch-recent-clusters></div></section><section class="watchlist-panel"><h2>Add a stock</h2><form id="watchlistAddForm" class="watchlist-add-form"><label>Ticker<input name="symbol" placeholder="NVDA or AAPL" maxlength="32" autocomplete="off" required></label><button type="submit" class="watchlist-action" data-watch-add>Add stock</button></form></section><section class="watchlist-panel"><h2>Report stocks</h2><label class="watchlist-search">Search stocks<input type="search" data-watch-search placeholder="Ticker or company name" autocomplete="off"></label><p class="watchlist-status" data-watch-results role="status"></p><div class="watchlist-grid" data-watch-recent></div><button type="button" class="watchlist-action" data-watch-more>Show more stocks</button></section>`;
    host.querySelector('[data-watch-search]').value = search;
    paintManager();
  }

  if (root.document) {
    root.document.addEventListener('click', event => {
      const cluster=event.target.closest('[data-watch-cluster-toggle]');
      if(cluster){event.preventDefault();event.stopPropagation();setClusterSaved(cluster.dataset.watchCluster,cluster.dataset.watchMarket,!includesCluster(cluster.dataset.watchCluster,cluster.dataset.watchMarket)).catch(()=>{});return;}
      const clusterOpen=event.target.closest('[data-watch-cluster-open]');
      if(clusterOpen){root.ClustrApp?.jumpToCluster?.(clusterOpen.dataset.watchClusterOpen);return;}
      const company=event.target.closest('[data-watch-stock-open]');
      if(company){root.ClustrApp?.showView('stocks');root.ClustrStocks?.selectSymbol?.(company.dataset.watchStockOpen);}
      const toggle = event.target.closest('[data-watch-toggle]'), scopeButton = event.target.closest('[data-watch-scope]');
      if (toggle) { event.preventDefault(); event.stopPropagation(); const stock = { symbol: toggle.dataset.watchSymbol, name: toggle.dataset.watchName }; setSaved(stock, toggle.dataset.watchMarket, !includes(stock, toggle.dataset.watchMarket)).catch(() => {}); }
      if (scopeButton) setScope(scopeButton.dataset.watchScope);
      if (event.target.closest('[data-watch-manage]')) { root.document.querySelector('[data-watch-menu]')?.removeAttribute('open'); root.ClustrApp?.showView('watchlist'); }
      if (!event.target.closest('[data-watch-menu]')) root.document.querySelector('[data-watch-menu]')?.removeAttribute('open');
      if (event.target.closest('[data-watch-refresh]')) refresh();
      if (event.target.closest('[data-watch-more]')) { limit += 24; paintManager(); }
    });
    root.document.addEventListener('keydown', event => {
      const menu = root.document.querySelector('[data-watch-menu][open]');
      if (event.key === 'Escape' && menu) { menu.open = false; menu.querySelector('summary').focus(); }
    });
    root.document.addEventListener('change', event => {
      const link=event.target.closest('[data-watch-link]');if(link)setLinkType(link.dataset.watchLink,link.checked);
    });
    root.document.addEventListener('input', event => { if (event.target.matches('[data-watch-search]')) { search = event.target.value; limit = 12; paintManager(); } if(event.target.matches('[data-watch-cluster-search]')){clusterSearch=event.target.value;paintManager();} });
    root.document.addEventListener('submit', async event => {
      if (event.target.id !== 'watchlistAddForm') return;
      event.preventDefault();
      const form = event.target, fields = new FormData(form), market = 'US';
      const stock = stockRecord({ symbol: fields.get('symbol') }, market);
      if (!stock) { message = 'Enter a valid US ticker.'; paintManager(); return; }
      const known = recentStocks().find(item => item.key === stock.key) || stock;
      try { await setSaved(known, market, true); form.elements.symbol.value = ''; form.elements.symbol.focus(); }
      catch (error) { message = error.message; paintManager(); }
    });
  }

  return { init, refresh, mount, button, includes, allows, isFiltered, filterGroups, filterGroupMap, setScope, setSaved, linkedGroups,setLinkType,getLinkTypes:()=>[...linkTypes],
    clusterRecord,includesCluster,setClusterSaved,clusterButton:(raw,market='US')=>button(raw,market,'cluster'),getClusters:()=>[...clusters.values()],
    stockRecord, groupStocks, scopeGroups, scopeKey: () => `${scope}:${version}`, setView: value => { view = value; paintControls(); }, getItems: () => [...entries.values()] };
});
