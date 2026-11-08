(function (root, factory) {
  const atlas = factory();
  if (typeof module === 'object' && module.exports) module.exports = atlas;
  else root.ClustrAtlas = atlas;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const osloDate = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' });
  const osloTime = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', hour12: false });
  const state = { mode: 'days', entity: 'clusters', search: '', selected: '', stockLimit: 10 };
  let cached = null;
  let loading = null;
  let revision = 0;
  let models = new Map();
  let stockView = null;

  function dayOf(timestamp) {
    const parts = Object.fromEntries(osloDate.formatToParts(new Date(timestamp)).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function scoreOf(group, util) {
    const ratings = (group.articles || []).map(article => article.rating ?? article.score);
    return util.articleImpactScore(ratings) ?? util.numericStance(group.stance_score ?? group.cluster_score);
  }

  function articleKey(article) {
    return String(article.link || article.url || [article.source, article.title, article.date || article.published_at].join('|'));
  }

  function buildModel(publishes, groupsById, mode, util) {
    const ordered = [...publishes].filter(publish => Number.isFinite(Date.parse(publish.created_at)))
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || Number(a.id) - Number(b.id));
    const columns = mode === 'days'
      ? [...new Map(ordered.map(publish => [dayOf(publish.created_at), publish])).values()]
      : ordered;
    const themes = new Map();
    const allThemes = new Set();
    const allStories = new Set();
    for (const publish of ordered) {
      for (const group of groupsById.get(String(publish.id)) || []) {
        if (group.name || group.group) allThemes.add(String(group.name || group.group).trim());
        for (const article of group.articles || []) allStories.add(articleKey(article));
      }
    }
    columns.forEach((publish, index) => {
      for (const group of groupsById.get(String(publish.id)) || []) {
        const name = String(group.name || group.group || '').trim();
        if (!name) continue;
        if (!themes.has(name)) themes.set(name, { name, entries: Array(columns.length).fill(null), count: 0 });
        const articles = [...new Map((group.articles || []).map(article => [articleKey(article), article])).values()];
        const sources = [...new Set(articles.map(article => String(article.source || '').trim()).filter(Boolean))].sort();
        const entry = { publish, group, score: scoreOf({ ...group, articles }, util), articles: articles.length, sources };
        const theme = themes.get(name);
        if (!theme.entries[index]) theme.count++;
        theme.entries[index] = entry;
      }
    });
    const stocks = new Map();
    const layers = [
      ['Article mention', ['mentioned_stocks']],
      ['Close link', ['close_stocks', 'direct_stocks']],
      ['Related stock', ['original_stocks', 'related_stocks']],
      ['Cluster default', ['fixed_stocks', 'default_stocks', 'default_symbols']],
      ['Connected mover', ['connected_winners', 'connected_losers', 'movers']],
      ['Cluster link', ['stocks']]
    ];
    for (const theme of themes.values()) {
      theme.entries.forEach((entry, index) => {
        if (!entry) return;
        const market = String(entry.group.market || entry.publish.market || 'US').toUpperCase();
        const linked = new Map();
        for (const [label, fields] of layers) for (const field of fields) for (const raw of entry.group[field] || []) {
          const stock = typeof raw === 'string' ? { symbol: raw } : raw;
          const symbol = util.normalizeSymbol(stock?.symbol);
          if (stock?.resolved === false || !util.isQuoteSymbol(symbol)) continue;
          if (!linked.has(symbol)) linked.set(symbol, { name: stock.name || symbol, layers: new Set() });
          if (linked.get(symbol).name === symbol && stock.name) linked.get(symbol).name = stock.name;
          linked.get(symbol).layers.add(label);
        }
        for (const [symbol, info] of linked) {
          const key = `${market}:${symbol}`;
          if (!stocks.has(key)) stocks.set(key, { name: symbol, symbol, market, company: info.name, entries: Array(columns.length).fill(null), count: 0 });
          const row = stocks.get(key);
          if (row.company === symbol && info.name !== symbol) row.company = info.name;
          if (!row.entries[index]) { row.entries[index] = { publish: entry.publish, links: [], score: null }; row.count++; }
          row.entries[index].links.push({ theme: theme.name, score: entry.score, layers: [...info.layers] });
        }
      });
    }
    for (const row of stocks.values()) for (const entry of row.entries) if (entry) {
      entry.score = util.articleImpactScore(entry.links.map(link => link.score));
    }
    return {
      columns,
      themes: [...themes.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      stocks: [...stocks.values()].sort((a, b) => b.count - a.count || a.symbol.localeCompare(b.symbol) || a.market.localeCompare(b.market)),
      themeCount: allThemes.size,
      publishCount: ordered.length,
      dayCount: new Set(ordered.map(publish => dayOf(publish.created_at))).size,
      storyCount: allStories.size
    };
  }

  function modelFor(mode) {
    if (!models.has(mode)) models.set(mode, buildModel(cached.publishes, cached.groups, mode, window.ClustrUtil));
    return models.get(mode);
  }

  function pageStocks(stocks, query, limit) {
    const matches = stocks.filter(row => !query || row.symbol.toLowerCase().includes(query) || String(row.company).toLowerCase().includes(query));
    return { matches, visible: matches.slice(0, limit) };
  }

  function scoreText(score) {
    if (score == null) return '—';
    return `${score > 0 ? '+' : ''}${Number.isInteger(score) ? score : score.toFixed(1)}`;
  }

  function tone(score) {
    return score == null ? 'missing' : score > 0 ? 'up' : score < 0 ? 'down' : 'flat';
  }

  function lineChart(theme, model) {
    const points = theme.entries.map((entry, index) => entry?.score == null ? null : {
      x: 24 + index * 512 / Math.max(1, model.columns.length - 1),
      y: 96 - (entry.score + 10) * 3.6,
      score: entry.score,
      label: model.columns[index].created_at
    }).filter(Boolean);
    if (!points.length) return '<p class="atlas-note">No scored snapshots for this theme.</p>';
    const path = points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
    return `<svg class="atlas-line" viewBox="0 0 560 124" role="img" aria-label="News impact trajectory for ${window.ClustrUtil.escapeHtml(theme.name)}"><line x1="24" x2="536" y1="60" y2="60" class="atlas-zero"/><path d="${path}" class="atlas-path"/>${points.map(point => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="4" class="atlas-point atlas-point--${tone(point.score)}"><title>${window.ClustrUtil.escapeHtml(new Date(point.label).toLocaleString('en', { timeZone: 'Europe/Oslo' }))}: ${scoreText(point.score)}</title></circle>`).join('')}</svg>`;
  }

  function stockRowHtml(row, selected, esc) {
    return `<tr><th scope="row" title="${esc(row.company)}"><span>${esc(row.symbol)} <small>${esc(row.market)}</small></span><small>${row.count} ${state.mode === 'days' ? 'days' : 'reports'} · ${esc(row.company)}</small></th>${row.entries.map((entry, index) => entry ? `<td><button type="button" class="atlas-cell atlas-cell--${tone(entry.score)} ${selected?.row === row && selected.index === index ? 'is-selected' : ''}" style="--strength:${Math.round(10 + Math.abs(entry.score || 0) * 7)}%" data-atlas-stock="${esc(row.market + ':' + row.symbol)}" data-atlas-index="${index}" aria-pressed="${selected?.row === row && selected.index === index}" aria-label="${esc(row.symbol)}, ${esc(new Date(entry.publish.created_at).toLocaleString('en', { timeZone: 'Europe/Oslo' }))}, linked cluster news impact ${scoreText(entry.score)}, ${entry.links.length} clusters"><strong>${scoreText(entry.score)}</strong><small>${entry.links.length} clusters</small></button></td>` : '<td class="atlas-blank" aria-label="No linked cluster in this report">·</td>').join('')}</tr>`;
  }

  function drawStocks(root, model, query) {
    const esc = window.ClustrUtil.escapeHtml;
    const { matches: rows, visible } = pageStocks(model.stocks, query, state.stockLimit);
    const selectedRow = visible.find(row => state.selected.endsWith(`|${row.market}:${row.symbol}`));
    const selectedIndex = selectedRow?.entries.findIndex(entry => entry && `${entry.publish.id}|${selectedRow.market}:${selectedRow.symbol}` === state.selected);
    const selected = selectedIndex >= 0
      ? { row: selectedRow, entry: selectedRow.entries[selectedIndex], index: selectedIndex }
      : (() => { const row = visible[0]; if (!row) return null; const index = row.entries.findLastIndex(Boolean); return { row, entry: row.entries[index], index }; })();
    if (selected) state.selected = `${selected.entry.publish.id}|${selected.row.market}:${selected.row.symbol}`;
    root.querySelector('#atlasStats').innerHTML = `<span><strong id="atlasStockCount">${visible.length} of ${rows.length}</strong> stocks loaded · ${model.stocks.length} available</span><span><strong>${model.storyCount}</strong> distinct stories</span><span><strong>${model.publishCount}</strong> reports</span>`;
    root.querySelector('#atlasLegendText').textContent = 'Cell number = linked-cluster news impact · smaller number = linked clusters';
    const matrix = root.querySelector('#atlasMatrix');
    const previousScroll = matrix.scrollLeft;
    const previousTop = matrix.scrollTop;
    const hadTable = !!matrix.querySelector('table');
    matrix.classList.add('atlas-matrix--stocks');
    stockView = { rows, selected };
    matrix.innerHTML = rows.length ? `<table class="atlas-table"><thead><tr><th scope="col">Stock</th>${model.columns.map(publish => `<th scope="col" title="${esc(new Date(publish.created_at).toLocaleString('en', { timeZone: 'Europe/Oslo' }))}"><span>${dayOf(publish.created_at).slice(5)}</span>${state.mode === 'publishes' ? `<small>${osloTime.format(new Date(publish.created_at))}</small>` : ''}</th>`).join('')}</tr></thead><tbody>${visible.map(row => stockRowHtml(row, selected, esc)).join('')}</tbody></table>` : '<p class="atlas-note">No stocks match this search.</p>';
    matrix.scrollLeft = hadTable ? previousScroll : state.mode === 'publishes' ? matrix.scrollWidth : 0;
    matrix.scrollTop = hadTable ? previousTop : 0;
    const detail = root.querySelector('#atlasDetail');
    if (!selected) { detail.innerHTML = '<p class="atlas-note">Choose a stock to inspect its linked clusters.</p>'; return; }
    const { row, entry, index } = selected;
    const prior = row.entries.slice(0, index).filter(Boolean).at(-1);
    const change = prior?.score != null && entry.score != null ? entry.score - prior.score : null;
    detail.innerHTML = `<div class="atlas-detail-head"><div><p class="atlas-eyebrow">SELECTED STOCK SNAPSHOT</p><h2>${esc(row.symbol)} · ${esc(row.company)}</h2><p>${esc(new Date(entry.publish.created_at).toLocaleString('en', { timeZone: 'Europe/Oslo' }))} · ${esc(row.market)} · ${entry.links.length} linked clusters</p></div><div class="atlas-detail-score atlas-detail-score--${tone(entry.score)}"><strong>${scoreText(entry.score)}</strong><span>linked-cluster news impact${change == null ? '' : ` · ${change >= 0 ? '+' : ''}${change.toFixed(1)} vs prior snapshot`}</span></div></div><div class="atlas-detail-grid"><section class="atlas-detail-panel"><h3>Linked impact over time</h3>${lineChart(row, model)}<p class="atlas-note">This combines scored cluster associations, not stock returns or an article-level stock score.</p></section><section class="atlas-detail-panel"><h3>Contributing clusters</h3><div class="atlas-stock-links">${entry.links.map(link => `<div><strong>${esc(link.theme)}</strong><b class="atlas-link-score atlas-link-score--${tone(link.score)}">${scoreText(link.score)}</b><small>${esc(link.layers.join(' · '))}</small></div>`).join('')}</div></section></div>`;
  }

  function draw(root) {
    if (!cached) return;
    const util = window.ClustrUtil;
    const esc = util.escapeHtml;
    const model = modelFor(state.mode);
    const query = state.search.trim().toLowerCase();
    root.querySelector('#atlasScope').textContent = `${model.columns.length} ${state.mode === 'days' ? 'latest daily snapshots' : 'publish snapshots'} from ${model.publishCount} available publishes · ${model.dayCount} Oslo calendar days`;
    root.querySelectorAll('[data-atlas-mode], [data-atlas-entity]').forEach(button => {
      const active = button.dataset.atlasMode === state.mode || button.dataset.atlasEntity === state.entity;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    root.querySelector('#atlasSearchLabel').firstChild.textContent = state.entity === 'stocks' ? 'Find stock ' : 'Find theme or default stock ';
    if (state.entity === 'stocks') { drawStocks(root, model, query); return; }
    stockView = null;
    const themes = model.themes.filter(theme => !query || theme.name.toLowerCase().includes(query) || theme.entries.some(entry =>
      (entry?.group.fixed_stocks || entry?.group.default_stocks || []).some(stock => String(stock.symbol || '').toLowerCase().includes(query))));
    const selected = themes.flatMap(theme => theme.entries.map((entry, index) => entry ? { theme, entry, index } : null).filter(Boolean))
      .find(item => `${item.entry.publish.id}|${item.theme.name}` === state.selected)
      || (() => { const theme = themes[0]; if (!theme) return null; const index = theme.entries.findLastIndex(Boolean); return { theme, entry: theme.entries[index], index }; })();
    if (selected) state.selected = `${selected.entry.publish.id}|${selected.theme.name}`;
    root.querySelector('#atlasStats').innerHTML = `<span><strong>${model.themes.length}</strong> themes shown · ${model.themeCount} available</span><span><strong>${model.storyCount}</strong> distinct stories</span><span><strong>${model.publishCount}</strong> reports</span>`;
    root.querySelector('#atlasLegendText').textContent = 'Cell number = impact score · smaller number = distinct stories';
    const matrix = root.querySelector('#atlasMatrix');
    matrix.classList.remove('atlas-matrix--stocks');
    const previousScroll = matrix.scrollLeft;
    const hadTable = !!matrix.querySelector('table');
    matrix.innerHTML = themes.length ? `<table class="atlas-table"><thead><tr><th scope="col">Cluster</th>${model.columns.map(publish => `<th scope="col" title="${esc(new Date(publish.created_at).toLocaleString('en', { timeZone: 'Europe/Oslo' }))}"><span>${dayOf(publish.created_at).slice(5)}</span>${state.mode === 'publishes' ? `<small>${osloTime.format(new Date(publish.created_at))}</small>` : ''}</th>`).join('')}</tr></thead><tbody>${themes.map(theme => `<tr><th scope="row"><span>${esc(theme.name)}</span><small>${theme.count} ${state.mode === 'days' ? 'days' : 'reports'}</small></th>${theme.entries.map((entry, index) => entry ? `<td><button type="button" class="atlas-cell atlas-cell--${tone(entry.score)} ${selected?.theme.name === theme.name && selected.index === index ? 'is-selected' : ''}" style="--strength:${Math.round(10 + Math.abs(entry.score || 0) * 7)}%" data-atlas-theme="${esc(theme.name)}" data-atlas-index="${index}" aria-pressed="${selected?.theme.name === theme.name && selected.index === index}" aria-label="${esc(theme.name)}, ${esc(new Date(entry.publish.created_at).toLocaleString('en', { timeZone: 'Europe/Oslo' }))}, news impact ${scoreText(entry.score)}, ${entry.articles} distinct stories"><strong>${scoreText(entry.score)}</strong><small>${entry.articles} stories</small></button></td>` : '<td class="atlas-blank" aria-label="No cluster in this report">·</td>').join('')}</tr>`).join('')}</tbody></table>` : '<p class="atlas-note">No clusters match this search.</p>';
    matrix.scrollLeft = hadTable ? previousScroll : state.mode === 'publishes' ? matrix.scrollWidth : 0;
    const detail = root.querySelector('#atlasDetail');
    if (!selected) { detail.innerHTML = '<p class="atlas-note">Choose a cluster to inspect its history.</p>'; return; }
    const { theme, entry } = selected;
    const defaults = [...new Map((entry.group.fixed_stocks || entry.group.default_stocks || []).filter(stock => stock?.symbol).map(stock => [String(stock.symbol).toUpperCase(), stock])).values()];
    const signals = Array.isArray(entry.group.market_signals) ? entry.group.market_signals : [];
    const prior = theme.entries.slice(0, selected.index).filter(Boolean).at(-1);
    const change = prior?.score != null && entry.score != null ? entry.score - prior.score : null;
    detail.innerHTML = `<div class="atlas-detail-head"><div><p class="atlas-eyebrow">SELECTED SNAPSHOT</p><h2>${esc(theme.name)}</h2><p>${esc(new Date(entry.publish.created_at).toLocaleString('en', { timeZone: 'Europe/Oslo' }))} · ${esc(entry.publish.market || 'US')} · ${entry.articles} distinct stories from ${entry.sources.length} sources</p></div><div class="atlas-detail-score atlas-detail-score--${tone(entry.score)}"><strong>${scoreText(entry.score)}</strong><span>news impact${change == null ? '' : ` · ${change >= 0 ? '+' : ''}${change.toFixed(1)} vs prior snapshot`}</span></div></div><div class="atlas-detail-grid"><section class="atlas-detail-panel"><h3>Theme over time</h3>${lineChart(theme, model)}<p class="atlas-note">Scores describe rated news, not stock returns. One point per selected ${state.mode === 'days' ? 'daily latest report' : 'publish'}.</p></section><section class="atlas-detail-panel"><h3>Source breadth</h3><div class="atlas-tags">${entry.sources.length ? entry.sources.map(source => `<span>${esc(source)}</span>`).join('') : '<span>No source labels</span>'}</div></section><section class="atlas-detail-panel"><h3>Default stocks <small>cluster association</small></h3><div class="atlas-tags">${defaults.length ? defaults.map(stock => `<span>${esc(stock.symbol)}${stock.priceAtPublish != null && Number.isFinite(Number(stock.priceAtPublish)) ? ` · ${Number(stock.priceAtPublish).toFixed(2)}` : ''}</span>`).join('') : '<span>No defaults in this snapshot</span>'}</div></section><section class="atlas-detail-panel"><h3>External observations</h3>${signals.length ? `<div class="atlas-observations">${signals.map(signal => `<div><b>${esc(signal.source || 'Data')}</b><span>${esc(String(signal.metric || '').replace(/_/g, ' '))}: ${esc(Number.isFinite(Number(signal.value)) ? Number(signal.value).toLocaleString('en', { maximumFractionDigits: 2 }) : String(signal.value || '—'))} ${esc(signal.unit || '')}</span><small>${esc(String(signal.observed_at || '').slice(0, 10))}</small></div>`).join('')}</div>` : '<p class="atlas-note">No external observation attached to this snapshot.</p>'}</section></div>`;
  }

  async function render(root) {
    if (!root) return;
    state.stockLimit = 10;
    if (!cached) {
      root.innerHTML = '<div class="atlas-loading" role="status">Loading approved publish history…</div>';
      const current = revision;
      if (!loading) loading = (async () => {
        const publishes = await window.ClustrApi.fetchAllPublishes();
        const groups = new Map(await Promise.all(publishes.map(async publish =>
          [String(publish.id), await window.ClustrApi.loadGroupsForPublish(publish)])));
        return { publishes, groups };
      })();
      try {
        const data = await loading;
        if (current !== revision) return;
        cached = data;
      } catch (error) {
        if (current === revision) root.innerHTML = `<p class="atlas-error" role="alert">Could not load Cluster Atlas: ${window.ClustrUtil.escapeHtml(error.message)}</p>`;
        loading = null;
        return;
      }
      loading = null;
    }
    root.innerHTML = `<div class="atlas-shell"><header class="atlas-head"><div><p class="atlas-eyebrow">CLUSTR / HISTORY</p><h1>Cluster Atlas</h1><p>See how news themes change across the publishes available to your account.</p></div><div id="atlasStats" class="atlas-stats"></div></header><div class="atlas-toolbar"><div class="atlas-switch" role="group" aria-label="Atlas rows"><button type="button" data-atlas-entity="clusters">Clusters</button><button type="button" data-atlas-entity="stocks">Stocks</button></div><div class="atlas-switch" role="group" aria-label="History granularity"><button type="button" data-atlas-mode="days">Latest each day</button><button type="button" data-atlas-mode="publishes">Every publish</button></div><label id="atlasSearchLabel">Find theme or default stock <input id="atlasSearch" type="search" placeholder="AI, energy, NVDA…" autocomplete="off" value="${window.ClustrUtil.escapeHtml(state.search)}"></label></div><p id="atlasScope" class="atlas-scope"></p><div class="atlas-legend"><span><i class="atlas-swatch atlas-swatch--down"></i> Negative news</span><span><i class="atlas-swatch atlas-swatch--flat"></i> Neutral</span><span><i class="atlas-swatch atlas-swatch--up"></i> Positive news</span><span id="atlasLegendText">Cell number = impact score · smaller number = distinct stories</span></div><div id="atlasMatrix" class="atlas-matrix" tabindex="0" aria-label="Scrollable news impact table"></div><section id="atlasDetail" class="atlas-detail" aria-live="polite"></section></div>`;
    root.querySelector('#atlasSearch').addEventListener('input', event => {
      state.search = event.target.value;
      state.stockLimit = 10;
      root.querySelector('#atlasMatrix').scrollTop = 0;
      draw(root);
    });
    root.querySelector('[aria-label="History granularity"]').addEventListener('click', event => {
      const button = event.target.closest('[data-atlas-mode]');
      if (!button) return;
      state.mode = button.dataset.atlasMode;
      state.selected = '';
      state.stockLimit = 10;
      root.querySelector('#atlasMatrix').scrollTop = 0;
      draw(root);
    });
    root.querySelector('[aria-label="Atlas rows"]').addEventListener('click', event => {
      const button = event.target.closest('[data-atlas-entity]');
      if (!button) return;
      state.entity = button.dataset.atlasEntity;
      state.selected = '';
      state.stockLimit = 10;
      root.querySelector('#atlasMatrix').scrollTop = 0;
      draw(root);
    });
    root.querySelector('#atlasMatrix').addEventListener('scroll', event => {
      const matrix = event.currentTarget;
      if (state.entity !== 'stocks' || !stockView || state.stockLimit >= stockView.rows.length) return;
      if (matrix.scrollHeight - matrix.scrollTop - matrix.clientHeight > 100) return;
      const next = stockView.rows.slice(state.stockLimit, state.stockLimit + 10);
      matrix.querySelector('tbody')?.insertAdjacentHTML('beforeend', next.map(row => stockRowHtml(row, stockView.selected, window.ClustrUtil.escapeHtml)).join(''));
      state.stockLimit += next.length;
      root.querySelector('#atlasStockCount').textContent = `${state.stockLimit} of ${stockView.rows.length}`;
    }, { passive: true });
    root.querySelector('#atlasMatrix').addEventListener('click', event => {
      const button = event.target.closest('[data-atlas-theme], [data-atlas-stock]');
      if (!button) return;
      const model = modelFor(state.mode);
      if (button.dataset.atlasStock) {
        const row = model.stocks.find(stock => stock.market + ':' + stock.symbol === button.dataset.atlasStock);
        const entry = row?.entries[Number(button.dataset.atlasIndex)];
        if (!entry) return;
        state.selected = `${entry.publish.id}|${button.dataset.atlasStock}`;
        draw(root);
        if (window.matchMedia('(max-width: 768px)').matches) root.querySelector('#atlasDetail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      const entry = model.themes.find(theme => theme.name === button.dataset.atlasTheme)?.entries[Number(button.dataset.atlasIndex)];
      if (!entry) return;
      state.selected = `${entry.publish.id}|${button.dataset.atlasTheme}`;
      draw(root);
      if (window.matchMedia('(max-width: 768px)').matches) root.querySelector('#atlasDetail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    draw(root);
  }

  function invalidate() { cached = null; loading = null; models = new Map(); stockView = null; revision++; }

  return { buildModel, pageStocks, render, invalidate };
});
