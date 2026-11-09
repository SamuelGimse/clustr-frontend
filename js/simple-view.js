(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ClustrSimple = api;
})(typeof window === 'undefined' ? globalThis : window, function (win) {
  let revision = 0;
  const choices = {};
  const titles = { dashboard: ['The market, at a glance.', 'Overview'], events: ['What matters today.', 'News'], stocks: ['The companies behind the news.', 'Stocks'], connections: ['Follow the connections.', 'Network'], map: ['Where the stories unfold.', 'World'], weekly: ['See the week take shape.', 'Trends'], atlas: ['A little more perspective.', 'History'], days: ['Every report. One timeline.', 'Reports'], watchlist: ['Keep your companies close.', 'Watchlist'] };
  const esc = value => win.ClustrUtil.escapeHtml(String(value ?? ''));
  const score = group => win.ClustrUtil.articleImpactScore(group.articles || []) ?? win.ClustrUtil.numericStance(group.stance_score ?? group.cluster_score);
  const fmt = value => value == null || !Number.isFinite(Number(value)) ? '—' : `${Number(value) > 0 ? '+' : ''}${Number(Number(value).toFixed(1))}`;
  const tone = value => value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
  const day = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(value));
  const date = value => new Date(value).toLocaleDateString('en', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
  function historyPoints(reports, name, cutoff) {
    const days = new Map();
    for (const report of [...reports].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))) {
      if (report.market !== 'US' || Date.parse(report.created_at) > cutoff) continue;
      const group = (report.groups_json || []).find(group => group.name === name);
      days.set(day(report.created_at), { date: report.created_at, value: group ? score(group) : null });
    }
    return [...days.values()];
  }
  function chart(points, label) {
    if (!points.some(point => point.value != null)) return '<p class="simple-empty">No scored history available yet.</p>';
    const width = 760, height = 240, left = 40, right = 735, top = 24, bottom = 200;
    const duration = Date.parse(points.at(-1).date) - Date.parse(points[0].date);
    const x = i => !duration ? (left + right) / 2 : left + (Date.parse(points[i].date) - Date.parse(points[0].date)) * (right - left) / duration;
    const y = value => top + (10 - value) / 20 * (bottom - top);
    let path = '', previous = false;
    points.forEach((point, i) => { if (point.value == null) { previous = false; return; } path += `${previous ? 'L' : 'M'}${x(i).toFixed(1)},${y(point.value).toFixed(1)} `; previous = true; });
    return `<svg class="simple-line" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}: daily news impact from minus ten to plus ten">${[-10, 0, 10].map(v => `<line x1="${left}" x2="${right}" y1="${y(v)}" y2="${y(v)}"/><text x="29" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`).join('')}<path d="${path}"/>${points.map((point, i) => point.value == null ? '' : `<circle class="simple-${tone(point.value)}" cx="${x(i)}" cy="${y(point.value)}" r="4"><title>${esc(date(point.date))}: ${fmt(point.value)}</title></circle>`).join('')}<text x="${left}" y="230">${esc(date(points[0].date))}</text><text x="${right}" y="230" text-anchor="end">${esc(date(points.at(-1).date))}</text></svg>`;
  }
  function bars(groups) {
    return `<div class="simple-bars">${groups.map(group => { const value = score(group); return `<div class="simple-bar-row"><span>${esc(group.name)}</span><div class="simple-bar-track"><i class="simple-${tone(value)}" style="--value:${Math.abs(value || 0) / 10 * 50}%;--start:${value < 0 ? 50 - Math.abs(value) / 10 * 50 : 50}%"></i></div><strong class="simple-${tone(value)}">${fmt(value)}</strong></div>`; }).join('')}</div><p class="simple-note">News impact · −10 to +10. This is not a stock return.</p>`;
  }
  function stories(groups) {
    const unique = new Map();
    groups.forEach(group => (group.articles || []).forEach(article => { const key = article.link || article.url || article.title; if (key && !unique.has(key)) unique.set(key, { ...article, cluster: group.name }); }));
    return [...unique.values()];
  }
  function storyRows(articles) {
    return articles.map(article => { const url = win.ClustrConnections.safeUrl(article.link || article.url); return `<article class="simple-story"><div><span class="simple-eyebrow">${esc(article.source || article.cluster || 'Report story')}</span><h3>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(article.title)} ↗</a>` : esc(article.title)}</h3>${article.short_summary ? `<p>${esc(article.short_summary)}</p>` : ''}</div><span class="simple-story-score simple-${tone(Number(article.rating ?? article.score))}" aria-label="News rating">${fmt(article.rating == null && article.score == null ? null : Number(article.rating ?? article.score))}</span></article>`; }).join('') || '<p class="simple-empty">No stories in this selection.</p>';
  }
  function section(kicker, title, content, extra = '') { return `<section class="simple-section"><div class="simple-section-head"><div><p class="simple-eyebrow">${kicker}</p><h2>${title}</h2></div>${extra}</div>${content}</section>`; }
  async function render(view) {
    const host = win.document.getElementById('simpleView');
    if (!host || !titles[view] || win.document.documentElement.dataset.viewMode !== 'simple') return;
    const token = ++revision, app = win.ClustrApp, util = win.ClustrUtil;
    if (!app) return;
    const publishes = app.getPublishes(), publish = publishes[app.getPublishIndex()];
    const groups = app.getGroups(), allStories = stories(groups);
    const graph = win.ClustrConnections.buildGraph(groups, publish?.market || 'US');
    const stocks = graph.nodes.filter(node => node.type === 'stock');
    const ranked = [...groups].sort((a, b) => Math.abs(score(b) || 0) - Math.abs(score(a) || 0));
    const selected = choices[view] || ranked[0]?.name;
    const group = groups.find(item => item.name === selected) || ranked[0];
    host.hidden = false;
    host.innerHTML = `<div class="simple-shell"><header class="simple-hero"><p class="simple-eyebrow">CLUSTR MARKET / ${titles[view][1].toUpperCase()}</p><h1>${titles[view][0]}</h1><p>${publish ? `${esc(date(publish.created_at))} · US report` : 'Your market research, made clear.'}</p></header><div class="simple-content" aria-live="polite"></div></div>`;
    const body = host.querySelector('.simple-content');
    const picker = (items, key = 'name') => `<label class="simple-select-label">Explore <select data-simple-choice>${items.map(item => `<option value="${esc(item[key])}"${item[key] === selected ? ' selected' : ''}>${esc(item[key])}</option>`).join('')}</select></label>`;
    const trend = (reports, target = group, limit = 14) => section('THE BIGGER PICTURE', esc(target?.name || 'News impact'), chart(historyPoints(reports, target?.name, Date.parse(publish?.created_at)).filter(point => view !== 'weekly' || Date.parse(point.date) > Date.parse(publish?.created_at) - 7 * 86400000).slice(-limit), target?.name || 'News impact') + '<p class="simple-note">Daily cluster news impact. Latest report per US day; gaps are missing scores. No price forecast.</p>', picker(ranked));
    body.innerHTML = '<p class="simple-empty">Preparing your view…</p>';
    host.onchange = event => { if (event.target.matches('[data-simple-choice]')) { choices[view] = event.target.value; render(view); } };
    host.oninput = event => { if (event.target.matches('[data-simple-search]')) { const query = event.target.value.toLowerCase(); host.querySelectorAll('[data-simple-stock]').forEach(button => { button.hidden = !button.textContent.toLowerCase().includes(query); }); } };
    host.onclick = event => {
      const target = event.target.closest('[data-simple-stock],[data-simple-place],[data-simple-report],[data-simple-retry],[data-simple-company]');
      if (!target) return;
      if (target.dataset.simpleCompany) { choices.stocks = target.dataset.simpleCompany; app.showView('stocks'); return; }
      if (target.hasAttribute('data-simple-report')) { app.stepPublish(Number(target.dataset.simpleReport) - app.getPublishIndex()); app.showView('events'); }
      else { if (target.dataset.simpleStock || target.dataset.simplePlace) choices[view] = target.dataset.simpleStock || target.dataset.simplePlace; render(view); }
    };
    try {
      if (view === 'events') {
        const linked = win.ClustrConnections.buildGraph(group ? [group] : [], 'US').nodes.filter(node => node.type === 'stock');
        body.innerHTML = section('IN THIS REPORT', 'The stories moving the conversation.', bars(ranked.slice(0, 6))) + section('READ THE NEWS', esc(group?.name || 'Stories'), `<p class="simple-intro">${esc(group?.reason || group?.summary || '')}</p><div class="simple-company-links">${linked.slice(0, 8).map(stock => `<button type="button" data-simple-company="${esc(stock.label)}">${esc(stock.label)} ↗</button>`).join('')}</div>${storyRows(group?.articles || [])}`, picker(ranked));
      } else if (view === 'stocks' || view === 'watchlist') {
        const saved = win.ClustrWatchlist.getItems();
        const items = view === 'watchlist' ? saved.map(item => stocks.find(stock => stock.label === item.symbol) || { label: item.symbol, name: item.name, id: `stock:US:${item.symbol}` }) : stocks;
        const chosen = items.find(stock => stock.label === choices[view]) || items[0];
        body.innerHTML = `<div class="simple-stock-browser"><label>Find a company<input type="search" data-simple-search placeholder="Ticker or company name"></label><div class="simple-stock-list">${items.map(stock => `<button type="button" data-simple-stock="${esc(stock.label)}" aria-pressed="${stock === chosen}"><strong>${esc(stock.label)}</strong><span>${esc(stock.name)}</span></button>`).join('') || '<p class="simple-empty">No stocks here yet. Save a company to your watchlist from Stocks.</p>'}</div></div>${chosen ? section('COMPANY SNAPSHOT', `${esc(chosen.label)} <span class="simple-company">${esc(chosen.name)}</span>`, `<div class="simple-price" data-simple-price>Loading latest price…</div>${win.ClustrWatchlist.button({symbol: chosen.label, name: chosen.name}, 'US')}<div class="simple-linked"></div>`) : ''}`;
        if (chosen) {
          const linkedIds = new Set(graph.edges.filter(edge => edge.to === chosen.id).map(edge => edge.from));
          const linked = graph.nodes.filter(node => linkedIds.has(node.id) && node.type === 'cluster').map(node => node.group);
          body.querySelector('.simple-linked').innerHTML = `<h3>In the news</h3>${bars(linked)}<p class="simple-note">These are saved cluster relationships; each story may not mention this company.</p>${storyRows(stories(linked).slice(0, 5))}`;
          const quotes = await win.ClustrQuotes.getLatestQuotes([chosen.label], 'US');
          if (token !== revision) return;
          const quote = quotes[chosen.label];
          body.querySelector('[data-simple-price]').innerHTML = quote ? `<strong>${esc(new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(quote.price))}</strong><span class="simple-${tone(quote.changePercent)}">${quote.changePercent == null ? '—' : `${quote.changePercent > 0 ? '+' : ''}${quote.changePercent.toFixed(2)}%`} <small>last session vs previous close</small></span><p class="simple-note">Latest available regular-session quote · ${esc(new Date(quote.asOf).toLocaleString())} · may be delayed</p>` : '<p class="simple-note">Latest quote unavailable. Try again later.</p>';
        }
      } else if (view === 'connections') {
        const linkedGraph = win.ClustrConnections.buildGraph(group ? [group] : [], 'US');
        const nodes = linkedGraph.nodes.filter(node => node.type === 'stock').slice(0, 6);
        body.innerHTML = section('ONE STORY. MANY CONNECTIONS.', esc(group?.name || 'Connections'), `<div class="simple-network"><svg viewBox="0 0 760 260" role="img" aria-label="${esc(group?.name)} and ${nodes.length} linked stocks"><circle cx="380" cy="80" r="32"/><text x="380" y="85" text-anchor="middle">${fmt(group ? score(group) : null)}</text>${nodes.map((node, i) => {const x = 65 + i * 630 / Math.max(1, nodes.length - 1); return `<path d="M380 112 Q380 165 ${x} 200"/><circle cx="${x}" cy="200" r="5"/><text x="${x}" y="234" text-anchor="middle">${esc(node.label)}</text>`;}).join('')}</svg></div><p class="simple-intro">${esc(group?.reason || group?.summary || '')}</p><p class="simple-note">Saved cluster associations, including default sector exposure. Connections do not imply causation.</p>`, picker(ranked)) + section('THE EVIDENCE', 'Start with the stories.', storyRows(group?.articles || []));
      } else if (view === 'map') {
        const countries = new Map();
        allStories.forEach(article => { const country = article.primary_country || 'Global'; if (!countries.has(country)) countries.set(country, []); countries.get(country).push(article); });
        const places = [...countries].sort((a, b) => b[1].length - a[1].length), country = choices[view] || places[0]?.[0];
        body.innerHTML = section('NEWS AROUND THE WORLD', 'Where attention is gathering.', `<div class="simple-places">${places.map(([name, articles]) => `<button type="button" data-simple-place="${esc(name)}" aria-pressed="${name === country}"><span>${esc(name)}</span><i style="--share:${articles.length / Math.max(1, allStories.length) * 100}%"></i><strong>${articles.length}</strong></button>`).join('')}</div><p class="simple-note">Distinct stories by primary country. Counts describe coverage, not event severity.</p>`) + section('ON THE GROUND', esc(country || 'World'), storyRows(countries.get(country) || []));
      } else if (view === 'days') {
        body.innerHTML = section('YOUR ARCHIVE', 'Pick a day. Revisit the story.', `<div class="simple-report-list">${publishes.map((report, i) => `<button type="button" data-simple-report="${i}"><time>${esc(date(report.created_at))}</time><span>${esc(report.title || 'US market report')}</span><b aria-hidden="true">↗</b></button>`).join('')}</div>`);
      } else {
        const reports = await win.ClustrApi.fetchHistorySummaries();
        if (token !== revision) return;
        const scoped = reports.filter(report => report.market === 'US' && Date.parse(report.created_at) <= Date.parse(publish?.created_at));
        const filtered = win.ClustrWatchlist.filterGroupMap(new Map(scoped.map(report => [String(report.id), report.groups_json || []])), scoped);
        const history = scoped.map(report => ({...report, groups_json: filtered.get(String(report.id)) || []}));
        if (view === 'dashboard') body.innerHTML = `<div class="simple-metrics"><div><strong>${groups.length}</strong><span>connected themes</span></div><div><strong>${allStories.length}</strong><span>distinct stories</span></div><div><strong>${stocks.length}</strong><span>linked companies</span></div></div>${trend(history)}${section('TODAY’S SIGNAL', 'Which themes stand out?', bars(ranked.slice(0, 6)))}`;
        else body.innerHTML = trend(history, group, view === 'weekly' ? 7 : 30) + section('THE CURRENT PICTURE', 'Put the trend in context.', `<p class="simple-intro">${esc(group?.reason || group?.summary || '')}</p>${bars(ranked.slice(0, 6))}`);
      }
    } catch (error) { if (token === revision) body.innerHTML = `<p class="simple-empty" role="alert">Could not load this view. ${esc(error.message)}</p><button type="button" data-simple-retry>Try again</button>`; }
    if (token !== revision) return;

  }
  function hide() { revision++; const host = win.document.getElementById('simpleView'); if (host) host.hidden = true; }
  return { render, hide, historyPoints, chart };
});
