/** Rolling-week stock explorer. Uses the same authenticated data as Events. */
(function () {
  const U = () => window.ClustrUtil;
  const DAY = 86400000;
  const quoteTime = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const LAYERS = {
    mentioned: ['mentioned_stocks'],
    close: ['close_stocks', 'direct_stocks'],
    related: ['original_stocks', 'related_stocks'],
    defaults: ['fixed_stocks', 'default_stocks', 'default_symbols'],
    winner: ['connected_winners'], loser: ['connected_losers'], mover: ['movers'],
    linked: ['stocks']
  };
  const LABELS = { mentioned: 'Article mention', close: 'Close link', related: 'Related stock', defaults: 'Theme comparison basket', winner: 'Connected winner', loser: 'Connected loser', mover: 'Session mover', linked: 'Cluster link' };
  let root, items = [], quotes = null, selected = '', mode = 'clusters', query = '';
  let generation = 0, active = false, listScroll = 0;
  let reportData=[];
  let requestedSymbol = '';

  function usableStock(raw) {
    const stock = typeof raw === 'string' ? { symbol: raw } : raw;
    const symbol = U().normalizeSymbol(stock?.symbol);
    return stock?.resolved !== false && U().isQuoteSymbol(symbol) ? { symbol, name: String(stock?.name || symbol) } : null;
  }

  function articleKey(article) {
    return String(article.link || '').trim() || `${article.title || ''}|${article.date || article.published_at || ''}`;
  }

  function buildStockIndex(data) {
    const index = new Map();
    // Newest metadata wins, independent of network completion order.
    const ordered = data.slice().sort((a, b) => Date.parse(b.publish.created_at) - Date.parse(a.publish.created_at) || Number(b.publish.id) - Number(a.publish.id));
    for (const { publish, groups } of ordered) {
      for (const group of groups || []) {
        const clusterName = String(group.name || group.cluster_name || 'Unnamed cluster').trim();
        const exchange = String(group.market || publish.market || 'US').toUpperCase();
        const clusterKey = `${exchange}:${clusterName.toLocaleLowerCase()}`;
        const add = (raw, layer, article) => {
          const stock = usableStock(raw);
          if (!stock) return;
          const key = `${exchange}:${stock.symbol}`;
          if (!index.has(key)) index.set(key, { ...stock, key, market: exchange, redditBuzz: U().redditBuzzForStock(groups, stock.symbol, exchange, publish.created_at), links: new Map(), articles: new Map(), publishes: new Set() });
          const item = index.get(key);
          if (item.name === item.symbol && stock.name !== stock.symbol) item.name = stock.name;
          if (!item.links.has(clusterKey)) item.links.set(clusterKey, { key: clusterKey, name: clusterName, market: exchange, group, publish, layers: new Set(), articles: new Map(), publishes: new Set(), articlePublishes: new Set() });
          const link = item.links.get(clusterKey);
          link.layers.add(layer);
          link.publishes.add(publish.id);
          item.publishes.add(publish.id);
          if (layer === 'mentioned') {
            link.articlePublishes.add(publish.id);
            if (!link.articlePublish) { link.articlePublish = publish; link.articleGroup = group; }
          }
          if (article) {
            const id = articleKey(article);
            if (!link.articles.has(id)) link.articles.set(id, article);
            if (!item.articles.has(id)) item.articles.set(id, article);
          }
        };
        for (const [layer, fields] of Object.entries(LAYERS)) {
          for (const field of fields) for (const stock of group[field] || []) add(stock, layer);
        }
        for (const article of group.articles || []) {
          for (const stock of article.mentioned_companies || []) add(stock, 'mentioned', article);
        }
      }
    }
    return [...index.values()].sort((a, b) => b.links.size - a.links.size || b.articles.size - a.articles.size || a.symbol.localeCompare(b.symbol) || a.market.localeCompare(b.market));
  }

  function buildScopedIndex(data,watchlist){
    return buildStockIndex(data.map(row=>({...row,groups:watchlist?.filterGroups(row.groups,row.publish.market)||row.groups})));
  }

  function linksFor(stock, filter) {
    return [...(stock?.links.values() || [])]
      .filter(link => filter !== 'articles' || link.layers.has('mentioned'))
      .map(link => filter === 'articles' ? { ...link, group: link.articleGroup, publish: link.articlePublish, publishes: link.articlePublishes, layers: new Set(['mentioned']) } : link)
      .sort((a, b) => Date.parse(b.publish.created_at) - Date.parse(a.publish.created_at) || a.name.localeCompare(b.name));
  }

  async function loadWeek(api, start, end) {
    const publishes = await api.fetchPublishesInRange(start, end);
    const data = [], failures = [];
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(4, publishes.length) }, async () => {
      while (next < publishes.length) {
        const publish = publishes[next++];
        try { data.push({ publish, groups: await api.loadGroupsForPublish(publish) }); }
        catch (_) { failures.push(publish.id); }
      }
    }));
    return { data, failures, total: publishes.length };
  }

  function safeLink(value) {
    try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; }
    catch (_) { return ''; }
  }

  function scoreHtml(group) {
    const score = U().articleImpactScore(group.articles || []) ?? U().numericStance(group.stance_score ?? group.cluster_score);
    const value = score == null ? '—' : `${score > 0 ? '+' : ''}${Number.isInteger(score) ? score : score.toFixed(1)}`;
    return `<span class="stocks-impact stocks-impact--${U().stanceCategory(score) || 'watch'}" title="Cluster impact at its latest linked publish" aria-label="Cluster impact ${score == null ? 'unavailable' : value}">${value}</span>`;
  }

  function clusterHtml(link) {
    const esc = U().escapeHtml;
    const date = new Date(link.publish.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const articles = [...link.articles.values()];
    const layers = [...link.layers].filter(layer => layer !== 'linked' || link.layers.size === 1);
    return `<article class="stocks-cluster">
      <div class="stocks-cluster-title"><h3>${esc(link.name)}</h3>${scoreHtml(link.group)}</div>
      <div class="stocks-link-tags">${layers.map(layer => `<span>${LABELS[layer]}</span>`).join('')}</div>
      <p class="stocks-link-meta">${esc(link.market)} · Latest link ${esc(date)} · ${link.publishes.size} publish${link.publishes.size === 1 ? '' : 'es'}</p>
      <p class="stocks-cluster-summary">${esc(link.group.reason || link.group.summary || 'No cluster summary available.')}</p>
      <details class="stocks-sources"><summary>Read context${articles.length ? ` · ${articles.length} source article${articles.length === 1 ? '' : 's'}` : ''}</summary>
        <p>${esc(link.group.reason || link.group.summary || 'No cluster summary available.')}</p>
        ${articles.length ? `<ul>${articles.map(article => {
          const href = safeLink(article.link);
          return `<li>${href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(article.title || 'Source article')}</a>` : `<span>${esc(article.title || 'Source article')}</span>`}${article.source ? `<small>${esc(article.source)}</small>` : ''}</li>`;
        }).join('')}</ul>` : `<p class="stocks-link-meta">${link.layers.has('mentioned') ? 'This stock is recorded as an article mention; source article details are not available in this publish.' : 'This is a cluster relationship, not an explicit article mention.'}</p>`}
      </details>
    </article>`;
  }

  function filteredItems() {
    const term = query.trim().toLocaleLowerCase();
    return items.filter(item => (window.ClustrWatchlist?.allows(item, item.market) ?? true) && item.market === 'US' && `${item.symbol} ${item.name}`.toLocaleLowerCase().includes(term));
  }

  function quoteHtml(quote, loading, detail = false) {
    const valid = quote && Number.isFinite(quote.price) && quote.price > 0 && Number.isFinite(Date.parse(quote.asOf));
    const price = loading ? 'Loading price…' : valid ? `USD ${U().formatMoney(quote.price)}` : 'Price unavailable';
    const change = valid && Number.isFinite(quote.changePercent) ? U().formatPct(quote.changePercent) : '';
    const asOf = valid ? `As of ${quoteTime.format(new Date(quote.asOf))}` : '';
    return `<span class="stocks-quote" title="${U().escapeHtml(asOf ? asOf + ' · may be delayed' : 'No latest quote available')}"><span>Last available price</span><strong>${U().escapeHtml(price)}</strong>${change ? `<small class="${U().toneClass(quote.changePercent)}">${change} session</small>` : ''}${asOf ? `<small>${U().escapeHtml(asOf)}${detail ? ' · may be delayed' : ''}</small>` : ''}</span>`;
  }

  function renderGrid() {
    const results = filteredItems(), esc = U().escapeHtml;
    root.querySelector('#stocksResultCount').textContent = `${results.length} of ${items.length} stocks`;
    root.querySelector('#stocksGrid').innerHTML = results.length ? results.map(stock => `<div class="stocks-tile-wrap"><button type="button" class="stocks-tile${stock.key === selected ? ' is-selected' : ''}" data-stock-key="${esc(stock.key)}" aria-pressed="${stock.key === selected}" aria-controls="stocksDetail"><span class="stocks-tile-top"><strong>${esc(stock.symbol)}</strong><small>${esc(stock.market)}</small></span><span class="stocks-company">${esc(stock.name)}</span>${quoteHtml(quotes?.[stock.symbol], quotes === null)}${U().redditBuzzHtml(stock.redditBuzz)}<span class="stocks-tile-meta">${stock.links.size} cluster${stock.links.size === 1 ? '' : 's'} · ${stock.articles.size} article${stock.articles.size === 1 ? '' : 's'}</span></button>${window.ClustrWatchlist?.button(stock, stock.market) || ''}</div>`).join('') : '<p class="stocks-empty">No stocks match your search. Try a ticker or company name.</p>';
  }

  function renderDetail() {
    const stock = items.find(item => item.key === selected && (window.ClustrWatchlist?.allows(item, item.market) ?? true)), detail = root.querySelector('#stocksDetail');
    if (!stock) { detail.innerHTML = '<div class="stocks-detail-empty"><h2>Select a stock</h2><p>Explore how its news and cluster relationships connect across the last seven days.</p></div>'; return; }
    const esc = U().escapeHtml, links = linksFor(stock, mode), articleLinks = linksFor(stock, 'articles');
    detail.innerHTML = `<button type="button" class="stocks-back" data-stock-back><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>Back to stocks</button>
      <div class="stocks-selection"><div><span class="stocks-eyebrow">${esc(stock.market)} · STOCK CONNECTIONS</span><h2 id="stocksSelectedHeading" tabindex="-1">${esc(stock.symbol)}</h2><p>${esc(stock.name)}</p>${quoteHtml(quotes?.[stock.symbol], quotes === null, true)}</div><span class="stocks-selection-count">${stock.links.size}<small>linked clusters</small></span></div>
      ${U().redditBuzzHtml(stock.redditBuzz, true)}
      <fieldset class="stocks-link-filter"><legend>Show connections</legend><label><input type="radio" name="stock-links" value="articles" ${mode === 'articles' ? 'checked' : ''}><span>Article mentions <b>${articleLinks.length}</b></span></label><label><input type="radio" name="stock-links" value="clusters" ${mode === 'clusters' ? 'checked' : ''}><span>All links <b>${stock.links.size}</b></span></label></fieldset>
      <p class="stocks-filter-note">${mode === 'articles' ? 'Explicit mentions recorded in source articles.' : 'All links: article mentions, close links, related stocks and theme comparison baskets.'} Impact scores describe clusters, not stock returns.</p>
      <p class="stocks-link-count" role="status">${links.length} linked cluster${links.length === 1 ? '' : 's'}</p>
      <div class="stocks-clusters">${links.length ? links.map(clusterHtml).join('') : '<p class="stocks-empty">No explicit article mentions for this stock in the last seven days. Choose “All links” to see its other links.</p>'}</div>`;
  }

  function compact() { return window.matchMedia('(max-width: 1000px)').matches; }

  function showStock(key) {
    if (!items.some(item => item.key === key)) return;
    selected = key;
    listScroll = window.scrollY;
    if (compact() && root.dataset.detailOpen !== 'true') window.history.pushState({ ...window.history.state, clustrStockDetail: true }, '');
    root.dataset.detailOpen = 'true';
    renderGrid(); renderDetail();
    if (compact()) { window.scrollTo(0, 0); root.querySelector('#stocksSelectedHeading')?.focus({ preventScroll: true }); }
    else focusSelectedTile();
  }

  function focusSelectedTile() {
    [...root.querySelectorAll('[data-stock-key]')].find(button => button.dataset.stockKey === selected)?.focus({ preventScroll: true });
  }

  function restoreStockList() {
    root.dataset.detailOpen = 'false';
    window.scrollTo(0, listScroll);
    focusSelectedTile();
  }

  function backToStocks() {
    if (window.history.state?.clustrStockDetail) window.history.back();
    else restoreStockList();
  }

  function shell() {
    const esc = U().escapeHtml;
    root.innerHTML = `<div class="stocks-heading"><div><span class="stocks-eyebrow">YOUR WEEK IN STOCKS</span><h1>Stocks</h1><p id="stocksRange">Loading the last seven days…</p></div><button type="button" class="stocks-refresh" data-stock-refresh>Refresh</button></div>
      <p id="stocksLoadStatus" class="stocks-load-status" role="status"></p>
      <div class="stocks-workspace"><section class="stocks-browser" aria-label="Find a stock"><div class="stocks-search-tools"><label for="stocksSearch">Find a stock</label><div class="stocks-search-row"><input id="stocksSearch" type="search" placeholder="Ticker or name" autocomplete="off" value="${esc(query)}"></div><p id="stocksResultCount" role="status"></p></div><div id="stocksGrid" class="stocks-grid" aria-label="Stocks from the last seven days"></div></section><section id="stocksDetail" class="stocks-detail" aria-label="Linked clusters"></section></div>`;
    root.addEventListener('input', handleInput);
    root.addEventListener('change', handleChange);
    root.addEventListener('click', handleClick);
    root.addEventListener('keydown', handleKey);
  }

  function handleInput(event) {
    if (event.target.id === 'stocksSearch') { query = event.target.value; renderGrid(); root.querySelector('.stocks-browser').scrollTop = 0; }
  }
  function handleChange(event) {
    if (event.target.name === 'stock-links') {
      mode = event.target.value;
      renderDetail();
      root.querySelector(`input[value="${mode}"]`)?.focus({ preventScroll: true });
    }
  }
  function handleClick(event) {
    const tile = event.target.closest('[data-stock-key]');
    if (tile) showStock(tile.dataset.stockKey);
    if (event.target.closest('[data-stock-back]')) backToStocks();
    if (event.target.closest('[data-stock-refresh]')) load();
  }
  function handleKey(event) {
    if (event.key === 'Escape' && compact() && root.dataset.detailOpen === 'true') { event.preventDefault(); backToStocks(); }
  }

  async function load() {
    const request = ++generation, end = new Date(), start = new Date(end.getTime() - 7 * DAY);
    quotes = null;
    const status = root.querySelector('#stocksLoadStatus'), refresh = root.querySelector('[data-stock-refresh]');
    root.setAttribute('aria-busy', 'true'); refresh.disabled = true;
    root.querySelector('#stocksRange').textContent = `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · rolling 7 days`;
    root.querySelector('#stocksGrid').innerHTML = '<p class="stocks-empty">Loading stocks…</p>';
    root.querySelector('#stocksDetail').innerHTML = '<p class="stocks-empty">Loading cluster connections…</p>';
    status.textContent = 'Loading stocks and cluster links…';
    try {
      const result = await loadWeek(window.ClustrApi, start.toISOString(), end.toISOString());
      if (request !== generation || !active) return;
      reportData=result.data;
      items = buildScopedIndex(reportData,window.ClustrWatchlist);
      if (requestedSymbol) { const match = items.find(item => item.symbol === requestedSymbol); if (match) selected = match.key; }
      if (!filteredItems().some(item => item.key === selected)) { selected = filteredItems()[0]?.key || ''; root.dataset.detailOpen = 'false'; }
      root.querySelector('#stocksRange').textContent = `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · rolling 7 days · ${result.data.length}/${result.total} publishes`;
      status.textContent = result.failures.length ? result.data.length ? `Some data could not load (${result.failures.length} publishes). Showing available links. Refresh to retry.` : 'No publish details could load. Refresh to retry.' : items.length ? '' : 'No stocks are available in publishes from the last seven days.';
      renderGrid(); renderDetail();
      if (requestedSymbol && items.some(item => item.symbol === requestedSymbol)) showStock(selected);
      requestedSymbol = '';
      let latest = {};
      try { latest = await window.ClustrQuotes?.getLatestQuotes?.(items.map(item => item.symbol), 'US') || {}; }
      catch (error) { console.warn('Stock quotes:', error.message); }
      if (request !== generation || !active) return;
      quotes = latest;
      renderGrid(); renderDetail();
    } catch (error) {
      if (request !== generation || !active) return;
      status.textContent = 'Could not load the weekly stocks. Check your connection and refresh to retry.';
      items = [];
      quotes = {};
      renderGrid(); renderDetail();
      console.warn('Stock explorer:', error.message);
    } finally {
      if (request === generation && active) { root.setAttribute('aria-busy', 'false'); refresh.disabled = false; }
    }
  }

  function mount(host, role) {
    root = host; active = true;
    if (!root) return;
    root.dataset.detailOpen = 'false';
    if (!['pro', 'admin'].includes(role)) {
      ++generation; items = []; quotes = null; reportData=[]; selected = '';
      root.setAttribute('aria-busy', 'false');
      root.innerHTML = '<div class="stocks-heading"><div><h1>Stocks</h1><p>The last seven days of stock connections are part of Pro.</p></div></div><button type="button" class="stocks-refresh" data-stock-account>Open account</button>';
      root.querySelector('[data-stock-account]').addEventListener('click', () => window.ClustrApp?.showView('account'));
      return;
    }
    shell(); renderGrid(); renderDetail(); load();
  }

  window.addEventListener('popstate', () => {
    if (!active || !root) return;
    if (window.history.state?.clustrStockDetail) {
      root.dataset.detailOpen = 'true';
      root.querySelector('#stocksSelectedHeading')?.focus({ preventScroll: true });
    } else restoreStockList();
  });

  function leave() {
    active = false; ++generation;
    if (window.history.state?.clustrStockDetail) window.history.back();
  }
  function refreshScope() {
    if (!active || !root?.querySelector('#stocksGrid')) return;
    items=buildScopedIndex(reportData,window.ClustrWatchlist);
    if (!filteredItems().some(item => item.key === selected)) { selected = filteredItems()[0]?.key || ''; root.dataset.detailOpen = 'false'; }
    renderGrid(); renderDetail();
  }
  function selectSymbol(symbol) {
    requestedSymbol = String(symbol || '').toUpperCase();
    query = '';
    const search = root?.querySelector('#stocksSearch');
    if (search) { search.value = ''; renderGrid(); }
    const item = items.find(item => item.symbol === requestedSymbol);
    if (active && item) showStock(item.key);
  }
  window.ClustrStocks = { mount, leave, refreshScope, selectSymbol };
})();
