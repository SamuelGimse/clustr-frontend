/**
 * @fileoverview Event clusters, movers strip, country panels, days list.
 */

(function () {
  const U = () => window.ClustrUtil;
  let renderGeneration = 0;
  let newsQuoteTimer = null;

  function quoteSessionLabel(quote, market = 'US', now = Date.now()) {
    if (!Number.isFinite(Date.parse(quote?.asOf))) return 'Quote time unavailable';
    const day = value => new Date(value).toLocaleDateString('en-CA', { timeZone: market === 'NO' ? 'Europe/Oslo' : 'America/New_York' });
    return day(quote.asOf) === day(now) ? 'Today' : 'Last session';
  }

  async function refreshNewsQuotes(root = document.getElementById('eventsList')) {
    if (!root || document.hidden || root.closest?.('#eventsView')?.classList.contains('hidden') || !window.ClustrQuotes?.getLatestQuotes) return;
    const buttons = [...root.querySelectorAll('[data-news-quote]:not(:disabled)')];
    for (const market of ['US', 'NO']) {
      const selected = buttons.filter(button => (button.dataset.quoteMarket || 'US') === market);
      if (!selected.length) continue;
      let quotes = {};
      try { quotes = await window.ClustrQuotes.getLatestQuotes(selected.map(button => button.dataset.symbol), market); } catch (_) {}
      for (const button of selected) {
        if (button.isConnected === false) continue;
        const q = quotes[U().normalizeSymbol(button.dataset.symbol)];
        const meta = button.querySelector('.chip-meta');
        const valid = q && Number.isFinite(q.price) && q.price > 0 && Number.isFinite(Date.parse(q.asOf));
        const pct = valid && Number.isFinite(q.changePercent) ? q.changePercent : null;
        for (const tone of ['tone-up', 'tone-down']) button.classList.remove(tone);
        const tone = U().toneClass(pct);
        if (tone) button.classList.add(tone);
        if (meta) meta.textContent = valid ? `${market === 'NO' ? 'NOK' : 'USD'} ${U().formatMoney(q.price)} · ${pct == null ? '—' : U().formatPct(pct)} ${quoteSessionLabel(q, market)}` : 'Quote unavailable';
        button.dataset.quoteAsOf = valid ? q.asOf : '';
        button.title = valid ? `${button.dataset.quoteName} · regular-session change vs previous close · quote ${new Date(q.asOf).toLocaleString()} · may be delayed` : `${button.dataset.quoteName} · latest quote unavailable; no publish percentage substituted`;
      }
    }
    const cards = root.matches?.('.cluster-card') ? [root] : [...root.querySelectorAll('.cluster-card')];
    for (const card of cards) {
      const times = [...card.querySelectorAll('[data-news-quote]')].map(button => Date.parse(button.dataset.quoteAsOf)).filter(Number.isFinite);
      const note = card.querySelector('[data-news-quote-note]');
      if (note) note.textContent = 'Latest regular-session prices · change vs previous close · refreshes every minute · may be delayed' + (times.length ? ` · oldest displayed quote: ${new Date(Math.min(...times)).toLocaleString()}` : ' · quotes unavailable');
      card.refreshNewsQuote?.();
    }
  }

  function articleRatingHtml(article) {
    const rating = U().numericStance(article && (article.rating ?? article.score));
    if (rating == null) return '';
    const tone = rating > 0 ? 'positive' : rating < 0 ? 'negative' : 'neutral';
    const value = `${rating > 0 ? '+' : ''}${rating}`;
    return `<span class="article-rating article-rating--${tone}" aria-label="Article rating ${value}" title="Each rating point represents 3× directional impact">Rating <strong>${value}</strong></span>`;
  }

  function articleImpactWindowHtml(article) {
    const window = article?.impact_timeframe;
    const min = Number(window?.duration_min_days);
    const max = Number(window?.duration_max_days);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) return '';
    const duration = max <= 1 ? 'same day' : min === 0 ? `up to ${max} days` : `${min}–${max} days`;
    const start = Number(window.starts_after_days);
    const onset = Number.isFinite(start) && start > 0 ? ` · starts in ${start} days` : '';
    const detail = `${duration}${onset}${window.confidence ? ` · ${window.confidence} confidence` : ''}${window.rationale ? ` · ${window.rationale}` : ''}`;
    return `<span class="article-impact-window" title="${U().escapeHtml(detail)}" aria-label="Estimated timeframe ${U().escapeHtml(duration)}">Timeframe <strong>${U().escapeHtml(duration)}</strong></span>`;
  }

  function polymarketArticleHtml(article) {
    const market = article.polymarket; if (!market) return '';
    const esc=U().escapeHtml;
    const prices=(market.outcomes||[]).map(item=>`<span>${esc(item.label)} <strong>${item.price===null?'—':(Number(item.price)*100).toFixed(1)+'%'}</strong></span>`).join('');
    const base=String(window.ClustrConfig?.PUBLISH_API_URL||'').replace(/\/$/,'');
    return `<div class="pm-feed-label">POLYMARKET · PREDICTION MARKET · ${esc(String(market.collected_at||''))}</div><div class="pm-feed-question">${esc(market.question || article.title || '')}</div><div class="pm-feed-prices">${prices}</div><a href="${esc(base)}/polymarket?market=${encodeURIComponent(market.market_id)}" target="_blank" rel="noopener noreferrer" class="pm-feed-history">Odds and history →</a>`;
  }

  function articleCategory(article) {
    const type = String(article?.type || 'news').toLowerCase();
    const categories = {
      market_report: 'markets', mover: 'markets', macro: 'economy',
      prediction_market: 'prediction_market', filing: 'filings', tech: 'technology', research: 'technology',
      venture: 'technology', energy: 'energy', trade: 'trade',
      health: 'health', health_tech: 'health', auto: 'autos', news: 'world'
    };
    return categories[type] || 'other';
  }

  const articleCategoryLabels = {
    prediction_market: 'Polymarket', markets: 'Markets', economy: 'Economy', filings: 'Filings',
    technology: 'Technology', energy: 'Energy', trade: 'Trade',
    health: 'Health', autos: 'Autos', world: 'World', other: 'Other'
  };

  function marketSignalsHtml(group) {
    const signals = Array.isArray(group.market_signals) ? group.market_signals : [];
    if (!signals.length) return '';
    const util = U();
    const labels = {
      crude_inventory_weekly_change_pct: 'Crude inventory change',
      gas_storage_weekly_change_pct: 'Gas storage change',
      federal_funds_rate: 'Federal funds rate', unemployment_rate: 'Unemployment',
      consumer_price_index: 'Consumer price index',
      heating_degree_days_72h: 'Heating forecast', cooling_degree_days_72h: 'Cooling forecast',
      conflict_event_share: 'Conflict event share', satellite_hotspots_24h: 'Satellite hotspots'
    };
    const visible = signals.filter(item => item.source !== 'ApeWisdom').concat(signals.filter(item => item.source === 'ApeWisdom').sort((a, b) => b.value - a.value).slice(0, 5));
    return `<section class="cluster-market-signals" aria-label="Dated market data"><div class="cluster-market-signals-head"><strong>Market data</strong><span>Context only · does not change news scores</span></div><div class="cluster-market-signals-list">${visible.map(item => {
      if (item.source === 'ApeWisdom') {
        const integer = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? String(value) : '—';
        const change = typeof item.mentions_change_pct === 'number' && Number.isFinite(item.mentions_change_pct) ? ` · mentions ${util.formatPct(item.mentions_change_pct)} vs 24h ago` : '';
        const rankChange = Number.isSafeInteger(item.rank_change) ? ` · rank ${item.rank_change > 0 ? 'up ' : item.rank_change < 0 ? 'down ' : 'unchanged '}${Math.abs(item.rank_change) || ''} vs 24h ago` : '';
        const retrieved = Number.isFinite(Date.parse(item.available_at)) ? new Date(item.available_at).toLocaleString() : 'unknown';
        return `<div class="cluster-market-signal"><span><a href="https://apewisdom.io/" target="_blank" rel="noopener noreferrer">ApeWisdom</a> · ${util.escapeHtml(item.symbol || '')} · Reddit attention</span><strong>${integer(item.value)} mentions</strong><small>Rank #${integer(item.rank)} · ${integer(item.upvotes)} upvotes${util.escapeHtml(change + rankChange)} · retrieved ${util.escapeHtml(retrieved)}. Discussion volume, not bullish/bearish sentiment; not evidence of this news causing interest. Top-100 coverage; no upstream timestamp supplied.</small></div>`;
      }
      const value = item.value == null ? NaN : Number(item.value);
      const formatted = Number.isFinite(value) ? `${value > 0 && String(item.metric).endsWith('_change_pct') ? '+' : ''}${value.toFixed(item.unit === 'detections' ? 0 : 1)}${item.unit === '%' ? '%' : ''}` : '—';
      return `<div class="cluster-market-signal"><span>${util.escapeHtml(item.source || '')} · ${util.escapeHtml(labels[item.metric] || item.metric || '')}</span><strong>${formatted}</strong><small>${util.escapeHtml(item.region || '')} · observed ${util.escapeHtml(String(item.observed_at || '').slice(0, 10))}</small></div>`;
    }).join('')}</div></section>`;
  }

  function impactTimelineHtml(articles) {
    const entries = (articles || []).map(article => {
      const timeframe = article?.impact_timeframe;
      const impact = Number(article?.impact);
      const onset = Number(timeframe?.starts_after_days);
      const minDuration = Number(timeframe?.duration_min_days);
      const maxDuration = Number(timeframe?.duration_max_days);
      const rating = Number(article?.rating ?? article?.score);
      if (!Number.isFinite(impact) || impact < 1 || impact > 10 || !Number.isFinite(minDuration) || !Number.isFinite(maxDuration) || maxDuration < minDuration) return null;
      const start = Math.max(0, Number.isFinite(onset) ? onset : 0) + Math.max(0, minDuration);
      const end = Math.max(start, (Number.isFinite(onset) ? Math.max(0, onset) : 0) + Math.max(0, maxDuration));
      return { article, impact, start, end, tone: rating < 0 ? 'negative' : rating > 0 ? 'positive' : 'neutral' };
    }).filter(Boolean).sort((a, b) => b.impact - a.impact || b.end - a.end).slice(0, 4);
    if (!entries.length) return '<div class="impact-timeline-empty">No article impact windows are available for this cluster.</div>';
    const latestEnd = Math.max(...entries.map(entry => entry.end), 1);
    const horizon = [1, 3, 7, 14, 30, 60, 90, 180].find(days => days >= latestEnd) || Math.ceil(latestEnd / 30) * 30;
    const esc = U().escapeHtml;
    const label = days => days === 0 ? 'now' : days === 1 ? '1 day' : `${days} days`;
    return `<section class="impact-timeline" aria-label="Estimated impact timeline"><div class="impact-timeline-head"><strong>Impact timeline</strong><span>Expected window after publication</span></div><div class="impact-timeline-axis" aria-hidden="true"><span>Now</span><span>+${horizon}d</span></div><div class="impact-timeline-rows">${entries.map(entry => {
      const offset = Math.min(100, entry.start / horizon * 100);
      const width = Math.max(entry.end > entry.start ? 2 : 1.5, Math.min(100 - offset, (entry.end - entry.start) / horizon * 100));
      const timing = entry.start === entry.end ? label(entry.start) : `${label(entry.start)} – ${label(entry.end)}`;
      return `<div class="impact-timeline-row" title="${esc(String(entry.article.title || 'Article'))}: impact ${entry.impact}/10, ${timing}"><span class="impact-timeline-label">${esc(String(entry.article.source || entry.article.title || 'Article'))}</span><span class="impact-timeline-track"><i class="impact-timeline-bar--${entry.tone}" style="--offset:${offset}%;--width:${width}%;--impact:${entry.impact}"></i></span><span class="impact-timeline-duration">${esc(timing)}</span></div>`;
    }).join('')}</div></section>`;
  }

  function groupRating(group) {
    const ratings = (group && group.articles || []);
    return U().articleImpactScore(ratings) ?? U().numericStance(group && (group.stance_score ?? group.cluster_score));
  }

  function clusterScoreHtml(group) {
    const score = groupRating(group);
    if (!Number.isFinite(score) || score < -10 || score > 10) return `<div class="cluster-score cluster-score--neutral cluster-score--missing" role="status" aria-label="Cluster rating unavailable"><span class="cluster-score-value">—</span><span class="cluster-score-label">NO SCORES</span></div>`;
    const category = U().stanceCategory(score);
    const tone = category === 'constructive' ? 'positive' : category === 'cautious' ? 'negative' : 'neutral';
    const value = `${score > 0 ? '+' : ''}${Number.isInteger(score) ? score : score.toFixed(1)}`;
    const intensity = score === 0 ? '0%' : `${(100 * Math.pow(3, Math.abs(score) - 10)).toFixed(2)}%`;
    const label = tone === 'positive' ? '▲ POS' : tone === 'negative' ? '▼ NEG' : '● NEU';
    return `<div class="cluster-score cluster-score--${tone}" title="Exponential mean impact; confirmed reports of the same event count once. Each point is 3× impact: ${value}" role="img" aria-label="Cluster rating ${value}, ${label}"><span class="cluster-score-value">${value}</span><span class="cluster-score-label">${label}</span><span class="cluster-score-meter" aria-hidden="true"><i style="--w:${score < 0 ? intensity : '0%'}"></i><i style="--w:${score > 0 ? intensity : '0%'}"></i></span></div>`;
  }

  function sameEventHtml(article, articles) {
    if (!article.event_id) return '';
    const reports = articles.filter(other => other.event_id === article.event_id);
    if (reports.length < 2) return '';
    const esc = U().escapeHtml;
    return `<details class="same-event"><summary>Same event ×${reports.length}</summary><p>These ${reports.length} reports count once in the cluster score, using their median rating.</p><ul>${reports.map(a => `<li><strong>${esc(a.source || 'Source')}</strong> · ${esc(a.title || '')}</li>`).join('')}</ul></details>`;
  }

  function articleRatingStripHtml(articles) {
    const valid = (articles || []).filter(article => U().numericStance(article.rating ?? article.score) != null);
    const rated = valid.slice(0, 6);
    if (!rated.length) return `<div class="cluster-news-ratings cluster-news-ratings--missing" role="status"><span class="cluster-news-ratings-label">ARTICLE SCORES</span><span class="cluster-news-rating-missing">No ratings in this publish</span></div>`;
    const badges = rated.map(article => {
      const rating = Number(article.rating ?? article.score);
      const tone = rating > 0 ? 'positive' : rating < 0 ? 'negative' : 'neutral';
      const value = `${rating > 0 ? '+' : ''}${rating}`;
      return `<span class="cluster-news-rating cluster-news-rating--${tone}" title="${U().escapeHtml(article.title || 'Article rating')}">${value}</span>`;
    }).join('');
    const extra = valid.length - rated.length;
    return `<div class="cluster-news-ratings" aria-label="Article ratings"><span class="cluster-news-ratings-label">NEWS</span>${badges}${extra > 0 ? `<span class="cluster-news-rating-more">${extra} more articles</span>` : ''}</div>`;
  }

  /**
   * Average % since publish for a stock list (uses priceAtPublish vs live).
   * @param {Array<Object>} list
   * @returns {Promise<number|null>}
   */
  async function averageSincePublish(list) {
    return (await basketSincePublish(list)).average;
  }

  async function basketSincePublish(list, asOf) {
    const stocks = [...new Map((list || []).map((stock, i) => [U().normalizeSymbol(stock.symbol) || `unresolved-${i}`, stock])).values()];
    const result = { average: null, priced: 0, total: stocks.length };
    if (!stocks.length || !window.ClustrQuotes) return result;
    const quotes = await (window.ClustrQuotes.getLatestQuotes || window.ClustrQuotes.getQuotes)(stocks.map(stock => stock.symbol).filter(U().isQuoteSymbol));
    const deltas = [];
    for (const s of stocks) {
      const pub = s.priceAtPublish ?? s.price;
      if (pub == null || !Number.isFinite(Number(pub)) || Number(pub) <= 0) continue;
      const live = quotes[U().normalizeSymbol(s.symbol)];
      if (!live || live.price == null || !Number.isFinite(Number(live.price)) || Number(live.price) <= 0) continue;
      if (Number.isFinite(Date.parse(live.asOf)) && Date.parse(live.asOf) < Date.parse(asOf)) continue;
      deltas.push(
        ((Number(live.price) - Number(pub)) / Number(pub)) * 100
      );
    }
    result.priced = deltas.length;
    if (deltas.length) result.average = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    return result;
  }

  /**
   * @deprecated use averageSincePublish on fixed_stocks
   * @param {Object} group
   * @returns {Promise<number|null>}
   */
  async function sectorDefaultSincePublish(group) {
    return averageSincePublish(group.fixed_stocks || group.default_stocks || []);
  }

  /**
   * History rows for same-named clusters across publishes (oldest → newest).
   * Includes cluster-default stock snapshots for price math.
   * @param {string} clusterName
   * @returns {Array<Object>}
   */
  function stanceHistoryForCluster(clusterName, context) {
    if (window.ClustrApi && typeof window.ClustrApi.localStanceHistory === 'function') {
      return window.ClustrApi.localStanceHistory(clusterName, context);
    }
    return [];
  }

  /**
   * @param {string} stance
   * @returns {number}
   */
  function stanceScore(stance) {
    return U().numericStance(stance);
  }

  function historyRowScore(row) {
    return stanceScore(row.stanceScore ?? row.stance_score ?? row.cluster_score);
  }

  function weeklyVelocity(history, asOf) {
    const valid = history.filter(row => historyRowScore(row) != null && Number.isFinite(Date.parse(row.date)));
    const cutoff = Date.parse(asOf) || Math.max(...valid.map(row => Date.parse(row.date)));
    if (!Number.isFinite(cutoff)) return null;
    const dayOf = timestamp => {
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(timestamp).map(part => [part.type, part.value]));
      return Date.UTC(+parts.year, +parts.month - 1, +parts.day) / 86400000;
    };
    const end = dayOf(cutoff), daily = new Map();
    for (const row of valid.slice().sort((a, b) => Date.parse(a.date) - Date.parse(b.date))) {
      const day = dayOf(Date.parse(row.date));
      if (day >= end - 6 && Date.parse(row.date) <= cutoff) daily.set(day, historyRowScore(row));
    }
    const rows = [...daily];
    if (rows.length < 3) return null;
    const meanX = rows.reduce((sum, row) => sum + row[0] - end, 0) / rows.length;
    const meanY = rows.reduce((sum, row) => sum + row[1], 0) / rows.length;
    const slope = rows.reduce((sum, row) => sum + (row[0] - end - meanX) * (row[1] - meanY), 0) / rows.reduce((sum, row) => sum + (row[0] - end - meanX) ** 2, 0);
    return { slope, delta: rows.at(-1)[1] - rows[0][1], count: rows.length };
  }

  function weeklyVelocityHtml(group) {
    const app = window.ClustrApp;
    const publish = app?.getPublishes?.()[app?.getPublishIndex?.() ?? 0];
    const history = stanceHistoryForCluster(group.name, group.__historyScope);
    const velocity = weeklyVelocity(history, publish?.created_at);
    const direction = !velocity || Math.abs(velocity.slope) < 0.05 ? 'flat' : velocity.slope > 0 ? 'up' : 'down';
    const velocityHtml = `<div class="weekly-velocity weekly-velocity--${direction}" title="Linear slope of the latest numeric score per US market calendar day over the last 7 days. Requires 3 observed days. Descriptive, not a forecast."><span>7-day velocity</span>${velocity ? `<strong>${direction === 'up' ? '↗' : direction === 'down' ? '↘' : '→'} ${velocity.slope >= 0 ? '+' : ''}${velocity.slope.toFixed(2)} pts/day</strong><span>Δ ${velocity.delta >= 0 ? '+' : ''}${velocity.delta.toFixed(1)} pts · ${velocity.count}/7 days</span>` : '<span>Needs 3 scored days</span>'}</div>`;
    return velocityHtml;
  }

  /**
   * For each history row, avg % of cluster defaults from that publish price → live.
   * @param {Array<Object>} history
   * @returns {Promise<Array<Object>>}
   */
  async function attachDefaultReturns(history, context = {}) {
    // Price line is one step ahead of stance:
    // - each publish i uses next publish's default snapshot prices as the "forward" price
    // - the last publish uses live quotes
    if (!history.length) {
      return history.map(h => ({ ...h, defaultRet: null, priceBasis: null }));
    }

    const app = window.ClustrApp;
    const selected = app?.getPublishes?.()[app?.getPublishIndex?.() ?? 0];
    const newest = app?.getPublishes?.().find(p => p.market === (context.market || selected?.market));
    const useLatestQuote = !newest || Date.parse(context.asOf || selected?.created_at) >= Date.parse(newest.created_at);
    const symSet = new Set();
    for (const h of useLatestQuote ? history.slice(-1) : []) {
      for (const s of h.defaults || []) {
        const symbol = typeof s === 'string' ? s : s?.symbol;
        if (symbol) symSet.add(U().normalizeSymbol(symbol));
      }
    }

    let quotes = {};
    if (window.ClustrQuotes && symSet.size) {
      try {
        quotes = await window.ClustrQuotes.getQuotes([...symSet]);
      } catch (err) {
        console.warn('attachDefaultReturns quotes', err);
      }
    }

    function priceMapFromDefaults(defaults, prices = {}) {
      const map = {};
      for (const raw of defaults || []) {
        const s = typeof raw === 'string' ? { symbol: raw } : raw;
        const sym = U().normalizeSymbol(s?.symbol);
        if (!sym) continue;
        const px = [s.priceAtPublish, s.price_at_publish, s.price, prices[sym]].find(value =>
          ['number', 'string'].includes(typeof value) && String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) > 0);
        if (px == null) continue;
        map[sym] = Number(px);
      }
      return map;
    }

    const missingSymbols = new Set();
    history.slice(0, -1).forEach((h, i) => {
      const start = priceMapFromDefaults(h.defaults, h.prices);
      const next = history[i + 1];
      const end = { ...next.prices, ...priceMapFromDefaults(next.defaults, next.prices) };
      for (const raw of h.defaults || []) {
        const symbol = U().normalizeSymbol(typeof raw === 'string' ? raw : raw?.symbol);
        if (symbol && (!(start[symbol] > 0) || !(end[symbol] > 0))) missingSymbols.add(symbol);
      }
    });
    let historical = {};
    if (missingSymbols.size && window.ClustrQuotes?.getHistoricalPrices) {
      try { historical = await window.ClustrQuotes.getHistoricalPrices([...missingSymbols], history.map(h => h.date), context.market || selected?.market || 'US'); }
      catch (err) { console.warn('Historical price backfill unavailable', err); }
    }
    function historicalAt(symbol, date) {
      const target = Date.parse(date);
      let best = null;
      for (const point of historical[symbol] || []) {
        const time = Date.parse(point.asOf);
        if (Number.isFinite(time) && time <= target && target - time <= 7 * 86400000 &&
            typeof point.price === 'number' && Number.isFinite(point.price) && point.price > 0 && (!best || time > best.time)) best = { price: point.price, time };
      }
      return best?.price;
    }

    return history.map((h, i) => {
      const isLast = i === history.length - 1;
      const startMap = priceMapFromDefaults(h.defaults, h.prices);
      let endMap = {};
      let priceBasis = 'next';

      if (isLast) {
        priceBasis = useLatestQuote ? 'latest quote' : 'unavailable';
        for (const sym of Object.keys(startMap)) {
          const live = quotes[sym];
          if (live && live.price != null && (!Number.isFinite(Date.parse(live.asOf)) || Date.parse(live.asOf) >= Date.parse(h.date))) endMap[sym] = Number(live.price);
        }
      } else {
        const next = history[i + 1];
        endMap = { ...next.prices, ...priceMapFromDefaults(next.defaults, next.prices) };
      }

      const deltas = [];
      let historicalN = 0;
      if (!isLast) {
        for (const raw of h.defaults || []) {
          const symbol = U().normalizeSymbol(typeof raw === 'string' ? raw : raw?.symbol);
          if (startMap[symbol] > 0 && endMap[symbol] > 0) continue;
          // Use both historical endpoints together; don't mix split-adjusted history with raw snapshots.
          const start = historicalAt(symbol, h.date);
          const end = historicalAt(symbol, history[i + 1].date);
          if (start > 0 && end > 0) {
            startMap[symbol] = start;
            endMap[symbol] = end;
            historicalN++;
          }
        }
      }
      for (const sym of Object.keys(startMap)) {
        const pub = startMap[sym];
        const fwd = endMap[sym];
        if (!Number.isFinite(fwd) || fwd < 0 || !Number.isFinite(pub) || pub <= 0) continue;
        const change = ((fwd - pub) / pub) * 100;
        if (Number.isFinite(change)) deltas.push(change);
      }

      const defaultRet =
        deltas.length > 0
          ? deltas.reduce((a, b) => a + b, 0) / deltas.length
          : null;
      if (historicalN) priceBasis = 'next · historical hourly backfill (' + historicalN + ')';
      return { ...h, defaultRet, sampleN: deltas.length, totalN: (h.defaults || []).length, priceBasis, historicalN };
    });
  }

  /**
   * Aggregate default returns by stance label.
   * @param {Array<Object>} enriched
   * @returns {{constructive: number|null, watch: number|null, cautious: number|null, insight: string}}
   */
  function stancePriceStats(enriched) {
    const buckets = { constructive: [], watch: [], cautious: [] };
    for (const row of enriched) {
      if (row.defaultRet == null) continue;
      const k = U().stanceCategory(historyRowScore(row)) || row.stance;
      if (buckets[k]) buckets[k].push(row.defaultRet);
    }
    const avg = arr =>
      arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const constructive = avg(buckets.constructive);
    const watch = avg(buckets.watch);
    const cautious = avg(buckets.cautious);

    const insight = 'Equal-weight returns to the next cluster publish; the newest interval uses the latest available quote. Intervals differ in length. These averages are descriptive, not cumulative performance.';
    return { constructive, watch, cautious, insight, counts: Object.fromEntries(Object.entries(buckets).map(([key, values]) => [key, values.length])) };
  }

  /**
   * Build SVG dual chart: stance dots + default return line (normalized).
   * @param {Array<Object>} enriched
   * @returns {string}
   */
  /**
   * Destroy previous Chart.js instance on a canvas.
   * @param {HTMLCanvasElement|null} canvas
   * @returns {void}
   */
  function destroyStanceChart(canvas) {
    if (!canvas) return;
    if (canvas._clustrChart) {
      try {
        canvas._clustrChart.destroy();
      } catch (_) {}
      canvas._clustrChart = null;
    }
  }

  function symmetricReturnRange(values) {
    const largest = Math.max(0, ...values.filter(Number.isFinite).map(value => Math.abs(value)));
    const padded = Math.max(largest * 1.1, 0.1);
    const power = Math.pow(10, Math.floor(Math.log10(padded)));
    const normalized = padded / power;
    const ceiling = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * power;
    return { min: -ceiling, max: ceiling };
  }

  function stanceChartSeries(enriched, { cumulativeStance = false, cumulativePrice = false } = {}, now = Date.now()) {
    const rows = (enriched || []).filter(row => Number.isFinite(Date.parse(row.date)))
      .slice().sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    if (!rows.length) return { stanceData: [], retData: [], priceIncomplete: false };
    const timestamps = rows.map(row => Date.parse(row.date));
    const lastTime = rows.at(-1).priceBasis === 'latest quote' ? Math.max(now, timestamps.at(-1) + 1) : timestamps.at(-1);
    let stanceRows = rows;
    if (cumulativeStance) {
      const latestByDay = new Map();
      for (const row of rows) latestByDay.set(new Date(row.date).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }), row);
      stanceRows = [...latestByDay.values()];
    }
    let totalStance = 0;
    const stanceData = stanceRows.map(row => {
      const score = historyRowScore(row);
      if (score != null) totalStance += score;
      return { x: Date.parse(row.date), y: score == null ? null : cumulativeStance ? totalStance : score };
    });
    let wealth = 1, priceIncomplete = false, segmentOpen = false, priceSegments = 0, pricedIntervals = 0;
    const retData = [];
    rows.forEach((row, i) => {
      const value = row.defaultRet;
      let y = Number.isFinite(value) && value >= -100 ? value : null;
      if (y != null) pricedIntervals++;
      if (cumulativePrice) {
        if (y == null) {
          priceIncomplete = true; segmentOpen = false;
        } else {
          if (!segmentOpen) {
            segmentOpen = true; priceSegments++;
            retData.push({ x: timestamps[i], y: (wealth - 1) * 100, baseline: true, segment: priceSegments });
          }
          wealth *= 1 + y / 100;
          if (!Number.isFinite(wealth)) { priceIncomplete = true; segmentOpen = false; }
        }
        y = !segmentOpen ? null : (wealth - 1) * 100;
      }
      retData.push({ x: timestamps[i + 1] ?? lastTime, y, source: row, segment: cumulativePrice ? priceSegments : undefined });
    });
    return { stanceData, retData, priceIncomplete, priceSegments, pricedIntervals };
  }

  /**
   * Mount Chart.js dual series (stance score + defaults→live %) full width.
   * @param {HTMLCanvasElement|null} canvas
   * @param {Array<Object>} enriched
   * @returns {void}
   */
  function mountStanceChart(canvas, enriched, { cumulativeStance = false, cumulativePrice = false } = {}) {
    if (!canvas || !window.Chart) return;
    destroyStanceChart(canvas);
    const series = stanceChartSeries(enriched, { cumulativeStance, cumulativePrice });
    const { stanceData, retData } = series;
    if (!stanceData.length) return;
    const returnRange = symmetricReturnRange(retData.map(point => point.y));
    const stanceExtent = cumulativeStance ? Math.max(10, symmetricReturnRange(stanceData.map(point => point.y)).max) : 10;

    const accent =
      getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() ||
      '#f97316';
    const up =
      getComputedStyle(document.documentElement).getPropertyValue('--up').trim() ||
      '#4ade80';
    const down =
      getComputedStyle(document.documentElement).getPropertyValue('--down').trim() ||
      '#f87171';
    const meta =
      getComputedStyle(document.documentElement).getPropertyValue('--text-meta').trim() ||
      '#94a3b8';
    const border =
      getComputedStyle(document.documentElement).getPropertyValue('--border').trim() ||
      '#333';

    const pointColors = stanceData
      .map(point => {
        const s = point.y;
        if (s > 0) return up;
        if (s < 0) return down;
        return meta;
      })
      .concat(['transparent']);

    const chart = new window.Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        datasets: [
          {
            label: cumulativeStance ? 'Cumulative stance index' : 'Stance',
            data: stanceData,
          yAxisID: 'yStance',
            borderColor: meta,
            backgroundColor: 'transparent',
            pointBackgroundColor: pointColors,
            pointBorderColor: pointColors,
            pointRadius: 5,
            pointHoverRadius: 7,
            borderWidth: 2,
            tension: 0,
            spanGaps: false
          },
          {
            label: cumulativePrice ? series.priceIncomplete ? 'Partial cumulative price % · missing intervals excluded' : 'Cumulative matched-default return %' : 'Defaults → next publish / latest quote %',
            data: retData,
            yAxisID: 'yRet',
            borderColor: accent,
            backgroundColor: 'transparent',
            pointBackgroundColor: accent,
            pointRadius: 4,
            borderWidth: 2,
            borderDash: [5, 4],
            tension: 0,
            spanGaps: false,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        parsing: false,
        animation: false,
        maintainAspectRatio: false,
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        plugins: {
          legend: {
            display: true,
            labels: {
              color: meta,
              boxWidth: 12,
              font: { size: 11 }
            }
          },
          tooltip: {
            callbacks: {
              title: items => items[0] ? new Date(items[0].parsed.x).toLocaleString() : '',
              label: item => item.datasetIndex === 0
                ? `${cumulativeStance ? 'Cumulative stance index' : 'Stance'}: ${item.parsed.y ?? 'unavailable'}`
                : item.raw.baseline ? `Accumulation ${item.raw.segment > 1 ? 'resumes' : 'starts'}: ${U().formatPct(item.parsed.y)}`
                : `${cumulativePrice ? 'Compounded priced intervals' : 'Interval return'}: ${U().formatPct(item.parsed.y)} · ${item.raw.source.sampleN}/${item.raw.source.totalN} stocks priced · ${item.raw.source.priceBasis}`
            }
          }
        },
        scales: {
          x: {
            type: 'linear',
            ticks: { color: meta, maxRotation: 0, autoSkip: true, maxTicksLimit: 6, callback: value => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) },
            grid: { color: border }
          },
          yStance: {
            type: 'linear',
            position: 'left',
            min: -stanceExtent,
            max: stanceExtent,
            ticks: {
              color: meta,
              stepSize: cumulativeStance ? undefined : 5,
              callback(v) {
                return `${v > 0 ? '+' : ''}${v}`;
              }
            },
            grid: { color: border }
          },
          yRet: {
            type: 'linear',
            position: 'right',
            min: returnRange.min,
            max: returnRange.max,
            ticks: {
              color: accent,
              callback(v) {
                return v + '%';
              }
            },
            grid: { drawOnChartArea: false }
          }
        }
      }
    });
    canvas._clustrChart = chart;
    return series;
  }

  /**
   * Panel HTML with empty canvas; call mountStanceChart after insert.
   * @param {Array<Object>} enriched
   * @returns {string}
   */
  function stanceChartShellHtml() {
    return `
      <div class="stance-chart-controls" role="group" aria-label="Stance history chart modes">
        <button type="button" role="switch" aria-checked="true" class="dash-mode-toggle" data-cumulative-stance><span class="dash-switch-track" aria-hidden="true"></span><span>Cumulative stance</span></button>
        <button type="button" role="switch" aria-checked="true" class="dash-mode-toggle" data-cumulative-price><span class="dash-switch-track" aria-hidden="true"></span><span>Cumulative price</span></button>
      </div>
      <div class="stance-history-chart-wrap">
        <canvas class="stance-history-canvas" aria-label="Stance and theme comparison basket returns"></canvas>
      </div><p class="history-data-note" data-stance-chart-note aria-live="polite"></p>`;
  }

  function mountStanceHistory(root, enriched) {
    bindStanceHistoryToggle(root);
    const canvas = root.querySelector('.stance-history-canvas');
    const stanceToggle = root.querySelector('[data-cumulative-stance]');
    const priceToggle = root.querySelector('[data-cumulative-price]');
    const note = root.querySelector('[data-stance-chart-note]');
    const draw = () => {
      const cumulativeStance = stanceToggle?.getAttribute('aria-checked') === 'true';
      const cumulativePrice = priceToggle?.getAttribute('aria-checked') === 'true';
      const series = mountStanceChart(canvas, enriched, { cumulativeStance, cumulativePrice });
      const stanceNote = cumulativeStance ? 'Stance sums the latest score per US calendar day; missing scores remain gaps. This is an index, not a percentage.' : 'Stance shows each publish’s score (−10 to +10).';
      const priceNote = 'The preset theme basket is a comparison, not confirmed event exposure. ' + (cumulativePrice ? 'Price compounds equal-weight returns for matched default stocks, rebalanced at each publish; basket membership and coverage can change. This is not a fixed-basket buy-and-hold return.' : 'Price shows each interval return to the next publish or latest available quote.');
      const gapNote = cumulativePrice && series?.priceIncomplete ? ' Unpriced intervals remain gaps and are excluded. Accumulation resumes from the last known value, never resets to 0%. This partial index is not a complete whole-period return.' : '';
      const historyNote = enriched.some(row => row.historicalN > 0) ? ' Missing snapshots are backfilled using completed historical hourly bars at or before each publish (up to 7 days old); these are approximate publish-time prices, not exact executions.' : '';
      const emptyNote = series?.pricedIntervals === 0 ? ' No comparable prices are available for this cluster yet.' : '';
      if (note) note.textContent = `${stanceNote} ${priceNote}${historyNote}${gapNote}${emptyNote} Summary cards below remain interval averages.`;
    };
    for (const toggle of [stanceToggle, priceToggle]) toggle?.addEventListener('click', () => {
      toggle.setAttribute('aria-checked', String(toggle.getAttribute('aria-checked') !== 'true'));
      draw();
    });
    draw();
  }

  /** shell; content written after quotes load.
   * @param {Object} group
   * @returns {Promise<string>}
   */
  async function stanceHistoryPanelHtml(group) {
    const util = U();
    let history = [];
    if (window.ClustrApi && typeof window.ClustrApi.fetchStanceHistory === 'function') {
      try {
        history = await window.ClustrApi.fetchStanceHistory(group.name, group.__historyScope);
      } catch (err) {
        console.warn(err);
        history = stanceHistoryForCluster(group.name, group.__historyScope);
      }
    } else {
      history = stanceHistoryForCluster(group.name, group.__historyScope);
    }
    if (history.length < 1) {
      return {
        enriched: [],
        html: `<div class="stance-history-empty">No prior publishes with this cluster name yet.</div>`
      };
    }

    const enriched = await attachDefaultReturns(history, group.__historyScope);
    const stats = stancePriceStats(enriched);
    const chart = stanceChartShellHtml();

    const fmt = v => (v == null ? '—' : util.formatPct(v));

    const list = enriched
      .slice()
      .reverse()
      .map(row => {
        const d = row.date ? new Date(row.date).toLocaleString() : '—';
        const ret =
          row.defaultRet == null
            ? '<span class="muted">n/a</span>'
            : `<span class="${util.toneClass(row.defaultRet)}">${util.formatPct(
                row.defaultRet
              )}</span>`;
        return `<div class="stance-history-row stance-${util.escapeHtml(
          row.stance
        )}">
          <span class="stance-history-dot"></span>
          <span class="stance-history-stance">${util.escapeHtml(
            row.stance
          )}</span>
          <span class="stance-history-ret" title="Theme comparison basket → next publish (last point = live)">${ret}</span>
          <span class="stance-history-date">${util.escapeHtml(d)}</span>
        </div>`;
      })
      .join('');

    return {
      enriched,
      html: `
      <div class="stance-history-panel">
        <div class="stance-history-title">Stance × theme comparison basket</div>
        ${enriched.some(row => historyRowScore(row) == null) ? '<p class="history-data-note">Missing numeric stance scores are left as gaps; categorical labels are available in the history list.</p>' : ''}
        ${chart}
        <div class="stance-stat-grid">
          <div class="stance-stat">
            <div class="stance-stat-k">When Constructive</div>
            <div class="stance-stat-v ${util.toneClass(
              stats.constructive
            )}">${fmt(stats.constructive)}</div>
            <div class="stance-stat-h">${stats.counts.constructive} intervals · next / latest quote</div>
          </div>
          <div class="stance-stat">
            <div class="stance-stat-k">When Watch</div>
            <div class="stance-stat-v ${util.toneClass(
              stats.watch
            )}">${fmt(stats.watch)}</div>
            <div class="stance-stat-h">${stats.counts.watch} intervals · next / latest quote</div>
          </div>
          <div class="stance-stat">
            <div class="stance-stat-k">When Cautious</div>
            <div class="stance-stat-v ${util.toneClass(
              stats.cautious
            )}">${fmt(stats.cautious)}</div>
            <div class="stance-stat-h">${stats.counts.cautious} intervals · next / latest quote</div>
          </div>
        </div>
        <p class="stance-insight">${util.escapeHtml(stats.insight)}</p>
        <button type="button" class="stance-toggle-history" data-toggle-history aria-expanded="false">
          Show history list
        </button>
        <div class="stance-history-list is-collapsed" hidden>${list}</div>
      </div>`
    };
  }


  /**
   * Toggle show/hide for the stance history list (collapsed by default).
   * @param {ParentNode|null} root
   * @returns {void}
   */
  function bindStanceHistoryToggle(root) {
    if (!root) return;
    const btn = root.querySelector('[data-toggle-history]');
    const list = root.querySelector('.stance-history-list');
    if (!btn || !list) return;
    btn.addEventListener('click', () => {
      const open = list.classList.contains('is-collapsed') || list.hidden;
      if (open) {
        list.classList.remove('is-collapsed');
        list.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
        btn.textContent = 'Hide history list';
      } else {
        list.classList.add('is-collapsed');
        list.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
        btn.textContent = 'Show history list';
      }
    });
  }

  /**
   * Stance badge; history is available in the expanded chart tabs.
   * @param {Object} group
   * @param {number|null} _sectorAvg
   * @returns {string}
   */
  function stanceHtml(group, _sectorAvg) {
    const util = U();
    const score = groupRating(group);
    const hasScore = Number.isFinite(score) && score >= -10 && score <= 10;
    const stance = hasScore ? util.stanceCategory(score) : String(group.stance || 'watch').toLowerCase();
    const horizon = String(group.time_horizon || '').toLowerCase();
    const confidence = String(group.confidence || '').toLowerCase();

    const stanceText = {
      watch: 'Watch — monitor, no clear action yet',
      constructive: 'Constructive — possible upside if thesis holds',
      cautious: 'Cautious — higher risk / unclear payoff'
    }[stance] || 'Watch — monitor, no clear action yet';

    const horizonText = {
      days: 'Days — short-term move',
      weeks: 'Weeks — medium-term setup',
      months: 'Months — longer theme'
    }[horizon] || '';

    const confidenceText = {
      low: 'Low confidence',
      medium: 'Medium confidence',
      high: 'High confidence'
    }[confidence] || '';

    return `
      <div class="stance-wrap">
      <div class="stance stance-${util.escapeHtml(stance)}">
          <div class="stance-title">${util.escapeHtml(stanceText.split(' — ')[0])}</div>
          <div class="stance-sub">${util.escapeHtml(
            [horizonText, confidenceText].filter(Boolean).join(' · ')
          )}</div>
        </div>
      </div>`;
  }

  /**
   * Stock layer buckets for a cluster.
   * @param {Object} group
   * @returns {{groups: Array<{id:string,label:string,list:Array}>, chartPool: Array}}
   */
  function stockBuckets(group) {
    const mentioned = group.mentioned_stocks || [];
    const close = group.close_stocks || group.direct_stocks || [];
    const original = group.original_stocks || group.related_stocks || [];
    const fixed = (window.ClustrTaxonomy?.defaultBasketAllowed(group.name || group.group) ?? true) ? group.fixed_stocks || group.default_stocks || [] : [];
    const winners =
      group.connected_winners ||
      (group.movers || []).filter(
        m => m.side === 'winner' || (m.changePercent != null && m.changePercent > 0)
      );
    const losers =
      group.connected_losers ||
      (group.movers || []).filter(
        m => m.side === 'loser' || (m.changePercent != null && m.changePercent < 0)
      );

    const groups = [
      { id: 'mentioned', label: 'Mentioned in articles', description: 'Named in this cluster’s source articles. A mention alone does not establish exposure to every event or to the summary headline.', list: mentioned },
      { id: 'close', label: 'Suggested close links', description: 'Suggested connections to individual events in this cluster. Check the source articles for the specific company relationship.', list: close },
      { id: 'original', label: 'Second-order candidates', description: 'Potential indirect connections to individual events. These are candidates, not confirmed exposure to every event in this cluster.', list: original },
      { id: 'fixed', label: 'Theme comparison basket', description: 'Preset stocks for theme comparison. Inclusion does not establish exposure to the reported events; basket returns are not evidence of a reaction to this news.', list: fixed },
      { id: 'winners', label: 'Associated gainers', description: 'Market movers associated with the cluster. Their price moves do not establish that this news caused the change.', list: winners },
      { id: 'losers', label: 'Associated decliners', description: 'Market movers associated with the cluster. Their price moves do not establish that this news caused the change.', list: losers }
    ].filter(g => (g.list || []).length > 0);

    const chartPool = [];
    const seen = new Set();
    for (const g of groups) {
      for (const s of g.list) {
        const sym = U().normalizeSymbol(s.symbol);
        if (!U().isQuoteSymbol(sym) || seen.has(sym)) continue;
        seen.add(sym);
        chartPool.push(s);
      }
    }
    return { groups, chartPool };
  }

  /**
   * Stock bubble button HTML.
   * @param {Object} s
   * @returns {string}
   */
  function bubbleBtn(s) {
    const util = U();
    const debt =
      s.debtToEv != null
        ? ` · Debt/EV ${(Number(s.debtToEv) * 100).toFixed(0)}%`
        : '';
    return `
      <button type="button" ${util.isQuoteSymbol(s.symbol) ? '' : 'disabled aria-label="Ticker unavailable"'} class="md-chip md-chip--filter neutral" data-news-quote data-quote-market="${util.escapeHtml(s.__market || s.market || 'US')}" data-quote-name="${util.escapeHtml(s.name || s.symbol || '')}" data-symbol="${util.escapeHtml(
        s.symbol || ''
      )}" title="${util.escapeHtml((s.name || s.symbol || '') + debt)}">
        <span class="chip-label">${util.escapeHtml(s.symbol || s.name || '?')}</span>
        ${util.redditBuzzHtml(s.__redditBuzz)}
        <span class="chip-meta">${util.isQuoteSymbol(s.symbol) ? 'Loading quote…' : 'No quote'}</span>
      </button>`;
  }

  /**
   * Publish / live / since price bar.
   * @param {string} symbol
   * @param {string} name
   * @param {number|null} publishPrice
   * @param {number|null} publishPct
   * @param {{price?: number|null, changePercent?: number|null}|null} live
   * @returns {string}
   */
  function priceBarHtml(symbol, name, publishPrice, publishPct, live, stock) {
    const util = U();
    const livePrice = live?.price ?? null;
    const livePct = live?.changePercent ?? null;
    const predatesPublish = Number.isFinite(Date.parse(live?.asOf)) && Date.parse(live.asOf) < Date.parse(stock?.__publishAsOf);
    const since = predatesPublish ? null : util.deltaSincePublish(publishPrice, livePrice);
    const hasProxy = !!(window.ClustrQuotes && window.ClustrQuotes.isEnabled());
    const signals = stock?.technical_signals;
    const metric = value => Number.isFinite(Number(value)) && value != null ? util.formatPct(value) : '—';
    const unsignedMetric = value => Number.isFinite(Number(value)) && value != null ? `${Number(value).toFixed(1)}%` : '—';
    const turnover = Number.isFinite(Number(signals?.avgDailyTurnover20d)) && signals?.avgDailyTurnover20d != null
      ? `${util.escapeHtml(signals.currency || '')} ${new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(signals.avgDailyTurnover20d)}`.trim()
      : '—';

    return `
      <div class="price-bar" data-price-symbol="${util.escapeHtml(symbol)}">
        ${util.redditBuzzHtml(stock?.__redditBuzz, true)}
        <div class="price-bar-title"><span>${util.escapeHtml(symbol)}${
          name ? ' — ' + util.escapeHtml(name) : ''
        }</span>${window.ClustrWatchlist?.button({ symbol, name }, stock?.__market || 'US') || ''}</div>
        <div class="price-bar-grid">
          <div class="price-cell">
            <div class="price-label">At publish</div>
            <div class="price-value">${util.formatMoney(publishPrice)}</div>
            <div class="price-sub">${util.formatPct(publishPct) || '—'} · session change at publish</div>
          </div>
          <div class="price-cell">
            <div class="price-label">Latest quote</div>
            <div class="price-value">${
              livePrice != null ? util.formatMoney(livePrice) : '—'
            }</div>
            <div class="price-sub">${
              live ? `${util.formatPct(livePct) || '—'} · ${quoteSessionLabel(live, stock?.__market)}` : (hasProxy ? '…' : 'quotes off')
            }</div>
          </div>
          <div class="price-cell">
            <div class="price-label">Since publish</div>
            <div class="price-value ${util.toneClass(since)}">${
              since == null ? '—' : util.formatPct(since)
            }</div>
            <div class="price-sub">signal track</div>
          </div>
        </div>
        <div class="technical-metrics" aria-label="Historical price signals at publish">
          <div><span>Momentum 5d</span><strong class="${util.toneClass(signals?.momentum5dPct)}">${metric(signals?.momentum5dPct)}</strong></div>
          <div><span>Momentum 20d</span><strong class="${util.toneClass(signals?.momentum20dPct)}">${metric(signals?.momentum20dPct)}</strong></div>
          <div><span>Volatility 20d annualized</span><strong>${unsignedMetric(signals?.annualizedVolatility20dPct)}</strong></div>
          <div><span>Avg traded value/day 20d</span><strong>${turnover}</strong></div>
          <div><span>Volume vs prior 20d avg</span><strong>${Number.isFinite(Number(signals?.relativeVolume20d)) && signals?.relativeVolume20d != null ? Number(signals.relativeVolume20d).toFixed(2) + '×' : '—'}</strong></div>
        </div>
        <div class="technical-metrics-note">${signals?.status === 'ok' ? `Completed daily bars through ${util.escapeHtml(signals.asOf || '')}. Traded value is a liquidity proxy, not a spread quote.` : 'Historical price signals unavailable for this stock.'}</div>
        <div class="quote-asof">${predatesPublish ? 'Quote predates this publication; return unavailable. ' : ''}${live ? live.asOf && Number.isFinite(Date.parse(live.asOf)) ? `Regular-session quote as of ${util.escapeHtml(new Date(live.asOf).toLocaleString())} · may be delayed` : 'Quote timestamp unavailable' : 'Quote unavailable or loading'}</div>
      </div>`;
  }

  /**
   * Collect unique movers across groups.
   * @param {Array<Object>} groups
   * @returns {Array<Object>}
   */
  function collectMovers(groups) {
    const map = new Map();
    for (const g of groups || []) {
      for (const m of g.session_movers || []) {
        const sym = U().normalizeSymbol(m.symbol);
        if (!sym) continue;
        if (!map.has(sym)) {
          map.set(sym, {
            symbol: sym,
            name: m.name || sym,
            changePercent: m.changePercent,
            side: m.side || '',
            clusterRelevance: null,
            clusters: []
          });
        }
      }
      const push = (m, sideHint) => {
        const sym = U().normalizeSymbol(m.symbol);
        if (!sym) return;
        if (!map.has(sym)) {
          map.set(sym, {
            symbol: sym,
            name: m.name || sym,
            changePercent: m.changePercent,
            side: sideHint || m.side || '',
            clusterRelevance: m.clusterRelevance,
            clusters: [g.name]
          });
        } else {
          const row = map.get(sym);
          if (g.name && !row.clusters.includes(g.name)) row.clusters.push(g.name);
        }
      };
      for (const m of g.movers || []) push(m, m.side);
      for (const m of g.connected_winners || []) push(m, 'winner');
      for (const m of g.connected_losers || []) push(m, 'loser');
    }
    return [...map.values()];
  }

  /**
   * @param {Array<Object>} list
   * @param {string} mode
   * @returns {Array<Object>}
   */
  function filterMovers(list, mode) {
    if (mode === 'winners') {
      return list.filter(
        m => m.side === 'winner' || (m.changePercent != null && m.changePercent > 0)
      );
    }
    if (mode === 'losers') {
      return list.filter(
        m => m.side === 'loser' || (m.changePercent != null && m.changePercent < 0)
      );
    }
    return list
      .slice()
      .sort(
        (a, b) =>
          Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0)
      );
  }

  /**
   * @param {Array<Object>} groups
   * @param {string} mode
   * @param {(symbol: string) => void} [onPick]
   * @returns {void}
   */
  function renderMoversStrip(groups, mode, onPick) {
    const strip = document.getElementById('moversStrip');
    if (!strip) return;
    const util = U();
    const list = filterMovers(collectMovers(groups), mode || 'active');
    const body = strip.querySelector('.movers-chips');
    if (!body) return;

    body.innerHTML = list.length
      ? list
          .slice(0, 40)
          .map(m => {
            const t = util.toneClass(m.changePercent);
            return `
            <button type="button" class="md-chip md-chip--filter ${t}" data-symbol="${util.escapeHtml(
              m.symbol
            )}">
              <span class="chip-label">${util.escapeHtml(m.symbol)}</span>
              <span class="chip-meta">${util.escapeHtml(
                util.formatPct(m.changePercent) || ''
              )}</span>
            </button>`;
          })
          .join('')
      : '<span class="movers-empty">No movers in this publish</span>';

    body.querySelectorAll('[data-symbol]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (onPick) onPick(btn.getAttribute('data-symbol'));
      });
    });
  }

  /**
   * @param {Array<Object>} groups
   * @param {string} symbol
   * @returns {Array<Object>}
   */
  function clustersForSymbol(groups, symbol) {
    const s = U().normalizeSymbol(symbol);
    return (groups || []).filter(g => {
      const all = [
        ...(g.mentioned_stocks || []),
        ...(g.close_stocks || []),
        ...(g.original_stocks || []),
        ...(g.fixed_stocks || []),
        ...(g.direct_stocks || []),
        ...(g.related_stocks || []),
        ...(g.stocks || []),
        ...(g.connected_winners || []),
        ...(g.connected_losers || []),
        ...(g.movers || [])
      ];
      return all.some(x => U().normalizeSymbol(x.symbol) === s);
    });
  }

  /**
   * @param {Array<Object>} groups
   * @returns {Array<{country: string, count: number}>}
   */
  function collectCountries(groups) {
    const counts = {};
    for (const g of groups || []) {
      for (const a of g.articles || []) {
        const c = a.primary_country || 'Global';
        counts[c] = (counts[c] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * @param {Array<Object>} groups
   * @param {string} country
   * @returns {Array<Object>}
   */
  function articlesForCountry(groups, country) {
    const out = [];
    for (const g of groups || []) {
      for (const a of g.articles || []) {
        const primary = a.primary_country || 'Global';
        const list = Array.isArray(a.countries) ? a.countries : [primary];
        if (primary === country || list.includes(country)) {
          out.push({ ...a, cluster: g.name || '' });
        }
      }
    }
    const seen = new Set();
    return out.filter(a => {
      const k = (a.title || '') + '|' + (a.link || '');
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  /**
   * @param {string} title
   * @param {Array<Object>} clusters
   * @param {HTMLElement} mountEl
   * @returns {void}
   */
  function renderRelatedClusters(title, clusters, mountEl) {
    if (!mountEl) return;
    const util = U();
    if (mountEl.classList.contains('related-under-chart')) {
      mountEl.innerHTML = '';
    }
    let panel = mountEl.querySelector('.related-clusters-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'related-clusters related-clusters-panel';
      mountEl.appendChild(panel);
    }
    panel.innerHTML = `
      <div class="related-head">
        <div class="related-title">${util.escapeHtml(title)}</div>
        <div class="related-count">${clusters.length} cluster${
          clusters.length === 1 ? '' : 's'
        }</div>
      </div>
      <div class="related-list">
        ${
          clusters.length
            ? clusters
                .map(
                  g => {
                    const score = groupRating(g);
                    const valid = Number.isFinite(score) && score >= -10 && score <= 10;
                    const tone = valid ? util.stanceCategory(score) : 'watch';
                    const value = valid ? `${score > 0 ? '+' : ''}${Number.isInteger(score) ? score : score.toFixed(1)}` : '—';
                    return `
                <button type="button" class="related-item" data-cluster="${util.escapeHtml(
                  g.name
                )}">
                  <div class="related-item-t"><span>${util.escapeHtml(g.name)}</span><span class="related-impact related-impact--${tone}" aria-label="Cluster impact ${valid ? value : 'unavailable'}">${value}</span></div>
                  <div class="related-item-s">${(g.articles || []).length} articles</div>
                </button>`;
                  }
                )
                .join('')
            : '<div class="related-empty">No other clusters for this ticker</div>'
        }
      </div>`;
    panel.querySelectorAll('.related-item').forEach(btn => {
      btn.addEventListener('click', () => {
        if (window.ClustrApp) {
          window.ClustrApp.jumpToCluster(btn.getAttribute('data-cluster'));
        }
      });
    });
  }

  /**
   * Build one cluster card element.
   * @param {Object} group
   * @param {number} index
   * @param {Array<Object>} currentGroups
   * @returns {HTMLElement}
   */
  function buildGroupElement(group, index, currentGroups) {
    const util = U();
    const app = window.ClustrApp;
    const selected = app?.getPublishes?.()[app?.getPublishIndex?.() ?? 0];
    group = { ...group, __historyScope: { market: group.market || selected?.market, asOf: selected?.created_at } };
    const { groups: stockGroups, chartPool } = stockBuckets(group);
    const angles = group.opportunity_angles || group.angles || [];
    const articles = group.articles || [];
    const count = group.count || articles.length || 0;
    const categoryCounts = new Map();
    for (const article of articles) {
      const category = articleCategory(article);
      categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    }
    const defaultGroupId = stockGroups[0]?.id || '';

    const el = document.createElement('section');
    el.className = 'md-card cluster-card';
    el.dataset.cluster = group.name || '';

    el.innerHTML = `
      <div class="cluster-layout">
      <div class="cluster-main">
      <div class="cluster-top">
        <h2 class="cluster-name">${util.escapeHtml(group.name || 'Cluster')}</h2>
        ${clusterScoreHtml(group)}
        <div class="stance-mount">${stanceHtml(group, null)}</div>
      </div>

      <div class="cluster-body">
        <div class="cluster-overview">
        <div class="cluster-summary">
          <p class="cluster-reason cluster-reason--preview">${util.escapeHtml(
            group.reason || group.summary || ''
          )}</p>
          <div class="cluster-overview-footer">
            ${articleRatingStripHtml(articles)}
            <button type="button" class="cluster-expand" aria-expanded="false" aria-controls="cluster-details-${index}">
              <span>View analysis</span><svg class="cluster-expand-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
            </button>
          </div>
        </div>
        <div class="cluster-stance-preview">${weeklyVelocityHtml(group)}</div>
        <div class="cluster-context"><h3>Key drivers & context</h3>${angles.length ? `<ul class="cluster-drivers">${angles.map(a => `<li>${util.escapeHtml(String(a))}</li>`).join('')}</ul>` : '<p class="empty-state">No additional drivers supplied for this publish.</p>'}${marketSignalsHtml(group)}</div>
        </div>
        <div class="cluster-details" id="cluster-details-${index}" hidden>

        <div class="stock-panel">
          <div class="stock-panel-head">
            <label class="md-label" for="stock-group-${index}">Stock group</label>
            <select class="md-select stock-group-select" id="stock-group-${index}">
              ${stockGroups
                .map(
                  g =>
                    `<option value="${util.escapeHtml(g.id)}">${util.escapeHtml(
                      g.label
                    )} (${g.list.length})</option>`
                )
                .join('')}
            </select>
            <div class="group-since-publish" aria-live="polite"></div>
          </div>
          <p class="stock-group-context" role="note">${util.escapeHtml(stockGroups[0]?.description || 'No stock associations are available for the selected scope.')}</p>
          <p class="stock-group-context" data-news-quote-note>Latest regular-session prices · change vs previous close · refreshes every minute · may be delayed</p>
          <div class="bubbles-scroll stock-bubbles" role="group" aria-label="Stocks in selected group"></div>
        </div>

        <div class="stock-analysis">
        <div class="stock-sidebar">
        <div class="price-bar-mount"></div>
        <div class="related-under-chart"></div>
        </div>
        <div class="chart-folder" data-chart-folder="${index}">
          <div class="chart-folder-tabs" role="tablist">
            <button type="button" class="chart-tab is-active" data-chart-mode="stance" role="tab" aria-selected="true">Stance history</button>
            <button type="button" class="chart-tab" data-chart-mode="impact" role="tab" aria-selected="false">Impact timeline</button>
            <button type="button" class="chart-tab" data-chart-mode="tradingview" role="tab" aria-selected="false">TradingView</button>
          </div>
          <div class="chart chart-mode-stance" id="chart-stance-${index}"></div>
          <div class="chart chart-mode-impact is-hidden" id="chart-impact-${index}">${impactTimelineHtml(articles)}</div>
          <div class="chart chart-mode-tv is-hidden" id="chart-tv-${index}"></div>
        </div>
        </div>
        <button type="button" class="md-btn md-btn--text toggle-articles">
          Show articles &amp; scores (${count})
        </button>
        </div>
      </div>
      </div>

      <aside class="stance-aside" aria-label="Stance history panel">
        <div class="stance-history-mount hidden" hidden></div>
      </aside>
      </div>

      <div class="articles-panel hidden">
        <div class="article-category-tabs" role="group" aria-label="Article categories in ${util.escapeHtml(group.name || 'cluster')}">
          <button type="button" class="article-category-tab is-active" data-article-category="all" aria-pressed="true">All <span>${articles.length}</span></button>
          ${Object.entries(articleCategoryLabels).filter(([category]) => categoryCounts.has(category)).map(([category, label]) => `<button type="button" class="article-category-tab" data-article-category="${category}" aria-pressed="false">${label} <span>${categoryCounts.get(category)}</span></button>`).join('')}
        </div>
      <div class="article-grid articles">
        ${articles
          .map(
            a => `
          <article class="md-card md-card--outlined article-card" data-article-category="${articleCategory(a)}">
            <h3 class="article-title">${util.escapeHtml(a.title || '')}</h3>
            ${sameEventHtml(a, articles)}
            <div class="article-meta">
              ${util.escapeHtml(a.source || '')}
              ${
                a.date
                  ? ' · ' + util.escapeHtml(new Date(a.date).toLocaleString())
                  : ''
              }
              ${
                a.primary_country
                  ? `<span class="country-pill">${util.escapeHtml(
                      a.primary_country
                    )}</span>`
                  : ''
              }
              ${articleRatingHtml(a)}
              ${articleImpactWindowHtml(a)}
              ${polymarketArticleHtml(a)}
            </div>
            <p class="article-summary">${util.escapeHtml(
              a.short_summary || ''
            )}</p>
            <div class="article-co-row">
              ${(a.mentioned_companies || [])
                .map(m => {
                  const lab = m.symbol || m.name || '';
                  const dir = m.direction || m.sentiment || '';
                  const tone =
                    /bull|up|pos/i.test(dir)
                      ? 'up'
                      : /bear|down|neg/i.test(dir)
                        ? 'down'
                        : '';
                  return `<span class="art-co-bubble ${tone}" title="${util.escapeHtml(
                    (m.name || '') + (dir ? ' · ' + dir : '') + (m.confidence ? ' · ' + m.confidence : '')
                  )}">${util.escapeHtml(lab)}${
                    dir ? ' · ' + util.escapeHtml(dir) : ''
                  }</span>`;
                })
                .join('')}
              ${!(a.mentioned_companies || []).length
                ? (a.mentioned_company_names || [])
                    .map(
                      n =>
                        `<span class="art-co-bubble">${util.escapeHtml(
                          String(n)
                        )}</span>`
                    )
                    .join('')
                : ''}
            </div>
            ${
              a.link
                ? `<a class="md-link" href="${util.escapeHtml(
                    a.link
                  )}" target="_blank" rel="noopener">Read →</a>`
                : ''
            }
          </article>`
          )
          .join('')}
      </div></div>`;

    const stanceMount = el.querySelector('.stance-mount');
    const historyBtn =
      stanceMount && stanceMount.querySelector('[data-stance-history]');
    const historyMount = el.querySelector('.stance-history-mount');
    const stanceAside = el.querySelector('.stance-aside');
    let historyPanelPromise = null;
    const getHistoryPanel = () => {
      if (!historyPanelPromise) historyPanelPromise = stanceHistoryPanelHtml(group).catch(error => { historyPanelPromise = null; throw error; });
      return historyPanelPromise;
    };
    const closeHistoryAside = () => {
      destroyStanceChart(historyMount?.querySelector('.stance-history-canvas'));
      if (historyMount) historyMount.innerHTML = '';
      historyMount?.classList.add('hidden');
      if (historyMount) historyMount.hidden = true;
      stanceAside?.classList.remove('is-open');
      historyBtn?.classList.remove('is-open');
      historyBtn?.setAttribute('aria-pressed', 'false');
      if (historyBtn) historyBtn.title = 'Stance history';
    };
    if (historyBtn && historyMount) {
      historyBtn.addEventListener('click', async () => {
        const open = historyMount.classList.contains('hidden');
        if (open) {
          historyBtn.disabled = true;
          historyMount.innerHTML =
            '<div class="stance-history-empty">Loading stance × defaults…</div>';
          historyMount.classList.remove('hidden');
          historyMount.hidden = false;
          if (stanceAside) stanceAside.classList.add('is-open');
          try {
            const panel = await getHistoryPanel();
            if (!el.isConnected || !stanceAside?.classList.contains('is-open')) return;
            historyMount.innerHTML = panel.html;
            mountStanceHistory(historyMount, panel.enriched);
          } catch (err) {
            historyMount.innerHTML =
              '<div class="stance-history-empty">Could not load history</div>';
          }
          historyBtn.disabled = false;
          historyBtn.classList.add('is-open');
          historyBtn.setAttribute('aria-pressed', 'true');
          historyBtn.title = 'Hide stance history';
          requestAnimationFrame(() => {
            const target = stanceAside || historyMount;
            if (target && typeof target.scrollIntoView === 'function') {
              target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          });
        } else {
          closeHistoryAside();
        }
      });
    }

    const toggleBtn = el.querySelector('.toggle-articles');
    const articlesPanel = el.querySelector('.articles-panel');
    toggleBtn.addEventListener('click', () => {
      const hidden = articlesPanel.classList.contains('hidden');
      articlesPanel.classList.toggle('hidden', !hidden);
      toggleBtn.textContent = hidden
        ? `Hide articles (${count})`
        : `Show articles & scores (${count})`;
    });

    const expandBtn = el.querySelector('.cluster-expand');
    const details = el.querySelector('.cluster-details');
    if (expandBtn && details) {
      const toggleDetails = () => {
        const opening = details.hidden;
        details.hidden = !opening;
        el.classList.toggle('is-expanded', opening);
        expandBtn.setAttribute('aria-expanded', String(opening));
        expandBtn.querySelector('span').textContent = opening
          ? 'Hide analysis'
          : 'View analysis';
        if (opening) {
          closeHistoryAside();
          historyBtn?.removeAttribute('disabled');
          ensureExpandedContent();
        } else {
          articlesPanel.classList.add('hidden');
          toggleBtn.textContent = `Show articles & scores (${count})`;
        }
      };
      el.addEventListener('click', event => {
        if (!event.target.closest('.cluster-top, .cluster-overview') || event.target.closest('.cluster-context')) return;
        if (event.target.closest('button, a, input, select, textarea, summary') &&
            !event.target.closest('.cluster-expand')) return;
        if (!event.target.closest('.cluster-expand') && window.getSelection()?.toString()) return;
        toggleDetails();
      });
    }
    const categoryTabs = [...el.querySelectorAll('.article-category-tab')];
    const articleCards = [...el.querySelectorAll('.article-grid .article-card')];
    for (const tab of categoryTabs) {
      tab.addEventListener('click', () => {
        const selected = tab.dataset.articleCategory;
        for (const option of categoryTabs) {
          const active = option === tab;
          option.classList.toggle('is-active', active);
          option.setAttribute('aria-pressed', String(active));
        }
        for (const card of articleCards) card.hidden = selected !== 'all' && card.dataset.articleCategory !== selected;
      });
    }

    const select = el.querySelector('.stock-group-select');
    const bubblesEl = el.querySelector('.stock-bubbles');
    const chartStance = el.querySelector(`#chart-stance-${index}`);
    const chartImpact = el.querySelector(`#chart-impact-${index}`);
    const chartTv = el.querySelector(`#chart-tv-${index}`);
    const chartFolder = el.querySelector(`[data-chart-folder="${index}"]`);
    const priceMount = el.querySelector('.price-bar-mount');
    const relatedMount = el.querySelector('.related-under-chart');
    /** @type {'stance'|'impact'|'tradingview'} */
    let chartMode = 'stance';
    let stanceMounted = false;
    let stockRequest = 0;
    let groupRequest = 0;
    let expandedInitialized = false;

    const findStock = symbol => {
      const s = util.normalizeSymbol(symbol);
      return (
        { ...(chartPool.find(x => util.normalizeSymbol(x.symbol) === s) || {
          symbol: s,
          name: s
        }), __redditBuzz: util.redditBuzzForStock([group], s, group.__historyScope.market || group.market || 'US', group.__historyScope.asOf) }
      );
    };

    const showRelatedForSymbol = symbol => {
      if (!symbol || !relatedMount) return;
      const clusters = clustersForSymbol(currentGroups, symbol).filter(
        g => (g.name || '') !== (group.name || '')
      );
      renderRelatedClusters(
        `Related clusters · ${symbol}`,
        clusters,
        relatedMount
      );
    };

    /**
     * @param {string} symbol
     * @param {string} [name]
     * @returns {Promise<void>}
     */
    const applyChartMode = () => {
      if (!chartStance || !chartImpact || !chartTv) return;
      const stanceOn = chartMode === 'stance';
      chartStance.classList.toggle('is-hidden', !stanceOn);
      chartImpact.classList.toggle('is-hidden', chartMode !== 'impact');
      chartTv.classList.toggle('is-hidden', chartMode !== 'tradingview');
      if (chartFolder) {
        chartFolder.querySelectorAll('[data-chart-mode]').forEach(btn => {
          const on = btn.getAttribute('data-chart-mode') === chartMode;
          btn.classList.toggle('is-active', on);
          btn.setAttribute('aria-selected', on ? 'true' : 'false');
          btn.tabIndex = on ? 0 : -1;
          btn.id = `chart-tab-${index}-${btn.dataset.chartMode}`;
          btn.setAttribute('aria-controls', `chart-${btn.dataset.chartMode === 'tradingview' ? 'tv' : btn.dataset.chartMode}-${index}`);
        });
        [chartStance, chartImpact, chartTv].forEach((panel, i) => {
          panel.setAttribute('role', 'tabpanel');
          panel.setAttribute('aria-labelledby', `chart-tab-${index}-${['stance', 'impact', 'tradingview'][i]}`);
        });
      }
    };

    const fillStanceChart = async () => {
      if (!chartStance || stanceMounted) return;
      chartStance.innerHTML =
        '<div class="stance-history-empty">Loading stance × defaults…</div>';
      try {
        const panel = await getHistoryPanel();
        if (stanceMounted || details.hidden || !el.isConnected) return;
        chartStance.innerHTML = panel.html;
        mountStanceHistory(chartStance, panel.enriched);
        stanceMounted = true;
      } catch (err) {
        chartStance.innerHTML =
          '<div class="stance-history-empty">Could not load stance history</div>';
      }
    };

    const fillTradingView = (symbol, name) => {
      if (!chartTv || !symbol) return;
      const util = U();
      const url =
        typeof util.tradingViewUrl === 'function'
          ? util.tradingViewUrl(symbol)
          : `https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(
              symbol
            )}&interval=D&theme=dark&style=1&locale=en&hide_top_toolbar=1`;
      chartTv.innerHTML = `
        <div class="chart-name">${util.escapeHtml(symbol)} — ${util.escapeHtml(
        name || symbol
      )}</div>
        <iframe src="${url}" width="100%" height="320" frameborder="0" allowtransparency="true" scrolling="no"></iframe>`;
    };

    /** @type {string} */
    let activeSymbol = '';
    /** @type {string} */
    let activeName = '';

    const showChart = async (symbol, name) => {
      if (!symbol) return;
      const request = ++stockRequest;
      activeSymbol = symbol;
      activeName = name || symbol;
      const stock = { ...findStock(symbol), __publishAsOf: group.__historyScope.asOf, __market: group.__historyScope.market || group.market };
      const publishPrice = stock.priceAtPublish ?? stock.price ?? null;
      const publishPct =
        stock.changePercentAtPublish ?? stock.changePercent ?? null;

      priceMount.innerHTML = priceBarHtml(
        symbol,
        name || stock.name,
        publishPrice,
        publishPct,
        null,
        stock
      );

      bubblesEl.querySelectorAll('[data-symbol]').forEach(b => {
        b.classList.toggle(
          'is-selected',
          b.getAttribute('data-symbol') === symbol
        );
      });
      showRelatedForSymbol(symbol);
      applyChartMode();

      if (chartMode === 'tradingview') {
        fillTradingView(symbol, name || stock.name);
      }

      if (window.ClustrQuotes) {
        let live = null;
        try { live = window.ClustrQuotes.getLatestQuotes ? (await window.ClustrQuotes.getLatestQuotes([symbol], stock.__market || 'US'))[util.normalizeSymbol(symbol)] : await window.ClustrQuotes.getQuote(symbol); } catch (_) {}
        if (request !== stockRequest) return;
        if (live) {
          priceMount.innerHTML = priceBarHtml(
            symbol,
            name || stock.name,
            publishPrice,
            publishPct,
            live,
            stock
          );
        } else {
          const message = priceMount.querySelector('.quote-asof');
          if (message) message.textContent = 'Quote unavailable; publish snapshot retained.';
        }
      }
    };

    if (chartFolder) {
      chartFolder.querySelectorAll('[data-chart-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
          const mode = btn.getAttribute('data-chart-mode');
          if (mode !== 'stance' && mode !== 'impact' && mode !== 'tradingview') return;
          chartMode = mode;
          applyChartMode();
          if (chartMode === 'stance') fillStanceChart();
          else if (chartMode === 'tradingview' && activeSymbol) fillTradingView(activeSymbol, activeName);
        });
      });
      chartFolder.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !event.target.matches('[role="tab"]')) return;
        const tabs = [...chartFolder.querySelectorAll('[role="tab"]')];
        const current = tabs.indexOf(event.target);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        event.preventDefault(); tabs[next].click(); tabs[next].focus();
      });
    }

    function bindBubbles() {
      bubblesEl.querySelectorAll('[data-symbol]').forEach(btn => {
        btn.addEventListener('click', () => {
          const symbol = btn.getAttribute('data-symbol');
          if (!symbol) return;
          showChart(symbol, findStock(symbol).name || symbol);
        });
      });
    }

    const sinceEl = el.querySelector('.group-since-publish');

    /**
     * Update average since-publish for the active stock bucket.
     * @param {string} groupId
     * @returns {Promise<void>}
     */
    async function updateGroupSincePublish(groupId) {
      if (!sinceEl) return;
      const request = ++groupRequest;
      const g = stockGroups.find(x => x.id === groupId) || stockGroups[0];
      if (!g || !(g.list || []).length) {
        sinceEl.textContent = '';
        sinceEl.className = 'group-since-publish';
        return;
      }
      sinceEl.className = 'group-since-publish is-loading';
      sinceEl.textContent = `${g.label} · loading…`;
      let basket;
      try { basket = await basketSincePublish(g.list, group.__historyScope.asOf); } catch (_) { basket = { average: null, priced: 0, total: g.list.length }; }
      if (request !== groupRequest || select.value !== g.id) return;
      const avg = basket.average;
      if (avg == null) {
        sinceEl.className = 'group-since-publish';
        sinceEl.textContent = `${g.label} · ${basket.priced}/${basket.total} stocks priced · return unavailable`;
        return;
      }
      const tone = util.toneClass(avg);
      sinceEl.className = `group-since-publish ${tone}`;
      sinceEl.innerHTML = `<span class="group-since-label">${util.escapeHtml(
        g.label
      )}</span> <span class="group-since-value">${util.formatPct(
        avg
      )}</span> <span class="group-since-hint">since publish · ${basket.priced}/${basket.total} stocks priced · equal weight</span>`;
    }

    function renderBubbleGroup(groupId) {
      const g = stockGroups.find(x => x.id === groupId) || stockGroups[0];
      el.querySelector('.stock-group-context').textContent = g?.description || 'No stock associations are available for the selected scope.';
      if (!g) {
        bubblesEl.innerHTML = '<span class="stock-empty">No stocks</span>';
        ++stockRequest;
        activeSymbol = '';
        priceMount.innerHTML = '<p class="empty-state">No priced stocks in this group.</p>';
        return;
      }
      bubblesEl.innerHTML = g.list.map(stock => bubbleBtn({ ...stock, __market: group.__historyScope.market || group.market || 'US', __redditBuzz: util.redditBuzzForStock([group], stock.symbol, group.__historyScope.market || group.market || 'US', group.__historyScope.asOf) })).join('');
      bindBubbles();
      refreshNewsQuotes(el);
      if (!details.hidden) updateGroupSincePublish(g.id);
    }

    if (select && stockGroups.length) {
      select.value = defaultGroupId;
      select.addEventListener('change', () => {
        renderBubbleGroup(select.value);
        const firstBtn = bubblesEl.querySelector('[data-symbol]:not(:disabled)');
        if (firstBtn) firstBtn.click();
        else { ++stockRequest; activeSymbol = ''; priceMount.innerHTML = '<p class="empty-state">No usable ticker in this group.</p>'; }
      });
      renderBubbleGroup(defaultGroupId);
    } else if (bubblesEl) {
      bubblesEl.innerHTML = '<span class="stock-empty">No stocks</span>';
    }

    const first = chartPool[0];
    el.refreshNewsQuote = async () => {
      if (details.hidden || !activeSymbol || !window.ClustrQuotes?.getLatestQuotes) return;
      const symbol = activeSymbol, request = stockRequest;
      const stock = { ...findStock(symbol), __publishAsOf: group.__historyScope.asOf, __market: group.__historyScope.market || group.market || 'US' };
      let live = null;
      try { live = (await window.ClustrQuotes.getLatestQuotes([symbol], stock.__market))[util.normalizeSymbol(symbol)]; } catch (_) {}
      if (request !== stockRequest || symbol !== activeSymbol) return;
      priceMount.innerHTML = priceBarHtml(symbol, activeName, stock.priceAtPublish ?? stock.price ?? null,
        stock.changePercentAtPublish ?? stock.changePercent ?? null, live, stock);
    };
    async function ensureExpandedContent() {
      if (chartMode === 'stance') fillStanceChart();
      if (expandedInitialized) return;
      expandedInitialized = true;
      const firstButton = bubblesEl.querySelector('[data-symbol]:not(:disabled)');
      if (firstButton) showChart(firstButton.dataset.symbol, findStock(firstButton.dataset.symbol).name);
      else priceMount.innerHTML = '<p class="empty-state">No usable ticker in this group.</p>';
      updateGroupSincePublish(select.value);
      applyChartMode();
    }

    return el;
  }

  /**
   * @param {Array<Object>} groups
   * @param {Array<Object>} currentGroups
   * @returns {Promise<void>}
   */
  async function renderEvents(groups, currentGroups) {
    const target = document.getElementById('eventsList');
    if (!target) return;
    const generation = ++renderGeneration;
    target.querySelectorAll('.stance-history-canvas').forEach(destroyStanceChart);
    target.innerHTML = '';
    if (!groups.length) {
      target.innerHTML =
        '<p class="empty-state">No clusters in this publish</p>';
      return;
    }
    for (let i = 0; i < groups.length; i++) {
      if (generation !== renderGeneration) return;
      const el = buildGroupElement(groups[i], i, currentGroups);
      target.appendChild(el);
      requestAnimationFrame(() => el.classList.add('is-visible'));
      await U().sleep(36);
    }
    refreshNewsQuotes(target);
    if (!newsQuoteTimer && typeof setInterval === 'function') {
      newsQuoteTimer = setInterval(() => refreshNewsQuotes(), 60000);
      document.addEventListener?.('visibilitychange', () => { if (!document.hidden) refreshNewsQuotes(); });
    }
  }

  /**
   * @param {Array<Object>} groups
   * @param {(country: string) => void} onCountry
   * @returns {void}
   */
  function renderCountryPanel(groups, onCountry) {
    const countryPanel = document.getElementById('countryPanel');
    if (!countryPanel) return;
    const util = U();
    const countries = collectCountries(groups);
    countryPanel.innerHTML = countries
      .map(
        c => `
      <button type="button" class="country-card" data-country="${util.escapeHtml(
        c.country
      )}">
        <div class="c-name">${util.escapeHtml(c.country)}</div>
        <div class="c-count">${c.count} event${c.count === 1 ? '' : 's'}</div>
      </button>`
      )
      .join('');
    countryPanel.querySelectorAll('.country-card').forEach(card => {
      card.addEventListener('click', () =>
        onCountry(card.getAttribute('data-country'))
      );
    });
  }

  /**
   * @param {string} country
   * @returns {void}
   */
  function highlightCountryCard(country) {
    document.querySelectorAll('.country-card').forEach(card => {
      card.classList.toggle(
        'is-active',
        card.getAttribute('data-country') === country
      );
    });
  }

  /**
   * @param {Array<Object>} groups
   * @param {string|null} country
   * @returns {void}
   */
  function renderCountryArticles(groups, country) {
    const countryArticles = document.getElementById('countryArticles');
    if (!countryArticles) return;
    const util = U();
    if (!country) {
      countryArticles.innerHTML =
        '<div class="country-articles-head"><div class="c-count">Select a country</div></div>';
      return;
    }
    const items = articlesForCountry(groups, country);
    countryArticles.innerHTML = `
      <div class="country-articles-head">
        <div class="c-name">${util.escapeHtml(country)}</div>
        <div class="c-count">${items.length} article${
          items.length === 1 ? '' : 's'
        }</div>
      </div>
      <div class="article-grid">
        ${
          items.length
            ? items
                .map(
                  a => `
                <article class="md-card md-card--outlined article-card">
                  <h3 class="article-title">${util.escapeHtml(a.title || '')}</h3>
                  <div class="article-meta">
                    ${a.cluster ? util.escapeHtml(a.cluster) + ' · ' : ''}${util.escapeHtml(
                      a.source || ''
                    )}
                    ${
                      a.date
                        ? ' · ' +
                          util.escapeHtml(new Date(a.date).toLocaleString())
                        : ''
                    }
                    ${articleRatingHtml(a)}
                    ${articleImpactWindowHtml(a)}
              ${polymarketArticleHtml(a)}
                  </div>
                  <p class="article-summary">${util.escapeHtml(
                    a.short_summary || ''
                  )}</p>
                  ${
                    a.link
                      ? `<a class="md-link" href="${util.escapeHtml(
                          a.link
                        )}" target="_blank" rel="noopener">Read →</a>`
                      : ''
                  }
                </article>`
                )
                .join('')
            : '<p class="empty-state">No articles for this country</p>'
        }
      </div>`;
  }

  /**
   * @param {Array<Object>} publishes
   * @param {number} publishIndex
   * @param {(idx: number) => void} onSelect
   * @returns {void}
   */
  function renderDaysList(publishes, publishIndex, onSelect) {
    const daysView = document.getElementById('daysView');
    if (!daysView) return;
    const util = U();
    daysView.innerHTML = publishes
      .map(
        (p, i) => `
      <button type="button" class="day-item ${
        i === publishIndex ? 'is-active' : ''
      }" data-index="${i}">
        <div>
          <div class="day-t">${util.escapeHtml(
            p.title || 'Publish #' + p.id
          )}</div>
          <div class="day-s">${util.escapeHtml(
            new Date(p.created_at).toLocaleString()
          )}</div>
        </div>
        <div class="day-s">${p.__clusterCount ?? (window.ClustrWatchlist?.filterGroups(window.ClustrApp?.getGroupsCache?.()[p.id] || [], p.market) || window.ClustrApp?.getGroupsCache?.()[p.id] || []).length} clusters</div>
      </button>`
      )
      .join('');
    daysView.querySelectorAll('.day-item').forEach(item => {
      item.addEventListener('click', () =>
        onSelect(Number(item.getAttribute('data-index')))
      );
    });
  }

  window.ClustrRender = {
    sectorDefaultSincePublish,
    collectCountries,
    clustersForSymbol,
    collectMovers,
    renderMoversStrip,
    renderEvents,
    renderCountryPanel,
    highlightCountryCard,
    renderCountryArticles,
    renderRelatedClusters,
    renderDaysList
  };

  /** @deprecated */
  window.EventlineRender = window.ClustrRender;
})();
