(function (root, factory) {
  const dashboard = factory();
  if (typeof module === 'object' && module.exports) module.exports = dashboard;
  else root.ClustrDashboard = dashboard;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  let cached = null;
  let loading = null;
  let revision = 0;
  let market = 'US';

  function scoreText(score) {
    return score == null ? '—' : `${score > 0 ? '+' : ''}${Number.isInteger(score) ? score : score.toFixed(1)}`;
  }

  function tone(score) {
    return score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral';
  }

  function buildSummary(publishes, groups, selectedMarket, util, atlas) {
    const scoped = publishes.filter(publish => String(publish.market || 'US').toUpperCase() === selectedMarket);
    const model = atlas.buildModel(scoped, groups, 'days', util);
    const latest = model.columns.at(-1);
    if (!latest) return null;
    const index = model.columns.length - 1;
    const latestGroups = groups.get(String(latest.id)) || [];
    const currentThemes = model.themes.filter(theme => theme.entries[index]).map(theme => {
      const entry = theme.entries[index];
      const prior = theme.entries.slice(0, index).filter(Boolean).at(-1);
      return { name: theme.name, score: entry.score, articles: entry.articles, sources: entry.sources.length,
        delta: prior?.score != null && entry.score != null ? Number((entry.score - prior.score).toFixed(1)) : null };
    });
    const days = model.columns.slice(-7).map(publish => {
      const dayIndex = model.columns.indexOf(publish);
      const scored = model.themes.map(theme => theme.entries[dayIndex]?.score).filter(score => score != null);
      return { date: publish.created_at, positive: scored.filter(score => score > 0).length,
        negative: scored.filter(score => score < 0).length, neutral: scored.filter(score => score === 0).length };
    });
    const stories = new Map();
    for (const group of latestGroups) for (const article of group.articles || []) {
      const key = String(article.link || article.url || [article.source, article.title, article.date || article.published_at].join('|'));
      if (!stories.has(key)) stories.set(key, article);
    }
    const sources = new Map();
    let rated = 0;
    for (const article of stories.values()) {
      const source = String(article.source || '').trim();
      if (source) sources.set(source, (sources.get(source) || 0) + 1);
      const score = article.rating ?? article.score;
      if (score != null && String(score).trim() !== '' && Number.isFinite(Number(score)) && Math.abs(Number(score)) <= 10) rated++;
    }
    const stocks = model.stocks.filter(stock => stock.entries[index]).map(stock => ({
      symbol: stock.symbol, market: stock.market, company: stock.company,
      score: stock.entries[index].score, clusters: stock.entries[index].links.length
    })).sort((a, b) => Math.abs(b.score || 0) - Math.abs(a.score || 0) || b.clusters - a.clusters || a.symbol.localeCompare(b.symbol));
    return {
      latest, reports: model.publishCount, days, themes: currentThemes,
      rankedThemes: currentThemes.filter(theme => theme.score != null).sort((a, b) => Math.abs(b.score) - Math.abs(a.score) || b.articles - a.articles).slice(0, 6),
      shifts: currentThemes.filter(theme => theme.delta != null).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 5),
      stocks, stories: stories.size, rated, sourceCount: sources.size,
      sources: [...sources].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5)
    };
  }

  function paint(root, summary) {
    const esc = window.ClustrUtil.escapeHtml;
    const buttons = `<div class="dash-market" role="group" aria-label="Dashboard market"><button type="button" data-dash-market="US" aria-pressed="${market === 'US'}" class="${market === 'US' ? 'is-active' : ''}">United States</button><button type="button" data-dash-market="NO" aria-pressed="${market === 'NO'}" class="${market === 'NO' ? 'is-active' : ''}">Norway</button></div>`;
    if (!summary) {
      root.innerHTML = `<div class="dash-shell"><header class="dash-header"><div><p class="dash-kicker">CLUSTR / OVERVIEW</p><h1>Dashboard</h1></div>${buttons}</header><div class="dash-empty">No approved ${esc(market)} publishes are available yet.</div></div>`;
      return;
    }
    const date = new Date(summary.latest.created_at).toLocaleString('en', { timeZone: 'Europe/Oslo', dateStyle: 'medium', timeStyle: 'short' });
    const maxDaily = Math.max(1, ...summary.days.map(day => day.positive + day.negative));
    const latestDay = summary.days.at(-1);
    const metric = (label, value, note) => `<div class="dash-metric"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`;
    const clusterRow = theme => `<div class="dash-list-row"><span class="dash-score dash-score--${tone(theme.score)}">${scoreText(theme.score)}</span><div><strong>${esc(theme.name)}</strong><small>${theme.articles} stories · ${theme.sources} sources</small></div><span class="dash-delta">${theme.delta == null ? 'New' : `${theme.delta > 0 ? '+' : ''}${theme.delta} shift`}</span></div>`;
    root.innerHTML = `<div class="dash-shell"><header class="dash-header"><div><p class="dash-kicker">CLUSTR / OVERVIEW</p><h1>Dashboard</h1><p>Latest approved ${esc(market)} report · ${esc(date)} · ${summary.reports} reports in history</p></div>${buttons}</header>
      <div class="dash-metrics">${metric('Clusters in latest report', summary.themes.length, `${latestDay.positive} positive · ${latestDay.negative} negative`)}${metric('Distinct stories', summary.stories, `${summary.rated} rated on −10 to +10`)}${metric('Stocks connected', summary.stocks.length, 'Linked to latest clusters')}${metric('News sources', summary.sourceCount, 'In the latest report')}</div>
      <div class="dash-grid"><section class="dash-panel dash-panel--wide"><div class="dash-panel-head"><div><p class="dash-kicker">TREND</p><h2>News balance</h2></div><span>Latest report per Oslo day · up to 7 days</span></div><div class="dash-balance">${summary.days.map(day => {
        const total = day.positive + day.negative;
        const positive = day.positive / maxDaily * 100;
        const negative = day.negative / maxDaily * 100;
        return `<div class="dash-day"><time>${esc(new Date(day.date).toLocaleDateString('en', { timeZone: 'Europe/Oslo', month: 'short', day: 'numeric' }))}</time><div class="dash-bar" role="img" aria-label="${day.positive} positive, ${day.negative} negative, ${day.neutral} neutral clusters"><span class="dash-bar-up" style="width:${positive}%"></span><span class="dash-bar-down" style="width:${negative}%"></span></div><b>${day.positive} <i>↑</i> / ${day.negative} <i>↓</i></b></div>`;
      }).join('')}</div><p class="dash-footnote">Counts show cluster news direction, not price performance. Neutral clusters are excluded from the bars.</p></section>
      <section class="dash-panel"><div class="dash-panel-head"><div><p class="dash-kicker">COVERAGE</p><h2>Where the stories came from</h2></div></div><div class="dash-sources">${summary.sources.length ? summary.sources.map(([source, count]) => `<div><span>${esc(source)}</span><strong>${count}</strong></div>`).join('') : '<p class="dash-footnote">No source labels in this report.</p>'}</div><p class="dash-footnote">Distinct stories, counted once per source in the latest report.</p></section>
      <section class="dash-panel"><div class="dash-panel-head"><div><p class="dash-kicker">LATEST REPORT</p><h2>Strongest cluster impact</h2></div><button type="button" data-dash-nav="events">All events →</button></div><div class="dash-list">${summary.rankedThemes.length ? summary.rankedThemes.map(clusterRow).join('') : '<p class="dash-footnote">No scored clusters in this report.</p>'}</div></section>
      <section class="dash-panel"><div class="dash-panel-head"><div><p class="dash-kicker">STOCK LINKS</p><h2>Stocks in the story</h2></div><button type="button" data-dash-nav="stocks">Open stocks →</button></div><div class="dash-list">${summary.stocks.length ? summary.stocks.slice(0, 7).map(stock => `<div class="dash-list-row"><span class="dash-ticker">${esc(stock.symbol)}</span><div><strong>${esc(stock.company)}</strong><small>${stock.clusters} linked clusters</small></div><span class="dash-score dash-score--${tone(stock.score)}">${scoreText(stock.score)}</span></div>`).join('') : '<p class="dash-footnote">No resolved stock links in this report.</p>'}</div><p class="dash-footnote">Scores combine linked cluster news. They are not stock returns.</p></section>
      <section class="dash-panel dash-panel--wide"><div class="dash-panel-head"><div><p class="dash-kicker">CHANGE</p><h2>Largest shifts since prior appearance</h2></div><button type="button" data-dash-nav="atlas">Explore history →</button></div><div class="dash-shifts">${summary.shifts.length ? summary.shifts.map(clusterRow).join('') : '<p class="dash-footnote">More report history is needed to compare cluster scores.</p>'}</div></section></div></div>`;
  }

  async function render(root, onNavigate) {
    if (!root) return;
    if (!cached) {
      root.innerHTML = '<div class="dash-loading" role="status">Loading dashboard from approved publishes…</div>';
      const current = revision;
      if (!loading) loading = (async () => {
        const publishes = await window.ClustrApi.fetchAllPublishes();
        const groups = new Map(await Promise.all(publishes.map(async publish => [String(publish.id), await window.ClustrApi.loadGroupsForPublish(publish)])));
        return { publishes, groups };
      })();
      try {
        const result = await loading;
        if (current !== revision) return;
        cached = result;
      } catch (error) {
        if (current === revision) root.innerHTML = `<p class="dash-error" role="alert">Could not load dashboard: ${window.ClustrUtil.escapeHtml(error.message)}</p>`;
        loading = null;
        return;
      }
      loading = null;
    }
    const summary = buildSummary(cached.publishes, cached.groups, market, window.ClustrUtil, window.ClustrAtlas);
    paint(root, summary);
    root.onclick = event => {
      const marketButton = event.target.closest('[data-dash-market]');
      if (marketButton) { market = marketButton.dataset.dashMarket; paint(root, buildSummary(cached.publishes, cached.groups, market, window.ClustrUtil, window.ClustrAtlas)); return; }
      const navButton = event.target.closest('[data-dash-nav]');
      if (navButton) onNavigate(navButton.dataset.dashNav);
    };
  }

  function invalidate() { cached = null; loading = null; revision++; }

  return { buildSummary, render, invalidate };
});
