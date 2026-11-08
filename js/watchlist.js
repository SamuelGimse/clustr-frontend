(function (root, factory) {
  const watchlist = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = watchlist;
  else root.ClustrWatchlist = watchlist;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  const FIELDS = ['mentioned_stocks', 'close_stocks', 'direct_stocks', 'original_stocks', 'related_stocks', 'fixed_stocks', 'default_stocks', 'default_symbols', 'stocks', 'connected_winners', 'connected_losers', 'movers'];
  let user = null, entries = new Map(), scope = 'all', ready = false, loading = false, message = '', version = 0, epoch = 0, reads = 0, view = 'events';
  let pending = new Set(), manager = null, search = '', limit = 12;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function stockRecord(raw, market = 'US') {
    const stock = typeof raw === 'string' ? { symbol: raw } : raw;
    const symbol = String(stock?.symbol || '').trim().toUpperCase();
    const exchange = String(stock?.market || market || 'US').toUpperCase();
    if (stock?.resolved === false || !['US', 'NO'].includes(exchange) || !/^[A-Z0-9^][A-Z0-9.^:=/\-]{0,31}$/.test(symbol)) return null;
    return { market: exchange, symbol, name: String(stock?.name || stock?.company || symbol).slice(0, 200), key: `${exchange}:${symbol}` };
  }

  function groupStocks(group, market = 'US') {
    const all = new Map(), fallback = group.market || market;
    for (const field of FIELDS) for (const raw of Array.isArray(group[field]) ? group[field] : []) {
      const stock = stockRecord(raw, fallback);
      if (stock && !all.has(stock.key)) all.set(stock.key, stock);
    }
    for (const article of group.articles || []) for (const raw of article.mentioned_companies || []) {
      const stock = stockRecord(raw, fallback);
      if (stock && !all.has(stock.key)) all.set(stock.key, stock);
    }
    return [...all.values()];
  }

  function scopeGroups(groups, market, keys) {
    return (groups || []).filter(group => groupStocks(group, market).some(stock => keys.has(stock.key))).map(group => {
      const result = { ...group }, fallback = group.market || market;
      const keep = raw => { const stock = stockRecord(raw, fallback); return stock && keys.has(stock.key); };
      for (const field of FIELDS) if (Array.isArray(group[field])) result[field] = group[field].filter(keep);
      // Preserve every article/rating for cluster context and unchanged impact scores.
      if (Array.isArray(group.articles)) result.articles = group.articles.map(article => Array.isArray(article.mentioned_companies) ? { ...article, mentioned_companies: article.mentioned_companies.filter(keep) } : article);
      return result;
    });
  }

  const isFiltered = () => scope === 'watchlist';
  const filterGroups = (groups, market = 'US') => isFiltered() ? scopeGroups(groups, market, new Set(entries.keys())) : groups;
  function filterGroupMap(groups, publishes) {
    if (!isFiltered()) return groups;
    const markets = new Map(publishes.map(publish => [String(publish.id), publish.market || 'US']));
    return new Map([...groups].map(([id, rows]) => [id, filterGroups(rows, markets.get(String(id)))]));
  }
  function includes(raw, market = 'US') { const stock = stockRecord(raw, market); return !!stock && entries.has(stock.key); }
  function allows(raw, market = 'US') { return !isFiltered() || includes(raw, market); }

  async function request(method, stock, offset = 0) {
    const token = root.ClustrAuth?.accessToken();
    if (!user || !token) throw new Error('Sign in to use your watchlist.');
    const cfg = root.ClustrConfig || {};
    let path = '/rest/v1/clustr_watchlist';
    if (method === 'GET') path += `?select=market,symbol,name&order=created_at.asc,market.asc,symbol.asc&limit=250&offset=${offset}`;
    if (method === 'DELETE') path += `?market=eq.${encodeURIComponent(stock.market)}&symbol=eq.${encodeURIComponent(stock.symbol)}`;
    const response = await root.fetch(String(cfg.SUPABASE_URL || '').replace(/\/$/, '') + path, {
      method,
      headers: { apikey: cfg.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(method === 'POST' ? { Prefer: 'resolution=ignore-duplicates,return=minimal' } : {}) },
      ...(method === 'POST' ? { body: JSON.stringify({ market: stock.market, symbol: stock.symbol, name: stock.name }) } : {})
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
      const rows = [];
      for (let offset = 0; ; offset += 250) {
        const page = await request('GET', null, offset);
        if (current !== epoch || read !== reads) return;
        rows.push(...page);
        if (page.length < 250) break;
      }
      if (current !== epoch || read !== reads) return;
      entries = new Map((rows || []).map(row => stockRecord(row, row.market)).filter(Boolean).map(stock => [stock.key, stock]));
      ready = true; version++;
      notify(false, true);
    } catch (error) {
      if (current !== epoch || read !== reads) return;
      message = ready ? 'Could not refresh. Showing your last saved watchlist. Retry when connected.' : 'Could not load your watchlist. Retry when connected.';
      notify();
    } finally { if (current === epoch && read === reads) { loading = false; paintControls(); paintManager(); } }
  }

  async function init(account) {
    epoch++; reads++; user = account || null; entries = new Map(); pending = new Set(); ready = false; loading = false; message = ''; scope = 'all'; manager = null; version++;
    if (user) { try { if (root.localStorage.getItem(`clustr-watchlist-scope:${user.id}`) === 'watchlist') scope = 'watchlist'; } catch {} }
    paintControls();
    if (user) await refresh();
  }

  function setScope(value) {
    if (!['all', 'watchlist'].includes(value) || value === scope || !user) return;
    if (value === 'watchlist' && !ready) return;
    scope = value; version++;
    try { root.localStorage.setItem(`clustr-watchlist-scope:${user.id}`, scope); } catch {}
    notify(true);
  }

  async function setSaved(raw, market, desired) {
    const stock = stockRecord(raw, market);
    if (!stock) throw new Error('Enter a valid ticker and market.');
    if (!user || !ready) throw new Error('Load your signed-in watchlist before making changes.');
    if (pending.has(stock.key) || entries.has(stock.key) === desired) return;
    const current = epoch;
    reads++; loading = false;
    pending.add(stock.key); message = ''; paintControls(); paintManager();
    try {
      await request(desired ? 'POST' : 'DELETE', stock);
      if (current !== epoch) return;
      if (desired) entries.set(stock.key, stock); else entries.delete(stock.key);
      version++; notify(false, true);
    } catch (error) {
      if (current === epoch) { message = error.message; notify(); }
      throw error;
    } finally { if (current === epoch) { pending.delete(stock.key); paintControls(); paintManager(); } }
  }

  function button(raw, market = 'US') {
    const stock = stockRecord(raw, market);
    if (!user || !stock) return '';
    const saved = entries.has(stock.key), busy = pending.has(stock.key);
    const label = `${saved ? 'Remove' : 'Add'} ${stock.symbol} ${saved ? 'from' : 'to'} watchlist`;
    return `<button type="button" class="watch-star${saved ? ' is-saved' : ''}" data-watch-toggle data-watch-market="${stock.market}" data-watch-symbol="${esc(stock.symbol)}" data-watch-name="${esc(stock.name)}" aria-label="${esc(label)}" title="${esc(label)}" aria-pressed="${saved}"${busy || !ready ? ' disabled' : ''}${busy ? ' aria-busy="true"' : ''}><svg viewBox="0 0 24 24" width="18" height="18" fill="${saved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.6l6.2-.9Z"/></svg></button>`;
  }

  function paintControls() {
    if (!root.document) return;
    const bar = root.document.getElementById('watchlistScope');
    if (bar) {
      bar.hidden = !user || ['account', 'admin', 'watchlist', 'polymarket'].includes(view);
      bar.querySelectorAll('[data-watch-scope]').forEach(control => {
        const selected = control.dataset.watchScope === scope;
        control.setAttribute('aria-pressed', String(selected)); control.classList.toggle('is-active', selected);
        if (control.dataset.watchScope === 'watchlist') { control.disabled = !ready; control.querySelector('span').textContent = String(entries.size); }
      });
      const note = bar.querySelector('[data-watch-note]');
      note.textContent = message || (loading ? 'Loading watchlist…' : isFiltered() ? entries.size ? 'Showing your saved stocks and linked clusters.' : 'Your watchlist is empty. Add stocks to see matching content.' : '');
      bar.querySelector('[data-watch-refresh]').hidden = !message;
    }
    root.document.querySelectorAll('[data-watch-toggle]').forEach(control => {
      const stock = stockRecord({ symbol: control.dataset.watchSymbol, name: control.dataset.watchName }, control.dataset.watchMarket);
      if (!stock) return;
      const saved = entries.has(stock.key), busy = pending.has(stock.key);
      control.disabled = !ready || busy;
      control.setAttribute('aria-pressed', String(saved)); control.classList.toggle('is-saved', saved);
      control.setAttribute('aria-label', `${saved ? 'Remove' : 'Add'} ${stock.symbol} ${saved ? 'from' : 'to'} watchlist`);
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

  function stockRow(stock) {
    return `<div class="watchlist-stock"><div><strong>${esc(stock.symbol)}</strong><small>${esc(stock.name)} · ${stock.market}</small></div>${button(stock, stock.market)}</div>`;
  }

  function paintManager() {
    if (!manager || view !== 'watchlist') return;
    const rows = [...entries.values()].sort((a, b) => a.symbol.localeCompare(b.symbol) || a.market.localeCompare(b.market));
    manager.querySelector('[data-watch-count]').textContent = `${rows.length} saved stock${rows.length === 1 ? '' : 's'}`;
    manager.querySelector('[data-watch-manager-status]').textContent = message || (loading ? 'Syncing your account watchlist…' : 'Saved privately to your account. Available across devices.');
    manager.querySelector('[data-watch-saved]').innerHTML = rows.length ? rows.map(stockRow).join('') : '<p class="watchlist-empty">No saved stocks yet. Add a ticker below or star a stock in Stocks.</p>';
    const matches = recentStocks().filter(stock => `${stock.symbol} ${stock.name}`.toLowerCase().includes(search.trim().toLowerCase()));
    manager.querySelector('[data-watch-recent]').innerHTML = matches.slice(0, limit).map(stockRow).join('') || '<p class="watchlist-empty">No recent stocks match. You can add a ticker manually.</p>';
    manager.querySelector('[data-watch-results]').textContent = `${matches.length} matching stocks from the selected report`;
    manager.querySelector('[data-watch-more]').hidden = matches.length <= limit;
    manager.querySelector('[data-watch-add]').disabled = !ready || pending.size > 0;
  }

  function mount(host) {
    manager = host;
    if (!host) return;
    host.innerHTML = `<div class="watchlist-heading"><div><h1>My watchlist</h1><p data-watch-count></p></div><button type="button" class="watchlist-action" data-watch-refresh>Refresh</button></div><p class="watchlist-status" data-watch-manager-status role="status"></p><div class="watchlist-grid" data-watch-saved></div><section class="watchlist-panel"><h2>Add a stock</h2><form id="watchlistAddForm" class="watchlist-add-form"><label>Ticker<input name="symbol" placeholder="NVDA or EQNR.OL" maxlength="32" autocomplete="off" required></label><label>Market<select name="market"><option value="US">US</option><option value="NO">Norway</option></select></label><button type="submit" class="watchlist-action" data-watch-add>Add stock</button></form></section><section class="watchlist-panel"><h2>From the selected report</h2><label class="watchlist-search">Search stocks<input type="search" data-watch-search placeholder="Ticker or company name" autocomplete="off"></label><p class="watchlist-status" data-watch-results role="status"></p><div class="watchlist-grid" data-watch-recent></div><button type="button" class="watchlist-action" data-watch-more>Show more stocks</button></section>`;
    host.querySelector('[data-watch-search]').value = search;
    paintManager();
  }

  if (root.document) {
    root.document.addEventListener('click', event => {
      const toggle = event.target.closest('[data-watch-toggle]'), scopeButton = event.target.closest('[data-watch-scope]');
      if (toggle) { event.preventDefault(); event.stopPropagation(); const stock = { symbol: toggle.dataset.watchSymbol, name: toggle.dataset.watchName }; setSaved(stock, toggle.dataset.watchMarket, !includes(stock, toggle.dataset.watchMarket)).catch(() => {}); }
      if (scopeButton) setScope(scopeButton.dataset.watchScope);
      if (event.target.closest('[data-watch-manage]')) root.ClustrApp?.showView('watchlist');
      if (event.target.closest('[data-watch-refresh]')) refresh();
      if (event.target.closest('[data-watch-more]')) { limit += 24; paintManager(); }
    });
    root.document.addEventListener('input', event => { if (event.target.matches('[data-watch-search]')) { search = event.target.value; limit = 12; paintManager(); } });
    root.document.addEventListener('submit', async event => {
      if (event.target.id !== 'watchlistAddForm') return;
      event.preventDefault();
      const form = event.target, fields = new FormData(form), market = String(fields.get('market'));
      const stock = stockRecord({ symbol: fields.get('symbol') }, market);
      if (!stock) { message = 'Enter a valid ticker and market.'; paintManager(); return; }
      const known = recentStocks().find(item => item.key === stock.key) || stock;
      try { await setSaved(known, market, true); form.elements.symbol.value = ''; form.elements.symbol.focus(); }
      catch (error) { message = error.message; paintManager(); }
    });
  }

  return { init, refresh, mount, button, includes, allows, isFiltered, filterGroups, filterGroupMap, setScope, setSaved,
    stockRecord, groupStocks, scopeGroups, scopeKey: () => `${scope}:${version}`, setView: value => { view = value; paintControls(); }, getItems: () => [...entries.values()] };
});
