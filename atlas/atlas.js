(function (root, factory) {
  const atlas = factory();
  if (typeof module === 'object' && module.exports) module.exports = atlas;
  else root.ClustrAtlas = atlas;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const osloDate = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' });
  const osloTime = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', hour12: false });
  const state = { mode: 'days', search: '', selected: '' };
  let cached = null;
  let loading = null;
  let revision = 0;

  function dayOf(timestamp) {
    const parts = Object.fromEntries(osloDate.formatToParts(new Date(timestamp)).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function scoreOf(group, util) {
    const ratings = (group.articles || []).map(article => article.rating ?? article.score);
    return util.articleImpactScore(ratings) ?? util.numericStance(group.stance_score ?? group.cluster_score);
  }

  function articleKey(article) {
    return String(article.link || article.url || [article.source, article.title, article.date || article.published_at].join('|'));
  }

  function buildModel(publishes, groupsById, mode, util) {
    const ordered = [...publishes].filter(publish => Number.isFinite(Date.parse(publish.created_at)))
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || Number(a.id) - Number(b.id));
    const columns = mode === 'days'
      ? [...new Map(ordered.map(publish => [dayOf(publish.created_at), publish])).values()]
      : ordered;
    const themes = new Map();
    const allThemes = new Set();
    const allStories = new Set();
    for (const publish of ordered) {
      for (const group of groupsById.get(String(publish.id)) || []) {
        if (group.name || group.group) allThemes.add(String(group.name || group.group).trim());
        for (const article of group.articles || []) allStories.add(articleKey(article));
      }
    }
    columns.forEach((publish, index) => {
      for (const group of groupsById.get(String(publish.id)) || []) {
        const name = String(group.name || group.group || '').trim();
        if (!name) continue;
        if (!themes.has(name)) themes.set(name, { name, entries: Array(columns.length).fill(null), count: 0 });
        const articles = [...new Map((group.articles || []).map(article => [articleKey(article), article])).values()];
        const sources = [...new Set(articles.map(article => String(article.source || '').trim()).filter(Boolean))].sort();
        const entry = { publish, group, score: scoreOf({ ...group, articles }, util), articles: articles.length, sources };
        const theme = themes.get(name);
        if (!theme.entries[index]) theme.count++;
        theme.entries[index] = entry;
      }
    });
    return {
      columns,
      themes: [...themes.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      themeCount: allThemes.size,
      publishCount: ordered.length,
      dayCount: new Set(ordered.map(publish => dayOf(publish.created_at))).size,
      storyCount: allStories.size
    };
  }

  function scoreText(score) {
    if (score == null) return '—';
    return `${score > 0 ? '+' : ''}${Number.isInteger(score) ? score : score.toFixed(1)}`;
  }

  function tone(score) {
    return score == null ? 'missing' : score > 0 ? 'up' : score < 0 ? 'down' : 'flat';
  }

  function lineChart(theme, model) {
    const points = theme.entries.map((entry, index) => entry?.score == null ? null : {
      x: 24 + index * 512 / Math.max(1, model.columns.length - 1),
      y: 96 - (entry.score + 10) * 3.6,
      score: entry.score,
      label: model.columns[index].created_at
    }).filter(Boolean);
    if (!points.length) return '<p class="atlas-note">No scored snapshots for this theme.</p>';
    const path = points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
    return `<svg class="atlas-line" viewBox="0 0 560 124" role="img" aria-label="News impact trajectory for ${window.ClustrUtil.escapeHtml(theme.name)}"><line x1="24" x2="536" y1="60" y2="60" class="atlas-zero"/><path d="${path}" class="atlas-path"/>${points.map(point => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="4" class="atlas-point atlas-point--${tone(point.score)}"><title>${window.ClustrUtil.escapeHtml(new Date(point.label).toLocaleString('en', { timeZone: 'Europe/Oslo' }))}: ${scoreText(point.score)}</title></circle>`).join('')}</svg>`;
  }

  function draw(root) {
    if (!cached) return;
    const util = window.ClustrUtil;
    const esc = util.escapeHtml;
    const model = buildModel(cached.publishes, cached.groups, state.mode, util);
    const query = state.search.trim().toLowerCase();
    const themes = model.themes.filter(theme => !query || theme.name.toLowerCase().includes(query) || theme.entries.some(entry =>
      (entry?.group.fixed_stocks || entry?.group.default_stocks || []).some(stock => String(stock.symbol || '').toLowerCase().includes(query))));
    const selected = themes.flatMap(theme => theme.entries.map((entry, index) => entry ? { theme, entry, index } : null).filter(Boolean))
      .find(item => `${item.entry.publish.id}|${item.theme.name}` === state.selected)
      || (() => { const theme = themes[0]; if (!theme) return null; const index = theme.entries.findLastIndex(Boolean); return { theme, entry: theme.entries[index], index }; })();
    if (selected) state.selected = `${selected.entry.publish.id}|${selected.theme.name}`;
    root.querySelector('#atlasScope').textContent = `${model.columns.length} ${state.mode === 'days' ? 'latest daily snapshots' : 'publish snapshots'} from ${model.publishCount} available publishes · ${model.dayCount} Oslo calendar days`;
    root.querySelector('#atlasStats').innerHTML = `<span><strong>${model.themes.length}</strong> themes shown · ${model.themeCount} available</span><span><strong>${model.storyCount}</strong> distinct stories</span><span><strong>${model.publishCount}</strong> reports</span>`;
    root.querySelectorAll('[data-atlas-mode]').forEach(button => {
      const active = button.dataset.atlasMode === state.mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const matrix = root.querySelector('#atlasMatrix');
    const previousScroll = matrix.scrollLeft;
    const hadTable = !!matrix.querySelector('table');
    matrix.innerHTML = themes.length ? `<table class="atlas-table"><thead><tr><th scope="col">Cluster</th>${model.columns.map(publish => `<th scope="col" title="${esc(new Date(publish.created_at).toLocaleString('en', { timeZone: 'Europe/Oslo' }))}"><span>${dayOf(publish.created_at).slice(5)}</span>${state.mode === 'publishes' ? `<small>${osloTime.format(new Date(publish.created_at))}</small>` : ''}</th>`).join('')}</tr></thead><tbody>${themes.map(theme => `<tr><th scope="row"><span>${esc(theme.name)}</span><small>${theme.count} ${state.mode === 'days' ? 'days' : 'reports'}</small></th>${theme.entries.map((entry, index) => entry ? `<td><button type="button" class="atlas-cell atlas-cell--${tone(entry.score)} ${selected?.theme.name === theme.name && selected.index === index ? 'is-selected' : ''}" style="--strength:${Math.round(10 + Math.abs(entry.score || 0) * 7)}%" data-atlas-theme="${esc(theme.name)}" data-atlas-index="${index}" aria-pressed="${selected?.theme.name === theme.name && selected.index === index}" aria-label="${esc(theme.name)}, ${esc(new Date(entry.publish.created_at).toLocaleString('en', { timeZone: 'Europe/Oslo' }))}, news impact ${scoreText(entry.score)}, ${entry.articles} distinct stories"><strong>${scoreText(entry.score)}</strong><small>${entry.articles} stories</small></button></td>` : '<td class="atlas-blank" aria-label="No cluster in this report">·</td>').join('')}</tr>`).join('')}</tbody></table>` : '<p class="atlas-note">No clusters match this search.</p>';
    matrix.scrollLeft = hadTable ? previousScroll : state.mode === 'publishes' ? matrix.scrollWidth : 0;
    const detail = root.querySelector('#atlasDetail');
    if (!selected) { detail.innerHTML = '<p class="atlas-note">Choose a cluster to inspect its history.</p>'; return; }
    const { theme, entry } = selected;
    const defaults = [...new Map((entry.group.fixed_stocks || entry.group.default_stocks || []).filter(stock => stock?.symbol).map(stock => [String(stock.symbol).toUpperCase(), stock])).values()];
    const signals = Array.isArray(entry.group.market_signals) ? entry.group.market_signals : [];
    const prior = theme.entries.slice(0, selected.index).filter(Boolean).at(-1);
    const change = prior?.score != null && entry.score != null ? entry.score - prior.score : null;
    detail.innerHTML = `<div class="atlas-detail-head"><div><p class="atlas-eyebrow">SELECTED SNAPSHOT</p><h2>${esc(theme.name)}</h2><p>${esc(new Date(entry.publish.created_at).toLocaleString('en', { timeZone: 'Europe/Oslo' }))} · ${esc(entry.publish.market || 'US')} · ${entry.articles} distinct stories from ${entry.sources.length} sources</p></div><div class="atlas-detail-score atlas-detail-score--${tone(entry.score)}"><strong>${scoreText(entry.score)}</strong><span>news impact${change == null ? '' : ` · ${change >= 0 ? '+' : ''}${change.toFixed(1)} vs prior snapshot`}</span></div></div><div class="atlas-detail-grid"><section class="atlas-detail-panel"><h3>Theme over time</h3>${lineChart(theme, model)}<p class="atlas-note">Scores describe rated news, not stock returns. One point per selected ${state.mode === 'days' ? 'daily latest report' : 'publish'}.</p></section><section class="atlas-detail-panel"><h3>Source breadth</h3><div class="atlas-tags">${entry.sources.length ? entry.sources.map(source => `<span>${esc(source)}</span>`).join('') : '<span>No source labels</span>'}</div></section><section class="atlas-detail-panel"><h3>Default stocks <small>cluster association</small></h3><div class="atlas-tags">${defaults.length ? defaults.map(stock => `<span>${esc(stock.symbol)}${stock.priceAtPublish != null && Number.isFinite(Number(stock.priceAtPublish)) ? ` · ${Number(stock.priceAtPublish).toFixed(2)}` : ''}</span>`).join('') : '<span>No defaults in this snapshot</span>'}</div></section><section class="atlas-detail-panel"><h3>External observations</h3>${signals.length ? `<div class="atlas-observations">${signals.map(signal => `<div><b>${esc(signal.source || 'Data')}</b><span>${esc(String(signal.metric || '').replace(/_/g, ' '))}: ${esc(Number.isFinite(Number(signal.value)) ? Number(signal.value).toLocaleString('en', { maximumFractionDigits: 2 }) : String(signal.value || '—'))} ${esc(signal.unit || '')}</span><small>${esc(String(signal.observed_at || '').slice(0, 10))}</small></div>`).join('')}</div>` : '<p class="atlas-note">No external observation attached to this snapshot.</p>'}</section></div>`;
  }

  async function render(root) {
    if (!root) return;
    if (!cached) {
      root.innerHTML = '<div class="atlas-loading" role="status">Loading approved publish history…</div>';
      const current = revision;
      if (!loading) loading = (async () => {
        const publishes = await window.ClustrApi.fetchAllPublishes();
        const groups = new Map(await Promise.all(publishes.map(async publish =>
          [String(publish.id), await window.ClustrApi.loadGroupsForPublish(publish)])));
        return { publishes, groups };
      })();
      try {
        const data = await loading;
        if (current !== revision) return;
        cached = data;
      } catch (error) {
        if (current === revision) root.innerHTML = `<p class="atlas-error" role="alert">Could not load Cluster Atlas: ${window.ClustrUtil.escapeHtml(error.message)}</p>`;
        loading = null;
        return;
      }
      loading = null;
    }
    root.innerHTML = `<div class="atlas-shell"><header class="atlas-head"><div><p class="atlas-eyebrow">CLUSTR / HISTORY</p><h1>Cluster Atlas</h1><p>See how news themes change across the publishes available to your account.</p></div><div id="atlasStats" class="atlas-stats"></div></header><div class="atlas-toolbar"><div class="atlas-switch" role="group" aria-label="History granularity"><button type="button" data-atlas-mode="days">Latest each day</button><button type="button" data-atlas-mode="publishes">Every publish</button></div><label>Find theme or default stock<input id="atlasSearch" type="search" placeholder="AI, energy, NVDA…" autocomplete="off" value="${window.ClustrUtil.escapeHtml(state.search)}"></label></div><p id="atlasScope" class="atlas-scope"></p><div class="atlas-legend"><span><i class="atlas-swatch atlas-swatch--down"></i> Negative news</span><span><i class="atlas-swatch atlas-swatch--flat"></i> Neutral</span><span><i class="atlas-swatch atlas-swatch--up"></i> Positive news</span><span>Cell number = impact score · smaller number = distinct stories</span></div><div id="atlasMatrix" class="atlas-matrix" tabindex="0" aria-label="Scrollable cluster impact table"></div><section id="atlasDetail" class="atlas-detail" aria-live="polite"></section></div>`;
    root.querySelector('#atlasSearch').addEventListener('input', event => { state.search = event.target.value; draw(root); });
    root.querySelector('.atlas-switch').addEventListener('click', event => {
      const button = event.target.closest('[data-atlas-mode]');
      if (!button) return;
      state.mode = button.dataset.atlasMode;
      state.selected = '';
      draw(root);
    });
    root.querySelector('#atlasMatrix').addEventListener('click', event => {
      const button = event.target.closest('[data-atlas-theme]');
      if (!button) return;
      const model = buildModel(cached.publishes, cached.groups, state.mode, window.ClustrUtil);
      const entry = model.themes.find(theme => theme.name === button.dataset.atlasTheme)?.entries[Number(button.dataset.atlasIndex)];
      if (!entry) return;
      state.selected = `${entry.publish.id}|${button.dataset.atlasTheme}`;
      draw(root);
    });
    draw(root);
  }

  function invalidate() { cached = null; loading = null; revision++; }

  return { buildModel, render, invalidate };
});
