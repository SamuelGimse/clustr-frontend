/* Shared with the Clustr frontend. Consolidate reusable themes without changing article evidence. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ClustrTaxonomy = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const families = {
    'Artificial Intelligence': ['AI', 'AI agents & autonomy', 'AI safety & philosophy', 'AI agents', 'AI safety'],
    'Space & aerospace': ['Space & NASA', 'Space & orbital', 'Space & satellites', 'Space & orbital infrastructure',
      'Space & orbital industry', 'Space & launch', 'Space exploration', 'Nuclear spaceflight'],
    'Data centers': ['Data centers & power', 'Data centers & power demand', 'Datacenters'],
    'Aging & eldercare': ['Aging demographics', 'Demographics & aging', 'Aging and eldercare'],
    'Maritime nuclear': ['Marine nuclear propulsion', 'Maritime nuclear propulsion'],
    'Robotics & autonomy': ['Humanoid robots', 'Humanoid robotics'],
    'US interest rates': ['Federal Reserve policy', 'FOMC minutes'],
    'Regulation & policy': ['Federal Reserve enforcement actions'],
    'Health & biotech': ['Measles resurgence', 'Obesity drug trials'],
    'Nuclear energy': ['Poland SMR plant', 'US molten salt reactor funding'],
    'Clean energy buildout': ['Renewables', 'Renewables capacity growth'],
    'Oil & energy': ['Oil supply fears'],
    'Shipping & trade': ['Northern Sea Route shipping', 'Tanker profits surge']
  };
  const normalize = name => String(name || '').toLowerCase().replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
  const aliases = new Map(Object.entries(families).flatMap(([name, values]) =>
    [name, ...values].map(value => [normalize(value), name])));

  function canonicalName(name) {
    const cleaned = String(name || '').replace(/\s+/g, ' ').trim();
    return aliases.get(normalize(cleaned)) || cleaned;
  }

  function clusterScore(articles) {
    const ratings = articles.filter(article => article.rating != null && article.rating !== '')
      .map(article => Number(article.rating)).filter(Number.isFinite)
      .map(rating => Math.max(-10, Math.min(10, rating))).filter(rating => rating !== 0);
    if (!ratings.length) return 0;
    const impact = ratings.reduce((sum, rating) => sum + Math.sign(rating) * Math.pow(3, Math.abs(rating)), 0) / ratings.length;
    if (Math.abs(impact) < 1e-12) return 0;
    return Math.max(-10, Math.min(10, Number((Math.sign(impact) * Math.log(Math.abs(impact)) / Math.log(3)).toFixed(1))));
  }

  function unique(values, field) {
    const result = new Map();
    for (const value of values) {
      const key = field === 'articles'
        ? value.link || value.url || value.id || JSON.stringify([value.title, value.source, value.date || value.published_at])
        : value && typeof value === 'object' && (value.symbol || value.ticker)
          ? String(value.symbol || value.ticker).toUpperCase()
          : typeof value === 'string' ? value.toUpperCase() : JSON.stringify(value);
      const previous = result.get(key);
      result.set(key, previous && typeof previous === 'object' && value && typeof value === 'object'
        ? { ...value, ...previous } : value && typeof value === 'object' ? value : previous || value);
    }
    return [...result.values()];
  }

  function mergeGroups(groups) {
    const result = new Map();
    for (const group of groups || []) {
      const original = group.name || group.group || group.title || '';
      const name = canonicalName(original);
      if (!name) continue;
      const key = normalize(name);
      let item = result.get(key);
      if (!item) {
        item = { group: { ...group, name, group: name, cluster_bank_key: key.replace(/ /g, '-') }, count: 0, names: new Set() };
        result.set(key, item);
      }
      for (const name of group.merged_from || [original]) item.names.add(name);
      if (item.count) {
        for (const [field, value] of Object.entries(group)) {
          if (Array.isArray(value)) item.group[field] = unique([...(Array.isArray(item.group[field]) ? item.group[field] : []), ...value], field);
          else if (field === 'kind' && value === 'fixed') item.group.kind = 'fixed';
          else if (item.group[field] == null) item.group[field] = value;
        }
      }
      item.count++;
    }
    return [...result.values()].map(({ group, count, names }) => {
      if (count > 1 && Array.isArray(group.articles)) {
        group.count = group.articles.length;
        group.cluster_score = group.stance_score = clusterScore(group.articles);
        group.stance = group.cluster_score > 0 ? 'constructive' : group.cluster_score < 0 ? 'cautious' : 'watch';
        group.mention_counts = {};
        for (const article of group.articles) {
          const names = new Set((article.mentioned_companies || []).map(value =>
            typeof value === 'string' ? value : value.name || value.company || '').filter(Boolean));
          for (const name of names) group.mention_counts[name] = (group.mention_counts[name] || 0) + 1;
        }
      }
      if (count > 1 || [...names].some(name => name !== group.name)) group.merged_from = [...names];
      return group;
    });
  }

  return { families, canonicalName, clusterScore, mergeGroups };
});
