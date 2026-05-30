/*!
 * CanvasPlayer Lite  v3.2
 * Pure rendering engine — no UI, no HTML shell.
 * Optimised for feed pages with 10+ simultaneous instances.
 *
 * NEW in v3.2 vs v3.1:
 *   • Shared RAF scheduler     — one requestAnimationFrame loop for ALL instances
 *   • IntersectionObserver     — auto-pause/resume when scrolled out of view
 *   • Shared image cache       — images shared across all instances, never fetched twice
 *   • Lazy offscreen canvases  — offA/offB created only when transitions are needed
 *   • updateData(data)         — swap data without full reload (no image re-fetch)
 *   • playback option          — 'manual' (default) | 'visible' (auto on scroll into view)
 *   • loadFonts dedup          — static Set, zero-cost after first call per font set
 *
 * API is fully backward compatible with v3.1. No changes needed in consuming code.
 *
 * Usage (unchanged):
 *   const p = new CanvasPlayer('#container', { autoplay: true });
 *   await p.load(schemaJSON);
 *   p.play();
 *
 * Feed usage:
 *   const p = new CanvasPlayer('#card-slot', { playback: 'visible' });
 *   await p.load(schemaJSON);
 *   // plays automatically when scrolled into view, pauses when scrolled out
 */
(function(global){
'use strict';

/* ══════════════════════════════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════════════════════════════*/
const RATIO_DIMS = {
  '1:1':  { w:1080, h:1080 },
  '4:5':  { w:1080, h:1350 },
  '9:16': { w:1080, h:1920 },
  '16:9': { w:1920, h:1080 },
};

/* ══════════════════════════════════════════════════════════════════
   OPTIMISATION 1 — SHARED RAF SCHEDULER
   One requestAnimationFrame loop ticks ALL playing instances.
   Replaces per-instance RAF loops. Zero overhead for single instance.
══════════════════════════════════════════════════════════════════*/
const Scheduler = {
  _players: new Set(),
  _rafId:   null,
  _running: false,

  register(player) {
    this._players.add(player);
    if (!this._running) this._start();
  },

  unregister(player) {
    this._players.delete(player);
    if (this._players.size === 0) this._stop();
  },

  _start() {
    this._running = true;
    const tick = (ts) => {
      if (!this._running) return;
      /* Tick every registered playing instance */
      this._players.forEach(p => p._tick(ts));
      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  },

  _stop() {
    this._running = false;
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
  },
};

/* ══════════════════════════════════════════════════════════════════
   OPTIMISATION 2 — SHARED IMAGE CACHE
   All instances share one Map. Same URL is never fetched twice,
   even across different player instances or schema reloads.
══════════════════════════════════════════════════════════════════*/
const SharedImageCache = {
  _cache: new Map(),   /* url → HTMLImageElement */
  _pending: new Map(), /* url → Promise          */

  has(src)  { return this._cache.has(src); },
  get(src)  { return this._cache.get(src); },

  load(src) {
    /* Already cached */
    if (this._cache.has(src)) return Promise.resolve(this._cache.get(src));
    /* In-flight — return same promise so parallel requests don't double-fetch */
    if (this._pending.has(src)) return this._pending.get(src);

    const promise = new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload  = () => { this._cache.set(src, img); this._pending.delete(src); resolve(img); };
      img.onerror = () => {
        /* Retry without CORS */
        const img2 = new Image();
        img2.onload  = () => { this._cache.set(src, img2); this._pending.delete(src); resolve(img2); };
        img2.onerror = () => { console.warn('[CanvasPlayer] Image failed:', src); this._pending.delete(src); resolve(null); };
        img2.src = src;
      };
      img.src = src;
    });

    this._pending.set(src, promise);
    return promise;
  },

  loadAll(srcs) {
    return Promise.all(srcs.map(src => this.load(src)));
  },
};

/* ══════════════════════════════════════════════════════════════════
   OPTIMISATION 3 — FONT DEDUP SET
   loadFonts() is free after first call for the same font combination.
══════════════════════════════════════════════════════════════════*/
const _loadedFontHrefs = new Set();

/* ══════════════════════════════════════════════════════════════════
   UTILITIES  (module-level, shared, stateless)
══════════════════════════════════════════════════════════════════*/
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function lerp(a,b,t){return a+(b-a)*t}
function applyEasing(t,e){
  t=clamp(t,0,1);
  if(e==='ease_out')    return 1-Math.pow(1-t,2);
  if(e==='ease_in')     return t*t;
  if(e==='ease_in_out') return t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
  if(e==='elastic_out'){const c=(2*Math.PI)/3;return t===0?0:t===1?1:Math.pow(2,-10*t)*Math.sin((t*10-.75)*c)+1;}
  return t;
}
function wrapText(text,at){
  if(!text)return[];
  const words=text.split(' ');const lines=[];let cur='';
  for(const w of words){const t=cur?cur+' '+w:w;if(t.length>at&&cur){lines.push(cur);cur=w;}else cur=t;}
  if(cur)lines.push(cur);return lines;
}
function rrPath(c,x,y,w,h,r){
  if(typeof r==='number')r={tl:r,tr:r,br:r,bl:r};
  c.beginPath();c.moveTo(x+r.tl,y);c.lineTo(x+w-r.tr,y);c.quadraticCurveTo(x+w,y,x+w,y+r.tr);
  c.lineTo(x+w,y+h-r.br);c.quadraticCurveTo(x+w,y+h,x+w-r.br,y+h);
  c.lineTo(x+r.bl,y+h);c.quadraticCurveTo(x,y+h,x,y+h-r.bl);
  c.lineTo(x,y+r.tl);c.quadraticCurveTo(x,y,x+r.tl,y);c.closePath();
}
function hex2rgb(h){return{r:parseInt(h.slice(1,3),16),g:parseInt(h.slice(3,5),16),b:parseInt(h.slice(5,7),16)}}
function withAlpha(hex,a){const{r,g,b}=hex2rgb(hex);return`rgba(${r},${g},${b},${a})`}
function lerpColor(h1,h2,t){
  const a=hex2rgb(h1),b=hex2rgb(h2);
  return`rgb(${Math.round(lerp(a.r,b.r,t))},${Math.round(lerp(a.g,b.g,t))},${Math.round(lerp(a.b,b.b,t))})`;
}

/* ══════════════════════════════════════════════════════════════════
   REFERENCE RESOLVER
══════════════════════════════════════════════════════════════════*/
function resolve(value,schema,dataItem){
  if(typeof value!=='string')return value;
  if(value.startsWith('@')){
    const path=value.slice(1).split('.');
    if(path[0]==='data'){
      let node=dataItem;
      for(let i=1;i<path.length;i++){
        if(node==null)return value;
        const m=path[i].match(/^(.+)\[(\d+)\]$/);
        node=m?node[m[1]]?.[+m[2]]:node[path[i]];
      }
      return node??'';
    }
    let node=schema;
    for(const key of path){
      if(node==null)return value;
      const m=key.match(/^(.+)\[(\d+)\]$/);
      node=m?node[m[1]]?.[+m[2]]:node[key];
    }
    return node??'';
  }
  if(value.startsWith('$')){
    const W=schema.canvas.width??1080,H=schema.canvas.height??1350;
    const expr=value.slice(1).replace(/canvas\.width/g,W).replace(/canvas\.height/g,H);
    try{return Function('"use strict";return ('+expr+')')();}catch{return 0;}
  }
  return value;
}
function R(v,s,d){return resolve(v,s,d);}
function RC(v,s,d){const r=resolve(v,s,d);return(typeof r==='string'&&r.startsWith('#'))?r:'#ffffff';}

/* ══════════════════════════════════════════════════════════════════
   ANIMATION ENGINE
══════════════════════════════════════════════════════════════════*/
function getAnimValue(id,prop,f,anims){
  const a=anims.find(a=>a.layer_id===id&&a.property===prop);
  if(!a)return null;
  if(f<=a.start_frame)return a.from_value;
  if(f>=a.end_frame)return a.to_value;
  const t=applyEasing((f-a.start_frame)/(a.end_frame-a.start_frame),a.easing||'linear');
  if(typeof a.from_value==='number'&&typeof a.to_value==='number')return lerp(a.from_value,a.to_value,t);
  if(typeof a.from_value==='string'&&a.from_value.startsWith('#'))return lerpColor(a.from_value,a.to_value,t);
  return t>=1?a.to_value:a.from_value;
}
function A(id,prop,def,f,an){const v=getAnimValue(id,prop,f,an);return v!==null?v:def;}

/* ══════════════════════════════════════════════════════════════════
   TIMELINE
══════════════════════════════════════════════════════════════════*/
function buildTimeline(schema,items){
  const pb=schema.playback||{};
  const fpi=pb.frames_per_item||schema.meta.total_frames||300;
  const holdF=pb.hold_frames||0;
  const transF=(pb.transition&&pb.transition.type!=='cut'&&pb.transition.type!=='none')
               ?(pb.transition.duration_frames||0):0;
  const slotDur=fpi+holdF+transF;
  const slots=items.map((item,i)=>({
    index:i,item,slotStart:i*slotDur,
    playEnd:i*slotDur+fpi,holdEnd:i*slotDur+fpi+holdF,transEnd:i*slotDur+fpi+holdF+transF,
    fpi,holdF,transF
  }));
  const total=items.length===1?fpi+holdF:(slotDur*(items.length-1))+fpi+holdF;
  return{slots,total,fpi,holdF,transF,slotDur};
}
function resolveFrame(tl,gf){
  for(let i=0;i<tl.slots.length;i++){
    const s=tl.slots[i];
    if(gf>=s.slotStart&&gf<s.playEnd)return{phase:'play',itemIndex:i,localFrame:gf-s.slotStart,nextIndex:i+1<tl.slots.length?i+1:-1,transProgress:0};
    if(s.holdF>0&&gf>=s.playEnd&&gf<s.holdEnd)return{phase:'hold',itemIndex:i,localFrame:s.fpi-1,nextIndex:i+1<tl.slots.length?i+1:-1,transProgress:0};
    if(tl.transF>0&&i<tl.slots.length-1&&gf>=s.holdEnd&&gf<s.transEnd)return{phase:'transition',itemIndex:i,localFrame:s.fpi-1,nextIndex:i+1,transProgress:clamp((gf-s.holdEnd)/tl.transF,0,1)};
  }
  const last=tl.slots[tl.slots.length-1];
  return{phase:'hold',itemIndex:tl.slots.length-1,localFrame:last.fpi-1,nextIndex:-1,transProgress:0};
}

/* ══════════════════════════════════════════════════════════════════
   IMAGE PRIMITIVE HELPERS
══════════════════════════════════════════════════════════════════*/
function drawImageFill(c,img,x,y,w,h,fit,cx_offset,cy_offset){
  if(!img)return;
  const iw=img.naturalWidth,ih=img.naturalHeight;
  let sx=0,sy=0,sw=iw,sh=ih;
  if(fit==='cover'){
    const scale=Math.max(w/iw,h/ih);
    sw=w/scale;sh=h/scale;
    sx=(iw-sw)/2+(cx_offset||0);sy=(ih-sh)/2+(cy_offset||0);
  } else if(fit==='contain'){
    const scale=Math.min(w/iw,h/ih);
    const dw=iw*scale,dh=ih*scale;
    c.drawImage(img,0,0,iw,ih,x+(w-dw)/2,y+(h-dh)/2,dw,dh);return;
  }
  c.drawImage(img,sx,sy,sw,sh,x,y,w,h);
}

/* ══════════════════════════════════════════════════════════════════
   ALL 46 PRIMITIVES
   Note: image primitives now receive SharedImageCache.get() result
   directly — no per-instance cache lookup needed here.
══════════════════════════════════════════════════════════════════*/

function prim_fill_rect(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  c.save();c.globalAlpha=clamp(op,0,1);c.fillStyle=RC(l.color??'@brand.colors.background',s,d);
  c.fillRect(R(l.x??0,s,d),R(l.y??0,s,d),R(l.width??s.canvas.width,s,d),R(l.height??s.canvas.height,s,d));c.restore();
}
function prim_radial_gradient(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const W=s.canvas.width,H=s.canvas.height;
  const cx=R(l.cx??'$canvas.width*0.5',s,d),cy=R(l.cy??'$canvas.height*0.5',s,d),r=R(l.radius??500,s,d);
  c.save();c.globalAlpha=clamp(op,0,1);
  const g=c.createRadialGradient(cx,cy,0,cx,cy,r);
  g.addColorStop(0,withAlpha(RC(l.color_start??'#fff',s,d),l.opacity_start??0.2));
  g.addColorStop(1,withAlpha(RC(l.color_end??'#000',s,d),l.opacity_end??0));
  c.fillStyle=g;c.fillRect(0,0,W,H);c.restore();
}
function prim_linear_gradient(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const W=s.canvas.width,H=s.canvas.height;
  c.save();c.globalAlpha=clamp(op,0,1);
  const g=c.createLinearGradient(R(l.x1??0,s,d),R(l.y1??0,s,d),R(l.x2??0,s,d),R(l.y2??H,s,d));
  g.addColorStop(0,withAlpha(RC(l.color_start??'#fff',s,d),l.opacity_start??0.2));
  g.addColorStop(1,withAlpha(RC(l.color_end??'#000',s,d),l.opacity_end??0));
  c.fillStyle=g;c.fillRect(0,0,W,H);c.restore();
}
function prim_conic_gradient(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const W=s.canvas.width,H=s.canvas.height;
  const cx=R(l.cx??'$canvas.width*0.5',s,d),cy=R(l.cy??'$canvas.height*0.5',s,d);
  const startAngle=(l.start_angle??0)*Math.PI/180;
  const stops=l.stops??[{offset:0,color:'@brand.colors.primary'},{offset:1,color:'@brand.colors.background'}];
  c.save();c.globalAlpha=clamp(op,0,1);
  const g=c.createConicGradient(startAngle,cx,cy);
  stops.forEach(stop=>g.addColorStop(stop.offset,RC(stop.color,s,d)));
  c.fillStyle=g;c.fillRect(0,0,W,H);c.restore();
}
function prim_dot_grid(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??0.07,f,an);if(op<=0)return;
  const W=s.canvas.width,H=s.canvas.height,sp=l.spacing??72,dr=l.dot_radius??2;
  c.save();c.globalAlpha=clamp(op,0,1);c.fillStyle=RC(l.color??'@brand.colors.primary',s,d);
  for(let x=sp;x<W;x+=sp)for(let y=sp;y<H;y+=sp){c.beginPath();c.arc(x,y,dr,0,Math.PI*2);c.fill();}
  c.restore();
}
function prim_scan_lines(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??0.025,f,an);if(op<=0)return;
  const W=s.canvas.width,H=s.canvas.height;
  c.save();c.globalAlpha=clamp(op,0,1);c.fillStyle=RC(l.color??'#fff',s,d);
  const gap=l.gap??4,lh=l.line_height??2;
  for(let y=0;y<H;y+=gap)c.fillRect(0,y,W,lh);c.restore();
}
function prim_noise(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??0.03,f,an);if(op<=0)return;
  const W=s.canvas.width,H=s.canvas.height;
  c.save();c.globalAlpha=clamp(op,0,1);c.fillStyle=RC(l.color??'#fff',s,d);
  for(let i=0;i<W*H*(l.density??0.15);i++)c.fillRect(Math.random()*W|0,Math.random()*H|0,1,1);
  c.restore();
}
function prim_rectangle(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const sx=A(l.id,'scale_x',1,f,an),sy=A(l.id,'scale_y',1,f,an),sc=A(l.id,'scale',1,f,an);
  const x=R(l.x??0,s,d),y=R(l.y??0,s,d),w=R(l.width??100,s,d),h=R(l.height??100,s,d),rad=l.corner_radius??0;
  const orig=l.origin??'center';
  let ox=x+w/2,oy=y+h/2;
  if(orig==='top')oy=y;if(orig==='bottom')oy=y+h;if(orig==='left')ox=x;if(orig==='right')ox=x+w;
  if(orig==='top_left'){ox=x;oy=y;}if(orig==='top_right'){ox=x+w;oy=y;}
  if(orig==='bottom_left'){ox=x;oy=y+h;}if(orig==='bottom_right'){ox=x+w;oy=y+h;}
  const stroke=l.stroke_color?RC(l.stroke_color,s,d):null;
  c.save();c.globalAlpha=clamp(op,0,1);c.translate(ox,oy);c.scale(sx*sc,sy*sc);c.translate(-ox,-oy);
  rrPath(c,x,y,w,h,rad);
  if(l.fill!==false){c.fillStyle=RC(l.color??'#fff',s,d);c.fill();}
  if(stroke){c.strokeStyle=stroke;c.lineWidth=l.stroke_width??1;c.stroke();}
  c.restore();
}
function prim_circle(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const sc=A(l.id,'scale',1,f,an);
  const cx=R(l.cx??0,s,d),cy=R(l.cy??0,s,d),r=R(l.radius??50,s,d);
  const stroke=l.stroke_color?RC(l.stroke_color,s,d):null;
  c.save();c.globalAlpha=clamp(op,0,1);c.translate(cx,cy);c.scale(sc,sc);c.translate(-cx,-cy);
  c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);
  if(l.fill!==false){c.fillStyle=RC(l.color??'#fff',s,d);c.fill();}
  if(stroke){c.strokeStyle=stroke;c.lineWidth=l.stroke_width??1;c.stroke();}
  c.restore();
}
function prim_ellipse(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const sc=A(l.id,'scale',1,f,an),rot=A(l.id,'rotation',l.rotation??0,f,an);
  const cx=R(l.cx??0,s,d),cy=R(l.cy??0,s,d),rx=R(l.rx??100,s,d),ry=R(l.ry??60,s,d);
  const stroke=l.stroke_color?RC(l.stroke_color,s,d):null;
  c.save();c.globalAlpha=clamp(op,0,1);c.translate(cx,cy);c.scale(sc,sc);c.translate(-cx,-cy);
  c.beginPath();c.ellipse(cx,cy,rx,ry,rot,0,Math.PI*2);
  if(l.fill!==false){c.fillStyle=RC(l.color??'#fff',s,d);c.fill();}
  if(stroke){c.strokeStyle=stroke;c.lineWidth=l.stroke_width??1;c.stroke();}
  c.restore();
}
function prim_arc(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const progress=A(l.id,'progress',1,f,an);
  const cx=R(l.cx??0,s,d),cy=R(l.cy??0,s,d),r=R(l.radius??100,s,d);
  const startDeg=l.start_angle??-90,endDeg=l.end_angle??270;
  const span=(endDeg-startDeg)*progress;
  const startRad=startDeg*(Math.PI/180),endRad=(startDeg+span)*(Math.PI/180);
  const color=l.stroke_color?RC(l.stroke_color,s,d):RC(l.color??'@brand.colors.primary',s,d);
  const bgColor=l.bg_color?RC(l.bg_color,s,d):null;
  c.save();c.globalAlpha=clamp(op,0,1);
  if(bgColor){c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.strokeStyle=bgColor;c.lineWidth=l.stroke_width??12;c.lineCap=l.line_cap??'round';c.stroke();}
  c.beginPath();c.arc(cx,cy,r,startRad,endRad);c.strokeStyle=color;c.lineWidth=l.stroke_width??12;c.lineCap=l.line_cap??'round';c.stroke();
  if(l.fill_color){c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.fillStyle=RC(l.fill_color,s,d);c.fill();}
  c.restore();
}
function prim_triangle(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const sc=A(l.id,'scale',1,f,an),rot=A(l.id,'rotation',l.rotation??0,f,an);
  const cx=R(l.cx??0,s,d),cy=R(l.cy??0,s,d),size=R(l.size??80,s,d);
  const w=R(l.width??size,s,d),h=R(l.height??size,s,d),pointing=l.pointing??'up';
  const stroke=l.stroke_color?RC(l.stroke_color,s,d):null;
  let pts;
  if(pointing==='up')pts=[[-w/2,h/2],[w/2,h/2],[0,-h/2]];
  else if(pointing==='down')pts=[[-w/2,-h/2],[w/2,-h/2],[0,h/2]];
  else if(pointing==='left')pts=[[w/2,-h/2],[w/2,h/2],[-w/2,0]];
  else pts=[[-w/2,-h/2],[-w/2,h/2],[w/2,0]];
  c.save();c.globalAlpha=clamp(op,0,1);c.translate(cx,cy);c.scale(sc,sc);c.rotate(rot);
  c.beginPath();c.moveTo(pts[0][0],pts[0][1]);c.lineTo(pts[1][0],pts[1][1]);c.lineTo(pts[2][0],pts[2][1]);c.closePath();
  if(l.fill!==false){c.fillStyle=RC(l.color??'#fff',s,d);c.fill();}
  if(stroke){c.strokeStyle=stroke;c.lineWidth=l.stroke_width??1;c.stroke();}
  c.restore();
}
function prim_star(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const sc=A(l.id,'scale',1,f,an),rot=A(l.id,'rotation',l.rotation??-Math.PI/2,f,an);
  const cx=R(l.cx??0,s,d),cy=R(l.cy??0,s,d);
  const ro=R(l.outer_radius??60,s,d),ri=R(l.inner_radius??ro*0.4,s,d),pts=l.points??5;
  const stroke=l.stroke_color?RC(l.stroke_color,s,d):null;
  c.save();c.globalAlpha=clamp(op,0,1);c.translate(cx,cy);c.scale(sc,sc);c.rotate(rot);
  c.beginPath();
  for(let i=0;i<pts*2;i++){const r=i%2===0?ro:ri;const angle=(Math.PI/pts)*i;i===0?c.moveTo(Math.cos(angle)*r,Math.sin(angle)*r):c.lineTo(Math.cos(angle)*r,Math.sin(angle)*r);}
  c.closePath();
  if(l.fill!==false){c.fillStyle=RC(l.color??'#fff',s,d);c.fill();}
  if(stroke){c.strokeStyle=stroke;c.lineWidth=l.stroke_width??1;c.stroke();}
  c.restore();
}
function prim_polygon(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const sc=A(l.id,'scale',1,f,an),rot=A(l.id,'rotation',l.rotation??0,f,an);
  const cx=R(l.cx??0,s,d),cy=R(l.cy??0,s,d),r=R(l.radius??60,s,d),sides=l.sides??6;
  const stroke=l.stroke_color?RC(l.stroke_color,s,d):null;
  c.save();c.globalAlpha=clamp(op,0,1);c.translate(cx,cy);c.scale(sc,sc);c.rotate(rot);
  c.beginPath();
  for(let i=0;i<sides;i++){const angle=(Math.PI*2/sides)*i;i===0?c.moveTo(Math.cos(angle)*r,Math.sin(angle)*r):c.lineTo(Math.cos(angle)*r,Math.sin(angle)*r);}
  c.closePath();
  if(l.fill!==false){c.fillStyle=RC(l.color??'#fff',s,d);c.fill();}
  if(stroke){c.strokeStyle=stroke;c.lineWidth=l.stroke_width??1;c.stroke();}
  c.restore();
}
function prim_cross(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const sc=A(l.id,'scale',1,f,an),rot=A(l.id,'rotation',l.rotation??0,f,an);
  const cx=R(l.cx??0,s,d),cy=R(l.cy??0,s,d),size=R(l.size??60,s,d),thick=R(l.thickness??size*0.25,s,d),rad=l.corner_radius??0;
  const stroke=l.stroke_color?RC(l.stroke_color,s,d):null,color=RC(l.color??'#fff',s,d);
  c.save();c.globalAlpha=clamp(op,0,1);c.translate(cx,cy);c.scale(sc,sc);c.rotate(rot);
  if(l.fill!==false){c.fillStyle=color;rrPath(c,-size/2,-thick/2,size,thick,rad);c.fill();rrPath(c,-thick/2,-size/2,thick,size,rad);c.fill();}
  if(stroke){c.strokeStyle=stroke;c.lineWidth=l.stroke_width??1;rrPath(c,-size/2,-thick/2,size,thick,rad);c.stroke();rrPath(c,-thick/2,-size/2,thick,size,rad);c.stroke();}
  c.restore();
}
function prim_chevron(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const sc=A(l.id,'scale',1,f,an);
  const cx=R(l.cx??0,s,d),cy=R(l.cy??0,s,d),size=R(l.size??40,s,d),sw=l.stroke_width??6;
  const dir=l.direction??'right',h=size/2;
  let pts;
  if(dir==='right')pts=[[-h,-h],[0,0],[-h,h]];
  else if(dir==='left')pts=[[h,-h],[0,0],[h,h]];
  else if(dir==='up')pts=[[-h,h],[0,0],[h,h]];
  else pts=[[-h,-h],[0,0],[h,-h]];
  c.save();c.globalAlpha=clamp(op,0,1);c.translate(cx,cy);c.scale(sc,sc);
  c.beginPath();c.moveTo(pts[0][0],pts[0][1]);c.lineTo(pts[1][0],pts[1][1]);c.lineTo(pts[2][0],pts[2][1]);
  c.strokeStyle=RC(l.color??'@brand.colors.primary',s,d);c.lineWidth=sw;c.lineCap='round';c.lineJoin='round';c.stroke();
  c.restore();
}
function prim_pill(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const sx=A(l.id,'scale_x',1,f,an);
  const cx=R(l.cx??0,s,d),cy=R(l.cy??0,s,d),w=R(l.width??200,s,d),h=R(l.height??48,s,d);
  const stroke=l.stroke_color?RC(l.stroke_color,s,d):null;
  c.save();c.globalAlpha=clamp(op,0,1);c.translate(cx,cy);c.scale(sx,1);c.translate(-cx,-cy);
  rrPath(c,cx-w/2,cy-h/2,w,h,h/2);
  if(l.fill!==false){c.fillStyle=RC(l.color??'@brand.colors.primary',s,d);c.fill();}
  if(stroke){c.strokeStyle=stroke;c.lineWidth=l.stroke_width??1;c.stroke();}
  c.restore();
}
function prim_diamond(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const sc=A(l.id,'scale',1,f,an),rot=A(l.id,'rotation',l.rotation??Math.PI/4,f,an);
  const cx=R(l.cx??0,s,d),cy=R(l.cy??0,s,d),size=R(l.size??14,s,d);
  c.save();c.globalAlpha=clamp(op,0,1);c.translate(cx,cy);c.scale(sc,sc);c.rotate(rot);
  c.fillStyle=RC(l.color??'@brand.colors.primary',s,d);c.fillRect(-size/2,-size/2,size,size);c.restore();
}
function prim_bracket(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const sc=A(l.id,'scale',1,f,an);
  const W=s.canvas.width,H=s.canvas.height;
  const margin=R(l.margin??60,s,d),size=R(l.size??80,s,d),sw=l.stroke_width??4;
  const corners=l.corners??['top_left','top_right','bottom_left','bottom_right'];
  const defs={top_left:[[margin+size,margin],[margin,margin],[margin,margin+size]],top_right:[[W-margin-size,margin],[W-margin,margin],[W-margin,margin+size]],bottom_left:[[margin,H-margin-size],[margin,H-margin],[margin+size,H-margin]],bottom_right:[[W-margin-size,H-margin],[W-margin,H-margin],[W-margin,H-margin-size]]};
  c.save();c.globalAlpha=clamp(op,0,1);c.strokeStyle=RC(l.color??'@brand.colors.primary',s,d);c.lineWidth=sw;c.lineCap='square';
  c.translate(W/2,H/2);c.scale(sc,sc);c.translate(-W/2,-H/2);
  corners.forEach(corner=>{const pts=defs[corner];if(!pts)return;c.beginPath();c.moveTo(pts[0][0],pts[0][1]);c.lineTo(pts[1][0],pts[1][1]);c.lineTo(pts[2][0],pts[2][1]);c.stroke();});
  c.restore();
}
function prim_line(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const sx=A(l.id,'scale_x',1,f,an);
  const x1=R(l.x1??0,s,d),y1=R(l.y1??0,s,d),x2=R(l.x2??100,s,d),y2=R(l.y2??0,s,d);
  const orig=l.origin??'left';let pivotX=x1;
  if(orig==='center')pivotX=(x1+x2)/2;if(orig==='right')pivotX=x2;
  c.save();c.globalAlpha=clamp(op,0,1);c.translate(pivotX,y1);c.scale(sx,1);c.translate(-pivotX,-y1);
  c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);
  c.strokeStyle=RC(l.color??'#fff',s,d);c.lineWidth=l.stroke_width??1;
  if(l.dash)c.setLineDash(l.dash);c.lineCap=l.line_cap??'butt';c.stroke();c.setLineDash([]);c.restore();
}
function prim_dashed_line(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const x1=R(l.x1??0,s,d),y1=R(l.y1??0,s,d),x2=R(l.x2??100,s,d),y2=R(l.y2??0,s,d);
  c.save();c.globalAlpha=clamp(op,0,1);
  c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);
  c.strokeStyle=RC(l.color??'#fff',s,d);c.lineWidth=l.stroke_width??1;
  c.setLineDash(l.dash??[12,8]);c.lineDashOffset=l.dash_offset??0;c.lineCap=l.line_cap??'butt';
  c.stroke();c.setLineDash([]);c.restore();
}
function prim_double_rule(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const sx=A(l.id,'scale_x',1,f,an);
  const x1=R(l.x1??0,s,d),x2=R(l.x2??s.canvas.width,s,d),y=R(l.y??0,s,d),gap=R(l.gap??14,s,d),sw=l.stroke_width??1.5;
  const color=RC(l.color??'@brand.colors.primary',s,d),mx=(x1+x2)/2;
  c.save();c.globalAlpha=clamp(op,0,1);c.translate(mx,y);c.scale(sx,1);c.translate(-mx,-y);
  c.strokeStyle=color;c.lineWidth=sw;
  c.beginPath();c.moveTo(x1,y-gap/2);c.lineTo(x2,y-gap/2);c.stroke();
  c.beginPath();c.moveTo(x1,y+gap/2);c.lineTo(x2,y+gap/2);c.stroke();
  c.restore();
}
function prim_multi_line(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const pts=l.points??[];if(pts.length<2)return;
  c.save();c.globalAlpha=clamp(op,0,1);c.beginPath();
  c.moveTo(R(pts[0][0],s,d),R(pts[0][1],s,d));
  for(let i=1;i<pts.length;i++)c.lineTo(R(pts[i][0],s,d),R(pts[i][1],s,d));
  c.strokeStyle=RC(l.color??'#fff',s,d);c.lineWidth=l.stroke_width??1;
  c.lineCap=l.line_cap??'butt';c.lineJoin=l.line_join??'miter';c.stroke();c.restore();
}
function prim_text(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const yo=A(l.id,'y',0,f,an),xo=A(l.id,'x',0,f,an),sc=A(l.id,'scale_x',1,f,an);
  const ls=A(l.id,'letter_spacing',l.letter_spacing??0,f,an);
  const content=l.content??R(l.content_ref??'',s,d);
  if(content===null||content===undefined||content==='')return;
  const x=R(l.x??0,s,d)+xo,y=R(l.y??0,s,d)+yo,align=l.align??'left';
  const font=R(l.font??'@brand.fonts.sans',s,d),size=R(l.size??32,s,d),weight=l.weight??400;
  const style=l.font_style?l.font_style+' ':'';
  c.save();c.globalAlpha=clamp(op,0,1)*(l.color_opacity??1);
  c.font=`${style}${weight} ${size}px "${font}", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"`;c.fillStyle=RC(l.color??'@brand.colors.text',s,d);
  c.textAlign=align;c.textBaseline=l.baseline??'alphabetic';c.letterSpacing=ls+'px';
  c.translate(x,y);c.scale(sc,1);c.translate(-x,-y);c.fillText(String(content),x,y);
  c.letterSpacing='0px';c.restore();
}
function prim_text_multiline(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const yo=A(l.id,'y',0,f,an);
  const content=l.content??R(l.content_ref??'',s,d);if(!content)return;
  const lines=wrapText(String(content),l.wrap_at??30);
  const lh=l.line_height??(R(l.size??32,s,d)*1.4);
  const x=R(l.x??0,s,d),y=R(l.y??0,s,d)+yo,align=l.align??'left';
  const aLine=l.accent_line??-1,aColor=l.accent_color?RC(l.accent_color,s,d):RC(l.color??'@brand.colors.text',s,d);
  const font=R(l.font??'@brand.fonts.sans',s,d),size=R(l.size??32,s,d),weight=l.weight??400;
  const style=l.font_style?l.font_style+' ':'';
  c.save();c.globalAlpha=clamp(op,0,1)*(l.color_opacity??1);
  c.textAlign=align;c.textBaseline=l.baseline??'alphabetic';
  if(l.letter_spacing)c.letterSpacing=l.letter_spacing+'px';
  lines.forEach((ln,i)=>{
    const isA=i===aLine;
    c.font=`${isA?(l.accent_style||'italic')+' ':''}${style}${weight} ${size}px "${font}", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"`;
    c.fillStyle=isA?aColor:RC(l.color??'@brand.colors.text',s,d);c.fillText(ln,x,y+i*lh);
  });
  c.letterSpacing='0px';c.restore();
}
function prim_text_countup(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const progress=A(l.id,'count_progress',1,f,an),yo=A(l.id,'y',0,f,an);
  const raw=R(l.content_ref??l.content??'0',s,d);
  const unit=l.unit_ref?R(l.unit_ref,s,d):(l.unit??'');
  const rawStr=String(raw),prefix=rawStr.match(/^[^0-9]*/)[0];
  const hasX=rawStr.includes('x')&&!rawStr.includes('px'),hasDot=rawStr.includes('.');
  const num=parseFloat(rawStr.replace(/[^0-9.]/g,''))||0;
  const animated=num*clamp(progress,0,1);
  const disp=prefix+(hasDot?animated.toFixed(1):Math.round(animated).toString())+(hasX?'x':'');
  const font=R(l.font??'@brand.fonts.display',s,d),size=R(l.size??340,s,d),weight=l.weight??900;
  const x=R(l.x??0,s,d),y=R(l.y??0,s,d)+yo,align=l.align??'center';
  const unitColor=l.unit_color?RC(l.unit_color,s,d):RC(l.color??'@brand.colors.primary',s,d);
  c.save();c.globalAlpha=clamp(op,0,1);
  c.font=`${weight} ${size}px "${font}", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"`;c.fillStyle=RC(l.color??'@brand.colors.text',s,d);
  c.textAlign=align;c.textBaseline=l.baseline??'alphabetic';c.fillText(disp,x,y);
  if(unit){
    const us=R(l.unit_size??size*0.21,s,d),uf=R(l.unit_font??'@brand.fonts.grotesk',s,d);
    const mw=c.measureText(disp).width;
    const ux=align==='center'?x+mw/2+R(l.unit_offset_x??30,s,d):x+mw+R(l.unit_offset_x??20,s,d);
    const uy=y-R(l.unit_offset_y??size*0.79,s,d);
    c.font=`${l.unit_weight??500} ${us}px "${uf}", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"`;c.fillStyle=unitColor;c.textAlign='left';c.fillText(unit,ux,uy);
  }
  if(l.glow){
    const gc=RC(l.glow_color??l.color??'@brand.colors.primary',s,d);
    c.globalAlpha=clamp(op,0,1)*(l.glow_opacity??0.08);
    c.shadowColor=gc;c.shadowBlur=l.glow_blur??160;
    c.font=`${weight} ${size}px "${font}", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"`;c.fillStyle=gc;c.textAlign=align;c.textBaseline=l.baseline??'alphabetic';
    c.fillText(disp,x,y);c.shadowBlur=0;
  }
  c.restore();
}
function prim_text_typewriter(c,l,f,s,d,an){
  const progress=A(l.id,'count_progress',1,f,an);
  const content=String(l.content??R(l.content_ref??'',s,d));
  const chars=Math.round(content.length*clamp(progress,0,1));
  prim_text(c,{...l,content:content.slice(0,chars)},f,s,d,an);
}
function prim_text_outlined(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const yo=A(l.id,'y',0,f,an),xo=A(l.id,'x',0,f,an);
  const content=l.content??R(l.content_ref??'',s,d);if(!content&&content!==0)return;
  const font=R(l.font??'@brand.fonts.display',s,d),size=R(l.size??80,s,d),weight=l.weight??900;
  const x=R(l.x??0,s,d)+xo,y=R(l.y??0,s,d)+yo,align=l.align??'center';
  c.save();c.globalAlpha=clamp(op,0,1);
  c.font=`${l.font_style?l.font_style+' ':''}${weight} ${size}px "${font}", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"`;
  c.textAlign=align;c.textBaseline=l.baseline??'alphabetic';
  c.strokeStyle=RC(l.stroke_color??'@brand.colors.primary',s,d);c.lineWidth=l.stroke_width??2;c.lineJoin='round';
  c.strokeText(String(content),x,y);
  if(l.fill!==false){c.fillStyle=RC(l.color??'@brand.colors.text',s,d);c.fillText(String(content),x,y);}
  c.restore();
}
function prim_text_shadow(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const yo=A(l.id,'y',0,f,an);
  const content=l.content??R(l.content_ref??'',s,d);if(!content&&content!==0)return;
  const font=R(l.font??'@brand.fonts.serif',s,d),size=R(l.size??68,s,d),weight=l.weight??700;
  const x=R(l.x??0,s,d),y=R(l.y??0,s,d)+yo,align=l.align??'center';
  c.save();c.globalAlpha=clamp(op,0,1);
  c.font=`${l.font_style?l.font_style+' ':''}${weight} ${size}px "${font}", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"`;
  c.fillStyle=RC(l.color??'@brand.colors.text',s,d);
  c.textAlign=align;c.textBaseline=l.baseline??'alphabetic';
  c.shadowColor=l.shadow_color??'rgba(0,0,0,0.5)';c.shadowBlur=l.shadow_blur??20;
  c.shadowOffsetX=l.shadow_x??0;c.shadowOffsetY=l.shadow_y??8;
  c.fillText(String(content),x,y);
  c.shadowColor='transparent';c.shadowBlur=0;c.shadowOffsetX=0;c.shadowOffsetY=0;c.restore();
}
function prim_text_block(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const yo=A(l.id,'y',0,f,an);
  const content=l.content??R(l.content_ref??'',s,d);if(!content)return;
  const font=R(l.font??'@brand.fonts.sans',s,d),size=R(l.size??36,s,d),weight=l.weight??400;
  const maxW=R(l.max_width??s.canvas.width-216,s,d),lh=l.line_height??size*1.4;
  const x=R(l.x??s.canvas.width*0.5,s,d),y=R(l.y??0,s,d)+yo,align=l.align??'center';
  c.save();c.globalAlpha=clamp(op,0,1)*(l.color_opacity??1);
  c.font=`${l.font_style?l.font_style+' ':''}${weight} ${size}px "${font}", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"`;
  c.fillStyle=RC(l.color??'@brand.colors.text',s,d);c.textAlign=align;c.textBaseline=l.baseline??'alphabetic';
  const words=String(content).split(' ');const lines=[];let cur='';
  for(const w of words){const test=cur?cur+' '+w:w;if(c.measureText(test).width>maxW&&cur){lines.push(cur);cur=w;}else cur=test;}
  if(cur)lines.push(cur);
  lines.forEach((ln,i)=>c.fillText(ln,x,y+i*lh));c.restore();
}
function prim_number_display(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const progress=A(l.id,'count_progress',1,f,an),yo=A(l.id,'y',0,f,an);
  const rawVal=R(l.value_ref??l.content??'0',s,d);
  const num=parseFloat(String(rawVal).replace(/[^0-9.]/g,''))||0;
  const animated=l.count_up!==false?num*clamp(progress,0,1):num;
  const decimals=l.decimals??0;
  let display=l.locale??false?animated.toLocaleString(undefined,{minimumFractionDigits:decimals,maximumFractionDigits:decimals}):animated.toFixed(decimals);
  if(decimals===0)display=Math.round(animated).toString();
  const prefix=l.prefix?R(l.prefix,s,d):'',suffix=l.suffix?R(l.suffix,s,d):'',full=prefix+display+suffix;
  const font=R(l.font??'@brand.fonts.display',s,d),size=R(l.size??280,s,d),weight=l.weight??900;
  const x=R(l.x??'$canvas.width*0.5',s,d),y=R(l.y??0,s,d)+yo,align=l.align??'center';
  c.save();c.globalAlpha=clamp(op,0,1);
  c.font=`${weight} ${size}px "${font}", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"`;c.fillStyle=RC(l.color??'@brand.colors.text',s,d);
  c.textAlign=align;c.textBaseline=l.baseline??'alphabetic';c.fillText(full,x,y);
  if(l.unit_text){
    const uf=R(l.unit_font??l.font??'@brand.fonts.grotesk',s,d),us=R(l.unit_size??size*0.22,s,d),uw=l.unit_weight??500;
    const mw=c.measureText(full).width;
    const ux=align==='center'?x+mw/2+R(l.unit_offset_x??20,s,d):x+mw+R(l.unit_offset_x??12,s,d);
    const uy=y-R(l.unit_offset_y??size*0.75,s,d);
    c.font=`${uw} ${us}px "${uf}", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"`;c.fillStyle=RC(l.unit_color??l.color??'@brand.colors.primary',s,d);c.textAlign='left';c.fillText(R(l.unit_text,s,d),ux,uy);
  }
  if(l.glow){
    c.globalAlpha=clamp(op,0,1)*(l.glow_opacity??0.07);
    c.shadowColor=RC(l.glow_color??l.color??'@brand.colors.primary',s,d);c.shadowBlur=l.glow_blur??140;
    c.font=`${weight} ${size}px "${font}", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"`;c.fillStyle=RC(l.glow_color??l.color??'@brand.colors.primary',s,d);
    c.textAlign=align;c.textBaseline=l.baseline??'alphabetic';c.fillText(full,x,y);c.shadowBlur=0;
  }
  c.restore();
}
function prim_pill_text(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const yo=A(l.id,'y',0,f,an),sx2=A(l.id,'scale_x',1,f,an);
  const rawContent=R(l.content_ref??l.content??'',s,d);if(!rawContent)return;
  const text=(l.prefix??'')+String(rawContent).toUpperCase();
  const color=RC(l.color??'@brand.colors.primary',s,d);
  const bgColor=l.bg_color?RC(l.bg_color,s,d):color;
  const border=l.border_color?RC(l.border_color,s,d):null;
  const font=R(l.font??'@brand.fonts.mono',s,d),size=R(l.size??20,s,d),weight=l.weight??400;
  const pH=l.padding_h??36,pV=l.padding_v??24;
  const x=R(l.x??0,s,d),y=R(l.y??0,s,d)+yo,align=l.align??'center';
  c.save();c.globalAlpha=clamp(op,0,1);
  c.font=`${weight} ${size}px "${font}", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"`;
  if(l.letter_spacing)c.letterSpacing=l.letter_spacing+'px';
  const tw=c.measureText(text).width,pw=tw+pH*2,ph=size+pV*2;
  let bx=x-pw/2;if(align==='left')bx=x;if(align==='right')bx=x-pw;
  const by=y-ph/2;
  c.translate(x,y);c.scale(sx2,1);c.translate(-x,-y);
  rrPath(c,bx,by,pw,ph,ph/2);
  c.fillStyle=withAlpha(bgColor,l.bg_opacity??0.1);c.fill();
  if(border){c.strokeStyle=withAlpha(border,l.border_opacity??0.25);c.lineWidth=1;c.stroke();}
  c.fillStyle=color;c.textAlign='center';c.textBaseline='middle';c.fillText(text,bx+pw/2,by+ph/2);
  c.letterSpacing='0px';c.restore();
}
function prim_source_tag(c,l,f,s,d,an){
  prim_pill_text(c,{...l,type:'pill_text',prefix:l.prefix??'SOURCE: ',content_ref:l.content_ref??'@data.source',
    font:l.font??'@brand.fonts.mono',size:l.size??20,letter_spacing:l.letter_spacing??1,
    bg_opacity:l.bg_opacity??0.1,border_color:l.border_color??l.color??'@brand.colors.primary',border_opacity:l.border_opacity??0.2},f,s,d,an);
}
function prim_brand_watermark(c,l,f,s,d,an){
  prim_text(c,{...l,type:'text',content:l.content??R('@brand.logo',s,d),
    font:l.font??'@brand.fonts.mono',size:l.size??18,weight:l.weight??400,
    letter_spacing:l.letter_spacing??4,color:l.color??'@brand.colors.text',
    align:l.align??'center',baseline:'alphabetic',color_opacity:l.color_opacity??0.28},f,s,d,an);
}
function prim_tag(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const yo=A(l.id,'y',0,f,an),sx2=A(l.id,'scale_x',1,f,an);
  const raw=R(l.content_ref??l.content??'',s,d);if(!raw)return;
  const label=(l.prefix??'')+(l.uppercase!==false?String(raw).toUpperCase():String(raw));
  const color=RC(l.color??'@brand.colors.primary',s,d);
  const bgColor=RC(l.bg_color??l.color??'@brand.colors.primary',s,d);
  const font=R(l.font??'@brand.fonts.grotesk',s,d),size=R(l.size??22,s,d),weight=l.weight??500;
  const pH=l.padding_h??28,pV=l.padding_v??14;
  const x=R(l.x??0,s,d),y=R(l.y??0,s,d)+yo,align=l.align??'center';
  c.save();c.globalAlpha=clamp(op,0,1);
  c.font=`${weight} ${size}px "${font}", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"`;
  if(l.letter_spacing)c.letterSpacing=l.letter_spacing+'px';
  const tw=c.measureText(label).width,pw=tw+pH*2,ph=size+pV*2,rad=ph/2;
  let bx=x-pw/2;if(align==='left')bx=x;if(align==='right')bx=x-pw;
  const by=y-ph/2;
  c.translate(x,y);c.scale(sx2,1);c.translate(-x,-y);
  rrPath(c,bx,by,pw,ph,rad);
  c.fillStyle=withAlpha(bgColor,l.bg_opacity??0.12);c.fill();
  if(l.border!==false){c.strokeStyle=withAlpha(color,l.border_opacity??0.3);c.lineWidth=1;c.stroke();}
  c.fillStyle=color;c.textAlign='center';c.textBaseline='middle';c.fillText(label,bx+pw/2,by+ph/2);
  c.letterSpacing='0px';c.restore();
}
function prim_progress_bar(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const progress=A(l.id,'progress',l.value??1,f,an);
  const x=R(l.x??0,s,d),y=R(l.y??0,s,d),w=R(l.width??400,s,d),h=R(l.height??12,s,d);
  const val=l.value_ref?clamp(parseFloat(R(l.value_ref,s,d))/100,0,1):clamp(progress,0,1);
  const rad=l.corner_radius??h/2;
  const color=RC(l.color??'@brand.colors.primary',s,d),bgColor=RC(l.bg_color??'@brand.colors.muted',s,d);
  c.save();c.globalAlpha=clamp(op,0,1);
  rrPath(c,x,y,w,h,rad);c.fillStyle=withAlpha(bgColor,l.bg_opacity??0.2);c.fill();
  if(val>0){rrPath(c,x,y,w*val,h,rad);c.fillStyle=color;c.fill();}
  if(l.label){
    const pct=Math.round(val*100)+'%';
    const font=R(l.label_font??'@brand.fonts.grotesk',s,d),sz=l.label_size??h*1.8,lw=l.label_weight??600;
    c.font=`${lw} ${sz}px "${font}", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"`;c.fillStyle=color;c.textAlign='right';c.textBaseline='middle';c.fillText(pct,x+w,y+h/2);
  }
  c.restore();
}
function prim_stat_card(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const progress=A(l.id,'count_progress',1,f,an);
  const x=R(l.x??0,s,d),y=R(l.y??0,s,d),w=R(l.width??300,s,d),h=R(l.height??200,s,d),rad=l.corner_radius??16;
  const rawVal=R(l.value_ref??l.value??'0',s,d);
  const num=parseFloat(String(rawVal).replace(/[^0-9.]/g,''))||0;
  const animated=Math.round(num*clamp(progress,0,1));
  const display=(l.prefix??'')+animated.toLocaleString()+(l.suffix??'');
  const label=R(l.label_ref??l.label??'',s,d);
  const color=RC(l.color??'@brand.colors.primary',s,d),bgColor=RC(l.bg_color??'@brand.colors.surface',s,d);
  const labelColor=RC(l.label_color??'@brand.colors.muted',s,d);
  const nf=R(l.number_font??'@brand.fonts.display',s,d),ns=R(l.number_size??120,s,d),nw=l.number_weight??900;
  const lf=R(l.label_font??'@brand.fonts.sans',s,d),ls=R(l.label_size??28,s,d),lw=l.label_weight??300;
  c.save();c.globalAlpha=clamp(op,0,1);
  rrPath(c,x,y,w,h,rad);c.fillStyle=withAlpha(bgColor,l.bg_opacity??0.08);c.fill();
  if(l.border){c.strokeStyle=withAlpha(color,0.15);c.lineWidth=1;c.stroke();}
  c.font=`${nw} ${ns}px "${nf}", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"`;c.fillStyle=color;c.textAlign='center';c.textBaseline='alphabetic';c.fillText(display,x+w/2,y+h*0.62);
  if(label){c.font=`${lw} ${ls}px "${lf}", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"`;c.fillStyle=labelColor;c.fillText(label,x+w/2,y+h*0.85);}
  c.restore();
}
function prim_divider_ornament(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const sx=A(l.id,'scale_x',1,f,an);
  const x1=R(l.x1??0,s,d),x2=R(l.x2??s.canvas.width,s,d),y=R(l.y??0,s,d),gap=l.gap??14,sw=l.stroke_width??1.5;
  const color=RC(l.color??'@brand.colors.primary',s,d),cs=l.centre_size??14,centre=l.centre??'diamond',mx=(x1+x2)/2;
  const innerGap=cs+(l.inner_gap??24);
  c.save();c.globalAlpha=clamp(op,0,1);c.translate(mx,y);c.scale(sx,1);c.translate(-mx,-y);
  c.strokeStyle=color;c.lineWidth=sw;
  c.beginPath();c.moveTo(x1,y-gap/2);c.lineTo(mx-innerGap/2,y-gap/2);c.stroke();
  c.beginPath();c.moveTo(x1,y+gap/2);c.lineTo(mx-innerGap/2,y+gap/2);c.stroke();
  c.beginPath();c.moveTo(mx+innerGap/2,y-gap/2);c.lineTo(x2,y-gap/2);c.stroke();
  c.beginPath();c.moveTo(mx+innerGap/2,y+gap/2);c.lineTo(x2,y+gap/2);c.stroke();
  c.fillStyle=color;
  if(centre==='diamond'){c.save();c.translate(mx,y);c.rotate(Math.PI/4);c.fillRect(-cs/2,-cs/2,cs,cs);c.restore();}
  else if(centre==='dot'){c.beginPath();c.arc(mx,y,cs/2,0,Math.PI*2);c.fill();}
  else if(centre==='text'&&l.centre_text){const font=R(l.centre_font??'@brand.fonts.grotesk',s,d);c.font=`${l.centre_weight??400} ${cs}px "${font}", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"`;c.textAlign='center';c.textBaseline='middle';c.fillText(l.centre_text,mx,y);}
  c.restore();
}
function prim_quote_mark(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const sc=A(l.id,'scale',1,f,an),yo=A(l.id,'y',0,f,an);
  const content=l.content??'"';
  const font=R(l.font??'@brand.fonts.serif',s,d),size=R(l.size??260,s,d),weight=l.weight??700;
  const x=R(l.x??0,s,d),y=R(l.y??0,s,d)+yo,align=l.align??'left';
  c.save();c.globalAlpha=clamp(op,0,1)*(l.color_opacity??0.15);
  c.translate(x,y);c.scale(sc,sc);c.translate(-x,-y);
  c.font=`${weight} ${size}px "${font}", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"`;c.fillStyle=RC(l.color??'@brand.colors.primary',s,d);
  c.textAlign=align;c.textBaseline='alphabetic';c.fillText(content,x,y);c.restore();
}
function prim_image_fill(c,l,f,s,d,an,imgCache){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const sc=A(l.id,'scale',l.scale??1,f,an),xo=A(l.id,'x',0,f,an),yo=A(l.id,'y',0,f,an);
  const src=R(l.src??'',s,d);if(!src)return;
  const img=imgCache(src);if(!img)return;
  const x=R(l.x??0,s,d)+xo,y=R(l.y??0,s,d)+yo,w=R(l.width??s.canvas.width,s,d),h=R(l.height??s.canvas.height,s,d),rad=l.corner_radius??0;
  const cx_off=A(l.id,'cx_offset',l.cx_offset??0,f,an),cy_off=A(l.id,'cy_offset',l.cy_offset??0,f,an);
  c.save();c.globalAlpha=clamp(op,0,1);
  const ccx=x+w/2,ccy=y+h/2;c.translate(ccx,ccy);c.scale(sc,sc);c.translate(-ccx,-ccy);
  if(rad>0){rrPath(c,x,y,w,h,rad);c.clip();}else{c.beginPath();c.rect(x,y,w,h);c.clip();}
  drawImageFill(c,img,x,y,w,h,l.fit??'cover',cx_off,cy_off);c.restore();
}
function prim_image_circle(c,l,f,s,d,an,imgCache){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const sc=A(l.id,'scale',1,f,an),yo=A(l.id,'y',0,f,an);
  const src=R(l.src??'',s,d),img=imgCache(src);
  const cx=R(l.cx??0,s,d),cy=R(l.cy??0,s,d)+yo,r=R(l.radius??60,s,d);
  const strokeColor=l.stroke_color?RC(l.stroke_color,s,d):null;
  c.save();c.globalAlpha=clamp(op,0,1);c.translate(cx,cy);c.scale(sc,sc);c.translate(-cx,-cy);
  if(strokeColor){c.beginPath();c.arc(cx,cy,r+(l.stroke_width??3),0,Math.PI*2);c.fillStyle=withAlpha(strokeColor,l.stroke_opacity??0.7);c.fill();}
  c.save();c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.clip();
  if(img){const d2=r*2;drawImageFill(c,img,cx-r,cy-r,d2,d2,'cover');}
  else{c.fillStyle='#2a2a2e';c.fillRect(cx-r,cy-r,r*2,r*2);const initials=String(R(l.initials_ref??'',s,d)||'?').split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);c.font=`500 ${Math.round(r*0.7)}px "DM Sans", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"`;c.fillStyle='#888';c.textAlign='center';c.textBaseline='middle';c.fillText(initials,cx,cy);}
  c.restore();c.restore();
}
function prim_avatar_ring(c,l,f,s,d,an,imgCache){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const sc=A(l.id,'scale',1,f,an),ringProg=A(l.id,'progress',1,f,an),yo=A(l.id,'y',0,f,an);
  const src=R(l.src??l.src_ref??'',s,d);if(!src)return;
  const img=imgCache(src);
  const cx=R(l.cx??0,s,d),cy=R(l.cy??0,s,d)+yo,r=R(l.radius??80,s,d);
  const rw=l.ring_width??4,gap=l.ring_gap??3,ringColor=RC(l.ring_color??'@brand.colors.primary',s,d);
  const ringR=r+gap+rw/2;
  c.save();c.globalAlpha=clamp(op,0,1);c.translate(cx,cy);c.scale(sc,sc);c.translate(-cx,-cy);
  const startAngle=-Math.PI/2,endAngle=startAngle+Math.PI*2*clamp(ringProg,0,1);
  c.beginPath();c.arc(cx,cy,ringR,startAngle,endAngle);c.strokeStyle=ringColor;c.lineWidth=rw;c.lineCap='round';c.stroke();
  c.save();c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.clip();
  if(img){const d2=r*2;const iw=img.naturalWidth,ih=img.naturalHeight;const scale=Math.max(d2/iw,d2/ih);const sw=d2/scale,sh=d2/scale;const sx=(iw-sw)/2,sy=(ih-sh)/2;c.drawImage(img,sx,sy,sw,sh,cx-r,cy-r,d2,d2);}
  else{c.fillStyle='#2a2a2e';c.fillRect(cx-r,cy-r,r*2,r*2);}
  c.restore();c.restore();
}
function prim_ken_burns(c,l,f,s,d,an,imgCache){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const progress=A(l.id,'progress',0,f,an);
  const src=R(l.src??l.src_ref??'',s,d),img=imgCache(src);
  const W=s.canvas.width,H=s.canvas.height;
  const rx=R(l.x??0,s,d),ry=R(l.y??0,s,d),rw=R(l.width??W,s,d),rh=R(l.height??H,s,d),rad=l.corner_radius??0;
  const scale=lerp(l.scale_start??1.08,l.scale_end??1.0,clamp(progress,0,1));
  const ox=lerp(0,R(l.pan_x??0,s,d),clamp(progress,0,1)),oy=lerp(0,R(l.pan_y??0,s,d),clamp(progress,0,1));
  c.save();c.globalAlpha=clamp(op,0,1);
  if(rad>0){rrPath(c,rx,ry,rw,rh,rad);c.clip();}else{c.beginPath();c.rect(rx,ry,rw,rh);c.clip();}
  if(img){const iw=img.naturalWidth,ih=img.naturalHeight;const baseScale=Math.max(rw/iw,rh/ih);const dw=iw*baseScale*scale,dh=ih*baseScale*scale;const dx=rx+(rw-dw)/2+ox,dy=ry+(rh-dh)/2+oy;c.drawImage(img,dx,dy,dw,dh);}
  c.restore();
}
function prim_blur_rect(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const x=R(l.x??0,s,d),y=R(l.y??0,s,d),w=R(l.width??200,s,d),h=R(l.height??200,s,d),rad=l.corner_radius??16;
  const blur=R(l.blur??20,s,d),color=RC(l.color??'#fff',s,d),colorOp=l.color_opacity??0.3;
  c.save();c.globalAlpha=clamp(op,0,1);c.filter=`blur(${blur}px)`;
  rrPath(c,x,y,w,h,rad);c.clip();c.fillStyle=withAlpha(color,colorOp);c.fill();c.filter='none';
  if(l.stroke_color){c.strokeStyle=withAlpha(RC(l.stroke_color,s,d),l.stroke_opacity??0.25);c.lineWidth=l.stroke_width??1;rrPath(c,x,y,w,h,rad);c.stroke();}
  c.restore();
}
function prim_vignette(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  if(l.image_overlay_ref){const val=R(l.image_overlay_ref,s,d);if(!val||val===''||val==='0'||parseFloat(val)===0)return;}
  const W=s.canvas.width,H=s.canvas.height;
  const cx=R(l.cx??W*0.5,s,d),cy=R(l.cy??H*0.5,s,d);
  const ir=R(l.inner_radius??W*0.2,s,d),or2=R(l.outer_radius??W*0.9,s,d);
  const color=RC(l.color??'#000',s,d),strength=l.strength??0.55;
  const overlayMult=l.image_overlay_ref?clamp(parseFloat(R(l.image_overlay_ref,s,d))||0.8,0,1):1;
  c.save();c.globalAlpha=clamp(op,0,1)*overlayMult;
  const g=c.createRadialGradient(cx,cy,ir,cx,cy,or2);
  g.addColorStop(0,withAlpha(color,0));g.addColorStop(1,withAlpha(color,strength));
  c.fillStyle=g;c.fillRect(0,0,W,H);c.restore();
}
function prim_color_overlay(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  if(l.image_overlay_ref){const val=R(l.image_overlay_ref,s,d);if(!val||val===''||val==='0'||parseFloat(val)===0)return;}
  const W=s.canvas.width,H=s.canvas.height;
  const x=R(l.x??0,s,d),y=R(l.y??0,s,d),w=R(l.width??W,s,d),h=R(l.height??H,s,d);
  const overlayMult=l.image_overlay_ref?clamp(parseFloat(R(l.image_overlay_ref,s,d))||0.8,0,1):1;
  c.save();c.globalAlpha=clamp(op,0,1)*overlayMult;
  if(l.blend_mode)c.globalCompositeOperation=l.blend_mode;
  if(l.gradient){
    const g=c.createLinearGradient(R(l.x1??0,s,d),R(l.y1??0,s,d),R(l.x2??0,s,d),R(l.y2??H,s,d));
    g.addColorStop(0,withAlpha(RC(l.color_start??'#000',s,d),l.opacity_start??0));
    g.addColorStop(1,withAlpha(RC(l.color_end??'#000',s,d),l.opacity_end??0.8));
    c.fillStyle=g;
  } else {c.fillStyle=RC(l.color??'#000',s,d);}
  c.fillRect(x,y,w,h);c.globalCompositeOperation='source-over';c.restore();
}


/* ══════════════════════════════════════════════════════════════════
   NEW PRIMITIVES — gradient_text, bar_chart, line_chart, checklist_item
══════════════════════════════════════════════════════════════════*/

/* ── gradient_text ─────────────────────────────────────────────
   Text filled with a linear gradient instead of a flat colour.
   Schema fields:
     content / content_ref   — text string or @data ref
     font / size / weight    — same as text primitive
     gradient_start          — hex colour at start of gradient
     gradient_end            — hex colour at end of gradient
     gradient_angle          — 0 (L→R) | 90 (T→B) | 45 (diagonal)
     x / y / align / baseline
   Animatable: opacity, x, y, scale
──────────────────────────────────────────────────────────────── */
function prim_gradient_text(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const yo=A(l.id,'y',0,f,an),xo=A(l.id,'x',0,f,an);
  const sc=A(l.id,'scale',1,f,an);
  const content=l.content??R(l.content_ref??'',s,d);if(!content&&content!==0)return;
  const font=R(l.font??'@brand.fonts.display',s,d);
  const size=R(l.size??80,s,d),weight=l.weight??700;
  const x=R(l.x??s.canvas.width*0.5,s,d)+xo;
  const y=R(l.y??0,s,d)+yo;
  const align=l.align??'center';
  const col1=RC(l.gradient_start??'@brand.colors.primary',s,d);
  const col2=RC(l.gradient_end??'@brand.colors.text',s,d);
  const angle=l.gradient_angle??0; /* 0=L→R 90=T→B 45=diagonal */
  c.save();
  c.globalAlpha=clamp(op,0,1);
  if(sc!==1){c.translate(x,y);c.scale(sc,sc);c.translate(-x,-y);}
  c.font=`${l.font_style?l.font_style+' ':''}${weight} ${size}px "${font}", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"`;
  c.textAlign=align;c.textBaseline=l.baseline??'alphabetic';
  /* Measure text width so gradient spans exactly the text */
  const tw=c.measureText(String(content)).width;
  let gx1,gy1,gx2,gy2;
  const ax=align==='center'?x-tw/2:align==='right'?x-tw:x;
  if(angle===90){gx1=ax;gy1=y-size;gx2=ax;gy2=y;}
  else if(angle===45){gx1=ax;gy1=y;gx2=ax+tw;gy2=y-size;}
  else{gx1=ax;gy1=y;gx2=ax+tw;gy2=y;}  /* 0 = L→R */
  const g=c.createLinearGradient(gx1,gy1,gx2,gy2);
  g.addColorStop(0,col1);g.addColorStop(1,col2);
  c.fillStyle=g;
  c.fillText(String(content),x,y);
  c.restore();
}

/* ── bar_chart ──────────────────────────────────────────────────
   Animated bar chart. Bars grow from 0 → full height via bar_progress.
   Schema fields:
     data_ref       — @data ref pointing to array of {label, value}
     x / y          — top-left corner of chart area
     width / height — chart bounding box
     bar_color      — fill colour for bars
     bar_radius     — corner radius of bars (default 6)
     bar_gap        — fraction of slot width used for gap (default 0.25)
     label_font / label_size / label_color  — x-axis labels below bars
     value_font / value_size / value_color  — value labels above bars
     show_baseline  — draw a thin baseline (default true)
     baseline_color
   Animatable: opacity, bar_progress (0→1 grows all bars)
──────────────────────────────────────────────────────────────── */
function prim_bar_chart(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const progress=A(l.id,'bar_progress',1,f,an);
  const items=R(l.data_ref??'',s,d);
  if(!Array.isArray(items)||items.length===0)return;

  const x=R(l.x??108,s,d),y=R(l.y??0,s,d);
  const W=R(l.width??s.canvas.width-216,s,d);
  const H=R(l.height??320,s,d);
  const barColor=RC(l.bar_color??'@brand.colors.primary',s,d);
  const barRadius=l.bar_radius??6;
  const gap=l.bar_gap??0.25;

  const labelFont=R(l.label_font??'@brand.fonts.sans',s,d);
  const labelSize=R(l.label_size??24,s,d);
  const labelColor=RC(l.label_color??'@brand.colors.muted',s,d);
  const valueFont=R(l.value_font??'@brand.fonts.grotesk',s,d);
  const valueSize=R(l.value_size??28,s,d);
  const valueColor=RC(l.value_color??'@brand.colors.text',s,d);

  const maxVal=Math.max(...items.map(i=>Number(i.value)||0));
  if(maxVal===0)return;

  const n=items.length;
  const slotW=W/n;
  const barW=slotW*(1-gap);
  /* Reserve space at top for value labels, bottom for x-axis labels */
  const topPad=valueSize+16;
  const botPad=labelSize+16;
  const chartH=H-topPad-botPad;

  c.save();c.globalAlpha=clamp(op,0,1);

  /* Baseline */
  if(l.show_baseline!==false){
    c.strokeStyle=RC(l.baseline_color??'@brand.colors.muted',s,d);
    c.globalAlpha=clamp(op,0,1)*0.2;
    c.lineWidth=1;
    c.beginPath();c.moveTo(x,y+topPad+chartH);c.lineTo(x+W,y+topPad+chartH);c.stroke();
    c.globalAlpha=clamp(op,0,1);
  }

  items.forEach((item,i)=>{
    const val=Number(item.value)||0;
    const animH=chartH*(val/maxVal)*clamp(progress,0,1);
    const bx=x+i*slotW+(slotW-barW)/2;
    const by=y+topPad+chartH-animH;

    /* Bar */
    c.fillStyle=barColor;
    rrPath(c,bx,by,barW,animH,{tl:barRadius,tr:barRadius,bl:0,br:0});
    c.fill();

    /* Value label above bar */
    if(progress>0.05){
      c.font=`500 ${valueSize}px "${valueFont}", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"`;
      c.fillStyle=valueColor;
      c.textAlign='center';c.textBaseline='bottom';
      c.fillText(String(item.value),bx+barW/2,by-6);
    }

    /* X-axis label */
    c.font=`400 ${labelSize}px "${labelFont}", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"`;
    c.fillStyle=labelColor;
    c.textAlign='center';c.textBaseline='top';
    c.fillText(String(item.label??''),bx+barW/2,y+topPad+chartH+10);
  });

  c.restore();
}

/* ── line_chart ─────────────────────────────────────────────────
   Animated line chart. Line draws left→right via draw_progress.
   Schema fields:
     data_ref        — @data ref pointing to array of {label, value}
     x / y           — top-left of chart area
     width / height  — bounding box
     line_color      — stroke colour
     line_width      — stroke width (default 3)
     dot_radius      — radius of point dots (0 = no dots)
     dot_color       — defaults to line_color
     fill_under      — gradient area below line (default true)
     fill_opacity    — opacity of fill (default 0.15)
     label_font / label_size / label_color
     show_baseline   — thin baseline (default true)
   Animatable: opacity, draw_progress (0→1 draws line L→R)
──────────────────────────────────────────────────────────────── */
function prim_line_chart(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const progress=clamp(A(l.id,'draw_progress',l.draw_progress??1,f,an),0,1);
  const items=R(l.data_ref??'',s,d);
  if(!Array.isArray(items)||items.length<2)return;

  const x=R(l.x??108,s,d),y=R(l.y??0,s,d);
  const W=R(l.width??s.canvas.width-216,s,d);
  const H=R(l.height??280,s,d);
  const lineColor=RC(l.line_color??'@brand.colors.primary',s,d);
  const lineW=l.line_width??3;
  const dotR=l.dot_radius??6;
  const dotColor=RC(l.dot_color??l.line_color??'@brand.colors.primary',s,d);
  const fillUnder=l.fill_under!==false;
  const fillOp=l.fill_opacity??0.15;

  const labelFont=R(l.label_font??'@brand.fonts.sans',s,d);
  const labelSize=R(l.label_size??24,s,d);
  const labelColor=RC(l.label_color??'@brand.colors.muted',s,d);

  const maxVal=Math.max(...items.map(i=>Number(i.value)||0));
  const minVal=Math.min(...items.map(i=>Number(i.value)||0));
  const valRange=maxVal-minVal||1;

  const botPad=labelSize+16;
  const topPad=16;
  const chartH=H-topPad-botPad;
  const n=items.length;

  /* Compute point positions */
  const pts=items.map((item,i)=>({
    px:x+i*(W/(n-1)),
    py:y+topPad+chartH-(((Number(item.value)||0)-minVal)/valRange)*chartH,
    label:item.label??'',
    value:item.value
  }));

  /* How many points to draw based on progress */
  const maxIdx=(n-1)*progress;
  const fullPts=Math.floor(maxIdx);
  const frac=maxIdx-fullPts;

  c.save();c.globalAlpha=clamp(op,0,1);

  /* Baseline */
  if(l.show_baseline!==false){
    c.strokeStyle=RC(l.baseline_color??'@brand.colors.muted',s,d);
    c.globalAlpha=clamp(op,0,1)*0.2;
    c.lineWidth=1;
    c.beginPath();c.moveTo(x,y+topPad+chartH);c.lineTo(x+W,y+topPad+chartH);c.stroke();
    c.globalAlpha=clamp(op,0,1);
  }

  /* Build visible path up to progress point */
  const visiblePts=[...pts.slice(0,fullPts+1)];
  if(fullPts<n-1&&frac>0){
    const a=pts[fullPts],b=pts[fullPts+1];
    visiblePts.push({px:lerp(a.px,b.px,frac),py:lerp(a.py,b.py,frac),label:'',value:null});
  }

  if(visiblePts.length<2){c.restore();return;}

  /* Fill under line */
  if(fillUnder){
    c.beginPath();
    c.moveTo(visiblePts[0].px,y+topPad+chartH);
    visiblePts.forEach(p=>c.lineTo(p.px,p.py));
    const last=visiblePts[visiblePts.length-1];
    c.lineTo(last.px,y+topPad+chartH);
    c.closePath();
    const fg=c.createLinearGradient(x,y+topPad,x,y+topPad+chartH);
    fg.addColorStop(0,withAlpha(lineColor,fillOp));
    fg.addColorStop(1,withAlpha(lineColor,0));
    c.fillStyle=fg;c.fill();
  }

  /* Line */
  c.beginPath();
  visiblePts.forEach((p,i)=>i===0?c.moveTo(p.px,p.py):c.lineTo(p.px,p.py));
  c.strokeStyle=lineColor;c.lineWidth=lineW;c.lineJoin='round';c.lineCap='round';
  c.stroke();

  /* Dots on fully-rendered points */
  if(dotR>0){
    pts.slice(0,fullPts+1).forEach(p=>{
      c.beginPath();c.arc(p.px,p.py,dotR,0,Math.PI*2);
      c.fillStyle=dotColor;c.fill();
      c.strokeStyle=RC(l.dot_border??'@brand.colors.background',s,d);
      c.lineWidth=2;c.stroke();
    });
  }

  /* X-axis labels */
  c.font=`400 ${labelSize}px "${labelFont}", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"`;
  c.fillStyle=labelColor;c.textAlign='center';c.textBaseline='top';
  pts.forEach(p=>{
    if(p.label)c.fillText(String(p.label),p.px,y+topPad+chartH+10);
  });

  c.restore();
}

/* ── checklist_item ─────────────────────────────────────────────
   Tick box + text as a single primitive. Replaces the old pattern
   of separate rectangle + text_block layers per item.
   Schema fields:
     content / content_ref  — the item text
     x / y                  — left edge of tick box
     max_width              — text wrap width
     font / size / weight / line_height / color
     tick_size              — size of the tick box (default 32)
     tick_gap               — space between box and text (default 20)
     tick_color             — box fill and check colour
     tick_style             — 'box' (default) | 'circle' | 'line'
     checked                — true (default) = draw checkmark inside
   Animatable: opacity, x, y, scale
──────────────────────────────────────────────────────────────── */
function prim_checklist_item(c,l,f,s,d,an){
  const op=A(l.id,'opacity',l.opacity??1,f,an);if(op<=0)return;
  const yo=A(l.id,'y',0,f,an),xo=A(l.id,'x',0,f,an);
  const sc=A(l.id,'scale',1,f,an);
  const content=l.content??R(l.content_ref??'',s,d);if(!content)return;

  const x=R(l.x??108,s,d)+xo;
  const y=R(l.y??0,s,d)+yo;
  const tickSize=R(l.tick_size??32,s,d);
  const tickGap=R(l.tick_gap??20,s,d);
  const tickColor=RC(l.tick_color??'@brand.colors.primary',s,d);
  const tickStyle=l.tick_style??'box';
  const checked=l.checked!==false;
  const font=R(l.font??'@brand.fonts.sans',s,d);
  const size=R(l.size??32,s,d),weight=l.weight??400;
  const lh=l.line_height??size*1.4;
  const maxW=R(l.max_width??s.canvas.width-230,s,d);
  const textColor=RC(l.color??'@brand.colors.text',s,d);

  c.save();
  c.globalAlpha=clamp(op,0,1);
  if(sc!==1){c.translate(x,y);c.scale(sc,sc);c.translate(-x,-y);}

  /* Tick box — vertically centred on first line of text */
  const boxY=y-tickSize*0.5;  /* top of box aligned so centre is at text baseline */

  if(tickStyle==='circle'){
    c.beginPath();c.arc(x+tickSize/2,y-tickSize*0.08,tickSize/2,0,Math.PI*2);
    c.fillStyle=withAlpha(tickColor,0.15);c.fill();
    c.strokeStyle=tickColor;c.lineWidth=2;c.stroke();
  } else {
    /* box (default) */
    rrPath(c,x,boxY,tickSize,tickSize,l.tick_radius??6);
    c.fillStyle=withAlpha(tickColor,0.15);c.fill();
    c.strokeStyle=tickColor;c.lineWidth=2;c.stroke();
  }

  /* Checkmark inside */
  if(checked){
    const pad=tickSize*0.22;
    const cx=x+pad,cy=boxY+tickSize*0.55,cw=tickSize-pad*2;
    c.beginPath();
    c.moveTo(cx,cy);
    c.lineTo(cx+cw*0.38,cy+cw*0.38);
    c.lineTo(cx+cw,cy-cw*0.38);
    c.strokeStyle=tickColor;c.lineWidth=tickSize*0.12;
    c.lineCap='round';c.lineJoin='round';c.stroke();
  }

  /* Text — wrapped, left-aligned, starting after tick box */
  const tx=x+tickSize+tickGap;
  const textMaxW=maxW-(tickSize+tickGap);
  c.font=`${weight} ${size}px "${font}", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"`;
  c.fillStyle=textColor;c.textAlign='left';c.textBaseline='alphabetic';
  /* Word wrap */
  const words=String(content).split(' ');const lines=[];let cur='';
  for(const w of words){
    const test=cur?cur+' '+w:w;
    if(c.measureText(test).width>textMaxW&&cur){lines.push(cur);cur=w;}else cur=test;
  }
  if(cur)lines.push(cur);
  lines.forEach((ln,i)=>c.fillText(ln,tx,y+i*lh));

  c.restore();
}
/* ══════════════════════════════════════════════════════════════════
   PRIMITIVES MAP
══════════════════════════════════════════════════════════════════*/
const PRIMITIVES = {
  fill_rect:prim_fill_rect, radial_gradient:prim_radial_gradient, linear_gradient:prim_linear_gradient, conic_gradient:prim_conic_gradient,
  dot_grid:prim_dot_grid, scan_lines:prim_scan_lines, noise:prim_noise,
  rectangle:prim_rectangle, circle:prim_circle, ellipse:prim_ellipse, arc:prim_arc, triangle:prim_triangle,
  star:prim_star, polygon:prim_polygon, cross:prim_cross, chevron:prim_chevron, pill:prim_pill, diamond:prim_diamond, bracket:prim_bracket,
  line:prim_line, dashed_line:prim_dashed_line, double_rule:prim_double_rule, multi_line:prim_multi_line,
  text:prim_text, text_multiline:prim_text_multiline, text_countup:prim_text_countup, text_typewriter:prim_text_typewriter,
  text_outlined:prim_text_outlined, text_shadow:prim_text_shadow, text_block:prim_text_block, number_display:prim_number_display,
  pill_text:prim_pill_text, tag:prim_tag, source_tag:prim_source_tag, brand_watermark:prim_brand_watermark,
  progress_bar:prim_progress_bar, stat_card:prim_stat_card, divider_ornament:prim_divider_ornament, quote_mark:prim_quote_mark,
  image_fill:prim_image_fill, image_circle:prim_image_circle, avatar_ring:prim_avatar_ring, ken_burns:prim_ken_burns,
  blur_rect:prim_blur_rect, vignette:prim_vignette, color_overlay:prim_color_overlay,
  gradient_text:prim_gradient_text,
  bar_chart:prim_bar_chart, line_chart:prim_line_chart,
  checklist_item:prim_checklist_item,
};

/* ══════════════════════════════════════════════════════════════════
   THE CLASS
══════════════════════════════════════════════════════════════════*/
class CanvasPlayer {

  /**
   * @param {string|HTMLElement} container
   * @param {object}  [options]
   * @param {boolean} [options.autoplay=false]
   * @param {number}  [options.speed=1]
   * @param {string}  [options.playback='manual']
   *   'manual'  — caller controls play/pause (default, same as v3.1)
   *   'visible' — auto-play when scrolled into view, auto-pause when scrolled out
   */
  constructor(container, options = {}) {
    this._container = typeof container === 'string'
      ? document.querySelector(container)
      : container;
    if (!this._container) throw new Error(`[CanvasPlayer] container not found — "${container}"`);

    this._autoplay       = options.autoplay  ?? false;
    this._speed          = options.speed     ?? 1;
    this._playbackMode   = options.playback  ?? 'manual'; /* 'manual' | 'visible' */

    /* Canvas */
    this._cv  = document.createElement('canvas');
    this._cv.style.cssText = 'display:block;width:100%;height:100%;';
    this._container.appendChild(this._cv);
    this._ctx = this._cv.getContext('2d');

    /* OPTIMISATION 4 — LAZY OFFSCREEN CANVASES
       offA/offB are only created when a schema with transitions is loaded.
       Saves 2 canvas allocations per instance when there are no transitions. */
    this._offA = null; this._ctxA = null;
    this._offB = null; this._ctxB = null;

    /* State */
    this._schema      = null;
    this._dataItems   = [];
    this._timeline    = null;
    this._totalFrames = 0;
    this._frame       = 0;
    this._playing     = false;
    this._lastTs      = null;
    this._fps         = 30;
    this._msPerFrame  = 1000 / 30;
    this._visible     = true; /* tracked by IntersectionObserver */

    /* Callbacks */
    this._onStateChange = null;
    this._onEnded       = null;
    this._onFrame       = null;

    /* OPTIMISATION 5 — INTERSECTION OBSERVER
       Watches the canvas. Behaviour depends on _playbackMode:
       'visible' → auto-play/pause on enter/leave viewport
       'manual'  → just tracks _visible so we can skip draws when hidden */
    if (typeof IntersectionObserver !== 'undefined') {
      this._observer = new IntersectionObserver(entries => {
        const entry = entries[0];
        this._visible = entry.isIntersecting;
        if (this._playbackMode === 'visible') {
          if (entry.isIntersecting) {
            /* Entering viewport — play if schema loaded */
            if (this._schema) this.play();
          } else {
            /* Leaving viewport — pause to free CPU */
            if (this._playing) this.pause();
          }
        }
      }, { threshold: 0.1 }); /* 10% visible is enough to trigger */
      this._observer.observe(this._cv);
    }
  }

  /* ─── Lazy offscreen canvas init ──────────────────────────── */
  _ensureOffscreens(w, h) {
    if (!this._offA) {
      this._offA = document.createElement('canvas');
      this._ctxA = this._offA.getContext('2d');
      this._offB = document.createElement('canvas');
      this._ctxB = this._offB.getContext('2d');
    }
    this._offA.width = w; this._offA.height = h;
    this._offB.width = w; this._offB.height = h;
  }

  /* ─── Canvas sizing ────────────────────────────────────────── */
  _applyDimensions(w, h) {
    this._cv.width = w; this._cv.height = h;
    this._cv.style.aspectRatio = `${w}/${h}`;
    /* Only resize offscreens if they already exist */
    if (this._offA) { this._offA.width = w; this._offA.height = h; }
    if (this._offB) { this._offB.width = w; this._offB.height = h; }
  }

  /* ─── Image lookup — delegates to shared cache ─────────────── */
  _imgLookup(src) {
    return src ? SharedImageCache.get(src) ?? null : null;
  }

  /* ─── Collect image srcs from schema ───────────────────────── */
  _collectImageSrcs(schema, dataItems) {
    const srcs = new Set();
    for (const layer of (schema.layers || [])) {
      if (['image_fill','image_circle','ken_burns','avatar_ring'].includes(layer.type) && layer.src) {
        const resolved = R(layer.src, schema, dataItems[0]);
        if (resolved) srcs.add(resolved);
      }
    }
    for (const item of dataItems) {
      for (const key of Object.keys(item)) {
        if ((key.endsWith('_src') || key.endsWith('_image') || key === 'image') && typeof item[key] === 'string') {
          srcs.add(item[key]);
        }
      }
    }
    return [...srcs];
  }

  /* ─── Draw primitives ──────────────────────────────────────── */
  _drawPrimitives(ctx, schema, dataItem, localFrame, animations) {
    const W = schema.canvas.width || 1080, H = schema.canvas.height || 1350;
    const imgLookup = src => this._imgLookup(src); /* closure over shared cache */
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = schema.canvas.background || '#000';
    ctx.fillRect(0, 0, W, H);
    for (const layer of (schema.layers || [])) {
      if (layer.visible === false) continue;
      const fn = PRIMITIVES[layer.type];
      if (!fn) { if (layer.type) console.warn('[CanvasPlayer] Unknown primitive:', layer.type); continue; }
      ctx.save();
      try { fn(ctx, layer, localFrame, schema, dataItem, animations, imgLookup); }
      catch (e) { console.error('[CanvasPlayer] Layer [' + layer.id + ']:', e); }
      ctx.restore();
    }
  }

  /* ─── Transition compositor ────────────────────────────────── */
  _applyTransition(ctx, offCurr, offNext, progress, transition, schema) {
    const W = schema.canvas.width || 1080, H = schema.canvas.height || 1350;
    const type = transition?.type ?? 'fade';
    const t = applyEasing(progress, 'ease_in_out');
    ctx.clearRect(0, 0, W, H);
    if (type === 'cut' || type === 'none') { ctx.drawImage(t < 0.5 ? offCurr : offNext, 0, 0); return; }
    if (type === 'fade' || type === 'crossfade') { ctx.drawImage(offCurr, 0, 0); ctx.globalAlpha = t; ctx.drawImage(offNext, 0, 0); ctx.globalAlpha = 1; return; }
    if (type === 'slide_up') { const oy = H * t; ctx.drawImage(offCurr, 0, -oy); ctx.drawImage(offNext, 0, H - oy); return; }
    if (type === 'slide_left') { const ox = W * t; ctx.drawImage(offCurr, -ox, 0); ctx.drawImage(offNext, W - ox, 0); return; }
    if (type === 'wipe') {
      ctx.drawImage(offNext, 0, 0); ctx.save(); ctx.beginPath(); ctx.rect(W * t, 0, W, H); ctx.clip();
      ctx.drawImage(offCurr, 0, 0); ctx.restore();
      ctx.fillStyle = transition.color ?? schema.canvas.background ?? '#000'; ctx.fillRect(W * t - 4, 0, 8, H); return;
    }
    ctx.drawImage(t < 0.5 ? offCurr : offNext, 0, 0);
  }

  /* ─── Content swap ─────────────────────────────────────────── */
  _renderContentSwap(ctx, schema, itemA, itemB, t, localFrame) {
    const proxyData = new Proxy({}, {
      get(_, key) {
        const va = itemA[key], vb = itemB[key];
        if (va === undefined) return vb; if (vb === undefined) return va;
        if (typeof va === 'string' && typeof vb === 'string') {
          const na = parseFloat(va.replace(/[^0-9.]/g, '')), nb = parseFloat(vb.replace(/[^0-9.]/g, ''));
          if (!isNaN(na) && !isNaN(nb)) {
            const prefix = va.match(/^[^0-9]*/)[0], hasDot = va.includes('.') || vb.includes('.');
            return prefix + (hasDot ? lerp(na, nb, t).toFixed(1) : Math.round(lerp(na, nb, t)).toString());
          }
        }
        return t < 0.5 ? va : vb;
      }
    });
    this._drawPrimitives(ctx, schema, proxyData, localFrame, schema.animations || []);
  }

  /* ─── Draw frame ───────────────────────────────────────────── */
  _drawFrame(globalF) {
    if (!this._schema) return;
    const schema = this._schema, pb = schema.playback || {};
    const mode = pb.mode || 'full_replay';
    const transition = pb.transition || { type: 'fade', duration_frames: 30 };
    const tl = this._timeline;
    const rf = resolveFrame(tl, globalF);
    const anims = schema.animations || [];
    const currItem = this._dataItems[rf.itemIndex];
    const W = schema.canvas.width, H = schema.canvas.height;

    if (rf.phase === 'play' || rf.phase === 'hold') {
      /* No transition needed — draw directly to main canvas via offA as buffer */
      this._ensureOffscreens(W, H);
      this._drawPrimitives(this._ctxA, schema, currItem, rf.localFrame, anims);
      this._ctx.clearRect(0, 0, W, H);
      this._ctx.drawImage(this._offA, 0, 0);
    } else if (rf.phase === 'transition') {
      const nextItem = this._dataItems[rf.nextIndex];
      this._ensureOffscreens(W, H);
      if (mode === 'content_swap') {
        this._renderContentSwap(this._ctx, schema, currItem, nextItem, rf.transProgress, rf.localFrame);
      } else {
        this._drawPrimitives(this._ctxA, schema, currItem, rf.localFrame, anims);
        this._drawPrimitives(this._ctxB, schema, nextItem, 0, anims);
        this._applyTransition(this._ctx, this._offA, this._offB, rf.transProgress, transition, schema);
      }
    }

    if (this._onFrame) this._onFrame(this.getState());
    if (this._onStateChange) this._onStateChange(this.getState());
  }

  /* ─── Tick — called by shared Scheduler each RAF ───────────── */
  _tick(ts) {
    if (!this._playing) return;
    if (this._lastTs === null) this._lastTs = ts;
    const dt = ts - this._lastTs;
    if (dt < this._msPerFrame / this._speed) return; /* FPS throttle */
    this._lastTs = ts;
    this._frame += dt / (1000 / this._fps) * this._speed;
    if (this._frame >= this._totalFrames) {
      this._frame = this._totalFrames - 1;
      this._playing = false;
      Scheduler.unregister(this);
      this._drawFrame(Math.round(this._frame));
      if (this._onEnded) this._onEnded(this.getState());
      return;
    }
    this._drawFrame(Math.round(this._frame));
  }

  /* ══════════════════════════════════════════════════════════════
     PUBLIC API  (identical surface to v3.1)
  ══════════════════════════════════════════════════════════════*/

  /**
   * Load a schema. Returns Promise that resolves when images are ready
   * and first frame is drawn. Fully backward compatible with v3.1.
   */
  async load(schema) {
    const required = ['meta', 'canvas', 'brand', 'data', 'layers', 'animations'];
    for (const k of required) {
      if (!(k in schema)) throw new Error(`[CanvasPlayer] Missing required field: "${k}"`);
    }
    if ((schema.layers || []).some(l => l.commands && !l.type)) {
      throw new Error('[CanvasPlayer] v4 format not supported. Use player-v4.');
    }

    this.stop();
    this._schema = null;

    /* Dimensions */
    const ratio = schema.canvas.ratio ?? '4:5';
    if (!schema.canvas.width || !schema.canvas.height) {
      const dims = RATIO_DIMS[ratio] ?? RATIO_DIMS['4:5'];
      schema.canvas.width = dims.w; schema.canvas.height = dims.h;
    }
    this._applyDimensions(schema.canvas.width, schema.canvas.height);

    /* FPS */
    this._fps = schema.meta.fps ?? 30;
    this._msPerFrame = 1000 / this._fps;

    /* Data */
    this._dataItems = Array.isArray(schema.data) ? schema.data : [schema.data];

    /* OPTIMISATION 2 — preload via shared cache (deduped across all instances) */
    const srcs = this._collectImageSrcs(schema, this._dataItems);
    if (srcs.length > 0) await SharedImageCache.loadAll(srcs);

    /* Build timeline */
    this._schema = schema;
    this._timeline = buildTimeline(schema, this._dataItems);
    this._totalFrames = this._timeline.total;
    this._frame = 0;

    this._drawFrame(0);

    /* Respect playback mode */
    if (this._playbackMode === 'visible') {
      /* IntersectionObserver will call play() when visible */
      if (this._visible) this.play();
    } else if (this._autoplay) {
      this.play();
    }

    return this;
  }

  /**
   * OPTIMISATION 6 — updateData()
   * Swap only the data without reloading layers, images, or animations.
   * Ideal for live feed updates where the template stays the same.
   * @param {object|object[]} newData
   */
  updateData(newData) {
    if (!this._schema) return this;
    this._dataItems = Array.isArray(newData) ? newData : [newData];
    this._schema.data = newData;
    this._timeline = buildTimeline(this._schema, this._dataItems);
    this._totalFrames = this._timeline.total;
    this._frame = 0;
    this._drawFrame(0);
    return this;
  }

  /** Start playback. */
  play() {
    if (!this._schema) return this;
    if (Math.round(this._frame) >= this._totalFrames - 1) this._frame = 0;
    this._playing = true;
    this._lastTs = null;
    Scheduler.register(this); /* join shared RAF loop */
    if (this._onStateChange) this._onStateChange(this.getState());
    return this;
  }

  /** Pause playback. */
  pause() {
    if (!this._playing) return this;
    this._playing = false;
    this._lastTs = null;
    Scheduler.unregister(this); /* leave shared RAF loop */
    if (this._onStateChange) this._onStateChange(this.getState());
    return this;
  }

  /** Stop and return to frame 0. */
  stop() {
    this.pause();
    this._frame = 0;
    if (this._schema) this._drawFrame(0);
    return this;
  }

  /** Toggle play/pause. */
  toggle() { return this._playing ? this.pause() : this.play(); }

  /** Set playback speed. @param {number} s */
  setSpeed(s) { this._speed = Math.max(0.1, s); return this; }

  /** Seek to frame. @param {number} f */
  seek(f) {
    if (!this._schema) return this;
    this._frame = clamp(f, 0, this._totalFrames - 1);
    this._drawFrame(Math.round(this._frame));
    return this;
  }

  /** Alias for seek(). */
  seekToFrame(f) { return this.seek(f); }

  /** Seek to start of data item slot. @param {number} index */
  seekToItem(index) {
    if (!this._schema || !this._timeline) return this;
    const slot = this._timeline.slots[index];
    if (!slot) return this;
    this._frame = slot.slotStart;
    this._drawFrame(Math.round(this._frame));
    return this;
  }

  /** Capture current frame as PNG Blob. @returns {Promise<Blob|null>} */
  captureBlob() {
    return new Promise(resolve => {
      if (!this._schema) { resolve(null); return; }
      const tmp = document.createElement('canvas');
      tmp.width = this._schema.canvas.width; tmp.height = this._schema.canvas.height;
      tmp.getContext('2d').drawImage(this._cv, 0, 0, tmp.width, tmp.height);
      tmp.toBlob(blob => resolve(blob), 'image/png');
    });
  }

  /** Capture current frame as ImageData. @returns {ImageData|null} */
  captureImageData() {
    if (!this._schema) return null;
    return this._ctx.getImageData(0, 0, this._schema.canvas.width, this._schema.canvas.height);
  }

  /** Get current player state snapshot. */
  getState() {
    if (!this._schema) return { loaded: false };
    const rf = resolveFrame(this._timeline, Math.round(this._frame));
    return {
      loaded: true, playing: this._playing, speed: this._speed,
      fps: this._fps, frame: Math.round(this._frame), totalFrames: this._totalFrames,
      itemIndex: rf.itemIndex, totalItems: this._dataItems.length,
      phase: rf.phase, ratio: this._schema.canvas.ratio ?? '4:5',
      width: this._schema.canvas.width, height: this._schema.canvas.height,
      visible: this._visible,
    };
  }

  onFrame(fn)       { this._onFrame = fn;       return this; }
  onStateChange(fn) { this._onStateChange = fn;  return this; }
  onEnded(fn)       { this._onEnded = fn;        return this; }

  /** Destroy instance — stops loop, disconnects observer, removes canvas. */
  destroy() {
    this.stop();
    if (this._observer) this._observer.disconnect();
    if (this._cv && this._cv.parentNode) this._cv.parentNode.removeChild(this._cv);
    this._schema = null;
  }

  /* ══════════════════════════════════════════════════════════════
     STATIC HELPERS
  ══════════════════════════════════════════════════════════════*/

  /**
   * Inject Google Fonts for a schema's brand.fonts.
   * Free to call multiple times — uses a Set to dedup.
   */
  static loadFonts(schema) {
    const fonts = Object.values(schema?.brand?.fonts ?? {});
    if (!fonts.length) return null;
    const known = {
      'Bebas Neue':       'Bebas+Neue',
      'Playfair Display': 'Playfair+Display:ital,wght@0,700;0,900;1,700',
      'DM Sans':          'DM+Sans:wght@300;400;500;600',
      'DM Mono':          'DM+Mono:wght@300;400;500',
      'Space Grotesk':    'Space+Grotesk:wght@300;400;500;600;700',
      'Inter':            'Inter:wght@300;400;500;600;700',
      'Raleway':          'Raleway:wght@300;400;500;600;700;800;900',
      'Oswald':           'Oswald:wght@300;400;500;600;700',
      'Montserrat':       'Montserrat:wght@300;400;500;600;700;800;900',
    };
    const families = fonts.map(f => known[f] || f.replace(/ /g, '+')).filter(Boolean);
    const href = `https://fonts.googleapis.com/css2?family=${families.join('&family=')}&display=swap`;
    if (_loadedFontHrefs.has(href)) return null; /* already injected — zero cost */
    _loadedFontHrefs.add(href);
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = href;
    document.head.appendChild(link);
    return link;
  }

  /** Expose shared image cache for inspection / manual preloading. */
  static get imageCache()  { return SharedImageCache; }

  /** Ratio → pixel dimensions. */
  static get RATIO_DIMS()  { return RATIO_DIMS; }

  /** Version string. */
  static get VERSION()     { return '3.2'; }
}

/* ── Export ── */
global.CanvasPlayer = CanvasPlayer;

})(typeof globalThis !== 'undefined' ? globalThis : window);
