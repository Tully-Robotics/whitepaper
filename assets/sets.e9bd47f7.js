// The story's other sets, built into the simulation's scene and shown one at a time behind a chapter (story.js swaps them
// while the page is washed to paper): people picking by hand (problem), the machine assembling module by module (solution),
// a globe of the apple regions (market) and one valley served by one hub (business model).
// Each set: g (its group), cam (camera shot in world coordinates, where it has one), enter(), exit(), update(dt, now, p),
// where p is the chapter's own progress, 0 → 1 as it scrolls into place.
window.__Sets=function(E){
"use strict";
const T=window.THREE, {scene,MAT,std,mk,RB,BX,CY}=E;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)), ss=(a,b,x)=>{ const t=clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); }, lerp=(a,b,t)=>a+(b-a)*t;
let seed=917; const rnd=()=>{ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
const V=(x,y,z)=>new T.Vector3(x||0,y||0,z||0), UP=V(0,1,0), dummy=new T.Object3D(), tA=V(), tB=V();
const ACC=0xc4332b, SHELL=0xe7e3da, DARK=0x2a2f34;
// a cylinder from a to b (geometry along y, centred)
function seg(m,a,b){ tA.subVectors(b,a); const L=tA.length()||1e-6; m.position.copy(a).addScaledVector(tA,.5); m.quaternion.setFromUnitVectors(UP,tA.multiplyScalar(1/L)); }
const yawTo=(cur,want,k)=>{ let d=want-cur; while(d>Math.PI) d-=2*Math.PI; while(d<-Math.PI) d+=2*Math.PI; return cur+d*k; };

// ================================================================== problem: pickers on foot in alley 3, always on the ground
function Workers(){
  const g=new T.Group(); g.visible=false; scene.add(g);
  const K=3, Z0=E.ZK(K), RL=E.ROWZ[K], RH=E.ROWZ[K+1], G=E.G;
  const wall={'-1':G.rows[K].filter(i=>G.z[i]>RL-0.06), '1':G.rows[K+1].filter(i=>G.z[i]<RH+0.06)};   // the fruit facing this alley
  const took=new Set();
  const M=h=>std(h,0,.85);
  const SKIN=[0xc99a73,0x8d5f40,0xe2b590,0x6f4a32].map(M), SHIRT=[0x3e5f7d,0x8b3a2f,0x5d6b3a,0x6d7277,0xb3842f,0x35524f].map(M), PANTS=[0x2d3239,0x4a4237,0x3a475a].map(M);
  const straw=M(0xd5bf87), canvas=M(0xcdc2a2), shoe=M(0x2a2420);
  const headG=new T.SphereGeometry(.105,16,12), handG=new T.SphereGeometry(.043,10,8), fruitG=new T.IcosahedronGeometry(.039,1);
  // one picker, facing the tree wall on side s, with a canvas picking bag on the chest
  const P=[];
  function person(s,x,k){
    const p={s,x0:x,x,dir:1,body:new T.Group(),hand:k%2,wait:rnd(),miss:0,st:'pick',t:0};
    const b=p.body; g.add(b); b.rotation.y=s>0?0:Math.PI;
    const sh=SHIRT[k%SHIRT.length], sk=SKIN[(k*3+1)%SKIN.length], pa=PANTS[k%PANTS.length];
    p.legs=[-1,1].map(lr=>{ const L=new T.Group(); L.position.set(lr*.1,.92,0); b.add(L); mk(CY(.07,.058,.86,10),pa,L,0,-.43,0); mk(RB(.11,.08,.25,.03),shoe,L,0,-.88,.04); return L; });
    mk(RB(.38,.56,.23,.07),sh,b,0,1.2,0); mk(CY(.045,.05,.08,10),sk,b,0,1.5,0); mk(headG,sk,b,0,1.62,.01);
    mk(CY(.21,.21,.014,24),straw,b,0,1.69,0); mk(CY(.1,.115,.09,18),straw,b,0,1.74,0);
    mk(RB(.34,.3,.2,.06),canvas,b,0,1.06,.19); for(const lr of [-1,1]) mk(BX(.035,.36,.02),canvas,b,lr*.12,1.32,.12,-.25,0,0,true);
    p.arms=[-1,1].map(lr=>{ const a={lr,up:mk(CY(.05,.045,.3,10),sh,g),fo:mk(CY(.042,.036,.29,10),sk,g),hd:mk(handG,sk,g),fr:mk(fruitG,MAT.appleFlow,g,0,0,0,0,0,0,true),
      st:'rest',t:0,dur:1,gi:-1,from:V(),to:V(),cur:V(),el:V()}; a.fr.visible=false; return a; });
    P.push(p); return p; }
  [[-1,-2.0],[1,-.6],[-1,2.3],[1,3.6],[-1,6.0],[1,7.8]].forEach(([s,x],k)=>person(s,x,k));
  // full and half-full bins further down the alley
  for(const [x,f] of [[10.5,.55],[13.6,.3]]){ const bin=E.makeBin(); bin.position.set(x,0,Z0+(x>12?.3:-.2)); bin.rotation.y=.08; g.add(bin);
    const pl=bin.userData.pile; pl.visible=true; pl.scale.y=f*.62; pl.position.y=.11+f*.31; }
  function place(p){ p.body.position.set(p.x,0,(p.s>0?RH:RL)-p.s*.78); p.body.updateMatrixWorld(true); }
  const shoulder=(p,lr,o)=>o.set(lr*.2,1.46,.02).applyMatrix4(p.body.matrixWorld);
  const restAt=(p,lr,o)=>o.set(lr*.1,1.25,.3).applyMatrix4(p.body.matrixWorld);
  const tS=V();
  function choose(p,a){ const S=shoulder(p,a.lr,tS), side=p.s>0?1:-1; let best=-1, bd=9;
    for(const i of wall[p.s]){ const dx=G.x[i]-p.x; if(dx<-.9||dx>.9||G.state[i]!==0||took.has(i)) continue;
      const d=Math.hypot(G.x[i]-S.x,G.y[i]-S.y,G.z[i]-S.z); if(d>.64||dx*a.lr*side<-.12) continue;
      const sc=d+rnd()*.15; if(sc<bd){ bd=sc; best=i; } }
    return best; }
  // two-bone arm: shoulder → elbow (bent down and out) → hand
  const pole=V(), n=V(), d=V();
  function poseArm(p,a){ const S=shoulder(p,a.lr,tA.clone()), L1=.3, L2=.29;
    d.subVectors(a.cur,S); const D=Math.min(d.length(),(L1+L2)*.995)||1e-3; d.normalize(); const Hd=S.clone().addScaledVector(d,D);
    const right=(p.s>0?1:-1)*a.lr; pole.set(right*.6,-1,-p.s*.35); n.copy(pole).addScaledVector(d,-pole.dot(d)).normalize();
    const q=(L1*L1-L2*L2+D*D)/(2*D), h=Math.sqrt(Math.max(0,L1*L1-q*q)); a.el.copy(S).addScaledVector(d,q).addScaledVector(n,h);
    seg(a.up,S,a.el); seg(a.fo,a.el,Hd); a.hd.position.copy(Hd); a.fr.position.copy(Hd).addScaledVector(d,.035); }
  function stepPerson(p,dt){ p.t+=dt;
    if(p.st==='walk'){ const u=ss(0,1,p.t/.9); p.x=lerp(p.from,p.to,u); p.legs[0].rotation.x=Math.sin(u*Math.PI*2)*.45; p.legs[1].rotation.x=-p.legs[0].rotation.x; if(p.t>=.9){ p.st='pick'; p.miss=0; } }
    place(p);
    p.wait-=dt; const idle=p.arms.every(a=>a.st==='rest');
    for(const a of p.arms){ a.t+=dt; const rest=restAt(p,a.lr,tB);
      if(a.st==='rest'){ a.cur.lerp(rest,Math.min(1,dt*6));
        if(p.st==='pick'&&p.wait<=0&&p.arms[p.hand]===a){ const i=choose(p,a); p.hand^=1;
          if(i>=0){ took.add(i); a.gi=i; a.from.copy(a.cur); a.to.set(G.x[i],G.y[i]-.01,G.z[i]-p.s*.035); a.st='reach'; a.t=0; a.dur=.45+rnd()*.25; p.wait=.3+rnd()*.45; p.miss=0; }
          else if(++p.miss>2&&idle){ p.t=0; p.from=p.x; if(p.x+p.dir*.6>p.x0+5.5||p.x+p.dir*.6<p.x0-1) p.dir*=-1; p.to=p.x+p.dir*.55; p.st='walk'; } } }
      else if(a.st==='reach'){ a.cur.lerpVectors(a.from,a.to,ss(0,1,a.t/a.dur)); if(a.t>=a.dur){ E.setG(a.gi,false); a.fr.visible=true; a.st='grab'; a.t=0; } }
      else if(a.st==='grab'){ if(a.t>=.14){ a.st='back'; a.t=0; a.from.copy(a.cur); a.dur=.42+rnd()*.12; } }
      else if(a.st==='back'){ a.cur.lerpVectors(a.from,rest,ss(0,1,a.t/a.dur)); if(a.t>=a.dur){ a.fr.visible=false; a.st='rest'; } }
      poseArm(p,a); } }
  function reset(){ for(const i of took) if(G.state[i]===0) E.setG(i,true); took.clear();
    for(const p of P){ p.x=p.x0; p.dir=1; p.st='pick'; p.t=0; place(p); for(const a of p.arms){ a.st='rest'; a.fr.visible=false; restAt(p,a.lr,a.cur); poseArm(p,a); } } }
  reset();
  return {g,cam:{p:[-7.6,2.35,Z0-.25],t:[3.2,1.45,Z0+.1]},
    enter(){ reset(); g.visible=true; }, exit(){ g.visible=false; },
    update(dt){ for(const p of P) stepPerson(p,Math.min(dt,.05)); }};
}

// ================================================================== solution: the machine builds up module by module on the studio floor
// base platform → arms (the thinning kit) → fruit line and bin carrier (the harvesting kit). Each module is clipped by its
// own rising plane (materials swapped for clipped clones while the set is up); a red frame marks the build height.
function Build(){
  const g=new T.Group(); g.visible=false; scene.add(g); E.renderer.localClippingEnabled=true;
  const arms=E.MOD.arms, line=E.MOD.line;
  const PL={base:new T.Plane(V(0,-1,0),0),arms:new T.Plane(V(0,-1,0),0),line:new T.Plane(V(0,-1,0),0)};
  const orig=new Map(), clones=new Map();
  function clip(obj,key){ obj.traverse(o=>{ if(!o.material) return; if(!orig.has(o)) orig.set(o,o.material); const m0=orig.get(o);
    const f=m=>{ const k=m.uuid+key; let c=clones.get(k); if(!c){ c=m.clone(); c.clippingPlanes=[PL[key]]; c.clipShadows=true; clones.set(k,c); } return c; };
    o.material=Array.isArray(m0)?m0.map(f):f(m0); }); }
  function unclip(){ for(const [o,m] of orig) o.material=m; orig.clear(); }
  // the build frame: four bars and a faint plane at the current height
  const fr=new T.Group(); g.add(fr); const fm=new T.MeshBasicMaterial({color:new T.Color(ACC),transparent:true,opacity:1,depthWrite:false,fog:false});
  for(const [w,d,x,z] of [[2.5,.03,0,1.3],[2.5,.03,0,-1.3],[.03,2.6,1.25,0],[.03,2.6,-1.25,0]]){ const m=mk(BX(w,.012,d),fm,fr,x,0,z,0,0,0,true); m.castShadow=false; }
  const sheet=new T.Mesh(new T.PlaneGeometry(2.5,2.6),new T.MeshBasicMaterial({color:new T.Color(ACC),transparent:true,opacity:.08,depthWrite:false,side:T.DoubleSide,fog:false}));
  sheet.rotation.x=-Math.PI/2; fr.add(sheet);
  let car=null;
  return {g,
    enter(){ g.visible=true; for(const c of E.H.children){ if(c.isLight) continue; clip(c,arms.includes(c)?'arms':line.includes(c)?'line':'base'); } },
    exit(){ g.visible=false; unclip(); if(car){ car.g.visible=true; car=null; } },
    update(dt,now,p){
      const hb=lerp(-.05,3.8,ss(0,.42,p)), ha=lerp(.15,3.6,ss(.4,.66,p)), hl=lerp(.1,2.6,ss(.64,.9,p)), qc=ss(.62,.98,p);
      PL.base.constant=hb; PL.arms.constant=ha; PL.line.constant=hl;
      const H=E.H.position, y=p<.42?hb:p<.66?ha:p<.9?hl:-1; fr.visible=y>0&&y<3.7; fr.position.set(H.x,Math.max(.01,y),H.z);
      fm.opacity=.9*(1-ss(3.2,3.7,y)); fr.scale.setScalar(1+.02*Math.sin(now/120));
      // the bin carrier drives into the tunnel last
      car=E.CARS.find(c=>c.mode==='docked')||null;
      if(car){ car.g.visible=qc>.001; car.g.position.x-=E.DIR*6*(1-qc); } }};
}

// ================================================================== market: a dotted globe with the apple regions
const LAND='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';
const REGIONS=[ // [lat, lon, tier]: 2 = launch regions, 1 = the obtainable market, 0 = other large apple regions
  [47.4,-120.3,2],[47.65,9.45,2],[46.5,11.35,2],
  [43.0,-85.7,1],[43.2,-77.5,1],[49.9,-119.5,1],[45.3,-73.3,1],[53.5,9.7,1],[51.9,5.3,1],[50.8,4.3,1],[47.4,-.6,1],[43.8,4.8,1],[41.6,.6,1],[47.1,15.6,1],[47.5,8.9,1],[51.6,-.9,1],[44.6,11.2,1],
  [35,109,0],[36.6,118.5,0],[37.5,113,0],[51.9,20.9,0],[37.8,30.5,0],[-35.4,-71.6,0],[-39.6,176.8,0],[-33.4,19.3,0],[34,74.8,0],[37.3,46,0],[-39,-67.6,0],[-27.6,-50.5,0],[40.6,140.5,0],[49.2,32,0],[47,28.6,0],[-42.9,147.3,0],[41.3,69.3,0]];
function Globe(){
  const g=new T.Group(); g.visible=false; scene.add(g); const C0=V(0,6,0); g.position.copy(C0);
  const tilt=new T.Group(); tilt.rotation.x=.42; g.add(tilt); const turn=new T.Group(); tilt.add(turn);
  const R=4.6, at=(lat,lon,r)=>{ const a=lat*Math.PI/180, b=lon*Math.PI/180; return V(Math.cos(a)*Math.sin(b)*r,Math.sin(a)*r,Math.cos(a)*Math.cos(b)*r); };
  mk(new T.SphereGeometry(R,72,48),std(0xe3e9e5,0,.92),turn,0,0,0,0,0,0,true);
  // land: one dot per land cell of a 14,000-point Fibonacci sphere (Natural Earth 110 m land)
  const bits=atob(LAND), N=14000, GA=Math.PI*(3-Math.sqrt(5)), pts=[];
  for(let i=0;i<N;i++) if(bits.charCodeAt(i>>3)&(1<<(i&7))){ const y=1-(i+.5)/N*2, r=Math.sqrt(1-y*y), th=GA*i; pts.push(V(r*Math.sin(th),y,r*Math.cos(th))); }
  const land=new T.InstancedMesh(new T.CircleGeometry(.052,6),std(0x3f5a47,0,.8),pts.length);
  pts.forEach((p,i)=>{ dummy.position.copy(p).multiplyScalar(R*1.002); dummy.lookAt(p.clone().multiplyScalar(R*2)); dummy.scale.set(1,1,1); dummy.updateMatrix(); land.setMatrixAt(i,dummy.matrix); });
  turn.add(land);
  // apple regions: a stem with an apple on top, the launch regions tallest and pulsing
  const red=std(ACC,0,.45), redSoft=std(0xd88b80,0,.6), stemM=std(0x5e4424,0,.9), pins=[], rings=[];
  const appleG=new T.SphereGeometry(1,16,12), ringG=new T.RingGeometry(.8,1,40);
  for(const [lat,lon,tier] of REGIONS){ const n=at(lat,lon,1), pin=new T.Group(); pin.position.copy(n).multiplyScalar(R); pin.quaternion.setFromUnitVectors(UP,n); turn.add(pin);
    const h=[.28,.62,1.05][tier], r=[.055,.075,.11][tier];
    const st=mk(CY(.012,.012,1,6),stemM,pin,0,.5,0,0,0,0,true), ap=mk(appleG,tier?red:redSoft,pin,0,1,0,0,0,0,true); ap.scale.setScalar(r);
    pins.push({pin,st,ap,h,tier,k:pins.length});
    if(tier===2) for(let j=0;j<2;j++){ const m=new T.Mesh(ringG,new T.MeshBasicMaterial({color:new T.Color(ACC),transparent:true,depthWrite:false,side:T.DoubleSide}));
      m.rotation.x=-Math.PI/2; m.position.y=.01; pin.add(m); rings.push({m,o:j*.5}); } }
  // a route drawn from the Alps to Washington, again and again
  const arc=new T.QuadraticBezierCurve3(at(47.65,9.45,R),at(62,-55,R*1.42),at(47.4,-120.3,R));
  const tube=new T.Mesh(new T.TubeGeometry(arc,80,.018,6),new T.MeshBasicMaterial({color:new T.Color(ACC),transparent:true,opacity:.85}));
  turn.add(tube); const nIdx=tube.geometry.index.count;
  return {g,cam:{p:[0,8.4,17.6],t:[0,5.75,0]},
    enter(){ g.visible=true; }, exit(){ g.visible=false; },
    update(dt,now,p){ const s=now/1000;
      turn.rotation.y=-(-55+62*Math.sin(s*2*Math.PI/46))*Math.PI/180;
      for(const q of pins){ const gr=ss(.05+q.k*.012,.55+q.k*.012,p)*q.h; q.st.scale.y=Math.max(.001,gr); q.st.position.y=gr/2; q.ap.position.y=gr; q.ap.visible=gr>.01; }
      for(const r of rings){ const u=(s*.55+r.o)%1; r.m.scale.setScalar(.12+u*.5); r.m.material.opacity=(1-u)*.8*ss(.4,.7,p); }
      const u=(s/5)%1.25; tube.geometry.setDrawRange(0,Math.floor(nIdx*Math.min(1,u)/6)*6); tube.material.opacity=.85*(1-ss(1,1.25,u))*ss(.3,.7,p); }};
}

// ================================================================== business model: one valley, one hub, trucks taking robots out to the fields and back
// Real metres inside the group, shown at 0.3 scale; the robots and trucks are drawn larger than life so they read from up here.
function Valley(){
  const S=.3, g=new T.Group(); g.visible=false; g.scale.setScalar(S); g.rotation.y=Math.PI; scene.add(g);
  const M=h=>new T.MeshLambertMaterial({color:new T.Color(h).convertSRGBToLinear()});
  // ---- terrain: a flat valley floor between rising, wooded hills
  const hgt=(x,z)=>{ const e=Math.max(0,Math.abs(z)-92+8*Math.sin(x*.013+(z>0?0:2))); return e*e*.0062+e*(.1*Math.sin(x*.019+(z>0?0:2.3))+.05*Math.sin(x*.057+z*.03)); };
  { const geo=new T.PlaneGeometry(600,460,150,115); geo.rotateX(-Math.PI/2); const P=geo.attributes.position, col=[];
    const c0=new T.Color(0x7f9a55).convertSRGBToLinear(), c1=new T.Color(0x45612f).convertSRGBToLinear(), c2=new T.Color(0x93a07c).convertSRGBToLinear(), c=new T.Color();
    for(let i=0;i<P.count;i++){ const x=P.getX(i), z=P.getZ(i), h=hgt(x,z); P.setY(i,h);
      c.copy(c0).lerp(c1,ss(1,14,h)*(.8+.2*Math.sin(x*.21+z*.17))).lerp(c2,ss(55,120,h)); col.push(c.r,c.g,c.b); }
    geo.setAttribute('color',new T.Float32BufferAttribute(col,3)); geo.computeVertexNormals();
    const t=new T.Mesh(geo,new T.MeshLambertMaterial({vertexColors:true})); t.receiveShadow=true; g.add(t); }
  // river, road, lanes
  { const P=[], I=[]; for(let i=0;i<=140;i++){ const x=-300+i*600/140, zc=-80+4*Math.sin(x/40); P.push(x,.12,zc-5,x,.12,zc+5); if(i<140){ const a=i*2; I.push(a,a+1,a+2,a+1,a+3,a+2); } }
    const geo=new T.BufferGeometry(); geo.setAttribute('position',new T.Float32BufferAttribute(P,3)); geo.setIndex(I); geo.computeVertexNormals();
    const r=new T.Mesh(geo,std(0x86a9b8,.1,.25)); r.receiveShadow=true; g.add(r); }
  const roadM=M(0xbdb5a0), ROADZ=8, STEP=52, PW=46, PD=28;
  mk(new T.PlaneGeometry(600,6),roadM,g,0,.08,ROADZ,-Math.PI/2,0,0,true).receiveShadow=true;
  for(let c=-1;c<9;c++) mk(new T.PlaneGeometry(4,148),roadM,g,(c-4)*STEP+26,.07,7,-Math.PI/2,0,0,true).receiveShadow=true;
  // ---- parcels: orchards (rows of trees with fruit), meadows, crops
  const tex=(draw)=>E.canvasTex(64,64,draw,{repeat:[1,1]});
  const orchardTex=tex((q,w,h)=>{ q.fillStyle='#8aa35e'; q.fillRect(0,0,w,h); q.fillStyle='rgba(80,70,50,.35)'; for(let y=4;y<h;y+=8) q.fillRect(0,y,w,2); });
  const cropTex=tex((q,w,h)=>{ q.fillStyle='#c8b26c'; q.fillRect(0,0,w,h); q.fillStyle='rgba(120,90,40,.35)'; for(let y=0;y<h;y+=4) q.fillRect(0,y,w,1.5); });
  const PARCELS=[], ROWS=[30,64,-14,-48], hub={c:4,r:0}, WORKED=['3,0','0,3','6,1','5,2','8,0','2,2','1,1','7,3','4,2'];
  const trees=[], fruit=[];
  for(let r=0;r<4;r++) for(let c=0;c<9;c++){ const cx=(c-4)*STEP, cz=ROWS[r], isHub=c===hub.c&&r===hub.r;
    const kind=isHub?'hub':(WORKED.includes(c+','+r)||(c*7+r*3)%10<6?'orchard':((c+r)%2?'meadow':'crop'));
    const par={c,r,cx,cz,kind}; PARCELS.push(par); if(isHub) continue;
    const mat=kind==='orchard'?new T.MeshLambertMaterial({map:orchardTex}):kind==='crop'?new T.MeshLambertMaterial({map:cropTex}):M([0x9bb36a,0xa9b878,0x8fae64][(c+r)%3]);
    if(mat.map){ mat.map=mat.map.clone(); mat.map.needsUpdate=true; mat.map.wrapS=mat.map.wrapT=T.RepeatWrapping; mat.map.repeat.set(1,PD/8); }
    mk(new T.PlaneGeometry(PW,PD),mat,g,cx,.06,cz,-Math.PI/2,0,0,true).receiveShadow=true;
    if(kind==='orchard'){ par.alleys=[]; for(let j=0;j<8;j++){ const z=cz-PD/2+2+j*3.4; if(j<7) par.alleys.push(z+1.7);
      for(let x=cx-PW/2+1.2;x<cx+PW/2-1;x+=1.6){ trees.push([x+(rnd()-.5)*.2,z]); } } } }
  { const n=trees.length, geo=new T.IcosahedronGeometry(1,1), im=new T.InstancedMesh(geo,M(0xffffff),n), tints=[0x3f6a32,0x4a7a3a,0x365c2b].map(h=>new T.Color(h).convertSRGBToLinear());
    const ap=new T.InstancedMesh(new T.IcosahedronGeometry(.22,0),std(0xb8262b,0,.5),n*3); let k=0;
    trees.forEach(([x,z],i)=>{ const s=.85+rnd()*.25; dummy.position.set(x,2.1,z); dummy.rotation.set(0,rnd()*6,0); dummy.scale.set(s,s*1.35,s*.9); dummy.updateMatrix(); im.setMatrixAt(i,dummy.matrix); im.setColorAt(i,tints[i%3]);
      for(let j=0;j<3;j++){ const a=rnd()*Math.PI*2, b=rnd()*1.4-.5; dummy.position.set(x+Math.cos(a)*Math.cos(b)*s*.95,2.1+Math.sin(b)*s*1.3,z+Math.sin(a)*Math.cos(b)*s*.85); dummy.scale.set(1,1,1); dummy.updateMatrix(); ap.setMatrixAt(k++,dummy.matrix); } });
    im.castShadow=true; im.receiveShadow=true; g.add(im); ap.castShadow=false; g.add(ap); }
  // ---- the hub: a warehouse with workshop doors and solar roof, a yard with charging bays
  const H0={x:0,z:30};
  mk(new T.PlaneGeometry(PW,PD),M(0xb9b29c),g,H0.x,.07,H0.z,-Math.PI/2,0,0,true).receiveShadow=true;
  { const shell=std(SHELL,.05,.5), dark=std(DARK,.2,.55), hb=new T.Group(); hb.position.set(2,0,38); g.add(hb);
    mk(BX(28,7,12),shell,hb,0,3.5,0); mk(BX(28.6,.6,12.6),dark,hb,0,7.3,0); mk(BX(28.05,.55,12.05),std(ACC,0,.5),hb,0,6.2,0);
    for(const x of [-9,-1,7]) mk(new T.PlaneGeometry(5,5),dark,hb,x,2.5,-6.02,0,Math.PI,0,true);
    const pv=new T.InstancedMesh(BX(2.1,.08,1.3),std(0x23324a,.4,.3),30); let k=0;
    for(let i=0;i<10;i++) for(let j=0;j<3;j++){ dummy.position.set(-11.7+i*2.6,7.7,-3.6+j*3.6); dummy.rotation.set(-.12,0,0); dummy.scale.set(1,1,1); dummy.updateMatrix(); pv.setMatrixAt(k++,dummy.matrix); }
    hb.add(pv); mk(CY(.12,.15,14,8),dark,hb,15.5,7,4); const bc=mk(new T.SphereGeometry(.45,12,8),MAT.beacon,hb,15.5,14.2,4,0,0,0,true); bc.castShadow=false; }
  // service area: rings run out from the hub over the valley
  const rings=[0,1].map(i=>{ const m=new T.Mesh(new T.RingGeometry(.975,1,128),new T.MeshBasicMaterial({color:new T.Color(ACC),transparent:true,depthWrite:false,side:T.DoubleSide}));
    m.rotation.x=-Math.PI/2; m.position.set(H0.x,.5,H0.z); g.add(m); return {m,o:i*.5}; });
  // ---- robots and trucks, built at real size and drawn larger
  const shellM=std(SHELL,.05,.4), darkM=std(DARK,.2,.5), rubber=MAT.rubber, amber=std(0xe1a52a,.1,.4), glass=std(0x1d2a33,.3,.15);
  function robotModel(){ const r=new T.Group(); g.add(r); const b=new T.Group(); b.scale.setScalar(2.2); r.add(b);
    for(const ex of [1,-1]) for(const sz of [1,-1]){ mk(RB(.36,.5,.3,.05),shellM,b,ex*.78,.6,sz*.86); mk(CY(.21,.21,.14,12),rubber,b,ex*.78,.21,sz*.86,Math.PI/2,0,0); mk(BX(.1,2.6,.1),darkM,b,ex*.52,1.95,sz*.77); }
    mk(RB(1.95,.14,2.05,.05),shellM,b,0,3.27,0); mk(BX(1.2,.22,1.4),darkM,b,0,1.5,0); mk(BX(1.96,.05,.12),std(ACC,0,.5),b,0,3.36,0,0,0,0,true);
    for(const x of [.4,-.4]) for(const sz of [1,-1]) for(const y of [1.2,2.4]) mk(BX(.12,.12,.5),darkM,b,x,y,sz*1.05);
    return r; }
  function truckModel(){ const t=new T.Group(); g.add(t); const b=new T.Group(); b.scale.setScalar(1.6); t.add(b);
    mk(RB(2.3,2.5,2.5,.18),shellM,b,4.1,2.05,0); mk(new T.PlaneGeometry(1.9,1),glass,b,5.26,2.6,0,0,Math.PI/2,0,true); mk(BX(2.32,.25,2.52),std(ACC,0,.5),b,4.1,1.15,0);
    mk(BX(9.2,.35,2.2),darkM,b,.3,.8,0); mk(BX(6.6,.25,2.6),darkM,b,-.9,1.1,0);
    for(const x of [4.3,-2.4,-3.8]) for(const z of [1.05,-1.05]) mk(CY(.5,.5,.4,14),rubber,b,x,.5,z,Math.PI/2,0,0);
    const deck=new T.Object3D(); deck.position.set(-.9,1.25,0); b.add(deck); t.userData.deck=deck; return t; }
  // ---- movement along polylines of [x, z]
  function walk(o,dt,v){ let rem=v*dt;
    while(rem>0&&o.k<o.path.length-1){ const a=o.path[o.k], b=o.path[o.k+1], L=Math.hypot(b[0]-a[0],b[1]-a[1]), left=L-o.u; if(rem<left){ o.u+=rem; rem=0; } else { rem-=left; o.k++; o.u=0; } }
    const a=o.path[Math.min(o.k,o.path.length-1)], b=o.path[Math.min(o.k+1,o.path.length-1)], L=Math.hypot(b[0]-a[0],b[1]-a[1]), t=L>1e-6?o.u/L:0;
    o.x=a[0]+(b[0]-a[0])*t; o.z=a[1]+(b[1]-a[1])*t; if(L>1e-6) o.want=Math.atan2(-(b[1]-a[1]),b[0]-a[0]);
    return o.k>=o.path.length-1; }
  const go=(o,path)=>{ o.path=path; o.k=0; o.u=0; };
  const pose=(o,dt,y)=>{ o.yaw=yawTo(o.yaw||0,o.want==null?o.yaw||0:o.want,Math.min(1,dt*4)); o.m.position.set(o.x,y||0,o.z); o.m.rotation.y=o.yaw; };
  const P=(c,r)=>PARCELS.find(p=>p.c===c&&p.r===r);
  const gate=p=>p==='hub'?[H0.x,H0.z-11]:[p.cx+PW/2-2.5,p.cz], stop=p=>p==='hub'?[H0.x,H0.z-11]:[p.cx+26,p.cz];
  const access=p=>p==='hub'?[[H0.x,H0.z-11],[H0.x,ROADZ]]:[[p.cx+26,p.cz],[p.cx+26,ROADZ]];
  const route=(a,b)=>[...access(a),...access(b).reverse()];
  const SLOTS=[-17,-12,-7,12,17,-2].map(x=>[x,H0.z-3]);
  // a robot: parked at the hub, riding a truck, driving on or off it, or working its way along a parcel's alleys
  const RB_=[];
  function robot(){ const o={m:robotModel(),st:'parked',slot:SLOTS[RB_.length%SLOTS.length],x:0,z:0,yaw:Math.PI/2}; [o.x,o.z]=o.slot; RB_.push(o); return o; }
  function work(o,p){ o.st='field'; o.field=p; const pts=[gate(p)], E0=p.cx+PW/2-2.5, W0=p.cx-PW/2+2.5;
    p.alleys.forEach((z,j)=>{ pts.push(j%2?[W0,z]:[E0,z],j%2?[E0,z]:[W0,z]); }); go(o,pts); o.loop=pts; }
  function xfer(o,to,then){ o.st='xfer'; o.from=[o.x,o.z,o.y||0]; o.to=to; o.t=0; o.then=then; }
  function stepRobot(o,dt){
    if(o.st==='field'){ if(walk(o,dt,5)){ o.loop=o.loop.slice().reverse(); go(o,o.loop); } if(o.recall){ o.recall=false; o.st='toGate'; go(o,[[gate(o.field)[0],o.z],gate(o.field)]); } }
    else if(o.st==='toGate'){ if(walk(o,dt,6)) o.st='atGate'; }
    else if(o.st==='xfer'){ o.t+=dt; const u=ss(0,1.6,o.t), to=typeof o.to==='function'?o.to():o.to; o.x=lerp(o.from[0],to[0],u); o.z=lerp(o.from[1],to[1],u); o.y=lerp(o.from[2],to[2],u)+Math.sin(u*Math.PI)*.8;
      if(Math.hypot(to[0]-o.from[0],to[1]-o.from[1])>.5) o.want=Math.atan2(-(to[1]-o.from[1]),to[0]-o.from[0]); if(o.t>=1.6){ o.y=to[2]; o.then(); } }
    if(o.st==='truck'){ const w=tB; o.truck.m.userData.deck.getWorldPosition(w); g.worldToLocal(w); o.x=w.x; o.z=w.z; o.y=w.y; o.yaw=o.truck.m.rotation.y; o.m.position.set(o.x,o.y,o.z); o.m.rotation.y=o.yaw; }
    else pose(o,dt,o.y||0); }
  // a truck runs its script for good: hub → A, hub → B, B → A, A → hub, hub → B, B → hub, swapping its two robots between fields and hub
  const TR=[];
  function truck(A,B){ const t={m:truckModel(),x:H0.x,z:H0.z-11,yaw:Math.PI/2,i:0,r:[robot(),robot()],load:null,wait:0};
    t.steps=[['load',0,'hub'],['go','hub',A],['drop',0,A],['go',A,'hub'],['load',1,'hub'],['go','hub',B],['drop',1,B],['go',B,A],['load',0,A],['go',A,'hub'],['drop',0,'hub'],['go','hub',B],['load',1,B],['go',B,'hub'],['drop',1,'hub']];
    TR.push(t); return t; }
  const deckPos=t=>()=>{ const w=V(); t.m.userData.deck.getWorldPosition(w); g.worldToLocal(w); return [w.x,w.z,w.y]; };
  function stepTruck(t,dt){ const s=t.steps[t.i], next=()=>{ t.i=(t.i+1)%t.steps.length; t.busy=false; };
    if(s[0]==='go'){ if(!t.busy){ go(t,route(s[1],s[2])); t.busy=true; } if(walk(t,dt,16)) next(); }
    else if(s[0]==='load'){ const o=t.r[s[1]];
      if(!t.busy){ t.busy=true; if(s[2]!=='hub'&&o.st==='field') o.recall=true; }
      if(o.st==='parked'||o.st==='atGate') xfer(o,deckPos(t),()=>{ o.st='truck'; o.truck=t; });
      if(o.st==='truck') next(); }
    else if(s[0]==='drop'){ const o=t.r[s[1]];
      if(!t.busy){ t.busy=true; o.st='xfer-start'; }
      if(o.st==='xfer-start') xfer(o,s[2]==='hub'?[...o.slot,0]:[...gate(s[2]),0],()=>{ if(s[2]==='hub'){ o.st='parked'; o.want=Math.PI/2; } else work(o,s[2]); });
      if(o.st==='parked'||o.st==='field') next(); }
    pose(t,dt,0); }
  truck(P(3,0),P(0,3)); truck(P(6,1),P(5,2)); truck(P(8,0),P(2,2));
  for(const [c,r] of [[1,1],[7,3],[4,2]]){ const o=robot(); [o.x,o.z]=gate(P(c,r)); work(o,P(c,r)); }
  for(const o of RB_) if(o.st==='parked'){ [o.x,o.z]=o.slot; o.want=Math.PI/2; }
  TR.forEach((t,i)=>{ for(let k=0;k<i*40;k++){ stepTruck(t,.1); for(const o of t.r) stepRobot(o,.1); } });    // stagger the trucks
  for(let k=0;k<900;k++){ for(const t of TR) stepTruck(t,.1); for(const o of RB_) stepRobot(o,.1); }       // and let the valley settle
  const W=(x,y,z)=>{ const v=V(x,y,z); g.updateMatrixWorld(true); return g.localToWorld(v).toArray(); };
  return {g,cam:{p:W(70,92,-150),t:W(-6,0,16)},fog:[48,150],shadow:46,
    enter(){ g.visible=true; }, exit(){ g.visible=false; },
    update(dt,now){ dt=Math.min(dt,.05); for(const t of TR) stepTruck(t,dt); for(const o of RB_) stepRobot(o,dt);
      const s=now/1000; for(const r of rings){ const u=(s*.16+r.o)%1; r.m.scale.setScalar(12+u*220); r.m.material.opacity=(1-u)*.5; } }};
}

return {workers:Workers(),build:Build(),globe:Globe(),valley:Valley()};
};
