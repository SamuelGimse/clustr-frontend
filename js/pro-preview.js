(function (root) {
  const features = {
    stocks: { label: 'Stocks', title: 'Find what connects to a stock.', description: 'Search stocks from the last seven days of reports, then inspect their article mentions and wider cluster links.', points: ['Search by ticker or company', 'Switch between article mentions and all cluster links', 'Read cluster impact and source context'] },
    weekly: { label: 'Trends', title: 'Follow the week, day by day.', description: 'Compare daily article impact with cluster activity, then inspect themes that appeared on multiple days.', points: ['Daily impact and cluster activity chart', 'Recurring clusters and score changes', 'Saved daily briefs and weekly cluster summaries'] },
    atlas: { label: 'History', title: 'See how the story unfolds.', description: 'Travel through past reports and see how themes and stock connections evolve.', points: ['Cluster and stock history', 'Compare reports across time', 'Open the evidence behind a score'] },
    watchlist: { label: 'Watchlist', title: 'Your stocks. Their bigger picture.', description: 'Build a personal watchlist and focus your workspace on the connections that matter to you.', points: ['A watchlist saved to your account', 'Filter by stock and relationship type', 'Your research, across devices'] }
  };
  const grid = `<g class="pp-grid">${[80, 160, 240, 320].map(y => `<path d="M35 ${y}H565"/>`).join('')}</g>`;
  function illustration(view) {
    if (view === 'weekly') return `
      <text x="24" y="35">WEEKLY CLUSTERS &amp; TRENDS · 7 DAYS</text>
      <rect class="pp-pill" x="24" y="52" width="125" height="34" rx="9"/><text x="43" y="74">CLUSTERS</text>
      <rect class="pp-stock" x="155" y="52" width="105" height="34" rx="9"/><text class="pp-positive" x="178" y="74">TRENDS</text>
      <rect class="pp-row" x="24" y="98" width="170" height="55" rx="9"/><text x="39" y="119">ACTIVE CLUSTERS</text><text class="pp-company" x="39" y="143">12</text>
      <rect class="pp-row" x="203" y="98" width="174" height="55" rx="9"/><text x="218" y="119">UNIQUE STORIES</text><text class="pp-company" x="218" y="143">48</text>
      <rect class="pp-row" x="386" y="98" width="190" height="55" rx="9"/><text x="401" y="119">AVERAGE IMPACT</text><text class="pp-positive" x="401" y="143">+2.1</text>
      <rect class="pp-row" x="24" y="166" width="552" height="138" rx="10"/>
      <text x="39" y="187">DAILY ARTICLE IMPACT</text><text x="345" y="187">▥ CLUSTER RELEASES</text>
      <path class="pp-zero" d="M52 254H558"/><text x="31" y="255">0</text>
      ${[[74,235,3],[152,218,5],[230,246,2],[308,207,7],[386,224,4],[464,193,6],[542,210,5]].map(([x,y,count]) => `<rect class="pp-volume" x="${x-8}" y="${278-count*7}" width="16" height="${count*7}" rx="3"/>`).join('')}
      <path class="pp-line" d="M74 235 152 218 230 246 308 207 386 224 464 193 542 210"/>
      ${[[74,235],[152,218],[230,246],[308,207],[386,224],[464,193],[542,210]].map(([x,y]) => `<circle class="pp-story-dot" cx="${x}" cy="${y}" r="4"/>`).join('')}
      <text x="42" y="294">MON</text><text x="505" y="294">SUN</text>
      <text x="25" y="329">REPEATED CLUSTERS · FIRST → LATEST SCORE</text>
      <rect class="pp-row" x="24" y="342" width="265" height="42" rx="8"/><text x="38" y="367">Grid capacity</text><text class="pp-positive" x="190" y="367">+2 → +4</text>
      <rect class="pp-row" x="298" y="342" width="278" height="42" rx="8"/><text x="312" y="367">Chip supply</text><text class="pp-negative" x="455" y="367">−1 → −3</text>`;
    if (view === 'atlas') return `<text x="30" y="45">CLUSTER / REPORT DAY</text>${['AI','Energy','Cybersecurity','Semiconductors','Data centers'].map((name,row) => `<text x="25" y="${105+row*53}">${name}</text>${Array.from({length:7},(_,col) => { const score=((row*3+col*2)%9)-4; return `<rect x="${190+col*53}" y="${76+row*53}" width="44" height="40" rx="8" class="${score<0?'pp-cell-down':'pp-cell-up'}" opacity="${.35+Math.abs(score)*.14}"/><text class="pp-cell-label" x="${212+col*53}" y="${101+row*53}" text-anchor="middle">${score>0?'+':''}${score}</text>`; }).join('')}`).join('')}<text x="190" y="365">DAY 1</text><text x="505" y="365">DAY 7</text>`;
    if (view === 'watchlist') return `<text x="30" y="43">MY WATCHLIST</text><rect class="pp-pill" x="395" y="21" width="175" height="32" rx="16"/><text x="416" y="42">SAVED STOCKS</text>${['DEMO A','DEMO B','DEMO C','DEMO D'].map((name,i) => `<rect class="pp-row" x="25" y="${75+i*71}" width="550" height="58" rx="12"/><text class="pp-star" x="43" y="${112+i*71}">★</text><text class="pp-company" x="82" y="${101+i*71}">${name}</text><text x="82" y="${121+i*71}">Fictional company ${i+1}</text><text x="352" y="${110+i*71}">${i+2} clusters</text><text class="${i===2?'pp-negative':'pp-positive'}" x="495" y="${110+i*71}">${['+3.1','+1.8','−2.4','+4.0'][i]}</text>`).join('')}`;
    return `
      <text x="24" y="35">STOCKS · ROLLING 7 DAYS</text>
      <rect class="pp-row" x="20" y="54" width="340" height="328" rx="12"/>
      <text x="38" y="81">US · STOCK CONNECTIONS</text><text class="pp-company" x="38" y="111">DEMO A</text>
      <text x="38" y="132">Example company · 3 linked clusters</text>
      <rect class="pp-stock" x="38" y="149" width="140" height="32" rx="8"/><text class="pp-positive pp-small" x="48" y="169">Articles 2</text>
      <rect class="pp-pill" x="184" y="149" width="157" height="32" rx="8"/><text class="pp-small" x="194" y="169">All cluster links 3</text>
      <text class="pp-small" x="38" y="201">Article mentions · close links · defaults</text>
      <rect class="pp-stock" x="38" y="216" width="304" height="68" rx="9"/>
      <text class="pp-company pp-small" x="51" y="238">Grid capacity</text><text class="pp-positive" x="297" y="238">+4</text>
      <text class="pp-small" x="51" y="258">Cluster default · 2 source articles</text><text class="pp-small" x="51" y="275">Read context ↓</text>
      <rect class="pp-stock" x="38" y="294" width="304" height="68" rx="9"/>
      <text class="pp-company pp-small" x="51" y="316">Chip demand</text><text class="pp-negative" x="297" y="316">−2</text>
      <text class="pp-small" x="51" y="338">Article mention · 1 source article</text>
      <rect class="pp-row" x="370" y="54" width="210" height="328" rx="12"/>
      <text x="387" y="81">FIND A STOCK</text><rect class="pp-stock" x="386" y="93" width="178" height="36" rx="8"/>
      <text class="pp-small" x="399" y="115">Ticker or company</text><text class="pp-small" x="388" y="152">3 OF 3 STOCKS</text>
      ${['DEMO A','DEMO B','DEMO C'].map((name,i) => `<rect class="${i===0?'pp-stock':'pp-row'}" x="386" y="${164+i*68}" width="178" height="57" rx="8"/><text class="pp-company pp-small" x="399" y="${187+i*68}">${name}</text><text class="pp-small" x="399" y="${207+i*68}">${3-i} clusters · ${2-i||0} articles</text>`).join('')}`;
  }
  function render(view, signedIn = true) {
    const feature = features[view];
    if (!feature) return '';
    return `<section class="pro-preview" aria-label="${feature.label} Pro preview"><div class="pp-copy"><span class="pp-brand">Clustr Market</span><p class="pp-eyebrow">${feature.label.toUpperCase()} / PRO FEATURE</p><h1>${feature.title}</h1><p class="pp-description">${feature.description}</p><ul>${feature.points.map(point => `<li>${point}</li>`).join('')}</ul><button type="button" class="pp-upgrade" data-account-action="${signedIn?'checkout':'account'}">${signedIn?'Unlock Pro · 99 kr/month':'Sign in to explore Pro'}<span aria-hidden="true"> ↗</span></button><p class="pp-free-note">Free reports exclude today and yesterday (US Eastern time).</p></div><figure class="pp-figure"><figcaption><span class="pp-demo-dot"></span>Demo preview · fictional data</figcaption><svg viewBox="0 0 600 400" role="img" aria-label="Illustrative ${feature.label} interface with fictional example data">${illustration(view)}</svg><p class="pp-caption">${feature.label} workspace · illustration, not market data</p></figure></section>`;
  }
  root.ClustrProPreview = { render };
  if (typeof module === 'object' && module.exports) module.exports = { render };
})(typeof window !== 'undefined' ? window : globalThis);
