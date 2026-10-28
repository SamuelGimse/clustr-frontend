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
  const accountView = document.getElementById('accountView');
  const adminView = document.getElementById('adminView');

  const navEvents = document.getElementById('navEvents');
  const navMap = document.getElementById('navMap');
  const navDays = document.getElementById('navDays');
  const navSignal = document.getElementById('navSignal');
  const navMind = document.getElementById('navMind');
  const navWeekly = document.getElementById('navWeekly');
  const navAccount = document.getElementById('navAccount');
  const navAdmin = document.getElementById('navAdmin');
  let authState = { session: null, user: null, role: 'free', plan: null };
  let accountMode = 'signin';
  let publishChart = null;

  function eventClusterScore(group) {
    const ratings = (group.articles || []).map(article => article.rating ?? article.score);
    const articleScore = window.ClustrUtil.exponentialMeanRating(ratings);
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
      meta.textContent = `${p.title || 'Publish'} · ${new Date(
        p.created_at
      ).toLocaleString()} · ${currentGroups.length} clusters · ${pos}/${n}`;
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
  function setNav(which) {
    if (which === 'admin' && authState.role !== 'admin') which = 'account';
    view = which;
    const R = window.ClustrRender;
    const MapApi = window.ClustrMap;

    [navEvents, navMap, navDays, navSignal, navMind, navWeekly, navAccount, navAdmin].forEach(b => {
      if (b) {
        b.classList.remove('is-active');
        b.setAttribute('aria-current', 'false');
      }
    });

    if (eventsView) eventsView.classList.add('hidden');
    if (mapView) mapView.classList.add('hidden');
    if (daysView) daysView.classList.add('hidden');
    if (signalView) signalView.classList.add('hidden');
    if (mindView) mindView.classList.add('hidden');
    if (weeklyView) weeklyView.classList.add('hidden');
    if (accountView) accountView.classList.add('hidden');
    if (adminView) adminView.classList.add('hidden');

    if (which === 'events') {
      if (navEvents) {
        navEvents.classList.add('is-active');
        navEvents.setAttribute('aria-current', 'page');
      }
      if (eventsView) eventsView.classList.remove('hidden');
    } else if (which === 'map') {
      if (navMap) {
        navMap.classList.add('is-active');
        navMap.setAttribute('aria-current', 'page');
      }
      if (mapView) mapView.classList.remove('hidden');
      if (MapApi && R) {
        MapApi.render(currentGroups, {
          onCountry: country => {
            R.highlightCountryCard(country);
            R.renderCountryArticles(currentGroups, country);
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
          Mind.render(currentGroups, el, {
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
    } else if (which === 'weekly') {
      if (navWeekly) {
        navWeekly.classList.add('is-active');
        navWeekly.setAttribute('aria-current', 'page');
      }
      if (weeklyView) weeklyView.classList.remove('hidden');
      renderWeekly();
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
    } else if (which === 'signal') {
      if (navSignal) {
        navSignal.classList.add('is-active');
        navSignal.setAttribute('aria-current', 'page');
      }
      if (signalView) signalView.classList.remove('hidden');
      if (window.ClustrSignal) {
        window.ClustrSignal.renderSignalPage(currentGroups);
      }
    }
  }

  function weeklyScore(group) {
    const articleScore = window.ClustrUtil.exponentialMeanRating((group.articles || []).map(a => a.rating ?? a.score));
    if (articleScore != null) return articleScore;
    const value = Number(group.stance_score ?? group.cluster_score ?? group.impact_score);
    return Number.isFinite(value) && value >= -10 && value <= 10 && value !== 0 ? value : null;
  }

  function weeklyKey(group) {
    const market = String(group.market || 'US').toUpperCase();
    const id = group.cluster_bank_key ?? group.cluster_id ?? group.clusterId ?? group.cluster_bank_id;
    const name = String(group.name || group.title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    return `${market}:${id != null && id !== '' ? `id-${id}` : name}`;
  }

  async function renderWeekly() {
    const requestId = ++weeklyRenderId;
    const range = document.getElementById('weeklyRange');
    const summary = document.getElementById('weeklySummary');
    const chart = document.getElementById('weeklyChart');
    const list = document.getElementById('weeklyList');
    if (!range || !summary || !chart || !list) return;
    const end = publishes[0] ? new Date(publishes[0].created_at) : new Date();
    const start = new Date(end.getTime() - 7 * 86400000);
    const inWeek = publishes.filter(p => {
      const at = new Date(p.created_at).getTime();
      return at >= start.getTime() && at <= end.getTime();
    });
    range.textContent = `${start.toLocaleDateString()} – ${end.toLocaleDateString()} · rolling 7 days · ${inWeek.length} publishes`;
    if (!['pro', 'admin'].includes(authState.role)) {
      summary.innerHTML = '<div class="weekly-locked"><b>Pro</b><span>Weekly history is part of the paid plan.</span></div>';
      chart.innerHTML = '';
      list.innerHTML = '<div class="weekly-empty">Upgrade to Pro in Account to unlock weekly clusters and trends.</div>';
      return;
    }
    summary.innerHTML = '<div class="weekly-empty">Loading the last seven days…</div>';
    const data = await Promise.all(inWeek.map(async pub => {
      const key = String(pub.id);
      if (!groupsCache[key]) {
        try { groupsCache[key] = await window.ClustrApi.loadGroupsForPublish(pub); }
        catch (err) { console.warn('weekly cluster load', pub.id, err.message); groupsCache[key] = []; }
      }
      return { publish: pub, groups: groupsCache[key] || [] };
    }));
    if (requestId !== weeklyRenderId || view !== 'weekly') return;
    const byCluster = new Map();
    for (const { publish, groups } of data) {
      const day = new Date(publish.created_at).toLocaleDateString('en-CA');
      for (const group of groups) {
        const key = weeklyKey(group);
        let item = byCluster.get(key);
        if (!item) { item = { key, name: group.name || 'Cluster', market: group.market || publish.market || 'US', items: [], days: new Set(), stories: new Map(), tickers: new Set(), scoreValues: [] }; byCluster.set(key, item); }
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
      return { ...item, score: window.ClustrUtil.exponentialMeanRating(scores) };
    })
      .sort((a,b) => b.days.size-a.days.size || Math.abs(b.score||0)-Math.abs(a.score||0));
    const days = new Map();
    for (const { publish, groups } of data) {
      const day = new Date(publish.created_at).toLocaleDateString('en-CA');
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
    summary.innerHTML = `<div><b>${clusters.length}</b><span>reusable clusters</span></div><div><b>${[...new Set([...clusters].flatMap(c=>[...c.stories.keys()]))].length}</b><span>unique articles</span></div><div><b>${inWeek.length}</b><span>publishes</span></div>`;
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
  }

  function weeklyTrendChart(days) {
    if (!days.length) return '<div class="weekly-empty">No trend data for this week.</div>';
    const W=900,H=270,L=44,R=20,T=24,B=42,x=i=>days.length<2?W/2:L+i*(W-L-R)/(days.length-1),y=v=>T+(10-v)*(H-T-B)/20;
    const avg=d=>window.ClustrUtil.exponentialMeanRating(d.scores) ?? 0;
    const max=Math.max(1,...days.map(d=>d.clusters));
    const line=days.map((d,i)=>`${i?'L':'M'}${x(i)},${y(avg(d))}`).join(' ');
    return `<div class="weekly-trend-panel"><div class="weekly-chart-legend"><span><i class="weekly-key-score"></i>Daily article impact score</span><span><i class="weekly-key-volume"></i>Cluster releases</span></div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weekly article impact scores and cluster activity">${[-10,-5,0,5,10].map(v=>`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" class="weekly-grid"/><text x="4" y="${y(v)+4}" class="weekly-axis">${v>0?'+':''}${v}</text>`).join('')}${days.map((d,i)=>`<rect x="${x(i)-10}" y="${H-B-d.clusters/max*56}" width="20" height="${d.clusters/max*56}" rx="4" class="weekly-volume"><title>${d.clusters} cluster releases</title></rect>`).join('')}<path d="${line}" fill="none" class="weekly-score-line"/>${days.map((d,i)=>`<circle cx="${x(i)}" cy="${y(avg(d))}" r="4" class="weekly-score-dot"><title>${d.scores.length?avg(d).toFixed(1):'No ratings'} · ${d.stories.size} rated articles</title></circle><text x="${x(i)}" y="${H-12}" text-anchor="middle" class="weekly-axis">${d.day.slice(5)}</text>`).join('')}</svg><p class="weekly-footnote">Each rating point represents 3× directional impact. Zero-rated articles are excluded. Trend movement compares each cluster’s first and latest weekly impact score.</p></div>`;
  }

  function weeklyClusterCard(item, showChange) {
    const score = item.score == null ? '—' : `${item.score > 0 ? '+' : ''}${item.score.toFixed(1)}`;
    const change = showChange && item.change != null ? `<span class="weekly-change ${item.change>0?'up':item.change<0?'down':''}">${item.change>0?'+':''}${item.change.toFixed(1)}</span>` : '';
    return `<article class="weekly-cluster"><div class="weekly-cluster-score ${item.score>0?'up':item.score<0?'down':''}">${score}</div><div class="weekly-cluster-main"><h3>${window.ClustrUtil.escapeHtml(item.name)}</h3><p>${item.stories.size} unique articles · ${item.days.size} days · ${item.market}</p><div class="weekly-tickers">${[...item.tickers].slice(0,10).map(t=>`<span>${window.ClustrUtil.escapeHtml(t)}</span>`).join('')}</div></div>${change}</article>`;
  }

  function renderAccount(message = '') {
    const title = document.getElementById('accountTitle');
    const note = document.getElementById('accountMessage');
    const content = document.getElementById('accountContent');
    if (!title || !content) return;
    note.textContent = message;
    if (!authState.user) {
      title.textContent = accountMode === 'signup' ? 'Create your free account' : 'Sign in to Clustr';
      content.innerHTML = `<button class="account-secondary" type="button" data-account-action="google">Continue with Google</button><form id="accountForm" class="account-form"><label>Email<input name="email" type="email" autocomplete="email" required></label><label>Password<input name="password" type="password" minlength="8" autocomplete="${accountMode === 'signup' ? 'new-password' : 'current-password'}" required></label><button class="account-primary" type="submit">${accountMode === 'signup' ? 'Create free account' : 'Sign in'}</button></form><div class="account-actions"><button type="button" data-account-action="switch">${accountMode === 'signup' ? 'Already have an account? Sign in' : 'Create a free account'}</button>${accountMode === 'signin' ? '<button type="button" data-account-action="resend">Resend confirmation email</button><button type="button" data-account-action="reset">Reset password</button>' : ''}</div><p class="account-plan-note">Free includes the previous trading day. Pro unlocks live clusters and full history.</p>`;
      return;
    }
    if (authState.recovery) {
      title.textContent = 'Set a new password';
      content.innerHTML = `<p>${window.ClustrUtil.escapeHtml(authState.user.email || '')}</p><form id="passwordForm" class="account-form"><label>New password<input name="password" type="password" minlength="8" autocomplete="new-password" required></label><button class="account-primary" type="submit">Update password</button></form>`;
      return;
    }
    title.textContent = 'Your Clustr account';
    content.innerHTML = `<div class="account-profile"><span>${window.ClustrUtil.escapeHtml(authState.user.email || '')}</span><span class="account-plan-badge">${authState.role === 'admin' ? 'ADMIN' : authState.role === 'pro' ? 'PRO · ACTIVE' : 'FREE'}</span></div>` +
      (authState.role === 'admin' ? `<section class="account-plan"><h2>Admin access is active</h2><p>Full Clustr access, including current clusters, weekly trends, and the complete publish history.</p></section>` : authState.role === 'pro' ? `<section class="account-plan"><h2>Pro is active</h2><p>Live clusters, weekly trends, and full publish history are unlocked.</p>${authState.plan?.current_period_end ? `<p class="account-plan-note">Current period ends ${new Date(authState.plan.current_period_end).toLocaleDateString()}.</p>` : ''}<button class="account-secondary" type="button" data-account-action="portal">Manage subscription</button></section>` :
      `<section class="account-plan"><h2>Free plan</h2><p>Access the previous trading day’s clusters for free.</p><h3>Pro · 99 kr/month</h3><p>Unlock current clusters, weekly cluster history, trends, and the full archive.</p><button class="account-primary" type="button" data-account-action="checkout">Continue to secure checkout</button>${authState.plan?.stripe_customer_id ? '<button class="account-secondary" type="button" data-account-action="portal">Manage billing</button>' : ''}</section>`) +
      '<button class="account-secondary" type="button" data-account-action="logout">Sign out</button>';
  }

  function renderAdmin(message = '') {
    const note = document.getElementById('adminMessage');
    if (note) note.textContent = message;
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

  function updatePublishChart(progress) {
    if (!progress) return;
    const canvas = document.getElementById('publishChart');
    const text = document.getElementById('publishProgressText');
    const filterTotal = Number(progress.filterTotal) || 20;
    const chartValues = [
      Number(progress.fetchedArticles) || 0,
      Math.max(Number(progress.filterProcessed) || 0, Number(progress.filterActive) || 0),
      Number(progress.relevant) || 0,
      Number(progress.clusters) || 0,
      Number(progress.stocksMapped) || 0
    ];
    if (text) text.textContent = `Fetched ${chartValues[0]} · filtering ${chartValues[1]}/${filterTotal} · relevant ${chartValues[2]} · clusters ${chartValues[3]} · stocks mapped ${chartValues[4]}/${Number(progress.stockMapTotal) || 0}`;
    if (!canvas || !window.Chart) return;
    const labels = ['Fetched articles', 'Filtering progress', 'Relevant', 'Clusters', 'Stock maps complete'];
    if (!publishChart) {
      publishChart = new window.Chart(canvas, {
        type: 'bar',
        data: { labels, datasets: [{ data: chartValues, backgroundColor: ['#51d5b1','#74a7ff','#39c889','#8e81ff','#f4b86b'], borderRadius: 6, borderSkipped: false }] },
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
    const clusters = R.clustersForSymbol(currentGroups, symbol);
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
      R.renderMoversStrip(currentGroups, moversMode, onMoverPick);
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
   * Warm relational cluster cache for stance history (skip JSON).
   * @param {number} [limit=12]
   * @returns {Promise<void>}
   */
  async function warmGroupsCache(limit = 12) {
    if (!window.ClustrApi || !window.ClustrApi.loadGroupsForPublish) return;
    const slice = publishes.slice(0, limit);
    for (const pub of slice) {
      if (!pub || pub.id == null) continue;
      if (groupsCache[pub.id] && groupsCache[pub.id].length) continue;
      try {
        const g = await window.ClustrApi.loadGroupsForPublish(pub);
        groupsCache[pub.id] = g;
        groupsCache[String(pub.id)] = g;
      } catch (err) {
        console.warn('warm cache', pub.id, err.message);
      }
    }
  }

  async function paintCurrent() {
    const R = window.ClustrRender;
    const MapApi = window.ClustrMap;
    if (!R) {
      if (status) status.textContent = 'Render module not loaded';
      return;
    }

    const p = publishes[publishIndex];
    if (window.ClustrApi.loadGroupsForPublish) {
      currentGroups = await window.ClustrApi.loadGroupsForPublish(p);
    } else {
      currentGroups = [];
    }
    if (p && p.id != null) {
      groupsCache[p.id] = currentGroups;
      groupsCache[String(p.id)] = currentGroups;
    }
    setMeta();
    refreshMovers();

    await R.renderEvents(sortEventClusters(currentGroups), currentGroups);

    if (typeof R.renderCountryPanel === 'function') {
      R.renderCountryPanel(currentGroups, country => {
        R.highlightCountryCard(country);
        R.renderCountryArticles(currentGroups, country);
        if (MapApi && typeof MapApi.focusCountry === 'function') {
          MapApi.focusCountry(country);
        }
      });
    }

    if (typeof R.renderCountryArticles === 'function') {
      R.renderCountryArticles(currentGroups, null);
    }

    if (MapApi && typeof MapApi.render === 'function') {
      MapApi.render(currentGroups, {
        onCountry: country => {
          R.highlightCountryCard(country);
          R.renderCountryArticles(currentGroups, country);
        }
      });
    }

    if (typeof R.renderDaysList === 'function') {
      R.renderDaysList(publishes, publishIndex, idx => {
        publishIndex = idx;
        paintCurrent();
        setNav('events');
      });
    }
  }

  async function refreshPublishes() {
    publishes = await window.ClustrApi.fetchPublishes(100);
    publishIndex = 0;
    if (publishes.length) {
      await paintCurrent();
      warmGroupsCache(14);
    } else if (status) status.textContent = 'No publishes yet';
  }

  const INTRO_HEADLINES = [
    { t: 'US strikes risk Strait of Hormuz', tag: 'Geopolitics' },
    { t: 'Fed holds rates — markets reprice', tag: 'Macro' },
    { t: 'Defense contracts surge this week', tag: 'Contracts' },
    { t: 'AI chip demand outruns supply', tag: 'Tech' },
    { t: 'Oil jumps on shipping risk', tag: 'Energy' },
    { t: 'Pharma breakthrough clears phase 3', tag: 'Health' }
  ];

  /**
   * Cinematic intro — charts, news, clusters — no terminal spam.
   * @returns {Promise<void>}
   */
  async function runBoot() {
    if (!boot) return;
    const util = window.ClustrUtil;
    const fill = document.getElementById('introFill');
    const sub = document.getElementById('introSub');
    const eventsHost = document.getElementById('introEvents');

    document.documentElement.classList.add('boot-lock');
    boot.classList.remove('hidden', 'is-leaving');
    boot.setAttribute('aria-busy', 'true');
    boot.classList.add('is-live');
    if (fill) fill.style.width = '8%';

    // Spawn floating news cards
    if (eventsHost) {
      eventsHost.innerHTML = '';
      INTRO_HEADLINES.forEach((h, i) => {
        const card = document.createElement('div');
        card.className = 'intro-news';
        card.style.setProperty('--i', String(i));
        card.innerHTML = `<span class="intro-news-tag">${h.tag}</span><span class="intro-news-t">${h.t}</span>`;
        eventsHost.appendChild(card);
      });
    }

    const steps = [
      { p: 22, msg: 'Reading global event streams…' },
      { p: 40, msg: 'Clustering catalysts…' },
      { p: 58, msg: 'Linking US equity exposure…' },
      { p: 76, msg: 'Attaching stance & horizon…' },
      { p: 92, msg: 'Snapshotting the signal map…' },
      { p: 100, msg: 'Enter Clustr' }
    ];

    for (const step of steps) {
      if (fill) fill.style.width = `${step.p}%`;
      if (sub) sub.textContent = step.msg;
      await util.sleep(380);
    }
    await util.sleep(320);
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
    await util.sleep(750);
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
      if (navAdmin) navAdmin.classList.toggle('hidden', authState.role !== 'admin');
      if (!authState.user) {
        await bootP;
        await endBoot();
        setNav('account');
        if (authState.authError) renderAccount(authState.authError);
        return;
      }
      // Load data while the sequence runs so enter feels instant
      const dataP = window.ClustrApi.fetchPublishes(100);
      await bootP;
      publishes = await dataP;
      publishIndex = 0;
      await endBoot();

      if (!publishes.length) {
        if (status) status.textContent = 'No publishes yet';
        return;
      }

      await paintCurrent();
      warmGroupsCache(14);
      if (location.hash === '#/admin' && authState.role === 'admin') setNav('admin');
      else if (location.hash === '#/account' || new URLSearchParams(location.search).has('checkout')) setNav('account');
      else setNav('events');
    } catch (err) {
      console.error(err);
      await endBoot();
      if (status) status.textContent = err.message || 'Load failed';
    }
  }

  if (navEvents) navEvents.addEventListener('click', () => setNav('events'));
  document.querySelectorAll('[data-event-sort]').forEach(button => button.addEventListener('click', async () => {
    eventSort = button.getAttribute('data-event-sort') || 'impact';
    document.querySelectorAll('[data-event-sort]').forEach(item => {
      const active = item === button;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    const R = window.ClustrRender;
    if (R) await R.renderEvents(sortEventClusters(currentGroups), currentGroups);
  }));
  if (navMap) navMap.addEventListener('click', () => setNav('map'));
  if (navWeekly) navWeekly.addEventListener('click', () => setNav('weekly'));
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
      if (action === 'switch') { accountMode = accountMode === 'signup' ? 'signin' : 'signup'; renderAccount(); }
      if (action === 'google') await window.ClustrAuth.signInWithGoogle();
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
      if (action === 'checkout') await window.ClustrAuth.checkout();
      if (action === 'portal') await window.ClustrAuth.portal();
      if (action === 'publish') {
        if (authState.role !== 'admin') throw new Error('Administrator access is required.');
        const market = document.getElementById('publishMarket')?.value || 'US';
        button.disabled = true;
        button.textContent = 'Starting full publish…';
        appendPublishConsole([], true);
        updatePublishChart({ fetchedArticles: 0, filterProcessed: 0, filterTotal: 20, relevant: 0, clusters: 0, stocksMapped: 0, stockMapTotal: 0 });
        try {
          const result = await window.ClustrAuth.runPublish(market, (stage, job) => { renderAdmin(stage); updatePublishChart(job?.progress); }, lines => appendPublishConsole(lines));
          await refreshPublishes();
          renderAdmin(`Publish saved · ${result.market} · ${result.counts?.clusters ?? result.count} clusters · ${result.counts?.relevant ?? 0} scored stories · ID ${result.publishId}.`);
        } finally { button.disabled = false; }
      }
      if (action === 'logout') { await window.ClustrAuth.signOut(); window.location.reload(); }
    } catch (err) {
      if (action === 'publish') renderAdmin(err.message || 'Could not complete the publish.');
      else renderAccount(err.message || 'Could not complete that action.');
    }
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

  window.ClustrApp = {
    jumpToCluster,
    showView: setNav,
    getGroups: () => currentGroups,
    getPublishes: () => publishes,
    getPublishIndex: () => publishIndex,
    stepPublish
  };

  /** @deprecated */
  window.EventlineApp = window.ClustrApp;

  init();
})();
