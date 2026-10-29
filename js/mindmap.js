/**
 * @fileoverview Stock-centric tankekart.
 * Center = chosen ticker. Orbit = clusters + articles linked via that stock.
 * Controls: layers, timeframe, search, back history.
 */

(function () {
  let host = null;
  let canvas = null;
  let ctx = null;
  let nodes = [];
  let links = [];
  let raf = null;
  let dragIdx = null;
  let dragOx = 0;
  let dragOy = 0;

  let groups = [];
  let publishes = [];
  let selectedSymbol = '';
  /** @type {string[]} */
  let historyStack = [];
  let layers = new Set(['mentioned', 'close', 'original', 'fixed']);
  /** @type {'publish'|'3d'|'7d'|'14d'} */
  let timeframe = 'publish';
  let searchQuery = '';
  /** @type {((payload: object) => void)|null} */
  let onSelect = null;
  /** @type {HTMLElement|null} */
  let sideEl = null;

  const PAD = 24;
  const LAYER_OPTS = [
    { id: 'mentioned', label: 'Mentioned' },
    { id: 'close', label: 'Close links' },
    { id: 'original', label: 'Original ideas' },
    { id: 'fixed', label: 'Defaults' }
  ];
  const TIME_OPTS = [
    { id: 'publish', label: 'This publish' },
    { id: '3d', label: '3 days' },
    { id: '7d', label: '7 days' },
    { id: '14d', label: '14 days' }
  ];

  function key(s) {
    return String(s || '')
      .trim()
      .toUpperCase();
  }

  function getCss(name, fallback) {
    try {
      const v = getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .trim();
      return v || fallback;
    } catch {
      return fallback;
    }
  }

  function stanceColor(stance) {
    const s = String(stance || 'watch').toLowerCase();
    if (s === 'constructive') return getCss('--up', '#4ade80');
    if (s === 'cautious') return getCss('--down', '#f87171');
    return getCss('--accent', '#f97316');
  }

  function dirTone(d) {
    const x = String(d || '').toLowerCase();
    if (x === 'bullish' || x === 'up' || x === 'positive') return 'up';
    if (x === 'bearish' || x === 'down' || x === 'negative') return 'down';
    return '';
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function stockPools(g) {
    return {
      mentioned: g.mentioned_stocks || [],
      close: [
        ...(g.close_stocks || []),
        ...(g.direct_stocks || []),
        ...(g.stocks || []),
        ...(g.connected_winners || []),
        ...(g.connected_losers || []),
        ...(g.movers || [])
      ],
      original: g.original_stocks || g.related_stocks || [],
      fixed: g.fixed_stocks || g.default_stocks || []
    };
  }

  function indexStocksInPublish(gs) {
    const map = new Map();
    const push = (s, layer) => {
      const sym = key(s && s.symbol);
      if (!sym) return;
      if (!map.has(sym)) {
        map.set(sym, { symbol: sym, name: (s && s.name) || sym, layers: new Set() });
      }
      const row = map.get(sym);
      row.layers.add(layer);
      if (s && s.name) row.name = s.name;
    };
    for (const g of gs || []) {
      const p = stockPools(g);
      for (const s of p.mentioned) push(s, 'mentioned');
      for (const s of p.close) push(s, 'close');
      for (const s of p.original) push(s, 'original');
      for (const s of p.fixed) push(s, 'fixed');
      for (const a of g.articles || []) {
        for (const m of a.mentioned_companies || []) {
          if (m && (m.symbol || m.name)) {
            push(
              { symbol: m.symbol || m.name, name: m.name || m.symbol },
              'mentioned'
            );
          }
        }
      }
    }
    return [...map.values()]
      .map(r => ({ symbol: r.symbol, name: r.name, layers: [...r.layers] }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  function groupsForTimeframe() {
    if (timeframe === 'publish' || !publishes.length) return groups;
    const days =
      timeframe === '3d' ? 3 : timeframe === '7d' ? 7 : timeframe === '14d' ? 14 : 0;
    if (!days) return groups;
    const cache =
      (window.ClustrApp &&
        typeof window.ClustrApp.getGroupsCache === 'function' &&
        window.ClustrApp.getGroupsCache()) ||
      {};
    const cutoff = Date.now() - days * 864e5;
    const merged = [];
    const seenNames = new Set();
    for (const p of publishes) {
      const t = new Date(p.created_at || 0).getTime();
      if (Number.isFinite(t) && t < cutoff) continue;
      let gs = cache[p.id] || cache[String(p.id)] || [];
      if (!gs.length && window.ClustrApi && window.ClustrApi.groupsFromPublish) {
        gs = window.ClustrApi.groupsFromPublish(p);
      }
      for (const g of gs) {
        const k = String(g.name || '').toLowerCase();
        if (!k) continue;
        if (seenNames.has(k)) {
          const existing = merged.find(
            x => String(x.name || '').toLowerCase() === k
          );
          if (existing) {
            existing.articles = [
              ...(existing.articles || []),
              ...(g.articles || [])
            ];
          }
          continue;
        }
        seenNames.add(k);
        merged.push({ ...g, articles: [...(g.articles || [])] });
      }
    }
    return merged.length ? merged : groups;
  }

  function clusterHit(g, sym) {
    const p = stockPools(g);
    const checks = [
      ['mentioned', p.mentioned],
      ['close', p.close],
      ['original', p.original],
      ['fixed', p.fixed]
    ];
    for (const [layer, list] of checks) {
      if (!layers.has(layer)) continue;
      if ((list || []).some(s => key(s.symbol) === sym)) {
        return { hit: true, layer };
      }
    }
    return { hit: false, layer: null };
  }

  /**
   * Articles linked to stock: explicit mention OR article sits in a cluster that holds the stock.
   */
  function articlesForStock(pool, sym) {
    const out = [];
    const seen = new Set();
    const stockMeta = indexStocksInPublish(pool).find(s => s.symbol === sym);
    const nameHint = (stockMeta && stockMeta.name) || '';

    for (const g of pool) {
      const { hit, layer } = clusterHit(g, sym);
      if (!hit) continue;

      for (const a of g.articles || []) {
        const id = a.link || a.title;
        if (!id || seen.has(id)) continue;

        const mentions = (a.mentioned_companies || []).filter(m => {
          if (key(m.symbol) === sym) return true;
          if (nameHint && String(m.name || '').toLowerCase().includes(nameHint.toLowerCase().slice(0, 8)))
            return true;
          return false;
        });

        // Text match in title/summary
        const blob = `${a.title || ''} ${a.short_summary || ''}`.toLowerCase();
        const textHit =
          (nameHint && blob.includes(nameHint.toLowerCase().slice(0, 10))) ||
          blob.includes(sym.toLowerCase());

        // Linked because cluster contains the stock (always include)
        seen.add(id);
        out.push({
          title: a.title,
          link: a.link,
          source: a.source,
          date: a.date,
          short_summary: a.short_summary || '',
          cluster: g.name,
          layer: layer,
          direction:
            (mentions[0] && (mentions[0].direction || mentions[0].sentiment)) ||
            (textHit ? 'linked' : 'cluster'),
          confidence: (mentions[0] && mentions[0].confidence) || '',
          mentioned_companies: a.mentioned_companies || [],
          mentioned_company_names: a.mentioned_company_names || [],
          explicit: mentions.length > 0 || textHit
        });
      }
    }
    return out;
  }

  function buildGraph() {
    const sym = key(selectedSymbol);
    const pool = groupsForTimeframe();
    const w = canvas ? canvas.clientWidth : 800;
    const h = canvas ? canvas.clientHeight : 560;
    const cx = w / 2;
    const cy = h / 2;

    nodes = [];
    links = [];

    const stockMeta =
      indexStocksInPublish(groups).find(s => s.symbol === sym) || {
        symbol: sym,
        name: sym,
        layers: []
      };

    nodes.push({
      kind: 'stock',
      id: 'stock:' + sym,
      label: sym,
      sub: stockMeta.name || '',
      x: cx,
      y: cy,
      vx: 0,
      vy: 0,
      r: 48,
      fixed: true,
      color: getCss('--accent', '#f97316')
    });
    const hub = 0;

    const clusterNodes = [];
    for (const g of pool) {
      const { hit, layer } = clusterHit(g, sym);
      if (!hit) continue;
      clusterNodes.push({
        kind: 'cluster',
        id: 'cluster:' + g.name,
        label: g.name,
        sub: (g.stance || 'watch') + (layer ? ' · ' + layer : ''),
        stance: g.stance,
        layer: layer,
        x: cx,
        y: cy,
        vx: 0,
        vy: 0,
        r: 34,
        fixed: false,
        color: stanceColor(g.stance)
      });
    }

    const arts = articlesForStock(pool, sym);
    const articleNodes = arts.slice(0, 24).map(a => ({
      kind: 'article',
      id: 'art:' + (a.link || a.title),
      label: String(a.title || '').slice(0, 52),
      sub: [a.source, a.direction].filter(Boolean).join(' · '),
      link: a.link,
      article: a,
      x: cx,
      y: cy,
      vx: 0,
      vy: 0,
      r: 28,
      fixed: false,
      color: a.explicit ? getCss('--accent', '#f97316') : getCss('--text-meta', '#94a3b8')
    }));

    for (const c of clusterNodes) {
      nodes.push(c);
      links.push([hub, nodes.length - 1]);
    }
    for (const a of articleNodes) {
      nodes.push(a);
      links.push([hub, nodes.length - 1]);
    }

    const orbit = nodes.slice(1);
    orbit.forEach((n, i) => {
      const ang = (i / Math.max(orbit.length, 1)) * Math.PI * 2 - Math.PI / 2;
      const rad =
        n.kind === 'cluster' ? Math.min(w, h) * 0.26 : Math.min(w, h) * 0.4;
      n.x = cx + Math.cos(ang) * rad;
      n.y = cy + Math.sin(ang) * rad;
    });

    renderSide(arts, clusterNodes);
  }

  function renderSide(arts, clusterNodes) {
    if (!sideEl) return;
    const sym = key(selectedSymbol);
    const companyBubbles = (list) =>
      (list || [])
        .map(m => {
          const label = m.symbol || m.name || '?';
          const dir = m.direction || m.sentiment || '';
          const tone = dirTone(dir);
          return `<span class="art-co-bubble ${tone}" title="${esc(
            (m.name || '') + (dir ? ' · ' + dir : '') + (m.confidence ? ' · ' + m.confidence : '')
          )}">${esc(label)}${dir ? ' · ' + esc(dir) : ''}</span>`;
        })
        .join('');

    sideEl.innerHTML = `
      <div class="tank-side-head">
        <strong>${esc(sym)}</strong>
        <span class="muted">${clusterNodes.length} clusters · ${arts.length} articles</span>
      </div>
      <div class="tank-side-section">
        <div class="tank-side-label">Clusters</div>
        ${
          clusterNodes.length
            ? clusterNodes
                .map(
                  c =>
                    `<button type="button" class="tank-side-chip" data-jump-cluster="${esc(
                      c.label
                    )}">${esc(c.label)}<span class="muted"> ${esc(
                      c.sub || ''
                    )}</span></button>`
                )
                .join('')
            : '<div class="muted">No clusters for current filters</div>'
        }
      </div>
      <div class="tank-side-section">
        <div class="tank-side-label">Linked articles</div>
        ${
          arts.length
            ? arts
                .map(
                  a => `
          <div class="tank-art-card">
            <a class="tank-art-title" href="${esc(a.link || '#')}" target="_blank" rel="noopener">${esc(
                    a.title || ''
                  )}</a>
            <div class="tank-art-meta">${esc(a.source || '')}${
                    a.cluster ? ' · ' + esc(a.cluster) : ''
                  }${a.direction ? ' · ' + esc(a.direction) : ''}</div>
            <div class="tank-art-bubbles">
              ${companyBubbles(a.mentioned_companies)}
              ${
                !(a.mentioned_companies || []).length &&
                (a.mentioned_company_names || []).length
                  ? (a.mentioned_company_names || [])
                      .map(
                        n =>
                          `<span class="art-co-bubble">${esc(n)}</span>`
                      )
                      .join('')
                  : ''
              }
              ${
                !(a.mentioned_companies || []).length &&
                !(a.mentioned_company_names || []).length
                  ? `<span class="art-co-bubble">${esc(sym)} · via cluster</span>`
                  : ''
              }
            </div>
          </div>`
                )
                .join('')
            : '<div class="muted">No linked articles</div>'
        }
      </div>
    `;

    sideEl.querySelectorAll('[data-jump-cluster]').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.getAttribute('data-jump-cluster');
        if (onSelect) onSelect({ type: 'cluster', name });
      });
    });
  }

  function filteredStockOptions() {
    const all = indexStocksInPublish(groups);
    const q = searchQuery.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      s =>
        s.symbol.toLowerCase().includes(q) ||
        String(s.name || '')
          .toLowerCase()
          .includes(q)
    );
  }

  function paintChrome() {
    if (!host) return;
    let bar = host.querySelector('.tank-controls');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'tank-controls';
      host.insertBefore(bar, host.firstChild);
    }

    const stockList = filteredStockOptions();
    const allStocks = indexStocksInPublish(groups);
    if (!selectedSymbol && allStocks.length) selectedSymbol = allStocks[0].symbol;

    const stockOpts = stockList
      .map(
        s =>
          `<option value="${esc(s.symbol)}" ${
            s.symbol === selectedSymbol ? 'selected' : ''
          }>${esc(s.symbol)} — ${esc(s.name || '')}</option>`
      )
      .join('');

    const layerBtns = LAYER_OPTS.map(L => {
      const on = layers.has(L.id);
      return `<button type="button" class="tank-pill ${on ? 'is-on' : ''}" data-layer="${L.id}">${L.label}</button>`;
    }).join('');

    const timeBtns = TIME_OPTS.map(T => {
      const on = timeframe === T.id;
      return `<button type="button" class="tank-pill ${on ? 'is-on' : ''}" data-time="${T.id}">${T.label}</button>`;
    }).join('');

    bar.innerHTML = `
      <div class="tank-row">
        <button type="button" class="tank-back" id="tankBack" ${
          historyStack.length ? '' : 'disabled'
        } title="Back">← Back</button>
        <label class="tank-label">Search
          <input type="search" class="tank-search" id="tankSearch" placeholder="Ticker or name" value="${esc(
            searchQuery
          )}" />
        </label>
        <label class="tank-label">Stock
          <select class="tank-select" id="tankStock">${
            stockOpts || '<option value="">No tickers</option>'
          }</select>
        </label>
        <div class="tank-group">
          <span class="tank-label">Layers</span>
          ${layerBtns}
        </div>
        <div class="tank-group">
          <span class="tank-label">Time</span>
          ${timeBtns}
        </div>
      </div>
      <div class="tank-hint">Center = stock · clusters + articles linked to it · Back returns to previous stock · Search filters the list</div>
    `;

    const back = bar.querySelector('#tankBack');
    if (back) {
      back.addEventListener('click', () => {
        if (!historyStack.length) return;
        selectedSymbol = historyStack.pop();
        paintChrome();
        rebuild();
      });
    }

    const search = bar.querySelector('#tankSearch');
    if (search) {
      search.addEventListener('input', () => {
        searchQuery = search.value || '';
        paintChrome();
      });
      search.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          const opts = filteredStockOptions();
          if (opts.length) selectStock(opts[0].symbol, true);
        }
      });
    }

    const sel = bar.querySelector('#tankStock');
    if (sel) {
      sel.addEventListener('change', () => {
        selectStock(sel.value, true);
      });
    }

    bar.querySelectorAll('[data-layer]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-layer');
        if (layers.has(id)) {
          if (layers.size > 1) layers.delete(id);
        } else layers.add(id);
        paintChrome();
        rebuild();
      });
    });
    bar.querySelectorAll('[data-time]').forEach(btn => {
      btn.addEventListener('click', () => {
        timeframe = btn.getAttribute('data-time');
        paintChrome();
        rebuild();
      });
    });
  }

  function selectStock(sym, pushHistory) {
    const next = key(sym);
    if (!next) return;
    if (pushHistory && selectedSymbol && selectedSymbol !== next) {
      historyStack.push(selectedSymbol);
      if (historyStack.length > 30) historyStack.shift();
    }
    selectedSymbol = next;
    paintChrome();
    rebuild();
  }

  function sizeCanvas() {
    if (!host || !canvas) return;
    const body = host.querySelector('.tank-body');
    const box = body || host;
    const rect = box.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // Canvas takes ~62% of body width; height = full body (side scrolls independently)
    const w = Math.max(240, Math.floor(rect.width * 0.62));
    const h = Math.max(200, Math.floor(rect.height));
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function rebuild() {
    if (!canvas) return;
    sizeCanvas();
    buildGraph();
  }

  function stop() {
    if (raf != null) {
      cancelAnimationFrame(raf);
      raf = null;
    }
  }

  function step() {
    if (!canvas) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const hub = nodes[0];
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      if (a.fixed || dragIdx === i) continue;
      if (hub) {
        const dx = a.x - hub.x;
        const dy = a.y - hub.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        const ideal = a.kind === 'cluster' ? 150 : 210;
        const k = 0.004;
        a.vx += ((ideal - dist) * k * dx) / dist;
        a.vy += ((ideal - dist) * k * dy) / dist;
      }
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        const minD = a.r + b.r + 14;
        if (dist < minD) {
          const push = ((minD - dist) / minD) * 0.1;
          a.vx += (dx / dist) * push;
          a.vy += (dy / dist) * push;
        }
      }
      a.vx *= 0.9;
      a.vy *= 0.9;
      a.x += a.vx;
      a.y += a.vy;
      if (a.x < PAD + a.r) {
        a.x = PAD + a.r;
        a.vx *= -0.5;
      }
      if (a.x > w - PAD - a.r) {
        a.x = w - PAD - a.r;
        a.vx *= -0.5;
      }
      if (a.y < PAD + a.r) {
        a.y = PAD + a.r;
        a.vy *= -0.5;
      }
      if (a.y > h - PAD - a.r) {
        a.y = h - PAD - a.r;
        a.vy *= -0.5;
      }
    }
    if (hub && hub.fixed) {
      hub.x = w / 2;
      hub.y = h / 2;
    }
  }

  function wrapText(c, text, x, y, maxW, lineH) {
    const words = String(text || '').split(/\s+/);
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (c.measureText(test).width > maxW && line) {
        lines.push(line);
        line = w;
      } else line = test;
    }
    if (line) lines.push(line);
    const start = y - ((Math.min(lines.length, 3) - 1) * lineH) / 2;
    lines.slice(0, 3).forEach((ln, i) => c.fillText(ln, x, start + i * lineH));
  }

  function draw() {
    if (!ctx || !canvas) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    for (const [i, j] of links) {
      const a = nodes[i];
      const b = nodes[j];
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle =
        b.kind === 'article' ? 'rgba(148,163,184,0.35)' : 'rgba(249,115,22,0.4)';
      ctx.lineWidth = b.kind === 'cluster' ? 1.8 : 1.1;
      ctx.stroke();
    }
    for (const n of nodes) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      if (n.kind === 'stock') {
        ctx.fillStyle = 'rgba(30, 20, 12, 0.92)';
        ctx.fill();
        ctx.strokeStyle = n.color;
        ctx.lineWidth = 3;
        ctx.stroke();
      } else if (n.kind === 'cluster') {
        ctx.fillStyle = 'rgba(18, 18, 24, 0.9)';
        ctx.fill();
        ctx.strokeStyle = n.color;
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(22, 24, 30, 0.88)';
        ctx.fill();
        ctx.strokeStyle = n.color || 'rgba(148,163,184,0.55)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.fillStyle = '#f1f5f9';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (n.kind === 'stock') {
        ctx.font = '700 15px DM Sans, system-ui, sans-serif';
        ctx.fillText(n.label, n.x, n.y - 6);
        ctx.font = '10px DM Sans, system-ui, sans-serif';
        ctx.fillStyle = 'rgba(180,180,190,0.95)';
        ctx.fillText(String(n.sub || '').slice(0, 22), n.x, n.y + 12);
      } else if (n.kind === 'cluster') {
        ctx.font = '600 11px DM Sans, system-ui, sans-serif';
        wrapText(ctx, n.label, n.x, n.y - 4, n.r * 1.7, 12);
        ctx.font = '9px DM Sans, system-ui, sans-serif';
        ctx.fillStyle = 'rgba(160,160,170,0.95)';
        ctx.fillText(String(n.sub || '').slice(0, 24), n.x, n.y + n.r * 0.42);
      } else {
        ctx.font = '500 10px DM Sans, system-ui, sans-serif';
        wrapText(ctx, n.label, n.x, n.y - 2, n.r * 1.85, 11);
      }
    }
    if (nodes.length <= 1) {
      ctx.fillStyle = 'rgba(160,160,170,0.9)';
      ctx.font = '13px DM Sans, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        selectedSymbol
          ? 'No clusters/articles for this stock with current filters'
          : 'Pick a stock',
        w / 2,
        h / 2 + 70
      );
    }
  }

  function loop() {
    step();
    draw();
    raf = requestAnimationFrame(loop);
  }

  function onPointerDown(e) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (n.kind === 'stock') continue;
      if (Math.hypot(x - n.x, y - n.y) <= n.r) {
        dragIdx = i;
        dragOx = x - n.x;
        dragOy = y - n.y;
        n.vx = 0;
        n.vy = 0;
        canvas.setPointerCapture(e.pointerId);
        return;
      }
    }
  }

  function onPointerMove(e) {
    if (dragIdx == null || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const n = nodes[dragIdx];
    n.x = e.clientX - rect.left - dragOx;
    n.y = e.clientY - rect.top - dragOy;
    n.vx = 0;
    n.vy = 0;
  }

  function onPointerUp() {
    if (dragIdx != null && onSelect) {
      const n = nodes[dragIdx];
      if (n.kind === 'cluster') onSelect({ type: 'cluster', name: n.label });
      if (n.kind === 'article' && n.link) {
        onSelect({ type: 'article', link: n.link, title: n.label });
      }
    }
    dragIdx = null;
  }

  function onResize() {
    sizeCanvas();
    if (nodes[0] && nodes[0].fixed && canvas) {
      nodes[0].x = canvas.clientWidth / 2;
      nodes[0].y = canvas.clientHeight / 2;
    }
  }

  function render(gs, el, opts) {
    stop();
    host = el;
    groups = gs || [];
    publishes =
      (opts && opts.publishes) ||
      (window.ClustrApp && window.ClustrApp.getPublishes
        ? window.ClustrApp.getPublishes()
        : []) ||
      [];
    onSelect = (opts && opts.onSelect) || null;
    if (opts && opts.symbol) {
      selectedSymbol = key(opts.symbol);
      historyStack = [];
    }

    host.innerHTML = '';
    host.classList.add('mindmap-host');

    const chrome = document.createElement('div');
    chrome.className = 'tank-controls';
    host.appendChild(chrome);

    const body = document.createElement('div');
    body.className = 'tank-body';
    host.appendChild(body);

    canvas = document.createElement('canvas');
    canvas.className = 'mindmap-canvas';
    body.appendChild(canvas);
    ctx = canvas.getContext('2d');

    sideEl = document.createElement('div');
    sideEl.className = 'tank-side';
    body.appendChild(sideEl);

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerUp);
    window.addEventListener('resize', onResize);

    paintChrome();
    rebuild();
    loop();
  }

  function openSymbol(symbol) {
    selectStock(symbol, true);
  }

  function invalidate() {
    onResize();
    rebuild();
  }

  window.ClustrMindmap = {
    render: render,
    invalidate: invalidate,
    stop: stop,
    openSymbol: openSymbol
  };
})();
