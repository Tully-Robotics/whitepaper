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

// ================================================================== problem: pickers on foot in alley 3, the machine hidden
// Each picker stands 0.55 m off the fruit wall, picks with both hands into a chest bag (reach, grip, twist off, into the bag),
// steps along the row when nothing is left in reach, and walks down the middle of the alley to empty a full bag into a bin.
// They turn to face where they walk and stay on the ground.
function Workers(){
  const g=new T.Group(); g.visible=false; scene.add(g);
  const K=3, Z0=E.ZK(K), RL=E.ROWZ[K], RH=E.ROWZ[K+1], G=E.G;
  const wall={'-1':G.rows[K].filter(i=>G.z[i]>RL-0.06), '1':G.rows[K+1].filter(i=>G.z[i]<RH+0.06)};   // the fruit facing this alley
  const took=new Set();
  const M=h=>std(h,0,.85);
  const SKIN=[0xc99a73,0x8d5f40,0xe2b590,0x6f4a32].map(M), SHIRT=[0x3e5f7d,0x8b3a2f,0x5d6b3a,0x6d7277,0xb3842f,0x35524f].map(M), PANTS=[0x2d3239,0x4a4237,0x3a475a].map(M);
  const straw=M(0xd5bf87), canvas=M(0xcdc2a2), shoe=M(0x2a2420);
  const headG=new T.SphereGeometry(.105,16,12), handG=new T.SphereGeometry(.045,10,8), fruitG=new T.IcosahedronGeometry(.039,1);
  const STAND=.55, L1=.31, L2=.31, REACH=.6, WALK=.9, TURN=3.2, BAG=12;
  const lineZ=s=>(s>0?RH:RL)-s*STAND, faceTree=s=>s>0?0:Math.PI;
  // bins down the middle of the alley; pickers empty their bags at the near end
  const BINS=[4.6,9.6].map((x,i)=>{ const b=E.makeBin(); b.position.set(x,0,Z0); g.add(b); const pl=b.userData.pile; pl.visible=true; return {x,b,pl,f:[.35,.55][i]}; });
  const fillBin=B=>{ B.f=Math.min(.95,B.f); B.pl.scale.y=B.f*.62; B.pl.position.y=.11+B.f*.31; };
  BINS.forEach(fillBin);
  // ---- a picker: legs at the hips, a torso that bends from the hips, a head that turns to the fruit; the arms are posed in world space
  const P=[];
  function person(s,x,k){
    const p={s,k,x0:x,x,z:lineZ(s),yaw:faceTree(s),dir:1,body:new T.Group(),hand:k%2,wait:.3+rnd(),miss:0,mode:'pick',phase:0,lean:0,leanTo:0,bag:0,look:null};
    const b=p.body; g.add(b);
    const sh=SHIRT[k%SHIRT.length], sk=SKIN[(k*3+1)%SKIN.length], pa=PANTS[k%PANTS.length];
    p.legs=[-1,1].map(lr=>{ const L=new T.Group(); L.position.set(lr*.1,.92,0); b.add(L); mk(CY(.07,.058,.86,10),pa,L,0,-.43,0); mk(RB(.11,.08,.25,.03),shoe,L,0,-.88,.04); return L; });
    mk(RB(.34,.16,.22,.05),pa,b,0,.95,0);                                                      // hips
    const tor=new T.Group(); tor.position.set(0,.95,0); b.add(tor); p.torso=tor;
    mk(RB(.38,.55,.23,.07),sh,tor,0,.3,0); mk(CY(.045,.05,.08,10),sk,tor,0,.6,0);
    const hd=new T.Group(); hd.position.set(0,.66,.01); tor.add(hd); p.head=hd;
    mk(headG,sk,hd,0,.02,0); mk(CY(.21,.21,.014,24),straw,hd,0,.09,0); mk(CY(.1,.115,.09,18),straw,hd,0,.14,0);
    p.bagM=mk(RB(.34,.3,.2,.06),canvas,tor,0,.13,.2); for(const lr of [-1,1]) mk(BX(.035,.36,.02),canvas,tor,lr*.12,.38,.13,-.25,0,0,true);
    p.arms=[-1,1].map(lr=>{ const a={lr,up:mk(CY(.05,.045,L1,10),sh,g),fo:mk(CY(.042,.036,L2,10),sk,g),hd:mk(handG,sk,g),fr:mk(fruitG,MAT.appleFlow,g,0,0,0,0,0,0,true),
      st:'rest',t:0,dur:1,gi:-1,from:V(),to:V(),cur:V(),el:V()}; a.fr.visible=false; return a; });
    P.push(p); return p; }
  [[-1,-2.0],[1,-.6],[-1,2.6],[1,3.4],[-1,6.4],[1,7.4]].forEach(([s,x],k)=>person(s,x,k));
  function place(p){ const b=p.body; b.position.set(p.x,0,p.z); b.rotation.y=p.yaw; p.torso.rotation.x=p.lean; b.updateMatrixWorld(true); }
  const shoulder=(p,lr,o)=>o.set(lr*.2,.53,.03).applyMatrix4(p.torso.matrixWorld);
  const restAt=(p,lr,o)=>{ const sw=Math.sin(p.phase)*lr*.14*(p.amp||0); return o.set(lr*.19,.06,.2+sw).applyMatrix4(p.torso.matrixWorld); };
  const bagAt=(p,lr,o)=>o.set(lr*.05,.3,.3).applyMatrix4(p.torso.matrixWorld);
  // ---- which apple: one this hand can reach from where the picker stands, bending forward for low fruit
  const fwd=p=>[Math.sin(p.yaw),Math.cos(p.yaw)];
  const leanFor=y=>clamp((1.25-y)*.7,-.08,.5);
  function choose(p,a){ const [fx,fz]=fwd(p), rx=fz, rz=-fx, side=a.lr; let best=-1, bd=9;
    for(const i of wall[p.s]){ const dx=G.x[i]-p.x; if(dx<-.6||dx>.6||G.state[i]!==0||took.has(i)) continue;
      const ln=leanFor(G.y[i]), hy=.95+.53*Math.cos(ln), hf=.03+.53*Math.sin(ln);       // the shoulder, bent forward by ln
      const sx=p.x+rx*side*.2+fx*hf, sz=p.z+rz*side*.2+fz*hf;
      const d=Math.hypot(G.x[i]-sx,G.y[i]-hy,G.z[i]-sz); if(d>REACH) continue;
      const lat=(G.x[i]-p.x)*rx+(G.z[i]-p.z)*rz; if(lat*side<-.1) continue;               // right hand picks right of centre, left hand left
      const sc=d+rnd()*.12; if(sc<bd){ bd=sc; best=i; } }
    return best; }
  // two-bone arm: shoulder → elbow (bent down and out) → hand
  const pole=V(), n=V(), d=V(), tS=V(), tR=V();
  function poseArm(p,a){ const S=shoulder(p,a.lr,tS); const [fx,fz]=fwd(p);
    d.subVectors(a.cur,S); const D=clamp(d.length(),.05,(L1+L2)*.995); d.normalize(); const Hd=S.clone().addScaledVector(d,D);
    pole.set(fz*a.lr*.6-fx*.3,-1,-fx*a.lr*.6-fz*.3); n.copy(pole).addScaledVector(d,-pole.dot(d)).normalize();
    const q=(L1*L1-L2*L2+D*D)/(2*D), h=Math.sqrt(Math.max(0,L1*L1-q*q)); a.el.copy(S).addScaledVector(d,q).addScaledVector(n,h);
    seg(a.up,S,a.el); seg(a.fo,a.el,Hd); a.hd.position.copy(Hd); a.fr.position.copy(Hd).addScaledVector(d,.03); }
  // ---- walking: turn to the next point, walk to it facing forward, at the end turn to face the work
  function walkTo(p,pts,yawEnd,then){ p.mode='walk'; p.path=pts; p.pi=0; p.yawEnd=yawEnd; p.then=then; p.look=null; p.leanTo=0; }
  function stepWalk(p,dt){
    if(p.pi<p.path.length){ const [tx,tz]=p.path[p.pi], dx=tx-p.x, dz=tz-p.z, D=Math.hypot(dx,dz);
      if(D<.02){ p.pi++; return; }
      const want=Math.atan2(dx,dz), turned=Math.abs(Math.atan2(Math.sin(want-p.yaw),Math.cos(want-p.yaw)));
      p.yaw=yawTo(p.yaw,want,Math.min(1,TURN*dt/Math.max(turned,1e-3)));
      if(turned<.3){ const v=Math.min(D,WALK*dt*(1-turned/.3*.7)); p.x+=dx/D*v; p.z+=dz/D*v; p.phase+=v/.62*Math.PI; p.amp=Math.min(1,(p.amp||0)+dt*4); } }
    else { const turned=Math.abs(Math.atan2(Math.sin(p.yawEnd-p.yaw),Math.cos(p.yawEnd-p.yaw)));
      p.yaw=yawTo(p.yaw,p.yawEnd,Math.min(1,TURN*dt/Math.max(turned,1e-3)));
      if(turned<.02){ p.yaw=p.yawEnd; p.mode='idle'; const f=p.then; p.then=null; f&&f(); } }
    if(p.pi>=p.path.length) p.amp=Math.max(0,(p.amp||0)-dt*5); }
  function stepAlong(p){ let nx=p.x+p.dir*.6;
    if(nx>p.x0+3.2||nx<p.x0-.4){ p.dir*=-1; nx=p.x+p.dir*.6; }
    walkTo(p,[[nx,p.z]],faceTree(p.s),()=>{ p.mode='pick'; p.miss=0; p.wait=.2; }); }
  function emptyBag(p){ const zw=Z0+p.s*.3, B=BINS.reduce((a,b)=>Math.abs(b.x-p.x)<Math.abs(a.x-p.x)?b:a), end=p.x<B.x?-1:1, ex=B.x+end*.98, x0=p.x, z0=p.z;
    walkTo(p,[[x0,zw],[ex,zw]],end<0?Math.PI/2:-Math.PI/2,()=>{ p.mode='empty'; p.t=0; p.bin=B; p.back=()=>walkTo(p,[[x0,zw],[x0,z0]],faceTree(p.s),()=>{ p.mode='pick'; p.miss=0; p.wait=.2; }); }); }
  function stepPerson(p,dt){
    if(p.mode==='walk') stepWalk(p,dt);
    else if(p.mode==='empty'){ p.t+=dt; p.leanTo=p.t<1.6?.55:0;
      if(p.t>=.9&&p.bag){ p.bag=0; p.bin.f+=.012; fillBin(p.bin); }
      if(p.t>=2.1){ p.mode='idle'; p.back(); } }
    if(p.mode!=='walk') p.amp=Math.max(0,(p.amp||0)-dt*5);
    const sw=Math.sin(p.phase)*.42*(p.amp||0); p.legs[0].rotation.x=sw; p.legs[1].rotation.x=-sw;
    p.lean+=(p.leanTo-p.lean)*Math.min(1,dt*5);
    p.bagM.scale.set(1,1+p.bag*.015,1+p.bag*.04);
    place(p);
    // the head follows the hand that is reaching, or looks ahead
    let ly=0, lp=0; if(p.look){ const L=p.head.worldToLocal(p.look.clone()); ly=clamp(Math.atan2(L.x,L.z),-.9,.9); lp=clamp(-Math.atan2(L.y,Math.hypot(L.x,L.z)),-.6,.6); }
    p.head.rotation.y+=(ly-p.head.rotation.y)*Math.min(1,dt*6); p.head.rotation.x+=(lp-p.head.rotation.x)*Math.min(1,dt*6);
    p.wait-=dt;
    for(const a of p.arms){ a.t+=dt;
      if(a.st==='rest'){ a.cur.lerp(restAt(p,a.lr,tR),Math.min(1,dt*8));
        if(p.mode==='pick'&&p.wait<=0&&p.arms[p.hand]===a){ const other=p.arms[p.hand^1]; p.hand^=1;
          if(other.st==='reach'||other.st==='grip') { p.wait=.1; }
          else { const i=choose(p,a);
            if(i>=0){ took.add(i); a.gi=i; a.from.copy(a.cur); a.to.set(G.x[i],G.y[i]-.012,G.z[i]-p.s*.03); a.st='reach'; a.t=0; a.dur=.5+rnd()*.2; p.wait=.35+rnd()*.3; p.miss=0; p.look=a.to; p.leanTo=leanFor(G.y[i]); }
            else if(++p.miss>3&&p.arms.every(b=>b.st==='rest')){ p.look=null; p.leanTo=0; if(p.bag>=BAG*.5) emptyBag(p); else stepAlong(p); } } } }
      else if(a.st==='reach'){ a.cur.lerpVectors(a.from,a.to,ss(0,1,a.t/a.dur)); if(a.t>=a.dur){ E.setG(a.gi,false); a.fr.visible=true; a.st='grip'; a.t=0; } }
      else if(a.st==='grip'){ a.cur.copy(a.to).add(tR.set(0,.035*ss(0,.25,a.t),-p.s*.04*ss(0,.25,a.t))); if(a.t>=.28){ a.st='back'; a.t=0; a.from.copy(a.cur); a.dur=.45+rnd()*.1; if(p.look===a.to) p.look=null; } }
      else if(a.st==='back'){ a.cur.lerpVectors(a.from,bagAt(p,a.lr,tR),ss(0,1,a.t/a.dur)); if(a.t>=a.dur){ a.fr.visible=false; a.st='rest'; p.bag++; if(!p.arms.some(b=>b.st==='reach')) p.leanTo=0; if(p.bag>=BAG&&p.arms.every(b=>b.st==='rest')) emptyBag(p); } }
      poseArm(p,a); } }
  function reset(){ for(const i of took) if(G.state[i]===0) E.setG(i,true); took.clear();
    for(const p of P){ p.x=p.x0; p.z=lineZ(p.s); p.yaw=faceTree(p.s); p.dir=1; p.mode='pick'; p.miss=0; p.lean=p.leanTo=0; p.bag=(p.k*3)%9; p.look=null; p.phase=0; p.amp=0; place(p);
      p.legs.forEach(l=>l.rotation.x=0); for(const a of p.arms){ a.st='rest'; a.fr.visible=false; restAt(p,a.lr,a.cur); poseArm(p,a); } }
    BINS.forEach((B,i)=>{ B.f=[.35,.55][i]; fillBin(B); }); }
  reset();
  return {g,cam:{p:[-7.6,2.35,Z0-.25],t:[3.2,1.45,Z0+.1]},
    enter(){ reset(); g.visible=true; }, exit(){ g.visible=false; },
    update(dt){ dt=Math.min(dt,.05); for(const p of P) stepPerson(p,dt); }};
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
  // build heights of the three modules, the frame at y (hidden below 0), and how far the bin carrier has driven in (qc)
  function pose(hb,ha,hl,qc,y,now){
    PL.base.constant=hb; PL.arms.constant=ha; PL.line.constant=hl;
    const H=E.H.position; fr.visible=y>0&&y<3.7; fr.position.set(H.x,Math.max(.01,y),H.z);
    fm.opacity=.9*(1-ss(3.2,3.7,y)); fr.scale.setScalar(1+.02*Math.sin(now/120));
    // the bin carrier drives into the tunnel last
    car=E.CARS.find(c=>c.mode==='docked')||null;
    if(car){ car.g.visible=qc>.001; car.g.position.x-=E.DIR*6*(1-qc); } }
  return {g,pose,
    enter(){ g.visible=true; for(const c of E.H.children){ if(c.isLight) continue; clip(c,arms.includes(c)?'arms':line.includes(c)?'line':'base'); } },
    exit(){ g.visible=false; unclip(); if(car){ car.g.visible=true; car=null; } },
    update(dt,now,p){
      const hb=lerp(-.05,3.8,ss(0,.42,p)), ha=lerp(.15,3.6,ss(.4,.66,p)), hl=lerp(.1,2.6,ss(.64,.9,p));
      pose(hb,ha,hl,ss(.62,.98,p),p<.42?hb:p<.66?ha:p<.9?hl:-1,now); }};
}

// ================================================================== roadmap: one platform, evolving, behind the seven years
// First the live machine as the thinning robot: base and arms only, among small green fruitlets. Then the fruit line and the bin
// carrier build onto it and the fruit ripens: today's harvester. Then the camera climbs, and neighbouring orchard blocks appear
// with a fleet working their alleys. e runs 0 → 1 while the roadmap chapter scrolls by.
function Evolve(build){
  const g=new T.Group(); g.visible=false; scene.add(g);
  const ROW=E.ROW, XMAX=E.ROW_END-1.6;
  // ---- the fleet machine: a snapshot of the whole machine and its docked bin carrier, merged by material (a few draw calls)
  const snap=(()=>{ const byMat=new Map(), m=new T.Matrix4(); E.H.updateMatrixWorld(true); const inv=new T.Matrix4().copy(E.H.matrixWorld).invert();
    const take=root=>{ root.updateMatrixWorld(true); root.traverse(o=>{ if(!o.isMesh||o.isInstancedMesh||Array.isArray(o.material)) return;
      for(let a=o;a;a=a.parent) if(!a.visible) return;
      if(!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); const sc=o.getWorldScale(V());
      if(o.geometry.boundingSphere.radius*Math.max(sc.x,sc.y,sc.z)<.05) return;                      // screws, fingers and lenses: lost at this distance
      const src=o.geometry.index?o.geometry.toNonIndexed():o.geometry, n=new T.BufferGeometry(), P=src.getAttribute('position');
      n.setAttribute('position',P.clone()); if(src.getAttribute('normal')) n.setAttribute('normal',src.getAttribute('normal').clone()); else n.computeVertexNormals();
      n.setAttribute('uv',src.getAttribute('uv')?src.getAttribute('uv').clone():new T.Float32BufferAttribute(new Float32Array(P.count*2),2));
      n.applyMatrix4(m.multiplyMatrices(inv,o.matrixWorld)); (byMat.get(o.material)||byMat.set(o.material,[]).get(o.material)).push(n); }); };
    take(E.H); for(const c of E.CARS) if(c.mode==='docked') take(c.g);
    return [...byMat].map(([mat,geos])=>[mat,T.BufferGeometryUtils.mergeBufferGeometries(geos,false)]).filter(x=>x[1]); })();
  const fleetBot=()=>{ const r=new T.Group(); for(const [mat,geo] of snap){ const m=new T.Mesh(geo,mat); m.castShadow=false; m.receiveShadow=true; r.add(m); } g.add(r); return r; };
  // ---- neighbouring blocks: the orchard drawn again beside ours, sharing its geometry and instances (no shadows)
  // (not the fine parts nobody sees from up there: fruit stems, the branches under the leaves, bamboo stakes)
  const fine=c=>c.geometry.type==='CylinderGeometry'&&c.geometry.parameters.radiusTop<.02;
  const SRC=scene.children.filter(c=>c.parent===scene&&((c.isInstancedMesh&&!fine(c))||c.isLineSegments||(c.isMesh&&c.material&&(c.material.map===E.TEX.alley||c.material.map===E.TEX.soil))));
  const BLOCKS=[[0,0],[0,19.5],[-71,19.5],[71,19.5],[-71,0],[71,0]];
  // each block is drawn only when it is in view (its instances have no bounds of their own)
  const NB=[], frustum=new T.Frustum(), pm=new T.Matrix4();
  // the fruit there in 20 triangles instead of 80: the same from up here
  const lowApple=(()=>{ const g2=new T.IcosahedronGeometry(.039,0); g2.scale(1,.9,1); g2.setAttribute('color',new T.Float32BufferAttribute(new Float32Array(g2.getAttribute('position').count*3).fill(1),3)); return g2; })();
  BLOCKS.slice(1).forEach(([dx,dz])=>{ const b=new T.Group(); b.position.set(dx,0,dz); g.add(b); NB.push({b,box:new T.Box3(V(dx-36,0,dz-8),V(dx+36,4.5,dz+12.5))});
    for(const s of SRC){ let c;
      if(s.isInstancedMesh){ c=new T.InstancedMesh(s===E.apples?lowApple:s.geometry,s.material,s.count); c.instanceMatrix=s.instanceMatrix; if(s.instanceColor) c.instanceColor=s.instanceColor; }
      else c=s.isLineSegments?new T.LineSegments(s.geometry,s.material):new T.Mesh(s.geometry,s.material);
      c.position.copy(s.position); c.quaternion.copy(s.quaternion); c.scale.copy(s.scale); c.frustumCulled=false; c.castShadow=false; c.receiveShadow=true; b.add(c); }
    for(const h of E.HL.children){ const c=h.clone(); c.castShadow=false; b.add(c); } });
  // ---- the fleet: machines crawling their alleys, in our block (not in the live machine's alley) and in every neighbour
  const FLEET=[];
  function placeFleet(){ for(const f of FLEET) g.remove(f.r); FLEET.length=0;
    BLOCKS.forEach(([dx,dz],b)=>{ const ks=b?[b%4]:[0,1,2,3].filter(k=>k!==E.ALLEY).slice(0,2);
      ks.forEach((k,j)=>{ const r=fleetBot(), x=dx+(rnd()*2-1)*XMAX*.8; FLEET.push({r,dx,x,z:dz+E.ZK(k),dir:j%2?1:-1,wait:0}); }); }); }
  // ---- young fruit for the thinning season
  const ac=E.apples.instanceColor, ripe=ac?ac.array.slice():null, GREEN=[0x7f9d3c,0x8eab45,0x6f8c34].map(h=>new T.Color(h).convertSRGBToLinear());
  let young=false;
  function fruit(y){ if(!ac||y===young) return; young=y; const a=ac.array;
    if(y) for(let i=0;i<a.length/3;i++){ const c=GREEN[i%3]; a[i*3]=c.r; a[i*3+1]=c.g; a[i*3+2]=c.b; } else a.set(ripe); ac.needsUpdate=true; }
  // ---- camera: in front of the thinning robot, over its roof to the back of the harvester, then up over the blocks (machine frame)
  const A={p:[5.4,2.1,.6],t:[0,1.55,0]}, B={p:[-6.2,3,.9],t:[0,1.3,0]}, C={p:[-30,30,-38],t:[16,1,24]};
  const mix=(a,b,u,lift)=>({p:a.p.map((v,i)=>v+(b.p[i]-v)*u+(i===1?Math.sin(Math.PI*u)*lift:0)),t:a.t.map((v,i)=>v+(b.t[i]-v)*u)});
  let e=0;
  return {g,range:[-.3,.55],
    stage:()=>e<.41?0:e<.62?1:2,
    carsOn:()=>e>=.5,                                        // the carriers waiting and driving to the depot: harvest only
    camAt(x){ const u1=ss(.3,.48,x), u2=ss(.62,.86,x); return u2>0?mix(B,C,u2,0):mix(A,B,u1,3.2); },
    enter(){ build.enter(); placeFleet(); },
    exit(){ build.exit(); fruit(false); g.visible=false; E.scene.fog.near=45; E.scene.fog.far=115; },
    update(dt,now,x){ e=x;
      const ql=ss(.34,.5,e), y=e>.33&&e<.5?lerp(.1,2.6,ql):-1;
      build.pose(9,9,lerp(.1,2.6,ql),ss(.3,.48,e),y,now);
      fruit(e<.41);
      g.visible=e>=.6;
      // the haze lifts as the camera climbs over the blocks
      const u2=ss(.62,.86,e); E.scene.fog.near=lerp(45,120,u2); E.scene.fog.far=lerp(115,320,u2);
      if(g.visible){ E.camera.updateMatrixWorld(); frustum.setFromProjectionMatrix(pm.multiplyMatrices(E.camera.projectionMatrix,E.camera.matrixWorldInverse)); for(const n of NB) n.b.visible=frustum.intersectsBox(n.box); }
      if(g.visible) for(const f of FLEET){ if(f.wait>0){ f.wait-=dt; } else { f.x+=f.dir*.35*Math.min(dt,.05); if(Math.abs(f.x-f.dx)>XMAX){ f.x=f.dx+Math.sign(f.x-f.dx)*XMAX; f.dir*=-1; f.wait=2.5; } }
        f.r.position.set(f.x,0,f.z); } }};
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
// Everything at true size and speed, in real metres inside the group (shown at 0.3 scale). Orchard blocks of narrow fruit walls
// 3.5 m apart, some under hail nets; farm lanes between the blocks and a back road along each side of the valley. The trucks keep
// to the right, never turn on the spot, accelerate and brake, and stop for anything in front of them. A robot leaves and boards a
// truck over its rear ramps, crabs sideways or turns in place like the real swerve-drive machine, and works the alleys at 1 m/s.
function Valley(){
  const S=.3, g=new T.Group(); g.visible=false; g.scale.setScalar(S); g.rotation.y=Math.PI; scene.add(g);
  const col=h=>new T.Color(h).convertSRGBToLinear(), M=h=>new T.MeshLambertMaterial({color:col(h)});
  const flat=(w,d,mat,x,y,z)=>{ const m=mk(new T.PlaneGeometry(w,d),mat,g,x,y,z,-Math.PI/2,0,0,true); m.receiveShadow=true; return m; };
  const inst=(geo,mat,list,shadow)=>{ const im=new T.InstancedMesh(geo,mat,list.length); list.forEach((f,i)=>{ f(dummy); dummy.updateMatrix(); im.setMatrixAt(i,dummy.matrix); });
    im.castShadow=!!shadow; im.receiveShadow=true; g.add(im); return im; };
  const put=(x,y,z,sx,sy,sz,ry)=>o=>{ o.position.set(x,y,z); o.rotation.set(0,ry||0,0); o.scale.set(sx,sy,sz); };
  // ---- layout: parcels in two rows each side of the main road, a farm lane between every two columns, back roads, the river
  const STEP=52, PW=46, PD=28, ROWS=[30,64,-20,-54], ROADZ=8, BN=84, BS=-74, RIVER=-88, HL=4.5, RS=3.5;
  const LX=[]; for(let c=-1;c<9;c++) LX.push((c-4)*STEP+26);
  const ZJ=[BS,ROADZ,BN];
  // ---- terrain: flat valley floor, wooded slopes, then mountains
  const hgt=(x,z)=>{ const e=Math.max(0,Math.abs(z)-(z>0?96:100)); if(!e) return 0; const n=.75+.5*Math.sin(x*.019+(z>0?0:2.3))+.25*Math.sin(x*.057+z*.03);
    return e*e*.006*n+e*.12*n+Math.max(0,Math.abs(z)-175)*1.7*(.8+.3*Math.sin(x*.011)); };
  { const geo=new T.PlaneGeometry(820,640,164,128); geo.rotateX(-Math.PI/2); const P=geo.attributes.position, cl=[];
    const c0=col(0x7f9a55), c1=col(0x40592c), c2=col(0x8e9483), c3=col(0xf1f2ee), c=new T.Color();
    for(let i=0;i<P.count;i++){ const x=P.getX(i), z=P.getZ(i), h=hgt(x,z); P.setY(i,h);
      c.copy(c0).lerp(c1,ss(1,14,h)*(.8+.2*Math.sin(x*.21+z*.17))).lerp(c2,ss(140,230,h)).lerp(c3,ss(300,360,h)); cl.push(c.r,c.g,c.b); }
    geo.setAttribute('color',new T.Float32BufferAttribute(cl,3)); geo.computeVertexNormals();
    const t=new T.Mesh(geo,new T.MeshLambertMaterial({vertexColors:true})); t.receiveShadow=true; g.add(t); }
  // forest on the slopes, trees along the river
  { const L=[]; for(let x=-400;x<400;x+=7) for(let z=96;z<240;z+=7) for(const sz of [1,-1]){ const zz=sz*z+(rnd()-.5)*5, xx=x+(rnd()-.5)*5, h=hgt(xx,zz); if(h<3||h>210||rnd()<.35) continue; const s=.8+rnd()*.6; L.push(put(xx,h+4.5*s,zz,s,s,s,0)); }
    const im=inst(new T.ConeGeometry(2.6,9,7),M(0xffffff),L,true), tn=[0x2f4a2a,0x3a5631,0x283f25,0x45603a].map(col); L.forEach((_,i)=>im.setColorAt(i,tn[(i*7)%4])); }
  { const L=[]; for(let x=-400;x<400;x+=6) for(const o of [-9,9]){ if(rnd()<.3) continue; const s=1.6+rnd()*1.2; L.push(put(x+(rnd()-.5)*3,s*1.4,RIVER+4*Math.sin(x/45)+o+(rnd()-.5)*2,s,s*1.2,s,0)); }
    inst(new T.IcosahedronGeometry(1.5,1),M(0x58753a),L,true); }
  // river
  { const P=[], I=[]; for(let i=0;i<=160;i++){ const x=-410+i*820/160, zc=RIVER+4*Math.sin(x/45); P.push(x,.15,zc-6,x,.15,zc+6); if(i<160){ const a=i*2; I.push(a,a+1,a+2,a+1,a+3,a+2); } }
    const geo=new T.BufferGeometry(); geo.setAttribute('position',new T.Float32BufferAttribute(P,3)); geo.setIndex(I); geo.computeVertexNormals();
    const r=new T.Mesh(geo,std(0x86a9b8,.1,.22)); r.receiveShadow=true; g.add(r); }
  // roads: the asphalt main road with a dashed centre line, gravel back roads and farm lanes
  const asphalt=M(0x7e817d), gravel=M(0xc2b9a1), white=M(0xf2f0e8);
  flat(820,7,asphalt,0,.09,ROADZ);
  inst(BX(4,.02,.18),white,Array.from({length:68},(_,i)=>put(-404+i*12,.1,ROADZ,1,1,1,0)));
  for(const z of [BN,BS]) flat(LX[LX.length-1]-LX[0]+6,6,gravel,0,.08,z);
  for(const x of LX) flat(6,BN-BS,gravel,x,.07,(BN+BS)/2);
  // ---- parcels
  const WORK={'3,0':1,'1,3':1,'5,1':1,'6,2':1,'7,0':1,'2,2':1,'2,0':1,'5,3':1};      // robots work these, so no nets over them
  const stripes=(fg,bg,every)=>{ const t=E.canvasTex(32,64,(q,w,h)=>{ q.fillStyle=bg; q.fillRect(0,0,w,h); q.fillStyle=fg; q.fillRect(0,0,w,h*every); }); t.wrapS=t.wrapT=T.RepeatWrapping; return t; };
  const orchTex=stripes('#6b5a44','#88a35c',.24), cropTex=stripes('rgba(120,90,40,.55)','#c8b26c',.3);
  const PARCELS=[], trees=[], posts=[], fruit=[], nets=[];
  for(let r=0;r<4;r++) for(let c=0;c<9;c++){ const cx=(c-4)*STEP, cz=ROWS[r], key=c+','+r;
    if(c===4&&r<2) continue;                                                                  // the hub
    const kind=WORK[key]?'orchard':(['1,0','6,3'].includes(key)?'farm':((c*7+r*3)%10<7?'orchard':((c+r)%2?'meadow':'crop')));
    const p={c,r,cx,cz,kind}; PARCELS.push(p);
    if(kind==='orchard'){ const t=orchTex.clone(); t.needsUpdate=true; t.repeat.set(1,8); t.offset.set(0,-.12); flat(PW,PD,new T.MeshLambertMaterial({map:t}),cx,.06,cz);
      p.rows=[]; p.alleys=[]; const z0=cz-RS*3.5;
      for(let j=0;j<8;j++){ const z=z0+j*RS; p.rows.push(z); if(j<7) p.alleys.push(z+RS/2);
        for(let x=cx-PW/2+HL;x<=cx+PW/2-HL;x+=.95) trees.push([x+(rnd()-.5)*.1,z]);
        for(let x=cx-PW/2+HL-.3;x<=cx+PW/2-HL+.4;x+=9.6) posts.push(put(x,1.9,z,1,1,1,0)); }
      if(!WORK[key]&&(c+r)%2===0){ nets.push([cx,cz]); for(const z of p.rows) for(let x=cx-PW/2+HL-.3;x<=cx+PW/2-HL+.4;x+=9.6) posts.push(put(x,2.3,z,1,1.23,1,0)); } }
    else if(kind==='crop'){ const t=cropTex.clone(); t.needsUpdate=true; t.repeat.set(1,9); flat(PW,PD,new T.MeshLambertMaterial({map:t}),cx,.06,cz); }
    else flat(PW,PD,M([0x9bb36a,0xa9b878,0x8fae64][(c+r)%3]),cx,.06,cz); }
  // fruit walls: narrow canopies along the rows, with fruit on them
  { const tints=[0x3f6a32,0x4a7a3a,0x365c2b].map(col), im=new T.InstancedMesh(new T.IcosahedronGeometry(1,1),M(0xffffff),trees.length);
    trees.forEach(([x,z],i)=>{ const s=.9+rnd()*.2; dummy.position.set(x,1.95,z); dummy.rotation.set(0,(rnd()-.5)*.3,0); dummy.scale.set(.55*s,1.55*s,.42*s); dummy.updateMatrix(); im.setMatrixAt(i,dummy.matrix); im.setColorAt(i,tints[i%3]);
      for(let j=0;j<2;j++){ const a=rnd()*Math.PI*2, b=rnd()*1.6-.8; fruit.push(put(x+Math.cos(a)*.5*s*Math.cos(b),1.95+Math.sin(b)*1.4*s,z+Math.sin(a)*.4*s*Math.cos(b),1,1,1,0)); } });
    im.castShadow=true; im.receiveShadow=true; g.add(im);
    inst(new T.IcosahedronGeometry(.13,0),std(0xb8262b,0,.5),fruit,false);
    inst(BX(.09,3.8,.09),M(0xb4b2aa),posts,true); }
  // hail nets: dark, see-through roofs on posts
  { const netM=new T.MeshLambertMaterial({color:col(0x2c3136),transparent:true,opacity:.5,depthWrite:false,side:T.DoubleSide});
    for(const [cx,cz] of nets){ const m=mk(new T.PlaneGeometry(PW-HL*2+1.4,PD-2),netM,g,cx,4.6,cz,-Math.PI/2,0,0,true); m.castShadow=false; } }
  // ---- buildings
  const wallM=std(0xeee9df,0,.8), roofM=std(0x8a3b2a,0,.75), woodM=std(0x7b5a3a,0,.85), greyRoof=std(0x5b5e60,.1,.6), shell=std(SHELL,.05,.5), dark=std(DARK,.2,.55), red=std(ACC,0,.5);
  function prism(w,h,d){ const s=new T.Shape(); s.moveTo(-d/2,0); s.lineTo(d/2,0); s.lineTo(0,h); s.lineTo(-d/2,0); const geo=new T.ExtrudeGeometry(s,{depth:w,bevelEnabled:false}); geo.translate(0,0,-w/2); geo.rotateY(Math.PI/2); return geo; }
  function house(x,z,ry,w,d,h,roof){ const b=new T.Group(); b.position.set(x,0,z); b.rotation.y=ry||0; g.add(b);
    mk(BX(w,h,d),wallM,b,0,h/2,0); mk(prism(w+1,d*.42,d+1),roof||roofM,b,0,h,0); mk(BX(w*.8,.25,1.2),woodM,b,0,h*.62,d/2+.6,0,0,0,true);   // a wooden balcony
    for(let i=0;i<3;i++) mk(new T.PlaneGeometry(1.1,1.3),dark,b,(i-1)*w*.28,h*.35,d/2+.01,0,0,0,true); return b; }
  function barn(x,z,ry,w,d,h){ const b=new T.Group(); b.position.set(x,0,z); b.rotation.y=ry||0; g.add(b); mk(BX(w,h,d),woodM,b,0,h/2,0); mk(prism(w+.8,d*.38,d+.8),greyRoof,b,0,h,0); return b; }
  for(const p of PARCELS.filter(p=>p.kind==='farm')){ flat(PW-6,PD-6,M(0x9aaa6a),p.cx,.065,p.cz); house(p.cx-8,p.cz+2,0,12,9,7); barn(p.cx+9,p.cz-2,Math.PI/2,16,10,7);
    inst(new T.IcosahedronGeometry(2.4,1),M(0x56763a),[0,1,2,3].map(i=>put(p.cx-18+i*5,3.6,p.cz+10,1,1.2,1,0)),true); }
  // a village with its church at the west end of the valley
  for(let i=0;i<16;i++){ const x=-262-(i%4)*16-rnd()*4, z=(i<8?22:-12)+Math.floor((i%8)/4)*16*(i<8?1:-1)+rnd()*3; house(x,z,(rnd()-.5)*.3,9+rnd()*4,8+rnd()*2,6+rnd()*3); }
  { const ch=new T.Group(); ch.position.set(-300,0,4); g.add(ch); mk(BX(10,9,18),wallM,ch,0,4.5,0); mk(prism(10.8,6,19),greyRoof,ch,0,9,0); mk(BX(4.5,24,4.5),wallM,ch,0,12,-11);
    mk(new T.ConeGeometry(3.4,11,4),std(0x2f4f3a,.1,.5),ch,0,29.5,-11,0,Math.PI/4,0); }
  // ---- the hub: warehouse with workshop doors and a solar roof, office, a charging canopy, a loading dock on a one-way drive, bins
  const HUB={x0:-23,x1:23,z0:16,z1:78}, DRIVE={xin:-18,xout:18,z:22}, DOCK={x:6,z:22};
  flat(HUB.x1-HUB.x0,HUB.z1-HUB.z0,M(0xb3ae9f),0,.065,(HUB.z0+HUB.z1)/2);
  for(const [w,d,x,z] of [[6,DRIVE.z-ROADZ+3,DRIVE.xin,(DRIVE.z+ROADZ)/2],[DRIVE.xout-DRIVE.xin+6,6,0,DRIVE.z],[6,DRIVE.z-ROADZ+3,DRIVE.xout,(DRIVE.z+ROADZ)/2]]) flat(w,d,asphalt,x,.075,z);
  { const hb=new T.Group(); hb.position.set(-2,0,66); g.add(hb);
    mk(BX(34,9,16),shell,hb,0,4.5,0); mk(BX(34.6,.6,16.6),dark,hb,0,9.3,0); mk(BX(34.05,.6,16.05),red,hb,0,7.8,0);
    for(const x of [-11,-1,9]) mk(new T.PlaneGeometry(6,6),dark,hb,x,3,-8.02,0,Math.PI,0,true);
    inst(BX(2.1,.08,1.2),std(0x23324a,.4,.3),Array.from({length:36},(_,i)=>put(-2-13.6+(i%12)*2.5,9.7+0,66-5.2+Math.floor(i/12)*3.6,1,1,1,0)));
    const of=new T.Group(); of.position.set(15,0,48); g.add(of); mk(BX(10,7,9),wallM,of,0,3.5,0); mk(BX(10.4,.4,9.4),dark,of,0,7.2,0);
    for(let i=0;i<3;i++) mk(new T.PlaneGeometry(2,1.4),std(0x28394a,.3,.2),of,-3+i*3,4.5,-4.52,0,Math.PI,0,true);
    mk(CY(.15,.18,16,8),dark,g,-20,8,70); const bc=mk(new T.SphereGeometry(.5,12,8),MAT.beacon,g,-20,16.3,70,0,0,0,true); bc.castShadow=false; }
  const SLOTS=[-15,-9,-3,3,9,15].map(x=>[x,36]);
  { const cn=new T.Group(); g.add(cn); for(const x of [-18,-6,6,18]) for(const z of [33,39]) mk(CY(.12,.12,4.4,8),dark,cn,x,2.2,z);
    mk(BX(38,.3,8),shell,cn,0,4.5,36); inst(BX(2.3,.08,1.4),std(0x23324a,.4,.3),Array.from({length:30},(_,i)=>put(-17+(i%15)*2.42,4.72,33.8+Math.floor(i/15)*3.4,1,1,1,0)));
    for(const [x] of SLOTS) mk(BX(.4,1.3,.3),dark,cn,x+1.6,.65,39.6); }
  { const L=[]; for(let i=0;i<6;i++) for(let j=0;j<3;j++) for(let k=0;k<4;k++) L.push(put(-20.5+j*1.3,.4+k*.78,44+i*1.1,1,1,1,0)); inst(BX(1.2,.75,1.0),MAT.binGreen,L,true); }
  for(const [x,z,cc] of [[22,58,0x3e5f7d],[22,62,0x8b3a2f],[22,54,0xd9d6cf]]){ const car=new T.Group(); car.position.set(x-3,0,z); car.rotation.y=Math.PI/2; g.add(car); mk(RB(4.2,.9,1.8,.25),std(cc,.3,.4),car,0,.75,0); mk(RB(2.3,.7,1.6,.25),std(0x26323c,.4,.2),car,-.2,1.45,0); }
  inst(new T.IcosahedronGeometry(2.6,1),M(0x56763a),Array.from({length:9},(_,i)=>put(-20+i*5,3.8,76,1,1.25,1,0)),true);
  // ---- vehicles (true size, facing +x)
  const shellM=std(SHELL,.05,.4), darkM=std(DARK,.2,.5), rubber=MAT.rubber, amber=std(0xe1a52a,.1,.4);
  function robotModel(harvest){ const r=new T.Group(); g.add(r);
    for(const ex of [1,-1]) for(const sz of [1,-1]){ mk(RB(.33,.36,.27,.04),shellM,r,ex*.785,.68,sz*.865); mk(CY(.21,.21,.14,14),rubber,r,ex*.785,.21,sz*.865,Math.PI/2,0,0); mk(BX(.12,2.9,.12),darkM,r,ex*.52,1.78,sz*.77); }
    mk(RB(1.9,.1,1.66,.03),darkM,r,0,3.27,0); mk(RB(1.42,.06,1.32,.03),shellM,r,0,3.34,0); mk(BX(1.2,.22,1.4),darkM,r,0,1.51,0);
    for(const sz of [1,-1]){ mk(BX(1.9,.04,.02),amber,r,0,3.2,sz*.84,0,0,0,true); for(const x of [.52,-.52]) for(const y of [1.15,2.3]){ mk(BX(.42,.09,.09),shellM,r,x*.8,y,sz*1.0,0,sz*.5,0); } }
    if(harvest) mk(BX(1.2,.72,1.0),MAT.binGreen,r,-.1,.42,0);
    r.userData.L=1.9; return r; }
  const DECK=1.22, DECK_X=-1.5, REAR=-5.15, RAMP=3.2, RAMP_A=Math.asin(DECK/RAMP), FOOT=REAR-RAMP*Math.cos(RAMP_A), BEHIND=FOOT-1.6;
  function truckModel(){ const t=new T.Group(); g.add(t);
    mk(RB(2.3,2.6,2.5,.18),shellM,t,4.05,2.05,0); mk(new T.PlaneGeometry(2,1.05),std(0x1d2a33,.3,.15),t,5.21,2.65,0,0,Math.PI/2,0,true);
    mk(BX(2.32,.3,2.52),red,t,4.05,1.05,0); mk(BX(.4,.2,.6),amber,t,4.05,3.42,0); mk(BX(.1,.5,2.2),darkM,t,5.22,1.25,0);
    mk(BX(9.8,.35,1.1),darkM,t,-.4,.78,0); mk(BX(7.2,.2,2.5),darkM,t,DECK_X,DECK-.1,0);
    for(const x of [3.7,-2.7,-4]) for(const z of [1.02,-1.02]) mk(CY(.52,.52,.42,16),rubber,t,x,.52,z,Math.PI/2,0,0);
    t.userData.ramps=[.62,-.62].map(z=>{ const pv=new T.Group(); pv.position.set(REAR,DECK,z); t.add(pv); mk(BX(RAMP,.08,.62),std(0x8d9396,.6,.4),pv,-RAMP/2,0,0); pv.rotation.z=-Math.PI/2; return pv; });
    return t; }
  // ---- the road network: junctions where lanes meet the roads, plus the hub's one-way drive
  const NODES=[], EDGES=new Map(), key=(x,z)=>x.toFixed(1)+','+z.toFixed(1), byKey=new Map();
  const node=(x,z)=>{ const k=key(x,z); if(!byKey.has(k)){ byKey.set(k,NODES.length); NODES.push([x,z]); EDGES.set(NODES.length-1,[]); } return byKey.get(k); };
  const link=(a,b,one)=>{ EDGES.get(a).push(b); if(!one) EDGES.get(b).push(a); };
  for(const x of LX) for(let j=0;j<2;j++) link(node(x,ZJ[j]),node(x,ZJ[j+1]));
  for(const z of ZJ){ const xs=[...LX]; if(z===ROADZ) xs.push(DRIVE.xin,DRIVE.xout); xs.sort((a,b)=>a-b); for(let i=0;i<xs.length-1;i++) link(node(xs[i],z),node(xs[i+1],z)); }
  const HIN=node(DRIVE.xin,ROADZ), H1=node(DRIVE.xin,DRIVE.z), H2=node(DRIVE.xout,DRIVE.z), HOUT=node(DRIVE.xout,ROADZ);
  link(HIN,H1,1); link(H1,H2,1); link(H2,HOUT,1);
  // shortest route without U-turns: states are (node, previous node); lanes another truck works on cost extra
  function route(fromPrev,from,goals,avoid){ const dist=new Map(), prev=new Map(), Q=[[0,from,fromPrev]]; dist.set(from+'|'+fromPrev,0);
    while(Q.length){ Q.sort((a,b)=>a[0]-b[0]); const [d0,u,pu]=Q.shift(); const sk=u+'|'+pu; if(d0>dist.get(sk)) continue;
      if(goals.has(u)){ const out=[u]; let k=sk; while(prev.has(k)){ const [pn,pp]=prev.get(k); out.unshift(pn); k=pn+'|'+pp; } return {nodes:out,cost:d0+goals.get(u),last:u,lastPrev:pu}; }
      for(const v of EDGES.get(u)){ if(v===pu) continue; const [ux,uz]=NODES[u], [vx,vz]=NODES[v]; let w=Math.hypot(vx-ux,vz-uz); if(ux===vx&&avoid.has(ux)&&uz!==vz) w+=400;
        const nk=v+'|'+u, nd=d0+w; if(nd<(dist.has(nk)?dist.get(nk):1e9)){ dist.set(nk,nd); prev.set(nk,[u,pu]); Q.push([nd,v,u]); } } }
    return null; }
  // a stop: on a parcel's east lane beside its middle, or at the hub dock
  const stopOf=dst=>dst==='hub'?{x:DOCK.x,z:DOCK.z,ends:[[H1,H2]]}:{x:dst.cx+STEP/2,z:dst.cz,ends:(()=>{ const zs=ZJ.filter(z=>z<dst.cz), zb=Math.max(...zs), za=Math.min(...ZJ.filter(z=>z>dst.cz)); return [[node(dst.cx+26,zb),node(dst.cx+26,za)],[node(dst.cx+26,za),node(dst.cx+26,zb)]]; })()};
  // drive on the right: offset the centre line, then round every corner and resample every metre
  const OFF=1.6;
  function lanePath(pts){ const n=pts.length, out=[];
    for(let i=0;i<n;i++){ const a=pts[Math.max(0,i-1)], b=pts[i], c=pts[Math.min(n-1,i+1)];
      const d1=i>0?[b[0]-a[0],b[1]-a[1]]:[c[0]-b[0],c[1]-b[1]], d2=i<n-1?[c[0]-b[0],c[1]-b[1]]:d1, l1=Math.hypot(...d1)||1, l2=Math.hypot(...d2)||1;
      const n1=[-d1[1]/l1,d1[0]/l1], n2=[-d2[1]/l2,d2[0]/l2], m=[n1[0]+n2[0],n1[1]+n2[1]], lm=Math.hypot(...m)||1, k=OFF/Math.max(.3,(m[0]*n1[0]+m[1]*n1[1])/lm);
      out.push([b[0]+m[0]/lm*k,b[1]+m[1]/lm*k]); }
    const R=[], rad=[]; R.push(out[0]); rad.push(1e9);
    for(let i=1;i<n-1;i++){ const a=out[i-1], b=out[i], c=out[i+1], la=Math.hypot(b[0]-a[0],b[1]-a[1]), lc=Math.hypot(c[0]-b[0],c[1]-b[1]);
      const cr=Math.abs(((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]))/(la*lc||1));
      if(cr<.05){ R.push(b); rad.push(1e9); continue; }
      const r=Math.min(9,la*.45,lc*.45), p0=[b[0]-(b[0]-a[0])/la*r,b[1]-(b[1]-a[1])/la*r], p2=[b[0]+(c[0]-b[0])/lc*r,b[1]+(c[1]-b[1])/lc*r];
      for(let k=0;k<=8;k++){ const t=k/8, u=1-t; R.push([u*u*p0[0]+2*u*t*b[0]+t*t*p2[0],u*u*p0[1]+2*u*t*b[1]+t*t*p2[1]]); rad.push(r*.8); } }
    R.push(out[n-1]); rad.push(1e9);
    // resample every metre with a speed limit: road 9 m/s, lanes 6, the hub drive 3.5; corners √(a·r); brake for the stop
    const Q=[R[0]], lim=[]; let acc=0;
    for(let i=1;i<R.length;i++){ const a=R[i-1], b=R[i], L=Math.hypot(b[0]-a[0],b[1]-a[1]); let s=1-acc;
      while(s<=L){ Q.push([a[0]+(b[0]-a[0])*s/L,a[1]+(b[1]-a[1])*s/L,rad[i]]); s+=1; } acc=L-(s-1); }
    Q.push([...R[R.length-1],1e9]);
    for(const q of Q){ const inHub=q[0]>HUB.x0&&q[0]<HUB.x1&&q[1]>ROADZ+4; let v=Math.abs(q[1]-ROADZ)<4&&!inHub?9:inHub?3.5:6; if(q[2]<1e8) v=Math.min(v,Math.sqrt(1.6*q[2])); lim.push(v); }
    lim[lim.length-1]=0; for(let i=lim.length-2;i>=0;i--) lim[i]=Math.min(lim[i],Math.sqrt(lim[i+1]*lim[i+1]+2*1.8*1));
    return {pts:Q,lim}; }
  // ---- trucks
  const TR=[], RBT=[];
  function truck(A,B,id){ const t={id,m:truckModel(),A,B,s:0,v:0,ramp:0,rampTo:0,i:0,pre:[]}; TR.push(t); return t; }
  function plan(t,dst){ const st=stopOf(dst), goals=new Map(); for(const [a] of st.ends) goals.set(a,Math.hypot(NODES[a][0]-st.x,NODES[a][1]-st.z));
    const avoid=new Set(TR.filter(o=>o!==t).flatMap(o=>[o.A.cx+26,o.B.cx+26])); avoid.delete(st.x);
    const r=route(t.prev,t.next,goals,avoid), pts=[t.cpos,...r.nodes.map(i=>NODES[i]),[st.x,st.z]];
    const end=st.ends.find(e=>e[0]===r.last); t.prev=end[0]; t.next=end[1]; t.cpos=[st.x,st.z]; t.path=lanePath(pts); t.s=0; }
  const at=(t,s)=>{ const P=t.path.pts, i=Math.min(P.length-2,Math.floor(s)), u=Math.min(1,s-i), a=P[i], b=P[i+1]; return [a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u,Math.atan2(-(b[1]-a[1]),b[0]-a[0])]; };
  // anything in the lane ahead? (a stopped truck needs room behind it for its ramps and robot)
  function blocked(t){ const h=[Math.cos(t.yaw),-Math.sin(t.yaw)], look=11+t.v*2.2;
    for(const o of TR){ if(o===t) continue; const rx=o.pos[0]-t.pos[0], rz=o.pos[1]-t.pos[1], ahead=rx*h[0]+rz*h[1], lat=Math.abs(rx*h[1]-rz*h[0]);
      if(ahead>0&&lat<3&&ahead<look+(o.v<.1?10:0)){ const back=TR.indexOf(o)<TR.indexOf(t)?false:true; if(!(o.blockedBy===t&&back)) return o; } }
    for(const r of RBT){ if(r.st==='truck') continue; const rx=r.x-t.pos[0], rz=r.z-t.pos[1], ahead=rx*h[0]+rz*h[1], lat=Math.abs(rx*h[1]-rz*h[0]); if(ahead>0&&ahead<look&&lat<2.8) return r; }
    return null; }
  function drive(t,dt){ const P=t.path, n=P.pts.length-1, i=Math.min(n,Math.floor(t.s)), lim=P.lim[i]+(P.lim[Math.min(n,i+1)]-P.lim[i])*(t.s-i);
    const o=blocked(t); t.blockedBy=o; const want=o?0:lim;
    t.v=want<t.v?Math.max(want,t.v-(o?4:2.2)*dt):Math.min(want,t.v+1.4*dt); if(!o&&t.v<.4&&t.s<n-.05) t.v=Math.min(Math.max(t.v,.4),lim+.4);
    t.s=Math.min(n,t.s+t.v*dt); const [x,z,y]=at(t,Math.max(.01,t.s)); t.pos=[x,z]; if(t.s<n-.2) t.yaw=yawTo(t.yaw,y,.5);
    return t.s>=n-.02&&t.v<.05; }
  // world position of a point given in the truck's frame
  const tw=(t,lx,lz)=>{ const c=Math.cos(t.yaw), s=Math.sin(t.yaw); return [t.pos[0]+lx*c+lz*s,t.pos[1]-lx*s+lz*c]; };
  // ---- robots: a list of moves done in order
  function robot(harvest){ const r={m:robotModel(harvest),x:0,z:0,y:0,pitch:0,yaw:0,v:0,q:[],st:'idle'}; RBT.push(r); return r; }
  function stepRobot(r,dt){ const m=r.q[0];
    if(!m){ r.st=r.st==='truck'?'truck':'idle'; }
    else if(m.crab||m.go){ const [tx,tz]=typeof m.to==='function'?m.to():m.to, dx=tx-r.x, dz=tz-r.z, D=Math.hypot(dx,dz), vmax=m.v||.9;
      r.v=Math.min(vmax,r.v+.6*dt,Math.sqrt(2*.6*D)); if(D<.03){ r.x=tx; r.z=tz; r.q.shift(); if(!r.q[0]||!(r.q[0].crab||r.q[0].go)) r.v=0; } else { const s=Math.min(D,r.v*dt); r.x+=dx/D*s; r.z+=dz/D*s; } }
    else if(m.turn!=null){ const want=typeof m.turn==='function'?m.turn():m.turn, d=Math.atan2(Math.sin(want-r.yaw),Math.cos(want-r.yaw)); if(Math.abs(d)<.01){ r.yaw=want; r.q.shift(); } else r.yaw+=Math.sign(d)*Math.min(Math.abs(d),.45*dt); }
    else if(m.ramp){ const t=m.ramp; if(t.ramp<.999){ t.rampTo=1; } else { m.u=(m.u||0)+.55*dt/(DECK_X-BEHIND); const u=Math.min(1,m.u), lx=m.dir==='off'?DECK_X+(BEHIND-DECK_X)*u:BEHIND+(DECK_X-BEHIND)*u;
        const y=lx>=REAR?DECK:lx<=FOOT?0:(lx-FOOT)/(REAR-FOOT)*DECK; r.y=y; r.pitch=lx<REAR+.95&&lx>FOOT-.95?RAMP_A*clamp(Math.min(lx-FOOT+.95,REAR+.95-lx)/1.9,0,1):0;
        [r.x,r.z]=tw(t,lx,0); r.yaw=t.yaw; r.st=m.dir==='off'?'ramp':'ramp';
        if(u>=1){ r.q.shift(); r.st=m.dir==='on'?'truck':'idle'; r.truck=m.dir==='on'?t:null; r.y=m.dir==='on'?DECK:0; r.pitch=0; } } }
    else if(m.work){ const p=m.work; if(!m.path){ const E0=p.cx+PW/2-2.2, W0=p.cx-PW/2+2.2; m.path=[]; p.alleys.forEach((z,j)=>m.path.push(j%2?[W0,z]:[E0,z],j%2?[E0,z]:[W0,z])); m.k=0; m.dirn=1; }
      if(m.recall){ const E0=p.cx+PW/2-2.2, near=p.alleys.reduce((a,b)=>Math.abs(b-r.z)<Math.abs(a-r.z)?b:a);
        const out=Math.abs(r.x-E0)<.1?[]:Math.abs(r.z-near)<.05?[{go:1,to:[E0,near],v:1}]:[{go:1,to:[r.x,near],v:.6},{go:1,to:[E0,near],v:1}];
        r.v=0; r.q.splice(0,1,...out,...m.recall); }
      else { const [tx,tz]=m.path[m.k], dx=tx-r.x, dz=tz-r.z, D=Math.hypot(dx,dz), sp=Math.abs(dz)>Math.abs(dx)?.6:1; r.v=Math.min(sp,r.v+.5*dt,Math.sqrt(2*.5*D)+.05);
        if(D<.03){ m.k+=m.dirn; if(m.k>=m.path.length||m.k<0){ m.dirn*=-1; m.k+=2*m.dirn; } r.v=0; } else { const s=Math.min(D,r.v*dt); r.x+=dx/D*s; r.z+=dz/D*s; } } }
    if(r.st==='truck'&&r.truck){ [r.x,r.z]=tw(r.truck,DECK_X,0); r.yaw=r.truck.yaw; r.y=DECK; }
    r.m.position.set(r.x,r.y,r.z); r.m.rotation.set(0,r.yaw,0); r.m.rotateZ(r.pitch); }
  // ---- what a truck does at a stop
  const behind=t=>()=>tw(t,BEHIND,0), gateZ=t=>behind(t)()[1];
  function stepTruck(t,dt){ t.ramp+=(t.rampTo-t.ramp)*Math.min(1,dt*1.6); if(Math.abs(t.rampTo-t.ramp)<.002) t.ramp=t.rampTo;
    t.m.userData.ramps.forEach(p=>p.rotation.z=-Math.PI/2+(Math.PI/2+RAMP_A)*t.ramp);
    const S_=t.pre.length?t.pre[0]:t.steps[t.i], next=()=>{ if(t.pre.length) t.pre.shift(); else t.i=(t.i+1)%t.steps.length; t.busy=false; };
    if(S_[0]==='go'){ if(!t.busy){ if(t.ramp>0){ t.rampTo=0; } else { plan(t,S_[1]); t.busy=true; } } else if(drive(t,dt)) next(); }
    else { const r=t.r[S_[1]], dst=S_[2];
      if(!t.busy){ t.busy=true; t.rampTo=1;
        // where the robot goes once it is off: fixed now, while the truck stands (it drives on as soon as the robot is down)
        if(S_[0]==='drop'){ const bh=behind(t)(), off=dst==='hub'?[{crab:1,to:[bh[0],DRIVE.z+6]},{crab:1,to:[r.slot[0],DRIVE.z+6]},{crab:1,to:r.slot}]
            :[{crab:1,to:[dst.cx+PW/2-2.2,bh[1]]},{turn:0},{work:dst}];
          r.q=[{ramp:t,dir:'off'},...off]; }
        else { const on=[{crab:1,to:behind(t)},{turn:()=>t.yaw},{ramp:t,dir:'on'}];
          if(dst==='hub') r.q=[{crab:1,to:[r.slot[0],DRIVE.z+6]},{crab:1,to:()=>[behind(t)()[0],DRIVE.z+6]},...on];
          else { const E0=dst.cx+PW/2-2.2; r.q[0].recall=[{go:1,to:()=>[E0,gateZ(t)],v:.6},...on]; } } }
      const done=S_[0]==='drop'?(r.st!=='truck'&&!r.q.some(m=>m.ramp)):(r.st==='truck');
      if(done&&r.q.every(m=>!m.ramp)) next(); }
    t.m.position.set(t.pos[0],0,t.pos[1]); t.m.rotation.y=t.yaw; }
  const P=(c,r)=>PARCELS.find(p=>p.c===c&&p.r===r);
  // each truck swaps its two robots between the hub and its two blocks: hub → A, hub → B, B → A, A → hub, hub → B, B → hub
  const CYCLE=(A,B)=>[['load',0,'hub'],['go',A],['drop',0,A],['go','hub'],['load',1,'hub'],['go',B],['drop',1,B],['go',A],['load',0,A],['go','hub'],['drop',0,'hub'],['go',B],['load',1,B],['go','hub'],['drop',1,'hub']];
  [[P(3,0),P(1,3)],[P(5,1),P(6,2)],[P(7,0),P(2,2)]].forEach(([A,B],k)=>{ const t=truck(A,B,k); t.r=[robot(k!==1),robot(k===1)]; t.steps=CYCLE(A,B); });
  RBT.forEach((r,i)=>{ r.slot=SLOTS[i]; [r.x,r.z]=r.slot; });
  // one dock: the first truck starts at it, the other two on the main road on their way in (driving on the right: +z heading east)
  { const [a,b,c]=TR; a.cpos=[DOCK.x,DOCK.z]; a.pos=[DOCK.x,DOCK.z+OFF]; a.yaw=0; a.prev=H1; a.next=H2;
    b.cpos=[-110,ROADZ]; b.pos=[-110,ROADZ+OFF]; b.yaw=0; b.prev=node(-130,ROADZ); b.next=node(-78,ROADZ); b.pre=[['go','hub']];
    c.cpos=[110,ROADZ]; c.pos=[110,ROADZ-OFF]; c.yaw=Math.PI; c.prev=node(130,ROADZ); c.next=node(78,ROADZ); c.pre=[['go','hub']]; }
  for(const [c,r,h] of [[2,0,0],[5,3,1]]){ const o=robot(h), p=P(c,r); o.x=p.cx+PW/2-2.2; o.z=p.alleys[3]; o.q=[{work:p}]; }
  const step=dt=>{ for(const t of TR) stepTruck(t,dt); for(const r of RBT) stepRobot(r,dt); };
  for(let k=0;k<2400;k++) step(.1);                                                           // let the valley settle into its rhythm
  const W=(x,y,z)=>{ const v=V(x,y,z); g.updateMatrixWorld(true); return g.localToWorld(v).toArray(); };
  return {g,cam:{p:W(132,60,-50),t:W(4,4,40)},fog:[90,260],shadow:44,
    enter(){ g.visible=true; }, exit(){ g.visible=false; },
    update(dt){ step(Math.min(dt,.05)); }};
}

const build=Build();
return {workers:Workers(),build,evolve:Evolve(build),globe:Globe(),valley:Valley()};
};
