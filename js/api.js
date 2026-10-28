/**
 * @fileoverview Supabase REST — relational model first, groups_json fallback.
 *
 * publishes → clusters → cluster_articles / article_tickers / cluster_stocks
 */

(function () {
  /**
   * @returns {{url: string, key: string}}
   */
  function creds() {
    const cfg = window.ClustrConfig || {};
    return {
      url: String(cfg.SUPABASE_URL || '').replace(/\/$/, ''),
      key: String(cfg.SUPABASE_ANON_KEY || '')
    };
  }

  /**
   * @param {string} path
   * @returns {Promise<any>}
   */
  async function rest(path) {
    const { url, key } = creds();
    if (!url || !key) throw new Error('Missing Supabase config');
    const res = await fetch(`${url}/rest/v1/${path}`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${window.ClustrAuth?.accessToken() || key}`,
        Accept: 'application/json'
      }
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Supabase ${res.status}: ${t.slice(0, 160)}`);
    }
    return res.json();
  }

  /**
   * @param {number} [limit=30]
   * @returns {Promise<object[]>}
   */
  async function fetchPublishes(limit = 30) {
    return rest(
      `clustr_publishes?select=id,title,notes,market,created_at,groups_json&notes=like.PULSE%20pipeline*&order=id.desc&limit=${encodeURIComponent(String(Math.min(limit, 100)))}`
    );
  }

  /**
   * Normalize a relational cluster row into the shape the render layer expects.
   * @param {object} row
   * @returns {object}
   */
  function normalizeCluster(row) {
    const articles = (row.cluster_articles || [])
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map(a => ({
        title: a.title,
        link: a.link,
        source: a.source,
        date: a.published_at,
        type: a.article_type || 'news',
        short_summary: a.short_summary || '',
        primary_country: a.primary_country || '',
        countries: a.countries || [],
        region: a.region || '',
        mentioned_companies: (a.article_tickers || []).map(t => ({
          name: t.name,
          symbol: t.symbol,
          direction: t.direction || 'neutral',
          confidence: t.confidence || 'weak',
          resolved: !!t.resolved
        }))
      }));

    /** @type {Record<string, object[]>} */
    const byLayer = {
      mentioned: [],
      close: [],
      original: [],
      fixed: [],
      winner: [],
      loser: [],
      mover: []
    };

    for (const s of row.cluster_stocks || []) {
      const layer = s.layer || 'close';
      const item = {
        symbol: s.symbol,
        name: s.name,
        resolved: s.resolved,
        source: s.source,
        price: s.price ?? s.price_at_publish,
        changePercent: s.change_percent ?? s.change_percent_at_publish,
        priceAtPublish: s.price_at_publish,
        changePercentAtPublish: s.change_percent_at_publish,
        publishedAt: s.published_at,
        direction: s.direction,
        confidence: s.confidence,
        mentionCount: s.mention_count
      };
      if (!byLayer[layer]) byLayer[layer] = [];
      byLayer[layer].push(item);
    }

    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      market: row.market,
      summary: row.summary || row.reason || '',
      reason: row.reason || '',
      stance: row.stance || 'watch',
      time_horizon: row.time_horizon || 'weeks',
      confidence: row.confidence || 'low',
      keywords: row.keywords || [],
      angles: row.angles || row.opportunity_angles || [],
      opportunity_angles: row.angles || row.opportunity_angles || [],
      count: row.article_count ?? articles.length,
      articles,
      mentioned_stocks: byLayer.mentioned,
      close_stocks: byLayer.close,
      original_stocks: byLayer.original,
      related_stocks: byLayer.original,
      fixed_stocks: byLayer.fixed,
      connected_winners: byLayer.winner,
      connected_losers: byLayer.loser,
      movers: byLayer.mover,
      stocks: [...byLayer.mentioned, ...byLayer.close, ...byLayer.original].filter(
        (s, i, arr) =>
          s.symbol && arr.findIndex(x => x.symbol === s.symbol) === i
      )
    };
  }

  /**
   * Load clusters for one publish via nested select.
   * @param {number|string} publishId
   * @returns {Promise<object[]>}
   */
  async function fetchClustersForPublish(publishId) {
    const q =
      `clusters?publish_id=eq.${publishId}` +
      `&select=id,name,kind,market,summary,reason,stance,time_horizon,confidence,keywords,angles,article_count,sort_order,` +
      `cluster_articles(id,title,link,source,published_at,article_type,short_summary,primary_country,countries,region,sort_order,` +
      `article_tickers(id,symbol,name,resolved,direction,confidence,mention_count)),` +
      `cluster_stocks(id,symbol,name,resolved,layer,source,price_at_publish,change_percent_at_publish,published_at,price,change_percent,direction,confidence,mention_count)` +
      `&order=sort_order.asc`;

    try {
      const rows = await rest(q);
      if (Array.isArray(rows) && rows.length) return rows.map(normalizeCluster);
    } catch (err) {
      console.warn('Relational clusters failed, will try groups_json', err.message);
    }
    return [];
  }

  /**
   * Preferred loader: relational tables, else groups_json blob.
   * @param {object|null|undefined} publish
   * @returns {Promise<object[]>}
   */
  async function loadGroupsForPublish(publish) {
    if (!publish) return [];
    // Pipeline publishes carry the rated article objects in groups_json; prefer that
    // payload so signed per-article ratings survive the relational fallback path.
    if (String(publish.notes || '').startsWith('PULSE pipeline') && Array.isArray(publish.groups_json)) {
      return publish.groups_json;
    }
    // Prefer relational tables for other publishes; fall back to groups_json.
    if (publish.id != null) {
      try {
        const nested = await fetchClustersForPublish(publish.id);
        if (nested.length) return nested;
      } catch (err) {
        console.warn('relational clusters', err.message);
      }
    }
    return groupsFromPublish(publish);
  }

  /**
   * Sync extract from publish row (legacy).
   * @param {object|null|undefined} publish
   * @returns {object[]}
   */
  function groupsFromPublish(publish) {
    if (!publish) return [];
    if (Array.isArray(publish.groups_json)) return publish.groups_json;
    if (Array.isArray(publish.groups)) return publish.groups;
    return [];
  }


  /**
   * Cross-publish stance rows for one cluster name (SQL view or local fallback).
   * @param {string} clusterName
   * @returns {Promise<object[]>}
   */
  async function fetchStanceHistory(clusterName) {
    const name = String(clusterName || '').trim();
    if (!name) return [];

    const local = localStanceHistory(name);
    if (window.ClustrAuth?.accessToken()) return local;
    if (local.some(row => row.stanceScore != null)) return local;

    try {
      const q =
        'cluster_stance_history?cluster_name=eq.' +
        encodeURIComponent(name) +
        '&select=publish_id,publish_title,created_at,stance,confidence,time_horizon,fixed_stocks' +
        '&order=created_at.asc';
      const rows = await rest(q);
      if (Array.isArray(rows) && rows.length) {
        return rows.map(r => {
          // ONLY cluster defaults — never close links / stocks bag
          const defaults = Array.isArray(r.fixed_stocks) ? r.fixed_stocks : [];
          const seen = new Set();
          const defs = [];
          for (const s of defaults) {
            const sym = String((s && s.symbol) || '').toUpperCase();
            if (!sym || seen.has(sym)) continue;
            seen.add(sym);
            defs.push({
              symbol: sym,
              priceAtPublish: s.priceAtPublish ?? s.price ?? null
            });
          }
          return {
            stance: String(r.stance || 'watch').toLowerCase(),
            confidence: String(r.confidence || '').toLowerCase(),
            horizon: String(r.time_horizon || '').toLowerCase(),
            date: r.created_at || '',
            title: r.publish_title || '',
            publishId: r.publish_id,
            defaults: defs
          };
        });
      }
    } catch (err) {
      console.warn('stance view', err.message);
    }

    // Local fallback: all loaded publishes.groups_json + groupsCache
    return localStanceHistory(name);
  }

  /**
   * @param {string} clusterName
   * @returns {object[]}
   */
  function localStanceHistory(clusterName) {
    const name = String(clusterName || '').trim().toLowerCase();
    if (!name) return [];
    const publishes =
      (window.ClustrApp && typeof window.ClustrApp.getPublishes === 'function'
        ? window.ClustrApp.getPublishes()
        : []) || [];
    const cache =
      (window.ClustrApp && typeof window.ClustrApp.getGroupsCache === 'function'
        ? window.ClustrApp.getGroupsCache()
        : {}) || {};

    const rows = [];
    const ordered = publishes.slice().reverse(); // oldest → newest
    for (const p of ordered) {
      let groups = cache[p.id] || cache[String(p.id)] || [];
      if (!groups.length) {
        groups = groupsFromPublish(p);
      }
      const match = groups.find(
        g => String(g.name || '').trim().toLowerCase() === name
      );
      if (!match) continue;
      // ONLY cluster defaults (fixed / default list)
      const defaults = match.fixed_stocks || match.default_stocks || [];
      const seen = new Set();
      const defs = [];
      for (const s of defaults) {
        const sym = String((s && s.symbol) || '').toUpperCase();
        if (!sym || seen.has(sym)) continue;
        seen.add(sym);
        defs.push({
          symbol: sym,
          priceAtPublish: s.priceAtPublish ?? s.price ?? null
        });
      }
      rows.push({
        stance: String(match.stance || 'watch').toLowerCase(),
        stanceScore: Number.isFinite(Number(match.stance_score ?? match.cluster_score)) ? Number(match.stance_score ?? match.cluster_score) : null,
        confidence: String(match.confidence || '').toLowerCase(),
        horizon: String(match.time_horizon || '').toLowerCase(),
        date: p.created_at || '',
        title: p.title || '',
        publishId: p.id,
        defaults: defs
      });
    }
    return rows;
  }

  window.ClustrApi = {
    fetchPublishes,
    fetchClustersForPublish,
    loadGroupsForPublish,
    groupsFromPublish,
    normalizeCluster,
    fetchStanceHistory,
    localStanceHistory
  };
})();
