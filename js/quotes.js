/**
 * @fileoverview Live quotes from Supabase ticker_quotes (backend DB).
 * Optional clever-api fallback only if DB has no row.
 */

(function () {
  const CACHE_TTL_MS = 60 * 1000;
  const FAIL_TTL_MS = 12 * 1000;

  /** @type {Map<string, {data: Quote|null, expires: number}>} */
  const cache = new Map();
  /** @type {Map<string, Promise<Quote|null>>} */
  const inflight = new Map();

  /**
   * @typedef {Object} Quote
   * @property {number|null} price
   * @property {number|null} changePercent
   * @property {string} [symbol]
   * @property {string} [name]
   */

  function key(symbol) {
    return String(symbol || '')
      .trim()
      .toUpperCase();
  }

  function creds() {
    const cfg = window.ClustrConfig || {};
    return {
      url: String(cfg.SUPABASE_URL || '').replace(/\/$/, ''),
      key: String(cfg.SUPABASE_ANON_KEY || '')
    };
  }

  function authHeaders() {
    const { key } = creds();
    const headers = { Accept: 'application/json' };
    if (key) {
      headers.apikey = key;
      headers.Authorization = 'Bearer ' + key;
    }
    return headers;
  }

  function putCache(symbol, data) {
    cache.set(key(symbol), {
      data,
      expires: Date.now() + (data ? CACHE_TTL_MS : FAIL_TTL_MS)
    });
  }

  function getCached(symbol) {
    const hit = cache.get(key(symbol));
    if (!hit) return undefined;
    if (hit.expires <= Date.now()) {
      cache.delete(key(symbol));
      return undefined;
    }
    return hit.data;
  }

  /**
   * Batch read from ticker_quotes.
   * @param {string[]} symbols
   * @returns {Promise<Object.<string, Quote|null>>}
   */
  async function fetchFromDb(symbols) {
    const { url, key: anon } = creds();
    const list = [...new Set(symbols.map(key).filter(Boolean))];
    /** @type {Object.<string, Quote|null>} */
    const out = {};
    if (!url || !anon || !list.length) return out;

    const inList = list.map(function (s) {
      return '"' + s.replace(/"/g, '') + '"';
    }).join(',');
    const endpoint =
      url +
      '/rest/v1/ticker_quotes?select=symbol,name,price,change,change_percent,as_of' +
      '&symbol=in.(' +
      inList +
      ')';

    const res = await fetch(endpoint, { headers: authHeaders() });
    if (!res.ok) throw new Error('ticker_quotes HTTP ' + res.status);
    const rows = await res.json();
    for (const row of rows || []) {
      const sym = key(row.symbol);
      if (!sym) continue;
      const price = row.price != null ? Number(row.price) : null;
      const changePercent =
        row.change_percent != null ? Number(row.change_percent) : null;
      if (price == null && changePercent == null) {
        out[sym] = null;
        continue;
      }
      out[sym] = {
        symbol: sym,
        name: row.name || sym,
        price: price,
        changePercent: changePercent,
        asOf: row.as_of || null,
        source: 'ticker_quotes'
      };
    }
    for (const s of list) {
      if (!(s in out)) out[s] = null;
    }
    return out;
  }

  /**
   * @param {string} symbol
   * @returns {Promise<Quote|null>}
   */
  async function fetchClever(symbol) {
    const cfg = window.ClustrConfig || {};
    const base = String(cfg.QUOTE_API_URL || '').replace(/\/$/, '');
    const sym = key(symbol);
    if (!base || !sym) return null;
    const res = await fetch(base + '?symbol=' + encodeURIComponent(sym), {
      headers: authHeaders()
    });
    if (!res.ok) return null;
    const json = await res.json();
    const price = json.price ?? json.regularMarketPrice ?? null;
    const changePercent =
      json.changePercent ?? json.regularMarketChangePercent ?? null;
    if (price == null && changePercent == null) return null;
    return {
      symbol: sym,
      name: json.name || json.shortName || sym,
      price: price != null ? Number(price) : null,
      changePercent: changePercent != null ? Number(changePercent) : null,
      source: 'clever-api'
    };
  }

  /**
   * @param {string} symbol
   * @returns {Promise<Quote|null>}
   */
  async function getQuote(symbol) {
    const s = key(symbol);
    if (!s) return null;

    const cached = getCached(s);
    if (cached !== undefined) return cached;
    if (inflight.has(s)) return inflight.get(s);

    const p = (async function () {
      try {
        const bag = await fetchFromDb([s]);
        var q = bag[s] || null;
        if (!q) {
          try {
            q = await fetchClever(s);
          } catch (e) {
            q = null;
          }
        }
        putCache(s, q);
        return q;
      } catch (err) {
        console.warn('getQuote', s, err.message);
        try {
          var q2 = await fetchClever(s);
          putCache(s, q2);
          return q2;
        } catch (e2) {
          putCache(s, null);
          return null;
        }
      } finally {
        inflight.delete(s);
      }
    })();

    inflight.set(s, p);
    return p;
  }

  /**
   * @param {string[]} symbols
   * @returns {Promise<Object.<string, Quote|null>>}
   */
  async function getQuotes(symbols) {
    const list = [
      ...new Set(
        (symbols || [])
          .map(key)
          .filter(Boolean)
      )
    ];
    /** @type {Object.<string, Quote|null>} */
    const out = {};
    if (!list.length) return out;

    const need = [];
    for (const s of list) {
      const c = getCached(s);
      if (c !== undefined) out[s] = c;
      else need.push(s);
    }
    if (!need.length) return out;

    try {
      const bag = await fetchFromDb(need);
      const missing = [];
      for (const s of need) {
        const q = bag[s] || null;
        if (q) {
          putCache(s, q);
          out[s] = q;
        } else {
          missing.push(s);
        }
      }
      for (const s of missing) {
        out[s] = await getQuote(s);
      }
    } catch (err) {
      console.warn('getQuotes db failed', err.message);
      for (const s of need) {
        out[s] = await getQuote(s);
      }
    }
    return out;
  }

  const latestCache = new Map();
  const latestInflight = new Map();
  async function getLatestQuotes(symbols, market = 'US') {
    const list = [...new Set((symbols || []).map(key).filter(symbol => /^[A-Z0-9^][A-Z0-9.^=-]{0,19}$/.test(symbol)))];
    const { url, key: anon } = creds();
    if (!url || !anon || !['US', 'NO'].includes(market)) return {};
    const out = {}, needed = [];
    for (const symbol of list) {
      const k = market + ':' + symbol, hit = latestCache.get(k);
      if (hit && hit.expires > Date.now()) out[symbol] = hit.quote;
      else if (!latestInflight.has(k)) needed.push(symbol);
    }
    for (let i = 0; i < needed.length; i += 30) {
      const chunk = needed.slice(i, i + 30);
      const pending = (async () => {
        let quotes = {};
        try {
          const params = new URLSearchParams({ symbols: chunk.join(','), market });
          const res = await fetch(url + '/functions/v1/market-quotes?' + params, { headers: authHeaders(), signal: AbortSignal.timeout(20000) });
          if (res.ok) quotes = (await res.json()).quotes || {};
        } catch (_) { /* Never substitute a saved publish percentage for a current quote. */ }
        for (const symbol of chunk) {
          const q = quotes[symbol];
          const quote = q && typeof q.price === 'number' && Number.isFinite(q.price) && q.price > 0 && Number.isFinite(Date.parse(q.asOf))
            ? { ...q, changePercent: typeof q.changePercent === 'number' && Number.isFinite(q.changePercent) ? q.changePercent : null } : null;
          const k = market + ':' + symbol;
          if (latestCache.size >= 512) latestCache.delete(latestCache.keys().next().value);
          latestCache.set(k, { quote, expires: Date.now() + (quote ? CACHE_TTL_MS : FAIL_TTL_MS) });
          latestInflight.delete(k);
        }
      })();
      for (const symbol of chunk) latestInflight.set(market + ':' + symbol, pending);
    }
    await Promise.all(list.map(symbol => latestInflight.get(market + ':' + symbol)));
    for (const symbol of list) out[symbol] = latestCache.get(market + ':' + symbol)?.quote || null;
    return out;
  }

  const historyCache = new Map();
  async function getHistoricalPrices(symbols, dates, market = 'US') {
    const times = dates.map(Date.parse).filter(Number.isFinite);
    if (!times.length || !['US', 'NO'].includes(market)) return {};
    const from = new Date(Math.max(Math.min(...times), Date.now() - 710 * 86400000)).toISOString();
    const to = new Date(Math.min(Date.now(), Math.max(...times))).toISOString();
    const { url, key: anon } = creds();
    if (!url || !anon) return {};
    const list = [...new Set(symbols.map(key).filter(Boolean))];
    const out = {};
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(4, list.length) }, async () => {
      while (next < list.length) {
        const symbol = list[next++];
        const cacheKey = [symbol, market, from, to].join(':');
        let hit = historyCache.get(cacheKey);
        if (!hit || hit.expires <= Date.now()) {
          const promise = (async () => {
            try {
              const rows = [];
              for (let start = Date.parse(from); start <= Date.parse(to);) {
                const end = Math.min(start + 90 * 86400000, Date.parse(to));
                const params = new URLSearchParams({ symbol, market, from: new Date(start).toISOString(), to: new Date(end).toISOString() });
                const res = await fetch(url + '/functions/v1/price-history?' + params, { headers: authHeaders(), signal: AbortSignal.timeout(15000) });
                if (!res.ok) throw new Error('Historical prices HTTP ' + res.status);
                const data = await res.json();
                if (Array.isArray(data.prices)) rows.push(...data.prices);
                start = end + 1;
              }
              return rows;
            } catch { return []; }
          })();
          hit = { promise, expires: Date.now() + 3600000 };
          if (historyCache.size >= 256) historyCache.delete(historyCache.keys().next().value);
          historyCache.set(cacheKey, hit);
          promise.then(rows => { if (!rows.length) hit.expires = Date.now() + 60000; });
        }
        out[symbol] = await hit.promise;
      }
    }));
    return out;
  }

  window.ClustrQuotes = {
    getQuote: getQuote,
    getQuotes: getQuotes,
    getLatestQuotes: getLatestQuotes,
    getHistoricalPrices: getHistoricalPrices,
    isEnabled: function () {
      const c = creds();
      return !!(c.url && c.key);
    }
  };
})();
