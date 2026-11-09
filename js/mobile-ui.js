/* Mobile disclosures preserve the original controls and restore desktop layout. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else api.mount(root.document,root);
})(typeof window!=='undefined'?window:globalThis,function(){
  const panels=[['.account-appearance','Appearance'],['.admin-preview-controls','Account preview'],['.admin-monitor-panel',''],['.watchlist-panel:has([data-watch-recent])','Browse report stocks'],['#weeklyAiSummary','Market briefs']];
  const notes=[['.dash-footnote, .dash-trend-readout > p:not(.dash-kicker)','Data details'],['.stocks-filter-note','Link details'],['.atlas-detail-panel > .atlas-note','Data details'],['.globe-source','Map source'],['.cx-scope','Report window'],['.cx-inspector-body > .cx-note','Data details']];
  function fold(node,label,panel){
    if(node.closest('details')||!node.textContent.trim())return;
    const doc=node.ownerDocument,details=doc.createElement('details'),summary=doc.createElement('summary');
    details.dataset.mobileFold=panel?'panel':'note';
    details.className=panel?'mobile-panel-fold':'mobile-note-fold';
    summary.textContent=label||node.querySelector('h2,h3')?.textContent||'Details';
    node.before(details);details.append(summary,node);
  }
  function compact(host,enabled){
    if(!enabled){host.querySelectorAll('[data-mobile-fold]').forEach(details=>details.replaceWith(details.lastElementChild));return;}
    for(const [selector,label]of panels)host.querySelectorAll(selector).forEach(node=>fold(node,label,true));
    for(const [selector,label]of notes)host.querySelectorAll(selector).forEach(node=>{if(node.textContent.trim().length>85)fold(node,label,false);});
  }
  function mount(doc,win){
    const host=doc.getElementById('main');if(!host)return;
    const media=win.matchMedia('(max-width: 768px)');let pending=false;
    const schedule=()=>{if(pending)return;pending=true;win.requestAnimationFrame(()=>{pending=false;compact(host,media.matches);});};
    new win.MutationObserver(schedule).observe(host,{childList:true,subtree:true});
    media.addEventListener('change',schedule);schedule();
  }
  return {compact,mount};
});
