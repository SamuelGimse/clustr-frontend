const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('welcome.html','utf8');
const source=fs.readFileSync('js/welcome.js','utf8');

test('Public welcome explains the app with clearly labelled fictional examples and working local destinations',()=>{
  for(const section of ['preview','visuals','how','features','plans','faq']) assert(html.includes(`id="${section}"`));
  assert.equal((html.match(/<figure class="welcome-visual-card/g)||[]).length,3);
  for (const title of ['networkPreviewTitle','stancePreviewTitle','pricePreviewTitle']) assert(html.includes(`id="${title}"`));
  assert.match(html,/Zero is centered between minus ten and plus ten/);
  assert.match(html,/Zero is centered between minus four and plus four percent/);
  assert.match(html,/What is a cluster\?/i);
  assert.match(html,/Illustrative demo · not current news/);
  assert.match(html,/not stock picks/);
  assert.match(html,/AI score is not a price forecast/);
  assert.match(html,/99 kr/);
  assert.match(html,/href="\.\/#\/signup"/);
  assert.match(html,/href="\.\/#\/login"/);
  assert.match(html,/<noscript>/);
  assert.doesNotMatch(source,/fetch\(|ClustrApi|ClustrAuth|localStorage|innerHTML/);
  assert.doesNotMatch(html,/<script[^>]+src="(?:https?:|js\/(?:auth|api|app|quotes)\.js)/);
  for(const path of [...html.matchAll(/(?:src|href)="([^"#?]+)(?:\?[^"#]*)?(?:#[^"]*)?"/g)].map(m=>m[1])) {
    if(path==='./'||path.startsWith('https:'))continue;
    assert(fs.existsSync(path),`Missing local asset: ${path}`);
  }
});

test('Demo switches all fields without network access and supports the tab keyboard pattern',()=>{
  const buttons=['ai','energy','cyber'].map((key,i)=>({id:`demo-${key}`,dataset:{demo:key},listeners:{},tabIndex:i? -1:0,attrs:{},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,fn){this.listeners[k]=fn;},focus(){this.focused=true;}}));
  const fields=Object.fromEntries(['name','headline','context','summary','window','score','links'].map(key=>[`[data-demo-${key}]`,{textContent:'',dataset:{},replaceChildren(...rows){this.rows=rows;}}]));
  const panel={attrs:{},setAttribute(k,v){this.attrs[k]=v;},querySelector:s=>fields[s]};
  const document={querySelectorAll:()=>buttons,getElementById:()=>panel,createElement:tag=>({tag,textContent:'',children:[],append(...nodes){this.children.push(...nodes);}})};
  vm.runInNewContext(source,{document});
  buttons[1].listeners.click();
  assert.equal(fields['[data-demo-name]'].textContent,'Energy supply');
  assert.equal(fields['[data-demo-score]'].textContent,'−4');
  assert.equal(fields['[data-demo-score]'].dataset.tone,'negative');
  assert.equal(fields['[data-demo-window]'].textContent,'Days');
  assert.equal(fields['[data-demo-links]'].rows.length,3);
  assert.equal(buttons[1].attrs['aria-selected'],'true');
  assert.equal(buttons[0].tabIndex,-1);
  let prevented=false;
  buttons[1].listeners.keydown({key:'End',preventDefault(){prevented=true;}});
  assert(prevented);assert(buttons[2].focused);
  assert.equal(panel.attrs['aria-labelledby'],'demo-cyber');
  assert.equal(fields['[data-demo-window]'].textContent,'Months');
  buttons[2].listeners.keydown({key:'ArrowRight',preventDefault(){}});
  assert.equal(fields['[data-demo-name]'].textContent,'AI infrastructure');
  assert.equal(fields['[data-demo-score]'].dataset.tone,'positive');
});

test('Switching sign-in and sign-up keeps the reload destination consistent',()=>{
  const app=fs.readFileSync('js/app.js','utf8');
  const toggle=app.match(/if \(action === 'switch'\) \{([^}]+)\}/)[1];
  let url='',renders=0;
  const c={accountMode:'signup',history:{replaceState:(_,__,value)=>{url=value;}},renderAccount:()=>renders++};
  vm.createContext(c);vm.runInContext(toggle,c);
  assert.equal(c.accountMode,'signin');assert.equal(url,'#/login');
  vm.runInContext(toggle,c);
  assert.equal(c.accountMode,'signup');assert.equal(url,'#/signup');assert.equal(renders,2);
});
