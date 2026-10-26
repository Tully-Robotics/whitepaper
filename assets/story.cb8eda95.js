(function(){
"use strict";
const $=id=>document.getElementById(id);
const fmt=(x,d=0)=>x.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const ss=(a,b,x)=>{ const t=clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const narrow=()=>innerWidth<=820;
const secs=[...document.querySelectorAll('.sc')], NS=secs.length;
const world=$('world'), veil=$('veil');

// ---------------- one camera shot per chapter, in the machine's frame: x along its travel, y up, z across the alley (m).
// p camera, t look-at, fov, off: subject right of centre (share of the width), tod: 0 morning … 1 night,
// vs / vf: paper wash on the text side / over everything, ts: simulation speed. still: the picture used without WebGL.
// set: what stands in the scene (sets.js); orchard when left out. A set with its own camera (workers, globe, valley)
// takes p and t from it, in world coordinates. build: the machine assembles on a seamless floor, the camera turning at spin rad/s.
const SHOTS={
  hero:       {p:[5.6,1.35,0.3],  t:[0,1.65,0],     fov:46, off:.21, tod:.04, vs:1,   vf:0,   ts:1.2, still:'alley'},
  problem:    {set:'workers',                       fov:46, off:.2,  tod:.12, vs:1,   vf:.03, ts:1.5, still:'harvest'},
  solution:   {p:[5.8,2.7,5.8],   t:[0,1.5,0],      fov:32, off:.22, tod:.2,  vs:.85, vf:0,   ts:.8,  still:'hero', set:'build', spin:.1},
  team:       {p:[-7.5,4.4,0.6],  t:[3,1.2,0],      fov:40, off:.2,  tod:.3,  vs:1,   vf:.04, ts:1.5, still:'team'},
  market:     {set:'globe',                         fov:38, off:.2,  tod:.38, vs:1,   vf:0,   ts:2,   still:'alley'},
  hubs:       {set:'valley',                        fov:40, off:.2,  tod:.46, vs:1,   vf:0,   ts:1.5, still:'hive'},
  economics:  {p:[-4.6,3.5,0.8],  t:[0,1.1,0],      fov:42, off:.22, tod:.55, vs:1,   vf:.04, ts:1.5, still:'assisted'},
  investment: {p:[5.2,1.3,0.4],   t:[0,1.6,0],      fov:46, off:.2,  tod:.63, vs:1,   vf:.04, ts:1.2, still:'alley'},
  roadmap:    {p:[-12,10,-10],    t:[2,0.5,0],      fov:40, off:.2,  tod:.72, vs:1,   vf:.12, ts:2,   still:'alley'},
  competition:{p:[18,2.0,0.1],    t:[0,1.6,0],      fov:22, off:.2,  tod:.81, vs:1,   vf:.1,  ts:1.5, still:'alley'},
  validation: {p:[6,3.4,3.6],     t:[0,1.3,0],      fov:42, off:.22, tod:.93, vs:1,   vf:.06, ts:1.2, still:'night'},
  end:        {p:[7.5,4.6,0.2],   t:[0,1.2,0],      fov:42, off:.2,  tod:1,   vs:.9,  vf:0,   ts:1.2, still:'night'}};
for(const k in SHOTS){ const S=SHOTS[k]; S.set=S.set||'orchard'; if(!S.p){ S.world=true; S.p=[0,5,10]; S.t=[0,0,0]; } }
const SH=secs.map(s=>SHOTS[s.dataset.shot]);
// time of day: sky top / middle / bottom, fog, sun colour and intensity, sky light, exposure
const TOD=[
  {k:0,   top:0x86aed0, mid:0xd9e4e8, bot:0xf1e7d8, fog:0xd5dfe2, sun:0xffe2bf, si:1.9,  hi:.6,  ex:1.0},
  {k:.45, top:0x6f9fc8, mid:0xbfd6e4, bot:0xe4e8e2, fog:0xc4d6e0, sun:0xfff1dc, si:2.2,  hi:.55, ex:1.0},
  {k:.78, top:0x3d5279, mid:0xdc9c7c, bot:0xf4c995, fog:0xd9a888, sun:0xffb070, si:1.5,  hi:.4,  ex:1.05},
  {k:1,   top:0x0b1522, mid:0x1b2a3a, bot:0x121a14, fog:0x121c26, sun:0x8899bb, si:.05,  hi:.06, ex:1.25}];

// ---------------- scroll position → fractional chapter (f = i when chapter i is centred in the window)
let anchors=[], maxS=1;
function measure(){ maxS=Math.max(1,document.documentElement.scrollHeight-innerHeight);
  // a chapter rests with its text centred, or, when the text is taller than the window, with the headline just under the bar
  anchors=secs.map(s=>{ const r=s.querySelector('.panel').getBoundingClientRect(), top=r.top+scrollY, room=innerHeight-140;
    return clamp(narrow()?top-innerHeight*.36:(r.height<room?top+r.height/2-innerHeight/2-20:top-90),0,maxS); });   // phone: robot above, text below
  anchors[0]=0; anchors[NS-1]=maxS; placeStops(); if(typeof road==='function') road(); }
function fAt(y){ for(let i=0;i<NS-1;i++) if(y<anchors[i+1]) return i+clamp((y-anchors[i])/Math.max(1,anchors[i+1]-anchors[i]),0,1); return NS-1; }
const KEYS=['fov','off','tod','vs','vf','ts'];
function spun(S,now){ if(!S.spin) return S.p; const a=now/1000*S.spin, c=Math.cos(a), s=Math.sin(a); return [S.p[0]*c-S.p[2]*s,S.p[1],S.p[0]*s+S.p[2]*c]; }
// a shot in world coordinates: machine-frame shots ride along with the machine
function inWorld(S,now){ const p=spun(S,now); if(S.world) return {p:p.slice(),t:S.t.slice()};
  const H=E.H.position, D=E.DIR; return {p:[H.x+p[0]*D,H.y+p[1],H.z+p[2]],t:[H.x+S.t[0]*D,S.t[1],H.z+S.t[2]]}; }
function blend(f){ const i=Math.min(NS-2,Math.floor(f)), u=f-i, w=ss(.22,.82,u), A=SH[i], B=SH[i+1], o={A,B,w};
  for(const k of KEYS) o[k]=A[k]+(B[k]-A[k])*w;
  // from one set to another: wipe to paper, swap the set while it is covered
  o.set=(w<.5?A:B).set; if(A.set!==B.set) o.vf=Math.max(o.vf,Math.pow(Math.sin(Math.PI*w),.5));
  return o; }

// ---------------- top bar: one apple per chapter on the row, the little machine drives along it
const stops=$('row-stops');
stops.innerHTML=secs.map((s,i)=>`<button type="button" aria-label="${s.dataset.name}"><span>${s.dataset.name}</span></button>`).join('');
const stopB=[...stops.children];
stopB.forEach((b,i)=>b.addEventListener('click',()=>scrollTo({top:anchors[i],behavior:reduced?'auto':'smooth'})));
function placeStops(){ stopB.forEach((b,i)=>{ b.style.left=(anchors[i]/maxS*100)+'%'; }); }

// ---------------- headlines: split into words; a no-break space keeps "4 %" together; punctuation right after an <em> rides on the word before it
function split(el){ const out=[]; let prev=null;
  (function walk(node){ for(const n of [...node.childNodes]){
    if(n.nodeType===3){ const fr=document.createDocumentFragment(); let first=true;
      for(const p of n.textContent.split(/([ \t\n]+)/)){ if(!p) continue;
        if(/^[ \t\n]+$/.test(p)){ fr.append(' '); prev=null; }
        else if(first&&prev){ const q=document.createElement('span'); q.className='p'; q.textContent=p; prev.append(q); }
        else { const s=document.createElement('span'); s.className='w'; s.textContent=p; fr.append(s); out.push(s); prev=s; }
        first=false; }
      n.replaceWith(fr); }
    else if(n.nodeType===1) walk(n); } })(el);
  return out; }
const heads=[...document.querySelectorAll('.hv')].map(el=>({el,ws:split(el),o:[]}));
let webgl=false; try{ const c=document.createElement('canvas'); webgl=!!(c.getContext('webgl')||c.getContext('experimental-webgl')); }catch(e){}

// ---------------- scroll fill: every headline, number and [data-scrub] block fills with its position in the window
// p = 0 while its top is below the given share of the window, 1 once it has risen a further span (share of the window)
const rise=(el,from,span)=>{ const r=el.getBoundingClientRect(); return clamp((innerHeight*from-r.top)/(innerHeight*span),0,1); };
// …and never less than the chapter's own progress, so everything is complete by the time its chapter comes to rest
const chapterOf=el=>secs.indexOf(el.closest('.sc'));
const ramp=(ci,f)=>clamp((f-(ci-.6))/.52,0,1);
const scrubs=[...document.querySelectorAll('[data-scrub]')];
const nums=[...document.querySelectorAll('.num')].map(el=>({el,to:+el.dataset.to,d:+(el.dataset.dec||0),v:-1}));
const choresEl=$('chores'), chores=choresEl?[...choresEl.querySelectorAll('li')]:[], order=choresEl&&choresEl.querySelector('.order');
const hero=heads[0].el.closest('.hero'), t0=performance.now();
// the opening: the hero headline and figures fill over the first second and a half instead
const intro=now=>reduced?1:ss(0,1,(now-t0-250)/1400);
function fillWords(h,p){ const n=h.ws.length; h.ws.forEach((w,i)=>{ const o=Math.round((.13+.87*clamp(p*(n+1.2)-i,0,1))*100)/100; if(h.o[i]!==o){ h.o[i]=o; w.style.opacity=o; } }); }
heads.forEach(h=>h.ci=chapterOf(h.el)); scrubs.forEach(s=>s._ci=chapterOf(s)); nums.forEach(x=>x.ci=chapterOf(x.el));
function fill(now,f){
  const ip=intro(now), at=(el,ci,from,span)=>reduced?1:(ci===0?ip:Math.max(rise(el,from,span),ramp(ci,f)));
  for(const h of heads) fillWords(h,at(h.el,h.ci,.9,.34));
  for(const s of scrubs){ const p=Math.round(at(s,s._ci,.92,.5)*1000)/1000; if(s._p!==p){ s._p=p; s.style.setProperty('--p',p); } }
  for(const x of nums){ const p=at(x.el,x.ci,.96,.36), v=x.to*(1-(1-p)*(1-p)); if(v!==x.v){ x.v=v; x.el.textContent=fmt(v,x.d); } }
  if(trip&&trip._p!==trip._m){ trip._m=trip._p; tripMove(+trip._p||0); }
  if(!choresEl) return; const struck=Math.floor(clamp(+choresEl._p||0,0,1)*(chores.length+1)*.999);
  chores.forEach((li,i)=>li.classList.toggle('gone',i<struck)); if(order) order.classList.toggle('on',struck>=chores.length); }
if(!reduced) document.body.classList.add('scrubbing');

// ---------------- roadmap: a road through the seven years; the little machine drives it with the scroll
const trip=$('trip'), way=trip&&trip.querySelector('.way'), done=trip&&trip.querySelector('.done'), tbot=trip&&trip.querySelector('.tbot');
let tripLen=0;
function road(){ if(!trip) return; const R=trip.getBoundingClientRect(), W=R.width;
  let pts=[...trip.querySelectorAll('.node')].map(n=>{ const r=n.getBoundingClientRect(); return [r.left+r.width/2-R.left,r.top+r.height/2-R.top]; });
  // two rows: leave the first by the right-hand margin and come back into the second
  const rows=pts.some(p=>Math.abs(p[0]-pts[0][0])>4), out=[];
  pts.forEach((p,i)=>{ const q=pts[i-1]; if(rows&&q&&Math.abs(p[0]-q[0])<4&&p[1]-q[1]>30){ out.push([W+14,q[1]],[W+14,p[1]]); } out.push(p); });
  pts=out; let d=`M${pts[0][0]} ${pts[0][1]}`;
  for(let i=1;i<pts.length;i++){ const [x,y]=pts[i], n=pts[i+1], q=pts[i-1];
    if(n){ const l1=Math.hypot(x-q[0],y-q[1]), l2=Math.hypot(n[0]-x,n[1]-y), turn=Math.abs((x-q[0])*(n[1]-y)-(y-q[1])*(n[0]-x))>1, r=Math.min(24,l1/2,l2/2);
      if(turn&&l1&&l2){ d+=`L${x-(x-q[0])/l1*r} ${y-(y-q[1])/l1*r}Q${x} ${y} ${x+(n[0]-x)/l2*r} ${y+(n[1]-y)/l2*r}`; continue; } }
    d+=`L${x} ${y}`; }
  way.setAttribute('d',d); done.setAttribute('d',d); tripLen=way.getTotalLength(); trip._m=-1; }
function tripMove(p){ if(!tripLen) return; const L=tripLen*clamp(p*1.04,0,1), a=way.getPointAtLength(L), b=way.getPointAtLength(Math.min(tripLen,L+2));
  tbot.style.transform=`translate(${a.x}px,${a.y}px)${b.x<a.x-.3?' scaleX(-1)':''}`; }

// ---------------- the simulation
let E=null, live=false, T=null;
const URLS=['build/three.min.js','examples/js/controls/OrbitControls.js','examples/js/geometries/RoundedBoxGeometry.js','examples/js/environments/RoomEnvironment.js','examples/js/utils/BufferGeometryUtils.js'].map(p=>'vendor/three-0.128.0/'+p);
const load=u=>new Promise((res,rej)=>{ const s=document.createElement('script'); s.src=u; s.onload=res; s.onerror=rej; document.head.appendChild(s); });
function still(){ world.classList.add('still'); $('poster').style.backgroundImage=`url(img/${SH[Math.max(0,cur)].still}.webp)`; }
async function boot(){
  try{ for(const u of URLS) await load(u); }catch(e){ still(); return; }
  addEventListener('sim-ready',ready,{once:true});
  try{ window.__runSim(); }catch(e){ console.error(e); still(); } }
function setChk(id,v){ const e=$(id); if(e&&e.checked!==!!v){ e.checked=!!v; e.dispatchEvent(new Event('change')); } }
let base=0, carry=0, palette=null;
function ready(){ E=window.__E; T=window.THREE;
  for(const id of ['callout','camlab','insp','fov','ghost','farrow']) setChk(id,false);
  const C=E.controls; C.enabled=false; C.enableDamping=false; C.autoRotate=false; C.minDistance=0.05; C.maxDistance=400;
  E.renderer.setPixelRatio(Math.min(devicePixelRatio||1,narrow()?1:1.25)); sizeCanvas();
  const col=h=>new T.Color(h).convertSRGBToLinear();
  palette=TOD.map(k=>({k:k.k,top:col(k.top),mid:col(k.mid),bot:col(k.bot),fog:col(k.fog),sun:col(k.sun),si:k.si,hi:k.hi,ex:k.ex}));
  palette.studio={top:col(0xc9d0d4),mid:col(0xecedea)};
  try{ sets=window.__Sets(E); }catch(e){ console.error(e); sets={}; }
  for(const S of SH) if(S.world&&sets[S.set]&&sets[S.set].cam){ S.p=sets[S.set].cam.p; S.t=sets[S.set].cam.t; }
  // start a few metres into the first row and let the arms get going before anyone sees it
  window.__simHold=true; E.jumpTo(-25); let n=0;
  (function warm(){ for(let k=0;k<60;k++) E.step(0.04); if(++n<24) requestAnimationFrame(warm);
    else { E.poseUnits(); base=E.S.binnedTot; window.__simHold=false; live=true; cam.init=false; world.classList.add('live'); $('ticker').hidden=false; $('tally').hidden=false; } })(); }
function sizeCanvas(){ const cv=E.renderer.domElement, r=cv.parentElement.getBoundingClientRect(); E.renderer.setSize(r.width,r.height,false); }
function applySky(tod){ const P=palette; let i=0; while(i<P.length-2&&tod>P[i+1].k) i++; const a=P[i], b=P[i+1], w=clamp((tod-a.k)/(b.k-a.k),0,1);
  E.skyUni.top.value.copy(a.top).lerp(b.top,w); E.skyUni.mid.value.copy(a.mid).lerp(b.mid,w); E.skyUni.bot.value.copy(a.bot).lerp(b.bot,w);
  E.scene.fog.color.copy(a.fog).lerp(b.fog,w); E.sun.color.copy(a.sun).lerp(b.sun,w);
  E.sun.intensity=a.si+(b.si-a.si)*w; E.hemi.intensity=a.hi+(b.hi-a.hi)*w; E.renderer.toneMappingExposure=a.ex+(b.ex-a.ex)*w; }
// sets: orchard (the simulation as it is), workers (the orchard with people instead of the machine), build (only the
// machine and its docked bin unit on a seamless floor), globe and valley (only their own model under the sky)
let sets={};
const st={prev:new Map(),floor:null,name:'orchard'};
const isSky=c=>!!(c.geometry&&c.geometry.type==='SphereGeometry'&&c.material&&c.material.uniforms);
const carOf=c=>E.CARS.find(car=>car.g===c);
// whether a scene child shows in a set (undefined: the simulation decides)
function shows(c,name){
  if(c===st.floor) return name==='build';
  for(const k in sets) if(sets[k].g===c) return k===name;
  if(name==='orchard') return undefined;
  if(name==='workers') return c===E.H||carOf(c)?false:undefined;
  if(name==='build') return c===E.H||isSky(c)||!!(carOf(c)&&carOf(c).mode==='docked');
  return isSky(c); }
const sh=()=>E.sun.shadow.camera;
function shadowSize(e){ const s=sh(); if(s.right===e) return; s.left=s.bottom=-e; s.right=s.top=e; s.far=e>10?e*6:70; s.updateProjectionMatrix(); }
function useSet(name){ if(st.name===name) return;
  for(const [c,vis] of st.prev) c.visible=vis; st.prev.clear();
  if(sets[st.name]) sets[st.name].exit(); st.name=name;
  if(name==='build'&&!st.floor){ st.floor=new T.Mesh(new T.PlaneGeometry(400,400),new T.MeshStandardMaterial({color:new T.Color(0xcdcfcb).convertSRGBToLinear(),roughness:.92,metalness:0}));
    st.floor.rotation.x=-Math.PI/2; st.floor.position.y=.0005; st.floor.receiveShadow=true; E.scene.add(st.floor); }
  if(sets[name]) sets[name].enter();
  const fog=name==='build'?[14,42]:name==='globe'?[40,140]:(sets[name]&&sets[name].fog)||[45,115]; E.scene.fog.near=fog[0]; E.scene.fog.far=fog[1];
  shadowSize((sets[name]&&sets[name].shadow)||10); }
// every frame: the simulation shows bins, the depot and the carriers again on its own
function hideFor(name){ if(name==='orchard'&&!st.prev.size) return;
  for(const c of E.scene.children){ if(c.isLight||c===E.sun.target) continue; const v=shows(c,name); if(v===undefined) continue;
    if(!st.prev.has(c)) st.prev.set(c,c.visible); c.visible=v; } }
// a set's own progress: 0 → 1 as its chapter scrolls into place
let fNow=0;
const setProgress=name=>{ const ci=SH.findIndex(S=>S.set===name); return ci<0?1:clamp((fNow-(ci-.42))/.4,0,1); };
function studioSky(){ E.skyUni.top.value.copy(palette.studio.top); E.skyUni.mid.value.copy(palette.studio.mid); E.skyUni.bot.value.copy(palette.studio.mid);
  E.scene.fog.color.copy(palette.studio.mid); E.sun.color.copy(palette[1].sun); E.sun.intensity=2.2; E.hemi.intensity=.7; E.renderer.toneMappingExposure=1; }
// camera: eased toward the scroll-blended shot every frame, with a slow drift so it never freezes
const cam={init:false,p:[0,0,0],t:[0,0,0],fov:44,off:.2};
let goal=null, lastFrame=performance.now();
window.__beforeRender=function(){ if(!live||!goal) return;
  const now=performance.now(), dt=Math.min(.1,(now-lastFrame)/1000); lastFrame=now; const k=cam.init?1-Math.exp(-dt*4.5):1; cam.init=true;
  const back=narrow()?1.3:1;                       // portrait: pull back so the subject fits the narrow frame
  const a=inWorld(goal.A,now), b=inWorld(goal.B,now), bw=goal.w, gp=[], gt=[];
  for(let j=0;j<3;j++){ gp[j]=a.p[j]+(b.p[j]-a.p[j])*bw; gt[j]=a.t[j]+(b.t[j]-a.t[j])*bw; }
  gp[1]+=Math.sin(Math.PI*bw)*Math.min(7,Math.hypot(b.p[0]-a.p[0],b.p[1]-a.p[1],b.p[2]-a.p[2])*.2);   // rise over the canopy between shots
  if(goal.set!==st.name) cam.init=false;          // a new set: cut, the wipe covers it
  useSet(goal.set);
  for(let j=0;j<3;j++){ const g=gt[j]+(gp[j]-gt[j])*back; cam.p[j]+=(g-cam.p[j])*(cam.init?k:1); cam.t[j]+=(gt[j]-cam.t[j])*(cam.init?k:1); }
  cam.init=true; cam.fov+=(goal.fov-cam.fov)*k; cam.off+=(goal.off-cam.off)*k;
  const s=now/1000, amp=.04*Math.hypot(cam.p[0]-cam.t[0],cam.p[1]-cam.t[1],cam.p[2]-cam.t[2])*(reduced?0:1);
  E.camera.position.set(cam.p[0]+Math.sin(s*.23)*amp, cam.p[1]+Math.sin(s*.31)*amp*.4, cam.p[2]+Math.cos(s*.19)*amp);
  E.controls.target.set(cam.t[0],cam.t[1],cam.t[2]);
  if(goal.set!=='orchard'&&goal.set!=='build'){ const r=(sets[goal.set]&&sets[goal.set].shadow)?sets[goal.set].shadow*3:30, D=E.SUN_DIR;
    E.sun.position.set(cam.t[0]+D.x*r,D.y*r,cam.t[2]+D.z*r); E.sun.target.position.set(cam.t[0],0,cam.t[2]); }
  const r=E.renderer.domElement, w=r.clientWidth||innerWidth, h=r.clientHeight||innerHeight, nar=narrow();
  E.camera.fov=nar?Math.min(70,cam.fov*1.3):cam.fov;
  // near plane with the shot's distance: the ground layers (grass, alleys, soil, road, depot lines) lie millimetres apart and z-fight
  // in the depth buffer from high, far shots when it stays at the simulation's 3 cm
  E.camera.near=clamp(Math.hypot(cam.p[0]-cam.t[0],cam.p[1]-cam.t[1],cam.p[2]-cam.t[2])*.015,.03,1);
  if(nar) E.camera.setViewOffset(w,h,0,h*.2,w,h); else E.camera.setViewOffset(w,h,-w*cam.off,0,w,h);
  E.camera.updateProjectionMatrix(); hideFor(st.name); if(st.name==='build') studioSky(); else applySky(goal.tod);
  const set=sets[st.name]; if(set) set.update(dt,now,setProgress(st.name)); };

// ---------------- each frame: camera goal, bar, wash, night, and the scroll fill
let lastY=-1, vel=0, lastT=performance.now(), cur=-1, nightOn=false, tsNow=1, settle=0;
function frame(now){ const dt=Math.min(.1,(now-lastT)/1000)||.016; lastT=now;
  const y=scrollY; vel+=(Math.abs(y-lastY)/dt-vel)*Math.min(1,dt*6);
  if(y!==lastY) settle=20; lastY=y;
  const f=fAt(y); fNow=f; goal=blend(f);
  const pr=clamp(y/maxS,0,1); $('row-bot').style.left=(pr*100)+'%'; $('row-done').style.width=(pr*100)+'%';
  const ci=Math.round(f); if(ci!==cur){ cur=ci; stopB.forEach((b,i)=>{ b.classList.toggle('cur',i===ci); b.classList.toggle('past',i<ci); });
    if(world.classList.contains('still')) $('poster').style.backgroundImage=`url(img/${SH[ci].still}.webp)`; }
  veil.style.setProperty('--vs',goal.vs.toFixed(3)); veil.style.setProperty('--vf',goal.vf.toFixed(3));
  const night=goal.tod>.9; if(night!==nightOn){ nightOn=night; document.body.classList.toggle('night',night); if(live) setChk('night',night); }
  if(live){ const want=goal.ts*(1+Math.min(4,vel/450)); tsNow+=(want-tsNow)*Math.min(1,dt*3); E.S.ts=tsNow; }
  if(settle>0||now-t0<2200){ settle--; fill(now,f); }          // only while the page moves (and during the opening)
  requestAnimationFrame(frame); }

// ---------------- live counter
// the block finished (after hours of reading): bank the count, start the first row again
setInterval(()=>{ if(!live) return; const S=E.S;
  if(S.banner&&!S.turn){ carry+=S.binnedTot-base; base=0; E.resetAll(); E.jumpTo(-25); }
  const n=Math.max(0,carry+S.binnedTot-base); $('ticker-n').textContent=fmt(n); $('tally-n').textContent=fmt(n);
  $('ticker').classList.toggle('away',cur>=NS-1); },250);

new ResizeObserver(()=>{ measure(); settle=20; }).observe(document.querySelector('main'));
addEventListener('resize',()=>{ measure(); if(E) E.renderer.setPixelRatio(Math.min(devicePixelRatio||1,narrow()?1:1.25)); });
measure(); requestAnimationFrame(frame);
if(reduced||!webgl) still(); else boot();
})();
