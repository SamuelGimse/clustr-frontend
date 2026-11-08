(function (root, factory) {
  const dashboard = factory(typeof module === 'object' && module.exports ? require('./regression.js') : root.ClustrRegression);
  if (typeof module === 'object' && module.exports) module.exports = dashboard;
  else root.ClustrDashboard = dashboard;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (regression) {
  let cached = null;
  let loading = null;
  let revision = 0;
  const market = 'US';
  let trendCluster = '';
  let networkStock = '';
  let showAllFits = false;
  let cumulativeImpact = false;
  let resizeObserver = null;
  let watchlistListener = null;

  function scoreText(score) {
    return score == null ? '—' : `${score > 0 ? '+' : ''}${Number.isInteger(score) ? score : score.toFixed(1)}`;
  }

  function tone(score) {
    return score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral';
  }

  function projectionHtml(forecast, esc) {
    if (!forecast) return '<p class="dash-footnote">No stable one-day projection is available.</p>';
    const number = value => Math.abs(value) >= 1000 ? `${value > 0 ? '+' : ''}${value.toExponential(1)}` : scoreText(Number(value.toFixed(1)));
    const date = new Date(forecast.point.time).toLocaleDateString('en', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
    return `<div class="dash-projection-readout"><p class="dash-kicker">+1 DAY · ${esc(date)}</p><strong>${number(forecast.point.value)}</strong><span>95% prediction interval<br><b>${number(forecast.point.lower)} to ${number(forecast.point.upper)}</b></span><small>News impact · one day after the latest report${Math.abs(forecast.point.value) > 10 ? ' · raw estimate outside the chart scale' : ''}</small></div>`;
  }

  function buildWatchlistRecap(publishes, groups, util, atlas, watchlist, network) {
    if (!watchlist?.getItems || !network?.buildGraph) return null;
    const items = watchlist.getItems().filter(stock => String(stock.market || 'US').toUpperCase() === market);
    const publish = [...publishes].filter(row => String(row.market || 'US').toUpperCase() === market && Number.isFinite(Date.parse(row.created_at)))
      .sort((a,b) => Date.parse(b.created_at)-Date.parse(a.created_at) || Number(b.id)-Number(a.id))[0];
    if (!publish) return null;
    if (!items.length) return {publish,total:0,items,stocks:[],graph:{nodes:[],edges:[]},stories:0,context:null};
    const { start, end } = network.windowRange(publish, 1);
    const rows = publishes.filter(row => String(row.market || 'US').toUpperCase() === market && Date.parse(row.created_at)>start && Date.parse(row.created_at)<=end)
      .map(row => ({publish:row,groups:groups.get(String(row.id)) || []}));
    const merged = network.mergeReports(rows, market);
    const scoped = watchlist.linkedGroups(merged, market);
    const graph = network.buildGraph(scoped, market), byId = new Map(graph.nodes.map(node=>[node.id,node]));
    const saved = new Set(items.map(stock => util.normalizeSymbol(stock.symbol)));
    const priceModel = atlas.buildModel(publishes.filter(row=>String(row.market||'US').toUpperCase()===market),groups,'publishes',util);
    const stocks = graph.nodes.filter(node=>node.type==='stock' && saved.has(node.label)).map(node=>{
      const links=graph.edges.filter(edge=>edge.from===node.id||edge.to===node.id);
      const clusters=links.map(edge=>byId.get(edge.from===node.id?edge.to:edge.from)).filter(node=>node.type==='cluster');
      const clusterIds=new Set(clusters.map(node=>node.id));
      const stories=[...new Set(graph.edges.filter(edge=>clusterIds.has(edge.from)&&byId.get(edge.to)?.type==='news').map(edge=>edge.to))].map(id=>byId.get(id));
      const direct=stories.filter(story=>(story.article.mentioned_companies||[]).some(stock=>util.normalizeSymbol(stock.symbol||stock)===node.label));
      const story=[...(direct.length?direct:stories)].sort((a,b)=>(Date.parse(b.article.published_at||b.article.date)||0)-(Date.parse(a.article.published_at||a.article.date)||0)||a.label.localeCompare(b.label))[0];
      const history=priceModel.stocks.find(stock=>stock.market===market&&stock.symbol===node.label);
      const quote=history?.entries.findLast(Boolean);
      return {node,clusters,stories,story,direct:direct.length>0,score:util.articleImpactScore(clusters.map(cluster=>cluster.score)),price:quote?.price??null,priceChange:quote?.priceChange??null};
    }).sort((a,b)=>b.clusters.length-a.clusters.length||b.stories.length-a.stories.length||a.node.label.localeCompare(b.node.label));
    const mostConnected=stocks[0];
    return {publish,total:items.length,items,stocks,graph,stories:graph.nodes.filter(node=>node.type==='news').length,
      context:mostConnected?{publish,reportGroups:groups.get(String(publish.id))||[],windowGroups:scoped,reportCount:rows.length,days:1,focusId:mostConnected.node.id}:null};
  }

  function selectedNetworkStock(recap) { return recap?.stocks.find(stock=>stock.node.id===networkStock) || recap?.stocks[0]; }

  function networkPreview(recap, focus, esc) {
    const graph=recap.graph;
    const clusters=focus.clusters.slice(0,6),ids=new Set(clusters.map(node=>node.id));
    const stories=graph.nodes.filter(node=>node.type==='news'&&graph.edges.some(edge=>ids.has(edge.from)&&edge.to===node.id)).slice(0,10);
    const points=new Map([[focus.node.id,{x:210,y:122}]]);
    clusters.forEach((node,index)=>{const angle=2*Math.PI*index/clusters.length-Math.PI/2;points.set(node.id,{x:210+Math.cos(angle)*112,y:122+Math.sin(angle)*76});});
    stories.forEach((node,index)=>{const angle=2*Math.PI*index/stories.length-Math.PI/2;points.set(node.id,{x:210+Math.cos(angle)*184,y:122+Math.sin(angle)*108});});
    const edges=graph.edges.filter(edge=>points.has(edge.from)&&points.has(edge.to));
    return `<svg class="dash-network-svg" viewBox="0 0 420 244" aria-hidden="true">${edges.map(edge=>{const a=points.get(edge.from),b=points.get(edge.to);return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="${edge.kind==='Default exposure'?'dash-network-default':''}"/>`;}).join('')}${stories.map(node=>{const point=points.get(node.id);return `<circle cx="${point.x}" cy="${point.y}" r="3" class="dash-network-story"/>`;}).join('')}${clusters.map(node=>{const point=points.get(node.id);return `<g><circle cx="${point.x}" cy="${point.y}" r="6" class="dash-network-cluster"/><text x="${point.x}" y="${point.y+18}" text-anchor="middle">${esc(node.label.length>17?node.label.slice(0,16)+'…':node.label)}</text></g>`;}).join('')}<circle cx="210" cy="122" r="35" class="dash-network-center"/><text x="210" y="127" text-anchor="middle" class="dash-network-symbol" style="font-size:${focus.node.label.length>6?12:18}px">${esc(focus.node.label.length>9?focus.node.label.slice(0,8)+'…':focus.node.label)}</text></svg>`;
  }

  function networkWatchlist(recap, selected, esc) {
    const connected=new Map(recap.stocks.map(stock=>[stock.node.label,stock]));
    const items=[...recap.stocks.map(stock=>({symbol:stock.node.label,name:stock.node.name})),...recap.items.filter(item=>!connected.has(item.symbol)).sort((a,b)=>a.symbol.localeCompare(b.symbol))];
    return `<aside class="dash-network-watchlist" aria-label="Network preview watchlist"><h3>Watchlist</h3><small>Linked clusters</small><div class="dash-network-stock-list" role="group" aria-label="Choose a watchlist stock">${items.map(item=>{
      const stock=connected.get(item.symbol),id=stock?.node.id||'';
      return `<button type="button" data-dash-network-stock="${esc(id)}" aria-pressed="${id===selected.node.id}" aria-label="${esc(item.symbol)}, ${stock?.clusters.length||0} linked clusters" title="${esc(stock?item.name||item.symbol:'No connections in this window')}"${stock?'':' disabled'}><strong>${esc(item.symbol)}</strong><span>${stock?.clusters.length||0}</span></button>`;
    }).join('')}</div></aside>`;
  }

  function watchlistPanels(recap, esc) {
    if (!recap) return '';
    if (!recap.total) return '<section class="dash-panel dash-watch-empty"><div><p class="dash-kicker">YOUR WATCHLIST</p><h2>Your market, in one place</h2><p class="dash-footnote">Save a few stocks to see their linked news and connections here.</p></div><button type="button" class="dash-watch-setup" data-dash-nav="watchlist">Create your watchlist →</button></section>';
    const date=new Date(recap.publish.created_at).toLocaleString('en',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
    const stock=selectedNetworkStock(recap);
    return `<div class="dash-personal"><section class="dash-panel"><div class="dash-panel-head"><div><p class="dash-kicker">YOUR WATCHLIST</p><h2>What happened to your stocks</h2></div><button type="button" data-dash-nav="watchlist" aria-label="Manage watchlist">Manage →</button></div><p class="dash-watch-scope">Last 24 hours ending ${esc(date)} ET · ${recap.stocks.length}/${recap.total} stocks connected · ${recap.stories} linked stories</p><div class="dash-watch-list">${recap.stocks.length?recap.stocks.slice(0,3).map(item=>`<article class="dash-watch-stock"><div class="dash-watch-stock-head"><strong>${esc(item.node.label)}</strong><span>${item.clusters.length} ${item.clusters.length===1?'cluster':'clusters'}</span><span class="dash-score dash-score--${tone(item.score)}">${scoreText(item.score)} impact</span>${item.priceChange==null?'':`<span class="dash-watch-price dash-watch-price--${tone(item.priceChange)}">${item.priceChange>=0?'+':''}${item.priceChange.toFixed(2)}% price</span>`}</div>${item.story?`<p>${item.story.url?`<a href="${esc(item.story.url)}" target="_blank" rel="noopener noreferrer">${esc(item.story.label)}</a>`:esc(item.story.label)}</p><small>${item.direct?'Article mention':'Linked cluster story'} · ${esc(item.story.article.source||'Source unavailable')}</small>`:'<p>No linked story in this window.</p>'}</article>`).join(''):'<p class="dash-footnote">No saved connections for your stocks in this 24-hour window.</p>'}</div><p class="dash-footnote">Impact comes from linked clusters. Price changes use the latest saved stock report versus its prior appearance; they are not live quotes.</p></section>${stock?`<section class="dash-panel dash-network-panel"><div class="dash-network-layout" style="${window.ClustrGraphCanvas?.paletteStyle?.()||''}"><a href="#/connections" class="dash-network-preview" data-dash-network aria-label="Open ${esc(stock.node.label)} in Network with the same report and 24-hour window"><div class="dash-panel-head"><div><p class="dash-kicker">YOUR NETWORK</p><h2>${stock===recap.stocks[0]?'Most connected: ':''}${esc(stock.node.label)}</h2></div><span aria-hidden="true">↗</span></div>${networkPreview(recap,stock,esc)}<p>${stock.clusters.length} linked clusters · ${stock.stories.length} linked stories</p><span class="dash-network-open">Open this view in Network →</span><small>Up to 6 clusters and 10 stories shown. Dashed lines show default exposure.</small></a>${networkWatchlist(recap,stock,esc)}</div></section>`:''}</div>`;
  }

  function buildSummary(publishes, groups, selectedMarket, util, atlas, watchlist, network) {
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
    const reportDays = model.columns.slice(-14);
    const watchedNames=new Set(reportDays.flatMap(publish=>watchlist?.linkedGroups?.(groups.get(String(publish.id))||[],publish.market)||[]).map(group=>String(group.name||group.group||'').trim()));
    const days = reportDays.map(publish => {
      const dayIndex = model.columns.indexOf(publish);
      const scored = model.themes.map(theme => theme.entries[dayIndex]?.score).filter(score => score != null);
      const dailyStories = new Map();
      for (const group of groups.get(String(publish.id)) || []) for (const article of group.articles || []) {
        const key = String(article.link || article.url || [article.source, article.title, article.date || article.published_at].join('|'));
        if (!dailyStories.has(key)) dailyStories.set(key, article);
      }
      return { date: publish.created_at, positive: scored.filter(score => score > 0).length,
        negative: scored.filter(score => score < 0).length, neutral: scored.filter(score => score === 0).length,
        stories: dailyStories.size, sources: new Set([...dailyStories.values()].map(article => String(article.source || '').trim()).filter(Boolean)).size };
    });
    const clusterTrends = model.themes.map(theme => ({
      name: theme.name,
      watchlisted:watchedNames.has(theme.name),
      days: reportDays.map(publish => {
        const entry = theme.entries[model.columns.indexOf(publish)];
        return { date: publish.created_at, score: entry?.score ?? null, present: !!entry };
      })
    })).filter(series => series.days.some(day => day.present)).sort((a,b)=>Number(b.watchlisted)-Number(a.watchlisted)||a.name.localeCompare(b.name));
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
      latest, reports: model.publishCount, days, clusterTrends, themes: currentThemes,
      watchlist:buildWatchlistRecap(scoped,groups,util,atlas,watchlist,network),
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

  function impactDays(days, cumulative=false) {
    let total=0;
    return days.map(day=>{
      if(day.score==null||!Number.isFinite(day.score))return {...day,score:null};
      total=Number((total+day.score).toFixed(10));
      return {...day,score:cumulative?total:day.score};
    });
  }

  function impactChart(series, fits, esc, cumulative=false) {
    const days = impactDays(series.days,cumulative), scored = days.filter(day => day.score != null);
    if (!scored.length) return '<p class="dash-footnote">No numeric impacts are available for this cluster in these report days.</p>';
    const compact = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 600px)').matches;
    const width = compact ? Math.max(220, (document.getElementById('dashboardView')?.clientWidth || window.innerWidth) - 42) : 810;
    const left = compact ? 36 : 48, right = compact ? width - 12 : 762;
    const forecast = cumulative ? null : regression.projectOneDay(fits.best, days.at(-1).date);
    const firstTime = Date.parse(days[0].date), lastTime = forecast?.point.time || Date.parse(days.at(-1).date), span = lastTime - firstTime;
    const x = time => span ? left + (time - firstTime) / span * (right - left) : (left + right) / 2;
    const extent=cumulative?Math.max(10,Math.ceil(Math.max(...scored.map(day=>Math.abs(day.score)))/5)*5):10;
    const y = score => 130 - score / extent * 90;
    const coord = (point, field) => `${x(point.time).toFixed(2)} ${y(Math.max(-1000, Math.min(1000, point[field]))).toFixed(2)}`;
    const area = samples => `M${samples.map(point => coord(point, 'upper')).join(' L')} L${[...samples].reverse().map(point => coord(point, 'lower')).join(' L')} Z`;
    const best = fits.best;
    const futureBand = forecast ? `<path class="dash-prediction" d="${area(forecast.band)}"><title>95% model-based prediction interval for a future news impact, including residual noise. Exponential intervals are approximate. Values outside the axis are clipped.</title></path>` : '';
    const zone = forecast ? `<rect class="dash-forecast-zone" x="${x(forecast.reportTime)}" y="40" width="${right - x(forecast.reportTime)}" height="180"/><line class="dash-forecast-divider" x1="${x(forecast.reportTime)}" x2="${x(forecast.reportTime)}" y1="40" y2="220"/>` : '';
    const band = best ? `<path class="dash-confidence" d="M${best.samples.map(point => coord(point, 'upper')).join(' L')} L${[...best.samples].reverse().map(point => coord(point, 'lower')).join(' L')} Z"><title>${cumulative || best.kind === 'exponential' ? 'Approximate ' : ''}95% pointwise confidence interval for the fitted mean, conditional on the selected model and independent errors.${cumulative ? ' Cumulative observations share prior scores, so nominal 95% coverage is not calibrated.' : ''} Values outside the axis are clipped.</title></path>` : '';
    const curves = fits.models.filter(model => model.fit && (showAllFits || model.fit === best)).map(model => {
      const classes = `dash-fit dash-fit--${model.kind}${model.fit === best ? ' dash-fit--best' : ''}`;
      const extension = forecast ? regression.projectOneDay(model.fit, days.at(-1).date) : null;
      const past = `<path class="${classes}" d="M${model.fit.samples.map(point => coord(point, 'value')).join(' L')}"><title>${model.label} · R² ${model.fit.r2.toFixed(3)}</title></path>`;
      const future = extension ? `<path class="${classes} dash-fit--projection" d="M${extension.curve.map(point => coord(point, 'value')).join(' L')}"><title>${model.label} · +1 day model projection</title></path>` : '';
      return past + future;
    }).join('');
    const ticks = days.filter((day, index) => index === 0 || index === days.length - 1 || (compact ? index === Math.floor((days.length - 1) / 2) : index % 3 === 0)).filter(day => !forecast || right - x(Date.parse(day.date)) > 50);
    const labels = ticks.map(day => `<text x="${x(Date.parse(day.date)).toFixed(1)}" y="248" text-anchor="${day === days[0] ? 'start' : !forecast && day === days.at(-1) ? 'end' : 'middle'}">${esc(new Date(day.date).toLocaleDateString('en', { timeZone: 'America/New_York', month: 'short', day: 'numeric' }))}</text>`).join('');
    const projectionLabel = forecast ? `<text x="${right}" y="28" text-anchor="end">+1 day</text><text x="${right}" y="248" text-anchor="end">${esc(new Date(forecast.point.time).toLocaleDateString('en', { timeZone: 'America/New_York', month: 'short', day: 'numeric' }))}</text>` : '';
    const marker = forecast && Math.abs(forecast.point.value) <= 10 ? `<circle class="dash-projection-dot" cx="${right}" cy="${y(forecast.point.value)}" r="4"><title>Projected impact: ${scoreText(forecast.point.value)}</title></circle>` : '';
    const description=cumulative?`cumulative impact over ${scored.length} scored report days${best?` with ${best.label.toLowerCase()} regression and an approximate 95% mean confidence band`: ', insufficient days for regression'}`:`scatter plot of ${scored.length} daily cluster impacts${forecast ? ', plus a one-day projection with a 95% prediction interval' : ''}${best ? ` with ${best.label.toLowerCase()} regression and a 95% confidence band` : ', insufficient days for regression'}`;
    return `<svg class="dash-impact-chart" viewBox="0 0 ${width} 260" role="img" aria-label="${esc(series.name)}: ${description}"><defs><clipPath id="dash-trend-plot"><rect x="${left}" y="40" width="${right - left}" height="180"/></clipPath></defs>${[-extent, -extent/2, 0, extent/2, extent].map(score => `<line x1="${left}" x2="${right}" y1="${y(score)}" y2="${y(score)}" class="dash-gridline"/><text x="8" y="${y(score) + 4}">${score > 0 ? '+' : ''}${score}</text>`).join('')}<g clip-path="url(#dash-trend-plot)">${zone}${band}${futureBand}${curves}</g>${scored.map(day => `<circle cx="${x(Date.parse(day.date)).toFixed(1)}" cy="${y(day.score).toFixed(1)}" r="5" class="dash-observed-dot"><title>${esc(series.name)} · ${esc(new Date(day.date).toLocaleDateString('en', { timeZone: 'America/New_York' }))}: ${scoreText(day.score)} ${cumulative?'cumulative':'news'} impact</title></circle>`).join('')}${marker}${labels}${projectionLabel}</svg>`;
  }

  function coverageChart(days, esc) {
    const max = Math.max(1, ...days.map(day => day.stories));
    return `<div class="dash-coverage-key"><span><i class="dash-key-stories"></i> Stories</span><span><i class="dash-key-sources"></i> Sources</span></div><div class="dash-coverage-chart" role="img" aria-label="Distinct stories and sources by report day">${days.map(day => `<div class="dash-coverage-day" title="${day.stories} stories from ${day.sources} sources"><div class="dash-coverage-bars"><i class="dash-story-bar" style="height:${Math.max(3, day.stories / max * 100)}%"></i><i class="dash-source-bar" style="height:${Math.max(3, day.sources / max * 100)}%"></i></div><small>${esc(new Date(day.date).toLocaleDateString('en', { timeZone: 'America/New_York', month: 'numeric', day: 'numeric' }))}</small></div>`).join('')}</div>`;
  }

  function distributionChart(distribution, esc) {
    const max = Math.max(1, ...distribution.map(([, count]) => count));
    return `<div class="dash-distribution">${distribution.map(([label, count], index) => `<div><span>${esc(label)}</span><i class="dash-distribution-track"><b class="dash-distribution-bar dash-distribution-bar--${index < 2 ? 'negative' : index > 2 ? 'positive' : 'neutral'}" style="width:${count / max * 100}%"></b></i><strong>${count}</strong></div>`).join('')}</div>`;
  }

  function trendPanel(summary, esc) {
    const series = summary.clusterTrends.find(item => item.name === trendCluster)
      || summary.clusterTrends.find(item=>item.watchlisted)
      || summary.clusterTrends.find(item => item.name === summary.rankedThemes[0]?.name)
      || summary.clusterTrends[0];
    if (!series) return `<section class="dash-panel dash-panel--wide"><p class="dash-kicker">CLUSTER TREND</p><p>${window.ClustrWatchlist?.isFiltered?.()?'No clusters match your watchlist and selected link types.':'No cluster history is available.'}</p></section>`;
    trendCluster = series.name;
    const fits = regression.fitRegressions(impactDays(series.days,cumulativeImpact)), best = fits.best;
    const forecast = regression.projectOneDay(best, series.days.at(-1).date);
    const projectionKeys = forecast ? '<span><i class="dash-key-projection"></i>+1 day projection</span><span><i class="dash-key-prediction"></i>95% prediction interval</span>' : '';
    const shown = fits.models.filter(model => model.fit && (showAllFits || model.fit === best));
    const options = summary.clusterTrends.map(item => `<option value="${esc(item.name)}"${item === series ? ' selected' : ''}>${esc(item.name)}${item.watchlisted?' · Watchlist':''}</option>`).join('');
    const controls = `<div class="dash-trend-controls"><label for="dashTrendCluster">Cluster</label><select id="dashTrendCluster" data-dash-cluster>${options}</select><button type="button" role="switch" aria-checked="${cumulativeImpact}" class="dash-mode-toggle" data-dash-cumulative><span class="dash-switch-track" aria-hidden="true"></span><span>Cumulative impact</span></button><label class="dash-show-fits"><input type="checkbox" data-dash-show-fits${showAllFits ? ' checked' : ''}>Show all regression fits</label></div>`;
    if(cumulativeImpact){
      const total=impactDays(series.days,true).filter(day=>day.score!=null).at(-1)?.score??null;
      const keys=fits.models.filter(model=>model.fit&&(showAllFits||model.fit===best)).map(model=>`<span><i class="dash-key-model dash-key-model--${model.kind}${model.fit===best?' dash-key-best':''}"></i>${model.label}${model.fit===best?' · best':''}</span>`).join('');
      return `<section class="dash-panel dash-panel--wide dash-trend-panel"><div class="dash-panel-head"><div><p class="dash-kicker">CLUSTER TREND</p><h2>Cumulative news impact</h2><p class="dash-trend-scope">Latest approved report per US market day · running total over up to 14 report days</p></div>${controls}</div><div class="dash-trend-layout"><div>${impactChart(series,fits,esc,true)}<div class="dash-chart-key"><span><i class="dash-key-observed"></i>Cumulative impact</span>${keys}${best ? '<span><i class="dash-key-confidence"></i>95% mean CI · approximate</span>' : ''}</div><p class="dash-footnote">Running sum of ${esc(series.name)} daily scores, starting from zero at the beginning of this window. Missing scores are omitted and do not add impact. Dots are cumulative observations; lines are regression fits, not connections between dots. The total is an impact index, not a percentage or a stock return.</p></div><div class="dash-trend-readout"><p class="dash-kicker">CUMULATIVE IMPACT</p><strong>${scoreText(total)}</strong><span>Sum of scored report days in this window</span><p class="dash-kicker">BEST FIT TO CUMULATIVE SCORES</p><strong>${best?best.label:'More history needed'}</strong><span>${best?`R² ${best.r2.toFixed(3)} · ${best.count} scored report days`:'At least 3 scored report days'}</span><p>Cumulative scores share prior values. R² is descriptive, not evidence of predictability. The shaded band is an approximate 95% fitted-mean CI under independent-error assumptions. Cumulative observations are correlated, so nominal coverage is not calibrated. Forecasts are not shown in this mode.</p></div></div></section>`;
    }
    const keys = shown.map(model => `<span><i class="dash-key-model dash-key-model--${model.kind}${model.fit === best ? ' dash-key-best' : ''}"></i>${model.label}${model.fit === best ? ' · best' : ''}</span>`).join('');
    const legend = `<div class="dash-chart-key"><span><i class="dash-key-observed"></i>Cluster impact</span>${keys}${projectionKeys}${best ? '<span><i class="dash-key-confidence"></i>95% mean CI</span>' : ''}</div>`;
    const rows = fits.models.map(model => {
      const value = model.fit ? model.fit.r2.toFixed(3) : fits.points.length < model.required ? `Needs ${model.required} days` : 'Not estimable';
      const chosen = model.fit && model.fit === best;
      return `<tr${chosen ? ' class="is-best"' : ''}><th scope="row">${model.label}${chosen ? ' <span>Best</span>' : ''}</th><td>${value}</td></tr>`;
    }).join('');
    const comparison = `<table class="dash-model-comparison"><caption>Original-scale R²</caption><tbody>${rows}</tbody></table>`;
    const result = best ? `R² ${best.r2.toFixed(3)} · ${best.count} scored report days` : 'At least 3 scored report days';
    const projection = best ? projectionHtml(forecast, esc) : '';
    const approximate = best?.kind === 'exponential' ? '; exponential intervals are approximate' : '';
    return `<section class="dash-panel dash-panel--wide dash-trend-panel"><div class="dash-panel-head"><div><p class="dash-kicker">CLUSTER TREND</p><h2>News impact by report day</h2><p class="dash-trend-scope">Latest approved report per US market day · up to 14 report days · +1 day projection</p></div>${controls}</div><div class="dash-trend-layout"><div>${impactChart(series, fits, esc)}${legend}<p class="dash-footnote">Dots show only ${esc(series.name)}. Missing scores are omitted. Historical band: 95% fitted-mean CI. Future band: 95% prediction interval${approximate}. Both assume independent, normally distributed residuals. Forecast accuracy has not been backtested.</p></div><div class="dash-trend-readout"><p class="dash-kicker">BEST FIT FOR THIS CLUSTER</p><strong>${best ? best.label : 'More history needed'}</strong><span>${result}</span>${projection}${comparison}<p>Fits use the same observations for this cluster. R² describes historical fit. Projections and intervals are conditional on this model.</p></div></div></section>`;
  }

  function paint(root, summary) {
    const esc = window.ClustrUtil.escapeHtml;
    if (!summary) {
      root.innerHTML = `<div class="dash-shell"><header class="dash-header"><div><p class="dash-kicker">CLUSTR MARKET / OVERVIEW</p><h1>Dashboard</h1></div></header><div class="dash-empty">No approved ${esc(market)} publishes are available yet.</div></div>`;
      return;
    }
    const date = new Date(summary.latest.created_at).toLocaleString('en', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' });
    const maxDaily = Math.max(1, ...summary.days.map(day => day.positive + day.negative));
    const latestDay = summary.days.at(-1);
    const metric = (label, value, note) => `<div class="dash-metric"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`;
    const clusterRow = theme => `<div class="dash-list-row"><span class="dash-score dash-score--${tone(theme.score)}">${scoreText(theme.score)}</span><div><strong>${esc(theme.name)}</strong><small>${theme.articles} stories · ${theme.sources} sources</small></div><span class="dash-delta">${theme.delta == null ? 'New' : `${theme.delta > 0 ? '+' : ''}${theme.delta} shift`}</span></div>`;
    root.innerHTML = `<div class="dash-shell"><header class="dash-header"><div><p class="dash-kicker">CLUSTR MARKET / OVERVIEW</p><h1>Dashboard</h1><p>${esc(market)} report · ${esc(date)} · ${summary.reports} reports in history</p></div></header>
      ${watchlistPanels(summary.watchlist,esc)}
      <div class="dash-metrics">${metric('Clusters in latest report', summary.themes.length, `${latestDay.positive} positive · ${latestDay.negative} negative`)}${metric('Distinct stories', summary.stories, `${summary.rated} rated on −10 to +10`)}${metric('Stocks connected', summary.stocks.length, 'Linked to latest clusters')}${metric('News sources', summary.sourceCount, 'In the latest report')}</div>
      <div class="dash-grid">${trendPanel(summary, esc)}<section class="dash-panel"><div class="dash-panel-head"><div><p class="dash-kicker">DIRECTION</p><h2>News balance</h2></div><span>Latest report per US market day · up to 14 days</span></div><div class="dash-balance">${summary.days.map(day => {
        const total = day.positive + day.negative;
        const positive = day.positive / maxDaily * 100;
        const negative = day.negative / maxDaily * 100;
        return `<div class="dash-day"><time>${esc(new Date(day.date).toLocaleDateString('en', { timeZone: 'America/New_York', month: 'short', day: 'numeric' }))}</time><div class="dash-bar" role="img" aria-label="${day.positive} positive, ${day.negative} negative, ${day.neutral} neutral clusters"><span class="dash-bar-up" style="width:${positive}%"></span><span class="dash-bar-down" style="width:${negative}%"></span></div><b>${day.positive} <i>↑</i> / ${day.negative} <i>↓</i></b></div>`;
      }).join('')}</div><p class="dash-footnote">Counts show cluster news direction, not price performance. Neutral clusters are excluded from the bars.</p></section>
      <section class="dash-panel"><div class="dash-panel-head"><div><p class="dash-kicker">COVERAGE TREND</p><h2>Stories and sources over time</h2></div></div>${coverageChart(summary.days, esc)}<p class="dash-footnote">Counts use distinct stories in each daily latest report. Both bars share a count scale.</p></section>
      <section class="dash-panel"><div class="dash-panel-head"><div><p class="dash-kicker">COVERAGE</p><h2>Where the stories came from</h2></div></div><div class="dash-sources">${summary.sources.length ? summary.sources.map(([source, count]) => `<div><span>${esc(source)}</span><strong>${count}</strong></div>`).join('') : '<p class="dash-footnote">No source labels in this report.</p>'}</div><p class="dash-footnote">Distinct stories, counted once per source in the latest report.</p></section>
      <section class="dash-panel"><div class="dash-panel-head"><div><p class="dash-kicker">SCORE SPREAD</p><h2>Latest impact distribution</h2></div></div>${distributionChart(summary.distribution, esc)}<p class="dash-footnote">Number of latest-report clusters in each news-impact band.</p></section>
      <section class="dash-panel"><div class="dash-panel-head"><div><p class="dash-kicker">LATEST REPORT</p><h2>Strongest cluster impact</h2></div><button type="button" data-dash-nav="events">All events →</button></div><div class="dash-list">${summary.rankedThemes.length ? summary.rankedThemes.map(clusterRow).join('') : '<p class="dash-footnote">No scored clusters in this report.</p>'}</div></section>
      <section class="dash-panel"><div class="dash-panel-head"><div><p class="dash-kicker">STOCK LINKS</p><h2>Stocks in the story</h2></div><button type="button" data-dash-nav="stocks">Open stocks →</button></div><div class="dash-list">${summary.stocks.length ? summary.stocks.slice(0, 7).map(stock => `<div class="dash-list-row"><span class="dash-ticker">${esc(stock.symbol)}</span><div><strong>${esc(stock.company)}</strong><small>${stock.clusters} linked clusters</small></div><span class="dash-score dash-score--${tone(stock.score)}">${scoreText(stock.score)}</span></div>`).join('') : '<p class="dash-footnote">No resolved stock links in this report.</p>'}</div><p class="dash-footnote">Scores combine linked cluster news. They are not stock returns.</p></section>
      <section class="dash-panel dash-panel--wide"><div class="dash-panel-head"><div><p class="dash-kicker">CHANGE</p><h2>Largest shifts since prior appearance</h2></div><button type="button" data-dash-nav="atlas">Explore history →</button></div><div class="dash-shifts">${summary.shifts.length ? summary.shifts.map(clusterRow).join('') : '<p class="dash-footnote">More report history is needed to compare cluster scores.</p>'}</div></section></div></div>`;
  }

  function scopedSummary() {
    const selected = window.ClustrApp?.getPublishes?.()[window.ClustrApp?.getPublishIndex?.() || 0];
    const cutoff = Date.parse(selected?.created_at);
    const publishes = Number.isFinite(cutoff) ? cached.publishes.filter(publish=>Date.parse(publish.created_at)<cutoff || Date.parse(publish.created_at)===cutoff && (String(publish.id)===String(selected.id) || Number(publish.id)<Number(selected.id))) : cached.publishes;
    const groups = window.ClustrWatchlist?.filterGroupMap(cached.groups, publishes) || cached.groups;
    return buildSummary(publishes, groups, market, window.ClustrUtil, window.ClustrAtlas,window.ClustrWatchlist,window.ClustrConnections);
  }

  function watchChartWidth(root) {
    if (typeof ResizeObserver === 'undefined') return;
    resizeObserver?.disconnect();
    let width = root.clientWidth;
    resizeObserver = new ResizeObserver(() => {
      if (!root.clientWidth || root.clientWidth === width || !cached) return;
      width = root.clientWidth;
      const summary = scopedSummary();
      const series = summary?.clusterTrends.find(item => item.name === trendCluster);
      const chart = root.querySelector('.dash-impact-chart');
      if (series && chart) chart.outerHTML = impactChart(series, regression.fitRegressions(impactDays(series.days,cumulativeImpact)), window.ClustrUtil.escapeHtml,cumulativeImpact);
    });
    resizeObserver.observe(root);
  }

  async function render(root, onNavigate) {
    if (!root) return;
    if (!cached) {
      root.innerHTML = '<div class="dash-loading" role="status">Loading dashboard from approved publishes…</div>';
      const current = revision;
      if (!loading) loading = (async () => {
        const publishes = await (window.ClustrApi.fetchHistorySummaries || window.ClustrApi.fetchAllPublishes)();
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
    const summary = scopedSummary();
    paint(root, summary);
    watchChartWidth(root);
    if(watchlistListener)window.removeEventListener?.('clustr:watchlist-change',watchlistListener);
    watchlistListener=()=>{if(cached&&root.isConnected!==false&&!root.classList?.contains('hidden'))paint(root,scopedSummary());};
    window.addEventListener?.('clustr:watchlist-change',watchlistListener);
    root.onchange = event => {
      const selector = event.target.closest('[data-dash-cluster]');
      const showFits = event.target.closest('[data-dash-show-fits]');
      if (!selector && !showFits) return;
      if (selector) trendCluster = selector.value;
      else showAllFits = showFits.checked;
      paint(root, scopedSummary());
      root.querySelector(selector ? '[data-dash-cluster]' : '[data-dash-show-fits]')?.focus({ preventScroll: true });
    };
    root.onclick = event => {
      if(event.target.closest('[data-dash-cumulative]')){
        cumulativeImpact=!cumulativeImpact;
        paint(root,scopedSummary());
        root.querySelector('[data-dash-cumulative]')?.focus({preventScroll:true});
        return;
      }
      const stockButton=event.target.closest('[data-dash-network-stock]');
      if(stockButton && !stockButton.disabled){
        networkStock=stockButton.dataset.dashNetworkStock;
        paint(root,scopedSummary());
        root.querySelector('[data-dash-network-stock][aria-pressed="true"]')?.focus({preventScroll:true});
        return;
      }
      if (event.target.closest('[data-dash-network]')) {
        event.preventDefault();
        const recap=scopedSummary()?.watchlist,stock=selectedNetworkStock(recap);
        if (recap?.context && stock) { window.ClustrWatchlist?.setScope('watchlist'); onNavigate('connections',{...recap.context,focusId:stock.node.id}); }
        return;
      }
      const navButton = event.target.closest('[data-dash-nav]');
      if (navButton) onNavigate(navButton.dataset.dashNav);
    };
  }

  function invalidate() { cached = null; loading = null; networkStock=''; revision++; }

  return { buildSummary, buildWatchlistRecap, impactDays, render, invalidate };
});
