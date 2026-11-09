const test=require('node:test');
const assert=require('node:assert/strict');
const {compact}=require('../js/mobile-ui.js');

test('Mobile disclosures keep control identity and state, avoid nesting, and restore desktop content',()=>{
  const doc={createElement:tag=>new Element(tag)};
  class Element {
    constructor(tag,text=''){this.tag=tag;this.textContent=text;this.children=[];this.dataset={};this.ownerDocument=doc;this.open=false;}
    append(...nodes){for(const node of nodes){if(node.parent)node.parent.children.splice(node.parent.children.indexOf(node),1);this.children.push(node);node.parent=this;}}
    before(node){const at=this.parent.children.indexOf(this);this.parent.children.splice(at,0,node);node.parent=this.parent;}
    replaceWith(node){const parent=this.parent,at=parent.children.indexOf(this);if(node.parent)node.parent.children.splice(node.parent.children.indexOf(node),1);parent.children.splice(at,1,node);node.parent=parent;}
    closest(){for(let n=this;n;n=n.parent)if(n.tag==='details')return n;return null;}
    querySelector(){return this.children.find(n=>['h2','h3'].includes(n.tag));}
    get lastElementChild(){return this.children.at(-1);}
  }
  const host=new Element('main'),panel=new Element('section','Appearance settings'),heading=new Element('h2','Appearance'),input=new Element('select'),note=new Element('p','A long explanation of the chart methodology and the uncertainty behind these observations, rather than an operational status or an error.');
  input.value='dark';let changes=0;input.change=()=>changes++;
  panel.append(heading,input);host.append(panel,note);
  host.querySelectorAll=selector=>{
    if(selector==='[data-mobile-fold]')return host.children.filter(n=>n.dataset.mobileFold);
    if(selector==='.account-appearance')return [panel];
    if(selector.startsWith('.dash-footnote'))return [note];
    return [];
  };
  compact(host,true);
  assert.equal(host.children.length,2);
  assert.equal(host.children[0].tag,'details');
  assert.equal(host.children[0].children[0].textContent,'Appearance');
  assert.equal(host.children[0].open,false);
  assert.equal(host.children[0].lastElementChild,panel);
  assert.equal(panel.children[1],input);
  input.change();assert.equal(changes,1);assert.equal(input.value,'dark');
  compact(host,true);assert.equal(host.children[0].lastElementChild,panel);
  compact(host,false);assert.deepEqual(host.children,[panel,note]);assert.equal(input.value,'dark');
});
