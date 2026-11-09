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
  function dockOptions(doc,media){
    const menu=doc.getElementById('mobileViewOptions'),bar=doc.getElementById('viewModeBar'),sort=doc.getElementById('eventSortOptions');
    if(!menu||!bar)return ()=>{};
    const barHome=doc.createComment('Page view controls'),sortHome=doc.createComment('Page sorting controls');bar.before(barHome);sort?.before(sortHome);
    const modeSlot=menu.querySelector('[data-mobile-mode-slot]'),sortSlot=menu.querySelector('[data-mobile-sort-slot]');
    function close(focus=false){if(!menu.open)return;menu.open=false;if(focus)menu.querySelector('summary').focus();}
    doc.addEventListener('click',event=>{if(!menu.contains(event.target))close();else if(event.target.closest('[data-view-mode],[data-news-view],[data-event-sort]'))close(true);});
    doc.addEventListener('keydown',event=>{if(event.key==='Escape'&&menu.open){event.preventDefault();event.stopPropagation();close(true);}});
    return ()=>{
      if(!media.matches){if(bar.parentElement===modeSlot)barHome.after(bar);if(sort?.parentElement===sortSlot)sortHome.after(sort);if(!menu.hidden)menu.hidden=true;close();return;}
      if(bar.parentElement!==modeSlot)modeSlot.append(bar);
      if(sort&&sort.parentElement!==sortSlot)sortSlot.append(sort);
      const hideSort=doc.documentElement.dataset.activeView!=='events'||doc.documentElement.dataset.viewMode==='simple';
      if(sortSlot.hidden!==hideSort)sortSlot.hidden=hideSort;
      const hideMenu=bar.hidden;if(menu.hidden!==hideMenu)menu.hidden=hideMenu;
      if(menu.hidden)close();
    };
  }
  function mount(doc,win){
    const host=doc.getElementById('main');if(!host)return;
    const media=win.matchMedia('(max-width: 768px)'),syncDock=dockOptions(doc,media);let pending=false;
    const schedule=()=>{if(pending)return;pending=true;win.requestAnimationFrame(()=>{pending=false;compact(host,media.matches);syncDock();});};
    new win.MutationObserver(schedule).observe(host,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
    new win.MutationObserver(schedule).observe(doc.documentElement,{attributes:true,attributeFilter:['data-active-view','data-view-mode']});
    media.addEventListener('change',schedule);schedule();
  }
  return {compact,dockOptions,mount};
});
