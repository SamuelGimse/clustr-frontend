(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ClustrDashboardWorkspace=api;})(typeof globalThis==='undefined'?this:globalThis,function(){
  const KEY='clustr-overview-card-order-v1';
  const finite=value=>typeof value==='number'&&Number.isFinite(value);
  function marketDay(value){
    if(/^\d{4}-\d{2}-\d{2}$/.test(value))return value;
    if(!Number.isFinite(Date.parse(value)))return 'Unavailable';
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  function ordered(ids,saved){
    const allowed=new Set(ids),seen=new Set();
    return [...(Array.isArray(saved)?saved:[]),...ids].filter(id=>typeof id==='string'&&allowed.has(id)&&!seen.has(id)&&seen.add(id));
  }
  function loadOrder(storage,ids){try{return ordered(ids,JSON.parse(storage?.getItem(KEY)||'null'));}catch{return [...ids];}}
  function saveOrder(storage,ids){try{if(!storage)return false;storage.setItem(KEY,JSON.stringify(ids));return true;}catch{return false;}}
  function analysis(summary){
    const articles=summary.articles||[],scored=articles.map(a=>a.rating??a.score).filter(v=>v!=null&&String(v).trim()!==''&&Number.isFinite(Number(v))&&Math.abs(Number(v))<=10).map(Number);
    const ages=[['Under 6h',0],['6–24h',0],['1–3 days',0],['Over 3 days',0],['Unknown / later',0]],end=Date.parse(summary.latest.created_at);
    for(const article of articles){const age=(end-Date.parse(article.published_at||article.date))/3600000;ages[!Number.isFinite(age)||age<0?4:age<6?0:age<24?1:age<72?2:3][1]++;}
    const bands=[['Negative',scored.filter(x=>x<0).length],['Neutral',scored.filter(x=>x===0).length],['Positive',scored.filter(x=>x>0).length],['Unrated',articles.length-scored.length]];
    const sourceTotal=(summary.allSources||summary.sources).reduce((n,row)=>n+row[1],0);
    return {ages,bands,sourceTotal,scored:scored.length,unscoredClusters:summary.themes.filter(t=>!finite(t.score)).length};
  }
  function bars(rows,esc,signed=false,unit=''){
    if(!rows.length)return '<p class="dash-footnote">No data in this report.</p>';
    const max=Math.max(unit==='%'?100:1,...rows.map(r=>Math.abs(r[1])));
    return `<div class="dw-bars">${rows.map(([name,value])=>`<div class="dw-bar-row"><span title="${esc(name)}">${esc(name)}</span><div class="dw-track${signed?' dw-track--signed':''}"><i class="dw-fill${value<0?' dw-fill--down':''}" style="left:${signed?(value<0?50-Math.abs(value)/max*50:50):0}%;width:${Math.abs(value)/max*(signed?50:100)}%"></i></div><b>${signed&&value>0?'+':''}${Number.isInteger(value)?value:value.toFixed(1)}${unit}</b></div>`).join('')}</div>`;
  }
  function line(days,esc,label){
    const width=320,height=100,x=i=>12+i*296/Math.max(1,days.length-1),y=v=>50-v*4;
    let path='',connected=false;
    const points=days.map((day,i)=>{if(!finite(day.score)){connected=false;return '';}path+=`${connected?'L':'M'}${x(i).toFixed(1)},${y(day.score).toFixed(1)} `;connected=true;return `<circle cx="${x(i)}" cy="${y(day.score)}" r="2.5"><title>${esc(marketDay(day.date))}: ${day.score.toFixed(1)}</title></circle>`;}).join('');
    return `<svg class="dw-line" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)} · daily impact, minus ten to plus ten"><line x1="12" x2="308" y1="50" y2="50"/><path d="${path}"/>${points}</svg>`;
  }
  function extraCards(summary,esc){
    const a=analysis(summary),cards=[],card=(id,title,content,note,wide=false)=>cards.push({id,title,wide,html:`<p class="dash-kicker">REPORT ANALYTICS</p><h2>${esc(title)}</h2>${content}<p class="dash-footnote">${esc(note)}</p>`});
    card('report-totals','Report at a glance',`<div class="dw-totals">${[['Clusters',summary.themes.length],['Distinct stories',summary.stories],['Sources',summary.sourceCount],['Linked stocks',summary.stocks.length],['Rated stories',summary.rated],['Reports in history',summary.reports]].map(([label,value])=>`<div><strong>${value}</strong><span>${label}</span></div>`).join('')}</div>`,'Latest selected report. The history count includes all approved reports up to this selection.');
    card('cluster-minis','Every cluster at a glance',`<div class="dw-minis">${summary.clusterTrends.map(series=>`<div><h3>${esc(series.name)}</h3>${line(series.days,esc,series.name)}<small>${series.days.filter(d=>finite(d.score)).length} scored report days · latest ${finite(series.days.at(-1)?.score)?series.days.at(-1).score.toFixed(1):'unavailable'}</small></div>`).join('')}</div>`,'One chart per cluster over the last 14 report days. Gaps stay missing; impacts are not price returns.',true);
    card('all-cluster-impact','All cluster impacts',bars(summary.themes.filter(t=>finite(t.score)).sort((x,y)=>y.score-x.score).map(t=>[t.name,t.score]),esc,true),'Latest report, signed impact index from −10 to +10.');
    card('cluster-coverage','Stories by cluster',bars([...summary.themes].sort((x,y)=>y.articles-x.articles).map(t=>[t.name,t.articles]),esc),'A story can belong to multiple clusters; these counts are not additive.');
    card('cluster-sources','Source breadth by cluster',bars([...summary.themes].sort((x,y)=>y.sources-x.sources).map(t=>[t.name,t.sources]),esc),'Distinct source labels per cluster. More sources do not imply greater reliability.');
    card('source-shares','Source share of coverage',bars((summary.allSources||summary.sources).map(([name,n])=>[name,a.sourceTotal?n/a.sourceTotal*100:0]),esc,false,'%'),'Share of distinct source-labelled stories. All named sources; unlabelled stories excluded.');
    card('article-direction','Article impact balance',bars(a.bands,esc),'Valid article ratings only; unrated stories are shown separately.');
    card('story-recency','Story age at report time',bars(a.ages,esc),'Relative to the selected report timestamp, not the current clock. Unknown dates and later timestamps are separate.');
    card('stock-degree','Stock connection breadth',bars([...summary.stocks].sort((x,y)=>y.clusters-x.clusters).map(s=>[s.symbol,s.clusters]),esc),'All stocks by linked cluster count. A link is report context, not a recommendation.');
    card('stock-impacts','Stock-linked news impact',bars(summary.stocks.filter(s=>finite(s.score)).map(s=>[s.symbol,s.score]),esc,true),'All stocks by absolute linked impact. These scores are news impact, not price changes.');
    card('cluster-changes','Every comparable cluster shift',bars(summary.themes.filter(t=>finite(t.delta)).sort((x,y)=>Math.abs(y.delta)-Math.abs(x.delta)).map(t=>[t.name,t.delta]),esc,true),'Difference from each cluster’s prior appearance; comparison dates can differ.');
    card('daily-breadth','Positive share by report day',bars(summary.days.map(d=>[marketDay(d.date),d.positive+d.negative?100*d.positive/(d.positive+d.negative):0]),esc,false,'%'),'Positive / (positive + negative) clusters. Zero denotes no positive clusters; a day with no directional scores also shows zero.');
    card('completeness','Report completeness',bars([['Rated stories',summary.rated],['Unrated stories',summary.stories-summary.rated],['Named sources',summary.sourceCount],['Unscored clusters',a.unscoredClusters]],esc),'Availability counts, not quality scores. Missing ratings are never replaced by zero.');
    const days=summary.days;
    card('cluster-heatmap','Cluster history matrix',`<div class="dw-heatmap" style="--days:${days.length}"><div class="dw-heat-head"><span>Cluster / report day</span>${days.map(d=>`<small>${esc(marketDay(d.date).slice(5))}</small>`).join('')}</div>${summary.clusterTrends.map(series=>`<div class="dw-heat-row"><strong>${esc(series.name)}</strong>${series.days.map(d=>`<span class="${!finite(d.score)?'dw-cell--missing':d.score>0?'dw-cell--up':d.score<0?'dw-cell--down':'dw-cell--zero'}" style="--strength:${finite(d.score)?20+Math.abs(d.score)*8:0}%" title="${esc(series.name)} · ${esc(marketDay(d.date))}: ${finite(d.score)?d.score.toFixed(1):'unavailable'}">${finite(d.score)?d.score.toFixed(1):'—'}</span>`).join('')}</div>`).join('')}</div>`,'Green: positive impact. Red: negative impact. Dashes: missing. Each column is a latest daily report, not a stock return.',true);
    const dots=summary.themes.filter(t=>finite(t.score)),maxStories=Math.max(1,...dots.map(t=>t.articles));
    card('coverage-impact','Coverage versus impact',`<svg class="dw-scatter" viewBox="0 0 340 210" role="img" aria-label="Cluster story count versus signed news impact; larger dots indicate more sources"><line x1="28" x2="320" y1="90" y2="90"/><line x1="28" x2="28" y1="15" y2="170"/>${[-10,0,10].map(v=>`<text x="1" y="${94-v*7.5}">${v}</text>`).join('')}${dots.map(t=>`<circle class="${t.score<0?'dw-scatter-down':''}" cx="${28+t.articles/maxStories*285}" cy="${90-t.score*7.5}" r="${3+Math.sqrt(t.sources)*2}"><title>${esc(t.name)}: ${t.articles} stories, impact ${t.score.toFixed(1)}, ${t.sources} sources</title></circle>`).join('')}<text x="28" y="187">0 stories</text><text x="320" y="187" text-anchor="end">${maxStories} stories</text><text x="174" y="206" text-anchor="middle">Coverage →</text></svg>`,'One dot per scored cluster. Horizontal: story count. Vertical: signed impact. Dot size: source breadth. Coverage is not evidence of causation.');
    if(summary.watchlist?.total){const stocks=summary.watchlist.stocks;
      const priceMini=stock=>{const points=stock.priceHistory||[],values=points.filter(d=>finite(d.price)&&d.price>0);if(values.length<2)return '<p class="dash-footnote">More saved prices needed.</p>';const low=Math.min(...values.map(d=>d.price)),high=Math.max(...values.map(d=>d.price));let path='',joined=false;points.forEach((d,i)=>{if(!finite(d.price)||d.price<=0){joined=false;return;}path+=`${joined?'L':'M'}${(12+i*296/Math.max(1,points.length-1)).toFixed(1)},${(high===low?50:90-(d.price-low)/(high-low)*78).toFixed(1)} `;joined=true;});return `<svg class="dw-line" viewBox="0 0 320 100" role="img" aria-label="${esc(stock.node.label)} saved USD prices, range ${low.toFixed(2)} to ${high.toFixed(2)}"><path d="${path}"/></svg><small>USD ${low.toFixed(2)}–${high.toFixed(2)}</small>`;};
      card('watch-price-minis','Your stocks · saved price history',`<div class="dw-minis">${stocks.map(stock=>`<div><h3>${esc(stock.node.label)}</h3>${priceMini(stock)}</div>`).join('')}</div>`,'Up to 14 saved reports per ticker. Each chart has its own USD range. Prices are not split or dividend adjusted; gaps are missing snapshots.',true);
card('watch-exposure','Your watchlist connections',bars(stocks.map(s=>[s.node.label,s.clusters.length]),esc),'Linked clusters in the selected 24-hour report window.');card('watch-price','Watchlist saved price changes',bars(stocks.filter(s=>finite(s.priceChange)).map(s=>[s.node.label,s.priceChange]),esc,true,'%'),'Saved report price versus prior saved appearance; not live session changes. Missing comparisons are omitted.');}
    return cards;
  }
  function mount(root,summary){
    if(typeof document==='undefined'||document.documentElement.dataset.viewMode!=='advanced'||!root.querySelectorAll)return;
    const shell=root.querySelector('.dash-shell');if(!shell)return;
    const esc=window.ClustrUtil.escapeHtml,panels=[...root.querySelectorAll('.dash-panel')],cards=[];
    for(const panel of panels){const title=panel.querySelector('h2')?.textContent||'Watchlist';const known=['dash-overall-trend','dash-trend-panel','dash-simple-balance','dash-strongest','dash-stock-links','dash-shift-panel','dash-network-panel','dash-watch-empty'].find(c=>panel.classList.contains(c));let id=known||title.toLowerCase().replace(/[^a-z0-9]+/g,'-');if(title.startsWith('What happened'))id='watch-news';let unique=id,n=2;while(cards.some(c=>c.id===unique))unique=id+'-'+n++;cards.push({id:unique,title,panel,wide:panel.classList.contains('dash-trend-panel'),two:id==='watch-news'||panel.classList.contains('dash-overall-trend')});}
    for(const node of [...shell.children])if(!node.classList.contains('dash-header'))node.remove();
    const toolbar=document.createElement('div');toolbar.className='dw-toolbar';toolbar.innerHTML='<div><strong>Your advanced workspace</strong><p>Drag a card handle to rearrange. Focus a handle and use arrow keys, or use its move buttons.</p></div><button type="button" data-dw-reset>Reset layout</button><span role="status" aria-live="polite" data-dw-status>Layout saved on this browser</span>';shell.append(toolbar);
    const board=document.createElement('div');board.className='dw-board';shell.append(board);
    const extras=extraCards(summary,esc),totals=extras.find(c=>c.id==='report-totals');
    const personal=cards.filter(c=>['watch-news','dash-network-panel','dash-watch-empty'].includes(c.id));
    const all=[...personal,totals,...cards.filter(c=>!personal.includes(c)),...extras.filter(c=>c!==totals)];
    for(const card of all){const panel=card.panel||document.createElement('section');panel.classList.add('dash-panel','dw-card');if(card.wide)panel.classList.add('dw-wide');if(card.two)panel.classList.add('dw-two');panel.dataset.cardId=card.id;if(!card.panel)panel.innerHTML=card.html;
      const tools=document.createElement('div');tools.className='dw-card-tools';tools.innerHTML=`<button type="button" class="dw-handle" aria-label="Move ${esc(card.title)}" title="Drag to move, or use arrow keys">⠿ <span>Move</span></button><button type="button" data-dw-move="-1" aria-label="Move ${esc(card.title)} earlier">←</button><button type="button" data-dw-move="1" aria-label="Move ${esc(card.title)} later">→</button>`;panel.prepend(tools);board.append(panel);}
    const ids=all.map(c=>c.id),byId=new Map([...board.children].map(card=>[card.dataset.cardId,card]));let storage;try{storage=window.localStorage;}catch{}
    for(const id of loadOrder(storage,ids))board.append(byId.get(id));
    const status=toolbar.querySelector('[data-dw-status]');function save(){status.textContent=saveOrder(storage,[...board.children].map(c=>c.dataset.cardId))?'Layout saved on this browser':'Layout changed; browser storage is unavailable.';}
    function move(card,delta){const neighbor=delta<0?card.previousElementSibling:card.nextElementSibling;if(!neighbor)return;board.insertBefore(card,delta<0?neighbor:neighbor.nextElementSibling);save();}
    toolbar.querySelector('[data-dw-reset]').onclick=()=>{for(const id of ids)board.append(byId.get(id));save();};
    board.addEventListener('click',event=>{const button=event.target.closest('[data-dw-move]');if(button){event.stopPropagation();move(button.closest('[data-card-id]'),Number(button.dataset.dwMove));}});
    let drag=null;
    board.addEventListener('pointerdown',event=>{const handle=event.target.closest('.dw-handle');if(!handle||event.button!==0)return;const card=handle.closest('[data-card-id]');drag={card,handle,x:event.clientX,y:event.clientY,moved:false};handle.setPointerCapture(event.pointerId);});
    board.addEventListener('pointermove',event=>{if(!drag)return;if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<7&&!drag.moved)return;event.preventDefault();if(event.clientY<65)window.scrollBy(0,-18);else if(event.clientY>window.innerHeight-65)window.scrollBy(0,18);drag.moved=true;drag.card.classList.add('dw-dragging');const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-card-id]');if(!target||target===drag.card||target.parentElement!==board)return;const rect=target.getBoundingClientRect();board.insertBefore(drag.card,event.clientY<rect.top+rect.height/2?target:target.nextElementSibling);});
    function finish(){if(!drag)return;drag.card.classList.remove('dw-dragging');if(drag.moved)save();drag=null;}
    board.addEventListener('pointerup',finish);board.addEventListener('pointercancel',finish);
    board.addEventListener('keydown',event=>{const handle=event.target.closest('.dw-handle');if(!handle||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();move(handle.closest('[data-card-id]'),['ArrowUp','ArrowLeft'].includes(event.key)?-1:1);handle.focus();});
  }
  return {KEY,marketDay,ordered,loadOrder,saveOrder,analysis,extraCards,mount};
});
