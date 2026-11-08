/**
 * @fileoverview Clustr public app shell — navigation, boot, publish load.
 */

(function () {
  const cfg = window.ClustrConfig || {};

  /** @type {Array<Object>} */
  let publishes = [];
  /** @type {number} */
  let publishIndex = 0;
  /** @type {Array<Object>} */
  let currentGroups = [];
  /** @type {Object.<string, Array<Object>>} */
  let groupsCache = {};
  /** @type {string} */
  let moversMode = 'active';
  let weeklyMode = 'clusters';
  let weeklyRenderId = 0;
  let weeklyTrendDays = [];
  let eventSort = 'impact';
  /** @type {string} */
  let view = 'events';

  const meta = document.getElementById('meta');
  const status = document.getElementById('status');
  const boot = document.getElementById('boot');
  const bootLog = document.getElementById('bootLog');

  const eventsView = document.getElementById('eventsView');
  const mapView = document.getElementById('mapView');
  const daysView = document.getElementById('daysView');
  const signalView = document.getElementById('signalView');
  const mindView = document.getElementById('mindView');
  const weeklyView = document.getElementById('weeklyView');
  const watchlistView = document.getElementById('watchlistView');
  const navWatchlist = document.getElementById('navWatchlist');
  const stocksView = document.getElementById('stocksView');
  const proFeatureView = document.getElementById('proFeatureView');
  const atlasView = document.getElementById('atlasView');
  const dashboardView = document.getElementById('dashboardView');
  const polymarketView = document.getElementById('polymarketView');
  const navPolymarket = document.getElementById('navPolymarket');
  const accountView = document.getElementById('accountView');
  const adminView = document.getElementById('adminView');

  const navEvents = document.getElementById('navEvents');
  const navStocks = document.getElementById('navStocks');
  const navMap = document.getElementById('navMap');
  const navDays = document.getElementById('navDays');
  const navSignal = document.getElementById('navSignal');
  const navMind = document.getElementById('navMind');
  const navWeekly = document.getElementById('navWeekly');
  const navAtlas = document.getElementById('navAtlas');
  const navDashboard = document.getElementById('navDashboard');
  const navAccount = document.getElementById('navAccount');
  const navAdmin = document.getElementById('navAdmin');
  let authState = { session: null, user: null, role: 'free', plan: null };
  let foundingStatus = null;
  let accountMode = 'signin';
  let accountPreview = '';
  let publishChart = null;

  function eventClusterScore(group) {
    const ratings = (group.articles || []);
    const articleScore = window.ClustrUtil.articleImpactScore(ratings);
    const storedScore = Number(group.stance_score ?? group.cluster_score ?? group.impact_score);
    return articleScore ?? (Number.isFinite(storedScore) ? storedScore : 0);
  }

  function sortEventClusters(groups) {
    return (groups || []).map((group, index) => ({ group, index })).sort((a, b) => {
      const aScore = eventClusterScore(a.group), bScore = eventClusterScore(b.group);
      let order = 0;
      if (eventSort === 'size') {
        const aCount = Number(a.group.count) || (a.group.articles || []).length;
        const bCount = Number(b.group.count) || (b.group.articles || []).length;
        order = bCount - aCount || Math.abs(bScore) - Math.abs(aScore);
      } else if (eventSort === 'positive') order = bScore - aScore;
      else if (eventSort === 'negative') order = aScore - bScore;
      else order = Math.abs(bScore) - Math.abs(aScore);
      return order || a.index - b.index;
    }).map(row => row.group);
  }

  /**
   * Update header meta + enable/disable publish arrows.
   * Publishes are newest-first: index 0 = latest.
   * Prev = older (higher index), Next = newer (lower index).
   * @returns {void}
   */
  function setMeta() {
    const p = publishes[publishIndex];
    const prevBtn = document.getElementById('prevPublishBtn');
    const nextBtn = document.getElementById('nextPublishBtn');

    if (!p) {
      if (meta) meta.textContent = '';
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      return;
    }

    const n = publishes.length;
    const pos = publishIndex + 1;
    if (meta) {
      const escape = window.ClustrUtil.escapeHtml;
      const date = new Date(p.created_at);
      const detail = `${currentGroups.length} clusters · ${pos}/${n}`;
      const desktop = `${p.title || 'Publish'} · ${date.toLocaleString()} · ${detail}`;
      const mobile = `${p.market || 'Publish'} · ${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · ${pos}/${n}`;
      meta.title = desktop;
      meta.innerHTML = `<span class="publish-meta-desktop">${escape(desktop)}</span><span class="publish-meta-mobile"><span>${escape(mobile)}</span><span>${escape(detail)}</span></span>`;
    }
    // Older = higher index
    if (prevBtn) prevBtn.disabled = publishIndex >= n - 1;
    // Newer = lower index
    if (nextBtn) nextBtn.disabled = publishIndex <= 0;
  }

  /**
   * Move to another publish by delta (-1 = newer, +1 = older).
   * @param {number} delta
   * @returns {Promise<void>}
   */
  async function stepPublish(delta) {
    const next = publishIndex + delta;
    if (next < 0 || next >= publishes.length) return;
    publishIndex = next;
    await paintCurrent();
    if (view !== 'events') setNav(view);
  }

  /**
   * Switch primary view.
   * @param {'events'|'map'|'days'|'signal'|'mind'|'admin'} which
   * @returns {void}
   */
  function scopedGroups(groups = currentGroups, market = publishes[publishIndex]?.market || 'US') {
    return window.ClustrWatchlist?.filterGroups(groups, market) || groups;
  }

  function setNav(which, context = null) {
    window.ClustrConnections?.hide();
    if (which === 'admin' && authState.role !== 'admin') which = 'account';
    closeEventSortMenu();
    const changed = which !== view;
    view = which;
    window.ClustrWatchlist?.setView(which);
    const R = window.ClustrRender;
    const MapApi = window.ClustrMap;

    [navWatchlist, navDashboard, navEvents, navStocks, navMap, navDays, navSignal, navMind, navWeekly, navAtlas, navAccount, navAdmin, navPolymarket].forEach(b => {
      if (b) {
        b.classList.remove('is-active');
        b.setAttribute('aria-current', 'false');
      }
    });

    if (polymarketView) polymarketView.classList.add('hidden');
    if (eventsView) eventsView.classList.add('hidden');
    if (mapView) mapView.classList.add('hidden');
    if (daysView) daysView.classList.add('hidden');
    if (signalView) signalView.classList.add('hidden');
    if (mindView) mindView.classList.add('hidden');
    if (weeklyView) weeklyView.classList.add('hidden');
    if (watchlistView) watchlistView.classList.add('hidden');
    if (stocksView) stocksView.classList.add('hidden');
    if (atlasView) atlasView.classList.add('hidden');
    if (dashboardView) dashboardView.classList.add('hidden');
    if (accountView) accountView.classList.add('hidden');
    if (adminView) adminView.classList.add('hidden');
    if (proFeatureView) proFeatureView.classList.add('hidden');
    if (which !== 'stocks') window.ClustrStocks?.leave();

    if (which !== 'watchlist' && which !== 'polymarket' && which !== 'atlas' && which !== 'dashboard' && which !== 'connections' && ['#/watchlist', '#/polymarket', '#/atlas', '#/dashboard', '#/connections'].includes(location.hash)) history.replaceState(null, '', location.pathname + location.search);
    if (['watchlist', 'atlas', 'stocks', 'weekly'].includes(which) && !hasProAccess()) {
      const host = proFeatureView;
      const nav = { watchlist: navWatchlist, atlas: navAtlas, stocks: navStocks, weekly: navWeekly }[which];
      nav?.classList.add('is-active');
      nav?.setAttribute('aria-current', 'page');
      host?.classList.remove('hidden');
      if (host) host.innerHTML = window.ClustrProPreview.render(which, !!authState.user);
      if (which === 'watchlist' || which === 'atlas') history.replaceState(null, '', `#/${which}`);
    } else if (which === 'connections') {
      history.replaceState(null, '', '#/connections');
      if (context?.publish) {
        const index=publishes.findIndex(publish=>String(publish.id)===String(context.publish.id));
        if(index>=0){publishIndex=index;currentGroups=context.reportGroups||currentGroups;setMeta();}
      }
      window.ClustrConnections?.mount(context?.reportGroups || currentGroups, context?.publish || publishes[publishIndex], context || false);
    } else if (which === 'dashboard') {
      history.replaceState(null, '', '#/dashboard');
      navDashboard?.classList.add('is-active');
      navDashboard?.setAttribute('aria-current', 'page');
      dashboardView?.classList.remove('hidden');
      window.ClustrDashboard?.render(dashboardView, setNav);
    } else if (which === 'polymarket') {
      navPolymarket?.classList.add('is-active');
      navPolymarket?.setAttribute('aria-current', 'page');
      polymarketView?.classList.remove('hidden');
      history.replaceState(null, '', '#/polymarket');
      window.ClustrPolymarket?.mount(document.getElementById('clustrPolymarket'));
    } else if (which === 'events') {
      if (navEvents) {
        navEvents.classList.add('is-active');
        navEvents.setAttribute('aria-current', 'page');
      }
      if (eventsView) eventsView.classList.remove('hidden');
      if (changed && R) { R.renderEvents(sortEventClusters(scopedGroups()), scopedGroups()); refreshMovers(); }
    } else if (which === 'map') {
      if (navMap) {
        navMap.classList.add('is-active');
        navMap.setAttribute('aria-current', 'page');
      }
      if (mapView) mapView.classList.remove('hidden');
      if (MapApi && R) {
        MapApi.render(scopedGroups(), {
          onCountry: country => {
            R.highlightCountryCard(country);
            R.renderCountryArticles(scopedGroups(), country);
          }
        });
        if (typeof MapApi.invalidate === 'function') {
          setTimeout(() => MapApi.invalidate(), 50);
        }
      }
    } else if (which === 'mind') {
      if (navMind) {
        navMind.classList.add('is-active');
        navMind.setAttribute('aria-current', 'page');
      }
      if (mindView) mindView.classList.remove('hidden');
      const Mind = window.ClustrMindmap;
      if (Mind) {
        const el = document.getElementById('mindmap');
        if (el) {
          Mind.render(scopedGroups(), el, {
            publishes: publishes,
            onSelect: payload => {
              if (!payload) return;
              if (payload.type === 'cluster' && payload.name) {
                setNav('events');
                setTimeout(() => {
                  if (typeof jumpToCluster === 'function') jumpToCluster(payload.name);
                  else {
                    const cards = document.querySelectorAll('h2, .cluster-title, .group-title');
                    cards.forEach(c => {
                      if (c.textContent.trim() === payload.name) {
                        c.closest('.cluster-card, .cluster-section, .c-card, section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }
                    });
                  }
                }, 80);
              }
              if (payload.type === 'article' && payload.link) {
                window.open(payload.link, '_blank', 'noopener');
              }
            }
          });
          setTimeout(() => Mind.invalidate && Mind.invalidate(), 40);
        }
      }
    } else if (which === 'watchlist') {
      history.replaceState(null, '', '#/watchlist');
      navWatchlist?.classList.add('is-active');
      navWatchlist?.setAttribute('aria-current', 'page');
      watchlistView?.classList.remove('hidden');
      window.ClustrWatchlist?.mount(watchlistView);
    } else if (which === 'stocks') {
      navStocks?.classList.add('is-active');
      navStocks?.setAttribute('aria-current', 'page');
      stocksView?.classList.remove('hidden');
      window.ClustrStocks?.mount(stocksView, getDisplayAccount().role);
    } else if (which === 'weekly') {
      if (navWeekly) {
        navWeekly.classList.add('is-active');
        navWeekly.setAttribute('aria-current', 'page');
      }
      if (weeklyView) weeklyView.classList.remove('hidden');
      renderWeekly();
    } else if (which === 'atlas') {
      history.replaceState(null, '', '#/atlas');
      navAtlas?.classList.add('is-active');
      navAtlas?.setAttribute('aria-current', 'page');
      atlasView?.classList.remove('hidden');
      window.ClustrAtlas?.render(atlasView);
    } else if (which === 'account') {
      if (navAccount) {
        navAccount.classList.add('is-active');
        navAccount.setAttribute('aria-current', 'page');
      }
      if (accountView) accountView.classList.remove('hidden');
      renderAccount();
    } else if (which === 'admin') {
      if (navAdmin) {
        navAdmin.classList.add('is-active');
        navAdmin.setAttribute('aria-current', 'page');
      }
      if (adminView) adminView.classList.remove('hidden');
    } else if (which === 'days') {
      if (navDays) {
        navDays.classList.add('is-active');
        navDays.setAttribute('aria-current', 'page');
      }
      if (daysView) daysView.classList.remove('hidden');
      renderReportDays();
    } else if (which === 'signal') {
      if (navSignal) {
        navSignal.classList.add('is-active');
        navSignal.setAttribute('aria-current', 'page');
      }
      if (signalView) signalView.classList.remove('hidden');
      if (window.ClustrSignal) {
        window.ClustrSignal.renderSignalPage(scopedGroups());
      }
    }
    if (changed && window.matchMedia('(max-width: 768px)').matches) window.scrollTo(0, 0);
  }

  function weeklyScore(group) {
    const articleScore = window.ClustrUtil.articleImpactScore(group.articles || []);
    if (articleScore != null) return articleScore;
    const value = Number(group.stance_score ?? group.cluster_score ?? group.impact_score);
    return Number.isFinite(value) && value >= -10 && value <= 10 && value !== 0 ? value : null;
  }

  function symmetricReturnRange(values) {
    const largest = Math.max(0, ...values.filter(Number.isFinite).map(value => Math.abs(value)));
    const padded = Math.max(largest * 1.1, 0.1);
    const power = Math.pow(10, Math.floor(Math.log10(padded)));
    const normalized = padded / power;
    const ceiling = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * power;
    return { min: -ceiling, max: ceiling };
  }

  function weeklyKey(group) {
    const market = String(group.market || 'US').toUpperCase();
    const id = group.cluster_bank_key ?? group.cluster_id ?? group.clusterId ?? group.cluster_bank_id;
    const name = String(group.group || group.name || group.title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    return `${market}:${id != null && id !== '' ? `id-${id}` : name}`;
  }

  function weeklyGroupName(group) {
    return String(group.group || group.name || group.title || 'Cluster').trim();
  }

  function weeklyMarket() { return 'US'; }

  function weeklyDayKey(value) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
  }

  async function renderWeekly() {
    const requestId = ++weeklyRenderId;
    const range = document.getElementById('weeklyRange');
    const summary = document.getElementById('weeklySummary');
    const aiSummary = document.getElementById('weeklyAiSummary');
    const chart = document.getElementById('weeklyChart');
    const list = document.getElementById('weeklyList');
    if (!range || !summary || !chart || !list) return;
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 86400000);
    const inWeek = publishes.filter(p => {
      const at = new Date(p.created_at).getTime();
      return at >= start.getTime() && at <= end.getTime();
    });
    range.textContent = `${start.toLocaleDateString()} – ${end.toLocaleDateString()} · rolling 7 days · ${inWeek.length} publishes`;
    if (!hasProAccess()) {
      summary.innerHTML = '<div class="weekly-locked"><b>Pro</b><span>Weekly history is part of the paid plan.</span></div>';
      if (aiSummary) aiSummary.innerHTML = '';
      chart.innerHTML = '';
      list.innerHTML = '<div class="weekly-empty">Upgrade to Pro in Account to unlock weekly clusters and trends.</div>';
      return;
    }
    if (!inWeek.length) {
      summary.innerHTML = '';
      if (aiSummary) aiSummary.innerHTML = '<section class="weekly-ai-empty"><b>No summaries for this week yet</b><p>Daily and cluster summaries appear here after publishes are saved and the local Ollama summary job completes.</p></section>';
      chart.innerHTML = '';
      list.innerHTML = '<div class="weekly-empty">No publishes in the rolling seven-day window.</div>';
      return;
    }
    summary.innerHTML = '<div class="weekly-empty">Loading the last seven days…</div>';
    const data = await Promise.all(inWeek.map(async pub => {
      const key = String(pub.id);
      if (!groupsCache[key]) {
        try { groupsCache[key] = await window.ClustrApi.loadGroupsForPublish(pub); }
        catch (err) { console.warn('weekly cluster load', pub.id, err.message); groupsCache[key] = []; }
      }
      return { publish: pub, groups: scopedGroups(groupsCache[key] || [], pub.market) };
    }));
    let savedSummaries = [];
    let summaryError = '';
    try {
      const markets = [...new Set(inWeek.map(pub => weeklyMarket(pub.market)))];
      const summaryStart = weeklyDayKey(start);
      savedSummaries = await window.ClustrApi.fetchAiSummaries(summaryStart, markets);
    } catch (err) { summaryError = err.message || 'Summary service unavailable.'; console.warn('Ollama summaries unavailable:', summaryError); }
    if (requestId !== weeklyRenderId || view !== 'weekly') return;
    const dailyByMarket = new Map();
    const weeklySummaryByCluster = new Map();
    for (const row of savedSummaries) {
      const market = weeklyMarket(row.market);
      if (row.kind === 'daily') {
        if (!dailyByMarket.has(market)) dailyByMarket.set(market, []);
        dailyByMarket.get(market).push(row);
      } else if (row.kind === 'weekly_cluster') {
        const key = `${market}:${window.ClustrTaxonomy.canonicalName(row.cluster_name).toLocaleLowerCase()}`;
        const current = weeklySummaryByCluster.get(key);
        if (!current || row.summary_date > current.summary_date) weeklySummaryByCluster.set(key, row);
      }
    }
    if (aiSummary) {
      const publishedMarkets = [...new Set(inWeek.map(pub => weeklyMarket(pub.market)))];
      const digests = publishedMarkets.flatMap(market => {
        const rows = (dailyByMarket.get(market) || []).sort((a, b) => b.summary_date.localeCompare(a.summary_date));
        if (rows.length) return rows.map(row => `<section class="weekly-ai-digest"><div class="weekly-ai-digest-head"><span>DAILY MARKET BRIEF</span><time>${window.ClustrUtil.escapeHtml(row.summary_date)}</time></div><h2>United States</h2><p>${window.ClustrUtil.escapeHtml(row.summary)}</p><small>Generated with ${window.ClustrUtil.escapeHtml(row.model || 'local Ollama')}</small></section>`);
        return [`<section class="weekly-ai-digest weekly-ai-digest-empty"><div class="weekly-ai-digest-head"><span>DAILY MARKET BRIEF</span><span>${market}</span></div><h2>United States</h2><p>${summaryError ? `Could not load the saved summary: ${window.ClustrUtil.escapeHtml(summaryError)}` : 'No daily digest is saved in this seven-day window yet. It is created after a publish with same-day stories and a successful Ollama summary run.'}</p></section>`];
      });
      aiSummary.innerHTML = window.ClustrWatchlist?.isFiltered() ? '<p class="weekly-ai-cluster-note">Watchlist scope: summaries for linked clusters are shown below.</p>' : `<div class="weekly-ai-heading"><div><span>AI SUMMARIES</span><h2>Daily market briefs</h2></div><p>Saved daily briefs from the rolling seven-day window</p></div><div class="weekly-ai-digest-grid">${digests.join('')}</div>`;
    }
    const byCluster = new Map();
    for (const { publish, groups } of data) {
      const day = weeklyDayKey(publish.created_at);
      for (const group of groups) {
        const key = weeklyKey(group);
        let item = byCluster.get(key);
        if (!item) { item = { key, name: weeklyGroupName(group), market: weeklyMarket(group.market || publish.market), items: [], days: new Set(), stories: new Map(), tickers: new Set(), scoreValues: [] }; byCluster.set(key, item); }
        item.items.push({ group, day, publish });
        item.days.add(day);
        const score = weeklyScore(group);
        if (score != null) item.scoreValues.push(score);
        for (const article of group.articles || []) {
          const articleKey = article.link || article.title;
          if (articleKey) item.stories.set(articleKey, { ...article, day, rating: Number(article.rating ?? article.score) });
        }
        for (const stock of [...(group.stocks || []), ...(group.direct_stocks || []), ...(group.fixed_stocks || []), ...(group.default_symbols || []), ...(group.mentioned_stocks || []), ...(group.related_stocks || [])]) {
          const symbol = String((stock && stock.symbol) || stock || '').toUpperCase();
          if (symbol) item.tickers.add(symbol);
        }
      }
    }
    const clusters = [...byCluster.values()].map(item => {
      const articleRatings = [...item.stories.values()].map(a => a.rating).filter(n => Number.isFinite(n) && n >= -10 && n <= 10 && n !== 0);
      const scores = articleRatings.length ? articleRatings : item.scoreValues;
      const summaryKey = `${item.market}:${item.name.trim().toLocaleLowerCase()}`;
      return { ...item, score: window.ClustrUtil.exponentialMeanRating(scores), summary: weeklySummaryByCluster.get(summaryKey) || null };
    })
      .sort((a,b) => b.days.size-a.days.size || Math.abs(b.score||0)-Math.abs(a.score||0));
    if (aiSummary) {
      const weeklyNote = document.createElement('p');
      weeklyNote.className = 'weekly-ai-cluster-note';
      const summarizedClusters = clusters.filter(cluster => cluster.summary).length;
      weeklyNote.textContent = summarizedClusters
        ? `${summarizedClusters} weekly cluster summaries are shown inside their matching cluster cards below.`
        : 'No saved weekly cluster summaries were found for this period. They appear after a full publish completes its Ollama summary step.';
      aiSummary.appendChild(weeklyNote);
    }
    const days = new Map();
    for (const { publish, groups } of data) {
      const day = weeklyDayKey(publish.created_at);
      if (!days.has(day)) days.set(day, { day, scores: [], stories: new Set(), ratings: new Map(), clusters: 0 });
      const point = days.get(day);
      for (const group of groups) {
        point.clusters++;
        for (const article of group.articles || []) {
          const key = article.link || article.title;
          const rating = Number(article.rating ?? article.score);
          if (key && rating) { point.stories.add(key); point.ratings.set(key, rating); }
        }
      }
    }
    const orderedDays = [...days.values()].map(point => ({ ...point, scores: [...point.ratings.values()] })).sort((a,b)=>a.day.localeCompare(b.day));
    weeklyTrendDays = orderedDays;
    const uniqueStories = [...new Set(clusters.flatMap(cluster => [...cluster.stories.keys()]))].length;
    const averageScore = window.ClustrUtil.exponentialMeanRating(clusters.map(cluster => cluster.score));
    const repeatedClusters = clusters.filter(cluster => cluster.days.size > 1).length;
    summary.innerHTML = `<div><b>${clusters.length}</b><span>active clusters</span></div><div><b>${uniqueStories}</b><span>unique stories</span></div><div><b>${repeatedClusters}</b><span>clusters covered on multiple days</span></div><div><b>${averageScore == null ? '—' : `${averageScore > 0 ? '+' : ''}${averageScore.toFixed(1)}`}</b><span>average cluster impact</span></div>`;
    if (weeklyMode === 'trends') {
      chart.innerHTML = weeklyTrendChart(orderedDays);
      const changes = clusters.filter(c => c.days.size > 1).map(c => {
        const rows = [...c.items].sort((a,b)=>a.day.localeCompare(b.day));
        const firstDay = rows[0].day, lastDay = rows[rows.length - 1].day;
        const mean = entries => window.ClustrUtil.exponentialMeanRating(entries.map(row => weeklyScore(row.group)));
        const first = mean(rows.filter(row => row.day === firstDay)), last = mean(rows.filter(row => row.day === lastDay));
        return { ...c, change: first == null || last == null ? null : last-first };
      }).filter(c=>c.change!=null).sort((a,b)=>Math.abs(b.change)-Math.abs(a.change)).slice(0,12);
      list.innerHTML = changes.length ? changes.map(c=>weeklyClusterCard(c,true)).join('') : '<div class="weekly-empty">No repeated rated clusters to compare this week.</div>';
    } else {
      chart.innerHTML = '';
      list.innerHTML = clusters.length ? clusters.map(c=>weeklyClusterCard(c,false)).join('') : '<div class="weekly-empty">No clusters found in the last seven days.</div>';
    }
    bindWeeklyClusterCharts(list, clusters);
  }

  function weeklyTrendChart(days) {
    if (!days.length) return '<div class="weekly-empty">No trend data for this week.</div>';
    const W=Math.max(220,Math.min(900,(document.getElementById('weeklyChart')?.clientWidth || 938)-38)),H=270,L=44,R=20,T=24,B=42,x=i=>days.length<2?W/2:L+i*(W-L-R)/(days.length-1),y=v=>T+(10-v)*(H-T-B)/20;
    const avg=d=>window.ClustrUtil.exponentialMeanRating(d.scores) ?? 0;
    const max=Math.max(1,...days.map(d=>d.clusters));
    const line=days.map((d,i)=>`${i?'L':'M'}${x(i)},${y(avg(d))}`).join(' ');
    return `<div class="weekly-trend-panel"><div class="weekly-chart-legend"><span><i class="weekly-key-score"></i>Daily article impact score</span><span><i class="weekly-key-volume"></i>Cluster releases</span></div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weekly article impact scores and cluster activity">${[-10,-5,0,5,10].map(v=>`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" class="weekly-grid"/><text x="4" y="${y(v)+4}" class="weekly-axis">${v>0?'+':''}${v}</text>`).join('')}${days.map((d,i)=>`<rect x="${x(i)-10}" y="${H-B-d.clusters/max*56}" width="20" height="${d.clusters/max*56}" rx="4" class="weekly-volume"><title>${d.clusters} cluster releases</title></rect>`).join('')}<path d="${line}" fill="none" class="weekly-score-line"/>${days.map((d,i)=>`<circle cx="${x(i)}" cy="${y(avg(d))}" r="4" class="weekly-score-dot"><title>${d.scores.length?avg(d).toFixed(1):'No ratings'} · ${d.stories.size} rated articles</title></circle><text x="${x(i)}" y="${H-12}" text-anchor="middle" class="weekly-axis">${d.day.slice(5)}</text>`).join('')}</svg><p class="weekly-footnote">Each rating point represents 3× directional impact. Zero-rated articles are excluded. Trend movement compares each cluster’s first and latest weekly impact score.</p></div>`;
  }

  function weeklyClusterCard(item, showChange) {
    const score = item.score == null ? '—' : `${item.score > 0 ? '+' : ''}${item.score.toFixed(1)}`;
    const change = showChange && item.change != null ? `<span class="weekly-change ${item.change>0?'up':item.change<0?'down':''}">${item.change>0?'+':''}${item.change.toFixed(1)}</span>` : '';
    const summary = item.summary ? `<section class="weekly-cluster-summary"><div><span>7-DAY CLUSTER SUMMARY</span><small>${window.ClustrUtil.escapeHtml(item.summary.summary_date)} · ${window.ClustrUtil.escapeHtml(item.summary.model || 'local Ollama')}</small></div><p>${window.ClustrUtil.escapeHtml(item.summary.summary)}</p></section>` : '';
    const entries = [...item.items]
      .sort((a, b) => new Date(b.publish.created_at) - new Date(a.publish.created_at))
      .map(({ group, publish, day }) => {
        const entryScore = weeklyScore(group);
        const scoreText = entryScore == null ? '—' : `${entryScore > 0 ? '+' : ''}${entryScore.toFixed(1)}`;
        const entrySummary = String(group.reason || group.summary || '').trim();
        return `<article class="weekly-cluster-entry">
          <div class="weekly-cluster-entry-score ${entryScore > 0 ? 'up' : entryScore < 0 ? 'down' : ''}">${scoreText}</div>
          <div>
            <div class="weekly-cluster-entry-meta"><time datetime="${window.ClustrUtil.escapeHtml(publish.created_at || '')}">${window.ClustrUtil.escapeHtml(day)}</time><span>${window.ClustrUtil.escapeHtml(publish.title || 'Publish')}</span></div>
            <p>${window.ClustrUtil.escapeHtml(entrySummary || 'No saved cluster summary for this publish.')}</p>
          </div>
        </article>`;
      }).join('');
    return `<details class="weekly-cluster" data-weekly-key="${window.ClustrUtil.escapeHtml(item.key)}"><summary class="weekly-cluster-head"><div class="weekly-cluster-score ${item.score>0?'up':item.score<0?'down':''}">${score}</div><div class="weekly-cluster-main"><h3>${window.ClustrUtil.escapeHtml(item.name)}</h3><p>${item.stories.size} unique articles · ${item.days.size} days · ${item.market}</p>${summary}<div class="weekly-tickers">${[...item.tickers].slice(0,10).map(t=>`<span>${window.ClustrUtil.escapeHtml(t)}</span>`).join('')}</div></div>${change}<span class="weekly-cluster-expand" aria-hidden="true">⌄</span></summary><section class="weekly-cluster-history"><div class="weekly-cluster-history-title">All ${item.items.length} cluster ${item.items.length === 1 ? 'entry' : 'entries'} in this seven-day window</div><section class="weekly-cluster-chart"><div><span>SENTIMENT × COMPARISON BASKET</span><small>Score vs average comparison-basket change since each publish</small></div><canvas class="weekly-cluster-chart-canvas" aria-label="Sentiment score and comparison-basket basket change"></canvas><p class="weekly-cluster-chart-note">Open this cluster to load comparison-basket price changes.</p></section>${entries}</section></details>`;
  }

  function defaultStocksForWeeklyGroup(group) {
    return (group.fixed_stocks || group.default_stocks || [])
      .map(stock => ({
        symbol: String(stock?.symbol || stock || '').trim().toUpperCase(),
        price: Number(stock?.priceAtPublish ?? stock?.price)
      }))
      .filter(stock => stock.symbol && Number.isFinite(stock.price) && stock.price > 0);
  }

  async function mountWeeklyClusterChart(details, item) {
    const canvas = details.querySelector('.weekly-cluster-chart-canvas');
    const note = details.querySelector('.weekly-cluster-chart-note');
    if (!canvas || !note || !window.Chart || !window.ClustrQuotes) return;
    if (canvas._clustrChart) return;

    const rows = [...item.items].sort((a, b) => new Date(a.publish.created_at) - new Date(b.publish.created_at));
    const defaultsByRow = rows.map(row => defaultStocksForWeeklyGroup(row.group));
    const symbols = [...new Set(defaultsByRow.flat().map(stock => stock.symbol))];
    note.textContent = 'Loading comparison-basket price changes…';

    let quotes = {};
    try {
      quotes = await window.ClustrQuotes.getQuotes(symbols);
    } catch (err) {
      console.warn('weekly comparison-basket chart quotes', err.message);
    }

    const priceMap = defaults => Object.fromEntries(defaults.map(stock => [stock.symbol, stock.price]));
    const basketReturns = defaultsByRow.map((defaults, index) => {
      const start = priceMap(defaults);
      const end = index === defaultsByRow.length - 1
        ? Object.fromEntries(Object.keys(start).map(symbol => [symbol, Number(quotes[symbol]?.price)]).filter(([, price]) => Number.isFinite(price)))
        : priceMap(defaultsByRow[index + 1]);
      const changes = Object.entries(start).map(([symbol, publishPrice]) => {
        const endPrice = end[symbol];
        return Number.isFinite(endPrice) ? ((endPrice - publishPrice) / publishPrice) * 100 : null;
      }).filter(Number.isFinite);
      return changes.length ? changes.reduce((sum, value) => sum + value, 0) / changes.length : null;
    });
    const usableRows = basketReturns.filter(Number.isFinite).length;
    const returnRange = symmetricReturnRange(basketReturns);
    note.textContent = usableRows
      ? `Same method as the stance chart: each comparison basket runs to the next publish; the final point runs to the latest quote.`
      : 'No usable comparison-basket publish prices or current quotes were available for this cluster.';

    const rootStyle = getComputedStyle(document.documentElement);
    const up = rootStyle.getPropertyValue('--up').trim() || '#4ade80';
    const down = rootStyle.getPropertyValue('--down').trim() || '#f87171';
    const muted = rootStyle.getPropertyValue('--text-meta').trim() || '#94a3b8';
    const border = rootStyle.getPropertyValue('--border').trim() || '#334155';
    const accent = rootStyle.getPropertyValue('--accent').trim() || '#f97316';
    const sentiment = rows.map(row => weeklyScore(row.group)).concat([null]);
    const pointColors = sentiment.map(score => score > 0 ? up : score < 0 ? down : muted);
    pointColors[pointColors.length - 1] = 'transparent';
    const returnData = [null].concat(basketReturns);
    canvas._clustrChart = new window.Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: rows.map(row => row.day).concat(['Live']),
        datasets: [
          { label: 'Sentiment score', data: sentiment, yAxisID: 'sentiment', borderColor: muted, pointBackgroundColor: pointColors, pointBorderColor: pointColors, borderWidth: 2, pointRadius: 5, pointHoverRadius: 7, tension: 0.25, spanGaps: true },
          { label: 'Defaults → next / live %', data: returnData, yAxisID: 'returns', borderColor: accent, backgroundColor: `${accent}22`, pointBackgroundColor: accent, borderWidth: 2, pointRadius: 4, borderDash: [5, 4], tension: 0.25, spanGaps: true, fill: false }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: { legend: { labels: { color: muted, boxWidth: 10 } } },
        scales: {
          x: { ticks: { color: muted }, grid: { color: border } },
          sentiment: { position: 'left', min: -10, max: 10, ticks: { color: muted }, grid: { color: border } },
          returns: { position: 'right', min: returnRange.min, max: returnRange.max, ticks: { color: '#76b7ff', callback: value => `${value}%` }, grid: { drawOnChartArea: false } }
        }
      }
    });
  }

  function bindWeeklyClusterCharts(list, clusters) {
    const byKey = new Map(clusters.map(cluster => [cluster.key, cluster]));
    list.querySelectorAll('.weekly-cluster[data-weekly-key]').forEach(details => {
      details.addEventListener('toggle', () => {
        if (!details.open || details.dataset.chartLoaded === 'true') return;
        const item = byKey.get(details.dataset.weeklyKey);
        if (!item) return;
        details.dataset.chartLoaded = 'true';
        mountWeeklyClusterChart(details, item);
      });
    });
  }

  function isPermanentPro() {
    const account = getDisplayAccount();
    return account.role === 'pro' && account.plan?.status === 'active' &&
      account.plan.current_period_end === null && !account.plan.stripe_customer_id;
  }

  function getDisplayAccount() {
    if (authState.role !== 'admin' || !accountPreview) return authState;
    return { ...authState, role: accountPreview === 'free' ? 'free' : 'pro',
      plan: accountPreview === 'free' ? null : { status: 'active', current_period_end: null,
        stripe_customer_id: accountPreview === 'permanent' ? null : 'preview' } };
  }

  function hasProAccess() {
    const account = getDisplayAccount();
    return !!account.user && ['pro', 'admin'].includes(account.role);
  }

  function renderPlanAccess() {
    const free = !!authState.user && !hasProAccess();
    const banner = document.getElementById('freePlanBanner');
    if (banner) banner.hidden = !free;
    for (const id of ['navWatchlist', 'navAtlas', 'navStocks', 'navWeekly']) {
      const button = document.getElementById(id);
      if (!button) continue;
      button.classList.toggle('is-pro-locked', !hasProAccess());
      button.title = hasProAccess() ? '' : 'Included with Clustr Market Pro';
    }
  }

  function renderProBadges() {
    const account = getDisplayAccount();
    const visible = !!account.user && ['pro', 'admin'].includes(account.role);
    const label = account.role === 'admin' ? 'Pro · Admin' : isPermanentPro() ? 'Lifetime Pro' : 'Pro';
    document.querySelectorAll('[data-pro-badge]').forEach(badge => {
      badge.hidden = !visible;
      badge.textContent = visible ? badge.dataset?.proCompact !== undefined ? 'Pro' : label : '';
      badge.title = visible ? `${label} access is active` : '';
    });
  }

  function renderAccount(message = '') {
    const account = getDisplayAccount();
    const title = document.getElementById('accountTitle');
    const note = document.getElementById('accountMessage');
    const content = document.getElementById('accountContent');
    if (!title || !content) return;
    note.textContent = message;
    if (!account.user) {
      const places = foundingStatus?.remaining;
      title.textContent = accountMode === 'signup' ? (places > 0 ? 'Get Lifetime Pro' : 'Create your free account') : 'Sign in to Clustr Market';
      const offer = places > 0 ? `<section class="account-plan"><h2>Lifetime Pro · ${places} places left</h2><p>Free lifetime Pro access for the first 20 people who claim it. Create an account, confirm your email, then press Accept & claim Lifetime Pro here. Signing up alone does not reserve a place.</p></section>` : '';
      content.innerHTML = offer + `<button class="account-secondary" type="button" data-account-action="google">Continue with Google</button><button class="account-secondary" type="button" data-account-action="facebook">Continue with Facebook</button><form id="accountForm" class="account-form"><label>Email<input name="email" type="email" autocomplete="email" required></label><label>Password<input name="password" type="password" minlength="8" autocomplete="${accountMode === 'signup' ? 'new-password' : 'current-password'}" required></label><button class="account-primary" type="submit">${accountMode === 'signup' ? 'Create free account' : 'Sign in'}</button></form><div class="account-actions"><button type="button" data-account-action="email-link">${accountMode === 'signup' ? 'Create account with email link' : 'Email me a sign-in link'}</button><button type="button" data-account-action="switch">${accountMode === 'signup' ? 'Already have an account? Sign in' : (places > 0 ? 'Get Lifetime Pro' : 'Create a free account')}</button>${accountMode === 'signin' ? '<button type="button" data-account-action="resend">Resend confirmation email</button><button type="button" data-account-action="reset">Reset password</button>' : ''}</div><p class="account-plan-note">Free includes older reports, excluding today and yesterday (US Eastern time). Pro unlocks the latest data, Watchlist and History.</p>`;
      return;
    }
    if (account.recovery) {
      title.textContent = 'Set a new password';
      content.innerHTML = `<p>${window.ClustrUtil.escapeHtml(account.user.email || '')}</p><form id="passwordForm" class="account-form"><label>New password<input name="password" type="password" minlength="8" autocomplete="new-password" required></label><button class="account-primary" type="submit">Update password</button></form>`;
      return;
    }
    title.textContent = 'Your Clustr Market account';
    const permanent = isPermanentPro();
    const claimOffer = foundingStatus?.remaining > 0 && !foundingStatus.claimed && authState.role !== 'admin' ? `<section class="account-plan"><h2>Lifetime Pro · ${foundingStatus.remaining} places left</h2><p>Free lifetime Pro access. Press the button to claim a place; signing in alone does not claim one.</p><button class="account-primary" type="button" data-account-action="claim-founding20">Accept &amp; claim Lifetime Pro</button></section>` : '';
    content.innerHTML = `<div class="account-profile"><span>${window.ClustrUtil.escapeHtml(account.user.email || '')}</span><span class="account-plan-badge">${account.role === 'admin' ? 'PRO · ADMIN' : permanent ? 'LIFETIME PRO' : account.role === 'pro' ? 'PRO · ACTIVE' : 'FREE'}</span></div>` +
      (account.role === 'admin' ? `<section class="account-plan"><h2>Pro is active</h2><p>Live clusters, weekly trends, and full publish history are unlocked.</p><p class="account-plan-note">Your admin account includes permanent Pro access. No subscription is required.</p></section>` : account.role === 'pro' ? `<section class="account-plan"><h2>${permanent ? 'Lifetime Pro' : 'Pro is active'}</h2><p>Live clusters, weekly trends, and full publish history are unlocked.</p>${permanent ? '<p class="account-plan-note">Your Lifetime Pro access has no expiry date and no recurring payments.</p>' : account.plan?.current_period_end ? `<p class="account-plan-note">Current period ends ${new Date(account.plan.current_period_end).toLocaleDateString()}.</p>` : ''}${account.plan?.stripe_customer_id ? '<button class="account-secondary" type="button" data-account-action="portal">Manage subscription</button>' : ''}</section>` :
      claimOffer + `<section class="account-plan"><h2>Free plan</h2><p>Browse older reports. Today’s and yesterday’s reports, Watchlist and History are not included (US Eastern time).</p><h3>Pro · 99 kr/month</h3><p>Get the latest data, your personal Watchlist and interactive History.</p><button class="account-primary" type="button" data-account-action="checkout">Continue to secure checkout</button>${account.plan?.stripe_customer_id ? '<button class="account-secondary" type="button" data-account-action="portal">Manage billing</button>' : ''}</section>`) +
      (window.ClustrPush?.panelHtml() || '') + '<button class="account-secondary" type="button" data-account-action="logout">Sign out</button>';
    window.ClustrPush?.mount(document.getElementById('accountPush'), account.user.id);
  }

  function renderAdmin(message = '') {
    const note = document.getElementById('adminMessage');
    if (note) note.textContent = message;
  }

  async function setAccountPreview(value) {
    if (authState.role !== 'admin' || !['', 'free', 'pro', 'permanent'].includes(value)) throw new Error('Administrator access is required.');
    const cutoff = value === 'free' ? await window.ClustrApi.fetchFreeCutoff() : null;
    window.ClustrApi.setPreviewCutoff(cutoff);
    accountPreview = value;
    publishes = []; currentGroups = []; groupsCache = {}; weeklyRenderId++;
    window.ClustrStocks?.leave();
    window.ClustrConnections?.hide();
    await window.ClustrWatchlist?.init(hasProAccess() ? authState.user : null);
    window.ClustrThemes.setAccess(getDisplayAccount().role);
    renderProBadges(); renderPlanAccess();
    const selectedView = view;
    await refreshPublishes();
    setNav(selectedView);
  }

  function appendPublishConsole(lines, reset = false) {
    const output = document.getElementById('publishConsole');
    if (!output) return;
    if (reset) output.textContent = '';
    for (const entry of lines || []) {
      const time = entry.time ? `[${entry.time}] ` : '';
      const level = entry.level ? `${entry.level.toUpperCase()} ` : '';
      output.textContent += `${time}${level}${entry.text || ''}\n`;
    }
    output.scrollTop = output.scrollHeight;
  }

  function updateSourceMonitor(job, reset = false) {
    const grid = document.querySelector('.admin-monitor-grid');
    if (!grid) return;
    let panel = document.getElementById('publishSources');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'publishSources';
      panel.className = 'admin-monitor-panel admin-source-panel';
      panel.innerHTML = '<h3>Sources</h3><div class="publish-source-grid"><div><h4>News feeds · articles after deduplication</h4><pre class="publish-source-list publish-news-sources"></pre></div><div><h4>Market data · dated measurements, not news articles</h4><pre class="publish-source-list publish-market-sources"></pre></div></div>';
      grid.appendChild(panel);
    }
    const newsList = panel.querySelector('.publish-news-sources');
    const marketList = panel.querySelector('.publish-market-sources');
    if (reset) { newsList.textContent = 'Waiting for source results.'; marketList.textContent = 'Waiting for source results.'; return; }
    const news = Object.entries(job?.newsSources || {});
    const market = Object.entries(job?.marketSources || {});
    newsList.textContent = news.length ? news.map(([name, count]) => `${name}: ${count}`).join('\n') : 'Fetching…';
    marketList.textContent = market.length ? market.map(([name, status]) => `${name}: ${status}`).join('\n') : 'Fetching…';
  }

  function updateModelMonitor(status, reset = false) {
    const model = document.getElementById('publishModelName');
    const activity = document.getElementById('publishModelActivity');
    const article = document.getElementById('publishModelArticle');
    const reply = document.getElementById('publishModelReply');
    if (reset) {
      if (model) model.textContent = 'Model: starting';
      if (activity) activity.textContent = 'Waiting for filtering.';
      if (article) article.textContent = '';
      if (reply) reply.textContent = 'The newest model reply will appear here.';
      return;
    }
    if (!status) return;
    if (model) model.textContent = `Model: ${status.model || 'unknown'}`;
    if (activity) {
      const active = Number(status.active) || 0;
      activity.textContent = status.phase === 'working'
        ? `Working · ${active} request${active === 1 ? '' : 's'} active · ${Number(status.processed) || 0}/${Number(status.total) || 0} completed · up to ${Number(status.concurrency) || 1} in parallel`
        : status.phase === 'complete' ? `Filtering complete · ${Number(status.processed) || 0} articles checked`
          : status.phase === 'reply' ? `Latest reply received · ${Number(status.processed) || 0}/${Number(status.total) || 0} completed`
            : 'Waiting for model work.';
    }
    if (article) article.textContent = status.article ? `Latest article: ${status.article}` : '';
    if (reply && status.reply) reply.textContent = status.reply;
  }

  function updatePublishChart(progress) {
    if (!progress) return;
    const canvas = document.getElementById('publishChart');
    const text = document.getElementById('publishProgressText');
    const filterTotal = Number(progress.filterTotal) || 20;
    const chartValues = [
      Number(progress.fetchedArticles) || 0,
      Number(progress.filterProcessed) || 0,
      Number(progress.relevant) || 0,
      Number(progress.groupingProcessed) || 0,
      Number(progress.clusters) || 0,
      Number(progress.stocksMapped) || 0
    ];
    if (text) text.textContent = `Fetched ${chartValues[0]} news articles · ${Number(progress.marketSignals) || 0} market measurements · filtering ${chartValues[1]}/${filterTotal} complete · relevant ${chartValues[2]} · grouping ${chartValues[3]}/${Number(progress.groupingTotal) || 0} · clusters ${chartValues[4]} · stocks mapped ${chartValues[5]}/${Number(progress.stockMapTotal) || 0}`;
    if (!canvas || !window.Chart) return;
    const labels = ['Fetched articles', 'Filtering progress', 'Relevant', 'Stories grouped', 'Clusters formed', 'Stock maps complete'];
    if (!publishChart) {
      publishChart = new window.Chart(canvas, {
        type: 'bar',
        data: { labels, datasets: [{ data: chartValues, backgroundColor: ['#51d5b1','#74a7ff','#39c889','#8e81ff','#f4b86b','#58c9e8'], borderRadius: 6, borderSkipped: false }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: true, animation: { duration: 180 }, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0, color: '#a8b6c8' }, grid: { color: 'rgba(150,170,195,.12)' } }, y: { ticks: { color: '#d6e0ee' }, grid: { display: false } } } }
      });
      return;
    }
    publishChart.data.datasets[0].data = chartValues;
    publishChart.update();
  }

  /**
   * Jump to events view and scroll to a cluster card.
   * @param {string} name
   * @returns {void}
   */
  function jumpToCluster(name) {
    setNav('events');
    const el = document.querySelector(
      `.cluster-card[data-cluster="${CSS.escape(name)}"]`
    );
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.add('is-flash');
      setTimeout(() => el.classList.remove('is-flash'), 1200);
    }
  }

  /**
   * @param {string} symbol
   * @returns {void}
   */
  function onMoverPick(symbol) {
    const R = window.ClustrRender;
    if (!R) return;
    const clusters = R.clustersForSymbol(scopedGroups(), symbol);
    if (!clusters.length) return;
    setNav('events');
    jumpToCluster(clusters[0].name);
  }

  /**
   * @returns {void}
   */
  function refreshMovers() {
    const R = window.ClustrRender;
    if (R && typeof R.renderMoversStrip === 'function') {
      R.renderMoversStrip(scopedGroups(), moversMode, onMoverPick);
    }
    document.querySelectorAll('[data-movers-mode]').forEach(btn => {
      btn.classList.toggle(
        'is-active',
        btn.getAttribute('data-movers-mode') === moversMode
      );
    });
  }

  /**
   * Paint events, map panel, days for current publish index.
   * @returns {Promise<void>}
   */

  /**
   * Warm compact history without downloading full article bodies.
   * @returns {Promise<void>}
   */
  async function warmGroupsCache() {
    try { await window.ClustrApi.fetchHistorySummaries?.(); }
    catch (error) { console.warn('Compact history unavailable:', error.message); }
  }

  async function paintCurrent(reuse = false) {
    const R = window.ClustrRender;
    const MapApi = window.ClustrMap;
    if (!R) {
      if (status) status.textContent = 'Render module not loaded';
      return;
    }

    const p = publishes[publishIndex];
    if (!reuse) currentGroups = window.ClustrApi.loadGroupsForPublish ? await window.ClustrApi.loadGroupsForPublish(p) : [];
    if (p && p.id != null) {
      groupsCache[p.id] = currentGroups;
      groupsCache[String(p.id)] = currentGroups;
    }
    setMeta();
    refreshMovers();

    await R.renderEvents(sortEventClusters(scopedGroups()), scopedGroups());

    if (typeof R.renderCountryPanel === 'function') {
      R.renderCountryPanel(scopedGroups(), country => {
        R.highlightCountryCard(country);
        R.renderCountryArticles(scopedGroups(), country);
        if (MapApi && typeof MapApi.focusCountry === 'function') {
          MapApi.focusCountry(country);
        }
      });
    }

    if (typeof R.renderCountryArticles === 'function') {
      R.renderCountryArticles(scopedGroups(), null);
    }

    if (MapApi && typeof MapApi.render === 'function') {
      MapApi.render(scopedGroups(), {
        onCountry: country => {
          R.highlightCountryCard(country);
          R.renderCountryArticles(scopedGroups(), country);
        }
      });
    }

    if (view === 'days') renderReportDays();
  }

  async function refreshPublishes() {
    window.ClustrApi.invalidatePublishHistory?.();
    window.ClustrAtlas?.invalidate();
    window.ClustrDashboard?.invalidate();
    publishes = await window.ClustrApi.fetchPublishes(100);
    publishIndex = 0;
    if (publishes.length) {
      await warmGroupsCache();
      await paintCurrent();
    } else if (status) status.textContent = 'No publishes yet';
  }

  function setBootStage(stage, message) {
    const sub = document.getElementById('introSub');
    if (sub) sub.textContent = message;
    boot?.querySelectorAll('.boot-step').forEach((step, index) => {
      step.classList.toggle('is-current', index === stage);
      step.classList.toggle('is-complete', index < stage);
      if (index === stage) step.setAttribute('aria-current', 'step');
      else step.removeAttribute('aria-current');
    });
  }

  async function runBoot() {
    if (!boot) return;
    boot.classList.add('boot-screen--glass');
    boot.innerHTML = `
      <div class="boot-ambient" aria-hidden="true"></div>
      <div class="boot-orbit boot-orbit--outer" aria-hidden="true"></div>
      <div class="boot-orbit boot-orbit--inner" aria-hidden="true"></div>
      <div class="boot-panel">
        <div class="boot-mark" aria-hidden="true">
          <svg viewBox="0 0 100 100" fill="none"><g stroke="currentColor" stroke-width="1.5"><path d="M50 50 50 16M50 50 80 33M50 50 80 67M50 50 50 84M50 50 20 67M50 50 20 33"/></g><g fill="currentColor"><circle class="boot-dot" cx="50" cy="16" r="6"/><circle class="boot-dot" cx="80" cy="33" r="6"/><circle class="boot-dot" cx="80" cy="67" r="6"/><circle class="boot-dot" cx="50" cy="84" r="6"/><circle class="boot-dot" cx="20" cy="67" r="6"/><circle class="boot-dot" cx="20" cy="33" r="6"/><circle cx="50" cy="50" r="10"/></g></svg>
        </div>
        <h1 class="boot-wordmark">Clustr Market</h1>
        <p class="boot-tagline">A clearer view of the market.</p>
        <div class="boot-loader" aria-hidden="true"><span></span></div>
        <p class="boot-status" id="introSub" role="status">Restoring your session…</p>
        <ol class="boot-steps" aria-label="Loading stages"><li class="boot-step is-current">Session</li><li class="boot-step">Market data</li><li class="boot-step">Ready</li></ol>
      </div>
      <p class="boot-caption" aria-hidden="true">WORLD EVENTS. CONNECTED.</p>`;
    document.documentElement.classList.add('boot-lock');
    boot.classList.remove('hidden', 'is-leaving');
    boot.removeAttribute('aria-live');
    boot.setAttribute('aria-busy', 'true');
    boot.classList.add('is-live');
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      await window.ClustrUtil.sleep(450);
    }
  }

  /**
   * Fade out intro into the live app.
   * @returns {Promise<void>}
   */
  async function endBoot() {
    if (!boot) return;
    boot.classList.add('is-leaving');
    boot.setAttribute('aria-busy', 'false');
    document.documentElement.classList.remove('boot-lock');
    const util = window.ClustrUtil;
    await util.sleep(window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300);
    boot.classList.add('hidden');
    boot.classList.remove('is-live');
  }

  /**
   * App entry.
   * @returns {Promise<void>}
   */
  async function init() {
    try {
      const bootP = runBoot();
      authState = await window.ClustrAuth.restore();
      foundingStatus = await window.ClustrAuth.foundingStatus().catch(() => null);
      await window.ClustrWatchlist?.init(hasProAccess() ? authState.user : null);
      window.ClustrThemes.setAccess(authState.role);
      renderProBadges();
      renderPlanAccess();
      if (navAdmin) navAdmin.classList.toggle('hidden', authState.role !== 'admin');
      if (!authState.user) {
        await bootP;
        setNav('account');
        if (authState.authError) renderAccount(authState.authError);
        setBootStage(2, 'Your workspace is ready');
        await endBoot();
        return;
      }
      setBootStage(1, 'Loading your market workspace…');
      // Load data while the sequence runs so enter feels instant
      const dataP = window.ClustrApi.fetchPublishes(100);
      const [, loadedPublishes] = await Promise.all([bootP, dataP, warmGroupsCache()]);
      publishes = loadedPublishes;
      publishIndex = 0;
      const requestedPublish = new URLSearchParams(location.search).get('publish');
      if (/^\d+$/.test(requestedPublish || '')) {
        const target = publishes.findIndex(publish => String(publish.id) === requestedPublish);
        if (target < 0) {
          setNav('account');
          renderAccount('This report is not available on your current plan yet. Your notification settings are available on every plan.');
          setBootStage(2, 'Your workspace is ready');
          await endBoot();
          return;
        }
        publishIndex = target;
      }
      if (location.hash === '#/polymarket') setNav('polymarket');
      if (!publishes.length) {
        if (location.hash === '#/connections') setNav('connections');
        if (location.hash === '#/watchlist') setNav('watchlist');
        if (location.hash === '#/atlas') setNav('atlas');
        if (status) status.textContent = 'No publishes yet';
        setBootStage(2, 'Your workspace is ready');
        await endBoot();
        return;
      }

      await paintCurrent();
      if (location.hash === '#/polymarket') setNav('polymarket');
      else if (location.hash === '#/admin' && authState.role === 'admin') setNav('admin');
      else if (location.hash === '#/watchlist') setNav('watchlist');
      else if (location.hash === '#/atlas') setNav('atlas');
      else if (location.hash === '#/dashboard') setNav('dashboard');
      else if (location.hash === '#/connections') setNav('connections');
      else if (location.hash === '#/account' || new URLSearchParams(location.search).has('checkout')) setNav('account');
      else setNav('events');
      setBootStage(2, 'Your workspace is ready');
      await endBoot();
    } catch (err) {
      console.error(err);
      await endBoot();
      if (status) status.textContent = err.message || 'Load failed';
    }
  }

  function closeEventSortMenu() {
    document.getElementById('eventSortOptions')?.classList.remove('is-open');
    document.getElementById('eventSortToggle')?.setAttribute('aria-expanded', 'false');
  }

  function initEventSortMenu() {
    const toggle = document.getElementById('eventSortToggle');
    const options = document.getElementById('eventSortOptions');
    if (!toggle || !options) return;
    toggle.addEventListener('click', event => {
      event.stopPropagation();
      const open = options.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
      if (open) options.querySelector('[data-event-sort]')?.focus({ preventScroll: true });
    });
    document.addEventListener('click', event => {
      if (!event.target.closest('#eventSortOptions, #eventSortToggle')) closeEventSortMenu();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && options.classList.contains('is-open')) {
        closeEventSortMenu();
        toggle.focus();
      }
    });
  }

  if (navPolymarket) navPolymarket.addEventListener('click', () => setNav('polymarket'));
  if (navEvents) navEvents.addEventListener('click', () => setNav('events'));
  navWatchlist?.addEventListener('click', () => setNav('watchlist'));
  if (navStocks) navStocks.addEventListener('click', () => setNav('stocks'));
  async function changeEventSort(value) {
    if (!['size', 'positive', 'negative', 'impact'].includes(value)) return;
    eventSort = value;
    closeEventSortMenu();
    const select = document.getElementById('eventSortSelect');
    if (select) select.value = value;
    document.querySelectorAll('[data-event-sort]').forEach(item => {
      const active = item.getAttribute('data-event-sort') === value;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    const R = window.ClustrRender;
    if (R) await R.renderEvents(sortEventClusters(scopedGroups()), scopedGroups());
  }
  document.getElementById('eventSortSelect')?.addEventListener('change', event => changeEventSort(event.target.value));
  document.querySelectorAll('[data-event-sort]').forEach(button => button.addEventListener('click', async () => {
    await changeEventSort(button.getAttribute('data-event-sort'));
    if (window.matchMedia('(max-width: 768px)').matches) document.getElementById('eventSortToggle')?.focus({ preventScroll: true });
  }));
  if (navMap) navMap.addEventListener('click', () => setNav('map'));
  if (navWeekly) navWeekly.addEventListener('click', () => setNav('weekly'));
  if (navAtlas) navAtlas.addEventListener('click', () => setNav('atlas'));
  if (navDashboard) navDashboard.addEventListener('click', () => setNav('dashboard'));
  if (navAccount) navAccount.addEventListener('click', () => setNav('account'));
  if (navAdmin) navAdmin.addEventListener('click', () => setNav('admin'));
  if (navMind) navMind.addEventListener('click', () => setNav('mind'));
  if (navDays) navDays.addEventListener('click', () => setNav('days'));
  if (navSignal) navSignal.addEventListener('click', () => setNav('signal'));

  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-account-action]');
    if (!button) return;
    const action = button.getAttribute('data-account-action');
    try {
      if (authState.role === 'admin' && accountPreview && ['checkout', 'portal', 'logout'].includes(action)) throw new Error('This is an account preview. Exit preview to use real billing or sign out.');
      if (action === 'switch') { accountMode = accountMode === 'signup' ? 'signin' : 'signup'; renderAccount(); }
      if (action === 'claim-founding20') {
        button.disabled = true;
        try { await window.ClustrAuth.claimFounding20(); window.location.reload(); }
        finally { button.disabled = false; }
      }
      if (action === 'account') setNav('account');
      if (action === 'google') await window.ClustrAuth.signInWithGoogle();
      if (action === 'facebook') await window.ClustrAuth.signInWithFacebook();
      if (action === 'email-link') {
        const email = document.querySelector('#accountForm [name="email"]')?.value.trim();
        if (!email) { renderAccount('Enter your email first.'); return; }
        await window.ClustrAuth.signInWithEmailLink(email, accountMode === 'signup');
        renderAccount('Sign-in link sent. Check your inbox and open the link in this browser.');
      }
      if (action === 'reset') {
        const email = document.querySelector('#accountForm [name="email"]')?.value.trim();
        if (!email) { renderAccount('Enter your email first.'); return; }
        await window.ClustrAuth.resetPassword(email); renderAccount('Password reset email sent. Check your inbox.');
      }
      if (action === 'resend') {
        const email = document.querySelector('#accountForm [name="email"]')?.value.trim();
        if (!email) { renderAccount('Enter your email first.'); return; }
        await window.ClustrAuth.resendConfirmation(email); renderAccount('Confirmation email sent. Check your inbox and spam folder.');
      }
      if (action === 'checkout' || action === 'portal') {
        button.disabled = true;
        try { await window.ClustrAuth[action === 'checkout' ? 'checkout' : 'portal'](); }
        finally { button.disabled = false; }
      }
      if (action === 'publish') {
        if (authState.role !== 'admin') throw new Error('Administrator access is required.');
        const market = 'US';
        button.disabled = true;
        button.textContent = 'Starting full publish…';
        appendPublishConsole([], true);
        updateSourceMonitor(null, true);
        updateModelMonitor(null, true);
        updatePublishChart({ fetchedArticles: 0, filterProcessed: 0, filterTotal: 150, relevant: 0, groupingProcessed: 0, groupingTotal: 0, clusters: 0, stocksMapped: 0, stockMapTotal: 0 });
        try {
          const result = await window.ClustrAuth.runPublish(market, (stage, job) => { renderAdmin(stage); updatePublishChart(job?.progress); updateSourceMonitor(job); updateModelMonitor(job?.modelStatus); }, lines => appendPublishConsole(lines));
          await refreshPublishes();
          renderAdmin(`Publish saved · ${result.market} · ${result.counts?.clusters ?? result.count} clusters · ${result.counts?.relevant ?? 0} scored stories · ID ${result.publishId}.`);
        } finally { button.disabled = false; }
      }
      if (action === 'logout') { await window.ClustrAuth.signOut(); window.location.reload(); }
    } catch (err) {
      if (action === 'publish') renderAdmin(err.message || 'Could not complete the publish.');
      else {
        if (action === 'checkout' || action === 'portal') setNav('account');
        if (action === 'claim-founding20') foundingStatus = await window.ClustrAuth.foundingStatus().catch(() => null);
        renderAccount(err.message || 'Could not complete that action.');
      }
    }
  });

  document.getElementById('accountPreviewChoice')?.addEventListener('change', async event => {
    const choice = event.target;
    const note = document.getElementById('accountPreviewStatus');
    choice.disabled = true;
    if (note) note.textContent = 'Loading account preview…';
    try {
      await setAccountPreview(choice.value);
      if (note) note.textContent = accountPreview ? 'Preview active. Admin access is unchanged; billing and watchlist edits are disabled.' : 'Showing your actual Admin account.';
    } catch (error) { if (note) note.textContent = error.message || 'Could not load preview.'; }
    finally { choice.value = accountPreview; choice.disabled = false; }
  });

  document.addEventListener('submit', async event => {
    const form = event.target;
    if (form.id === 'accountForm') {
      event.preventDefault();
      const fields = new FormData(form), email = String(fields.get('email') || '').trim(), password = String(fields.get('password') || '');
      try {
        if (accountMode === 'signup') {
          const result = await window.ClustrAuth.signUp(email, password);
          if (result.needsConfirmation) { renderAccount('Check your email to confirm the account, then sign in.'); return; }
        } else await window.ClustrAuth.signIn(email, password);
        window.location.reload();
      } catch (err) { renderAccount(err.message || 'Could not sign in.'); }
    }
    if (form.id === 'passwordForm') {
      event.preventDefault();
      try { await window.ClustrAuth.updatePassword(String(new FormData(form).get('password') || '')); window.location.reload(); }
      catch (err) { renderAccount(err.message || 'Could not update password.'); }
    }
  });

  document.querySelectorAll('[data-weekly-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      weeklyMode = btn.getAttribute('data-weekly-mode') === 'trends' ? 'trends' : 'clusters';
      document.querySelectorAll('[data-weekly-mode]').forEach(tab => {
        const active = tab.getAttribute('data-weekly-mode') === weeklyMode;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', String(active));
      });
      renderWeekly();
    });
  });

  window.addEventListener('resize', () => {
    if (view === 'weekly' && weeklyMode === 'trends' && weeklyTrendDays.length) {
      const chart = document.getElementById('weeklyChart');
      if (chart) chart.innerHTML = weeklyTrendChart(weeklyTrendDays);
    }
  });

  const prevPublishBtn = document.getElementById('prevPublishBtn');
  const nextPublishBtn = document.getElementById('nextPublishBtn');
  // Newest-first list: +1 = older, -1 = newer
  if (prevPublishBtn) {
    prevPublishBtn.addEventListener('click', () => stepPublish(1));
  }
  if (nextPublishBtn) {
    nextPublishBtn.addEventListener('click', () => stepPublish(-1));
  }

  document.querySelectorAll('[data-movers-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      moversMode = btn.getAttribute('data-movers-mode');
      refreshMovers();
    });
  });

  let reportRevision = 0;
  async function renderReportDays() {
    const revision = ++reportRevision;
    if (!daysView) return;
    daysView.textContent = 'Loading reports…';
    try {
      let snapshots = null;
      if (window.ClustrApi.fetchHistorySummaries) {
        snapshots = new Map((await window.ClustrApi.fetchHistorySummaries()).map(publish => [String(publish.id), publish.groups_json || []]));
      }
      if (window.ClustrWatchlist?.isFiltered() && !snapshots) {
        const pending = publishes.filter(publish => !groupsCache[publish.id]);
        await Promise.all(Array.from({ length: Math.min(4, pending.length) }, async () => {
          while (pending.length && revision === reportRevision) {
            const publish = pending.shift();
            groupsCache[publish.id] = await window.ClustrApi.loadGroupsForPublish(publish);
          }
        }));
      }
      if (revision !== reportRevision) return;
      const rows = publishes.map((publish, index) => {
        const groups = snapshots?.get(String(publish.id)) || groupsCache[publish.id] || [];
        return { publish: { ...publish, __clusterCount: scopedGroups(groups, publish.market).length }, index };
      }).filter(row => !window.ClustrWatchlist?.isFiltered() || row.publish.__clusterCount);
      if (!rows.length) { daysView.textContent = 'No reports match your watchlist. Add stocks or choose All stocks.'; return; }
      window.ClustrRender.renderDaysList(rows.map(row => row.publish), rows.findIndex(row => row.index === publishIndex), index => {
        publishIndex = rows[index].index; paintCurrent(); setNav('events');
      });
    } catch { if (revision === reportRevision) daysView.innerHTML = '<p role="alert">Could not load reports. Reopen Reports to retry.</p>'; }
  }

  window.addEventListener('clustr:watchlist-change', event => {
    if (!publishes.length || (!event.detail.scopeChanged && !window.ClustrWatchlist?.isFiltered())) return;
    if (view === 'stocks') { window.ClustrStocks?.refreshScope(); return; }
    const target = view;
    paintCurrent(true).then(() => { if (view === target && !['events', 'watchlist', 'account', 'admin'].includes(target)) setNav(target); });
  });

  window.ClustrApp = {
    isAccountPreview: () => authState.role === 'admin' && !!accountPreview,
    jumpToCluster,
    showView: setNav,
    getGroups: () => scopedGroups(),
    getAllGroups: () => currentGroups,
    getGroupsCache: () => groupsCache,
    getPublishes: () => publishes,
    getPublishIndex: () => publishIndex,
    stepPublish
  };

  /** @deprecated */
  window.EventlineApp = window.ClustrApp;

  initEventSortMenu();
  init();
})();
