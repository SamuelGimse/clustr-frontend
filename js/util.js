/**
 * @fileoverview Shared pure helpers for Clustr public UI.
 * TradingView: exact same as https://github.com/SamuelGimse/Clustr render.js
 */

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeSymbol(symbol) {
  return String(symbol || '')
    .trim()
    .toUpperCase();
}

function isQuoteSymbol(symbol) {
  return /^[A-Z0-9^][A-Z0-9.^:=/\-]{0,31}$/.test(normalizeSymbol(symbol));
}

function formatPct(value, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return '';
  const n = Number(value);
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

function formatMoney(value, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return Number(value).toFixed(digits);
}

function exponentialMeanRating(values) {
  const ratings = (values || []).filter(value => value != null && String(value).trim() !== '').map(Number).filter(value => Number.isFinite(value) && value >= -10 && value <= 10);
  if (!ratings.length) return null;
  const impact = ratings.reduce((sum, value) => sum + Math.sign(value) * Math.pow(3, Math.abs(value)), 0) / ratings.length;
  if (Math.abs(impact) < 1e-12) return 0;
  const score = Math.sign(impact) * Math.max(0, Math.log(Math.abs(impact)) / Math.log(3));
  return Math.max(-10, Math.min(10, Number(score.toFixed(1))));
}

function articleImpactScore(values) {
  if ((values || []).some(value => value && typeof value === 'object')) {
    const events = new Map();
    for (const [index, article] of values.entries()) {
      const rating = numericStance(article && typeof article === 'object' ? article.rating ?? article.score : article);
      if (rating == null) continue;
      const key = article?.event_id || `article:${index}`;
      if (!events.has(key)) events.set(key, []);
      events.get(key).push(rating);
    }
    values = [...events.values()].map(ratings => {
      ratings.sort((a, b) => a - b);
      const mid = Math.floor(ratings.length / 2);
      return ratings.length % 2 ? ratings[mid] : (ratings[mid - 1] + ratings[mid]) / 2;
    });
  }
  const valid = (values || []).filter(value => value != null && String(value).trim() !== '' && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= 10);
  return valid.length ? exponentialMeanRating(valid.filter(value => Number(value) !== 0)) ?? 0 : null;
}

function numericStance(value) {
  if (value == null || String(value).trim() === '') return null;
  const score = Number(value);
  return Number.isFinite(score) && Math.abs(score) <= 10 ? score : null;
}

function stanceCategory(score) {
  return score == null ? null : score > 0 ? 'constructive' : score < 0 ? 'cautious' : 'watch';
}

function deltaSincePublish(publishPrice, livePrice) {
  if (publishPrice == null || livePrice == null || Number(publishPrice) === 0) {
    return null;
  }
  return ((Number(livePrice) - Number(publishPrice)) / Number(publishPrice)) * 100;
}

function toneClass(value) {
  if (value == null || Number.isNaN(Number(value))) return '';
  return Number(value) >= 0 ? 'tone-up' : 'tone-down';
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function uniqueSymbols(symbols) {
  return [...new Set((symbols || []).map(normalizeSymbol).filter(Boolean))];
}

function isLightTheme() {
  const light =
    (window.ClustrConfig && window.ClustrConfig.LIGHT_THEMES) ||
    new Set([
      'github-light',
      'nord-light',
      'paper',
      'kermit',
      'coral-navy',
      'charcoal-sand',
      'berry-mint',
      'plum-cream',
      'forest-mist',
      'sea-foam',
      'minimal'
    ]);
  const t = document.documentElement.getAttribute('data-theme') || 'apple';
  if (t === 'grassy-hill' || t === 'aqua-classic' || t === 'aurora-glass' || t === 'old-school-rpg') return true;
  if (document.documentElement.getAttribute('data-color-mode') === 'dark') return false;
  if ((t === 'apple' || t === 'material') && document.documentElement.getAttribute('data-color-mode') === 'light') return true;
  if (t === 'apple' || t === 'material') {
    return !window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return light.has(t);
}

function toolbarBgHex() {
  return isLightTheme() ? 'ffffff' : '0a0a0a';
}

/** Exact tvUrl from github.com/SamuelGimse/Clustr */
function tradingViewUrl(symbol) {
  const theme = isLightTheme() ? 'light' : 'dark';
  const toolbarbg = toolbarBgHex();
  return (
    `https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(symbol)}` +
    `&interval=D&theme=${theme}&style=1&locale=en` +
    `&hide_top_toolbar=1&hide_legend=1&hidesidetoolbar=1` +
    `&symboledit=0&saveimage=0&toolbarbg=${toolbarbg}`
  );
}

function redditBuzzForStock(groups, symbol, market = 'US', asOf = new Date().toISOString()) {
  if (market !== 'US' || !Number.isFinite(Date.parse(asOf))) return null;
  const ticker = normalizeSymbol(symbol);
  let latest = null;
  for (const group of groups || []) {
    if (group.market && group.market !== market) continue;
    for (const signal of group.market_signals || []) {
      const time = Date.parse(signal.available_at);
      if (signal.source !== 'ApeWisdom' || signal.metric !== 'reddit_stock_mentions' || signal.market !== market ||
          normalizeSymbol(signal.symbol) !== ticker || !Number.isFinite(time) || time > Date.parse(asOf) ||
          !Number.isInteger(signal.rank) || signal.rank < 1 || signal.rank > 100 ||
          !Number.isSafeInteger(signal.value) || signal.value < 0) continue;
      if (!latest || time > Date.parse(latest.available_at)) latest = { ...signal, score: 101 - signal.rank };
    }
  }
  return latest;
}

function redditBuzzHtml(signal, detail = false) {
  if (!signal) return '';
  const date = new Date(signal.available_at).toLocaleString();
  const explanation = `ApeWisdom Reddit discussion rank #${signal.rank}: ${signal.value} mentions. Score = 101 minus rank among the top 100 stocks; #1 = 100/100. Attention, not bullish/bearish sentiment or investment merit. Retrieved ${date}.`;
  return `<span class="reddit-buzz" title="${escapeHtml(explanation)}" aria-label="${escapeHtml(explanation)}">Reddit buzz <strong>${signal.score}/100</strong></span>${detail ? `<p class="reddit-buzz-detail"><a href="https://apewisdom.io/" target="_blank" rel="noopener noreferrer">ApeWisdom</a> · #${signal.rank} · ${signal.value} mentions · snapshot retrieved ${escapeHtml(date)}. Relative discussion rank, not sentiment or a trade score.</p>` : ''}`;
}

window.ClustrUtil = {
  redditBuzzForStock,
  redditBuzzHtml,
  sleep,
  normalizeSymbol,
  isQuoteSymbol,
  formatPct,
  formatMoney,
  exponentialMeanRating,
  articleImpactScore,
  numericStance,
  stanceCategory,
  deltaSincePublish,
  toneClass,
  escapeHtml,
  uniqueSymbols,
  isLightTheme,
  toolbarBgHex,
  tradingViewUrl
};
