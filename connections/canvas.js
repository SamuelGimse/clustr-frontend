(function(root){
  function palette(light){return light
    ? {cluster:[8/255,92/255,71/255],stock:[102/255,46/255,158/255],news:[64/255,82/255,102/255],edge:[25/255,87/255,76/255]}
    : {cluster:[.50,.87,.77],stock:[.80,.64,.91],news:[.66,.74,.79],edge:[.50,.87,.77]};}
  function paletteStyle() {
    const light=palette(true),dark=palette(false);
    const rgb=value=>`rgb(${value.map(channel=>Math.round(channel*255)).join(' ')})`;
    return Object.keys(dark).map(type=>`--cx-${type}:light-dark(${rgb(light[type])},${rgb(dark[type])})`).join(';');
  }
  function simulation(graph, initial) {
    const ids=new Map(graph.nodes.map((n,i)=>[n.id,i]));
    const positions=new Float32Array(graph.nodes.length*2),velocities=new Float32Array(positions.length);
    graph.nodes.forEach((n,i)=>{const p=initial.get(n.id);positions[i*2]=p.x;positions[i*2+1]=p.y;});
    const anchors=positions.slice(),links=graph.edges.map(e=>[ids.get(e.from),ids.get(e.to)]);
    function step(){
      for(let i=0;i<graph.nodes.length;i++)for(let j=i+1;j<graph.nodes.length;j++){
        let dx=positions[i*2]-positions[j*2],dy=positions[i*2+1]-positions[j*2+1];
        if(Math.abs(dx)+Math.abs(dy)<.01){dx=.1*(i+1);dy=.1;}
        const d=Math.max(100,dx*dx+dy*dy),f=Math.min(.02,8/d);
        velocities[i*2]+=dx*f;velocities[i*2+1]+=dy*f;velocities[j*2]-=dx*f;velocities[j*2+1]-=dy*f;
      }
      for(const[a,b]of links){const dx=positions[b*2]-positions[a*2],dy=positions[b*2+1]-positions[a*2+1],distance=Math.max(1,Math.hypot(dx,dy)),f=(distance-125)*.0007;velocities[a*2]+=dx/distance*f;velocities[a*2+1]+=dy/distance*f;velocities[b*2]-=dx/distance*f;velocities[b*2+1]-=dy/distance*f;}
      for(let i=0;i<positions.length;i++){velocities[i]=(velocities[i]+(anchors[i]-positions[i])*.0008)*.82;positions[i]+=velocities[i];}
    }
    function move(index,x,y){
      if(!Number.isInteger(index)||index<0||index>=graph.nodes.length||!Number.isFinite(x)||!Number.isFinite(y))return;
      for(const [axis,value] of [[index*2,x],[index*2+1,y]]){positions[axis]=anchors[axis]=value;velocities[axis]=0;}
    }
    return{positions,step,move};
  }
  function motionPositions(positions, seconds, output=new Float32Array(positions.length)) {
    for(let i=0;i<positions.length;i+=2){
      const phase=i*2.399963;
      output[i]=positions[i]+Math.sin(seconds*.48+phase)*18;
      output[i+1]=positions[i+1]+Math.cos(seconds*.38+phase)*14;
    }
    return output;
  }
  function pointerMotion(positions, offsets, pointer, scale, delta=1/60) {
    const easing=1-Math.exp(-8*Math.min(delta,.05)),radius=160/scale;
    for(let i=0;i<positions.length;i+=2){
      let x=0,y=0;
      if(pointer){
        const dx=positions[i]-pointer.x,dy=positions[i+1]-pointer.y,distance=Math.hypot(dx,dy);
        if(distance>0&&distance<radius){const force=(1-distance/radius)**2*32/scale;x=dx/distance*force;y=dy/distance*force;}
      }
      offsets[i]+=(x-offsets[i])*easing;offsets[i+1]+=(y-offsets[i+1])*easing;
      positions[i]+=offsets[i];positions[i+1]+=offsets[i+1];
    }
  }
  async function gpuRenderer(canvas){
    if(!navigator.gpu)return null;
    const adapter=await navigator.gpu.requestAdapter();if(!adapter)return null;
    const device=await adapter.requestDevice();
    try {
    const context=canvas.getContext('webgpu');if(!context){device.destroy();return null;}
    device.pushErrorScope('validation');
    const format=navigator.gpu.getPreferredCanvasFormat();context.configure({device,format,alphaMode:'premultiplied'});
    const shader=device.createShaderModule({code:`
struct Out { @builtin(position) p:vec4f, @location(0) uv:vec2f, @location(1) color:vec4f }
@vertex fn node(@builtin(vertex_index) v:u32,@location(0) center:vec2f,@location(1) radius:vec2f,@location(2) color:vec4f)->Out {
var corners=array<vec2f,6>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),vec2f(-1,1),vec2f(1,-1),vec2f(1,1));
var o:Out;o.uv=corners[v];o.p=vec4f(center+corners[v]*radius,0,1);o.color=color;return o; }
@fragment fn dot(i:Out)->@location(0) vec4f { if(length(i.uv)>1){discard;}return vec4f(i.color.rgb*i.color.a,i.color.a); }
@vertex fn line(@location(0) p:vec2f,@location(1) color:vec4f)->Out {var o:Out;o.p=vec4f(p,0,1);o.uv=vec2f(0);o.color=color;return o;}
@fragment fn stroke(i:Out)->@location(0) vec4f {return vec4f(i.color.rgb*i.color.a,i.color.a);}`});
    const blend={color:{srcFactor:'one',dstFactor:'one-minus-src-alpha'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha'}};
    const nodePipeline=device.createRenderPipeline({layout:'auto',vertex:{module:shader,entryPoint:'node',buffers:[{arrayStride:32,stepMode:'instance',attributes:[{shaderLocation:0,offset:0,format:'float32x2'},{shaderLocation:1,offset:8,format:'float32x2'},{shaderLocation:2,offset:16,format:'float32x4'}]}]},fragment:{module:shader,entryPoint:'dot',targets:[{format,blend}]},primitive:{topology:'triangle-list'}});
    const linePipeline=device.createRenderPipeline({layout:'auto',vertex:{module:shader,entryPoint:'line',buffers:[{arrayStride:24,attributes:[{shaderLocation:0,offset:0,format:'float32x2'},{shaderLocation:1,offset:8,format:'float32x4'}]}]},fragment:{module:shader,entryPoint:'stroke',targets:[{format,blend}]},primitive:{topology:'line-list'}});
    const error=await device.popErrorScope();if(error)throw error;
    let buffers=[];
    return{lost:device.lost,draw(nodes,lines){for(const b of buffers)b.destroy();buffers=[];const encoder=device.createCommandEncoder(),pass=encoder.beginRenderPass({colorAttachments:[{view:context.getCurrentTexture().createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:'clear',storeOp:'store'}]});
      for(const[data,pipeline,count,instance]of[[lines,linePipeline,lines.length/6,false],[nodes,nodePipeline,nodes.length/8,true]]){if(!count)continue;const buffer=device.createBuffer({size:data.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});buffers.push(buffer);device.queue.writeBuffer(buffer,0,data);pass.setPipeline(pipeline);pass.setVertexBuffer(0,buffer);pass.draw(instance?6:count,instance?count:1);}
      pass.end();device.queue.submit([encoder.finish()]);},destroy(){buffers.forEach(b=>b.destroy());context.unconfigure();device.destroy();}};
    } catch(error){device.destroy();throw error;}
  }
  function mount(container,graph,initial,onSelect){
    container.innerHTML='<canvas class="cx-pixels" aria-hidden="true"></canvas><canvas class="cx-labels" tabindex="0" aria-label="Interactive market graph. Drag a node to move it, drag empty space to pan, scroll or use plus and minus to zoom. Use search or the cluster list for keyboard selection."></canvas><span class="cx-backend">Canvas</span>';
    let pixels=container.querySelector('.cx-pixels');const labels=container.querySelector('.cx-labels'),ctx=labels.getContext('2d');
    const state=simulation(graph,initial),ids=new Map(graph.nodes.map((n,i)=>[n.id,i]));
    let renderer=null,closed=false,frame=0,iteration=0,selected=null,query='',type='',scale=1,offsetX=0,offsetY=0,width=1,height=1,drag=null,hover=null,pinch=0;
    const pointers=new Map(),displayPositions=state.positions.slice(),pointerOffsets=new Float32Array(state.positions.length);
    const motionPreference=window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduced=motionPreference.matches,visible=true,lastTime=0,motionTime=0,pointer=null;
    function camera(){return Math.min(width/1200,height/800)*scale;}
    function point(i){const s=camera();return{x:(displayPositions[i*2]-600)*s+width/2+offsetX,y:(displayPositions[i*2+1]-400)*s+height/2+offsetY};}
    function active(){const set=new Set();if(selected){set.add(selected);for(const e of graph.edges)if(e.from===selected||e.to===selected){set.add(e.from);set.add(e.to);}}return set;}
    function draw(){
      if(closed)return;ctx.clearRect(0,0,width,height);const nodes=[],lines=[],lit=active(),style=getComputedStyle(container),light=style.colorScheme==='light',colors=palette(light);
      for(const e of graph.edges){const a=point(ids.get(e.from)),b=point(ids.get(e.to)),alpha=selected&&e.from!==selected&&e.to!==selected?.04:light?.65:.35;
        if(renderer&&e.kind!=='Default exposure'){for(const p of[a,b])lines.push(p.x/width*2-1,1-p.y/height*2,...colors.edge,alpha);}
        else{ctx.beginPath();ctx.setLineDash(e.kind==='Default exposure'?[3,5]:[]);ctx.strokeStyle=`rgba(${colors.edge.map(v=>Math.round(v*255)).join(',')},${alpha})`;ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}}
      ctx.setLineDash([]);
      graph.nodes.forEach((n,i)=>{const p=point(i),match=root.ClustrConnections.matches(n,query,type),alpha=!match||selected&&!lit.has(n.id)?.09:1,r=(n.type==='cluster'?8:n.type==='stock'?4:2.5)+(n.id===selected?3:0),c=colors[n.type];
        if(renderer)nodes.push(p.x/width*2-1,1-p.y/height*2,r/width*2,r/height*2,...c,alpha);
        else{ctx.beginPath();ctx.fillStyle=`rgba(${c.map(v=>Math.round(v*255)).join(',')},${alpha})`;ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();}
        if(n.type==='cluster'||n.id===hover||selected&&lit.has(n.id)){ctx.globalAlpha=alpha;ctx.font='12px system-ui';ctx.textAlign='center';ctx.fillStyle=style.color;ctx.strokeStyle=style.backgroundColor;ctx.lineWidth=4;ctx.lineJoin='round';const text=n.label.length>30?n.label.slice(0,29)+'…':n.label;ctx.strokeText(text,p.x,p.y+r+15);ctx.fillText(text,p.x,p.y+r+15);ctx.globalAlpha=1;}
      });
      if(renderer)try{renderer.draw(new Float32Array(nodes),new Float32Array(lines));}catch{fallback();}
    }
    function tick(time){
      frame=0;if(closed||document.hidden||!visible){lastTime=0;return;}
      if(!reduced){
        const delta=lastTime?Math.min(time-lastTime,50)/1000:1/60;motionTime+=delta;lastTime=time;
        if(iteration++<100)state.step();
        motionPositions(state.positions,motionTime,displayPositions);
        const s=camera(),cursor=pointer&&!drag?{x:(pointer.x-width/2-offsetX)/s+600,y:(pointer.y-height/2-offsetY)/s+400}:null;
        pointerMotion(displayPositions,pointerOffsets,cursor,s,delta);
        if(drag?.node!=null&&drag.moved){state.move(drag.node,drag.nx,drag.ny);displayPositions[drag.node*2]=drag.nx;displayPositions[drag.node*2+1]=drag.ny;}
        frame=requestAnimationFrame(tick);
      }else{lastTime=0;displayPositions.set(state.positions);}
      draw();
    }
    function request(){if(!closed&&!frame)frame=requestAnimationFrame(tick);}
    function resize(){const rect=container.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);const dpr=Math.min(window.devicePixelRatio||1,2);for(const canvas of[pixels,labels]){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);request();}
    function hit(x,y){let found=null,dist=22;const lit=active();graph.nodes.forEach((n,i)=>{if(!root.ClustrConnections.matches(n,query,type)||selected&&!lit.has(n.id))return;const p=point(i),d=Math.hypot(p.x-x,p.y-y);if(d<dist){dist=d;found=n.id;}});return found;}
    function distance(){const[a,b]=[...pointers.values()];return a&&b?Math.hypot(a.x-b.x,a.y-b.y):0;}
    labels.onpointerdown=e=>{
      pointers.set(e.pointerId,{x:e.offsetX,y:e.offsetY});
      const id=hit(e.offsetX,e.offsetY),node=id==null?null:ids.get(id);
      drag=pointers.size===1?{id:e.pointerId,x:e.offsetX,y:e.offsetY,ox:offsetX,oy:offsetY,node,nx:node==null?0:displayPositions[node*2],ny:node==null?0:displayPositions[node*2+1],moved:false}:null;
      pinch=distance();labels.setPointerCapture(e.pointerId);
    };
    labels.onpointermove=e=>{
      pointer=e.pointerType==='touch'?null:{x:e.offsetX,y:e.offsetY};
      if(pointers.has(e.pointerId))pointers.set(e.pointerId,{x:e.offsetX,y:e.offsetY});
      if(pointers.size>1){const next=distance();if(pinch>0)scale=Math.max(.4,Math.min(4,scale*next/pinch));pinch=next;}
      else if(drag&&drag.id===e.pointerId){
        const dx=e.offsetX-drag.x,dy=e.offsetY-drag.y;
        if(Math.hypot(dx,dy)>=5)drag.moved=true;
        if(drag.node!=null&&drag.moved){
          drag.nx+=dx/camera();drag.ny+=dy/camera();drag.x=e.offsetX;drag.y=e.offsetY;
          state.move(drag.node,drag.nx,drag.ny);displayPositions[drag.node*2]=drag.nx;displayPositions[drag.node*2+1]=drag.ny;
        }else if(drag.node==null){offsetX=drag.ox+dx;offsetY=drag.oy+dy;}
      }else hover=hit(e.offsetX,e.offsetY);
      request();
    };
    labels.onpointerup=e=>{if(drag&&drag.id===e.pointerId&&!drag.moved&&Math.hypot(e.offsetX-drag.x,e.offsetY-drag.y)<5){const id=hit(e.offsetX,e.offsetY);if(id)onSelect(id);}pointers.delete(e.pointerId);drag=null;pinch=0;};
    labels.onpointerleave=()=>{pointer=null;hover=null;request();};
    labels.onpointercancel=e=>{pointer=null;pointers.delete(e.pointerId);drag=null;pinch=0;};
    labels.addEventListener('wheel',e=>{if(e.ctrlKey)return;e.preventDefault();scale=Math.max(.4,Math.min(4,scale*Math.exp(-e.deltaY*.001)));request();},{passive:false});
    labels.onkeydown=e=>{if(['+','=','-','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();if(e.key==='-')scale=Math.max(.4,scale-.2);else if(['+','='].includes(e.key))scale=Math.min(4,scale+.2);else{offsetX+=e.key==='ArrowLeft'?30:e.key==='ArrowRight'?-30:0;offsetY+=e.key==='ArrowUp'?30:e.key==='ArrowDown'?-30:0;}request();}};
    const visibilityObserver=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)request();else lastTime=0;});
    visibilityObserver.observe(container);
    function visibilityChanged(){lastTime=0;if(!document.hidden)request();}
    function motionChanged(){reduced=motionPreference.matches;lastTime=0;request();}
    document.addEventListener('visibilitychange',visibilityChanged);
    motionPreference.addEventListener('change',motionChanged);
    const observer=new ResizeObserver(resize);observer.observe(container);resize();
    const themeObserver=root.document?.documentElement?new MutationObserver(request):null;
    themeObserver?.observe(root.document.documentElement,{attributes:true,attributeFilter:['data-theme','data-color-mode','data-surface-style']});
    const colorMode=root.matchMedia?.('(prefers-color-scheme: dark)');colorMode?.addEventListener?.('change',request);
    function fallback(){if(closed)return;renderer?.destroy();renderer=null;pixels.width=pixels.width;container.querySelector('.cx-backend').textContent='Canvas 2D';request();}
    gpuRenderer(pixels).then(result=>{if(closed){result?.destroy();return;}renderer=result;container.querySelector('.cx-backend').textContent=renderer?'WebGPU':'Canvas 2D';renderer?.lost.then(fallback);resize();}).catch(fallback);
    return{update(id,text,kind=''){selected=id;query=text;type=kind;request();},zoom(amount){scale=Math.max(.4,Math.min(4,scale+amount));request();},reset(){scale=1;offsetX=offsetY=0;request();},destroy(){closed=true;cancelAnimationFrame(frame);observer.disconnect();visibilityObserver.disconnect();document.removeEventListener('visibilitychange',visibilityChanged);motionPreference.removeEventListener('change',motionChanged);themeObserver?.disconnect();colorMode?.removeEventListener?.('change',request);renderer?.destroy();}};
  }
  const api={simulation,motionPositions,pointerMotion,mount,palette,paletteStyle};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.ClustrGraphCanvas=api;
})(typeof window==='undefined'?globalThis:window);
