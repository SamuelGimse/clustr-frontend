(function(root){
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const percent=value=>value===null||value===undefined?'—':`${(value*100).toFixed(1)} %`;
  const pp=value=>value===null||value===undefined?'—':`${value>0?'+':''}${value.toFixed(2)} pp`;
  const date=value=>value?new Date(value).toLocaleString('nb-NO',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'—';
  const dollars=value=>value===null?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:1}).format(value);
  const odds=value=>value>0?`${(1/value).toFixed(2)}×`:'—';
  function mount(element){
    if(!element||element.dataset.pmMounted)return;
    element.dataset.pmMounted='true';
    const base=String(element.dataset.apiBase??root.ClustrConfig?.POLYMARKET_API_URL??root.ClustrConfig?.PUBLISH_API_URL??'').replace(/\/$/,'');
    let markets=[],selected=null,outcome=null,range='1w',requestId=0;
    element.classList.add('pm-app');
    element.innerHTML=`<header class="pm-header"><div><span class="pm-eyebrow">CLUSTR / POLYMARKET</span><h1>Hva priser markedet inn?</h1><p>Spørsmål, utfallspriser og hvordan forventningene endrer seg.</p></div><button type="button" class="pm-secondary" data-pm-action="reload">Last lagrede data ↻</button></header><div class="pm-info">Polymarket er en kilde i <strong>Fetch News</strong>. Hver innhenting i Clustr lagres som et snapshot. Det kjører ingen egen tidsstyrt innhenting.</div><div class="pm-summary" role="status" data-pm-status>Leser lagrede markeder…</div><div class="pm-layout"><aside class="pm-browser"><div class="pm-filters"><label>Søk i spørsmål<input type="search" data-pm-search placeholder="Rente, valg, olje…"></label><label>Sorter<select data-pm-sort><option value="volume">Størst døgnvolum</option><option value="change">Størst endring siden første snapshot</option></select></label></div><div class="pm-market-list" data-pm-list></div></aside><section class="pm-detail" data-pm-detail aria-live="polite"><div class="pm-empty">Velg et spørsmål for å se utfall og historikk.</div></section></div><p class="pm-footnote">Prosentene er utfallspriser vist som implisitte sannsynligheter. De er markedsvurderinger, ikke bekreftede hendelser. Desimalodds er beregnet som 1 / pris, før gebyrer.</p>`;
    const find=selector=>element.querySelector(selector);
    const status=find('[data-pm-status]'),list=find('[data-pm-list]'),detail=find('[data-pm-detail]');
    async function json(url){const response=await fetch(base+url);const data=await response.json();if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);return data;}
    function filtered(){const query=find('[data-pm-search]').value.toLowerCase().trim();const result=markets.filter(market=>market.question.toLowerCase().includes(query));result.sort((a,b)=>find('[data-pm-sort]').value==='change'?Math.abs(b.change_since_first_pp||0)-Math.abs(a.change_since_first_pp||0):(b.volume_24h||0)-(a.volume_24h||0));return result;}
    function renderList(){
      const rows=filtered();
      list.innerHTML=rows.length?rows.map(market=>{const primary=market.outcomes.find(item=>item.label===market.primary_outcome)||market.outcomes[0];return `<button type="button" class="pm-market ${selected?.id===market.id?'is-selected':''}" data-pm-market="${escape(market.id)}" aria-pressed="${selected?.id===market.id}"><span class="pm-market-title">${escape(market.question)}</span><span class="pm-market-meta"><strong>${escape(primary.label)} <b>${percent(primary.price)}</b></strong><span class="${market.change_since_first_pp<0?'pm-down':'pm-up'}">${pp(market.change_since_first_pp)}</span></span><span class="pm-market-sub">${dollars(market.volume_24h)} volum / 24 t · ${market.snapshot_count} snapshots${market.tracked?'':' · utenfor siste utvalg'}</span><span class="pm-change-label">Endring siden ${date(market.first_seen_at)}</span></button>`;}).join(''):'<div class="pm-empty">Ingen spørsmål funnet.</div>';
    }
    function chart(points){
      if(!points.length)return '<div class="pm-empty">Ingen datapunkter i denne perioden. Velg en lengre periode eller hent nyheter for å bygge snapshot-historikk.</div>';
      const width=800,height=260,left=49,right=15,top=15,bottom=33;
      const times=points.map(point=>Date.parse(point.at)),start=Math.min(...times),end=Math.max(...times);
      const x=time=>left+(end === start ? 0.5 : (time-start)/(end-start))*(width-left-right);
      const low=Math.max(0,Math.min(...points.map(point=>point.price))-.02);
      const high=Math.min(1,Math.max(...points.map(point=>point.price))+.02);
      const y=price=>top+(high-price)/(high-low)*(height-top-bottom);
      const coordinates=points.map((point,i)=>`${x(times[i]).toFixed(2)},${y(point.price).toFixed(2)}`).join(' ');
      const grid=Array.from({length:5},(_,i)=>low+(high-low)*i/4).map(value=>`<line x1="${left}" x2="${width-right}" y1="${y(value)}" y2="${y(value)}"/><text x="${left-9}" y="${y(value)+4}" text-anchor="end">${(value*100).toFixed(high-low<.2?1:0)}%</text>`).join('');
      return `<svg class="pm-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(outcome)}: ${points.length} prisobservasjoner fra ${escape(date(points[0].at))} til ${escape(date(points.at(-1).at))}"><g class="pm-grid">${grid}</g>${points.length>1?`<polyline points="${coordinates}"/>`:''}${points.map((point,i)=>`<circle cx="${x(times[i])}" cy="${y(point.price)}" r="${point.source==='clustr_snapshot'?3.5:2}" class="${point.source==='clustr_snapshot'?'pm-local':'pm-provider'}"><title>${escape(date(point.at))} · ${percent(point.price)} · ${point.source==='clustr_snapshot'?'Clustr-snapshot':'Polymarket-historikk'}</title></circle>`).join('')}<text x="${left}" y="${height-6}">${escape(date(points[0].at))}</text><text x="${width-right}" y="${height-6}" text-anchor="end">${escape(date(points.at(-1).at))}</text></svg>${points.length===1?'<p class="pm-chart-note">Kun ett målepunkt. Det er ennå ikke grunnlag for å vise en utviklingslinje.</p>':''}`;
    }
    function renderDetail(history=null){
      if(!selected)return;
      const point=selected.outcomes.find(item=>item.label===outcome)||selected.outcomes[0];
      detail.innerHTML=`<div class="pm-detail-head"><span class="pm-eyebrow">PREDIKSJONSMARKED · ${escape(selected.id)}</span><h2>${escape(selected.question)}</h2><p>Snapshot lagret ${date(selected.collected_at)}${selected.end_date?' · Sluttdato '+escape(new Date(selected.end_date).toLocaleDateString('nb-NO')):''}</p></div><div class="pm-outcomes">${selected.outcomes.map(item=>`<button type="button" class="pm-outcome ${outcome===item.label?'is-selected':''}" data-pm-outcome="${escape(item.label)}" aria-pressed="${outcome===item.label}"><span>${escape(item.label)}</span><strong>${percent(item.price)}</strong><small>Implisitt odds ${odds(item.price)}</small></button>`).join('')}</div><div class="pm-range-head"><div><h3>Prisutvikling · ${escape(point.label)}</h3><span>${history?`${pp(history.change_pp)} i vist periode · ${history.total_points} datapunkter`:'Henter historikk…'}</span></div><div class="pm-ranges">${[['1d','1 dag'],['1w','1 uke'],['1m','1 måned'],['all','Alt']].map(([value,label])=>`<button type="button" data-pm-range="${value}" class="${value===range?'is-selected':''}" aria-pressed="${value===range}">${label}</button>`).join('')}</div></div><div data-pm-chart>${history?chart(history.points):'<div class="pm-empty">Henter lagrede snapshots og tilgjengelig prishistorikk…</div>'}</div><div class="pm-legend"><span><i class="pm-local-dot"></i>Clustr-snapshots</span><span><i class="pm-provider-dot"></i>Polymarket-prishistorikk</span><span>Skala tilpasset perioden</span></div>${history?.warning?`<p class="pm-warning" role="status">${escape(history.warning)}</p>`:''}<p class="pm-provenance">Våre snapshots har et kjent innsamlingstidspunkt. Eldre prishistorikk fra Polymarket hentes ved visning og merkes med når vi hentet den. Den brukes ikke automatisk som historisk treningsdata.</p><div class="pm-detail-stats"><div><small>Døgnvolum</small><strong>${dollars(selected.volume_24h)}</strong></div><div><small>Likviditet</small><strong>${dollars(selected.liquidity)}</strong></div><div><small>Første snapshot</small><strong>${date(selected.first_seen_at)}</strong></div></div>${selected.description?`<details class="pm-description"><summary>Spørsmålets beskrivelse og betingelser</summary><p>${escape(selected.description)}</p></details>`:''}${history?.points.length?`<details class="pm-observations"><summary>Se datapunkter og kilder (${history.points.length}${history.total_points>history.points.length?' av '+history.total_points+' · grafen er nedskalert':''})</summary><div class="pm-table-wrap"><table><thead><tr><th>Tidspunkt</th><th>Pris</th><th>Kilde</th><th>Hentet av Clustr</th></tr></thead><tbody>${history.points.map(p=>`<tr><td>${date(p.at)}</td><td>${percent(p.price)}</td><td>${p.source==='clustr_snapshot'?'Snapshot':'Polymarket'}</td><td>${date(p.available_at)}</td></tr>`).join('')}</tbody></table></div></details>`:''}${selected.url?`<a class="pm-source-link" href="${escape(selected.url)}" target="_blank" rel="noopener noreferrer">Se originalspørsmålet på Polymarket ↗</a>`:''}`;
    }
    async function loadHistory(){
      const current=++requestId;renderDetail();
      try{const data=await json(`/api/polymarket/markets/${encodeURIComponent(selected.id)}/history?outcome=${encodeURIComponent(outcome)}&range=${range}`);if(current===requestId)renderDetail(data);}
      catch(error){if(current===requestId){renderDetail({points:[],total_points:0,change_pp:null,warning:error.message});}}
    }
    async function load(){
      status.textContent='Leser lagrede markeder…';
      try{
        const data=await json('/api/polymarket/markets?limit=200');markets=data.markets||[];
        status.textContent=markets.length?`${markets.length} lagrede spørsmål · siste innhenting ${date(data.latest_snapshot?.collected_at)}${data.stale?' · eldre enn 24 timer':''}${data.error?' · siste innhenting feilet; viser lagrede data':''}`:'Ingen lagrede Polymarket-data. Kjør Fetch News i Clustr-backenden for å hente første snapshot.';
        const requested=new URLSearchParams(location.search).get('market');
        if(requested&&!markets.some(item=>item.id===requested)){try{const archived=await json('/api/polymarket/markets/'+encodeURIComponent(requested));markets.push(archived.market);}catch{status.textContent+=' · Det lenkede spørsmålet finnes ikke i arkivet.';}}
        selected=markets.find(item=>item.id===(selected?.id||requested))||markets[0]||null;
        renderList();if(selected){outcome=selected.primary_outcome;await loadHistory();}else detail.innerHTML='<div class="pm-empty">Historikken bygges fra første innhenting.</div>';
      }catch(error){status.textContent=`Kunne ikke lese Polymarket-data. Kontroller at Clustr-backenden kjører. ${error.message}`;}
    }
    element.addEventListener('click',event=>{
      const market=event.target.closest('[data-pm-market]');if(market){selected=markets.find(item=>item.id===market.dataset.pmMarket);outcome=selected.primary_outcome;renderList();loadHistory();return;}
      const choice=event.target.closest('[data-pm-outcome]');if(choice){outcome=choice.dataset.pmOutcome;loadHistory();return;}
      const period=event.target.closest('[data-pm-range]');if(period){range=period.dataset.pmRange;loadHistory();return;}
      if(event.target.closest('[data-pm-action="reload"]'))load();
    });
    find('[data-pm-search]').addEventListener('input',renderList);find('[data-pm-sort]').addEventListener('change',renderList);
    load();
  }
  root.ClustrPolymarket={mount};
  document.querySelectorAll('[data-polymarket-auto]').forEach(mount);
})(window);
