(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.ClustrSimple=api;})(typeof window==='undefined'?globalThis:window,function(win){
  let revision=0, active='', identity='', selected='', layout='grid', mobilePane='news', month='', selectedDay='', reportRows=null;
  const nativeViews=new Set(['dashboard','stocks','atlas','connections','map','weekly','watchlist']);
  let groupsRef=null,newsSort='impact',reportScope='',reportSource=null,reportError='';
  try { if(win.localStorage?.getItem('clustr-simple-news-layout')==='desk')layout='desk'; } catch {}
  const esc = value => win.ClustrUtil.escapeHtml(String(value ?? ''));
  const score = group => win.ClustrUtil.articleImpactScore(group.articles || []) ?? win.ClustrUtil.numericStance(group.stance_score ?? group.cluster_score);
  const fmt = value => value == null || !Number.isFinite(Number(value)) ? '—' : `${Number(value) > 0 ? '+' : ''}${Number(Number(value).toFixed(1))}`;
  const tone = value => value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
  const day = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(value));
  const date = value => new Date(value).toLocaleDateString('en', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
  function historyPoints(reports, name, cutoff) {
    const days = new Map();
    for (const report of [...reports].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))) {
      if (report.market !== 'US' || Date.parse(report.created_at) > cutoff) continue;
      const group = (report.groups_json || []).find(group => group.name === name);
      days.set(day(report.created_at), { date: report.created_at, value: group ? score(group) : null });
    }
    return [...days.values()];
  }
  function chart(points, label, compact=false) {
    if (!points.some(point => point.value != null)) return '<p class="simple-empty">No scored history available yet.</p>';
    const width = compact?320:760, height = compact?90:240, left = compact?8:40, right = compact?312:735, top = compact?10:24, bottom = compact?76:200;
    const duration = Date.parse(points.at(-1).date) - Date.parse(points[0].date);
    const x = i => !duration ? (left + right) / 2 : left + (Date.parse(points[i].date) - Date.parse(points[0].date)) * (right - left) / duration;
    const y = value => top + (10 - value) / 20 * (bottom - top);
    let path = '', previous = false;
    points.forEach((point, i) => { if (point.value == null) { previous = false; return; } path += `${previous ? 'L' : 'M'}${x(i).toFixed(1)},${y(point.value).toFixed(1)} `; previous = true; });
    return `<svg class="simple-line" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}: daily news impact from minus ten to plus ten">${(compact?[0]:[-10, 0, 10]).map(v => `<line x1="${left}" x2="${right}" y1="${y(v)}" y2="${y(v)}"/>${compact?'':`<text x="29" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`}`).join('')}<path d="${path}"/>${points.map((point, i) => point.value == null ? '' : `<circle class="simple-${tone(point.value)}" cx="${x(i)}" cy="${y(point.value)}" r="${compact?2.5:4}"><title>${esc(date(point.date))}: ${fmt(point.value)}</title></circle>`).join('')}${compact?'':`<text x="${left}" y="230">${esc(date(points[0].date))}</text><text x="${right}" y="230" text-anchor="end">${esc(date(points.at(-1).date))}</text>`}</svg>`;
  }
  function storyRows(articles) {
    return articles.map(article => { const url = win.ClustrConnections.safeUrl(article.link || article.url); return `<article class="simple-story"><div><span class="simple-eyebrow">${esc(article.source || article.cluster || 'Report story')}</span><h3>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(article.title)} ↗</a>` : esc(article.title)}</h3>${article.short_summary ? `<p>${esc(article.short_summary)}</p>` : ''}</div><span class="simple-story-score simple-${tone(Number(article.rating ?? article.score))}" aria-label="News rating">${fmt(article.rating == null && article.score == null ? null : Number(article.rating ?? article.score))}</span></article>`; }).join('') || '<p class="simple-empty">No stories in this selection.</p>';
  }
  function etDay(value) {
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  function calendarDays(value) {
    const [year,month]=value.split('-').map(Number);
    const offset=(new Date(Date.UTC(year,month-1,1)).getUTCDay()+6)%7;
    return Array.from({length:offset+new Date(Date.UTC(year,month,0)).getUTCDate()},(_,i)=>i<offset?null:`${value}-${String(i-offset+1).padStart(2,'0')}`);
  }
  function reportGroups() { return [...(win.ClustrApp.getGroups() || [])].sort((a,b)=>newsSort==='size'?(b.articles||[]).length-(a.articles||[]).length:newsSort==='positive'?(score(b)||0)-(score(a)||0):newsSort==='negative'?(score(a)||0)-(score(b)||0):Math.abs(score(b)||0)-Math.abs(score(a)||0)); }
  function linkedStocks(group) { return win.ClustrConnections.buildGraph(group?[group]:[],'US').nodes.filter(node=>node.type==='stock'); }
  function stockButtons(group) { return `<div class="simple-company-links">${linkedStocks(group).slice(0,8).map(stock=>`<button type="button" data-simple-company="${esc(stock.label)}">${esc(stock.label)}</button>`).join('')}</div>`; }
  function newsGrid(host) {
    const groups=reportGroups();
    host.querySelector('[data-simple-grid]').innerHTML=groups.map((group,i)=>`<article class="simple-theme-card"><header><button type="button" data-simple-theme="${i}">${esc(group.name)}</button><strong class="simple-${tone(score(group))}" aria-label="Cluster news impact">${fmt(score(group))}</strong></header><p class="simple-clamp">${esc(group.reason||group.summary||'')}</p>${stockButtons(group)}<small>${(group.articles||[]).length} stories</small>${storyRows((group.articles||[]).slice(0,2))}<button type="button" class="simple-open" data-simple-theme="${i}">Read stories & stocks →</button></article>`).join('')||'<p class="simple-empty">No clusters match this report and stock scope.</p>';
  }
  async function newsDesk(host) {
    const groups=reportGroups(), group=groups.find(g=>g.name===selected)||groups[0];
    selected=group?.name||'';
    const desk=host.querySelector('[data-simple-desk]');
    if(!desk)return;
    desk.hidden=layout==='grid'&&!selected;
    if(!group){desk.innerHTML='<p class="simple-empty">No cluster available.</p>';return;}
    const stocks=linkedStocks(group), token=revision;
    desk.dataset.pane=mobilePane;
    desk.innerHTML=`<div class="simple-desk-top"><h2>${esc(group.name)}</h2><button type="button" data-simple-close ${layout==='desk'?'hidden':''}>Close detail</button></div><div class="simple-desk-tabs" role="group" aria-label="Cluster detail section">${['news','cluster','stocks'].map(p=>`<button type="button" data-simple-pane="${p}" aria-pressed="${p===mobilePane}">${p[0].toUpperCase()+p.slice(1)}</button>`).join('')}</div><div class="simple-desk-columns"><section class="simple-desk-news"><h3>News <small>Scroll for stories</small></h3>${storyRows(group.articles||[])}</section><section class="simple-desk-cluster"><h3>The cluster</h3><strong class="simple-desk-score simple-${tone(score(group))}">${fmt(score(group))}</strong><p>${esc(group.reason||group.summary||'No summary supplied.')}</p><div class="simple-desk-meta"><span>Impact window <b>${esc(group.time_horizon||'Not supplied')}</b></span><span>${(group.articles||[]).length} stories</span></div>${stockButtons(group)}<button type="button" data-simple-network>Explore connections →</button></section><section class="simple-desk-stocks"><h3>Stocks <small>Scroll for companies</small></h3>${stocks.map(stock=>`<div class="simple-desk-stock"><button type="button" data-simple-company="${esc(stock.label)}"><b>${esc(stock.label)}</b><small>${esc(stock.name)}</small></button><span data-simple-stock-price="${esc(stock.label)}">Loading quote…</span><small>${esc(stockKinds(group,stock.label))}</small></div>`).join('')||'<p class="simple-empty">No resolved stock links.</p>'}<p class="simple-note">Latest regular-session quotes · may be delayed. Cluster associations do not mean every story names this company.</p></section></div>`;
    const quote=await win.ClustrQuotes?.getLatestQuotes?.(stocks.map(stock=>stock.label),'US')||{};
    if(token!==revision||selected!==group.name||active!=='events')return;
    desk.querySelectorAll('[data-simple-stock-price]').forEach(node=>{const q=quote[node.dataset.simpleStockPrice];node.innerHTML=q?`<b>${money(q.price)}</b><small class="simple-${tone(q.changePercent)}">${percent(q.changePercent)} session</small>`:'<small>Quote unavailable</small>';});
  }
  function money(value){return value==null||!Number.isFinite(Number(value))?'—':esc(new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(value)));}
  function percent(value){return value==null||!Number.isFinite(Number(value))?'—':`${Number(value)>0?'+':''}${Number(value).toFixed(2)}%`;}
  function stockKinds(group,symbol){
    const labels=[];
    for(const [fields,label]of [[['mentioned_stocks'],'Mentioned'],[['close_stocks','direct_stocks'],'Close link'],[['related_stocks','original_stocks'],'Related'],[['fixed_stocks','default_stocks'],'Comparison basket']])if(fields.some(field=>(Array.isArray(group[field])?group[field]:[]).some(s=>String(s?.symbol||s).toUpperCase()===symbol)))labels.push(label);
    return labels.join(' · ')||'Cluster link';
  }
  function drawNews(host) {
    const groups=reportGroups(),choose=host.querySelector('[data-simple-cluster]');
    host.querySelector('[data-simple-sort]').value=newsSort;
    const names=groups.map(group=>group.name);
    if(!names.includes(selected))selected=layout==='desk'?names[0]||'':'';
    if(choose.dataset.names!==JSON.stringify(names)){choose.innerHTML='<option value="">Choose a cluster</option>'+names.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join('');choose.dataset.names=JSON.stringify(names);}
    choose.value=selected;
    host.querySelectorAll('[data-simple-layout]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.simpleLayout===layout)));
    host.querySelector('[data-simple-grid]').hidden=layout==='desk';
    newsGrid(host);
    const desk=host.querySelector('[data-simple-desk]');
    desk.hidden=layout==='grid'&&!selected;
    if(!desk.hidden)newsDesk(host).catch(error=>{if(active==='events')desk.innerHTML=`<p role="alert">${esc(error.message)}</p>`;});
  }
  function drawCalendar(host) {
    if(reportError){host.querySelector('[data-simple-day-reports]').textContent=reportError;return;}
    if(reportRows===null&&win.ClustrWatchlist?.isFiltered?.()){host.querySelector('[data-simple-day-reports]').textContent='Loading reports for your watchlist…';return;}
    const reports=win.ClustrApp.getPublishes(), rows=(reportRows||reports.map((publish,index)=>({publish,index}))).map(row=>({...row.publish,index:row.index,day:etDay(row.publish.created_at)}));
    const months=[...new Set(rows.map(p=>p.day.slice(0,7)))].sort().reverse();
    if(!months.includes(month))month=months[0]||etDay(Date.now()).slice(0,7);
    if(!selectedDay.startsWith(month))selectedDay=rows.find(p=>p.day.startsWith(month))?.day||`${month}-01`;
    const select=host.querySelector('[data-simple-month]');
    if(select.dataset.months!==JSON.stringify(months)){select.innerHTML=months.map(m=>`<option value="${m}">${new Date(m+'-15T12:00:00Z').toLocaleDateString('en',{month:'long',year:'numeric'})}</option>`).join('');select.dataset.months=JSON.stringify(months);}
    select.value=month;
    host.querySelector('[data-simple-calendar]').innerHTML=`<div class="simple-weekdays">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>`<span>${d}</span>`).join('')}</div><div class="simple-calendar-days">${calendarDays(month).map(d=>!d?'<span></span>':`<button type="button" data-simple-day="${d}" aria-pressed="${d===selectedDay}"><b>${Number(d.slice(-2))}</b><small>${rows.filter(row=>row.day===d).length||'—'}</small></button>`).join('')}</div><p class="simple-note">Counts show publishes per US market date.</p>`;
    const daily=rows.filter(p=>p.day===selectedDay);
    host.querySelector('[data-simple-day-reports]').innerHTML=`<h2>${esc(new Date(selectedDay+'T12:00:00Z').toLocaleDateString('en',{dateStyle:'long',timeZone:'America/New_York'}))}</h2><p>${daily.length} ${daily.length===1?'publish':'publishes'}</p>${daily.map(p=>`<button type="button" class="simple-report-row" data-simple-report="${p.index}" aria-current="${p.index===win.ClustrApp.getPublishIndex()?'true':'false'}"><time>${esc(new Date(p.created_at).toLocaleTimeString('en',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit'}))} ET</time><span><b>${esc(p.title||'US market report')}</b><small>${p.index===win.ClustrApp.getPublishIndex()?'Current publish · ':''}${p.__clusterCount==null?'':`${p.__clusterCount} clusters · `}${esc(p.market||'US')}</small></span><span>↗</span></button>`).join('')||'<p class="simple-empty">No publishes on this day.</p>'}`;
  }
  function prepareWorld() {
    const doc=win.document,panel=doc.getElementById('countryPanel'),layout=doc.querySelector('#mapView .globe-layout');
    if(!panel||!layout)return;
    let rail=doc.getElementById('simpleWorldRail');
    if(!rail){rail=doc.createElement('aside');rail.id='simpleWorldRail';rail.className='simple-world-rail';rail.innerHTML='<label>Find a location<input type="search" placeholder="Country name" aria-label="Search countries"></label>';layout.prepend(rail);rail.append(panel);rail.querySelector('input').oninput=event=>{panel.querySelectorAll('.country-card').forEach(card=>card.hidden=!card.textContent.toLowerCase().includes(event.target.value.toLowerCase()));};}
  }
  function restoreWorld(){const rail=win.document.getElementById('simpleWorldRail'),sidebar=win.document.querySelector('#mapView .globe-sidebar');if(rail&&sidebar){const panel=win.document.getElementById('countryPanel');panel.querySelectorAll('.country-card').forEach(card=>card.hidden=false);const heading=sidebar.querySelector('h2');if(heading)heading.after(panel);else sidebar.prepend(panel);rail.remove();}}
  function prepareWeekly(days,clusters) {
    const doc=win.document,root=doc.getElementById('weeklyView'),list=doc.getElementById('weeklyList');if(!root||!list)return;
    let strip=doc.getElementById('simpleWeekStrip');
    if(!strip){strip=doc.createElement('div');strip.id='simpleWeekStrip';strip.className='simple-week-strip';doc.getElementById('weeklyAiSummary').before(strip);}
    strip.innerHTML=`<button type="button" data-week-day="" aria-pressed="true">All week</button>${days.map(day=>`<button type="button" data-week-day="${day.day}" aria-pressed="false"><time>${esc(day.day.slice(5))}</time><b class="simple-${tone(win.ClustrUtil.exponentialMeanRating(day.scores))}">${fmt(win.ClustrUtil.exponentialMeanRating(day.scores))}</b><small>${day.stories.size} stories</small></button>`).join('')}`;
    const byKey=new Map(clusters.map(c=>[c.key,c]));
    list.querySelectorAll('[data-weekly-key]').forEach(card=>{const item=byKey.get(card.dataset.weeklyKey);if(!item)return;card.dataset.simpleDays=JSON.stringify([...item.days]);const ordered=[...item.items].sort((a,b)=>Date.parse(a.publish.created_at)-Date.parse(b.publish.created_at));let mini=card.querySelector('.simple-week-spark');if(!mini){mini=doc.createElement('div');mini.className='simple-week-spark';card.querySelector('.weekly-cluster-main').append(mini);}const first=ordered.length?score(ordered[0].group):null,last=ordered.length?score(ordered.at(-1).group):null,interval=basketInterval(item.items);mini.innerHTML=chart(ordered.map(row=>({date:row.publish.created_at,value:score(row.group)})),item.name,true)+`<p>First → latest impact <b>${fmt(first==null||last==null?null:last-first)}</b></p><p title="${interval?`${esc(date(interval.from))} → ${esc(date(interval.to))} · ${interval.count}/${interval.total} prior basket stocks priced in both reports`:'Requires two priced report snapshots'}">Latest saved basket interval <b class="simple-${tone(interval?.value)}">${percent(interval?.value)}</b></p>`;});
    strip.onclick=event=>{const button=event.target.closest('[data-week-day]');if(!button)return;strip.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));list.querySelectorAll('[data-weekly-key]').forEach(card=>card.hidden=!!button.dataset.weekDay&&!JSON.parse(card.dataset.simpleDays||'[]').includes(button.dataset.weekDay));root.querySelectorAll('.weekly-ai-digest').forEach(brief=>brief.hidden=!!button.dataset.weekDay&&brief.querySelector('time')?.textContent!==button.dataset.weekDay);};
  }
  function basketInterval(items) {
    const rows=[...items].sort((a,b)=>Date.parse(a.publish.created_at)-Date.parse(b.publish.created_at));
    if(rows.length<2)return null;
    const prices=group=>{const result=new Map();for(const stock of group.fixed_stocks||group.default_stocks||[]){const symbol=String(stock?.symbol||'').trim().toUpperCase(),price=Number(stock?.priceAtPublish??stock?.price);if(symbol&&stock.resolved!==false&&Number.isFinite(price)&&price>0&&!result.has(symbol))result.set(symbol,price);}return result;};
    const previous=rows.at(-2),latest=rows.at(-1),start=prices(previous.group),end=prices(latest.group),changes=[];
    start.forEach((price,symbol)=>{if(end.has(symbol))changes.push((end.get(symbol)/price-1)*100);});
    return changes.length?{value:changes.reduce((a,b)=>a+b,0)/changes.length,count:changes.length,total:start.size,from:previous.publish.created_at,to:latest.publish.created_at}:null;
  }
  function render(view) {
    const doc=win.document,host=doc.getElementById('simpleView');
    if(!host||doc.documentElement.dataset.viewMode!=='simple')return;
    if(nativeViews.has(view)){host.hidden=true;if(active!==view){revision++;active=view;identity='';}if(view==='map')prepareWorld();return;}
    if(!['events','days'].includes(view)){hide();return;}
    const app=win.ClustrApp;if(!app)return;
    const publish=app.getPublishes()[app.getPublishIndex()];
    const key=[view,publish?.id,win.ClustrWatchlist?.scopeKey?.()].join('|');
    const changed=active!==view||identity!==key;
    if(changed&&active===view&&doc.activeElement?.tagName==='SELECT'&&host.contains?.(doc.activeElement)){doc.activeElement.addEventListener('blur',()=>render(view),{once:true});return;}
    const ref=app.getAllGroups?.()||app.getGroups(),dataChanged=groupsRef!==ref;groupsRef=ref;
    active=view;host.hidden=false;
    if(changed){identity=key;revision++;selected='';if(view==='days'&&(reportSource!==app.getPublishes()||reportScope!==(win.ClustrWatchlist?.scopeKey?.()||'')))reportRows=null;host.innerHTML=`<div class="simple-shell"><header class="simple-hero"><h1>${view==='events'?'News':'Reports'}</h1><p>${publish?esc(new Date(publish.created_at).toLocaleString('en',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'}))+' ET':''}</p></header>${view==='events'?'<div class="simple-news-toolbar"><div class="simple-layout-switch" role="group" aria-label="News layout"><button type="button" data-simple-layout="grid">Briefing grid</button><button type="button" data-simple-layout="desk">Connection desk</button></div><label>Sort <select data-simple-sort aria-label="Sort news clusters"><option value="impact">Impact</option><option value="positive">Positive</option><option value="negative">Negative</option><option value="size">Size</option></select></label><label>Cluster <select data-simple-cluster aria-label="Choose news cluster"></select></label></div><div class="simple-briefing-grid" data-simple-grid></div><section class="simple-news-desk" data-simple-desk hidden></section>':'<div class="simple-calendar-toolbar"><label>Month <select data-simple-month aria-label="Report month"></select></label></div><div class="simple-report-calendar"><section data-simple-calendar></section><section data-simple-day-reports></section></div>'}</div>`;
      host.onchange=event=>{if(event.target.matches('[data-simple-sort]')){newsSort=event.target.value;revision++;drawNews(host);}if(event.target.matches('[data-simple-cluster]')){selected=event.target.value;revision++;drawNews(host);}if(event.target.matches('[data-simple-month]')){month=event.target.value;selectedDay='';drawCalendar(host);}};
      host.onclick=async event=>{const button=event.target.closest('button');if(!button)return;
        if(button.dataset.simpleLayout){layout=button.dataset.simpleLayout;try{win.localStorage?.setItem('clustr-simple-news-layout',layout);}catch{}drawNews(host);}
        if(button.hasAttribute('data-simple-theme')){selected=reportGroups()[Number(button.dataset.simpleTheme)]?.name||'';revision++;drawNews(host);host.querySelector('[data-simple-desk]')?.scrollIntoView({behavior:'smooth',block:'nearest'});}
        if(button.hasAttribute('data-simple-close')){selected='';drawNews(host);}
        if(button.dataset.simplePane){mobilePane=button.dataset.simplePane;host.querySelector('[data-simple-desk]').dataset.pane=mobilePane;host.querySelectorAll('[data-simple-pane]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));}
        if(button.dataset.simpleDay){selectedDay=button.dataset.simpleDay;drawCalendar(host);}
        if(button.hasAttribute('data-simple-report')){await app.stepPublish(Number(button.dataset.simpleReport)-app.getPublishIndex());app.showView('events');}
        if(button.dataset.simpleCompany){app.showView('stocks');win.ClustrStocks?.selectSymbol?.(button.dataset.simpleCompany);}
        if(button.hasAttribute('data-simple-network'))app.showView('connections',{focusLabel:selected});
      };
    }
    if(view==='events'){if(changed||dataChanged)drawNews(host);}else drawCalendar(host);
  }
  function hide(){revision++;active='';identity='';const host=win.document.getElementById('simpleView');if(host)host.hidden=true;restoreWorld();}
  function setReports(rows){reportError='';reportRows=rows;reportSource=win.ClustrApp?.getPublishes();reportScope=win.ClustrWatchlist?.scopeKey?.()||'';if(active==='days'){const host=win.document.getElementById('simpleView');if(host&&!host.hidden)drawCalendar(host);}}
  function setReportError(message){reportError=message;const host=win.document.getElementById('simpleView');if(active==='days'&&host&&!host.hidden)drawCalendar(host);}
  return {render,hide,prepareWeekly,setReports,setReportError,historyPoints,chart,calendarDays,etDay,basketInterval};
});
