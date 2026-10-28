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

  window.ClustrQuotes = {
    getQuote: getQuote,
    getQuotes: getQuotes,
    isEnabled: function () {
      const c = creds();
      return !!(c.url && c.key);
    }
  };
})();
