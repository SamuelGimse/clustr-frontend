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

  function linearTrend(days) {
    const points = days.filter(day => day.meanScore != null).map(day => ({ x: Date.parse(day.date) / 86400000, y: day.meanScore }));
    if (points.length < 3) return null;
    const start = points[0].x;
    const meanX = points.reduce((sum, point) => sum + point.x - start, 0) / points.length;
    const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    const spread = points.reduce((sum, point) => sum + (point.x - start - meanX) ** 2, 0);
    if (!spread) return null;
    const slope = points.reduce((sum, point) => sum + (point.x - start - meanX) * (point.y - meanY), 0) / spread;
    const intercept = meanY - slope * meanX;
    const residual = points.reduce((sum, point) => sum + (point.y - intercept - slope * (point.x - start)) ** 2, 0);
    const total = points.reduce((sum, point) => sum + (point.y - meanY) ** 2, 0);
    return { slope, r2: total ? Math.max(0, 1 - residual / total) : 1, count: points.length,
      first: intercept, last: intercept + slope * (points.at(-1).x - start) };
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
    const days = model.columns.slice(-14).map(publish => {
      const dayIndex = model.columns.indexOf(publish);
      const scored = model.themes.map(theme => theme.entries[dayIndex]?.score).filter(score => score != null);
      const dailyStories = new Map();
      for (const group of groups.get(String(publish.id)) || []) for (const article of group.articles || []) {
        const key = String(article.link || article.url || [article.source, article.title, article.date || article.published_at].join('|'));
        if (!dailyStories.has(key)) dailyStories.set(key, article);
      }
      return { date: publish.created_at, positive: scored.filter(score => score > 0).length,
        negative: scored.filter(score => score < 0).length, neutral: scored.filter(score => score === 0).length,
        meanScore: scored.length ? scored.reduce((sum, score) => sum + score, 0) / scored.length : null,
        stories: dailyStories.size, sources: new Set([...dailyStories.values()].map(article => String(article.source || '').trim()).filter(Boolean)).size };
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
      latest, reports: model.publishCount, days, trend: linearTrend(days), themes: currentThemes,
      distribution: [
        ['−10 to −6', currentThemes.filter(theme => theme.score <= -6).length],
        ['−5.9 to −1.1', currentThemes.filter(theme => theme.score < -1 && theme.score > -6).length],
        ['−1 to +1', currentThemes.filter(theme => theme.score != null && Math.abs(theme.score) <= 1).length],
        ['+1.1 to +5.9', currentThemes.filter(theme => theme.score > 1 && theme.score < 6).length],
        ['+6 to +10', currentThemes.filter(theme => theme.score >= 6).length]
      ],
      rankedThemes: currentThemes.filter(theme => theme.score != null).sort((a, b) => Math.abs(b.score) - Math.abs(a.score) || b.articles - a.articles).slice(0, 6),
      shifts: currentThemes.filter(theme => theme.delta != null).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 5),
      stocks, stories: stories.size, rated, sourceCount: sources.size,
      sources: [...sources].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5)
    };
  }

  function impactChart(summary, esc) {
    const days = summary.days;
    const scored = days.filter(day => day.meanScore != null);
    if (!scored.length) return '<p class="dash-footnote">No scored days available for an impact trend.</p>';
    const firstTime = Date.parse(days[0].date);
    const span = Math.max(1, Date.parse(days.at(-1).date) - firstTime);
    const x = day => 48 + (Date.parse(day.date) - firstTime) / span * 714;
    const y = score => 220 - (Math.max(-10, Math.min(10, score)) + 10) * 9;
    const path = scored.map((day, index) => `${index ? 'L' : 'M'}${x(day).toFixed(1)} ${y(day.meanScore).toFixed(1)}`).join(' ');
    const fitted = summary.trend ? `<path d="M${x(scored[0]).toFixed(1)} ${y(summary.trend.first).toFixed(1)} L${x(scored.at(-1)).toFixed(1)} ${y(summary.trend.last).toFixed(1)}" class="dash-fit"/>` : '';
    const labels = days.filter((day, index) => index === 0 || index === days.length - 1 || index % 3 === 0)
      .map(day => `<text x="${x(day).toFixed(1)}" y="248" text-anchor="middle">${esc(new Date(day.date).toLocaleDateString('en', { timeZone: 'Europe/Oslo', month: 'short', day: 'numeric' }))}</text>`).join('');
    return `<svg class="dash-impact-chart" viewBox="0 0 810 260" role="img" aria-label="Mean cluster news score over ${scored.length} report days with ${summary.trend ? 'a linear regression line' : 'no fitted line'}">${[-10, -5, 0, 5, 10].map(score => `<line x1="48" x2="762" y1="${y(score)}" y2="${y(score)}" class="dash-gridline"/><text x="8" y="${y(score) + 4}">${score > 0 ? '+' : ''}${score}</text>`).join('')}${fitted}<path d="${path}" class="dash-observed"/>${scored.map(day => `<circle cx="${x(day).toFixed(1)}" cy="${y(day.meanScore).toFixed(1)}" r="5" class="dash-observed-dot"><title>${esc(new Date(day.date).toLocaleDateString('en', { timeZone: 'Europe/Oslo' }))}: ${scoreText(day.meanScore)} mean cluster score</title></circle>`).join('')}${labels}</svg>`;
  }

  function coverageChart(days, esc) {
    const max = Math.max(1, ...days.map(day => day.stories));
    return `<div class="dash-coverage-key"><span><i class="dash-key-stories"></i> Stories</span><span><i class="dash-key-sources"></i> Sources</span></div><div class="dash-coverage-chart" role="img" aria-label="Distinct stories and sources by report day">${days.map(day => `<div class="dash-coverage-day" title="${day.stories} stories from ${day.sources} sources"><div class="dash-coverage-bars"><i class="dash-story-bar" style="height:${Math.max(3, day.stories / max * 100)}%"></i><i class="dash-source-bar" style="height:${Math.max(3, day.sources / max * 100)}%"></i></div><small>${esc(new Date(day.date).toLocaleDateString('en', { timeZone: 'Europe/Oslo', month: 'numeric', day: 'numeric' }))}</small></div>`).join('')}</div>`;
  }

  function distributionChart(distribution, esc) {
    const max = Math.max(1, ...distribution.map(([, count]) => count));
    return `<div class="dash-distribution">${distribution.map(([label, count], index) => `<div><span>${esc(label)}</span><i class="dash-distribution-track"><b class="dash-distribution-bar dash-distribution-bar--${index < 2 ? 'negative' : index > 2 ? 'positive' : 'neutral'}" style="width:${count / max * 100}%"></b></i><strong>${count}</strong></div>`).join('')}</div>`;
  }

  function trendPanel(summary, esc) {
    const trend = summary.trend;
    const direction = !trend || Math.abs(trend.slope) < 0.1 ? 'Flat' : trend.slope > 0 ? 'Rising' : 'Falling';
    return `<section class="dash-panel dash-panel--wide dash-trend-panel"><div class="dash-panel-head"><div><p class="dash-kicker">CLUSTER TREND</p><h2>Mean news impact by report day</h2></div><span>Latest approved report per Oslo day</span></div><div class="dash-trend-layout"><div>${impactChart(summary, esc)}<div class="dash-chart-key"><span><i class="dash-key-observed"></i> Daily mean</span>${trend ? '<span><i class="dash-key-fit"></i> Linear fit</span>' : ''}</div></div><div class="dash-trend-readout"><p class="dash-kicker">ANALYSIS</p><strong class="dash-direction dash-direction--${direction.toLowerCase()}">${direction}</strong><span>${trend ? `${trend.slope >= 0 ? '+' : ''}${trend.slope.toFixed(2)} score points per day` : 'At least 3 scored days needed'}</span>${trend ? `<div><b>R² ${trend.r2.toFixed(2)}</b><small>Fit across ${trend.count} report days</small></div>` : ''}<p>Regression describes recorded cluster scores. It does not predict stock prices.</p></div></div></section>`;
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
      <div class="dash-grid">${trendPanel(summary, esc)}<section class="dash-panel"><div class="dash-panel-head"><div><p class="dash-kicker">DIRECTION</p><h2>News balance</h2></div><span>Latest report per Oslo day · up to 14 days</span></div><div class="dash-balance">${summary.days.map(day => {
        const total = day.positive + day.negative;
        const positive = day.positive / maxDaily * 100;
        const negative = day.negative / maxDaily * 100;
        return `<div class="dash-day"><time>${esc(new Date(day.date).toLocaleDateString('en', { timeZone: 'Europe/Oslo', month: 'short', day: 'numeric' }))}</time><div class="dash-bar" role="img" aria-label="${day.positive} positive, ${day.negative} negative, ${day.neutral} neutral clusters"><span class="dash-bar-up" style="width:${positive}%"></span><span class="dash-bar-down" style="width:${negative}%"></span></div><b>${day.positive} <i>↑</i> / ${day.negative} <i>↓</i></b></div>`;
      }).join('')}</div><p class="dash-footnote">Counts show cluster news direction, not price performance. Neutral clusters are excluded from the bars.</p></section>
      <section class="dash-panel"><div class="dash-panel-head"><div><p class="dash-kicker">COVERAGE TREND</p><h2>Stories and sources over time</h2></div></div>${coverageChart(summary.days, esc)}<p class="dash-footnote">Counts use distinct stories in each daily latest report. Both bars share a count scale.</p></section>
      <section class="dash-panel"><div class="dash-panel-head"><div><p class="dash-kicker">COVERAGE</p><h2>Where the stories came from</h2></div></div><div class="dash-sources">${summary.sources.length ? summary.sources.map(([source, count]) => `<div><span>${esc(source)}</span><strong>${count}</strong></div>`).join('') : '<p class="dash-footnote">No source labels in this report.</p>'}</div><p class="dash-footnote">Distinct stories, counted once per source in the latest report.</p></section>
      <section class="dash-panel"><div class="dash-panel-head"><div><p class="dash-kicker">SCORE SPREAD</p><h2>Latest impact distribution</h2></div></div>${distributionChart(summary.distribution, esc)}<p class="dash-footnote">Number of latest-report clusters in each news-impact band.</p></section>
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

  return { buildSummary, linearTrend, render, invalidate };
});
