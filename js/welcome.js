/** Public, illustrative demo only. Never reads reports, prices or account data. */
(function () {
  const examples = {
    ai: { name:'AI infrastructure', headline:'A cloud operator announces a larger data-center build.', context:'A hypothetical expansion raises questions about demand for chips, cooling and electricity.', summary:'Related stories about computing capacity, semiconductors and power demand share one research theme.', score:'+3', window:'Weeks', links:[['Cloud operator','Named in the example'],['Chip supplier','Potential close link'],['Power equipment','Related business']] },
    energy: { name:'Energy supply', headline:'An unexpected outage interrupts a major fuel supply route.', context:'In this hypothetical event, higher input costs could pressure fuel-dependent businesses. Other companies could benefit.', summary:'Supply disruptions, transport constraints and energy costs become part of one theme—with different effects on different businesses.', score:'−4', window:'Days', links:[['Fuel importer','Named in the example'],['Transport operator','Potential cost exposure'],['Alternative producer','Possible offsetting benefit']] },
    cyber: { name:'Cybersecurity', headline:'A business announces new security spending after an incident.', context:'A hypothetical response could support security demand while adding costs for the affected company.', summary:'Incidents, security budgets and protective software connect under one theme. A positive theme does not make every related stock a winner.', score:'+2', window:'Months', links:[['Affected business','Named in the example'],['Security provider','Potential close link'],['IT services','Related business']] }
  };
  const buttons=[...document.querySelectorAll('[data-demo]')], panel=document.getElementById('clusterDemo');
  if (!panel) return;
  function select(button) {
    const item=examples[button.dataset.demo];
    if (!item) return;
    buttons.forEach(tab=>{const active=tab===button;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;});
    panel.setAttribute('aria-labelledby',button.id);
    for (const key of ['name','headline','context','summary','window']) panel.querySelector(`[data-demo-${key}]`).textContent=item[key];
    const score=panel.querySelector('[data-demo-score]');
    score.textContent=item.score; score.dataset.tone=item.score.startsWith('−')?'negative':'positive';
    const links=panel.querySelector('[data-demo-links]');
    links.replaceChildren(...item.links.map(([name,label])=>{
      const row=document.createElement('li'),title=document.createElement('strong'),note=document.createElement('span');
      title.textContent=name;note.textContent=label;row.append(title,note);return row;
    }));
  }
  buttons.forEach((button,index)=>{
    button.addEventListener('click',()=>select(button));
    button.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
      select(buttons[next]);buttons[next].focus();
    });
  });
})();
