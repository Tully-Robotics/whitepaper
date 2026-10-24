window.__runSim=function(){
(function(){
"use strict";
// ================================================================== constants: orchard (same block as Rev 0)
const ROW=3.1, HALF=ROW/2, TREE=0.9, ROW_X0=-31, ROW_X1=31;
const FRUIT_PER_M_SIDE=45, Z_MU=1.5, Z_SD=0.66, Y_SD=0.244, D_SD=0.159;
const P_DETECT=0.93, IND_SHARE=0.12;
const N_ALLEY=4, ROW_END=31.3, CANOPY_OH=0.35, CANOPY_END=ROW_END+CANOPY_OH;
let HEAD_W=2.5;                           // headland depth, end posts to the boundary (hedge, ditch, next block)
const ZK=k=>k*ROW;
let ALLEY=0, DIR=1;                       // current alley and its travel direction in world x (+1 / -1)
const ROAD_Z=-HALF-2.25;                  // field road along the outside of the block (depots at both ends)
// ================================================================== machine (world-aligned; it never rotates)
// Bidirectional portal on four swerve wheels. The bin carrier drives into a tunnel between the wheel towers, so the
// machine plus its filling carrier is only M_LEN long; at a row end it crabs sideways into the next alley.
const M_LEN=1.90, M_HX=M_LEN/2;
const TOWER_X=0.785, POD_HX=0.165, POD_Z0=0.73, POD_Z1=1.00, POD_Y1=0.85;   // corner pods (wheel, drive, battery)
const WHEEL_R=0.21, WHEEL_W=0.14, WHEEL_Z=0.865;
const MAST_X=0.52, MAST_Z=0.77, MAST_Y0=0.28, ROOF_Y=3.22;                    // lift columns in the side walls, just inboard of the pods
const TUN_HW=0.70, TUN_H=1.38;                                                // carrier tunnel: 1.40 m wide, 1.38 m clear
const BRIDGE_Y0=1.40, BRIDGE_Y1=1.62, BRIDGE_HZ=0.70;
const BASE_X=0.52;                                                            // cobot base |x|: straight out from its column
const SLIDE_Z0=0.98, SLIDE_Z1=1.14;                                           // cobot base |z| range on the in-out slide
const ZW=0.76;                                                                // side wall: no part of an arm may come inboard of |z| = ZW
const LOW_Y=[0.82,1.50], HIGH_Y=[2.25,2.95], BAND_Y=1.55;                     // standing (lower) and hanging (upper) base heights
const STOW_W=1.14;                                                            // half width with the arms stowed
const CAR_L=1.75, CAR_HX=CAR_L/2, CAR_HW=0.66, CAR_H=1.32;                    // straddle carrier: bin + industry crate, 1.32 m wide
const BIN_CAP=1540, CRATE_CAP=240, CAR_V=1.5, CAR_VS=0.5;
const FILL_BUF=80;                                                            // fruit the filler can hold while carriers swap
// cobots (standard DH, metres). FR5 from Fairino, UR5e from Universal Robots datasheets
const COBOTS={
  fr5: {name:'Fairino FR5', d:[0.152,0,0,0.102,0.102,0.100], a:[0,-0.425,-0.395,0,0,0], reach:0.922, mass:22.0, v:1.0, power:0.25, price:4900},
  ur5e:{name:'UR5e',        d:[0.1625,0,0,0.1333,0.0997,0.0996], a:[0,-0.425,-0.3922,0,0,0], reach:0.850, mass:20.7, v:1.0, power:0.25, price:null}
};
const DH_AL=[Math.PI/2,0,0,Math.PI/2,-Math.PI/2,0];
let COBOT='fr5';
// end-of-arm options: the hand is hand D (3 fingers, fingertip cameras, pneumatic cutter; cobot J6 does the roll fallback)
const EOATS={
  direct:{name:'Hand on the flange', len:0.20, mass:1.35, approach:0.12, va:0.30},
  tele:  {name:'Mini-telescope + hand', len:0.40, ext:0.30, mass:3.1, approach:0.30, va:1.0}
};
let EOAT='direct';
let DELIV='drop';                        // 'carry' | 'tube' | 'drop'
const T_LOOK=0.15, T_GRASP=0.35, T_CHECK=0.12, T_SEAT=0.18, T_CUT=0.09, T_SEARCH=0.12, T_ROLL=0.41, T_PLACE=0.15, T_REL=0.12, T_FLIP=0.25, T_DROP=0.20;
const P_STEM=0.80, P_CUT=0.97, P_ROLL=0.85, K_ROLL=0.85;   // stem seen and reachable, throat beam breaks (cut), roll detaches, stalk kept when rolled
const SOCK_MAX=1.25, SOCK_V=0.7, BELT_V=0.5;
const ACC=3.0, VZ=0.8, AZ=3.0, VY=0.5, AY=2.0;
let ARMS=8;                                // 4, 6 or 8
// deterministic RNG so every reload shows the same orchard
let seed=20260923; function rnd(){ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; }
function gauss(){ let u=0,v=0; while(u===0)u=rnd(); v=rnd(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }
function poisson(l){ let L=Math.exp(-l),k=0,p=1; do{k++;p*=rnd();}while(p>L); return k-1; }
function trap(d,v,a){ d=Math.abs(d); return d<v*v/a ? 2*Math.sqrt(d/a) : d/v+v/a; }
function smooth(u){ u=Math.min(1,Math.max(0,u)); return u*u*(3-2*u); }
function clamp(v,a,b){ return Math.min(b,Math.max(a,v)); }
const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();

// ================================================================== renderer
const canvas=document.getElementById('c');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
renderer.outputEncoding=THREE.sRGBEncoding;
renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.0;
renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(42,1,0.03,260);
const controls=new THREE.OrbitControls(camera,canvas);
controls.enableDamping=true; controls.dampingFactor=0.08; controls.maxPolarAngle=Math.PI*0.495; controls.minDistance=0.5; controls.maxDistance=60;
{ const pm=new THREE.PMREMGenerator(renderer); scene.environment=pm.fromScene(new THREE.RoomEnvironment(),0.04).texture; pm.dispose(); }

const C=h=>new THREE.Color(h).convertSRGBToLinear();
function std(hex,met,rou,extra){ return new THREE.MeshStandardMaterial(Object.assign({color:C(hex),metalness:met,roughness:rou,envMapIntensity:0.55},extra||{})); }

// ================================================================== canvas textures
function canvasTex(w,h,draw,opts){ const c=document.createElement('canvas'); c.width=w; c.height=h; const g=c.getContext('2d'); draw(g,w,h);
  const t=new THREE.CanvasTexture(c); t.encoding=THREE.sRGBEncoding; t.anisotropy=4; if(opts&&opts.repeat){ t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(opts.repeat[0],opts.repeat[1]); } return t; }
const TEX={};
TEX.leaf=canvasTex(256,256,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  // a short shoot running corner to corner with alternate, serrated oval leaves on petioles
  g.strokeStyle='#5b4632'; g.lineWidth=3; g.beginPath(); g.moveTo(30,226); g.quadraticCurveTo(120,150,226,34); g.stroke();
  const nodes=[[58,200,-1],[86,176,1],[112,150,-1],[138,124,1],[164,98,-1],[190,70,1],[214,44,0]];
  for(const [x,y,sd] of nodes){ const base=-0.78+(sd*1.05)+(sd===0?0:0); const a=(sd===0? -0.8 : -0.8+sd*0.95)+((x*13)%7-3)*0.06;
    const L=40+((x*7+y*3)%16), W=L*0.5, px=x+Math.cos(a)*10, py=y+Math.sin(a)*10;
    g.strokeStyle='#5d6b35'; g.lineWidth=1.6; g.beginPath(); g.moveTo(x,y); g.lineTo(px,py); g.stroke();
    g.save(); g.translate(px,py); g.rotate(a+Math.PI/2);
    const under=((x+y)%3===0);
    const gr=g.createLinearGradient(-W,0,W,0); gr.addColorStop(0,under?'#7e9460':'#35532a'); gr.addColorStop(0.5,under?'#9aad76':'#4f7236'); gr.addColorStop(1,under?'#869b66':'#3b5b2d');
    g.fillStyle=gr; g.beginPath(); g.moveTo(0,0);
    const steps=18; for(let i=0;i<=steps;i++){ const t=i/steps, yy=-t*L*2, ww=Math.sin(Math.PI*Math.pow(t,0.8))*W*(1+((i%2)?0.06:-0.03)); g.lineTo(ww,yy); }
    for(let i=steps;i>=0;i--){ const t=i/steps, yy=-t*L*2, ww=Math.sin(Math.PI*Math.pow(t,0.8))*W*(1+((i%2)?-0.03:0.06)); g.lineTo(-ww,yy); }
    g.closePath(); g.fill();
    g.strokeStyle=under?'rgba(230,240,200,0.5)':'rgba(170,200,120,0.35)'; g.lineWidth=1.2; g.beginPath(); g.moveTo(0,0); g.lineTo(0,-L*1.9); g.stroke();
    g.restore(); }
});
TEX.grass=canvasTex(256,256,(g,w,h)=>{ g.fillStyle='#6f8a4a'; g.fillRect(0,0,w,h);
  for(let i=0;i<5200;i++){ const x=rnd()*w,y=rnd()*h,l=2+rnd()*5; const c=70+rnd()*60|0; g.strokeStyle=`rgba(${c-25},${c+40},${c-40},0.55)`; g.beginPath(); g.moveTo(x,y); g.lineTo(x+(rnd()-.5)*2,y-l); g.stroke(); } },{repeat:[90,90]});
TEX.soil=canvasTex(128,128,(g,w,h)=>{ g.fillStyle='#6b5a44'; g.fillRect(0,0,w,h); for(let i=0;i<1400;i++){ const c=80+rnd()*50|0; g.fillStyle=`rgba(${c},${c-15},${c-35},0.5)`; g.fillRect(rnd()*w,rnd()*h,1+rnd()*2,1+rnd()*2);} },{repeat:[40,1]});
TEX.alley=canvasTex(256,64,(g,w,h)=>{ g.fillStyle='#7e9651'; g.fillRect(0,0,w,h);
  for(let i=0;i<2600;i++){ const x=rnd()*w,y=rnd()*h,c=90+rnd()*60|0; g.fillStyle=`rgba(${c-30},${c+30},${c-50},0.5)`; g.fillRect(x,y,1,2+rnd()*3); }
  for(const yy of [16,48]){ const gr=g.createLinearGradient(0,yy-7,0,yy+7); gr.addColorStop(0,'rgba(90,80,55,0)'); gr.addColorStop(0.5,'rgba(95,82,58,0.55)'); gr.addColorStop(1,'rgba(90,80,55,0)'); g.fillStyle=gr; g.fillRect(0,yy-7,w,14);} },{repeat:[30,1]});
TEX.gravel=canvasTex(128,128,(g,w,h)=>{ g.fillStyle='#9a927c'; g.fillRect(0,0,w,h); for(let i=0;i<1800;i++){ const c=120+rnd()*70|0; g.fillStyle=`rgb(${c},${c-6},${c-22})`; g.fillRect(rnd()*w,rnd()*h,1+rnd()*2.5,1+rnd()*2.5);} },{repeat:[4,6]});
TEX.binSide=canvasTex(256,192,(g,w,h)=>{ g.fillStyle='#3f7d3a'; g.fillRect(0,0,w,h);
  g.fillStyle='#2f6a2b'; for(let r=0;r<5;r++) for(let c=0;c<9;c++){ const x=18+c*26, y=28+r*30; g.beginPath(); g.roundRect?g.roundRect(x,y,14,20,3):g.rect(x,y,14,20); g.fill(); }
  g.fillStyle='rgba(255,255,255,0.08)'; g.fillRect(0,0,w,10); g.fillStyle='rgba(0,0,0,0.18)'; g.fillRect(0,h-16,w,16); });
TEX.pile=canvasTex(256,256,(g,w,h)=>{ g.fillStyle='#5a1a18'; g.fillRect(0,0,w,h);
  for(let i=0;i<260;i++){ const x=rnd()*w,y=rnd()*h,r=11+rnd()*5; const gr=g.createRadialGradient(x-r*0.35,y-r*0.35,1,x,y,r); const blush=rnd();
    gr.addColorStop(0,blush>0.7?'#f0c05a':'#ff6b58'); gr.addColorStop(0.55,blush>0.7?'#c8742c':'#c42a26'); gr.addColorStop(1,'#5a1412'); g.fillStyle=gr; g.beginPath(); g.arc(x,y,r,0,Math.PI*2); g.fill(); } });
TEX.pileInd=canvasTex(256,256,(g,w,h)=>{ g.fillStyle='#4a3314'; g.fillRect(0,0,w,h);
  for(let i=0;i<260;i++){ const x=rnd()*w,y=rnd()*h,r=9+rnd()*6; const gr=g.createRadialGradient(x-r*0.35,y-r*0.35,1,x,y,r);
    gr.addColorStop(0,'#e9b85a'); gr.addColorStop(0.6,rnd()>0.5?'#a8662a':'#8f3d22'); gr.addColorStop(1,'#3a2410'); g.fillStyle=gr; g.beginPath(); g.arc(x,y,r,0,Math.PI*2); g.fill(); } });
TEX.hazard=canvasTex(128,32,(g,w,h)=>{ g.fillStyle='#1d1d1d'; g.fillRect(0,0,w,h); g.fillStyle='#e8b923'; for(let x=-32;x<w+32;x+=32){ g.beginPath(); g.moveTo(x,0); g.lineTo(x+16,0); g.lineTo(x+16-h,h); g.lineTo(x-h,h); g.fill(); } });
TEX.rack=canvasTex(256,16,(g,w,h)=>{ g.fillStyle='#7d858c'; g.fillRect(0,0,w,h); g.fillStyle='#4a5157'; for(let x=0;x<w;x+=8){ g.fillRect(x,0,3,h);} },{repeat:[40,1]});
TEX.plate=canvasTex(128,128,(g,w,h)=>{ g.fillStyle='#8e959a'; g.fillRect(0,0,w,h); g.fillStyle='rgba(255,255,255,0.18)';
  for(let y=0;y<h;y+=16) for(let x=(y/16)%2?8:0;x<w;x+=16){ g.save(); g.translate(x+4,y+4); g.rotate(0.8); g.fillRect(-4,-1.2,8,2.4); g.restore(); } },{repeat:[10,3]});
TEX.vent=canvasTex(64,64,(g,w,h)=>{ g.fillStyle='#2e3338'; g.fillRect(0,0,w,h); g.fillStyle='#15181b'; for(let y=6;y<h;y+=8) g.fillRect(6,y,w-12,3); },{repeat:[1,1]});
TEX.screen=canvasTex(256,160,(g,w,h)=>{ g.fillStyle='#0d1a24'; g.fillRect(0,0,w,h); g.fillStyle='#d9a83a'; g.font='bold 20px monospace'; g.fillText('TULLY H2',14,30);
  g.fillStyle='#7fb3d5'; g.font='14px monospace'; ['COBOTS 8/8  OK','RATE  2.0 fr/s','BIN F 43 %  I 6 %','AIR   6.1 bar','BATT 71 %'].forEach((t,i)=>g.fillText(t,14,58+i*20)); });
TEX.brand=canvasTex(512,96,(g,w,h)=>{ g.clearRect(0,0,w,h); g.fillStyle='#e9e4d6'; g.font='600 64px "Barlow Condensed", "Arial Narrow", Arial, sans-serif'; g.textBaseline='middle'; g.fillText('TULLY',8,50);
  g.fillStyle='#d4991f'; g.fillRect(200,30,6,40); g.fillStyle='#e9e4d6'; g.font='500 38px "Barlow Condensed", "Arial Narrow", Arial, sans-serif'; g.fillText('H2 · COBOT HARVESTER',222,52); });

// ================================================================== materials
const MAT={
  alu: std(0xc9ced1,0.8,0.32), aluMatte: std(0xb2b8bc,0.7,0.45), anod: std(0x3a3f45,0.6,0.42), steel: std(0x9aa2a8,0.9,0.26),
  paint: std(0xd4991f,0.15,0.4), graphite: std(0x2a2f34,0.25,0.5), panel: std(0x353b42,0.3,0.46), rubber: std(0x17181a,0,0.93),
  plastic: std(0x202327,0.05,0.62), chain: std(0x1c1e21,0.15,0.55), foam: std(0x2b6c93,0,0.86), silicone: std(0x264d6a,0,0.58),
  lens: std(0x06080a,0.4,0.06), cable: std(0x2b2e31,0.1,0.6), hose: std(0x3b7fae,0.05,0.4,{transparent:true,opacity:0.85}),
  hoseOrange: std(0xd8651c,0.05,0.5), copper: std(0xb77a45,0.8,0.35), glass: std(0xa7c7d8,0.1,0.05,{transparent:true,opacity:0.22,depthWrite:false}),
  estop: std(0xc9231d,0.1,0.35), yellow: std(0xe7b91e,0.1,0.45),
  led: new THREE.MeshStandardMaterial({color:C(0xffffff),emissive:C(0xfff3dc),emissiveIntensity:1.2,roughness:0.3}),
  ledBlue: new THREE.MeshStandardMaterial({color:C(0x7cc7ff),emissive:C(0x4aa8ff),emissiveIntensity:1.2,roughness:0.3}),
  ledGreen: new THREE.MeshStandardMaterial({color:C(0x7cffb0),emissive:C(0x39e07a),emissiveIntensity:1.0,roughness:0.3}),
  beacon: new THREE.MeshStandardMaterial({color:C(0xffb13b),emissive:C(0xff9a1a),emissiveIntensity:0.8,roughness:0.2,transparent:true,opacity:0.9}),
  hazard: new THREE.MeshStandardMaterial({map:TEX.hazard,roughness:0.6}),
  rack: new THREE.MeshStandardMaterial({map:TEX.rack,metalness:0.8,roughness:0.35}),
  plate: new THREE.MeshStandardMaterial({map:TEX.plate,metalness:0.7,roughness:0.4}),
  vent: new THREE.MeshStandardMaterial({map:TEX.vent,metalness:0.2,roughness:0.6}),
  screen: new THREE.MeshStandardMaterial({map:TEX.screen,emissive:C(0xffffff),emissiveMap:TEX.screen,emissiveIntensity:0.9,roughness:0.2}),
  brand: new THREE.MeshStandardMaterial({map:TEX.brand,transparent:true,roughness:0.5,depthWrite:false}),
  binSide: new THREE.MeshStandardMaterial({map:TEX.binSide,roughness:0.72}),
  binGreen: std(0x3f7d3a,0,0.72), binDark: std(0x2d5e2a,0,0.75),
  pile: new THREE.MeshStandardMaterial({map:TEX.pile,roughness:0.5}),
  pileInd: new THREE.MeshStandardMaterial({map:TEX.pileInd,roughness:0.55}),
  apple: new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:0.62,metalness:0,envMapIntensity:0.25}),
  appleFlow: std(0xb8262b,0,0.42), appleInd: std(0xc98a2c,0,0.5), trunk: std(0x5d4a39,0,0.95),
};
const GLOW=[MAT.led,MAT.ledBlue,MAT.ledGreen,MAT.beacon,MAT.screen];

// ================================================================== geometry helpers
const GC=new Map();
function cached(key,fn){ if(!GC.has(key)) GC.set(key,fn()); return GC.get(key); }
function RB(w,h,d,r){ r=Math.min(r,w/2-1e-4,h/2-1e-4,d/2-1e-4); return cached(`rb${w}|${h}|${d}|${r}`,()=>new THREE.RoundedBoxGeometry(w,h,d,2,r)); }
function BX(w,h,d){ return cached(`bx${w}|${h}|${d}`,()=>new THREE.BoxGeometry(w,h,d)); }
function CY(r1,r2,h,s,open){ return cached(`cy${r1}|${r2}|${h}|${s}|${!!open}`,()=>new THREE.CylinderGeometry(r1,r2,h,s||16,1,!!open)); }
// T-slot aluminium profile, long axis along local X
function PROF(len,w,h){ return cached(`pf${len}|${w}|${h}`,()=>{
  const s=new THREE.Shape(), a=w/2, b=h/2, sw=Math.min(w,h)*0.22, sd=Math.min(w,h)*0.14;
  const pts=[]; const slotEdge=(x0,y0,x1,y1,nx,ny,n)=>{ // edge from p0 to p1 with n slots
    pts.push([x0,y0]); for(let i=0;i<n;i++){ const t=(i+0.5)/n; const cx=x0+(x1-x0)*t, cy=y0+(y1-y0)*t; const ex=(x1-x0), ey=(y1-y0), L=Math.hypot(ex,ey), ux=ex/L, uy=ey/L;
      pts.push([cx-ux*sw/2,cy-uy*sw/2],[cx-ux*sw/2-nx*sd,cy-uy*sw/2-ny*sd],[cx+ux*sw/2-nx*sd,cy+uy*sw/2-ny*sd],[cx+ux*sw/2,cy+uy*sw/2]); } };
  const nw=Math.max(1,Math.round(w/Math.min(w,h))), nh=Math.max(1,Math.round(h/Math.min(w,h)));
  slotEdge(-a,-b,a,-b,0,-1,nw); slotEdge(a,-b,a,b,1,0,nh); slotEdge(a,b,-a,b,0,1,nw); slotEdge(-a,b,-a,-b,-1,0,nh);
  s.moveTo(pts[0][0],pts[0][1]); for(let i=1;i<pts.length;i++) s.lineTo(pts[i][0],pts[i][1]);
  const g=new THREE.ExtrudeGeometry(s,{depth:len,bevelEnabled:false}); g.translate(0,0,-len/2); g.rotateY(Math.PI/2); return g; }); }
function mk(geo,mat,parent,x,y,z,rx,ry,rz,noShadow){ const m=new THREE.Mesh(geo,mat); m.position.set(x||0,y||0,z||0); if(rx||ry||rz) m.rotation.set(rx||0,ry||0,rz||0); m.castShadow=!noShadow; m.receiveShadow=true; if(parent) parent.add(m); return m; }
function strut(parent,a,b,r,mat){ const d=new THREE.Vector3().subVectors(b,a), L=d.length(); const m=mk(CY(r,r,L,10),mat,parent); m.position.copy(a).addScaledVector(d,0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()); return m; }
function tubeAlong(points,r,mat,parent,closed){ const curve=new THREE.CatmullRomCurve3(points,!!closed); const g=new THREE.TubeGeometry(curve,Math.max(8,points.length*6),r,8,!!closed); return mk(g,mat,parent); }
// servo motor with gearbox, axis along local X, flange at x=0
function servo(parent,len,dia,x,y,z,rx,ry,rz,gear){ const g=new THREE.Group(); g.position.set(x,y,z); g.rotation.set(rx||0,ry||0,rz||0); parent.add(g);
  mk(RB(len,dia,dia,dia*0.12),MAT.graphite,g,-len/2,0,0);
  mk(CY(dia*0.36,dia*0.36,0.012,16),MAT.aluMatte,g,-len-0.006,0,0,0,0,Math.PI/2);
  mk(RB(0.03,dia*0.55,dia*0.45,0.004),MAT.plastic,g,-len*0.7,dia*0.55,0);          // connector housing
  if(gear){ mk(RB(gear,dia*1.1,dia*1.1,dia*0.1),MAT.aluMatte,g,gear/2,0,0); mk(CY(dia*0.22,dia*0.22,0.03,14),MAT.steel,g,gear+0.015,0,0,0,0,Math.PI/2); }
  // flatten into the parent so bake() can merge the parts
  g.updateMatrix(); for(const ch of g.children.slice()){ ch.applyMatrix4(g.matrix); parent.add(ch); } parent.remove(g);
  return parent; }
// merge static mesh children of a group by material to cut draw calls
function bake(group){
  const byMat=new Map(), keep=[];
  group.updateMatrix();
  for(const ch of group.children.slice()){
    if(ch.isMesh && !ch.isInstancedMesh && ch.children.length===0 && !ch.userData.live){ (byMat.get(ch.material)||byMat.set(ch.material,[]).get(ch.material)).push(ch); }
  }
  for(const [mat,list] of byMat){ if(list.length<2) continue;
    const geos=list.map(m=>{ m.updateMatrix(); let g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone(); const n=new THREE.BufferGeometry();
      n.setAttribute('position',g.getAttribute('position')); n.setAttribute('normal',g.getAttribute('normal')); n.setAttribute('uv',g.getAttribute('uv')||new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count*2),2)); n.applyMatrix4(m.matrix); return n; });
    const merged=THREE.BufferGeometryUtils.mergeBufferGeometries(geos,false);
    const cast=list.some(m=>m.castShadow);
    list.forEach(m=>group.remove(m));
    const mm=new THREE.Mesh(merged,mat); mm.castShadow=cast; mm.receiveShadow=true; group.add(mm);
  }
  return group;
}

// ================================================================== drag chain (cable carrier), instanced links
class DragChain{
  constructor(parent,{len,R,width,pitch=0.03,loopDir=1,mat=MAT.chain}){
    this.len=len; this.R=R; this.p=pitch; this.dir=loopDir; this.n=Math.ceil(len/pitch);
    const geo=cached(`link${pitch}|${width}`,()=>{ const g=new THREE.BoxGeometry(pitch*0.92,0.026,width); return g; });
    this.im=new THREE.InstancedMesh(geo,mat,this.n); this.im.castShadow=true; this.im.frustumCulled=false; parent.add(this.im);
    this.d=new THREE.Object3D();
  }
  // u along travel axis (local x), v loop height (local y). fixed end at (uF,0), moving end at (uM,2R)
  update(uF,uM){ const R=this.R, s=this.dir, straight=this.len-Math.PI*R;
    const uL = s>0 ? Math.max((straight+uF+uM)/2, Math.max(uF,uM)) : Math.min((uF+uM-straight)/2, Math.min(uF,uM));
    const a=Math.abs(uL-uF), c=Math.abs(uL-uM);
    for(let i=0;i<this.n;i++){ let q=(i+0.5)*this.p, u,v,ang;
      if(q<a){ u=uF+s*q; v=0; ang=s>0?0:Math.PI; }
      else if(q<a+Math.PI*R){ const t=(q-a)/R; u=uL+s*R*Math.sin(t); v=R-R*Math.cos(t); ang=s>0?t:Math.PI-t; }
      else { const r=q-a-Math.PI*R; u=uL-s*r; v=2*R; ang=s>0?Math.PI:0; if(r>c+0.001){ this.d.scale.set(0,0,0); this.d.updateMatrix(); this.im.setMatrixAt(i,this.d.matrix); continue; } }
      this.d.position.set(u,v,0); this.d.rotation.set(0,0,ang); this.d.scale.set(1,1,1); this.d.updateMatrix(); this.im.setMatrixAt(i,this.d.matrix); }
    this.im.instanceMatrix.needsUpdate=true; }
}
// looping belt of instanced items (cups, cleats) along a stadium path in the local x–y plane
class LoopItems{
  constructor(parent,geo,mat,{len,R,count}){ this.len=len; this.R=R; this.n=count; this.L=2*len+2*Math.PI*R; this.off=0;
    this.im=new THREE.InstancedMesh(geo,mat,count); this.im.castShadow=false; this.im.frustumCulled=false; parent.add(this.im); this.d=new THREE.Object3D(); }
  step(ds){ this.off=(this.off+ds)%this.L; if(this.off<0) this.off+=this.L;
    for(let i=0;i<this.n;i++){ let q=(i*this.L/this.n+this.off)%this.L, x,y,a; const len=this.len,R=this.R;
      if(q<len){ x=q; y=R; a=0; } else if(q<len+Math.PI*R){ const t=(q-len)/R; x=len+R*Math.sin(t); y=R*Math.cos(t); a=-t; }
      else if(q<2*len+Math.PI*R){ x=len-(q-len-Math.PI*R); y=-R; a=-Math.PI; } else { const t=(q-2*len-Math.PI*R)/R; x=-R*Math.sin(t); y=-R*Math.cos(t); a=-Math.PI-t; }
      this.d.position.set(x,y,0); this.d.rotation.set(0,0,a); this.d.updateMatrix(); this.im.setMatrixAt(i,this.d.matrix); }
    this.im.instanceMatrix.needsUpdate=true; }
}

// ================================================================== sky, light
const skyUni={top:{value:C(0x6f9fc8)},mid:{value:C(0xbfd6e4)},bot:{value:C(0xe4e8e2)}};
const sky=new THREE.Mesh(new THREE.SphereGeometry(120,32,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,uniforms:skyUni,
  vertexShader:'varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader:'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP; void main(){ float h=vP.y; vec3 c= h>0.0 ? mix(mid,top,pow(clamp(h,0.0,1.0),0.6)) : mix(mid,bot,clamp(-h*4.0,0.0,1.0)); gl_FragColor=vec4(c,1.0); }'}));
scene.add(sky);
scene.fog=new THREE.Fog(C(0xc4d6e0),45,115);
const hemi=new THREE.HemisphereLight(C(0xdfeaf2),C(0x4f5a3c),0.55); scene.add(hemi);
const sun=new THREE.DirectionalLight(C(0xfff1dc),2.2); sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048); { const s=sun.shadow.camera; s.left=-10;s.right=10;s.top=10;s.bottom=-10;s.near=1;s.far=70; } sun.shadow.bias=-0.0004; sun.shadow.normalBias=0.02;
scene.add(sun); scene.add(sun.target);
const SUN_DIR=new THREE.Vector3(-0.42,0.78,0.46).normalize();

// ================================================================== ground (orchard frame: alleys at z = k·ROW, tree rows between them)
const ROWZ=[]; for(let r=0;r<=N_ALLEY;r++) ROWZ.push(-HALF+r*ROW);
const ZMID=ZK(N_ALLEY-1)/2;
const HL=new THREE.Group(); scene.add(HL);          // headland boundary and depots, rebuilt when the headland depth changes
{ const g=mk(new THREE.PlaneGeometry(240,240),new THREE.MeshLambertMaterial({map:TEX.grass}),scene,0,0,ZMID,-Math.PI/2,0,0,true); g.receiveShadow=true;
  for(let k=0;k<N_ALLEY;k++){ const al=mk(new THREE.PlaneGeometry(ROW_X1-ROW_X0+2,2.1),new THREE.MeshLambertMaterial({map:TEX.alley}),scene,0,0.003,ZK(k),-Math.PI/2,0,0,true); al.receiveShadow=true; }
  for(const z of ROWZ){ const s=mk(new THREE.PlaneGeometry(ROW_X1-ROW_X0+1.2,0.95),new THREE.MeshLambertMaterial({map:TEX.soil}),scene,0,0.004,z,-Math.PI/2,0,0,true); s.receiveShadow=true; }
}
const DEPOT={E:{sg:1,bays:[]},W:{sg:-1,bays:[]}};
const DEPOT_Z=ROAD_Z-2.0, BAY_DX=2.1;
const hedgeMat=new THREE.MeshLambertMaterial({color:C(0x3f5a2c)}), gravelMat=new THREE.MeshLambertMaterial({map:TEX.gravel});
const lineMat={empty:new THREE.MeshBasicMaterial({color:C(0xb9bdb6)}),drop:new THREE.MeshBasicMaterial({color:C(0xeee9d6)})};
function buildHeadlands(){
  while(HL.children.length) HL.remove(HL.children[0]);
  const xb=ROW_END+HEAD_W, zLo=DEPOT_Z-1.2, zHi=ROWZ[N_ALLEY]+0.6;
  for(const sx of [1,-1]){
    // mown headland strip, then a hedge and ditch at the boundary
    const p=mk(new THREE.PlaneGeometry(HEAD_W,zHi-zLo),new THREE.MeshLambertMaterial({map:TEX.alley}),HL,sx*(ROW_END+HEAD_W/2),0.004,(zLo+zHi)/2,-Math.PI/2,0,0,true); p.receiveShadow=true;
    const hd=mk(BX(0.9,1.5,zHi-zLo+6),hedgeMat,HL,sx*(xb+0.55),0.75,(zLo+zHi)/2+2); hd.castShadow=true;
    mk(BX(0.5,0.02,zHi-zLo+6),new THREE.MeshLambertMaterial({color:C(0x4d4536)}),HL,sx*(xb+0.12),0.006,(zLo+zHi)/2+2,0,0,0,true);
    // depot pad on the field road, just inside the headland: 3 empty bays and 3 drop bays, a crate rack
    // depot pad beside the road (outside it, so traffic on the road never meets a parked bin): 3 empty and 3 drop bays
    const d=DEPOT[sx>0?'E':'W']; d.bays=[];
    const x0=sx*(ROW_END-1.6);
    const pad=mk(new THREE.PlaneGeometry(12.4,2.0),gravelMat,HL,x0-sx*5.0,0.005,DEPOT_Z,-Math.PI/2,0,0,true); pad.receiveShadow=true;
    for(let i=0;i<6;i++){ const x=x0-sx*i*BAY_DX, kind=i<3?'drop':'empty';
      for(const [w,dd,dx,dz] of [[1.8,0.04,0,0.7],[1.8,0.04,0,-0.7],[0.04,1.4,0.9,0],[0.04,1.4,-0.9,0]]) mk(new THREE.PlaneGeometry(w,dd),lineMat[kind],HL,x+dx,0.009,DEPOT_Z+dz,-Math.PI/2,0,0,true);
      d.bays.push({x,z:DEPOT_Z,kind,bin:null,crate:null,res:false,t:-1}); }
  }
  // the field road itself, outside the first tree row
  const r=mk(new THREE.PlaneGeometry(2*(ROW_END+HEAD_W),2.0),gravelMat,HL,0,0.0045,ROAD_Z,-Math.PI/2,0,0,true); r.receiveShadow=true;
}
// ================================================================== orchard: N_ALLEY+1 tree rows
const trees=[]; for(let x=ROW_X0;x<=ROW_X1+1e-6;x+=TREE) trees.push(x);
const dummy=new THREE.Object3D();
{ const geo=new THREE.CylinderGeometry(0.022,0.05,3.55,8); geo.translate(0,1.775,0);
  const n=trees.length*ROWZ.length, im=new THREE.InstancedMesh(geo,MAT.trunk,n); let i=0;
  for(const z of ROWZ) for(const x of trees){ dummy.position.set(x,0,z); dummy.rotation.set((rnd()-.5)*0.04,rnd()*6,(rnd()-.5)*0.04); dummy.scale.set(1,0.95+rnd()*0.1,1); dummy.updateMatrix(); im.setMatrixAt(i++,dummy.matrix); }
  im.castShadow=true; im.receiveShadow=true; scene.add(im);
  const bamboo=new THREE.InstancedMesh(CY(0.012,0.012,3.4,6),std(0xc9b27a,0,0.7),n); i=0;
  for(const z of ROWZ) for(const x of trees){ dummy.position.set(x+0.06,1.7,z); dummy.rotation.set(0,0,0); dummy.scale.set(1,1,1); dummy.updateMatrix(); bamboo.setMatrixAt(i++,dummy.matrix); } scene.add(bamboo);
}
const foliage=[];
{ const NL=15;
  const latGeo=new THREE.CylinderGeometry(0.006,0.015,1,5); latGeo.translate(0,0.5,0); latGeo.rotateZ(-Math.PI/2);
  const lat=new THREE.InstancedMesh(latGeo,MAT.trunk,trees.length*ROWZ.length*NL); let li=0;
  const cards=[];
  for(const z0 of ROWZ) for(const x0 of trees){
    for(let k=0;k<NL;k++){ const h=0.5+k*(3.0/NL)+rnd()*0.1, L=0.6*(1-(h-0.5)/3.7)+0.12, az=rnd()*Math.PI*2, droop=-0.15-rnd()*0.25;
      dummy.position.set(x0,h,z0); dummy.rotation.set(0,az,droop); dummy.scale.set(L,1,1); dummy.updateMatrix(); lat.setMatrixAt(li++,dummy.matrix);
      const nC=6+(rnd()*3|0); for(let j=0;j<nC;j++){ const r=(0.15+0.85*rnd())*L; cards.push([x0+Math.cos(az)*r+(rnd()-.5)*0.14, h+Math.sin(droop)*r+(rnd()-.3)*0.2, z0-Math.sin(az)*r+(rnd()-.5)*0.14]); } }
    for(let j=0;j<9;j++) cards.push([x0+(rnd()-.5)*0.25,3.1+rnd()*0.5,z0+(rnd()-.5)*0.25]);
  }
  lat.castShadow=true; scene.add(lat);
  const cardGeo=new THREE.PlaneGeometry(0.32,0.32);
  const leafMat=new THREE.MeshLambertMaterial({map:TEX.leaf,alphaTest:0.45,side:THREE.DoubleSide,transparent:false});
  const depthMat=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,map:TEX.leaf,alphaTest:0.45});
  const tints=[0xf2f2ea,0xd6dcc4,0xbcc6a2];
  for(let c=0;c<3;c++){ const list=cards.filter((_,i)=>i%3===c); const m=leafMat.clone(); m.color=C(tints[c]);
    const im=new THREE.InstancedMesh(cardGeo,m,list.length);
    list.forEach((p,i)=>{ dummy.position.set(p[0],p[1],p[2]); dummy.rotation.set(rnd()*Math.PI,rnd()*Math.PI*2,rnd()*Math.PI); const s=0.75+rnd()*0.6; dummy.scale.set(s,s,s); dummy.updateMatrix(); im.setMatrixAt(i,dummy.matrix); });
    im.castShadow=true; im.receiveShadow=true; im.customDepthMaterial=depthMat; scene.add(im); foliage.push(im); }
}
{ // trellis: concrete posts, wires, end anchors (wires on the alley-facing side of each row line)
  const posts=[]; for(let x=ROW_X0;x<=ROW_X1;x+=7.2) posts.push(x); posts.push(ROW_END);
  const im=new THREE.InstancedMesh(BX(0.08,3.9,0.08),std(0xa4a39c,0,0.85),posts.length*ROWZ.length); let i=0;
  for(const z of ROWZ) for(const x of posts){ dummy.position.set(x,1.95,z); dummy.rotation.set(0,0,0); dummy.scale.set(1,1,1); dummy.updateMatrix(); im.setMatrixAt(i++,dummy.matrix); }
  im.castShadow=true; scene.add(im);
  const pts=[]; for(const z of ROWZ) for(const h of [0.8,1.4,2.0,2.6,3.2,3.75]){ pts.push(ROW_X0,h,z,ROW_END,h,z); }
  const lg=new THREE.BufferGeometry(); lg.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
  scene.add(new THREE.LineSegments(lg,new THREE.LineBasicMaterial({color:C(0x8f9795)})));
}

// ================================================================== apples: one population per tree row (orchard frame)
const G={x:[],y:[],z:[],row:[],det:[],state:[],rows:[]};
ROWZ.forEach((z0,r)=>{ const list=[]; G.rows.push(list);
  for(const x0 of trees){ const k=poisson(FRUIT_PER_M_SIDE*TREE*2);
    for(let j=0;j<k;j++){ let y=Z_MU+Z_SD*gauss(); if(y<0.3||y>3.6) y=Math.min(3.6,Math.max(0.3,Z_MU+Z_SD*gauss()));
      let e=D_SD*gauss(); e=Math.max(-0.4,Math.min(0.4,e));
      list.push(G.x.length); G.x.push(x0+0.06+Y_SD*gauss()); G.y.push(y); G.z.push(z0+e); G.row.push(r); G.det.push(rnd()<P_DETECT); G.state.push(0); } } });
const NG=G.x.length;
const appleGeo=(()=>{ const g=new THREE.IcosahedronGeometry(0.039,1); g.scale(1,0.9,1); const n=g.getAttribute('position').count; g.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(n*3).fill(1),3)); return g; })();
const apples=new THREE.InstancedMesh(appleGeo,MAT.apple,NG);
const APPLE_TINTS=[0x7c0f10,0x8a1412,0x6e0d0e,0x93201a,0x821512,0x9c3a1c].map(C);
for(let i=0;i<NG;i++){ apples.setColorAt(i,APPLE_TINTS[(rnd()*APPLE_TINTS.length)|0]); }
// every fruit hangs on a 30 mm stem from its spur. G.stemS: 1 whole stem, 0.7 the part left on the spur after a cut, 0 none
const STEM_DY=0.063;                                   // spur above the fruit centre, m
const stems=new THREE.InstancedMesh((()=>{ const g=new THREE.CylinderGeometry(0.0015,0.0018,0.03,5,1,true); g.translate(0,-0.015,0); return g; })(),std(0x5e4424,0,0.9),NG);
G.stemS=new Float32Array(NG).fill(1);
function setG(g,show){ dummy.position.set(G.x[g],G.y[g],G.z[g]); dummy.rotation.set(0,g,0); const s=show?1:0.0001; dummy.scale.set(s,s,s); dummy.updateMatrix(); apples.setMatrixAt(g,dummy.matrix);
  const k=(show||G.state[g]===1)?G.stemS[g]:0; dummy.position.y+=STEM_DY; dummy.rotation.set(Math.sin(g*1.7)*0.18,g,Math.cos(g*2.3)*0.18); dummy.scale.set(k?1:0.0001,k||0.0001,k?1:0.0001); dummy.updateMatrix(); stems.setMatrixAt(g,dummy.matrix);
  apples.instanceMatrix.needsUpdate=true; stems.instanceMatrix.needsUpdate=true; }
for(let g=0;g<NG;g++) setG(g,true);
apples.castShadow=false; apples.receiveShadow=true; scene.add(apples); stems.castShadow=false; stems.receiveShadow=false; scene.add(stems);
// the current alley: fruit on the two walls that face it (world coordinates)
const A={}; let NA=0, FARHIDE=false;
function setApple(i,show){ setG(A.g[i], show && !(FARHIDE&&!A.near[i])); }
function buildAlley(k){ ALLEY=k; DIR=k%2===0?1:-1; const Z0=ZK(k);
  for(const key of ['x','y','z','dd','near','side','g','det','state','busy','nn','unr','unrX']) A[key]=[];
  for(const r of [k,k+1]) for(const g of G.rows[r]){ const side=r===k?-1:1; const dd=HALF-side*(G.z[g]-Z0);   // dd: distance from the alley centre line... to the row line
    const near=(side*(G.z[g]-Z0))<=HALF+0.02;
    A.x.push(G.x[g]); A.y.push(G.y[g]); A.z.push(G.z[g]); A.dd.push(Math.abs(G.z[g]-Z0)); A.near.push(near); A.side.push(side); A.g.push(g);
    A.det.push(G.det[g]); A.state.push(G.state[g]); A.busy.push(false); A.nn.push(9); A.unr.push(0); A.unrX.push(0); }
  NA=A.x.length;
  for(const side of [1,-1]){ const idx=[]; for(let i=0;i<NA;i++) if(A.side[i]===side) idx.push(i); idx.sort((a,b)=>A.x[a]-A.x[b]);
    for(let a=0;a<idx.length;a++){ const i=idx[a]; for(let b=a+1;b<idx.length;b++){ const j=idx[b]; const dx=A.x[j]-A.x[i]; if(dx>0.2) break;
        const dd=Math.hypot(dx,A.y[j]-A.y[i],A.z[j]-A.z[i]); if(dd<A.nn[i]) A.nn[i]=dd; if(dd<A.nn[j]) A.nn[j]=dd; } } }
  nearIdx.length=0; for(let i=0;i<NA;i++) if(A.near[i]) nearIdx.push(i); nearIdx.sort((a,b)=>A.x[a]-A.x[b]);
}
const nearIdx=[];
function lowerBound(arr,x){ let lo=0,hi=arr.length; while(lo<hi){const m=(lo+hi)>>1; if(A.x[arr[m]]<x) lo=m+1; else hi=m;} return lo; }
buildHeadlands();
buildAlley(0);

// ================================================================== machine body: four corner towers on swerve wheels, a carrier tunnel,
// a bridge with the sorter, a roof frame. World-aligned: it never rotates, it crabs.
const shellMat=std(0xe7e3da,0.05,0.38), shellDark=std(0x262b30,0.25,0.42), smoke=std(0x1c2227,0.2,0.08,{transparent:true,opacity:0.55});
const amberStrip=new THREE.MeshStandardMaterial({color:C(0xffc861),emissive:C(0xffa21a),emissiveIntensity:1.1,roughness:0.3}); GLOW.push(amberStrip);
const archMat=std(0x262b30,0.25,0.42,{side:THREE.DoubleSide});
const lipMat=std(0x3b6e8f,0,0.7,{side:THREE.DoubleSide});
const guardMat=std(0x2a3036,0.3,0.5,{transparent:true,opacity:0.35});
function tyre(R,W){ return cached(`ty${R}|${W}`,()=>{ const pts=[]; for(let i=0;i<=16;i++){ const a=-Math.PI/2+i/16*Math.PI; pts.push(new THREE.Vector2(R-0.045+Math.cos(a)*0.045, Math.sin(a)*W/2)); }
  pts.unshift(new THREE.Vector2(R*0.62,-W/2)); pts.push(new THREE.Vector2(R*0.62,W/2)); const g=new THREE.LatheGeometry(pts,30); g.rotateX(Math.PI/2); return g; }); }
const H=new THREE.Group(); scene.add(H);
const Hs=new THREE.Group(); H.add(Hs);               // static parts, baked
const ANCH={};
function anchorAt(k,parent,x,y,z){ const o=new THREE.Object3D(); o.position.set(x,y,z); parent.add(o); ANCH[k]=o; return o; }
const WHEELS=[];
function lidar(parent,x,y,z,key){ mk(CY(0.05,0.055,0.07,20),MAT.graphite,parent,x,y,z); mk(CY(0.052,0.052,0.035,20),MAT.lens,parent,x,y+0.045,z); if(key) anchorAt(key,parent,x,y+0.05,z); }
function buildMachine(){
  // ---- corner towers: pod over a swerve wheel
  for(const ex of [1,-1]) for(const sz of [1,-1]){
    const x=ex*TOWER_X, z=sz*(POD_Z0+POD_Z1)/2, w=POD_Z1-POD_Z0;
    mk(RB(2*POD_HX,POD_Y1-0.5,w,0.06),shellMat,Hs,x,0.5+(POD_Y1-0.5)/2,z);                         // upper pod (battery module)
    mk(RB(2*POD_HX+0.01,0.1,w+0.01,0.04),shellDark,Hs,x,0.52,z);                                       // skirt band
    mk(RB(0.015,0.05,w*0.7,0.008),amberStrip,Hs,x+ex*(POD_HX+0.002),0.9,z,0,0,0,true);               // end light
    mk(new THREE.PlaneGeometry(0.22,0.12),MAT.vent,Hs,x,0.78,sz*(POD_Z1+0.002),0,sz>0?0:Math.PI,0,true);
    // wheel arch fairing
    const arch=new THREE.Mesh(new THREE.CylinderGeometry(WHEEL_R+0.05,WHEEL_R+0.05,w+0.02,24,1,true,Math.PI*0.5,Math.PI),archMat); arch.rotation.x=Math.PI/2; arch.position.set(x,WHEEL_R+0.02,z); Hs.add(arch);
    // swerve module: steer motor on top, fork, wheel with hub motor
    const sg=new THREE.Group(); sg.position.set(x,WHEEL_R,sz*WHEEL_Z); H.add(sg);
    mk(CY(0.07,0.07,0.1,20),MAT.graphite,sg,0,WHEEL_R+0.1,0); mk(RB(0.05,0.2,0.18,0.01),MAT.graphite,sg,0,WHEEL_R-0.02,0);
    const sp=new THREE.Group(); sg.add(sp);
    mk(tyre(WHEEL_R,WHEEL_W),MAT.rubber,sp,0,0,0); mk(CY(0.13,0.13,WHEEL_W-0.02,24),MAT.aluMatte,sp,0,0,0,Math.PI/2,0,0); mk(CY(0.07,0.07,WHEEL_W+0.01,20),MAT.graphite,sp,0,0,0,Math.PI/2,0,0);
    for(let k=0;k<6;k++){ const a=k*Math.PI/3; mk(CY(0.011,0.011,WHEEL_W,8),MAT.steel,sp,Math.cos(a)*0.1,Math.sin(a)*0.1,0,Math.PI/2,0,0,true); }
    WHEELS.push({sg,sp,ex,sz});
    // lift column in the side wall (just inboard of the pod): rack and guides on its outboard face, where the carriages ride
    const mx=ex*MAST_X;
    mk(PROF(ROOF_Y-MAST_Y0,0.12,0.12),MAT.anod,Hs,mx,(ROOF_Y+MAST_Y0)/2,sz*MAST_Z,0,0,Math.PI/2);
    mk(BX(0.03,ROOF_Y-MAST_Y0-0.1,0.012),MAT.rack,Hs,mx,(ROOF_Y+MAST_Y0)/2,sz*(MAST_Z+0.066));
    for(const dx of [-0.045,0.045]) mk(BX(0.016,ROOF_Y-MAST_Y0-0.1,0.012),MAT.steel,Hs,mx+dx,(ROOF_Y+MAST_Y0)/2,sz*(MAST_Z+0.066));
    mk(RB(0.2,0.05,0.2,0.01),MAT.aluMatte,Hs,mx,MAST_Y0-0.02,sz*MAST_Z);
    mk(RB(0.16,0.12,0.14,0.02),shellDark,Hs,ex*(MAST_X+0.12),POD_Y1-0.1,sz*MAST_Z);                                 // gusset to the pod
    // white cover on the column's machine-end face with a light blade
    mk(RB(0.03,ROOF_Y-POD_Y1,0.15,0.014),shellMat,Hs,mx+ex*0.075,(ROOF_Y+POD_Y1)/2,sz*MAST_Z); mk(RB(0.006,ROOF_Y-POD_Y1-0.4,0.02,0.003),amberStrip,Hs,mx+ex*0.092,(ROOF_Y+POD_Y1)/2,sz*MAST_Z,0,0,0,true);
  }
  // ---- side walls between the columns: sill, mesh guard (the arms work only outboard of |z| = ZW)
  for(const sz of [1,-1]){ mk(RB(2*MAST_X-0.12,0.08,0.05,0.015),shellDark,Hs,0,0.5,sz*0.735); mk(RB(2*TOWER_X,0.08,0.05,0.015),shellDark,Hs,0,POD_Y1-0.06,sz*0.735);
    mk(BX(2*MAST_X-0.12,BRIDGE_Y0-0.55,0.01),guardMat,Hs,0,(BRIDGE_Y0+0.55)/2,sz*(TUN_HW+0.015),0,0,0,true);
    mk(BX(2*MAST_X-0.12,ROOF_Y-2.0,0.01),guardMat,Hs,0,(ROOF_Y+2.0)/2,sz*(TUN_HW+0.015),0,0,0,true); }
  // ---- roof frame and canopy
  for(const sz of [1,-1]) mk(RB(M_LEN,0.1,0.12,0.03),shellDark,Hs,0,ROOF_Y+0.05,sz*MAST_Z);
  for(const ex of [1,-1]) mk(RB(0.12,0.1,2*MAST_Z,0.03),shellDark,Hs,ex*MAST_X,ROOF_Y+0.05,0);
  mk(RB(1.42,0.06,1.32,0.03),shellMat,Hs,0,ROOF_Y+0.13,0);
  mk(RB(1.34,0.02,1.24,0.01),MAT.graphite,Hs,0,ROOF_Y+0.165,0);
  for(const ex of [1,-1]){ mk(RB(0.012,0.03,1.2,0.006),amberStrip,Hs,ex*0.712,ROOF_Y+0.13,0,0,0,0,true);
    mk(new THREE.PlaneGeometry(0.62,0.1),MAT.brand,Hs,ex*0.717,ROOF_Y+0.13,0.25,0,ex*Math.PI/2,0,true); }
  lidar(Hs,0.66,ROOF_Y+0.2,0.56,'lidar'); lidar(Hs,-0.66,ROOF_Y+0.2,-0.56,null);
  for(const ex of [1,-1]){ mk(RB(0.06,0.06,0.34,0.012),MAT.graphite,Hs,ex*0.78,ROOF_Y+0.02,0); mk(CY(0.018,0.018,0.012,16),MAT.lens,Hs,ex*0.81,ROOF_Y+0.02,0.11,0,0,Math.PI/2); mk(CY(0.018,0.018,0.012,16),MAT.lens,Hs,ex*0.81,ROOF_Y+0.02,-0.11,0,0,Math.PI/2); if(ex>0) anchorAt('stereo',Hs,0.8,ROOF_Y+0.04,0); }
  for(const z of [0.3,-0.3]) mk(CY(0.05,0.05,0.025,20),MAT.plastic,Hs,0.2,ROOF_Y+0.19,z); anchorAt('gnss',Hs,0.2,ROOF_Y+0.2,0.3);
  const bc=new THREE.Group(); bc.position.set(-0.3,ROOF_Y+0.17,0.4); Hs.add(bc); mk(CY(0.035,0.04,0.03,16),MAT.graphite,bc,0,0,0); mk(CY(0.03,0.03,0.07,16),MAT.beacon,bc,0,0.05,0,0,0,0,true);
  for(const ex of [1,-1]) for(const sz of [1,-1]) mk(new THREE.PlaneGeometry(0.3,0.16),MAT.vent,Hs,ex*TOWER_X,0.8,sz*(POD_Z0-0.002),0,sz>0?Math.PI:0,0,true);   // drives, compute, compressor live in the pods
  anchorAt('cab',Hs,TOWER_X,0.85,-(POD_Z0+0.02));
  // ---- bridge over the tunnel
  mk(RB(BRIDGE_L,BRIDGE_Y1-BRIDGE_Y0,2*BRIDGE_HZ,0.03),shellDark,Hs,0,(BRIDGE_Y0+BRIDGE_Y1)/2,0);
  for(const sz of [1,-1]) mk(RB(BRIDGE_L,0.02,0.01,0.004),amberStrip,Hs,0,BRIDGE_Y0+0.02,sz*(BRIDGE_HZ+0.004),0,0,0,true);
  // ---- sorter: both landing belts feed a single-file roller lane along +x. Under the glass hood two cameras grade each fruit
  // while the rollers spin it. Fresh fruit drop through the gate flaps into the filler; industry fruit ride on to the chute.
  mk(RB(SORT_X1-SORT_XS+0.06,0.05,0.3,0.01),MAT.graphite,Hs,(SORT_XS+SORT_X1)/2,SY-0.045,0);                  // lane frame
  for(const sz of [1,-1]) mk(RB(SORT_X1-SORT_XS+0.06,0.06,0.012,0.004),MAT.aluMatte,Hs,(SORT_XS+SORT_X1)/2,SY+0.03,sz*0.105);
  mk(RB(0.24,0.012,0.22,0.004),MAT.glass,Hs,HOOD_X,SY+0.19,0); for(const sz of [1,-1]) mk(RB(0.24,0.18,0.008,0.003),MAT.glass,Hs,HOOD_X,SY+0.1,sz*0.11);
  for(const x of [HOOD_X-0.12,HOOD_X+0.12]) for(const sz of [1,-1]) mk(BX(0.012,0.2,0.012),MAT.graphite,Hs,x,SY+0.1,sz*0.11);
  for(const x of [HOOD_X-0.06,HOOD_X+0.06]){ mk(RB(0.05,0.04,0.05,0.01),MAT.graphite,Hs,x,SY+0.215,0); mk(CY(0.014,0.014,0.01,14),MAT.lens,Hs,x,SY+0.19,0); }
  mk(RB(0.2,0.008,0.012,0.003),MAT.led,Hs,HOOD_X,SY+0.185,0.09,0,0,0,true); mk(RB(0.2,0.008,0.012,0.003),MAT.led,Hs,HOOD_X,SY+0.185,-0.09,0,0,0,true);
  anchorAt('sorter',Hs,HOOD_X,SY+0.23,0.05);
  // gate: filler throat through the deck under the flaps
  mk(CY(0.1,0.08,BRIDGE_Y1-BRIDGE_Y0+0.08,20,true),shellMat,Hs,FILLER_X,(BRIDGE_Y0+BRIDGE_Y1)/2,0); anchorAt('gate',Hs,FILLER_X,SY+0.05,-0.1);
  // industry chute from the lane end down to the crate
  const ch=[new THREE.Vector3(SORT_X1+0.02,SY-0.02,0),new THREE.Vector3(SORT_X1+0.2,SY-0.1,0),new THREE.Vector3(CRATE_X,BRIDGE_Y0-0.02,0)];
  tubeAlong(ch,0.06,MAT.glass,Hs); anchorAt('chute',Hs,SORT_X1+0.16,SY-0.08,0.08);
  mk(RB(0.16,0.05,0.2,0.01),MAT.graphite,Hs,CRATE_X,BRIDGE_Y0-0.03,0);                                 // crate sock reel
  // signs
  const sign=(txt,col)=>new THREE.MeshStandardMaterial({map:canvasTex(256,64,(q,w,h)=>{ q.fillStyle='#1d2227'; q.fillRect(0,0,w,h); q.fillStyle=col; q.fillRect(0,0,10,h); q.fillStyle='#f1ede4'; q.font='600 34px "Barlow Condensed", Arial'; q.fillText(txt,22,44); }),roughness:0.6});
  for(const sz of [1,-1]){ mk(new THREE.PlaneGeometry(0.16,0.04),sign('FRESH ▼ BIN','#4caf50'),Hs,FILLER_X,SY+0.07,sz*0.112,0,sz>0?0:Math.PI,0,true);
    mk(new THREE.PlaneGeometry(0.16,0.04),sign('INDUSTRY ▶ CRATE','#d88a3a'),Hs,SORT_X1-0.06,SY+0.07,sz*0.112,0,sz>0?0:Math.PI,0,true); }
  // HMI on a post at the bridge end
  mk(CY(0.02,0.02,0.4,10),MAT.aluMatte,Hs,-0.5,BRIDGE_Y1+0.2,-0.45); mk(RB(0.04,0.18,0.26,0.02),MAT.panel,Hs,-0.5,BRIDGE_Y1+0.46,-0.45);
  mk(new THREE.PlaneGeometry(0.24,0.15),MAT.screen,Hs,-0.521,BRIDGE_Y1+0.46,-0.45,0,-Math.PI/2,0,true); mk(CY(0.03,0.03,0.03,16),MAT.estop,Hs,-0.5,BRIDGE_Y1+0.6,-0.45); anchorAt('hmi',Hs,-0.52,BRIDGE_Y1+0.5,-0.4);
  // ---- fruit handling per side: low belt (two halves meeting at the elevator), cup elevator in the wall, landing belt
  for(const sz of [1,-1]){
    for(const hx of [-1,1]){ const x0=ELEV_X+hx*0.02, x1=hx*LOWB_HX, cx=(x0+x1)/2, L=Math.abs(x1-x0);
      mk(RB(L,0.05,0.16,0.02),MAT.graphite,Hs,cx,LOWB_Y-0.03,sz*LOWB_Z); mk(BX(L,0.012,0.14),MAT.foam,Hs,cx,LOWB_Y,sz*LOWB_Z);
      strut(Hs,new THREE.Vector3(x1*0.9,LOWB_Y-0.05,sz*LOWB_Z),new THREE.Vector3(x1*0.9,0.5,sz*0.74),0.012,MAT.aluMatte); }
    mk(RB(0.14,ELEV_TOP-LOWB_Y+0.1,0.13,0.03),smoke,Hs,ELEV_X,(ELEV_TOP+LOWB_Y)/2,sz*ELEV_Z);
    // lower cobots' set-down funnel on the elevator (shared by both lower cobots of a side), with a short chute into the cups
    mk(new THREE.CylinderGeometry(0.1,0.05,0.1,18,1,true),lipMat,Hs,ELEV_X,LIP_LY,sz*1.0); mk(RB(0.08,0.06,0.16,0.02),smoke,Hs,ELEV_X,LIP_LY-0.07,sz*0.9);
    if(sz>0) anchorAt('lip2',Hs,ELEV_X,LIP_LY+0.06,sz*1.08);
    { const x0=LAND_X+0.1, x1=ELEV_X; mk(RB(x1-x0,0.03,0.09,0.01),MAT.graphite,Hs,(x0+x1)/2,ELEV_TOP+0.01,sz*ELEV_Z); }                  // elevator head chute onto the landing belt
    mk(RB(0.26,0.05,LAND_Z1-LAND_Z0,0.02),MAT.graphite,Hs,LAND_X,LAND_Y-0.03,sz*(LAND_Z0+LAND_Z1)/2); mk(BX(0.24,0.012,LAND_Z1-LAND_Z0),MAT.foam,Hs,LAND_X,LAND_Y,sz*(LAND_Z0+LAND_Z1)/2);
    for(const x of [LAND_X+0.13,LAND_X-0.13]) mk(BX(0.012,0.06,LAND_Z1-LAND_Z0),MAT.aluMatte,Hs,x,LAND_Y+0.03,sz*(LAND_Z0+LAND_Z1)/2);
    // transfer ramp: landing belt end → sorter lane
    { const a=new THREE.Vector3(SORT_XS,LAND_Y-0.01,sz*(LAND_Z0+0.01)), b=new THREE.Vector3(SORT_XS,SY+0.03,sz*0.06); const d=b.clone().sub(a), L=d.length();
      const r=mk(RB(0.16,0.012,L,0.004),MAT.aluMatte,Hs,(a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2); r.rotation.x=-Math.atan2(d.y,d.z); for(const dx of [-0.08,0.08]){ const w=mk(RB(0.008,0.05,L,0.003),MAT.aluMatte,Hs,(a.x+b.x)/2+dx,(a.y+b.y)/2+0.025,(a.z+b.z)/2); w.rotation.x=r.rotation.x; } }
    for(const x of [LAND_X+0.1,LAND_X-0.1]) strut(Hs,new THREE.Vector3(x,LAND_Y-0.05,sz*(LAND_Z1-0.05)),new THREE.Vector3(x,BRIDGE_Y1,sz*(BRIDGE_HZ-0.05)),0.012,MAT.aluMatte);
    if(sz>0){ anchorAt('landing',Hs,LAND_X,LAND_Y+0.06,sz*(LAND_Z1-0.05)); anchorAt('lowbelt',Hs,-0.25,LOWB_Y+0.03,sz*LOWB_Z); anchorAt('elev',Hs,ELEV_X,1.2,sz*(ELEV_Z+0.07)); }
  }

  // ---- power: 45 kWh of LFP on a 51.2 V bus, all of it low. A 12.3 kWh sill pack along each side below the low belt, between
  // the wheels (16 × 230 Ah prismatic cells in a finned aluminium case), and a 5.1 kWh drawer pack in each corner pod (16 × 100 Ah).
  // Cables run up the columns to the power cabinet in the bridge deck (BMS master, DC/DC, contactors, a 6 kW inverter).
  const packMat=std(0x2c3238,0.45,0.42), finMat=std(0x4a525a,0.6,0.35), battLbl=new THREE.MeshStandardMaterial({map:canvasTex(256,48,(q,w,h)=>{ q.fillStyle='#1d2227'; q.fillRect(0,0,w,h); q.fillStyle='#d4991f'; q.fillRect(0,0,8,h);
    q.fillStyle='#f1ede4'; q.font='600 26px "Barlow Condensed", Arial'; q.fillText('LFP 51.2 V · 12.3 kWh',18,33); }),roughness:0.6});
  for(const sz of [1,-1]){ const z0=0.775, z1=0.995, zc=sz*(z0+z1)/2, y0=0.14, y1=0.35;
    mk(RB(1.04,y1-y0,z1-z0,0.02),packMat,Hs,0,(y0+y1)/2,zc);
    for(let x=-0.46;x<=0.461;x+=0.046) mk(BX(0.008,y1-y0-0.04,0.012),finMat,Hs,x,(y0+y1)/2,sz*(z1+0.004));
    mk(new THREE.PlaneGeometry(0.34,0.064),battLbl,Hs,-0.3,y1-0.045,sz*(z1+0.012),0,sz>0?0:Math.PI,0,true);
    for(const x of [-0.5,0.5]) mk(RB(0.05,0.03,z1-z0+0.04,0.008),MAT.aluMatte,Hs,x,y0-0.012,zc);          // hangers to the frame
    mk(RB(0.06,0.05,0.05,0.01),MAT.hoseOrange,Hs,0.47,y1+0.01,sz*0.8); mk(RB(0.06,0.012,0.05,0.004),MAT.ledGreen,Hs,0.36,y1+0.001,sz*0.9,0,0,0,true);
    tubeAlong([new THREE.Vector3(0.47,y1+0.03,sz*0.8),new THREE.Vector3(0.49,0.47,sz*0.775),new THREE.Vector3(MAST_X-0.05,0.62,sz*(MAST_Z-0.02)),new THREE.Vector3(MAST_X-0.07,BRIDGE_Y0-0.05,sz*(MAST_Z-0.04)),new THREE.Vector3(0.52,BRIDGE_Y0+0.05,sz*0.6)],0.011,MAT.hoseOrange,Hs);
    if(sz>0) anchorAt('batt',Hs,-0.1,y1-0.02,sz*(z1+0.02)); }
  for(const ex of [1,-1]) for(const sz of [1,-1]){ const x=ex*TOWER_X+ex*(POD_HX+0.004), z=sz*(POD_Z0+POD_Z1)/2;
    mk(RB(0.012,0.2,0.2,0.006),packMat,Hs,x,0.66,z,0,0,0,true); mk(RB(0.016,0.02,0.1,0.006),MAT.graphite,Hs,x+ex*0.006,0.74,z,0,0,0,true);
    for(let k=0;k<4;k++) mk(BX(0.004,0.012,0.022),k<3?MAT.ledGreen:MAT.graphite,Hs,x+ex*0.007,0.6,z-0.04+k*0.027,0,0,0,true);
    if(ex>0&&sz>0) anchorAt('podbatt',Hs,x+0.01,0.66,z); }
  // charge inlet (22 kW AC, or 48 V DC at the depot) on the +x, +z pod
  { const x=TOWER_X+POD_HX, z=POD_Z0+0.03; mk(CY(0.035,0.035,0.02,20),MAT.graphite,Hs,x+0.006,0.78,z+0.2,0,0,Math.PI/2); mk(CY(0.028,0.028,0.022,20),MAT.plastic,Hs,x+0.008,0.78,z+0.2,0,0,Math.PI/2); anchorAt('charge',Hs,x+0.02,0.78,z+0.2); }
  // power cabinet and compute in the bridge deck (−x end), compressor + 6 L air tank at the +x end
  mk(RB(0.3,0.16,0.02,0.006),MAT.panel,Hs,-0.4,(BRIDGE_Y0+BRIDGE_Y1)/2,BRIDGE_HZ+0.008); mk(new THREE.PlaneGeometry(0.22,0.1),MAT.vent,Hs,-0.4,(BRIDGE_Y0+BRIDGE_Y1)/2,BRIDGE_HZ+0.019,0,0,0,true);
  mk(RB(0.3,0.16,0.02,0.006),MAT.panel,Hs,-0.4,(BRIDGE_Y0+BRIDGE_Y1)/2,-BRIDGE_HZ-0.008); anchorAt('power',Hs,-0.4,BRIDGE_Y1-0.02,BRIDGE_HZ+0.03);
  mk(CY(0.05,0.05,0.34,18),MAT.alu,Hs,0.3,BRIDGE_Y0-0.06,-0.5,0,0,Math.PI/2); mk(RB(0.14,0.1,0.12,0.01),MAT.graphite,Hs,0.52,BRIDGE_Y0-0.06,-0.5); anchorAt('air',Hs,0.3,BRIDGE_Y0-0.1,-0.55);
  bake(Hs);
}
const FILL_X=-0.175, CRATE_X=0.63;                        // bin centre and crate centre, machine frame (carrier docked at x 0)
const LAND_X=-0.24, LAND_Y=1.95, LAND_Z0=0.36, LAND_Z1=1.12;   // upper cobots set fruit down on this lip   // landing belts, across the machine; the outboard 0.22 m is the place lip
const SORT_XS=-0.24, SORT_X1=0.44, HOOD_X=0.06, FILLER_X=0.22, SY=BRIDGE_Y1+0.05, BRIDGE_L=1.2;   // sorter lane: entry, end, camera hood, fresh gate
const LOWB_Y=0.42, LOWB_Z=0.93, LOWB_HX=0.46;             // low belts under the standing cobots (tube and drop modes)
const ELEV_X=0.0, LIP_LY=1.0, ELEV_Z=0.80, ELEV_TOP=2.05;              // cup elevator in the wall lifts to the landing belt
buildMachine();
// belt cleats, elevator cups, sorter rollers and gate flaps (animated)
const BELTS=[];
for(const sz of [1,-1]){
  for(const hx of [-1,1]){ const g1=new THREE.Group(); g1.position.set(hx*LOWB_HX,LOWB_Y-0.004,sz*LOWB_Z); if(hx>0) g1.rotation.y=Math.PI; H.add(g1);
    BELTS.push(new LoopItems(g1,BX(0.012,0.012,0.13),MAT.graphite,{len:Math.abs(hx*LOWB_HX-ELEV_X)-0.02,R:0.02,count:16})); }
  const g2=new THREE.Group(); g2.position.set(LAND_X,LAND_Y-0.004,sz*LAND_Z1); g2.rotation.y=sz*Math.PI/2; H.add(g2);
  BELTS.push(new LoopItems(g2,BX(0.012,0.012,0.22),MAT.graphite,{len:LAND_Z1-LAND_Z0,R:0.02,count:24}));
  const g3=new THREE.Group(); g3.position.set(ELEV_X,LOWB_Y,sz*ELEV_Z); g3.rotation.z=Math.PI/2; H.add(g3);
  BELTS.push(new LoopItems(g3,RB(0.05,0.03,0.1,0.01),MAT.foam,{len:ELEV_TOP-LOWB_Y,R:0.045,count:22}));
}
const ROLLERS=[]; for(let x=SORT_XS-0.04;x<=SORT_X1+0.001;x+=0.04){ if(Math.abs(x-FILLER_X)<0.045) continue; const m=mk(CY(0.017,0.017,0.2,12),MAT.aluMatte,H,x,SY,0,Math.PI/2,0,0); m.userData.live=true; ROLLERS.push(m);
  mk(BX(0.03,0.004,0.2),MAT.graphite,m,0,0.0171,0,0,0,0,true); }
const FLAPS=[1,-1].map(sz=>{ const g=new THREE.Group(); g.position.set(FILLER_X,SY-0.005,sz*0.09); H.add(g); mk(RB(0.08,0.008,0.09,0.003),MAT.yellow,g,0,0,-sz*0.045); return g; });
let flapOpen=0;
// fall-breaker socks: braked fabric tubes that unroll from reels in the bridge deck. Rolled up, nothing hangs below the deck,
// so a carrier (1.32 m) can leave through the 1.38 m tunnel.
const sockMat=std(0x3a4148,0.05,0.8,{side:THREE.DoubleSide,transparent:true,opacity:0.42,depthWrite:false});
const sockGeo=(()=>{ const g=new THREE.CylinderGeometry(1,1,1,18,1,true); g.translate(0,-0.5,0); return g; })();
function makeSock(x,r){ const m=mk(sockGeo,sockMat,H,x,BRIDGE_Y0,0); m.scale.set(r,0.01,r); m.userData.live=true; return m; }
const chuteSock=makeSock(CRATE_X,0.065);
const SOCKS={crate:0};                            // unrolled length of the industry sock, m
// ---- soft filler for fresh fruit: a padded, brush-lined spiral decelerator hangs from the deck into the bin, with a slowly
// turning padded spreader at its foot. Fruit roll down 2.5 turns at ≤ 0.35 m/s and step off the spreader 5 cm onto the pile.
// The carrier's hoist lifts the empty bin 0.45 m up round the spiral and lowers it as the pile grows; the last 0.17 m of
// pile the spiral makes by shortening. For a swap the spiral nests into a pocket in the deck and the bin goes back down.
const SP_R=0.13, SP_RI=0.07, SP_RO=0.19, SP_N=2.5, SP_LMAX=0.67, SP_AX=FILLER_X-SP_R, DISC_R=0.17, DISC_T=0.035, HOIST_MAX=0.45, SP_V=0.35;
const FL={L:0,car:null,spin:0};                  // spiral extension below the deck underside (disc bottom), m
const padMat=std(0x3f93c4,0,0.7,{side:THREE.DoubleSide}), brushMat=std(0x2a2d30,0,0.95), wallMat=std(0xa7c7d8,0.1,0.08,{transparent:true,opacity:0.2,depthWrite:false,side:THREE.DoubleSide});
const spiralG=new THREE.Group(); spiralG.position.set(SP_AX,BRIDGE_Y0,0); H.add(spiralG);
const spiralS=new THREE.Group(); spiralG.add(spiralS);            // unit-height helix (y 0 → −1), scaled to its height
function ribbon(fn,nu,nv,mat,parent){ const P=[], I=[]; for(let i=0;i<=nu;i++) for(let j=0;j<=nv;j++){ const p=fn(i/nu,j/nv); P.push(p[0],p[1],p[2]); }
  for(let i=0;i<nu;i++) for(let j=0;j<nv;j++){ const a=i*(nv+1)+j, b=a+nv+1; I.push(a,b,a+1,b,b+1,a+1); }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(P,3)); g.setIndex(I); g.computeVertexNormals(); const m=new THREE.Mesh(g,mat); m.castShadow=mat!==wallMat; m.receiveShadow=true; parent.add(m); return m; }
{ const NU=Math.round(SP_N*48), T=SP_N*2*Math.PI;
  ribbon((u,v)=>{ const th=u*T, r=SP_RI+(SP_RO-SP_RI)*v; return [r*Math.cos(th),-u-(v-0.5)*0.02,r*Math.sin(th)]; },NU,3,padMat,spiralS);                  // padded floor, dished
  ribbon((u,v)=>{ const th=u*T; return [SP_RO*Math.cos(th),-u+v*0.13,SP_RO*Math.sin(th)]; },NU,1,wallMat,spiralS);                                  // clear outer wall
  ribbon((u,v)=>{ const th=u*T; return [SP_RI*Math.cos(th),-u+v*0.06,SP_RI*Math.sin(th)]; },NU,1,padMat,spiralS);                                   // inner lip
  for(let k=0;k<SP_N*8;k++){ const th=(k+0.5)/8*2*Math.PI, u=th/T; const b=mk(BX(SP_RO-SP_RI-0.02,0.05,0.006),brushMat,spiralS,(SP_RI+SP_RO)/2*Math.cos(th),-u+0.03,(SP_RI+SP_RO)/2*Math.sin(th),0,-th,0,true); b.castShadow=false; }  // brush curtains
  mk(CY(0.045,0.045,1,16,true),MAT.aluMatte,spiralS,0,-0.5,0); }
const discG=new THREE.Group(); spiralG.add(discG);
{ mk(CY(DISC_R,DISC_R,0.012,32),MAT.aluMatte,discG,0,0.006,0); mk(CY(0.03,DISC_R-0.01,DISC_T-0.012,32),padMat,discG,0,0.012+(DISC_T-0.012)/2,0);
  for(let k=0;k<8;k++){ const a=k/8*2*Math.PI; mk(BX(DISC_R-0.05,0.018,0.012),MAT.foam,discG,Math.cos(a)*(DISC_R/2+0.02),DISC_T+0.006,Math.sin(a)*(DISC_R/2+0.02),0,-a,0); }
  mk(CY(0.04,0.04,0.03,16),MAT.graphite,discG,0,DISC_T+0.015,0); }
const pocket=mk(CY(0.235,0.235,0.012,36),shellDark,H,SP_AX,BRIDGE_Y0-0.004,0);
anchorAt('filler',spiralG,SP_RO+0.01,-0.25,0.08); anchorAt('spreader',discG,DISC_R,0.02,0.05);
// helix top: at the deck underside when working; up inside the deck pocket when nested
function spTop(L){ return BRIDGE_Y0+0.12-Math.min(L,0.18); }
function setSocks(){ chuteSock.scale.y=Math.max(0.01,SOCKS.crate);
  const L=FL.L, top=spTop(L), Lh=top-(BRIDGE_Y0-L+DISC_T); spiralS.position.y=top-BRIDGE_Y0; spiralS.scale.y=Math.max(0.004,Lh); discG.position.y=-L; discG.rotation.y=FL.spin; }

// ================================================================== perception: depth and colour cameras for multi-view fruit detection
// Every fruit is seen from at least four directions before a cobot reaches it, plus the wrist camera on the way in:
//  1. Look-ahead depth: a ZED X stereo pair (120 mm baseline, global shutter, IP67, polarizer) low and high on a slim tower at
//     each machine corner, aimed 35° outboard of straight ahead. Only the leading end's towers map; the trailing end's re-check.
//  2. HDR colour on the same towers between them (8 MP, 120 dB-class HDR, IP67): the oblique colour view.
//  3. Stem cameras: HDR colour on the roof edge looking down 40° onto the canopy face, the view that sees stems and tops.
//  4. Under-canopy: global-shutter colour low on each sill pack, looking up 30° at fruit hidden under leaves.
//  5. Wrist: a close-range stereo camera (4–100 cm) on every hand adapter for the last 0.5 m, several frames along the approach.
// All machine cameras are GMSL2 on FAKRA (locked coax, 15 m, hardware sync) into three Jetson AGX Orin in the power cabinet.
const camMats={ body:std(0x2a2f34,0.3,0.45), zed:std(0x1d2226,0.35,0.35), hood:std(0x3a4147,0.3,0.5), glass:std(0x0d1820,0.4,0.05), tower:std(0x2b3036,0.4,0.42) };
const FOVM={ depth:new THREE.MeshBasicMaterial({color:C(0x4aa8ff),transparent:true,opacity:0.07,depthWrite:false,side:THREE.DoubleSide}),
  hdr:new THREE.MeshBasicMaterial({color:C(0xffb13b),transparent:true,opacity:0.07,depthWrite:false,side:THREE.DoubleSide}),
  low:new THREE.MeshBasicMaterial({color:C(0xb07cff),transparent:true,opacity:0.08,depthWrite:false,side:THREE.DoubleSide}) };
const FOVL={ depth:new THREE.LineBasicMaterial({color:C(0x4aa8ff),transparent:true,opacity:0.55}), hdr:new THREE.LineBasicMaterial({color:C(0xffb13b),transparent:true,opacity:0.55}),
  low:new THREE.LineBasicMaterial({color:C(0xb07cff),transparent:true,opacity:0.6}) };
const FOV_G=new THREE.Group(); FOV_G.visible=false; H.add(FOV_G);
// a viewing pyramid (camera at the apex, looking along local +z), drawn to the canopy face
function fovPyramid(parent,kind,hfov,vfov,far){ const a=Math.tan(hfov/2*Math.PI/180)*far, b=Math.tan(vfov/2*Math.PI/180)*far;
  const P=[[0,0,0],[-a,-b,far],[a,-b,far],[a,b,far],[-a,b,far]].map(p=>new THREE.Vector3(p[0],p[1],p[2]));
  const g=new THREE.BufferGeometry().setFromPoints([P[0],P[1],P[2], P[0],P[2],P[3], P[0],P[3],P[4], P[0],P[4],P[1]]); g.computeVertexNormals();
  const m=new THREE.Mesh(g,FOVM[kind]); parent.add(m);
  const e=new THREE.BufferGeometry().setFromPoints([P[0],P[1],P[0],P[2],P[0],P[3],P[0],P[4],P[1],P[2],P[2],P[3],P[3],P[4],P[4],P[1]]); parent.add(new THREE.LineSegments(e,FOVL[kind])); }
// a camera mount: group at p, looking along dir (machine frame); builds the body by type and its field of view
const CAMS=[];
function camAt(type,p,dir,key){ const g=new THREE.Group(); g.position.set(p[0],p[1],p[2]); H.add(g); const d=new THREE.Vector3(dir[0],dir[1],dir[2]).normalize();
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),d);
  if(type==='zed'){ mk(RB(0.164,0.032,0.037,0.008),camMats.zed,g,0,0,0); for(const x of [-0.06,0.06]){ mk(CY(0.011,0.011,0.004,18),camMats.glass,g,x,0,0.019,Math.PI/2,0,0,true); }
    mk(RB(0.03,0.012,0.004,0.002),MAT.aluMatte,g,0,0.012,0.0185,0,0,0,true); }
  else if(type==='hdr'||type==='low'){ mk(RB(0.03,0.03,0.05,0.004),camMats.body,g,0,0,-0.005); mk(CY(0.016,0.016,0.03,16),camMats.body,g,0,0,0.035,Math.PI/2,0,0);
    mk(CY(0.011,0.011,0.003,16),camMats.glass,g,0,0,0.051,Math.PI/2,0,0,true);
    mk(RB(0.05,0.004,0.05,0.002),camMats.hood,g,0,0.022,0.03,0,0,0,true); }                    // sun shield over the lens
  const fg=new THREE.Group(); fg.position.copy(g.position); fg.quaternion.copy(g.quaternion); FOV_G.add(fg);
  if(type==='zed') fovPyramid(fg,'depth',110,80,1.25); else if(type==='hdr') fovPyramid(fg,'hdr',90,60,1.35); else fovPyramid(fg,'low',100,62,1.0);
  if(key) anchorAt(key,g,0,0.03,0);
  CAMS.push({type,g}); return g; }
function buildCameras(){
  const yaw=35*Math.PI/180, DG=Math.PI/180;
  for(const ex of [1,-1]) for(const sz of [1,-1]){ const x=ex*0.93, z=sz*0.738;
    // slim tower inside the side-wall plane, on the pod at the machine corner (the wall keep-out covers it)
    mk(PROF(2.1,0.04,0.04),camMats.tower,Hs,x,0.85+1.05,z,0,0,Math.PI/2); mk(RB(0.06,0.02,0.06,0.006),camMats.tower,Hs,x,2.96,z);
    const fwd=[ex*Math.cos(yaw),0,sz*Math.sin(yaw)];
    const first=ex>0&&sz>0;
    camAt('zed',[x,1.05,sz*0.79],[fwd[0],-0.17,fwd[2]],first?'c_zedLo':null);
    camAt('hdr',[x,1.72,sz*0.785],[fwd[0],0.02,fwd[2]],first?'c_hdrT':null);
    camAt('zed',[x,2.38,sz*0.79],[fwd[0],0.12,fwd[2]],first?'c_zedHi':null);
    for(const y of [1.05,1.72,2.38]) mk(RB(0.03,0.05,0.05,0.006),camMats.tower,Hs,x,y,sz*0.76);         // brackets
  }
  // stem cameras on the roof edge, between the columns, looking outboard and 40° down
  for(const sz of [1,-1]) for(const x of [0.28,-0.28]){ const d=[0,-Math.sin(40*DG),sz*Math.cos(40*DG)];
    mk(RB(0.05,0.08,0.06,0.008),camMats.tower,Hs,x,ROOF_Y-0.02,sz*0.82); camAt('hdr',[x,ROOF_Y-0.07,sz*0.86],d,(x>0&&sz>0)?'c_stem':null); }
  // under-canopy cameras on the sill packs, looking outboard and 30° up
  for(const sz of [1,-1]) for(const x of [0.3,-0.3]){ const d=[0,Math.sin(30*DG),sz*Math.cos(30*DG)]; camAt('low',[x,0.31,sz*1.02],d,(x>0&&sz>0)?'c_low':null); }
}
buildCameras();
function setFov(on){ FOV_G.visible=on; }

// ================================================================== cobot kinematics (standard DH, machine frame, metres)
// 4×4 matrices as Float64Array(16), row-major. Column 0/1/2 = x/y/z axes, column 3 = origin.
function m4(){ const m=new Float64Array(16); m[0]=m[5]=m[10]=m[15]=1; return m; }
function mmul(A,B,O){ for(let r=0;r<4;r++){ const a0=A[r*4],a1=A[r*4+1],a2=A[r*4+2],a3=A[r*4+3];
  O[r*4]=a0*B[0]+a1*B[4]+a2*B[8]+a3*B[12]; O[r*4+1]=a0*B[1]+a1*B[5]+a2*B[9]+a3*B[13];
  O[r*4+2]=a0*B[2]+a1*B[6]+a2*B[10]+a3*B[14]; O[r*4+3]=a0*B[3]+a1*B[7]+a2*B[11]+a3*B[15]; } return O; }
function dhM(th,d,a,al,O){ const ct=Math.cos(th),st=Math.sin(th),ca=Math.cos(al),sa=Math.sin(al);
  O[0]=ct; O[1]=-st*ca; O[2]=st*sa; O[3]=a*ct; O[4]=st; O[5]=ct*ca; O[6]=-ct*sa; O[7]=a*st; O[8]=0; O[9]=sa; O[10]=ca; O[11]=d; O[12]=O[13]=O[14]=0; O[15]=1; return O; }
// base frame: z up (standing) or down (hanging); x toward the canopy (world ±z on side s)
function baseM(bx,by,bz,hang,s,O){ O=O||m4(); const zy=hang?-1:1;           // z=(0,zy,0), x=(0,0,s), y=z×x=(zy*s,0,0)
  O[0]=0; O[1]=zy*s; O[2]=0; O[3]=bx;  O[4]=0; O[5]=0; O[6]=zy; O[7]=by;  O[8]=s; O[9]=0; O[10]=0; O[11]=bz; O[12]=O[13]=O[14]=0; O[15]=1; return O; }
const _dh=m4();
function fk(B,q,M,F){ F[0].set(B); for(let i=0;i<6;i++){ dhM(q[i],M.d[i],M.a[i],DH_AL[i],_dh); mmul(F[i],_dh,F[i+1]); } return F; }
function newFrames(){ return [0,1,2,3,4,5,6].map(()=>m4()); }
const KF=newFrames();
// solve (6×6) A y = e in place, Gaussian elimination with partial pivoting
function solve6(A,e){ const n=6;
  for(let c=0;c<n;c++){ let p=c, mx=Math.abs(A[c*n+c]); for(let r=c+1;r<n;r++){ const v=Math.abs(A[r*n+c]); if(v>mx){mx=v;p=r;} }
    if(p!==c){ for(let k=0;k<n;k++){ const t=A[c*n+k]; A[c*n+k]=A[p*n+k]; A[p*n+k]=t; } const t=e[c]; e[c]=e[p]; e[p]=t; }
    const d=A[c*n+c]||1e-12; for(let r=c+1;r<n;r++){ const f=A[r*n+c]/d; if(!f) continue; for(let k=c;k<n;k++) A[r*n+k]-=f*A[c*n+k]; e[r]-=f*e[c]; } }
  for(let r=n-1;r>=0;r--){ let s=e[r]; for(let k=r+1;k<n;k++) s-=A[r*n+k]*e[k]; e[r]=s/(A[r*n+r]||1e-12); } return e; }
const _J=new Float64Array(36), _A=new Float64Array(36), _e=new Float64Array(6);
const W_ORI=0.3, LAM=0.03, Q3_MAX=2.8;
// damped least squares on 5 constraints: TCP position and tool z axis. L = flange → TCP along tool z. J6 is left alone (roll).
// returns the residual; q is updated in place.
function ikSolve(B,M,L,P,a,q,iters){ let err=1;
  for(let it=0;it<iters;it++){
    fk(B,q,M,KF); const F=KF[6], zx=F[2],zy=F[6],zz=F[10], px=F[3]+zx*L, py=F[7]+zy*L, pz=F[11]+zz*L;
    const ex=P[0]-px, ey=P[1]-py, ez=P[2]-pz, ox=(a[0]-zx)*W_ORI, oy=(a[1]-zy)*W_ORI, oz=(a[2]-zz)*W_ORI;
    err=Math.hypot(ex,ey,ez)+0.1*Math.hypot(a[0]-zx,a[1]-zy,a[2]-zz); if(Math.hypot(ex,ey,ez)<2e-4&&Math.hypot(a[0]-zx,a[1]-zy,a[2]-zz)<2e-3) break;
    for(let i=0;i<6;i++){ const Fi=KF[i], ax=Fi[2],ay=Fi[6],az=Fi[10], rx=px-Fi[3], ry=py-Fi[7], rz=pz-Fi[11];
      _J[i]=ay*rz-az*ry; _J[6+i]=az*rx-ax*rz; _J[12+i]=ax*ry-ay*rx;
      _J[18+i]=(ay*zz-az*zy)*W_ORI; _J[24+i]=(az*zx-ax*zz)*W_ORI; _J[30+i]=(ax*zy-ay*zx)*W_ORI; }
    for(let r=0;r<6;r++) for(let c=0;c<6;c++){ let s=0; for(let k=0;k<6;k++) s+=_J[r*6+k]*_J[c*6+k]; _A[r*6+c]=s+(r===c?LAM*LAM:0); }
    _e[0]=ex;_e[1]=ey;_e[2]=ez;_e[3]=ox;_e[4]=oy;_e[5]=oz; solve6(_A,_e);
    for(let k=0;k<6;k++){ let d=0; for(let r=0;r<6;r++) d+=_J[r*6+k]*_e[r]; d=Math.max(-0.25,Math.min(0.25,d)); q[k]+=d; }
    q[2]=Math.max(-Q3_MAX,Math.min(Q3_MAX,q[2]));
  }
  for(const k of [0,3,4,5]){ if(q[k]>Math.PI) q[k]-=2*Math.PI; else if(q[k]<-Math.PI) q[k]+=2*Math.PI; }
  return err; }

// ================================================================== pick planning with collision checking (pure maths)
// Every motion is checked, not just its end pose: the joint path is sampled, each sample is turned into capsules (one per link,
// plus the tool and the carriage/slide), and the capsules are tested against the machine's keep-out volumes and against the
// capsules that the other cobots on the same side have reserved for what they are doing.
const STAND={direct:0.52, tele:0.77};      // wanted horizontal stand-off, base → fruit (the slide gets as close as it can)
const PRE={direct:0.10, tele:0.30};        // final approach: arm (direct) or telescope stroke (tele)
const PSIS={direct:[0,0.3,-0.3,0.6,-0.6], tele:[0,0.3,-0.3,0.6,-0.6,0.9,-0.9,1.15,-1.15]};   // approach yaw candidates, rad
const WJ=Math.PI, AJ=6.0;                  // joint speed 180°/s (both datasheets), assumed joint acceleration
const HD_MIN=0.10, SIN5_MIN=0.2, Q3_MIN=0.15;
const SEED_STAND=[0,-1.2,1.8,-0.6,1.57,0], SEED_HANG=[0,-1.9,-1.8,0.6,1.57,0];
// seed banks: both shoulder sides and both wrist flips, so the solver can find the configuration whose shoulder and upper arm
// stay outboard (the other one puts the upper arm into the column)
const PI_=Math.PI;
const BANK={stand:[[0,-1.9,-1.8,0.6,-1.57,0],[PI_,-1.9,-1.8,0.6,-1.57,0],[PI_,-1.2,1.8,-0.6,1.57,0],[-PI_/2,-1.2,1.8,-0.6,1.57,0],[0,-1.2,1.8,-0.6,1.57,0]],
  hang:[[0,-1.9,-1.8,0.6,-1.57,0],[0,-1.2,1.8,-0.6,-1.57,0],[PI_/2,-1.9,-1.8,0.6,1.57,0],[PI_,-1.9,-1.8,0.6,-1.57,0],[0,-1.9,-1.8,0.6,1.57,0]]};
const N_SWEEP=6, RES_MARGIN=0.05;
// approach: nearly level (10° up), so the stem of a hanging fruit runs along hand D's +y, the side the cutting finger swings to
const APP_EL=0.17;
function approachVec(s,psi,o){ o=o||[0,0,0]; const c=Math.cos(APP_EL); o[0]=c*Math.sin(psi); o[1]=Math.sin(APP_EL); o[2]=s*c*Math.cos(psi); return o; }
// the hand's down direction with J6 holding the deck up: world down, square to the tool axis
function handDown(z,o){ o=o||[0,0,0]; const d=-z[1]; o[0]=d*z[0]; o[1]=-1+d*z[1]; o[2]=d*z[2]; const l=Math.hypot(o[0],o[1],o[2]); if(l<0.2){ o[0]=0; o[1]=0; o[2]=0; return o; } o[0]/=l; o[1]/=l; o[2]/=l; return o; }
function toolLen(ext){ return EOATS[EOAT].len+(ext||0); }
function baseYFor(u,y){ return clamp(u.hang?y+0.30:y-0.30,u.yr[0],u.yr[1]); }
function baseZFor(u,dd){ return clamp(dd-STAND[EOAT],SLIDE_Z0,SLIDE_Z1); }
function wrapNear(q,ref){ for(const k of [0,3,4,5]){ while(q[k]-ref[k]>Math.PI) q[k]-=2*Math.PI; while(q[k]-ref[k]<-Math.PI) q[k]+=2*Math.PI; } return q; }
function jointTime(q0,q1){ let T=0; for(let k=0;k<6;k++) T=Math.max(T,trap(q1[k]-q0[k],WJ,AJ)); return T; }

// ---------------- capsules: [ax,ay,az, bx,by,bz, r, kind]  kind 0 link, 1 tool, 2 base, 3 carriage
function armCaps(F,L,out,holdR){ const o=i=>[F[i][3],F[i][7],F[i][11]], z=i=>[F[i][2],F[i][6],F[i][10]], add=(p,v,k)=>[p[0]+v[0]*k,p[1]+v[1]*k,p[2]+v[2]*k];
  const o0=o(0),o1=o(1),o2=o(2),o3=o(3),o4=o(4),o5=o(5),o6=o(6),z1=z(1),z2=z(2),z3=z(3),z6=z(6);
  const P=(a,b,r,k)=>out.push([a[0],a[1],a[2],b[0],b[1],b[2],r,k]);
  P(o0,o1,0.072,2);
  P(add(o1,z1,-0.05),add(o1,z1,0.16),0.064,0);
  P(add(o1,z1,0.13),add(o2,z2,0.13),0.05,0);
  P(add(o2,z2,0.02),add(o2,z2,0.19),0.055,0);
  P(add(o2,z2,0.035),add(o3,z3,0.035),0.042,0);
  P(add(o3,z3,-0.05),o4,0.045,0);
  P(o4,o5,0.045,0); P(o5,o6,0.042,0);
  P(o6,add(o6,z6,L),Math.max(0.066,holdR||0),1);                 // hand D: housing ⌀104, fingers open to r ≈ 75 mm near the tip
  if(DELIV==='drop'){ const dn=handDown(z6,_dn); if(dn[1]<0) P(add(add(o6,z6,L),dn,0.105),add(add(o6,z6,L+0.07),dn,0.11),0.052,1); }   // catch funnel
  return out; }
const _dn=[0,0,0];
function carriageCap(u,yb,zb,out){ const y=yb+(u.hang?0.07:-0.07); out.push([u.bx,y,u.s*(MAST_Z+0.06),u.bx,y,u.s*(zb+0.09),0.07,3]); return out; }
// keep-out volumes, side-local coordinates (X = x, Z = outward from the centre line)
function pointHit(x,y,z,r,s,kind){ const X=Math.abs(x), Z=s*z;
  if(y<0.05+r) return true;
  if(X<0.97&&Z<ZW+r) return true;                                                             // side wall (and everything inboard)
  if(kind!==2&&Math.abs(X-MAST_X)<0.07+r&&Z<0.83+r) return true;                              // columns (rack face at 0.83)
  if(X>TOWER_X-POD_HX-r&&X<TOWER_X+POD_HX+r&&y<POD_Y1+r&&Z<POD_Z1+r) return true;             // wheel pods
  if(X>0.86-r&&X<0.97+r&&Z<0.815+r&&y>0.95-r&&y<2.48+r) return true;                       // corner camera towers
  if(X<0.34+r&&Z<0.9+r&&y>ROOF_Y-0.14-r) return true;                                           // roof-edge stem cameras
  if(Math.abs(x-ELEV_X)<0.08+r&&Z<ELEV_Z+0.075+r&&y>LOWB_Y-0.06-r&&y<ELEV_TOP+0.06+r) return true;   // cup elevator
  if(x>LAND_X+0.08-r&&x<ELEV_X+r&&Z<ELEV_Z+0.055+r&&y>ELEV_TOP-0.03-r&&y<ELEV_TOP+0.05+r) return true;   // its head chute
  if(Math.abs(x-ELEV_X)<0.045+r&&Z<0.99+r&&y>LIP_LY-0.11-r&&y<LIP_LY-0.04+r) return true;             // funnel chute into the elevator
  if(kind!==1){ if(Math.abs(x-ELEV_X)<0.1+r&&Math.abs(Z-1.0)<0.1+r&&Math.abs(y-LIP_LY)<0.05+r) return true;   // lower funnel
    if(Math.abs(x-LAND_X)<0.14+r&&Z<LAND_Z1+0.01+r&&Math.abs(y-(LAND_Y-0.01))<0.05+r) return true;   // landing belt lip
    if(X<LOWB_HX+0.02+r&&Z<LOWB_Z+0.09+r&&y<LOWB_Y+0.05+r) return true; }                      // low belt
  return false; }
const STATIC_MARGIN=0.02;   // planning keeps 2 cm from the machine, so the path between two checked samples stays clear
function capStatic(c,s,m){ const dx=c[3]-c[0], dy=c[4]-c[1], dz=c[5]-c[2], L=Math.hypot(dx,dy,dz), n=Math.max(1,Math.ceil(L/0.05)), r=c[6]+(m||0);
  for(let i=0;i<=n;i++){ const t=i/n; if(pointHit(c[0]+dx*t,c[1]+dy*t,c[2]+dz*t,r,s,c[7])) return true; } return false; }
function capsBox(caps){ const b=[9,9,9,-9,-9,-9]; for(const c of caps){ for(const k of [0,1,2]){ const lo=Math.min(c[k],c[k+3])-c[6], hi=Math.max(c[k],c[k+3])+c[6]; if(lo<b[k]) b[k]=lo; if(hi>b[k+3]) b[k+3]=hi; } } return b; }
// closest distance between two segments (Ericson, Real-Time Collision Detection 5.1.9)
function segDist(p,q){ const d1x=p[3]-p[0],d1y=p[4]-p[1],d1z=p[5]-p[2], d2x=q[3]-q[0],d2y=q[4]-q[1],d2z=q[5]-q[2], rx=p[0]-q[0],ry=p[1]-q[1],rz=p[2]-q[2];
  const a=d1x*d1x+d1y*d1y+d1z*d1z, e=d2x*d2x+d2y*d2y+d2z*d2z, f=d2x*rx+d2y*ry+d2z*rz; let s=0,t=0;
  if(a<1e-9&&e<1e-9){ } else if(a<1e-9){ t=clamp(f/e,0,1); } else { const c=d1x*rx+d1y*ry+d1z*rz;
    if(e<1e-9){ s=clamp(-c/a,0,1); } else { const b=d1x*d2x+d1y*d2y+d1z*d2z, den=a*e-b*b; s=den>1e-9?clamp((b*f-c*e)/den,0,1):0; t=(b*s+f)/e;
      if(t<0){ t=0; s=clamp(-c/a,0,1); } else if(t>1){ t=1; s=clamp((b-c)/a,0,1); } } }
  const x=rx+d1x*s-d2x*t, y=ry+d1y*s-d2y*t, z=rz+d1z*s-d2z*t; return Math.sqrt(x*x+y*y+z*z); }
// does a capsule set touch any reserved set?  others: [{caps,box}]
function resHit(caps,box,others,mg){ const RM=mg==null?RES_MARGIN:mg; for(const R of others){ if(!R||!R.caps.length) continue; const b=R.box;
    if(box[0]>b[3]+RM||box[3]<b[0]-RM||box[1]>b[4]+RM||box[4]<b[1]-RM||box[2]>b[5]+RM||box[5]<b[2]-RM) continue;
    for(const c of caps){ const m=c[6]+RM+0.12;   // capsule vs the other set's box first
      if(Math.min(c[0],c[3])>b[3]+m||Math.max(c[0],c[3])<b[0]-m||Math.min(c[1],c[4])>b[4]+m||Math.max(c[1],c[4])<b[1]-m||Math.min(c[2],c[5])>b[5]+m||Math.max(c[2],c[5])<b[2]-m) continue;
      for(const d of R.caps){ if(segDist(c,d)<c[6]+d[6]+RM) return true; } } }
  return false; }
// distance from a point to a reserved set (cheap pre-check before planning a pick)
function pointNearRes(P,R,d){ const b=R.box; if(P[0]<b[0]-d||P[0]>b[3]+d||P[1]<b[1]-d||P[1]>b[4]+d||P[2]<b[2]-d||P[2]>b[5]+d) return false;
  const p=[P[0],P[1],P[2],P[0],P[1],P[2],0,0]; for(const c of R.caps) if(segDist(p,c)<c[6]+d) return true; return false; }
// capsules of one pose (and the static test)
const _Bs=m4(), KFs=newFrames();
function poseCaps(u,q,yb,zb,ext,out,hold,margin){ const mg=margin==null?STATIC_MARGIN:margin; baseM(u.bx,yb,u.s*zb,u.hang,u.s,_Bs); fk(_Bs,q,COBOTS[COBOT],KFs); const n0=out.length;
  armCaps(KFs,toolLen(ext),out,hold?0.05:0); carriageCap(u,yb,zb,out);
  for(let i=n0;i<out.length;i++){ const c=out[i]; if(c[7]!==3&&capStatic(c,u.s,mg)) return false; } return true; }
// a joint-space move sampled N_SWEEP times; returns null if any sample hits the machine
// the first sample is where the arm already is: it is reserved but not tested, so a unit can always move off its own pose
function sweepCaps(u,m,out,hold,first,noCheck){ let dq=0; for(let k=0;k<6;k++) dq=Math.max(dq,Math.abs(m.q1[k]-m.q0[k])); dq=Math.max(dq,Math.abs(m.y1-m.y0)*2,Math.abs(m.z1-m.z0)*2);
  const n=Math.max(N_SWEEP,Math.ceil(dq/(first?0.03:0.08))), q=[0,0,0,0,0,0];   // leaving a tight pose: finer steps, since the margin there is only 3 mm
  for(let i=0;i<=n;i++){ const t=i/n, e=t; for(let k=0;k<6;k++) q[k]=m.q0[k]+(m.q1[k]-m.q0[k])*e;
    // leaving the current pose: the first few centimetres only have to be clear, not 2 cm clear (the arm may be working close)
    const mg=first&&t*dq<0.25?0.003:undefined;
    const ok=poseCaps(u,q,m.y0+(m.y1-m.y0)*e,m.z0+(m.z1-m.z0)*e,m.e0+(m.e1-m.e0)*e,out,hold,mg); if(!ok&&!noCheck&&!(first&&i===0)) return null; }
  return out; }
function legOf(u,q0,y0,z0,e0,q1,y1,z1,e1){ const qq=q1.slice(); wrapNear(qq,q0); return {q0:q0.slice(),q1:qq,y0,y1,z0,z1,e0,e1}; }
// a path from the unit's current state to a target: straight in joint space, else via the stow pose at the current height
function planPath(u,q1,y1,z1,e1,hold,others,extra,rm){ const q0=u.q, y0=u.yb, z0=u.zb, e0=u.ext, qr=u.readyQ, qs=u.stowQ;
  const tries=[[legOf(u,q0,y0,z0,e0,q1,y1,z1,e1)]];
  if(qr) tries.push([legOf(u,q0,y0,z0,e0,qr,y0,z0,0),legOf(u,qr,y0,z0,0,qr,y1,z1,0),legOf(u,qr,y1,z1,0,q1,y1,z1,e1)]);
  tries.push([legOf(u,q0,y0,z0,e0,qs,y0,z0,0),legOf(u,qs,y0,z0,0,qs,y1,z1,0),legOf(u,qs,y1,z1,0,q1,y1,z1,e1)]);
  if(qr){ tries.push([legOf(u,q0,y0,z0,e0,qs,y0,z0,0),legOf(u,qs,y0,z0,0,qs,y1,z1,0),legOf(u,qs,y1,z1,0,qr,y1,z1,0),legOf(u,qr,y1,z1,0,q1,y1,z1,e1)]);
    tries.push([legOf(u,q0,y0,z0,e0,qr,y0,z0,0),legOf(u,qr,y0,z0,0,qs,y0,z0,0),legOf(u,qs,y0,z0,0,qs,y1,z1,0),legOf(u,qs,y1,z1,0,q1,y1,z1,e1)]); }
  { const qa=q0.slice(); qa[0]=wrapNear(q1.slice(),q0)[0]; tries.push([legOf(u,q0,y0,z0,e0,qa,y0,z0,e0),legOf(u,qa,y0,z0,e0,q1,y1,z1,e1)]); }
  // back off along the column first (hanging cobots up, standing ones down), then fold and go
  { const yA=clamp(y0+(u.hang?0.35:-0.35),u.yr[0],u.yr[1]); if(Math.abs(yA-y0)>0.05){ const lift=legOf(u,q0,y0,z0,e0,q0,yA,z0,e0);
      if(qr) tries.push([lift,legOf(u,q0,yA,z0,e0,qr,yA,z0,0),legOf(u,qr,yA,z0,0,qr,y1,z1,0),legOf(u,qr,y1,z1,0,q1,y1,z1,e1)]);
      tries.push([lift,legOf(u,q0,yA,z0,e0,qs,yA,z0,0),legOf(u,qs,yA,z0,0,qs,y1,z1,0),legOf(u,qs,y1,z1,0,q1,y1,z1,e1)]); } }
  // after a pick: first back to the planned retreat pose (whose way out was checked when the pick was planned)
  if(u.escape&&Math.abs(u.escape.yb-y0)<1e-6){ const qe=u.escape.q; for(const qv of [qr,qs]){ if(!qv) continue;
    tries.push([legOf(u,q0,y0,z0,e0,qe,y0,z0,0),legOf(u,qe,y0,z0,0,qv,y0,z0,0),legOf(u,qv,y0,z0,0,qv,y1,z1,0),legOf(u,qv,y1,z1,0,q1,y1,z1,e1)]); } }
  let blocked=false;
  for(const legs of tries){ const caps=[]; let ok=true; for(let li=0;li<legs.length;li++){ const n0=caps.length; if(!sweepCaps(u,legs[li],caps,hold,li===0)){ ok=false; break; }
      // (the pose the arm is already in is not tested against the others: it is where the arm is)
      if(others.length){ let part;
        if(li===0){ const near=caps.slice(n0+10,n0+50); part=caps.slice(n0+50); if(near.length&&resHit(near,capsBox(near),others,0.005)){ ok=false; blocked=true; break; } }   // leaving: may start close
        else part=caps.slice(n0);
        if(part.length&&resHit(part,capsBox(part),others,rm)){ ok=false; blocked=true; break; } } }
    if(!ok) continue; if(extra){ for(const c of extra) caps.push(c); } const box=capsBox(caps);
    return {ok:true,legs,res:{caps,box},extra:extra||null}; }
  return {ok:false,blocked}; }
// a hanging cobot's way out must also stay above a standing neighbour folded at the bottom of its stroke (top of its stow ≈ 1.39 m)
function canLeaveTier(u,q,yb,zb){ for(const qt of [u.readyQ,u.stowQ]){ if(!qt) continue; const c=[]; if(!sweepCaps(u,legOf(u,q,yb,zb,0,qt,yb,zb,0),c,true,false)) continue;
    if(u.hang){ let lo=9; for(const k of c) if(k[7]!==3) lo=Math.min(lo,k[1]-k[6],k[4]-k[6]); if(lo<1.43) continue; } return true; } return false; }
function canLeave(u,q,yb,zb){ for(const qt of [u.readyQ,u.stowQ]){ if(!qt) continue; const c=[]; if(sweepCaps(u,legOf(u,q,yb,zb,0,qt,yb,zb,0),c,true,false)) return true; } return false; }
// ---------------- pick plan: carriage height, slide, approach yaw, joint targets, collision-free path, reservation
const _B=m4(), _a=[0,0,0], _P=[0,0,0];
function planPick(u,P,others){ const M=COBOTS[COBOT], s=u.s, dd=Math.abs(P[2]);
  const yb=baseYFor(u,P[1]), zb=baseZFor(u,dd); baseM(u.bx,yb,s*zb,u.hang,s,_B);
  const L=toolLen(EOAT==='tele'?EOATS.tele.ext:0), Lw=L+M.d[5]; let why='sing';
  const bank=(u.readyQ?[u.readyQ]:[]).concat([u.q],BANK[u.hang?'hang':'stand']);
  for(const psi of PSIS[EOAT]){ approachVec(s,psi,_a);
    const wx=P[0]-_a[0]*Lw, wz=P[2]-_a[2]*Lw; if(Math.hypot(wx-u.bx,wz-s*zb)<HD_MIN) continue; why='ik';
    for(const seed of bank){ const q=seed.slice();
      if(ikSolve(_B,M,L,P,_a,q,55)>2e-3) continue;
      if(Math.abs(Math.sin(q[4]))<SIN5_MIN||Math.abs(q[2])<Q3_MIN){ why='sing'; continue; }
      const qp=q.slice(), a=_a.slice(), E=EOAT==='tele'?EOATS.tele.ext:0;
      if(EOAT==='direct'){ _P[0]=P[0]-a[0]*PRE.direct; _P[1]=P[1]-a[1]*PRE.direct; _P[2]=P[2]-a[2]*PRE.direct; if(ikSolve(_B,M,L,_P,a,qp,40)>2e-3) continue; }
      // the pick itself (tool in, holding) and the retreat must be clear too
      const extra=[]; if(!poseCaps(u,q,yb,zb,E,extra,true)||!poseCaps(u,qp,yb,zb,0,extra,true)){ why='hit'; continue; }
      // it must also be able to get back out with the fruit: a clear move from the retreat pose to the ready or stow pose
      if(!canLeave(u,qp,yb,zb)){ why='trap'; continue; }
      const pp=planPath(u,qp,yb,zb,0,false,others,extra); if(!pp.ok){ why=pp.blocked?'busy':'hit'; continue; }
      wrapNear(q,pp.legs[pp.legs.length-1].q1);
      return {ok:true,q,qp:pp.legs[pp.legs.length-1].q1,yb,zb,psi,a,legs:pp.legs,res:pp.res,extra}; } }
  return {ok:false,why}; }
// ---------------- delivery (carry): fruit hanging under the hand, set down on the lip of the landing belt
// upper (hanging) cobots set down on the landing-belt lip at 1.76 m; lower (standing) ones in a funnel on the elevator at 1.0 m, so neither tier reaches through the other's band to deliver
function placeTarget(u,o){ o=o||[0,0,0]; if(u.hang){ o[0]=LAND_X+u.e*0.07; o[1]=LAND_Y+0.055; o[2]=u.s*1.04; } else { o[0]=ELEV_X; o[1]=LIP_LY+0.09; o[2]=u.s*1.0; } return o; }
const DOWN=[0,-1,0];
// hand palm-down, tilted up to 27° toward the wall, so the wrist stays outboard of the lip
function placeDirs(s,e){ const n=v=>{ const l=Math.hypot(v[0],v[1],v[2]); return v.map(c=>c/l); }; return [n([0,-1,-s*0.5]),DOWN,n([-e*0.45,-1,-s*0.3]),n([e*0.45,-1,-s*0.3])]; }
// the set-down point never moves (machine frame), so each unit's set-down pose, its carriage height and a clear approach from the
// ready pose are found once; at run time only the move there is planned (and checked against the other cobots)
function placeSetup(u){ const M=COBOTS[COBOT], L=toolLen(0), zb=SLIDE_Z0, P=placeTarget(u), qr=u.readyQ; if(!qr) return null; let best=null;
  for(const yb0 of (u.hang?[2.3,2.45,2.6,2.8]:[0.9,1.05,1.2,1.35,0.82])){ const yb=clamp(yb0,u.yr[0],u.yr[1]); baseM(u.bx,yb,u.s*zb,u.hang,u.s,_B);
    for(const dir of placeDirs(u.s,u.e)) for(const seed of [qr].concat(BANK[u.hang?'hang':'stand'])){ const q=seed.slice();
      if(ikSolve(_B,M,L,P,dir,q,70)>2e-3) continue; const Pd=[P[0]-dir[0]*0.1,P[1]-dir[1]*0.1,P[2]-dir[2]*0.1], qp=q.slice(); if(ikSolve(_B,M,L,Pd,dir,qp,40)>2e-3) continue;
      wrapNear(qp,qr); wrapNear(q,qp); const c=[]; if(!poseCaps(u,q,yb,zb,0,c,true)||!poseCaps(u,qp,yb,zb,0,c,true)) continue;
      let d=0; for(let k=0;k<6;k++) d=Math.max(d,Math.abs(qp[k]-qr[k])); if(best&&d>=best.d) continue;
      const cc=[]; if(!sweepCaps(u,legOf(u,qr,yb,zb,0,qp,yb,zb,0),cc,true,false)||!sweepCaps(u,legOf(u,qp,yb,zb,0,q,yb,zb,0),cc,true,false)) continue;
      best={d,yb,zb,q,qp,dir,P,Pp:Pd}; } }
  return best; }
function planPlace(u,others){ const S0=u.placeSetup; if(!S0) return {ok:false};
  const extra=[]; poseCaps(u,S0.q,S0.yb,S0.zb,0,extra,true); poseCaps(u,S0.qp,S0.yb,S0.zb,0,extra,true);
  const pp=planPath(u,S0.qp,S0.yb,S0.zb,0,true,others,extra); if(!pp.ok) return {ok:false,blocked:pp.blocked};
  return {ok:true,q:S0.q,qp:S0.qp,yb:S0.yb,zb:S0.zb,P:S0.P,Pp:S0.Pp,dir:S0.dir,legs:pp.legs,res:pp.res,extra}; }
// ---------------- tube and drop: the collar must sit above the belt inlet and within one sock length of it
function receiver(u,o){ o=o||[0,0,0]; if(u.hang){ o[0]=LAND_X+u.e*0.08; o[1]=LAND_Y+0.07; o[2]=u.s*1.0; } else { o[0]=u.e*0.34; o[1]=LOWB_Y+0.07; o[2]=u.s*LOWB_Z; } return o; }
function sockOK(u,C){ const R=receiver(u); return C[1]>=R[1]+0.2 && Math.hypot(C[0]-R[0],C[1]-R[1],C[2]-R[2])<=SOCK_MAX-0.05; }
function relocTarget(u,C){ const R=receiver(u); let dx=C[0]-R[0], dy=C[1]-R[1], dz=C[2]-R[2]; const d=Math.hypot(dx,dy,dz), k=Math.min(1,(SOCK_MAX-0.12)/d);
  const o=[R[0]+dx*k,R[1]+dy*k,R[2]+dz*k]; o[1]=Math.max(o[1],R[1]+0.28); o[2]=u.s*Math.max(u.s*o[2],0.95); return o; }
// outboard ready pose: arm reaching straight out from its base, tool pointing out to the canopy, clear at every carriage height.
// Every working pose is outboard too, so a joint move through here rarely meets the wall, column or belts.
function strokeYs(u){ const a=u.yr[0], b=u.yr[1], n=Math.max(2,Math.ceil((b-a)/0.25)); const o=[]; for(let i=0;i<=n;i++) o.push(a+(b-a)*i/n); return o; }
function readyCands(u){ const M=COBOTS[COBOT], L=toolLen(0), ys=strokeYs(u), out=[];
  for(const dy of [0.25,0.1,0.4]) for(const outZ of [0.62,0.5,0.72]){ const B=baseM(u.bx,1.5,u.s*SLIDE_Z0,u.hang,u.s), P=[u.bx,1.5+(u.hang?-dy:dy),u.s*(SLIDE_Z0+outZ)], a=[0,0,u.s];
    for(const seed of BANK[u.hang?'hang':'stand']){ const q=seed.slice(); if(ikSolve(B,M,L,P,a,q,80)>2e-3) continue; if(Math.abs(Math.sin(q[4]))<SIN5_MIN) continue;
      if(out.some(o=>{ let d=0; for(let k=0;k<6;k++) d=Math.max(d,Math.abs(Math.atan2(Math.sin(o[k]-q[k]),Math.cos(o[k]-q[k])))); return d<0.2; })) continue;
      let ok=true; for(const y of ys){ const c=[]; if(!poseCaps(u,q,y,SLIDE_Z0,0,c,true)){ ok=false; break; } } if(ok) out.push(q); } }
  return out; }
function readyPose(u){ const c=readyCands(u); return c.length?c[0]:null; }
// choose the ready pose (arm branch) from which the unit can also reach its set-down point and fold to a stow
function setupUnit(u){ const cands=readyCands(u); let first=null;
  for(const q of cands){ u.readyQ=q; const st=stowNear(u); if(!st) continue; u.stowQ=st; const ps=placeSetup(u); if(!first) first={r:q,s:st,p:ps}; if(ps) return {r:q,s:st,p:ps}; }
  return first||{r:cands[0]||null,s:(cands[0]||(u.hang?SEED_HANG:SEED_STAND)).slice(),p:null}; }
// stow: the most compact fold that is clear at every height and joins the ready pose by a clear joint move
function stowNear(u){ const ys=strokeYs(u); let best=null,bq=null; const qr=u.readyQ;
  for(let i=-12;i<12;i++) for(const q2 of [-1.3,-1.57,-1.85,-2.1]) for(const q3 of [2.6,-2.6]) for(const q4 of [-1.57,0,1.57,3.14]) for(const q5 of [1.57,-1.57]){
    const q=[i*Math.PI/12,q2,q3,q4,q5,0]; if(qr) wrapNear(q,qr); let ok=true, ext=0;
    for(const yb of ys){ const caps=[]; if(!poseCaps(u,q,yb,SLIDE_Z0,0,caps,false)){ ok=false; break; } }
    if(!ok) continue; { const caps=[]; poseCaps(u,q,ys[1],SLIDE_Z0,0,caps,false); const b=capsBox(caps.filter(c=>c[7]!==3)); ext=(b[3]-b[0])+(b[4]-b[1])*0.5+Math.max(0,u.s>0?b[5]-STOW_W:-STOW_W-b[2])*4; }
    if(qr){ let d=0; for(let k=0;k<6;k++) d=Math.max(d,Math.abs(q[k]-qr[k])); ext+=0.15*d; }
    if(best!==null&&ext>=best) continue;
    if(qr){ let clear=true; for(const yb of [ys[0],ys[ys.length-1]]){ const c=[]; if(!sweepCaps(u,{q0:q,q1:qr,y0:yb,y1:yb,z0:SLIDE_Z0,z1:SLIDE_Z0,e0:0,e1:0},c,true,false)){ clear=false; break; } } if(!clear) continue; }
    best=ext; bq=q; }
  return bq; }

// ================================================================== cobots: units, carriages, link visuals, hands
// Per side up to two masts (x = ±MAST_X), each with a lower carriage (standing cobot) and an upper carriage (hanging cobot).
// A carriage rides its mast (height), and carries a short slide along z (in/out). The cobot base sits on the slide.
const U=[];
const cobotMat={ link:std(0xe4e6e3,0.08,0.34), cap:std(0x2b3036,0.3,0.42), flange:MAT.alu, pad:std(0x3b6e8f,0,0.7) };
const UNIT_G=new THREE.Group(); H.add(UNIT_G);
const _m=new THREE.Matrix4();
function setFromF(g,F){ g.matrix.set(F[0],F[1],F[2],F[3],F[4],F[5],F[6],F[7],F[8],F[9],F[10],F[11],0,0,0,1); g.matrixWorldNeedsUpdate=true; }
function frameGroup(parent){ const g=new THREE.Group(); g.matrixAutoUpdate=false; parent.add(g); return g; }
// cylinder along local z
function cz(r,len,z0,mat,parent,x,y,seg){ const m=mk(CY(r,r,len,seg||20),mat,parent,x||0,y||0,z0+len/2,Math.PI/2,0,0); return m; }
// cylinder along local x
function cx(r,len,x0,mat,parent,y,z){ return mk(CY(r,r,len,16),mat,parent,x0+len/2,y||0,z||0,0,0,Math.PI/2); }
function buildArmVis(u){ const M=COBOTS[COBOT], d=M.d, a=M.a, V={fr:[]}; const root=new THREE.Group(); UNIT_G.add(root); V.root=root;
  for(let i=0;i<7;i++) V.fr.push(frameGroup(root));
  const [f0,f1,f2,f3,f4,f5,f6]=V.fr, L=cobotMat.link, K=cobotMat.cap;
  // base + J1
  cz(0.078,0.03,0,K,f0); cz(0.068,d[0]-0.09,0.03,L,f0);
  // J1 housing up to the shoulder (frame 1: y1 is the base axis, z1 the shoulder axis)
  mk(CY(0.064,0.064,0.07,20),L,f1,0,-0.06,0); cz(0.064,0.2,-0.05,L,f1); cz(0.066,0.012,0.14,amberStrip,f1); cz(0.05,0.012,-0.072,K,f1);
  // upper arm (frame 2: shoulder at x = −a2 along x2), elbow housing
  cx(0.046,-a[1]-0.1,0.05,L,f2,0,0.13); cz(0.056,0.17,0.02,L,f2); cz(0.046,0.012,0.19,K,f2);
  // forearm (frame 3: elbow at x = −a3), wrist 1
  cx(0.038,-a[2]-0.08,0.04,L,f3,0,0.035); cz(0.044,d[3]+0.07,-0.04,L,f3); cz(0.036,0.012,-0.052,K,f3);
  // wrist 2, wrist 3, flange
  cz(0.042,d[4]+0.02,-0.05,L,f4); cz(0.036,0.01,-0.06,K,f4);
  cz(0.04,d[5]-0.02,-0.06,L,f5); cz(0.041,0.012,d[5]-0.08,amberStrip,f5);
  cz(0.032,0.012,-0.012,cobotMat.flange,f6);
  // end of arm tool on the flange
  const tool=new THREE.Group(); f6.add(tool); V.tool=tool; let hz=0;
  if(EOAT==='tele'){ const T=EOATS.tele, body=T.len-0.2;
    mk(RB(0.07,0.07,body,0.008),K,tool,0,0,body/2); mk(RB(0.012,0.05,body-0.04,0.004),amberStrip,tool,0.036,0,body/2,0,0,0,true);
    V.tel=[mk(RB(0.056,0.056,0.2,0.006),MAT.aluMatte,tool,0,0,body-0.1),mk(RB(0.044,0.044,0.2,0.006),MAT.alu,tool,0,0,body-0.1)];
    V.handG=new THREE.Group(); V.handG.position.z=body; tool.add(V.handG); }
  else { V.handG=new THREE.Group(); tool.add(V.handG); }
  // hand D (detailed, see 04e-hand.js); the pick-and-drop catch funnel is part of it. Drop tube: foam cup on the wrist.
  makeHandD(u,V);
  if(DELIV==='tube'){ const c=mk(new THREE.CylinderGeometry(0.06,0.035,0.07,18,1,true),cobotMat.pad,f5,0,-0.08,0.0); c.material=c.material.clone(); c.material.side=THREE.DoubleSide; V.collar=c; }
  V.stemI=-1;
  // carriage on the column's outboard face (rack and pinion, four guide shoes), with the in/out slide rail along z; the slide
  // block carries the base under it (standing) or over it (hanging)
  const cg=new THREE.Group(); UNIT_G.add(cg); V.car=cg; const e=u.e, s=u.s, sg=u.hang?1:-1;
  mk(RB(0.18,0.24,0.08,0.02),shellMat,cg,e*MAST_X,0,s*(MAST_Z+0.1)); mk(RB(0.12,0.012,0.082,0.004),amberStrip,cg,e*MAST_X,-sg*0.1,s*(MAST_Z+0.1),0,0,0,true);
  servo(cg,0.1,0.06,e*(MAST_X+0.12),0,s*(MAST_Z+0.1),0,0,Math.PI/2);                                 // height drive, pinion on the rack
  mk(RB(0.09,0.04,SLIDE_Z1-MAST_Z+0.02,0.01),shellDark,cg,e*MAST_X,sg*0.07,s*(MAST_Z+SLIDE_Z1)/2+s*0.03);   // slide rail
  for(const dx of [-0.025,0.025]) mk(BX(0.012,0.006,SLIDE_Z1-MAST_Z-0.04),MAT.steel,cg,e*MAST_X+dx,sg*0.092,s*(MAST_Z+SLIDE_Z1)/2+s*0.04);
  bake(cg);
  const sl=new THREE.Group(); UNIT_G.add(sl); V.slide=sl; mk(RB(0.17,0.03,0.17,0.01),MAT.aluMatte,sl,0,-0.015,0); mk(RB(0.06,0.04,0.05,0.01),MAT.graphite,sl,0,-0.04,-s*0.1);
  u.V=V; }
function disposeUnitVis(){ while(UNIT_G.children.length) UNIT_G.remove(UNIT_G.children[0]); }
// compact stow pose: search a small grid for the fold that stays within the stowed width and out of the tunnel
// per unit, once per cobot / end-of-arm choice: the outboard ready pose and a compact stow that joins it by a clear move
const POSE_CACHE=new Map();
function unitPoses(u){ const key=[COBOT,EOAT,DELIV,u.hang,u.s,u.e,u.yr[1]].join('|');
  if(!POSE_CACHE.has(key)) POSE_CACHE.set(key,setupUnit(u));
  const c=POSE_CACHE.get(key); u.readyQ=c.r?c.r.slice():null; u.stowQ=c.s.slice(); u.placeSetup=c.p; }
// unit layout for 4, 6 or 8 cobots
function unitSpecs(n){ const out=[];
  for(const s of [1,-1]) for(const e of [1,-1]){
    if(n===4){ out.push({s,e,hang:false,tier:'lo',yr:[LOW_Y[0],HIGH_Y[1]],band:[0,9],xw:e>0?[0,1.05]:[-1.05,0]}); continue; }
    out.push({s,e,hang:false,tier:'lo',yr:LOW_Y.slice(),band:[0,BAND_Y],xw:e>0?[0,1.05]:[-1.05,0]});
    if(n===8) out.push({s,e,hang:true,tier:'hi',yr:HIGH_Y.slice(),band:[BAND_Y,9],xw:e>0?[0,1.05]:[-1.05,0]});
    else if(e>0) out.push({s,e,hang:true,tier:'hi',yr:HIGH_Y.slice(),band:[BAND_Y,9],xw:[-0.4,1.05]}); }
  return out; }
function buildUnits(){ disposeUnitVis(); U.length=0;
  unitSpecs(ARMS).forEach((sp,i)=>{ const u=Object.assign(sp,{id:i,bx:sp.e*BASE_X,phase:'idle',pt:0,pd:0,fi:-1,hold:false,grip:0,cut:0,flipA:0,roll:0,ext:0,
      yb:sp.hang?9:0, zb:SLIDE_Z0, busyT:0, atHome:true, n:0, cyc:0, dvT:0, lab:`${sp.s>0?'L':'R'}${sp.e>0?'F':'R'}${sp.hang?'↓':'↑'}`});
    u.q6v=0; u.seat=0; u.blade=0; u.bsh=0; u.jig=0; u.fv=false; u.stemMode=null; u.dropK=0; u.yb=clamp(u.yb,u.yr[0],u.yr[1]); unitPoses(u); u.q=u.stowQ.slice(); buildArmVis(u); U.push(u); });
  for(const u of U) u.res=poseRes(u); poseUnits(); }
// place every unit's visuals from its state
const _R=[0,0,0];
// J6 keeps hand D's deck (and so the cutter and the fruit's stem side) facing up: for the tool axis the arm is holding, J6 is
// chosen so the hand's +y points as close to world up as it can. Near a vertical tool axis J6 holds; it never turns faster than 8 rad/s.
function deckUpQ6(u,F5){ const xy=F5[4], yy=F5[5]; if(Math.hypot(xy,yy)<0.25) return u.q6v; let t=Math.atan2(-xy,yy);
  while(t-u.q6v>Math.PI) t-=2*Math.PI; while(t-u.q6v<-Math.PI) t+=2*Math.PI; return t; }
const _qv=[0,0,0,0,0,0];
function poseUnits(){ const M=COBOTS[COBOT]; let si=0;
  for(const u of U){ const V=u.V, B=baseM(u.bx,u.yb,u.s*u.zb,u.hang,u.s);
    const q=u.q; _qv[0]=q[0]; _qv[1]=q[1]; _qv[2]=q[2]; _qv[3]=q[3]; _qv[4]=q[4]+u.flipA; _qv[5]=u.q6v+u.roll; fk(B,_qv,M,KF);
    const dts=Math.max(0,S.t-(u.q6t==null?S.t:u.q6t)); u.q6t=S.t; const tq=deckUpQ6(u,KF[5]), mx=Math.max(0.02,dts*8); const nq=u.q6v+clamp(tq-u.q6v,-mx,mx);
    if(nq!==u.q6v){ u.q6v=nq; _qv[5]=u.q6v+u.roll; fk(B,_qv,M,KF); }
    for(let i=0;i<7;i++) setFromF(V.fr[i],KF[i]);
    V.car.position.y=u.yb; V.slide.position.set(u.bx,u.yb,u.s*u.zb); V.slide.scale.y=u.hang?-1:1;
    if(V.tel){ const b=EOATS.tele.len-0.2; V.tel[0].position.z=b-0.1+u.ext*0.5; V.tel[1].position.z=b-0.1+u.ext; V.handG.position.z=b+u.ext; }
    poseHandD(u);
    // the fruit in the hand (from the grasp on); on a drop release it rolls off finger A into the catch funnel
    const fh=V.fruitH, show=u.fv||u.hold; fh.visible=show;
    if(show){ const k=u.dropK||0; fh.position.set(0,-0.1*k,0.2+0.06*k); fh.userData.stub.visible=u.stemMode==='cut'; fh.userData.full.visible=u.stemMode==='full'; }
    const F=KF[6]; u.tcp=[F[3]+F[2]*toolLen(u.ext),F[7]+F[6]*toolLen(u.ext),F[11]+F[10]*toolLen(u.ext)];
    u.wc=[KF[4][3],KF[4][7],KF[4][11]]; u.elbow=[KF[2][3],KF[2][7],KF[2][11]];
    // the spur the fruit hangs from (hand inspector only): whole stem live, the cut remainder, or bare after a twist
    if(V.spur){ const on=u.fi>=0&&(u.fv||u.hold)&&u.phase!=='idle'; V.spur.visible=on; if(on){ const J=stemTop(u.fi); V.spur.position.set(J[0],J[1],J[2]); V.spur.userData.rem.visible=u.stemMode==='cut'||u.stemMode==='none'; } }
    // the live stem: from the stem cavity of the fruit in the hand up to its spur on the tree (a bent cubic)
    if(u.fv&&u.stemMode==='live'&&u.fi>=0&&si+STEM_SEG<=stemIM.instanceMatrix.count){ const L=toolLen(u.ext), cav=HD_CAV/1000;
      const p0=[F[3]+F[2]*L+F[1]*cav,F[7]+F[6]*L+F[5]*cav,F[11]+F[10]*L+F[9]*cav], t0=[F[1],F[5],F[9]], J=stemTop(u.fi), d=Math.hypot(J[0]-p0[0],J[1]-p0[1],J[2]-p0[2])*0.45;
      const c1=[p0[0]+t0[0]*d,p0[1]+t0[1]*d,p0[2]+t0[2]*d], c2=[J[0],J[1]-d,J[2]]; let pa=p0;
      for(let k=1;k<=STEM_SEG;k++){ const t=k/STEM_SEG, w=1-t, pb=[0,1,2].map(j=>w*w*w*p0[j]+3*w*w*t*c1[j]+3*w*t*t*c2[j]+t*t*t*J[j]);
        _s0.set(pa[0],pa[1],pa[2]); _s1.set(pb[0],pb[1],pb[2]); _sd.subVectors(_s1,_s0); const len=_sd.length();
        dummy.position.copy(_s0).addScaledVector(_sd,0.5); dummy.quaternion.setFromUnitVectors(_up,_sd.normalize()); dummy.scale.set(1,len*1.04,1); dummy.rotation.setFromQuaternion(dummy.quaternion); dummy.updateMatrix(); stemIM.setMatrixAt(si++,dummy.matrix); pa=pb; } } }
  stemIM.count=si; stemIM.instanceMatrix.needsUpdate=true;
}
function stemTop(i){ return [A.x[i]-S.hx,A.y[i]+STEM_DY,A.z[i]-S.hz]; }
// drop-tube socks: short instanced segments along a sagging curve from the collar to the belt receiver
const SOCK_SEG=14, sockIM=new THREE.InstancedMesh(CY(0.032,0.032,1,10,true),std(0x2f5f82,0.05,0.7,{side:THREE.DoubleSide}),8*SOCK_SEG);
sockIM.frustumCulled=false; sockIM.castShadow=true; H.add(sockIM); sockIM.count=0;
const _s0=new THREE.Vector3(), _s1=new THREE.Vector3(), _sq=new THREE.Quaternion(), _up=new THREE.Vector3(0,1,0), _sd=new THREE.Vector3();
function collarPos(u){ if(DELIV==='tube'){ const F=u.V.fr[5].matrix.elements; return [F[12]-F[4]*0.08,F[13]-F[5]*0.08,F[14]-F[6]*0.08]; }
  // pick and drop: the outlet of the catch funnel under the fingers (hand frame y −140 mm, z +105 mm from the palm)
  const F=u.V.fr[6].matrix.elements, hz=(EOAT==='tele'?EOATS.tele.len-0.2+u.ext:0)+HD_PALM+0.105; return [F[12]+F[8]*hz-F[4]*0.14,F[13]+F[9]*hz-F[5]*0.14,F[14]+F[10]*hz-F[6]*0.14]; }
function sockCurve(u,t){ const C=collarPos(u), R=receiver(u), d=Math.hypot(R[0]-C[0],R[1]-C[1],R[2]-C[2]), sag=Math.max(0,SOCK_MAX-d)*0.45+0.05;
  const m=[(C[0]+R[0])/2,(C[1]+R[1])/2-sag,(C[2]+R[2])/2+u.s*0.06], a=(1-t)*(1-t), b=2*(1-t)*t, c=t*t;
  return [a*C[0]+b*m[0]+c*R[0],a*C[1]+b*m[1]+c*R[1],a*C[2]+b*m[2]+c*R[2]]; }
function updateSocks(){ if(DELIV==='carry'){ sockIM.count=0; return; } let n=0;
  for(const u of U){ if(S.stowed) continue; let p=sockCurve(u,0);
    for(let k=1;k<=SOCK_SEG;k++){ const q=sockCurve(u,k/SOCK_SEG); _s0.set(p[0],p[1],p[2]); _s1.set(q[0],q[1],q[2]); _sd.subVectors(_s1,_s0); const L=_sd.length();
      dummy.position.copy(_s0).addScaledVector(_sd,0.5); dummy.quaternion.setFromUnitVectors(_up,_sd.normalize()); dummy.scale.set(1,L*1.05,1); dummy.rotation.setFromQuaternion(dummy.quaternion); dummy.updateMatrix(); sockIM.setMatrixAt(n++,dummy.matrix); p=q; } }
  sockIM.count=n; sockIM.instanceMatrix.needsUpdate=true; }

// ================================================================== hand D: geometry and physics (mm), from the hand D model
const D2R = Math.PI/180, R2D = 180/Math.PI;
const GEO = {
  Kr: 50,            // gripping knuckle radius from hand axis, mm (in palm plane z=0)
  zc: 50,            // fruit-centre stand-off from palm face, mm
  crankTip: [-26.9, -26.9], // bell-crank tip rel. knuckle (radial, axial), 38 mm at -135 deg
  idler: [-14, -44], // tendon idler rel. knuckle
  openTh: 25*D2R,    // finger open angle (outward)
  padFaceR: 44, padLat: [-8, 56], innerR: 46, outerR: 54, tipLat: 60,
  padArea: 952,      // mm^2 conforming
  // cutting finger (hand frame)
  cK: [8, 3],        // knuckle shaft axis (x, z)
  G0: 36,            // lowest float of guard bottom (y)
  S: [0, 47.68],     // stem in arm frame (v, u)
  P: [-13, 49.68],   // blade pivot in arm frame (v, u)
  bracketY: 14, bossR: 6.5
};
const CUT = { k: 0.42, span: 96*D2R, tPk: 0.70, hit: 30*D2R, drumR: 8, lever: Math.hypot(13, 2) };
function rot(p, th){ const c=Math.cos(th), s=Math.sin(th); return [p[0]*c + p[1]*s, -p[0]*s + p[1]*c]; }
function zcOf(d){ return 50 + (d-80)/3; }           // stand-off rule, set from the ToF diameter estimate
function fruitC(zc){ return [-GEO.Kr, zc==null?GEO.zc:zc]; }
function padFacePts(){ // pad face in knuckle frame (radial rel K, axial), designed on the 80 mm fruit
  const c = fruitC(50), l20 = 20*D2R, cp = [c[0]-4*Math.cos(l20), c[1]-4*Math.sin(l20)];
  const pts=[]; for(let a=GEO.padLat[0]; a<=GEO.padLat[1]; a+=2){ const r=a*D2R; pts.push([cp[0]+GEO.padFaceR*Math.cos(r), cp[1]+GEO.padFaceR*Math.sin(r)]); }
  return pts;
}
function fingerInnerPts(){
  const c=fruitC(50), pts=padFacePts();
  for(let i=0;i<=10;i++){ const t=i/10; pts.push([-4 + t*(-1.4), 4 + t*34.9]); } // straight inner edge
  for(let a=GEO.padLat[1]; a<=GEO.tipLat; a+=1){ const r=a*D2R; pts.push([c[0]+GEO.innerR*Math.cos(r), c[1]+GEO.innerR*Math.sin(r)]); }
  return pts;
}
const INNER = fingerInnerPts();
const PAD = padFacePts();
function contact(R, zc){ // compliant pad (Winkler layer): rotate until the resultant reaches N=26 N
  const c=fruitC(zc), ds=GEO.padFaceR*2*D2R, kW=0.12, N0=26;
  const F = th => { let fx=0,fz=0,M=0; for(const p0 of PAD){ const p=rot(p0,th), dx=p[0]-c[0], dz=p[1]-c[1], d=Math.hypot(dx,dz), pen=R-d;
      if(pen>0){ const f=kW*pen*ds*32, nx=dx/d, nz=dz/d; fx+=f*nx; fz+=f*nz; M+=p[0]*f*nz-p[1]*f*nx; } } return {fx,fz,M,mag:Math.hypot(fx,fz)}; };
  let lo=-0.8, hi=GEO.openTh; for(let i=0;i<50;i++){ const m=(lo+hi)/2; if(F(m).mag<N0) hi=m; else lo=m; }
  const r=F(hi), lat=Math.atan2(r.fz, r.fx), lever=Math.abs(r.M)/r.mag;
  // resultant point on the fruit surface along the resultant direction
  const p=[c[0]+R*Math.cos(lat), c[1]+R*Math.sin(lat)];
  return { th:hi, p, n:[Math.cos(lat), Math.sin(lat)], lat, lever };
}
function tendon(th){
  const t=rot(GEO.crankTip, th), I=GEO.idler, d=[I[0]-t[0], I[1]-t[1]], L=Math.hypot(d[0],d[1]);
  d[0]/=L; d[1]/=L; const arm=Math.abs(t[0]*d[1]-t[1]*d[0]);
  return { tip:t, L, arm };
}
function fruitTop(R){ // lathe profile of the apple (x = radius from stem axis, y = height)
  const pts=[]; for(let i=0;i<=120;i++){ const t=i/120*Math.PI;
    const cav = 9*(R/40)*Math.exp(-Math.pow(t/0.32,2)), cal = 6*(R/40)*Math.exp(-Math.pow((Math.PI-t)/0.30,2));
    pts.push([Math.max(0.01, R*Math.sin(t)*(1-0.03*Math.cos(t))), R*Math.cos(t) - cav + cal]); }
  return pts;
}
function rimHeight(R){ let m=-1e9; for(const p of fruitTop(R)) if(p[0]>=3 && p[0]<=12 && p[1]>m) m=p[1]; return m; }
function cavityBottom(R){ return fruitTop(R)[0][1]; }
function calc(o){
  const R=o.d/2, zc=zcOf(o.d), c=contact(R, zc), tn=tendon(c.th), tOpen=tendon(GEO.openTh);
  const lever = c.lever;
  const T = o.N*lever/tn.arm, input=3*T, cap=input/0.8, capT=cap*0.010, mot=capT/(25*0.81);
  const hold = 3*o.N*(o.mu*Math.cos(c.lat)+Math.sin(c.lat));
  const mass = 0.85e-3*(4/3)*Math.PI*R*R*R*0.88; // g
  const demand = mass/1000*(9.81+6.2) + 8;
  const kPa = o.N/GEO.padArea*1000;
  const rim = rimHeight(R), G = Math.max(GEO.G0, rim), cutH = G+5.5-rim;
  const tauHit = CUT.tPk - CUT.k*CUT.hit, Fst = tauHit/(CUT.lever/1000);
  const KE = CUT.tPk*CUT.hit - 0.5*CUT.k*CUT.hit*CUT.hit, E = 0.5*CUT.k*CUT.span*CUT.span;
  const Wcut = o.Fc*o.ds/1000;
  const rho = Math.hypot(GEO.cK[0], zc-GEO.cK[1]);           // knuckle to stem
  const boss = Math.hypot(rho - GEO.bossR, GEO.bracketY) - R;
  const beakShift = rho - GEO.S[1];                              // floating beak travel along the arm
  const seatDeg = 180 + Math.atan2(-GEO.cK[0], zc-GEO.cK[1])*R2D;  // sweep from parked (-z) to the stem
  return { R, zc, rho, beakShift, seatDeg, c, tn, travel: tOpen.L - tn.L, lever, T, input, cap, capT, mot, hold, mass, demand, kPa, rim, G, cutH,
    tauHit, Fst, KE, E, Wcut, margin: KE/Wcut, boss, cockT: CUT.tPk/(CUT.drumR/1000) };
}
const DD = {
  rs: 37,          // lead-screw axis radius from the hand axis
  link: 30,        // link from nut to crank tip
  lead: 1.5,       // mm per rev, self-locking
  etaS: 0.40,      // lead-screw efficiency (lead angle 5.9 deg, mu 0.15)
  gh: 3.7, etaG: 0.90, // finger gearhead
  // roll
  Zr: 72, Zp: 12, mr: 0.75, rollPl: 16, etaR: 0.77,
  // blade: pull cylinder on the hand axis, 2:1 purchase, 1 mm cable up the knuckle shaft to a sector pulley
  bore: 16, rod: 5, spring: 8, stroke: 20, purchase: 2, etaC: 0.95*0.82, sector: 11, bladeRet: 0.05,
  tubeV: 1.5, // cm3 dead volume
  // seat: BLDC -> worm 15:1 -> belt 36/12
  worm: 15, etaW: 0.6, belt: 3, etaB: 0.95
};
function nutZ(th){ const t = rot(GEO.crankTip, th), tr = GEO.Kr + t[0]; const dr = tr - DD.rs; return t[1] - Math.sqrt(DD.link*DD.link - dr*dr); }
function linkArm(th){ const t=rot(GEO.crankTip, th), n=[DD.rs-GEO.Kr, nutZ(th)]; const d=[n[0]-t[0], n[1]-t[1]], L=Math.hypot(d[0],d[1]); d[0]/=L; d[1]/=L; return Math.abs(t[0]*d[1]-t[1]*d[0]); }
function calcD(o){
  const b = calc(o), th=b.c.th;
  const arm = linkArm(th), Fn = o.N*b.lever/arm, FnPk = 35*b.lever/arm;
  const tq = F => F*DD.lead/1000/(2*Math.PI*DD.etaS);
  const stroke = nutZ(GEO.openTh) - nutZ(th);
  const motT = tq(Fn)/(DD.gh*DD.etaG), motPk = tq(FnPk)/(DD.gh*DD.etaG);
  const revs = stroke/DD.lead, rpmPk = 2*revs/0.35*60*DD.gh;
  // roll
  const Rm = b.R/1000, stemT = 13*Rm, I = 1.95*0.045*0.045 + b.mass/1000*0.4*Rm*Rm;
  const acc = 4*(90*D2R)/(0.25*0.25), inert = I*acc, seal = 0.15, rollT = stemT + inert + seal;
  const gripT = 3*o.mu*32*b.R*Math.cos(b.c.lat)/1000;   // raised to 32 N while rolling
  const ratio = DD.Zr/DD.Zp*DD.rollPl, rollMot = 1.5/(ratio*DD.etaR), rollRpm = 2*(90*D2R)/0.25*ratio*60/(2*Math.PI);
  // blade
  const A = Math.PI/4*(DD.bore*DD.bore - DD.rod*DD.rod);
  const Fcyl = o.p*0.1*A - DD.spring;                  // o.p in bar -> N/mm2 = bar*0.1
  const Fcab = Fcyl*DD.purchase*DD.etaC, Tb = Fcab*DD.sector/1000 - DD.bladeRet, Fb = Tb/(CUT.lever/1000);
  const Vc = A*DD.stroke/1000 + DD.tubeV, air = Vc*(o.p+1);   // cm3 free air per cut
  const gripMargin = gripT/(stemT + b.mass/1000*0.4*Rm*Rm*acc);
  const seatMot = 0.06/(DD.worm*DD.belt*DD.etaW*DD.etaB), seatRpm = 33*DD.worm*DD.belt*60/(2*Math.PI);
  return Object.assign(b, {arm, Fn, FnPk, stroke, screwT: tq(Fn), motT, motPk, rpmPk, stemT, inert, rollT, gripT, ratio, rollMot, rollRpm, A, Fcyl, Fcab, Tb, Fb, air, gripMargin, seatMot, seatRpm});
}

// ================================================================== hand D on the cobot flange
// The same hand D as the gripper study: three self-locking fingers with fingertip cameras, a cutting finger that swings off the
// deck onto the stem, and a pneumatic bypass blade. Built once in millimetres (hand frame: z forward along the tool axis, palm face
// at z = 0, +y the deck and cutter side), merged by material class into vertex-coloured meshes, and cloned for every cobot inside
// a 0.001 group. On the cobot, J6 is the roll joint, so hand D's own roll drive is left out: an ISO 50 flange, a six-axis F/T sensor
// and a short adapter carry the housing.
const HCALC=calcD({d:78,N:26,mu:0.45,ds:3,Fc:60,p:6});
const HD_PALM=0.2-HCALC.zc/1000;                 // flange → palm face, m (flange, F/T and adapter 40 mm, housing 110 mm)
const HD_OPEN=GEO.openTh, HD_TH=HCALC.c.th, HD_SWEEP=HCALC.seatDeg*D2R;
const HD_PSI_S=Math.atan2(-(GEO.S[1]-GEO.P[1]),GEO.S[0]-GEO.P[0]), HD_PSI_E=HD_PSI_S-Math.asin(3.1/CUT.lever), HD_BL=50*D2R, HD_PSI_C=HD_PSI_E-30*D2R;
const HD_CAV=cavityBottom(HCALC.R), HD_STEM=30;  // stem cavity depth below the top, mm; stem length, mm
// the guard shoe rides on the shoulder of the fruit: float height of the cutting arm over the fruit top
const HD_SHOE=[]; for(let v=-9;v<=8;v+=3.4) for(let w=38;w<=58;w+=4) if(!(v>-2&&w>44&&w<51)) HD_SHOE.push([v,w]);
const HD_TOP=(()=>{ const pts=[]; let lx=-1; for(const p of fruitTop(HCALC.R)){ if(p[1]<0) break; if(p[0]>lx){ pts.push(p); lx=p[0]; } } return pts; })();
function hdTopH(rho){ const p=HD_TOP; if(rho>=p[p.length-1][0]) return -1e9; for(let i=1;i<p.length;i++){ if(p[i][0]>=rho){ const a=p[i-1], b=p[i], f=(rho-a[0])/Math.max(1e-6,b[0]-a[0]); return a[1]+(b[1]-a[1])*f; } } return -1e9; }
function hdFloat(phi,sh){ let G=GEO.G0; const c=Math.cos(phi), s=Math.sin(phi);
  for(const q of HD_SHOE){ const v=q[0], w=q[1]+sh, x=GEO.cK[0]+v*c+w*s, z=GEO.cK[1]-v*s+w*c; const h=hdTopH(Math.hypot(x,z-HCALC.zc)); if(h>G) G=h; } return G; }
const HD_GSEAT=hdFloat(Math.PI+HD_SWEEP,HCALC.beakShift), HD_CUTY=HD_GSEAT+5.5;   // cut plane above the fruit axis, mm
// ---------------- materials: one per class, colour per vertex
const HDK={ m:std(0xffffff,0.55,0.3,{vertexColors:true}), p:std(0xffffff,0.04,0.62,{vertexColors:true}), g:std(0xffffff,0.2,0.08,{vertexColors:true}),
  s:std(0xffffff,0.1,0.36,{vertexColors:true,side:THREE.DoubleSide}), f:std(0xffffff,0,0.8,{vertexColors:true,side:THREE.DoubleSide}), e:new THREE.MeshBasicMaterial({vertexColors:true}) };
const HP={shell:[0xdcdfdb,'s'],face:[0xc4cacc,'s'],alu:[0xc9cfd2,'m'],anod:[0x384146,'m'],steel:[0xb0b8be,'m'],blade:[0xeef2f4,'m'],edge:[0xb3372b,'p'],brass:[0xc79a3e,'m'],bronze:[0xa4733a,'m'],
  pad:[0x6f9a90,'p'],guard:[0xd9a441,'p'],black:[0x1f2427,'p'],motor:[0x2a2f33,'m'],gear:[0x8f989c,'m'],pcb:[0x2d6a3c,'p'],glass:[0x131d27,'g'],grey:[0x8c8f8f,'p'],spring:[0x9aa3a8,'m'],
  beak:[0x7d878b,'m'],air:[0x3b7fb8,'p'],hall:[0x3d3d8a,'p'],gauge:[0xc9b27a,'p'],flex:[0xd08a2a,'p'],led:[0xfff4d0,'e'],red:[0xff3322,'e'],amber:[0xffb13b,'e'],foam:[0x3b6e8f,'f'],foamLip:[0x2f5a75,'p']};
function hM(g,P){ const o=new THREE.Mesh(g,HDK[P[1]]); o.userData.hc=P[0]; o.userData.hk=P[1]; return o; }
function hCyl(r,h,axis,P,seg,r2){ const o=hM(new THREE.CylinderGeometry(r2==null?r:r2,r,h,seg||24),P); if(axis==='x') o.rotation.z=-Math.PI/2; else if(axis==='z') o.rotation.x=Math.PI/2; return o; }
function hCylY(r,y0,y1,x,z,P,seg){ const o=hCyl(r,y1-y0,'y',P,seg); o.position.set(x,(y0+y1)/2,z); return o; }
function hCylZ(r,z0,z1,x,y,P,seg,r2){ const o=hCyl(r,z1-z0,'z',P,seg,r2); o.position.set(x,y,(z0+z1)/2); return o; }
function hCylX(r,x0,x1,y,z,P,seg){ const o=hCyl(r,x1-x0,'x',P,seg); o.position.set((x0+x1)/2,y,z); return o; }
function hBox(x0,x1,y0,y1,z0,z1,P){ const o=hM(new THREE.BoxGeometry(x1-x0,y1-y0,z1-z0),P); o.position.set((x0+x1)/2,(y0+y1)/2,(z0+z1)/2); return o; }
function hShape(pts){ const s=new THREE.Shape(); s.moveTo(pts[0][0],pts[0][1]); for(let i=1;i<pts.length;i++) s.lineTo(pts[i][0],pts[i][1]); s.closePath(); return s; }
function hPlate(shape,y0,t,P){ const o=hM(new THREE.ExtrudeGeometry(shape,{depth:t,bevelEnabled:false,curveSegments:20}),P); o.rotation.x=Math.PI/2; o.position.y=y0+t; return o; }
function hRadial(shape,w,P){ return hPlate(shape,-w/2,w,P); }
function hArc(cx,cy,r,a0,a1,n){ const p=[]; for(let i=0;i<=n;i++){ const a=(a0+(a1-a0)*i/n)*D2R; p.push([cx+r*Math.cos(a),cy+r*Math.sin(a)]); } return p; }
function hTube(pts,r,P,n,rs){ return hM(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(p[0],p[1],p[2]))),n||24,r,rs||6,false),P); }
function hHelix(r,y0,y1,turns,wire,P){ const pts=[]; const n=Math.max(24,Math.round(turns*20)); for(let i=0;i<=n;i++){ const a=i/n*turns*2*Math.PI; pts.push([r*Math.cos(a),y0+(y1-y0)*i/n,r*Math.sin(a)]); } return hTube(pts,wire,P,n,5); }
function hSpiral(r0,r1,turns,y,wire,P){ const pts=[]; const n=Math.round(turns*30); for(let i=0;i<=n;i++){ const t=i/n, a=t*turns*2*Math.PI, r=r0+(r1-r0)*t; pts.push([r*Math.cos(a),y,r*Math.sin(a)]); } return hTube(pts,wire,P,n,4); }
function hAnchor(parent,name,x,y,z){ const o=new THREE.Object3D(); o.name=name; o.position.set(x,y,z); parent.add(o); return o; }
// merge the plain meshes of a group by class, with the part colour baked into a colour attribute
function bakeHD(group,shadow){ const by={};
  for(const ch of group.children.slice()){ if(!ch.isMesh||ch.children.length||ch.userData.live||!ch.userData.hk) continue; (by[ch.userData.hk]=by[ch.userData.hk]||[]).push(ch); }
  for(const k in by){ const list=by[k];
    const geos=list.map(m=>{ m.updateMatrix(); const g0=m.geometry.index?m.geometry.toNonIndexed():m.geometry; const n=new THREE.BufferGeometry(); const pos=g0.getAttribute('position').clone(); n.setAttribute('position',pos);
      n.setAttribute('normal',g0.getAttribute('normal').clone()); const col=C(m.userData.hc), cnt=pos.count, ca=new Float32Array(cnt*3); for(let i=0;i<cnt;i++){ ca[3*i]=col.r; ca[3*i+1]=col.g; ca[3*i+2]=col.b; }
      n.setAttribute('color',new THREE.BufferAttribute(ca,3)); n.applyMatrix4(m.matrix); return n; });
    const mm=new THREE.Mesh(THREE.BufferGeometryUtils.mergeBufferGeometries(geos,false),HDK[k]); mm.castShadow=!!shadow&&k!=='e'; mm.receiveShadow=k!=='e';
    list.forEach(m=>group.remove(m)); group.add(mm); }
  return group; }
function hGroup(parent,name){ const g=new THREE.Group(); if(name) g.name=name; parent.add(g); return g; }
function hLive(m){ m.userData.live=true; m.castShadow=false; return m; }
// ---------------- the template
const HD_HZ0=-110, HD_HR=52, HD_HRi=49.5, HD_DECK=34, HD_NY=25, HD_NZ=-13, HD_AZ=[270,30,150];
const HD_UNITCYL=new THREE.CylinderGeometry(1,1,1,8);
const HD_T=(()=>{ const T=new THREE.Group(); T.name='hd';
  const st=hGroup(T,'st'), inner=hGroup(T,'inner');
  // housing: a D-section shell whose flat top is the deck the cutting finger parks on
  { const xo=Math.sqrt(HD_HR*HD_HR-HD_DECK*HD_DECK), xi=Math.sqrt(HD_HRi*HD_HRi-(HD_DECK-2.5)*(HD_DECK-2.5)), ao=Math.atan2(HD_DECK,xo)*R2D, ai=Math.atan2(HD_DECK-2.5,xi)*R2D;
    const pts=hArc(0,0,HD_HR,180-ao,ao+360,72).concat(hArc(0,0,HD_HRi,ai+360,180-ai,72));
    const o=hM(new THREE.ExtrudeGeometry(hShape(pts),{depth:-HD_HZ0-4,bevelEnabled:false}),HP.shell); o.position.z=HD_HZ0; st.add(o);
    st.add(hBox(-xo,xo,HD_DECK-2.5,HD_DECK,HD_HZ0,HD_NZ,HP.shell)); st.add(hBox(-xo,-4,HD_DECK-2.5,HD_DECK,HD_NZ,-4,HP.shell)); st.add(hBox(22,xo,HD_DECK-2.5,HD_DECK,HD_NZ,-4,HP.shell));
    st.add(hCylZ(HD_HR,HD_HZ0-3,HD_HZ0,0,0,HP.shell,48));
    // palm face with the head camera, ToF and LED ring
    const fp=hArc(0,0,HD_HR,180-ao,ao+360,80); fp.push([22,HD_DECK],[22,HD_NY],[-4,HD_NY],[-4,HD_DECK]);
    const f=hM(new THREE.ExtrudeGeometry(hShape(fp),{depth:4,bevelEnabled:false}),HP.face); f.position.z=-4; st.add(f);
    st.add(hCylZ(6,0,3,0,0,HP.black,24)); st.add(hCylZ(3.6,3,3.3,0,0,HP.glass,24));
    st.add(hBox(-20,-12,-18,-12,0,1.6,HP.black)); st.add(hBox(-19,-16.5,-16.5,-13.5,1.6,1.9,HP.glass));
    const ring=hM(new THREE.TorusGeometry(20,1.2,6,40),HP.led); ring.position.z=0.6; st.add(ring);
    // cobot side: ISO 50 tool flange, six-axis F/T sensor, adapter cone, cable and air connector
    st.add(hCylZ(31.5,-150,-144,0,0,HP.alu,32)); st.add(hCylZ(33,-144,-127,0,0,HP.anod,40)); st.add(hCylZ(33.4,-137,-135,0,0,HP.steel,40));
    st.add(hBox(26,38,-7,7,-142,-130,HP.black)); st.add(hCylX(3.2,38,44,0,-136,HP.steel,12));
    st.add(hCylZ(33,-127,-113,0,0,HP.shell,40,46)); st.add(hBox(-9,9,-46,-38,-124,-112,HP.black)); st.add(hCylY(2.4,-50,-45,-4,-118,HP.air,10)); st.add(hCylY(2.4,-50,-45,4,-118,HP.black,10));
    // wrist stereo camera (close range, 4–100 cm, 18 mm baseline) on a bracket beside the adapter, looking along the tool axis
    st.add(hBox(30,46,-6,6,-128,-116,HP.anod)); st.add(hBox(46,69,-21,21,-138,-96,HP.black)); st.add(hBox(47,68,-20,20,-96,-95.2,HP.glass));
    for(const yy of [-9,9]) st.add(hCylZ(3.2,-95.4,-94.6,57.5,yy,HP.glass,16));
    st.add(hBox(50,65,-23.5,-21,-136,-98,HP.amber));
    hAnchor(T,'a_wrist',58,0,-95);
    hAnchor(T,'a_ft',0,-34,-136); hAnchor(T,'a_cam',0,0,2); hAnchor(T,'a_deck',-20,HD_DECK,-60);
  }
  // ---------------- gripping fingers, each with its own motor, lead screw and nut
  HD_AZ.forEach((az,i)=>{ const mount=hGroup(T,'fm'+i); mount.position.set(GEO.Kr*Math.cos(az*D2R),GEO.Kr*Math.sin(az*D2R),0); mount.rotation.z=az*D2R;
    const pivot=hGroup(mount,'fp'+i), c=[-GEO.Kr,50];
    const pts=[[-5,-6],[6,-6],[6,2],[2.4,36.9]].concat(hArc(c[0],c[1],GEO.outerR,-14,GEO.tipLat,32)).concat(hArc(c[0],c[1],GEO.innerR,GEO.tipLat,-14,32)).concat([[-4,4]]);
    pivot.add(hRadial(hShape(pts),16,HP.anod));
    pivot.add(hCylY(7,-8,8,0,0,HP.anod,20)); pivot.add(hCylY(2,-11,11,0,0,HP.steel,12)); pivot.add(hCylY(2.4,10,11.5,0,0,HP.hall,12));
    pivot.add(hRadial(hShape([[-3,3],[3,-3],[-24.8,-29],[-29,-24.8]]),6,HP.steel)); pivot.add(hCylY(2.2,-4,4,GEO.crankTip[0],GEO.crankTip[1],HP.steel,12));
    const l20=20*D2R, cp=[c[0]-4*Math.cos(l20),c[1]-4*Math.sin(l20)];
    pivot.add(hRadial(hShape(hArc(cp[0],cp[1],GEO.padFaceR,GEO.padLat[0],GEO.padLat[1],28).concat(hArc(c[0],c[1],GEO.innerR,GEO.padLat[1],GEO.padLat[0],28))),32,HP.pad));
    const gp=[c[0]+(GEO.padFaceR-3.4)*Math.cos(50*D2R),c[1]+(GEO.padFaceR-3.6)*Math.sin(50*D2R)]; const patch=hBox(-1,1,-5,5,-3,3,HP.grey); patch.position.set(gp[0]-1.2,0,gp[1]+0.6); patch.rotation.y=-50*D2R; pivot.add(patch);
    const cpos=[c[0]+45*Math.cos(58*D2R),c[1]+45*Math.sin(58*D2R)]; const cam=hBox(-1.2,1.2,-1.2,1.2,-1.2,1.2,HP.black); cam.position.set(cpos[0],0,cpos[1]); pivot.add(cam);
    const ld=hCylY(0.55,-0.1,0.1,0,0,HP.glass,10); ld.rotation.z=Math.PI/2; ld.position.set(cpos[0]-1.3,0,cpos[1]); pivot.add(ld);
    for(const dy of [-3.2,3.2]){ const l=hBox(-0.5,0.5,-0.25,0.25,-0.5,0.5,HP.led); l.position.set(cpos[0]-0.6,dy,cpos[1]-0.4); pivot.add(l); }
    const sg=hBox(-0.3,0.3,-3,3,-5,5,HP.gauge); sg.position.set(6.3,0,16); pivot.add(sg);
    pivot.add(hTube([[6.2,5.5,-2],[6.2,5.5,34]].concat(hArc(c[0],c[1],GEO.outerR+0.2,-10,56,14).map(p=>[p[0],5.5,p[1]])),0.35,HP.flex,30,4));
    if(i===0) hAnchor(pivot,'a_fing',cpos[0],0,cpos[1]);
    bakeHD(pivot,true);
    for(const y of [-10,10]){ const e=hBox(-8,-2,-2,2,-12,-4,HP.face); e.position.y=y; mount.add(e); }
    // drive inside the housing: BLDC → 3.7 : 1 planetary → M5 × 1.5 lead screw (self-locking) → nut → 30 mm link → crank tip
    const sx=DD.rs-GEO.Kr, drv=hGroup(mount,'fd'+i);
    drv.add(hBox(sx-7,sx+7,-4,4,-30,-26,HP.face)); drv.add(hCylZ(2.5,-64,-28,sx,0,HP.steel,12));
    { const thr=[]; for(let k=0;k<=160;k++){ const a=k/160*24*2*Math.PI; thr.push([sx+2.6*Math.cos(a),2.6*Math.sin(a),-62+k/160*32]); } drv.add(hTube(thr,0.35,HP.brass,320,4)); }
    drv.add(hCylZ(8,-78,-64,sx,0,HP.gear,24)); drv.add(hCylZ(8,-102,-78,sx,0,HP.motor,24)); drv.add(hCylZ(7,-107,-102,sx,0,HP.black,20)); drv.add(hCylZ(8.3,-81,-79,sx,0,HP.pad,24));
    drv.add(hBox(sx+6.5,sx+7.5,-1,1,-64,-28,HP.steel));
    bakeHD(drv,false);
    const nut=hLive(hBox(-5,5,-5,5,-5,5,HP.bronze)); nut.name='fn'+i; mount.add(nut);
    const link=hLive(hM(HD_UNITCYL,HP.steel)); link.name='fk'+i; mount.add(link);
    bakeHD(mount,true);
  });
  // ---------------- cutting finger: vertical knuckle shaft at (8, 3); seat motor under the deck → 16 : 1 → 12/36 bevel
  const KX=GEO.cK[0], KZ=GEO.cK[1];
  st.add(hCylY(GEO.bossR,GEO.bracketY,24.5,KX,KZ,HP.face,24)); st.add(hBox(KX-5,KX+5,GEO.bracketY,24.5,-4,KZ,HP.face));
  st.add(hCylY(9,29.5,35,KX,KZ,HP.face,24));
  { const fc=hM(new THREE.CylinderGeometry(9.5,9.5,1.2,28,1,true,0.5,2.6),HP.brass); fc.position.set(KX,35.6,KZ); st.add(fc); }
  inner.add(hCylZ(4.2,-9,-6,KX,24.5,HP.steel,12,3)); inner.add(hCylZ(2,-14,-8.5,KX,24.5,HP.steel,10)); inner.add(hCylZ(6.5,-30,-14,KX,24.5,HP.gear,20)); inner.add(hCylZ(6.5,-56,-30,KX,24.5,HP.motor,20));
  inner.add(hCylZ(5.5,-61,-56,KX,24.5,HP.black,16)); inner.add(hCylZ(6.8,-34,-32,KX,24.5,HP.guard,20));
  const ap=hGroup(T,'ap'); ap.position.set(KX,0,KZ);
  ap.add(hCylY(4,14,58,0,0,HP.steel,16));
  { const bv=hM(new THREE.CylinderGeometry(11.5,9.5,3.5,32),HP.brass); bv.position.y=27; ap.add(bv);
    for(let k=0;k<36;k++){ const a=k/36*2*Math.PI, t=hBox(-0.5,0.5,-0.7,0.7,-1.2,1.2,HP.brass); t.position.set(10*Math.sin(a),24.8,10*Math.cos(a)); t.rotation.y=a; ap.add(t); } }
  const af=hGroup(ap,'af');
  af.add(hCylY(8.5,0,16,0,0,HP.anod,24)); af.add(hHelix(5.5,16,22,4,0.4,HP.spring)); af.add(hBox(8.3,9.6,6,10,-2,2,HP.hall));
  af.add(hPlate(hShape([[7,0],[7,28],[-8,28],[-8,6],[-8,0],[-6,-6],[0,-8.5],[6,-6]]),3.5,2,HP.anod));
  af.add(hBox(-7.5,7.5,7.5,13,8,28,HP.beak)); af.add(hCylY(1.2,13,15,-4,9,HP.brass,10));
  for(const v of [-6,5]) af.add(hBox(v-0.3,v+0.3,5.5,13,27.5,31,HP.spring));
  hAnchor(af,'a_cut',0,10,18);
  const bk=hGroup(af,'bk'), P=GEO.P;
  bk.add(hPlate(hShape([[7,30],[7,38],[9,40.5],[9,41.5],[3,45.6],[-2,45.6],[-2,49.8],[3,49.8],[9,54.4],[9,58],[6,62.5],[0,64],[-10,63],[-20,59],[-24,51],[-23.5,42],[-17,36],[-8,31],[-8,30]]),3.5,2,HP.steel));
  bk.add(hPlate(hShape([[9,37],[9,41.5],[3,45.6],[-2,45.6],[-2,49.8],[3,49.8],[9,54.4],[9,58],[-10,58],[-10,37]]),0,3.5,HP.guard));
  bk.add(hCylY(5,10.2,12.4,P[0],P[1],HP.beak,20)); { const sp=hSpiral(1.5,4.4,2.5,12.6,0.25,HP.spring); sp.position.set(P[0],0,P[1]); bk.add(sp); }
  bk.add(hBox(-1,1,3.8,5.2,44.2,45.6,HP.black)); bk.add(hBox(-1,1,3.8,5.2,49.8,51.2,HP.black)); bk.add(hCylY(1.8,5.5,7,3.5,40.5,HP.black,12));
  const bm=hLive(hBox(-0.25,0.25,4.3,4.7,45.6,49.8,HP.red)); bm.name='bm'; bk.add(bm);
  const bg=hGroup(bk,'bg'); bg.position.set(P[0],0,P[1]);
  { const s=new THREE.Shape(); s.moveTo(0,-5.5); s.absarc(0,0,5.5,-Math.PI/2,-Math.PI*1.5,true); s.lineTo(6,4.2); s.quadraticCurveTo(14,4.6,18,1.2); s.lineTo(18.4,-0.8); s.lineTo(15,-3.1); s.lineTo(3,-3.1); s.closePath();
    bg.add(hPlate(s,5.5,1.5,HP.blade)); }
  bg.add(hBox(3,15,6.9,7.08,-3.1,-2.2,HP.edge));
  { const sc=hM(new THREE.CylinderGeometry(11,11,2.5,28,1,false,-Math.PI/2-0.5,1),HP.alu); sc.position.y=8.75; bg.add(sc); }
  bg.add(hCylY(4,5.5,12,0,0,HP.steel,14));
  hAnchor(bk,'a_blade',P[0]+8,7,P[1]+4);
  bakeHD(bg,true); bakeHD(bk,true); bakeHD(af,true); bakeHD(ap,true);
  // pneumatic blade drive on the hand axis: ⌀16 × 20 pull cylinder, 2 : 1 running pulley, 3/2 valve
  inner.add(hCylZ(10.5,-92,-50,0,2,HP.alu,28)); inner.add(hCylZ(11,-53,-50,0,2,HP.anod,28)); inner.add(hCylZ(11,-92,-89,0,2,HP.anod,28));
  const rd=hGroup(T,'rd'); rd.add(hCylZ(2.5,-50,-24,0,2,HP.steel,12)); rd.add(hCylX(4,-1.5,1.5,2,-25,HP.brass,14)); bakeHD(rd,false);
  inner.add(hBox(-16,-6,13,23,-48,-30,HP.black)); inner.add(hBox(-16,-10,13,18,-52,-48,HP.brass));
  const vl=hLive(hBox(-11.5,-10.5,23,24,-36,-35,HP.led)); vl.name='vl'; T.add(vl);
  inner.add(hTube([[0,-4,HD_HZ0],[0,-12,-100],[-12,6,-75],[-11,15,-50]],1.5,HP.air,24,8)); inner.add(hTube([[-6,18,-40],[-2,16,-46],[0,12,-54]],1.5,HP.air,12,8));
  { const pcb=hM(new THREE.RingGeometry(12,25,32),HP.pcb); pcb.position.z=-96; inner.add(pcb); }
  [[-4,2,-18],[KX,16,-10]].forEach(p=>inner.add(hCylX(2.2,p[0]-1.5,p[0]+1.5,p[1],p[2],HP.steel,12)));
  hAnchor(T,'a_valve',-11,20,-40);
  bakeHD(inner,false); bakeHD(st,true);
  // catch funnel for pick-and-drop: slung under the fingers, clear of finger A's opening sweep; its outlet takes the sock
  const df=hGroup(T,'df');
  { const f=hM(new THREE.CylinderGeometry(48,24,52,28,1,true),HP.foam); f.position.set(0,-114,105); df.add(f);
    const lip=hM(new THREE.TorusGeometry(48,3,6,36),HP.foamLip); lip.rotation.x=Math.PI/2; lip.position.set(0,-88,105); df.add(lip);
    const out=hM(new THREE.TorusGeometry(24,3,6,24),HP.foamLip); out.rotation.x=Math.PI/2; out.position.set(0,-140,105); df.add(out);
    for(const x of [-30,30]) df.add(hTube([[x,-42.5,-30],[x,-70,20],[x,-88,67]],2.2,HP.steel,12,6)); hAnchor(df,'a_funnel',30,-95,110); }
  bakeHD(df,true);
  return T; })();
// ---------------- the fruit held in the hand (hand frame, stem axis along +y), with its stem
const HD_APPLE_GEO=(()=>{ const g=new THREE.LatheGeometry(fruitTop(HCALC.R).filter((p,i)=>i%4===0).reverse().map(p=>new THREE.Vector2(p[0],p[1])),28);   // bottom → top: faces outward
  const col=[], pos=g.attributes.position, cR=C(0x7e1311), cY=C(0xb2542a), c=new THREE.Color();
  for(let i=0;i<pos.count;i++){ const x=pos.getX(i), y=pos.getY(i), z=pos.getZ(i); const n=0.5+0.5*Math.sin(x*0.21+y*0.13)*Math.cos(z*0.17-y*0.05);
    const t=Math.min(1,Math.max(0,0.78+0.2*(y/HCALC.R)-0.28*n*(z>0?1:0.6))); c.copy(cY).lerp(cR,t); col.push(c.r,c.g,c.b); }
  g.setAttribute('color',new THREE.Float32BufferAttribute(col,3)); return g; })();
const HD_APPLE_MAT=std(0xffffff,0,0.45,{vertexColors:true});
const HD_STEM_MAT=std(0x6b4d28,0,0.85);
function hdFruit(){ const g=new THREE.Group(); g.scale.setScalar(0.001);
  const a=new THREE.Mesh(HD_APPLE_GEO,HD_APPLE_MAT); a.castShadow=true; g.add(a);
  const stub=new THREE.Mesh(CY(1.6,1.6,HD_CUTY-HD_CAV,6),HD_STEM_MAT); stub.position.y=(HD_CAV+HD_CUTY)/2; g.add(stub);
  const full=new THREE.Mesh(CY(1.5,1.7,HD_STEM,6),HD_STEM_MAT); full.position.y=HD_CAV+HD_STEM/2; g.add(full);
  const scar=new THREE.Mesh(CY(1.9,1.9,0.8,8),std(0xe8dcb2,0,0.8)); scar.position.y=HD_STEM/2; full.add(scar);
  g.userData={stub,full}; return g; }
// the live stem between the fruit in the hand and its spur (machine frame): a few segments along a bent curve
const STEM_SEG=6, stemIM=new THREE.InstancedMesh(CY(0.0016,0.0016,1,6,true),HD_STEM_MAT,8*STEM_SEG); stemIM.count=0; stemIM.frustumCulled=false; H.add(stemIM); stemIM.layers.enable(1);
// ---------------- per-unit instance
function makeHandD(u,V){ const h=HD_T.clone(true); h.scale.setScalar(0.001); h.position.z=HD_PALM; V.handG.add(h); const g=n=>h.getObjectByName(n);
  V.hd={root:h, fp:[0,1,2].map(i=>g('fp'+i)), fn:[0,1,2].map(i=>g('fn'+i)), fk:[0,1,2].map(i=>g('fk'+i)), fd:[0,1,2].map(i=>g('fd'+i)),
    ap:g('ap'), af:g('af'), bk:g('bk'), bg:g('bg'), bm:g('bm'), rd:g('rd'), vl:g('vl'), inner:g('inner'), df:g('df')};
  V.hd.df.visible=DELIV==='drop';
  const f=hdFruit(); f.position.z=0.2; f.visible=false; V.handG.add(f); V.fruitH=f;
  // layer 1: what the hand inspector draws (the hand, its fruit and stem, and the spur the stem hangs from)
  h.traverse(o=>o.layers.enable(1)); f.traverse(o=>o.layers.enable(1));
  const sp=new THREE.Group(); UNIT_G.add(sp); sp.visible=false; V.spur=sp;
  { const tw=new THREE.Mesh(CY(0.005,0.006,0.07,8),std(0x5d4a39,0,0.95)); tw.rotation.z=Math.PI/2; tw.position.y=0.004; sp.add(tw);
    const kn=new THREE.Mesh(CY(0.0035,0.005,0.012,8),std(0x5d4a39,0,0.95)); kn.position.y=-0.003; sp.add(kn);
    const rem=new THREE.Mesh(CY(0.0015,0.0017,0.021,6),HD_STEM_MAT); rem.position.y=-0.0105; sp.add(rem); sp.userData.rem=rem;
    const lf=new THREE.Mesh(new THREE.CircleGeometry(1,16),std(0x4f7d3a,0,0.8,{side:THREE.DoubleSide})); lf.scale.set(0.035,0.016,1); lf.position.set(0.02,0.012,-0.02); lf.rotation.set(-1.1,0.6,0.3); sp.add(lf);
    sp.traverse(o=>o.layers.set(1)); } }
let XRAY=false;
function setXray(on){ XRAY=on; const m=HDK.s; m.transparent=on; m.opacity=on?0.16:1; m.depthWrite=!on; m.needsUpdate=true; }
const _hup=new THREE.Vector3(0,1,0), _hdv=new THREE.Vector3();
function poseHandD(u){ const V=u.V, h=V.hd; if(!h) return;
  // fingers: open 25° → closed on the 78 mm fruit; each nut sits where the lead screw put it, the link joins it to the crank tip
  const th=HD_OPEN+(HD_TH-HD_OPEN)*u.grip, nz=nutZ(th), sx=DD.rs-GEO.Kr;
  const ct=Math.cos(th), sn=Math.sin(th), tx=GEO.crankTip[0]*ct+GEO.crankTip[1]*sn, tz=-GEO.crankTip[0]*sn+GEO.crankTip[1]*ct;
  for(let i=0;i<3;i++){ h.fp[i].rotation.y=th; h.fd[i].visible=XRAY; const n=h.fn[i]; n.visible=XRAY; n.position.set(sx,0,nz);
    const L=h.fk[i]; L.visible=XRAY; if(XRAY){ const az=nz+5, dx=tx-sx, dz=tz-az, len=Math.hypot(dx,dz); L.position.set((sx+tx)/2,0,(az+tz)/2); L.scale.set(1.6,len,1.6); L.quaternion.setFromUnitVectors(_hup,_hdv.set(dx/len,0,dz/len)); } }
  h.inner.visible=XRAY; h.rd.visible=XRAY; h.vl.visible=XRAY&&u.valve;
  // cutting finger: swings off the deck (seat), floats over the shoulder, V shifts onto the stem, blade fires
  const a=u.seat||0, phi=Math.PI+HD_SWEEP*a+(u.jig||0); h.ap.rotation.y=phi;
  const sh=HCALC.beakShift*(u.bsh||0); h.bk.position.z=sh;
  const lift=4*(hwin(a,0.06,0.2)-hwin(a,0.78,0.92)); h.af.position.y=Math.max(GEO.G0+lift,a>0.5&&u.fv?hdFloat(phi,sh):GEO.G0);
  h.bg.rotation.y=HD_PSI_C+HD_BL*(u.blade||0); h.rd.position.z=-20*(u.blade||0); h.bm.visible=!!u.beam;
  h.df.visible=DELIV==='drop'; }
function hwin(t,a,b){ return smooth((t-a)/(b-a)); }

// ================================================================== bins and industry crates
const BIN_L=1.2, BIN_W=1.0, BIN_H=0.765, BIN_FLOOR=0.11, BIN_DEPTH=0.62;
const CRATE_L=0.38, CRATE_W=0.6, CRATE_H=0.5, CRATE_DEPTH=0.42;
const pileSideMat=std(0x6b1d19,0,0.6), pileSideInd=std(0x7a5320,0,0.6), crateMat=std(0xd9a21c,0.05,0.55), crateDark=std(0xb3831a,0.05,0.6);
function makeBin(){
  const b=new THREE.Group(); const sh=new THREE.Group(); b.add(sh);
  for(const z of [BIN_W/2-0.015,-BIN_W/2+0.015]) mk(BX(BIN_L,BIN_H-0.1,0.03),MAT.binSide,sh,0,0.1+(BIN_H-0.1)/2,z);
  for(const x of [BIN_L/2-0.015,-BIN_L/2+0.015]) mk(BX(0.03,BIN_H-0.1,BIN_W-0.06),MAT.binSide,sh,x,0.1+(BIN_H-0.1)/2,0);
  mk(BX(BIN_L-0.04,0.03,BIN_W-0.04),MAT.binDark,sh,0,BIN_FLOOR,0);
  for(const z of [-0.4,0,0.4]) mk(BX(BIN_L,0.1,0.11),MAT.binDark,sh,0,0.05,z);
  for(const z of [BIN_W/2-0.02,-BIN_W/2+0.02]) mk(BX(BIN_L+0.02,0.035,0.05),MAT.binDark,sh,0,BIN_H-0.0175,z);
  for(const x of [BIN_L/2-0.02,-BIN_L/2+0.02]) mk(BX(0.05,0.035,BIN_W),MAT.binDark,sh,x,BIN_H-0.0175,0);
  bake(sh);
  const pile=new THREE.Mesh(BX(BIN_L-0.07,1,BIN_W-0.07),[pileSideMat,pileSideMat,MAT.pile,pileSideMat,pileSideMat,pileSideMat]);
  pile.position.y=BIN_FLOOR; pile.visible=false; b.add(pile);
  b.userData={fill:0,pile,cap:BIN_CAP,floor:BIN_FLOOR,depth:BIN_DEPTH};
  return b; }
function makeCrate(){ const b=new THREE.Group(); const sh=new THREE.Group(); b.add(sh);
  for(const z of [CRATE_W/2-0.01,-CRATE_W/2+0.01]) mk(BX(CRATE_L,CRATE_H-0.03,0.02),crateMat,sh,0,0.03+(CRATE_H-0.03)/2,z);
  for(const x of [CRATE_L/2-0.01,-CRATE_L/2+0.01]) mk(BX(0.02,CRATE_H-0.03,CRATE_W-0.04),crateMat,sh,x,0.03+(CRATE_H-0.03)/2,0);
  mk(BX(CRATE_L,0.04,CRATE_W),crateDark,sh,0,0.03,0); for(const z of [0.2,-0.2]) mk(BX(CRATE_L+0.01,0.03,0.02),crateDark,sh,0,CRATE_H-0.08,z*1.5);
  bake(sh);
  const pile=new THREE.Mesh(BX(CRATE_L-0.04,1,CRATE_W-0.04),[pileSideInd,pileSideInd,MAT.pileInd,pileSideInd,pileSideInd,pileSideInd]); pile.position.y=0.05; pile.visible=false; b.add(pile);
  b.userData={fill:0,pile,cap:CRATE_CAP,floor:0.05,depth:CRATE_DEPTH}; return b; }
function setFill(b,n){ const u=b.userData; u.fill=n; const f=Math.min(1,n/u.cap), h=Math.max(0.005,f*u.depth); u.pile.visible=f>0.002; u.pile.scale.y=h; u.pile.position.y=u.floor+h/2; }

// ================================================================== straddle carriers (world-aligned, four-wheel steer, crab)
// 1.75 m long, 1.32 m wide, 1.32 m tall. The bin hangs between the side frames; the industry crate rides in a cradle at the
// +x end. Cross-beams only at the ends, so the machine's filler and crate socks roll up before a carrier moves.
const CW_R=0.18, CW_X=0.70, CW_Z=0.60, T_STEER=1.4, T_HOIST=5.0;
const carPaint=std(0xe9e5dc,0.05,0.4);
function makeCarrier(name){
  const g=new THREE.Group(); scene.add(g); const st=new THREE.Group(); g.add(st);
  for(const z of [CW_Z,-CW_Z]){ mk(RB(CAR_L,0.12,0.1,0.03),carPaint,st,0,1.2,z); mk(RB(CAR_L-0.3,0.015,0.102,0.006),amberStrip,st,0,1.13,z,0,0,0,true);
    for(const x of [CW_X,-CW_X]) mk(RB(0.1,0.78,0.08,0.02),carPaint,st,x,0.82,z);
    mk(RB(0.56,0.16,0.14,0.03),shellDark,st,-0.2,1.34-0.1,z+Math.sign(z)*0.0); mk(new THREE.PlaneGeometry(0.4,0.1),MAT.vent,st,-0.2,1.24,z+Math.sign(z)*0.071,0,z>0?0:Math.PI,0,true); }
  for(const x of [CAR_HX-0.04,-(CAR_HX-0.04)]){ mk(RB(0.08,0.1,2*CW_Z+0.1,0.02),carPaint,st,x,1.27,0); for(const z of [0.25,-0.25]) mk(RB(0.012,0.03,0.16,0.004),MAT.led,st,x+Math.sign(x)*0.041,1.27,z,0,0,0,true);
    mk(RB(0.04,0.06,0.3,0.01),MAT.graphite,st,x+Math.sign(x)*0.03,1.17,0); }
  for(const z of [CW_Z,-CW_Z]) for(const x of [-0.45,0.25]) mk(CY(0.025,0.025,0.3,12),MAT.steel,st,x,1.0,z*0.93);        // hoist cylinders
  mk(RB(0.06,0.18,0.5,0.01),MAT.graphite,st,CRATE_X+0.2,1.0,0);                                          // crate cradle back
  bake(st);
  lidar(g,CAR_HX-0.02,1.02,0,name==='A'?'carLidar':null); lidar(g,-(CAR_HX-0.02),1.02,0,null);
  const bc=new THREE.Group(); bc.position.set(0.1,1.28,-CW_Z); g.add(bc); mk(CY(0.03,0.035,0.03,16),MAT.graphite,bc,0,0,0); mk(CY(0.028,0.028,0.06,16),MAT.beacon,bc,0,0.045,0,0,0,0,true);
  mk(new THREE.PlaneGeometry(0.3,0.12),new THREE.MeshStandardMaterial({map:canvasTex(128,48,(q,w,h)=>{ q.fillStyle='#262b30'; q.fillRect(0,0,w,h); q.fillStyle='#ffb13b'; q.font='600 34px "Barlow Condensed", Arial'; q.fillText('C·'+name,16,36); }),roughness:0.5}),g,0.45,1.2,CW_Z+0.052,0,0,0,true);
  const wheels=[];
  for(const x of [CW_X,-CW_X]) for(const z of [CW_Z,-CW_Z]){ const sg=new THREE.Group(); sg.position.set(x,CW_R,z); g.add(sg);
    mk(CY(0.05,0.05,0.12,14),MAT.graphite,sg,0,0.3,0); mk(RB(0.05,0.2,0.16,0.01),MAT.graphite,sg,0,0.16,0);
    const sp=new THREE.Group(); sg.add(sp); mk(tyre(CW_R,0.12),MAT.rubber,sp,0,0,0); mk(CY(0.11,0.11,0.1,20),MAT.aluMatte,sp,0,0,0,Math.PI/2,0,0); mk(CY(0.055,0.055,0.13,16),MAT.graphite,sp,0,0,0,Math.PI/2,0,0);
    wheels.push({sg,sp}); }
  // hoist: hangers grip the bin under its rim; the crate sits in a cradle. Both ride the slot group (lifted 0.12 m)
  const slot=new THREE.Group(); g.add(slot);
  for(const z of [1,-1]){ mk(RB(0.9,0.04,0.035,0.01),MAT.steel,slot,FILL_X,0.82,z*0.535); for(const x of [-0.35,0.35]) mk(RB(0.05,0.8,0.025,0.01),MAT.steel,slot,FILL_X+x,0.42,z*0.535); }
  mk(RB(0.42,0.03,0.64,0.01),MAT.steel,slot,CRATE_X,0.015,0);
  const c={name,g,wheels,slot,x:0,z:0,steer:0,steerT:0,spin:0,v:0,lift:1,bin:null,crate:null,mode:'idle',legs:[],leg:null,t:0,role:null,trip:0,tTrip:0,dist:0,txt:''};
  return c; }
function carAttach(c,bin,crate){ c.bin=bin; c.crate=crate; for(const [o,x] of [[bin,FILL_X],[crate,CRATE_X]]){ if(!o) continue; if(o.parent) o.parent.remove(o); o.position.set(x,0,0); c.slot.add(o); } }
function carDetach(c){ const out=[c.bin,c.crate]; for(const o of out){ if(!o) continue; const p=new THREE.Vector3(); o.getWorldPosition(p); c.slot.remove(o); o.position.set(p.x,0,p.z); scene.add(o); } c.bin=null; c.crate=null; return out; }
const CARS=[makeCarrier('A'),makeCarrier('B')];
const XH=CANOPY_END+0.15+CAR_HX;               // carrier headland lane centre, |x|
const XHM=CANOPY_END+0.15+M_HX;                // machine headland lane centre, |x|
const GAP=0.5;                                 // standby gap behind the machine
function placeCar(c){ c.g.position.set(c.x,0,c.z); c.slot.position.y=0.12*c.lift+(c.hoist||0);
  for(const w of c.wheels){ w.sg.rotation.y=c.steer; w.sp.rotation.z=-c.spin/CW_R; } }
// ---- depots
function depotOf(sx){ return DEPOT[sx>0?'E':'W']; }
function depotRestock(sx,quiet){ const d=depotOf(sx); let n=0;
  for(const b of d.bays){ if(b.kind==='empty'&&!b.bin&&!b.res){ b.bin=makeBin(); b.crate=makeCrate(); b.bin.position.set(b.x+FILL_X,0,b.z); b.crate.position.set(b.x+CRATE_X,0,b.z); scene.add(b.bin,b.crate); n++; } }
  if(n&&!quiet) logEvent(`Tractor restocked ${n} empty bin${n>1?'s':''} + crate${n>1?'s':''} at the ${sx>0?'east':'west'} depot`); }
function depotReset(){ for(const sx of [1,-1]){ const d=depotOf(sx); for(const b of d.bays){ if(b.bin) scene.remove(b.bin); if(b.crate) scene.remove(b.crate); b.bin=b.crate=null; b.res=false; b.t=-1; } depotRestock(sx,true); } }
function freeBay(sx,kind){ const d=depotOf(sx); let b=d.bays.find(b=>b.kind===kind&&(kind==='drop'?!b.bin:!!b.bin)&&!b.res);
  if(!b&&kind==='drop'){ const full=d.bays.filter(b=>b.kind==='drop'&&b.bin&&!b.res); if(!full.length) return null; b=full.reduce((a,c)=>a.t<c.t?a:c); scene.remove(b.bin); scene.remove(b.crate); b.bin=b.crate=null; logEvent(`Tractor collected a full bin and crate at the ${sx>0?'east':'west'} depot`); }
  if(!b&&kind==='empty'){ depotRestock(sx); b=d.bays.find(b=>b.kind==='empty'&&b.bin&&!b.res); }
  if(b) b.res=true; return b; }
// ---- motion: legs are straight moves along x (in an alley or on the road) or z (in a headland lane or into a bay)
function legGo(x,z,v,txt){ return {k:'go',x,z,v:v||CAR_V,txt}; }
function legDo(T,fn,txt,a){ return {k:'do',T,fn,txt,a}; }
function legWait(fn,txt){ return {k:'wait',fn,txt}; }
function legCall(fn){ return {k:'call',fn}; }
function carStep(c,dt){
  if(c.mode==='docked'){ c.x=S.hx; c.z=S.hz; c.steer=S.steer; c.spin=S.spin; return; }
  if(c.mode==='join'){ joinStep(c,dt); return; }
  if(c.mode!=='legs') return;
  let L=c.leg; if(!L){ L=c.leg=c.legs.shift(); if(!L){ c.mode='idle'; return; } c.t=0; if(L.k==='go'){ c.steerTo=Math.abs(L.x-c.x)>1e-3?0:Math.PI/2; } }
  c.txt=L.txt||c.txt;
  if(L.k==='call'){ c.leg=null; L.fn(c); return; }
  if(L.k==='wait'){ if(L.fn(c)) c.leg=null; return; }
  if(L.k==='do'){ c.t+=dt; if(L.a==='lower') c.lift=Math.max(0,1-c.t/L.T); if(L.a==='lift') c.lift=Math.min(1,c.t/L.T); if(c.t>=L.T){ c.leg=null; if(L.fn) L.fn(c); } return; }
  if(L.k==='go'){ if(!steerTo(c,c.steerTo,dt)) return; const dx=L.x-c.x, dz=L.z-c.z, d=Math.hypot(dx,dz);
    if(d<1e-3){ c.v=0; c.leg=null; return; }
    const vmax=Math.min(L.v,Math.sqrt(2*1.0*d)); c.v=Math.min(vmax,c.v+1.0*dt); const s=Math.min(d,c.v*dt); c.x+=dx/d*s; c.z+=dz/d*s; c.spin+=s*(Math.abs(dx)>Math.abs(dz)?Math.sign(dx):-Math.sign(dz)); c.dist+=s; } }
function steerTo(c,a,dt){ if(Math.abs(c.steer-a)<1e-3){ c.steer=a; return true; } c.v=0; const r=Math.PI/2/T_STEER*dt; c.steer+=Math.sign(a-c.steer)*Math.min(r,Math.abs(a-c.steer)); return false; }
// joining behind the machine: to the headland lane at the machine's rear end, into the alley, then follow
function joinStep(c,dt){ const Z0=ZK(ALLEY), Lx=-DIR*XH, onLine=Math.abs(c.z-Z0)<1e-3;
  const go=(x,z,v)=>{ const dx=x-c.x, dz=z-c.z, d=Math.hypot(dx,dz); const want=Math.abs(dx)>1e-3?0:Math.PI/2; if(d<1e-3){ c.v=0; return true; }
    if(!steerTo(c,want,dt)) return false; const vmax=Math.min(v,Math.sqrt(2*1.0*d)); c.v=Math.min(vmax,c.v+1.0*dt); const s=Math.min(d,c.v*dt); c.x+=dx/d*s; c.z+=dz/d*s; c.spin+=s*(Math.abs(dx)>Math.abs(dz)?Math.sign(dx):-Math.sign(dz)); c.dist+=s; return d-s<1e-3; };
  if(!onLine){ // off the alley line: along its current line (road or another alley) to the lane, then crab over
    if(Math.abs(c.x-Lx)>1e-3){ if(S.turn&&Math.abs(Lx)>ROW_END&&S.turn.sx===Math.sign(Lx)&&Math.abs(c.x)>ROW_END-2) { c.v=0; c.txt='waiting: machine turning in the headland'; return; }
      c.txt=Math.abs(c.z-ROAD_Z)<0.01?'on the field road':'to the headland'; go(Lx,c.z,CAR_V); return; }
    if(S.turn){ c.v=0; c.txt='waiting: machine turning in the headland'; return; }
    if((S.hx-DIR*M_HX-Lx)*DIR<CAR_HX+0.15){ c.v=0; c.txt='waiting for the machine to clear the row end'; return; }
    c.txt='crabbing across the headland'; go(Lx,Z0,CAR_V); return; }
  // on the alley line: follow at GAP behind the machine
  const tx=S.hx-DIR*(M_HX+GAP+CAR_HX); let tgt=tx;
  if(S.turn){ const lim=S.turn.sx*(ROW_END-0.3-CAR_HX); tgt=S.turn.sx>0?Math.min(tx,lim):Math.max(tx,lim); }
  tgt=clamp(tgt,-XH,XH);
  const d=tgt-c.x; if(Math.abs(d)<0.02&&!S.turn){ if(c.role!=='standby'){ c.role='standby'; if(c.tTrip) { S.trips.push(S.t-c.tTrip); c.tTrip=0; } logEvent(`Carrier ${c.name} standing by behind the machine`); } }
  c.txt=c.role==='standby'?'standby, following':'entering the alley';
  if(Math.abs(d)>1e-3){ if(!steerTo(c,0,dt)) return; const vt=Math.min(CAR_V,Math.sqrt(2*Math.abs(d))+S.crawl*(S.moving?1:0)); c.v=Math.min(vt,c.v+dt); const s=Math.min(Math.abs(d),c.v*dt); c.x+=Math.sign(d)*s; c.spin+=Math.sign(d)*s; c.dist+=s; } else c.v=0; }
// ---- the swap: the full carrier leaves forward through the unpicked alley; the standby docks from behind
function canSwap(){ const a=S.active, b=CARS.find(c=>c!==a&&c.role==='standby'); return a&&b&&!S.turn&&!S.swap; }
function startSwap(why){ const a=S.active, b=CARS.find(c=>c!==a&&c.role==='standby'); S.swap={t0:S.t,a,b,why}; S.sockTarget=0; S.active=null;
  logEvent(`Swap: carrier ${a.name} leaves with ${why}; carrier ${b.name} docks`);
  const sx=DIR;
  a.role='trip'; a.mode='legs'; a.tTrip=S.t; a.trip++; a.legs=[
    legWait(()=>FL.L<0.005&&(a.hoist||0)<0.003&&SOCKS.crate<0.02,'spiral nesting, bin going down'), legDo(0.6,c=>{ if(FL.car===c) FL.car=null; },'unlatching'),
    legCall(c=>{ c.legs.unshift(legGo(sx*XH,ZK(ALLEY),CAR_V,'out through the unpicked alley')); }),
    legCall(c=>{ c.legs.unshift(legGo(sx*XH,ROAD_Z,CAR_V,'crabbing to the field road')); }),
    legCall(c=>{ const bd=freeBay(sx,'drop'); c.bayD=bd; c.legs.unshift(legGo(bd.x,ROAD_Z,CAR_V,'to the depot'),legGo(bd.x,DEPOT_Z,CAR_VS,'into a drop bay'),
      legDo(T_HOIST,cc=>{ const [bin,cr]=carDetach(cc); bd.bin=bin; bd.crate=cr; bd.t=S.t; bd.res=false; S.binsOut++; logEvent(`Carrier ${cc.name} left a full bin (${bin.userData.fill}) and crate (${cr.userData.fill}) at the ${sx>0?'east':'west'} depot`); },'lowering bin + crate','lower'),
      legCall(cc=>{ const be=freeBay(sx,'empty'); cc.legs.unshift(legGo(be.x,DEPOT_Z,CAR_VS,'over the bins to an empty bay'),
        legDo(T_HOIST,c3=>{ carAttach(c3,be.bin,be.crate); be.bin=be.crate=null; be.res=false; setFill(c3.bin,0); setFill(c3.crate,0); },'gripping an empty bin + crate','lift'),
        legGo(be.x,ROAD_Z,CAR_VS,'back to the road'),
        legCall(c4=>{ c4.mode='join'; c4.role='return'; })); })); }) ];
  b.role='docking'; b.mode='legs'; b.legs=[
    legWait(()=>{ const lead=a.x*DIR, need=(S.hx*DIR)+M_HX+0.15+CAR_HX; return lead>=need-CAR_L-0.2; },'waiting for the tunnel'),
    legWait(c=>{ const tx=S.hx; const lim=a.x-DIR*(CAR_L+0.15); const t=DIR>0?Math.min(tx,lim):Math.max(tx,lim); const d=t-c.x;
      if(Math.abs(d)>1e-3){ const vt=Math.min(CAR_VS,Math.sqrt(1.0*Math.abs(d))+S.crawl); c.v=Math.min(vt,c.v+dt_now); const s=Math.min(Math.abs(d),c.v*dt_now); c.x+=Math.sign(d)*s; c.spin+=Math.sign(d)*s; c.dist+=s; }
      return Math.abs(S.hx-c.x)<0.005; },'docking into the tunnel'),
    legDo(0.6,c=>{ c.mode='docked'; c.role='active'; c.txt='docked'; S.active=c; FL.car=c; c.hoist=0; S.sockTarget=1; S.swaps.push(S.t-S.swap.t0); S.swap=null; logEvent(`Carrier ${c.name} docked and latched; hoist lifting the bin to the spiral`); },'latching') ];
}
let dt_now=0.05;

// ================================================================== state
const START_X=()=>-DIR*(ROW_X1+0.9);
const S={t:0,hx:0,hz:0,crawl:35/3600,ts:10,playing:true,moving:false,hold:false,steer:0,spin:0,turn:null,stowed:false,active:null,swap:null,sockTarget:1,
  bufF:0,bufI:0,bufMax:0,binned:0,binnedTot:0,indTot:0,log:[],lat:[],latMax:0,picked:0,passed:0,passPicked:0,fails:0,attempts:0,planTry:0,planOK:0,yawed:0,rolls:0,cutsOK:0,
  events:[],trips:[],swaps:[],turns:[],binsOut:0,flows:[],sorter:[],pp:0,rowEndX:31,cyc:[],dv:[],relocs:0,releases:0,planBusy:0,waits:0,sortF:0,sortI:0,minAA:9,hitsAM:0,hidden:0,searches:0,rollOK:0,stalkCut:0,stalkKept:0,stalkLost:0,night:false};
function fmtT(t){ const m=Math.floor(t/60), s=Math.floor(t%60); return `${m}:${String(s).padStart(2,'0')}`; }
function logEvent(txt){ S.events.unshift([S.t,txt]); if(S.events.length>8) S.events.pop(); if(typeof renderLog==='function') renderLog(); }
function fruitP(i){ return [A.x[i]-S.hx,A.y[i],A.z[i]-S.hz]; }
function rowEndX(){ let m=-1e9; for(const i of nearIdx) m=Math.max(m,DIR*A.x[i]); return Math.min(XHM-0.2,m+1.1); }
// ================================================================== fruit flows (machine frame)
const FLOW_MAX=400;
const flowMesh={fresh:new THREE.InstancedMesh(appleGeo,MAT.appleFlow,FLOW_MAX),ind:new THREE.InstancedMesh(appleGeo,MAT.appleInd,FLOW_MAX)};
for(const k in flowMesh){ flowMesh[k].count=0; flowMesh[k].castShadow=true; flowMesh[k].frustumCulled=false; H.add(flowMesh[k]); }
const SORT_V=0.25, SORT_PITCH=0.075, FR=0.045;
function newFlow(pts,ind,t0,next){ const f={pts,seg:1,u:0,segT:0,ind,t0,next,pos:pts[0].slice(0,3)}; S.flows.push(f); return f; }
// landing belt → inner end → ramp down to the sorter lane
function tailLanding(s){ return [[LAND_X,LAND_Y+FR+0.01,s*(LAND_Z0+0.03),BELT_V],[SORT_XS,SY+FR,s*0.05,0.45]]; }
function routeLower(u,R){ const s=u.s; return [[R[0],R[1],R[2],0],[ELEV_X+u.e*0.06,LOWB_Y+FR+0.01,s*LOWB_Z,BELT_V],[ELEV_X,LOWB_Y+0.1,s*ELEV_Z,0.3],[ELEV_X,ELEV_TOP,s*ELEV_Z,0.4],
  [LAND_X+0.06,LAND_Y+FR+0.02,s*ELEV_Z,0.4]].concat(tailLanding(s)); }
function routeLanding(x,y,z,s){ return [[x,y,z,0],[x,LAND_Y+FR+0.01,z,0.3],[LAND_X+(x-LAND_X)*0.3,LAND_Y+FR+0.01,s*0.7,BELT_V]].concat(tailLanding(s)); }
function routeFunnel(u,P){ const s=u.s; return [[P[0],P[1],P[2],0],[ELEV_X,LIP_LY-0.02,s*0.98,0.4],[ELEV_X,LIP_LY-0.06,s*(ELEV_Z+0.05),0.4],[ELEV_X,ELEV_TOP,s*ELEV_Z,0.4],
  [LAND_X+0.06,LAND_Y+FR+0.02,s*ELEV_Z,0.4]].concat(tailLanding(s)); }
function spawnCarry(u,P){ newFlow(u.hang?routeLanding(P[0],P[1],P[2],u.s):routeFunnel(u,P),u.ind,u.tc,'queue'); }
function spawnSock(u){ const f={stage:'sock',u,tt:0,ind:u.ind,t0:u.tc,pos:collarPosSim(u),s:u.s}; S.flows.push(f); }
// fresh fruit down the spiral: 2.5 turns on the padded floor at SP_V, across the turning spreader, a 5 cm step onto the pile
function spiralPath(){ const top=spTop(FL.L), bot=BRIDGE_Y0-FL.L+DISC_T, n=Math.ceil(SP_N*16), pts=[];
  for(let i=0;i<=n;i++){ const t=i/n, th=t*SP_N*2*Math.PI; pts.push([SP_AX+SP_R*Math.cos(th),top+(bot-top)*t+FR,SP_R*Math.sin(th),i?SP_V:0]); }
  const a=SP_N*2*Math.PI+0.6+rnd()*2.4; pts.push([SP_AX+(DISC_R-0.04)*Math.cos(a),bot+FR,(DISC_R-0.04)*Math.sin(a),0.2]);
  const r=DISC_R+0.04+rnd()*0.32, pile=binTopY(); pts.push([SP_AX+(DISC_R+0.03)*Math.cos(a),bot+FR-0.01,(DISC_R+0.03)*Math.sin(a),0.2]);
  pts.push([clamp(SP_AX+r*Math.cos(a),FILL_X-0.54,FILL_X+0.54),pile,clamp(r*Math.sin(a),-0.44,0.44),0.45]); return pts; }
function segTime(a,b){ const d=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]); return b[3]>0?d/b[3]:0.001; }
function binTopY(){ const c=S.active; const b=c&&c.bin; return 0.12+(c?c.hoist||0:0)+BIN_FLOOR+(b?Math.min(1,b.userData.fill/BIN_CAP):0)*BIN_DEPTH+0.04; }
function crateTopY(){ const c=S.active; const b=c&&c.crate; return 0.12+(c?c.hoist||0:0)+0.05+(b?Math.min(1,b.userData.fill/CRATE_CAP):0)*CRATE_DEPTH+0.04; }
// soft filler targets: hoist as high as the pile allows (bin rim just under the deck), the spreader 5 cm over the pile
function fillerTargets(){ const c=S.active, b=c&&c.bin; if(!S.sockTarget||!b) return {L:0,h:0}; const h=Math.min(1,b.userData.fill/BIN_CAP)*BIN_DEPTH;
  const hoist=clamp(HOIST_MAX-h,0,HOIST_MAX), pile=0.12+hoist+BIN_FLOOR+h; return {L:clamp(BRIDGE_Y0-0.05-pile,0,SP_LMAX),h:hoist}; }
function crateTarget(){ return Math.max(0.05,BRIDGE_Y0-(crateTopY()+0.08)); }
function ready(kind){ const c=S.active; if(!c||S.swap) return false; if(kind==='ind') return c.crate&&c.crate.userData.fill<CRATE_CAP&&SOCKS.crate>=crateTarget()-0.02; const T=fillerTargets(); return c.bin&&c.bin.userData.fill<BIN_CAP&&Math.abs(FL.L-T.L)<0.03&&Math.abs((c.hoist||0)-T.h)<0.03&&FL.car===c; }
function binFruit(f){ const c=S.active, b=f.ind?c.crate:c.bin; setFill(b,b.userData.fill+1); arrive(f); if(!f.ind&&b.userData.fill>=BIN_CAP-2) wantSwap('a full bin'); if(f.ind&&b.userData.fill>=CRATE_CAP-1) wantSwap('a full crate'); }
function arrive(f){ S.binned++; S.binnedTot++; if(f.ind) S.indTot++; S.log.push(S.t); if(f.t0!=null){ const L=S.t-f.t0; S.lat.push(L); if(S.lat.length>400) S.lat.shift(); S.latMax=Math.max(S.latMax,L); } }
function wantSwap(why){ if(!S.swap&&!S.swapWhy){ S.swapWhy=why; } }
function setPath(f,pts,next){ f.pts=pts; f.seg=1; f.u=0; f.segT=0; f.next=next; f.stage=null; }
function updateFlows(dt){
  // sorter lane: single file along +x at SORT_V, never closer than SORT_PITCH. The cameras under the hood grade each fruit;
  // at the gate the flaps drop fresh fruit into the filler, industry fruit roll over the closed flaps to the lane end.
  for(let k=0;k<S.sorter.length;k++){ const f=S.sorter[k], ahead=k>0?S.sorter[k-1].sx:9; f.sx=Math.min(f.sx+SORT_V*dt,ahead-SORT_PITCH);
    f.sz*=Math.max(0,1-dt*6); f.pos=[f.sx,SY+FR,f.sz]; if(!f.graded&&f.sx>HOOD_X){ f.graded=true; if(f.ind) S.sortI++; else S.sortF++; } }
  while(S.sorter.length){ const f=S.sorter[0]; const exitX=f.ind?SORT_X1:FILLER_X; if(f.sx<exitX) break; S.sorter.shift();
    if(!f.ind){ flapOpen=1; setPath(f,[[FILLER_X,SY+FR,0,0],[FILLER_X,spTop(FL.L)+FR,0,0.9]],'fill'); }
    else setPath(f,[[SORT_X1,SY+FR,0,0],[SORT_X1+0.03,SY-0.01,0,0.3],[SORT_X1+0.2,SY-0.1,0,0.6],[CRATE_X,BRIDGE_Y0-0.03,0,0.6]],'crate'); }
  flapOpen=Math.max(0,flapOpen-dt*3);
  for(const f of S.flows){ if(f.done) continue;
    if(f.stage==='sock'){ const u=f.u, R=receiver(u), C=collarPosSim(u), len=Math.hypot(R[0]-C[0],R[1]-C[1],R[2]-C[2])*1.15+0.05; f.tt+=SOCK_V*dt/len;
      if(f.tt>=1){ const pts=u.hang?routeLanding(R[0],R[1],R[2],u.s):routeLower(u,R); setPath(f,pts,'queue'); }
      else { f.pos=sockCurveSim(u,f.tt,C); } continue; }
    if(f.stage==='sort') continue;
    if(f.stage==='wait'){ if(gateFree()) enterSorter(f); continue; }
    let rem=dt;
    while(rem>0&&!f.done&&f.pts){ const a=f.pts[f.seg-1], b=f.pts[f.seg]; const T=f.segT||(f.segT=segTime(a,b)); const need=(1-f.u)*T;
      if(rem>=need){ rem-=need; f.u=0; f.seg++; f.segT=0;
        if(f.seg>=f.pts.length){ f.pos=b.slice(0,3); const n=f.next; f.pts=null;
          if(n==='queue'){ f.stage='wait'; if(gateFree()) enterSorter(f); }
          else if(n==='fill'){ if(ready('fresh')) setPath(f,spiralPath(),'bin'); else toBuffer(f); }
          else if(n==='crate'){ if(ready('ind')) setPath(f,[[CRATE_X,BRIDGE_Y0-0.03,0,0],[CRATE_X,crateTopY(),0,1.0]],'bin'); else toBuffer(f); }
          else if(n==='bin'){ const c=S.active, bn=c&&(f.ind?c.crate:c.bin); if(bn&&!S.swap&&bn.userData.fill<bn.userData.cap){ binFruit(f); f.done=true; } else toBuffer(f); }
          break; } }
      else { f.u+=rem/T; rem=0; const k=f.u; f.pos=[a[0]+(b[0]-a[0])*k,a[1]+(b[1]-a[1])*k,a[2]+(b[2]-a[2])*k]; } } }
  S.flows=S.flows.filter(f=>!f.done);
  // buffer: fruit held in the filler / chute throats while no carrier is ready; it drains into the next bin at 4 fruit/s
  if(S.bufF>0&&ready('fresh')){ S.drainF=(S.drainF||0)+dt*4; while(S.drainF>=1&&S.bufF>0){ S.drainF--; S.bufF--; const b=S.active.bin; setFill(b,b.userData.fill+1); S.binned++; S.binnedTot++; S.log.push(S.t); } }
  if(S.bufI>0&&ready('ind')){ S.drainI=(S.drainI||0)+dt*4; while(S.drainI>=1&&S.bufI>0){ S.drainI--; S.bufI--; const b=S.active.crate; setFill(b,b.userData.fill+1); S.binned++; S.binnedTot++; S.indTot++; S.log.push(S.t); } }
  S.bufMax=Math.max(S.bufMax,S.bufF+S.bufI);
}
function toBuffer(f){ f.done=true; if(f.ind) S.bufI++; else S.bufF++; if(f.t0!=null){ S.lat.push(S.t-f.t0); if(S.lat.length>400) S.lat.shift(); } }
function gateFree(){ const last=S.sorter[S.sorter.length-1]; return !last||last.sx>SORT_XS+SORT_PITCH; }
function enterSorter(f){ f.stage='sort'; f.sx=SORT_XS; f.sz=f.pos[2]; S.sorter.push(f); }
// collar and sock curve from the unit's current joints (the sim can run several steps per frame)
const KF2=newFrames(), _B2=m4();
function fkUnit(u){ baseM(u.bx,u.yb,u.s*u.zb,u.hang,u.s,_B2); fk(_B2,u.q,COBOTS[COBOT],KF2); const F=KF2[6], L=toolLen(u.ext); return [F[3]+F[2]*L,F[7]+F[6]*L,F[11]+F[10]*L]; }
function collarPosSim(u){ const t=fkUnit(u); if(DELIV==='tube'){ const F=KF2[5]; return [F[3]-F[1]*0.08,F[7]-F[5]*0.08,F[11]-F[9]*0.08]; }
  if(DELIV==='drop'){ const F=KF2[6], z=[F[2],F[6],F[10]], d=handDown(z,[0,0,0]); return [t[0]+z[0]*0.055+d[0]*0.14,t[1]+z[1]*0.055+d[1]*0.14,t[2]+z[2]*0.055+d[2]*0.14]; } return t; }
function sockCurveSim(u,t,C){ const R=receiver(u), d=Math.hypot(R[0]-C[0],R[1]-C[1],R[2]-C[2]), sag=Math.max(0,SOCK_MAX-d)*0.45+0.05;
  const m=[(C[0]+R[0])/2,(C[1]+R[1])/2-sag,(C[2]+R[2])/2+u.s*0.06], a=(1-t)*(1-t), b=2*(1-t)*t, c=t*t;
  return [a*C[0]+b*m[0]+c*R[0],a*C[1]+b*m[1]+c*R[1],a*C[2]+b*m[2]+c*R[2]]; }

// ================================================================== cobot units: claim, pick, deliver
// Every motion is planned before it starts: collision-checked against the machine along the whole path, and against the
// capsules the other cobots on the same side have reserved. A unit whose delivery path is blocked waits (holding the fruit),
// and after 3 s folds out of the way first.
const ATTEMPT_WIN=1.4;          // s: the fruit must stay in this unit's window at least this long
function inBand(u,i){ return A.y[i]>=u.band[0]&&A.y[i]<u.band[1]; }
function othersFor(u){ const o=[]; for(const w of U){ if(w!==u&&w.s===u.s&&w.res) o.push(w.res); } return o; }
function poseRes(u){ const caps=[]; baseM(u.bx,u.yb,u.s*u.zb,u.hang,u.s,_B2); fk(_B2,u.q,COBOTS[COBOT],KF2); armCaps(KF2,toolLen(u.ext),caps,u.hold?0.05:0); carriageCap(u,u.yb,u.zb,caps); return {caps,box:capsBox(caps)}; }
function dist3(a,b){ return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]); }
function legTime(L){ return Math.max(jointTime(L.q0,L.q1),trap(L.y1-L.y0,VZ,AZ),trap(L.z1-L.z0,VY,AY),EOAT==='tele'?trap(L.e1-L.e0,1.0,6):0,0.1)+0.04; }
function moveLegs(u,legs,phase,extra){ const T=legs.map(legTime); u.mv={legs,T,f0:u.flipA,g0:u.grip,extra:extra||null}; u.resT=S.t; setPhase(u,phase,T.reduce((a,b)=>a+b,0)); }
// a moving unit's reservation shrinks as it goes: only what is left of its path, plus the poses it will work in at the end
function shrinkRes(u){ const m=u.mv; if(!m) return; let t=u.pt, j=0; while(j<m.T.length-1&&t>m.T[j]){ t-=m.T[j]; j++; }
  const caps=[]; const L=m.legs[j]; sweepCaps(u,{q0:u.q,q1:L.q1,y0:u.yb,y1:L.y1,z0:u.zb,z1:L.z1,e0:u.ext,e1:L.e1},caps,u.hold,false,true);
  for(let k=j+1;k<m.legs.length;k++) sweepCaps(u,m.legs[k],caps,u.hold,false,true);
  if(m.extra) for(const c of m.extra) caps.push(c); u.res={caps,box:capsBox(caps)}; }
function setPhase(u,p,T){ if(u.phase!==p){ u.hist=(u.hist||[]); u.hist.push(p); if(u.hist.length>8) u.hist.shift(); } u.phase=p; u.pt=0; u.pd=T||0; }
function claim(u){ const M=COBOTS[COBOT], x0=S.hx+u.xw[0], x1=S.hx+u.xw[1]; const lo=lowerBound(nearIdx,x0); const cands=[];
  const tcp=u.tcp||fkUnit(u);
  for(let k=lo;k<nearIdx.length;k++){ const i=nearIdx[k]; if(A.x[i]>x1) break;
    if(A.side[i]!==u.s||A.state[i]!==0||!A.det[i]||A.busy[i]||!inBand(u,i)) continue;
    const xr=A.x[i]-S.hx, tl=(DIR>0?xr-u.xw[0]:u.xw[1]-xr)/Math.max(vNow(),1e-4); if(tl<ATTEMPT_WIN) continue;
    if(A.unr[i]&(1<<u.id)&&Math.abs(xr-A.unrX[i])<0.1) continue;
    const P=[xr,A.y[i],A.z[i]-S.hz]; cands.push([dist3(P,tcp)/M.v+0.08*Math.min(tl,25),i]); }
  cands.sort((a,b)=>a[0]-b[0]); const others=othersFor(u); let tries=0;
  for(let k=0;k<cands.length&&tries<3;k++){ const i=cands[k][1]; const P=fruitP(i); P[0]-=DIR*vNow()*1.0;
    if(others.some(R=>pointNearRes(P,R,0.3))) continue; tries++; S.planTry++;
    const r=planPick(u,P,others); if(!r.ok){ if(r.why==='busy') S.planBusy++; else { A.unr[i]|=(1<<u.id); A.unrX[i]=A.x[i]-S.hx; } continue; }
    S.planOK++; if(r.psi) S.yawed++; S.lastClaim=S.t;
    u.fi=i; A.busy[i]=true; u.a=r.a; u.plan=r; u.escape={q:r.qp.slice(),yb:r.yb}; u.res=r.res; u.tc=S.t; u.stem=null; u.ok=false; u.atHome=false; S.attempts++;
    moveLegs(u,r.legs,'move',r.extra); return true; }
  return false; }
// follow the fruit (the machine keeps crawling) with a few IK steps; if the fruit drifts out of reach or the arm would
// straighten into the elbow singularity, keep the last good pose and give the fruit up
function track(u,r,ext,a){ const P=fruitP(u.fi), aa=a||u.a; const tgt=[P[0]-aa[0]*r,P[1]-aa[1]*r,P[2]-aa[2]*r]; baseM(u.bx,u.yb,u.s*u.zb,u.hang,u.s,_B2);
  const q0=u.q.slice(); const err=ikSolve(_B2,COBOTS[COBOT],toolLen(ext),tgt,aa,u.q,3);
  const why=err>0.03?'err':(Math.abs(u.q[2])<Q3_MIN?'q3':(Math.abs(Math.sin(u.q[4]))<0.1?'q5':(!poseClear(u,ext)?'hit':null)));
  if(why){ for(let k=0;k<6;k++) u.q[k]=q0[k]; u.lost=true; S.lostWhy=S.lostWhy||{}; const kk=why+':'+u.phase; S.lostWhy[kk]=(S.lostWhy[kk]||0)+1; } }
// the pose the arm is actually in must be clear of the machine (checked on every tracking step)
function poseClear(u,ext){ const c=[]; if(!poseCaps(u,u.q,u.yb,u.zb,ext==null?u.ext:ext,c,u.hold,0.005)) return false;
  const box=capsBox(c); for(const w of U){ if(w===u||w.s!==u.s) continue; const R=w.res||w.cur; if(R&&resHitM(c,box,R,0.01)) return false; } return true; }
function resHitM(caps,box,R,m){ const b=R.box; if(box[0]>b[3]+m||box[3]<b[0]-m||box[1]>b[4]+m||box[4]<b[1]-m||box[2]>b[5]+m||box[5]<b[2]-m) return false;
  for(const a of caps) for(const d of R.caps) if(segDist(a,d)<a[6]+d[6]+m) return true; return false; }
function pCut(u){ return P_CUT*(DELIV==='drop'&&A.nn[u.fi]<0.085?0.85:1); }
// the fruit leaves the tree's instanced mesh when the fingers close on it and is drawn in the hand from then on; its stem is
// drawn live between the hand and the spur until it is cut (a stub stays on the fruit, the rest on the spur) or rolled off
function takeFruit(u){ const i=u.fi, g=A.g[i]; u.fv=true; u.stemMode='live'; G.stemS[g]=0; setApple(i,false); }
function releaseTreeFruit(u){ const i=u.fi; if(i<0||!u.fv||u.hold) return; const g=A.g[i]; G.stemS[g]=1; u.fv=false; u.stemMode=null; setApple(i,true); }
function stemCut(u){ const g=A.g[u.fi]; u.stemMode='cut'; G.stemS[g]=0.7; G.state[g]=1; setApple(u.fi,false); S.stalkCut++; }
function stemRolled(u){ const g=A.g[u.fi]; const kept=rnd()<K_ROLL; u.stemMode=kept?'full':'none'; G.stemS[g]=kept?0:1; G.state[g]=1; setApple(u.fi,false); if(kept) S.stalkKept++; else S.stalkLost++; }
function finishPick(u,ok){ const i=u.fi; u.ok=ok; u.flagged=false;
  if(ok){ A.state[i]=1; G.state[A.g[i]]=1; setApple(i,false); u.hold=true; u.ind=rnd()<IND_SHARE; S.picked++; }
  else { releaseTreeFruit(u); A.state[i]=2; G.state[A.g[i]]=2; A.busy[i]=false; S.fails++; }
  u.seat0=u.seat; u.roll0=u.roll; u.ext0=u.ext; u.beam=false; u.valve=false;
  setPhase(u,'retract',EOAT==='tele'?trap(EOATS.tele.ext,1.0,6):trap(0.12,0.5,3)); }
// parking: hanging cobots park at the top of their stroke, standing ones at the bottom, so the band between them stays free
function parkY(u){ return u.hang?u.yr[1]:u.yr[0]; }
function goHome(u,phase){ const r=planPath(u,u.stowQ,parkY(u),SLIDE_Z0,0,u.hold,othersFor(u),null); if(!r.ok) return false; u.res=r.res; moveLegs(u,r.legs,phase); return true; }
function startWait(u,what){ u.waitFor=what; u.waitT=0; u.res=poseRes(u); setPhase(u,'wait',0.4); S.waits++; }
function unitStep(u,dt){ u.pt+=dt; const k=u.pd>0?Math.min(1,u.pt/u.pd):1, done=u.pt>=u.pd, tele=EOAT==='tele', X=EOATS.tele.ext;
  if(u.phase!=='idle'&&u.phase!=='stowed') u.busyT+=dt;
  if(u.lost&&u.fi>=0&&u.phase!=='retract'&&['look','insert','grasp','check','seat','cut','search','roll'].includes(u.phase)){ u.lost=false; S.lost=(S.lost||0)+1; u.jig=0; finishPick(u,false); return; }
  if(u.phase!=='retract') u.lost=false;
  // while it works at a fruit or a set-down point the arm follows the target, so its reservation follows the arm
  if(['look','insert','grasp','check','seat','cut','search','roll','retract','place','release','flip','wait'].includes(u.phase)&&S.t-(u.resT||0)>0.2){ u.resT=S.t;
    const R=poseRes(u); if(u.mv&&u.mv.extra&&u.phase!=='wait'){ for(const c of u.mv.extra) R.caps.push(c); R.box=capsBox(R.caps); } u.res=R; }
  switch(u.phase){
    case 'idle': u.idleT=(u.idleT||0)+dt; if(S.stowed||S.hold||!canClaim()) break;
      if(S.t>=(u.nextTry||0)){ u.nextTry=S.t+0.35; if(claim(u)){ u.idleT=0; u.backoff=0; break; } u.backoff=Math.min(1.2,(u.backoff||0)+0.2); u.nextTry+=u.backoff; }
      if(u.idleT>0.3&&!u.atHome){ if(goHome(u,'home')) u.idleT=0; } break;
    case 'move': case 'carry': case 'reloc': case 'stow': case 'home': { const m=u.mv; let t=u.pt, j=0; while(j<m.T.length-1&&t>m.T[j]){ t-=m.T[j]; j++; }
      if(S.t-u.resT>0.25){ u.resT=S.t; shrinkRes(u); }
      const L=m.legs[j], e=smooth(Math.min(1,t/m.T[j]));
      for(let q=0;q<6;q++) u.q[q]=L.q0[q]+(L.q1[q]-L.q0[q])*e; u.yb=L.y0+(L.y1-L.y0)*e; u.zb=L.z0+(L.z1-L.z0)*e; u.ext=L.e0+(L.e1-L.e0)*e; u.flipA=m.f0*(1-smooth(k));
      if(u.phase==='move'&&!u.hold) u.grip=m.g0*(1-smooth(k));
      if(!done) break;
      if(u.phase==='move'){ if(m.extra) u.res={caps:m.extra,box:capsBox(m.extra)}; setPhase(u,'look',T_LOOK); }
      else if(u.phase==='carry'){ if(m.extra) u.res={caps:m.extra,box:capsBox(m.extra)}; setPhase(u,'place',T_PLACE); }
      else if(u.phase==='reloc') releaseSock(u);
      else if(u.phase==='stow'){ u.res=poseRes(u); setPhase(u,'stowed',0); }
      else if(u.phase==='home'){ u.res=poseRes(u); u.atHome=true; if(S.stowed&&!u.hold){ u.waitT=0; stowOne(u); } else if(u.hold){ setPhase(u,'wait',0.05); u.waitFor='deliver'; u.waitT=0; } else { setPhase(u,'idle',0); u.idleT=0; } }
      break; }
    case 'look': track(u,tele?X:PRE.direct,0); if(done) setPhase(u,'insert',tele?trap(X,EOATS.tele.va,6):trap(PRE.direct,EOATS.direct.va,2)); break;
    case 'insert': { const e=smooth(k); if(tele){ u.ext=X*e; track(u,X-u.ext,u.ext); } else track(u,PRE.direct*(1-e),0); if(done) setPhase(u,'grasp',T_GRASP); break; }
    // hand D: close the three fingers (each stops on the fruit at 26 N), colour check and stem check with the head and fingertip cameras
    case 'grasp': track(u,0,tele?X:0); if(!u.fv) takeFruit(u); u.grip=smooth(k); if(done){ setPhase(u,'check',T_CHECK); } break;
    case 'check': track(u,0,tele?X:0); if(done){ u.stem=rnd()<P_STEM; if(u.stem) setPhase(u,'seat',T_SEAT); else { S.hidden++; S.flagged=(S.flagged||0)+1; u.seat0=0; finishPick(u,false); u.flagged=true; } } break;
    // stem visible: the cutting finger swings 170° off the deck, the guard shoe rides over the shoulder, the V takes the stem
    case 'seat': track(u,0,tele?X:0); u.seat=smooth(k); if(done){ if(rnd()<pCut(u)) setPhase(u,'cut',T_CUT); else { S.searches++; setPhase(u,'search',T_SEARCH); } } break;
    // throat beam breaks → pull 8 mm → valve (8 ms) → the cylinder turns the blade 50° through the stem → F/T confirms
    case 'cut': { const t=u.pt; track(u,0.008*hwin(t,0,0.03),tele?X:0); u.bsh=hwin(t,0,0.03); u.beam=t>0.008; u.valve=t>=0.03; u.blade=hwin(t,0.036,0.058);
      if(t>=0.05&&u.stemMode==='live') stemCut(u); if(done){ S.cutsOK++; finishPick(u,true); } break; }
    // the beam never breaks (stem too short, bent over the shoulder, or a leaf in the V): search ±8°, then park and roll instead
    case 'search': track(u,0,tele?X:0); u.jig=8*D2R*Math.sin(k*2*Math.PI); if(done){ u.jig=0; S.flagged=(S.flagged||0)+1; finishPick(u,false); u.flagged=true; } break;
    // twist and pull: 10 mm pull to tension the stem, J6 rolls the hand 70° (grip raised to 32 N), the stem lets go at its spur
    // joint near 50°, and the F/T sees tension and torque drop to the fruit's weight
    case 'roll': { const t=u.pt; track(u,0.010*hwin(t,0,0.10),tele?X:0); u.seat=(u.seat0||0)*(1-hwin(t,0,0.16));
      u.roll=-70*D2R*hwin(t,0.10,0.35); if(t>=0.28&&u.stemMode==='live'&&u.rollOK) stemRolled(u);
      if(done){ if(u.rollOK) S.rollOK++; finishPick(u,u.rollOK); } break; }
    case 'retract': { const e=smooth(k); if(tele) u.ext=(u.ext0==null?X:u.ext0)*(1-e); if(!u.lost){ if(tele) track(u,0,u.ext); else track(u,0.12*e,0); } if(!u.hold) u.grip=1-e;
      u.seat=(u.seat0||0)*(1-hwin(u.pt,0,0.17)); u.blade=Math.max(0,(u.blade||0)-dt/0.03); u.bsh=Math.max(0,(u.bsh||0)-dt/0.05); u.roll=(u.roll0||0)*(1-e);
      if(done){ u.lost=false; u.res=poseRes(u); u.seat=0; u.roll=0; u.blade=0; u.bsh=0; const i=u.fi; u.fi=-1; if(!u.ok){ u.res=poseRes(u); setPhase(u,'idle',0); u.grip=0; u.idleT=0; break; } A.busy[i]=false; u.tr=S.t; deliver(u); } break; }
    case 'wait': u.waitT+=dt; if(done){ setPhase(u,'wait',0.4); if(u.waitFor==='stow'){ stowOne(u); break; }
      // the longest-waiting unit on a side has right of way: younger waiters fold out of its way
      if(u.waitT>2){ for(const w of U){ if(w!==u&&w.s===u.s&&w.phase==='wait'&&w.waitFor==='deliver'&&w.waitT<u.waitT&&!w.atHome) goHome(w,'home'); } }
      deliver(u); } break;
    case 'place': { const P=u.pl.P, Pp=u.pl.Pp, e=smooth(k); const tgt=[Pp[0]+(P[0]-Pp[0])*e,Pp[1]+(P[1]-Pp[1])*e,Pp[2]+(P[2]-Pp[2])*e]; baseM(u.bx,u.yb,u.s*u.zb,u.hang,u.s,_B2);
      const q0=u.q.slice(); ikSolve(_B2,COBOTS[COBOT],toolLen(0),tgt,u.pl.dir,u.q,3); if(!poseClear(u,0)) for(let j=0;j<6;j++) u.q[j]=q0[j];
      if(done) setPhase(u,'release',T_REL); break; }
    case 'flip': u.flipA=1.0*smooth(k); if(done) setPhase(u,'release',T_REL); break;
    case 'release': u.grip=1-smooth(Math.min(1,k*2.5)); if(DELIV==='drop') u.dropK=hwin(k,0.3,1); if(done){ u.grip=0; u.dropK=0; u.hold=false; u.fv=false; u.stemMode=null; S.releases++;
      if(DELIV==='carry') spawnCarry(u,u.pl.P); else spawnSock(u);
      const c=S.t-u.tc; S.cyc.push(c); if(S.cyc.length>300) S.cyc.shift(); S.dv.push(S.t-u.tr); if(S.dv.length>300) S.dv.shift(); u.n++; u.cyc+=c;
      u.res=poseRes(u); setPhase(u,'idle',0); u.idleT=0; } break;
    case 'stowed': break; }
}
// delivery: plan it now; if the path is blocked (or the arm is in an awkward pose), park at the end of the stroke with the
// fruit and try again from there
function deliverFail(u){ if(!u.atHome&&goHome(u,'home')) return; if(u.phase!=='wait') startWait(u,'deliver'); }
function deliver(u){ const others=othersFor(u); const wasHome=u.atHome;
  if(DELIV==='carry'){ const r=planPlace(u,others); if(r.ok){ u.atHome=false; u.pl=r; u.res=r.res; moveLegs(u,r.legs,'carry',r.extra); return; } deliverFail(u); return; }
  const C=collarPosSim(u); if(sockOK(u,C)){ releaseSock(u); return; }
  const T=relocTarget(u,C); baseM(u.bx,u.yb,u.s*u.zb,u.hang,u.s,_B2);
  for(const a of [u.a,DOWN]){ if(!a) continue;
    // pick and drop: T is where the funnel outlet must go; the hand sits 55 mm behind and 140 mm above it
    let Tt=T; if(DELIV==='drop'){ const d=handDown(a,[0,0,0]); Tt=[T[0]-a[0]*0.055-d[0]*0.14,T[1]-a[1]*0.055-d[1]*0.14,T[2]-a[2]*0.055-d[2]*0.14]; }
    for(const seed of [u.q].concat(BANK[u.hang?'hang':'stand'])){ const q=seed.slice(); if(ikSolve(_B2,COBOTS[COBOT],toolLen(u.ext),Tt,a,q,60)>5e-3) continue;
    const c=[]; if(!poseCaps(u,q,u.yb,u.zb,u.ext,c,true)||!canLeaveTier(u,q,u.yb,u.zb)) continue;
    const r=planPath(u,q,u.yb,u.zb,u.ext,true,others,c); if(r.ok){ u.atHome=false; S.relocs++; u.res=r.res; moveLegs(u,r.legs,'reloc'); return; } } }
  deliverFail(u); }
function releaseSock(u){ if(DELIV==='tube') setPhase(u,'flip',T_FLIP); else setPhase(u,'release',T_DROP); }
// stowing for the turn: the hanging cobot on a column goes first, the standing one below it follows
function stowOne(u){ if(!u.hang){ const up=U.find(w=>w!==u&&w.s===u.s&&w.e===u.e&&w.hang); if(up&&up.phase!=='stowed'&&!(up.phase==='wait'&&up.waitFor==='stow'&&up.waitT>4)){ /* unless the hanging one is boxed in: then the standing one clears the way first */ if(u.phase!=='wait'){ u.res=poseRes(u); } setPhase(u,'wait',0.4); u.waitFor='stow'; u.waitT=u.waitT||0; return; } }
  let r=planPath(u,u.stowQ,parkY(u),SLIDE_Z0,0,false,othersFor(u),null);
  // still boxed in after 3 s: the neighbours are standing still, so plan against where they actually are with 1 cm to spare
  if(!r.ok&&u.waitT>3&&U.every(w=>w===u||w.s!==u.s||['wait','stowed','idle'].includes(w.phase))){ const o=[]; for(const w of U) if(w!==u&&w.s===u.s) o.push(poseRes(w)); r=planPath(u,u.stowQ,parkY(u),SLIDE_Z0,0,false,o,null,0.01); }
  if(r.ok){ u.res=r.res; moveLegs(u,r.legs,'stow'); return; }
  // still boxed in after 5 s: step out first (unfold outboard here, or ride the carriage to the park end as it is), then stow from there
  if(u.waitT>5&&U.every(w=>w===u||w.s!==u.s||['wait','stowed','idle'].includes(w.phase))){ const o=[]; for(const w of U) if(w!==u&&w.s===u.s) o.push(poseRes(w));
    // two-step search: an intermediate pose (a ready pose, a seed fold, the last pick's retreat pose) at some carriage height that it
    // can reach now and from which the stow is clear; take the first step and stow from there next time round
    const inter=readyCands(u).concat(BANK[u.hang?'hang':'stand'],u.escape?[u.escape.q]:[]), ys=[u.yb].concat(strokeYs(u)); const q0=u.q.slice(), y0=u.yb;
    for(const qi of inter) for(const yi of ys){ const r1=planPath(u,qi,yi,u.zb,0,false,o,null,0.01); if(!r1.ok) continue;
      const qe=r1.legs[r1.legs.length-1].q1; u.q=qe.slice(); u.yb=yi; const r2=planPath(u,u.stowQ,parkY(u),SLIDE_Z0,0,false,o,null,0.01); for(let k=0;k<6;k++) u.q[k]=q0[k]; u.yb=y0;
      if(r2.ok){ u.res=r1.res; S.stepOut=(S.stepOut||0)+1; moveLegs(u,r1.legs,'home'); return; } } }
  if(u.phase==='wait'&&u.waitFor==='stow') setPhase(u,'wait',0.4); else startWait(u,'stow'); }
function stowUnits(){ for(const u of U){ if(u.fi>=0){ releaseTreeFruit(u); A.busy[u.fi]=false; u.fi=-1; } if(u.hold){ u.hold=false; spawnDrop(u); } u.fv=false; u.stemMode=null; u.grip=0; u.seat=0; u.blade=0; u.bsh=0; u.jig=0; u.beam=false; u.valve=false; u.roll=0; u.flipA=0; u.dropK=0; stowOne(u); } }
function spawnDrop(u){ /* a fruit still in the hand when the arms stow is set on the landing belt */ const P=placeTarget(u); spawnCarry(u,P); }
function allStowed(){ return U.every(u=>u.phase==='stowed'); }
function unstowUnits(){ for(const u of U){ setPhase(u,'idle',0); u.idleT=0; u.atHome=true; } }
function resetUnitsState(){ for(let i=0;i<NA;i++) A.busy[i]=false; }
// live audit: closest approach between cobots on a side, and any contact with the machine (no margins)
function audit(){ const R=U.map(u=>poseRes(u));
  for(let i=0;i<U.length;i++){ for(const c of R[i].caps){ if(c[7]!==3&&capStatic(c,U[i].s,0)){ S.hitsAM++; (S.hitLog=S.hitLog||[]).push([S.t.toFixed(1),U[i].lab,U[i].phase,(U[i].hist||[]).join('>'),c[7],c.slice(0,6).map(v=>v.toFixed(2)).join(',')]); break; } }
    for(let j=i+1;j<U.length;j++){ if(U[j].s!==U[i].s) continue; for(const a of R[i].caps) for(const b of R[j].caps){ const d=segDist(a,b)-a[6]-b[6]; if(d<S.minAA) S.minAA=d; } } } }
// ================================================================== power: what is running now, drawn from the 45 kWh pack
const BATT={nom:45.1,use:0.9,e:45.1*0.9,draw:0,avg:2.6,parts:{}};
const MOVING_PH=['move','carry','reloc','stow','home'], WORK_PH=['look','insert','grasp','check','seat','cut','search','roll','retract','place','release','flip'];
function energyStep(dt){ const P=BATT.parts; let cob=0, car=0, hand=0;
  for(const u of U){ const ph=u.phase; const mv=MOVING_PH.includes(ph);
    cob+=ph==='stowed'?0.045:(mv?0.27:(WORK_PH.includes(ph)?0.19:0.07)); car+=mv?0.11:0.015; hand+=['grasp','seat','cut','search','roll','release'].includes(ph)?0.03:0.006; }
  P.cobots=cob; P.carriages=car; P.hands=hand+0.09;                                   // + compressor for the blade and the valves
  P.drive=S.turn?1.3:(S.sg?(S.sgPh==='move'&&S.moving?0.6:0.015):(S.moving?0.05:0.015)); P.fruit=(S.flows.length||S.sorter.length?0.22:0.12)+(FL.car&&Math.abs((FL.car.hoist||0)-fillerTargets().h)>0.01?0.25:0.03);
  P.compute=0.45;   // 3 Jetson AGX Orin, IPC, 20 GMSL2 cameras + 8 wrist cameras, LiDARs, GNSS P.lights=S.night?0.42:0;
  let sum=0; for(const k in P) sum+=P[k]; BATT.draw=sum*1.06; BATT.e=Math.max(0,BATT.e-BATT.draw*dt/3600); BATT.avg+=(BATT.draw-BATT.avg)*Math.min(1,dt/300); }
// ================================================================== stop → scan → act (alternative to the continuous crawl)
// The machine steps one window length (2.0 m of the 2.1 m window per side), stops, scans for SG.scan s, then the cobots pick
// everything they can reach while it stands still. When no cobot has been working on a fruit for SG.idle s (or after SG.maxDwell),
// it steps again. Cobots only start picks while it stands; a pick in progress is always finished before it moves.
const SG={step:2.0,v:0.3,a:0.3,scan:1.5,idle:1.5,maxDwell:150};
function vNow(){ return S.sg?(S.sgPh==='move'?(S.sgV||0):0):S.crawl; }
function canClaim(){ return S.sg?(S.sgPh==='pick'&&!S.turn):S.moving; }
function sgStep(dt){ if(!S.sgPh){ S.sgPh='scan'; S.sgT=0; }
  S.sgT+=dt;
  if(S.sgPh==='move'){ const r=SG.step-S.sgDone; if(r<=1e-4){ S.sgV=0; S.sgPh='scan'; S.sgT=0; S.sgStops=(S.sgStops||0)+1; return; }
    S.sgV=Math.min(SG.v,Math.sqrt(2*SG.a*r),(S.sgV||0)+SG.a*dt); const d=Math.min(r,S.sgV*dt); S.sgDone+=d; S.hx+=DIR*d; S.spin+=DIR*d; S.sgMoveT=(S.sgMoveT||0)+dt; return; }
  if(S.sgPh==='scan'){ S.sgScanT=(S.sgScanT||0)+dt; if(S.sgT>=SG.scan){ S.sgPh='pick'; S.sgT=0; S.sgIdle=0; for(const u of U){ u.nextTry=0; u.backoff=0; } } return; }
  // pick: count how long no cobot has had a fruit on its hands
  S.sgPickT=(S.sgPickT||0)+dt; const busy=U.some(u=>u.fi>=0); S.sgIdle=busy?0:(S.sgIdle||0)+dt;
  if((S.sgIdle>=SG.idle&&S.sgT>0.5)||(S.sgT>=SG.maxDwell&&!busy)){ S.sgDwells=S.sgDwells||[]; S.sgDwells.push(S.sgT); S.sgPh='move'; S.sgT=0; S.sgDone=0; S.sgV=0; } }
// ================================================================== the step
function passFruit(){ // fruit leaving the rear edge of the windows: counted for the harvest share
  const ord=DIR>0?nearIdx:null, n=nearIdx.length;
  while(S.pp<n){ const i=DIR>0?nearIdx[S.pp]:nearIdx[n-1-S.pp]; const xr=(A.x[i]-S.hx)*DIR; if(xr>-1.12) break;
    S.pp++; if(S.skipPass) continue; S.passed++; if(A.state[i]===1||A.busy[i]) S.passPicked++; else if(A.state[i]===0) A.state[i]=3; } }
function step(dt){ S.t+=dt; dt_now=dt;
  S.hold=S.bufF+S.bufI>=FILL_BUF;
  if(S.hold&&!S.holdLogged){ S.holdLogged=true; logEvent('Filler buffer full: machine holds until a carrier docks'); } if(!S.hold) S.holdLogged=false;
  S.moving=!S.turn&&!S.hold;
  if(S.moving){ if(S.sg) sgStep(dt); else { const d=DIR*S.crawl*dt; S.hx+=d; S.spin+=d; } }
  if(S.turn){ turnStep(dt); if(S.sg){ S.sgPh=null; S.sgV=0; } }
  else if(DIR*S.hx>=S.rowEndX&&!S.banner) startTurn();
  for(const u of U) unitStep(u,dt);
  if(S.t-(S.auditT||0)>0.5){ S.auditT=S.t; audit(); }
  updateFlows(dt);
  // socks follow the pile (filler) and roll up for a swap
  // soft filler: the spiral follows the pile and nests for a swap; the hoist lifts the bin round it and lowers it as it fills.
  // A fresh bin goes up first (spiral nested), then the spiral comes down into it.
  { const c=FL.car, T=fillerTargets(), ct=S.sockTarget&&S.active?crateTarget():0;
    if(c){ const hs=0.09*dt, want=(FL.L>0.02&&T.h>(c.hoist||0))?(c.hoist||0):T.h; c.hoist=(c.hoist||0)+clamp(want-(c.hoist||0),-hs,hs); }
    const hoistOK=!c||Math.abs((c.hoist||0)-T.h)<0.02||T.h<(c.hoist||0); const Lt=hoistOK?T.L:Math.min(T.L,FL.L); FL.L+=clamp(Lt-FL.L,-0.25*dt,0.25*dt);
    if(FL.L>0.05&&S.flows.length) FL.spin+=dt*1.6;
    SOCKS.crate+=clamp(ct-SOCKS.crate,-0.4*dt,0.4*dt); }
  energyStep(dt);
  if(S.swapWhy&&canSwap()){ startSwap(S.swapWhy); S.swapWhy=null; }
  for(const c of CARS) carStep(c,dt);
  passFruit();
}

// ================================================================== headland crab turn
// The machine never rotates. At the row end it stows, drives out until it clears the canopy, turns all four swerve wheels
// 90°, crabs one row spacing sideways, turns them back and drives into the next alley the other way. The docked carrier rides
// along in the tunnel; the standby waits at the row end and follows once the headland lane is free.
const TURN_STEPS=['Pick out the row end','Stow the cobots','Drive out past the canopy','Steer the wheels 90°','Crab one row (3.1 m)','Steer back','Drive into the next alley','Unstow and pick'];
const TURN_V=0.5;
function headNeed(){ return CANOPY_END+0.15+M_LEN+0.1-ROW_END; }       // canopy overhang + clearance + machine length + margin
function laneBusy(sx){ return CARS.some(c=>c.mode!=='docked'&&c.role!=='standby'&&Math.sign(c.x)===sx&&Math.abs(c.x)>ROW_END-0.2&&c.z>ROAD_Z-0.5&&c.z<ZK(ALLEY+1)+1); }
function startTurn(){
  if(ALLEY>=N_ALLEY-1){ S.banner=1; S.playing=false; S.blockDone=true; $('play').textContent='Play'; showBanner('Block finished','All four alleys picked · press Reset to start again'); logEvent('Block finished'); return; }
  if(HEAD_W<headNeed()-1e-6){ S.banner=1; S.playing=false; showBanner(`Headland too narrow: ${HEAD_W.toFixed(1)} m`,`the crab turn needs ${headNeed().toFixed(2)} m (canopy ${CANOPY_OH} m + 0.15 m + machine ${M_LEN} m + 0.1 m) · widen it and press Play`); logEvent('Stopped at the row end: headland too narrow for the crab turn'); $('play').textContent='Play'; return; }
  S.turn={step:1,sx:DIR,t0:S.t,v:0,z1:ZK(ALLEY+1)}; logEvent(`Row end: picking out alley ${ALLEY+1}`); }
function driveTo(target,axis,dt){ const cur=axis==='x'?S.hx:S.hz, d=target-cur; if(Math.abs(d)<1e-3){ S.turn.v=0; return true; }
  const vmax=Math.min(TURN_V,Math.sqrt(2*0.5*Math.abs(d))); S.turn.v=Math.min(vmax,S.turn.v+0.5*dt); const s=Math.sign(d)*Math.min(Math.abs(d),S.turn.v*dt);
  if(axis==='x'){ S.hx+=s; S.spin+=s; } else { S.hz+=s; S.spin-=s; } return false; }
function steerM(a,dt){ if(Math.abs(S.steer-a)<1e-3){ S.steer=a; return true; } const r=Math.PI/2/T_STEER*dt; S.steer+=Math.sign(a-S.steer)*Math.min(r,Math.abs(a-S.steer)); return false; }
function turnStep(dt){ const T=S.turn, sx=T.sx;
  switch(T.step){
    case 1: if(U.every(u=>u.phase==='idle'&&!u.hold)||S.t-T.t0>8){ T.step=2; S.stowed=true; stowUnits(); } break;
    case 2: if(allStowed()&&!laneBusy(sx)) T.step=3; break;
    case 3: if(driveTo(sx*XHM,'x',dt)) T.step=4; break;
    case 4: if(steerM(Math.PI/2,dt)) T.step=5; break;
    case 5: if(driveTo(T.z1,'z',dt)){ buildAlley(ALLEY+1); S.pp=0; S.skipPass=false; T.step=6; logEvent(`Crabbed into alley ${ALLEY+1}`); } break;
    case 6: if(steerM(0,dt)) T.step=7; break;
    case 7: if(driveTo(sx*(ROW_X1+0.9),'x',dt)) T.step=8; break;
    case 8: S.stowed=false; unstowUnits(); S.rowEndX=rowEndX(); const tt=S.t-T.t0; S.turns.push(tt); S.turn=null; logEvent(`Headland turn done in ${tt.toFixed(0)} s`); break; }
}

// ================================================================== UI
const $=id=>document.getElementById(id);
const PH={idle:'idle',move:'move',look:'look',insert:'insert',grasp:'grasp',check:'check',seat:'seat V',cut:'cut',search:'search',roll:'twist',retract:'retract',carry:'carry',place:'set down',reloc:'to sock',flip:'flip',release:'release',stow:'stow',stowed:'stowed'};
let cellEls=[];
function buildCellUI(){ const L=$('cellsL'), R=$('cellsR'); L.innerHTML=''; R.innerHTML=''; cellEls=[];
  U.forEach(u=>{ const d=document.createElement('div'); d.className='cell'; d.innerHTML=`<b>${u.lab}</b><span>idle</span>`; (u.s>0?L:R).appendChild(d); cellEls.push(d); }); }
const carEls={};
for(const c of CARS){ const d=document.createElement('div'); d.className='carrier';
  d.innerHTML=`<div class="name"><span data-nm>Carrier ${c.name}</span><span class="pill" data-s>–</span></div>
  <span class="bl">bin</span><div class="bar"><i data-f style="width:0%"></i></div>
  <span class="bl">crate</span><div class="bar ind"><i data-c style="width:0%"></i></div>
  <span class="bl" data-n style="grid-column:1/-1"></span>`;
  $('carriers').appendChild(d); carEls[c.name]={pill:d.querySelector('[data-s]'),f:d.querySelector('[data-f]'),c:d.querySelector('[data-c]'),n:d.querySelector('[data-n]')}; }
function renderLog(){ $('log').innerHTML=S.events.map(([t,x])=>`<li><span>${fmtT(t)}</span><b>${x}</b></li>`).join(''); }
function showBanner(a,b){ const el=$('banner'); el.innerHTML=`${a}<small>${b}</small>`; el.hidden=false; }
function hideBanner(){ $('banner').hidden=true; S.banner=0; }
const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
const pct=(a,b)=>b>20?(a/b*100).toFixed(0):'–';
function updateUI(){
  $('o-t').textContent=fmtT(S.t); $('o-x').textContent=`${ALLEY+1}/${N_ALLEY} · ${S.hx.toFixed(1)} m`; $('o-v').textContent=S.moving?Math.round(vNow()*3600):0; $('o-sg').hidden=!S.sg||!!S.turn; if(S.sg) $('o-sg').lastChild.textContent=S.sgPh==='move'?'stepping 2 m':(S.sgPh==='scan'?'scanning':'picking');
  $('o-turn').hidden=!S.turn; if(S.turn) $('o-turn').lastChild.textContent=`${S.turn.step}/8`;
  $('o-hold').hidden=!S.hold; const bf=S.bufF+S.bufI; $('o-buf').hidden=bf===0; $('o-buf').lastChild.textContent=bf;
  document.querySelectorAll('#turn-steps li').forEach((li,i)=>li.classList.toggle('on',S.turn?S.turn.step===i+1:false));
  const win=Math.min(120,S.t), n=S.log.filter(t=>t>S.t-120).length; if(S.log.length>2000) S.log=S.log.filter(t=>t>S.t-130);
  $('f-rate').innerHTML=(win>5?n/win:0).toFixed(2)+'<small>/s</small>'; $('f-bintot').textContent=S.binnedTot.toLocaleString();
  $('f-share').innerHTML=pct(S.passPicked,S.passed)+'<small>%</small>';
  const lat=mean(S.lat); $('f-lat').innerHTML=(lat?lat.toFixed(1):'–')+'<small>s</small>';
  const busy=S.t>1&&U.length?U.reduce((a,u)=>a+u.busyT,0)/(U.length*S.t):0; $('f-busy').innerHTML=(busy*100).toFixed(0)+'<small>%</small>';
  $('f-succ').innerHTML=pct(S.picked,S.picked+S.fails)+'<small>%</small>'; $('f-roll').innerHTML=pct(S.rolls,S.picked+S.fails)+'<small>%</small>';
  $('f-buf').textContent=S.bufMax; $('f-sf').textContent=S.sortF.toLocaleString(); $('f-si').textContent=S.sortI.toLocaleString(); $('f-sq').textContent=S.sorter.length; $('f-sr').innerHTML=(SORT_V/SORT_PITCH).toFixed(1)+'<small>/s</small>';
  $('f-reach').innerHTML=pct(S.planOK,S.planTry-S.planBusy)+'<small>%</small>'; $('f-yaw').innerHTML=pct(S.yawed,S.planOK)+'<small>%</small>';
  const cy=mean(S.cyc), dv=mean(S.dv); $('f-cyc').innerHTML=(cy?cy.toFixed(2):'–')+'<small>s</small>'; $('f-dvt').innerHTML=(dv?dv.toFixed(2):'–')+'<small>s</small>';
  $('f-tturn').innerHTML=S.turns.length?fmtT(S.turns[S.turns.length-1]):'–';
  $('f-swap').innerHTML=(S.swaps.length?S.swaps[S.swaps.length-1].toFixed(0):'–')+'<small>s</small>'; $('f-trip').innerHTML=S.trips.length?fmtT(S.trips[S.trips.length-1]):'–';
  // hand D
  const np=S.picked; $('f-hcut').innerHTML=pct(S.cutsOK,np)+'<small>%</small>'; $('f-htw').innerHTML=pct(S.rollOK,np)+'<small>%</small>';
  $('f-hstalk').innerHTML=pct(S.cutsOK+S.stalkKept,np)+'<small>%</small>'; $('f-hsearch').textContent=S.searches;
  { const hu=follow.kind==='hand'?follow.u:null; document.querySelectorAll('#hand-steps li').forEach(li=>li.classList.toggle('on',!!hu&&li.dataset.p.split(',').includes(hu.phase))); }
  // soft filler
  { const c=FL.car; $('f-hoist').innerHTML=(c?(c.hoist||0):0).toFixed(2)+'<small>m</small>'; const b=S.active&&S.active.bin;
    const pile=b?0.12+(S.active.hoist||0)+BIN_FLOOR+Math.min(1,b.userData.fill/BIN_CAP)*BIN_DEPTH:null; const disc=BRIDGE_Y0-FL.L;
    $('f-drop').innerHTML=(pile!=null&&FL.L>0.05?Math.max(0,(disc-pile)*100).toFixed(0):'–')+'<small>cm</small>'; }
  // power
  { const f=BATT.e/(BATT.nom*BATT.use); $('batt-bar').style.width=(f*100).toFixed(1)+'%'; $('batt-txt').textContent=`${(f*100).toFixed(0)} % · ${BATT.e.toFixed(1)} of ${(BATT.nom*BATT.use).toFixed(1)} kWh usable`;
    $('f-pnow').innerHTML=BATT.draw.toFixed(2)+'<small>kW</small>'; $('f-pavg').innerHTML=BATT.avg.toFixed(2)+'<small>kW</small>';
    $('f-prun').innerHTML=(BATT.e/Math.max(0.5,BATT.avg)).toFixed(1)+'<small>h</small>'; $('f-pshift').innerHTML=(BATT.nom*BATT.use/Math.max(0.5,BATT.avg)).toFixed(1)+'<small>h</small>';
    const P=BATT.parts, nm={cobots:`${U.length} cobots (arm + controller)`,carriages:'Height carriages and slides',hands:'Hands, valves and compressor',drive:'Swerve drive and steering',fruit:'Belts, elevators, sorter, filler, hoist',compute:'Compute, cameras, LiDAR, GNSS',lights:'Work lights (night)'};
    $('loads').innerHTML=Object.keys(nm).map(k=>`<tr><td>${nm[k]}</td><td>${((P[k]||0)*1000).toFixed(0)} W</td></tr>`).join('')+`<tr class="tot"><td>Total, with 6 % conversion loss</td><td>${(BATT.draw*1000).toFixed(0)} W</td></tr>`; }
  U.forEach((u,i)=>{ const el=cellEls[i]; if(el&&el.dataset.p!==u.phase){ el.dataset.p=u.phase; el.lastChild.textContent=PH[u.phase]||u.phase; } });
  for(const c of CARS){ const e=carEls[c.name], act=c===S.active;
    e.pill.textContent=act?'docked · filling':(c.role==='standby'?'standby':(c.role==='docking'?'docking':(c.txt||'on trip')));
    e.pill.className='pill'+(act?' active':(c.role==='standby'?'':' away'));
    const bf=c.bin?c.bin.userData.fill:0, cf=c.crate?c.crate.userData.fill:0; e.f.style.width=Math.min(100,bf/BIN_CAP*100).toFixed(1)+'%'; e.c.style.width=Math.min(100,cf/CRATE_CAP*100).toFixed(1)+'%';
    const rate=Math.max(0.5,(win>30?n/win:2.0))*(1-IND_SHARE);
    e.n.textContent=c.bin?`${bf}/${BIN_CAP} fresh · ${cf}/${CRATE_CAP} industry`+(act?` · full in ≈ ${fmtT(Math.max(0,BIN_CAP-bf)/rate)}`:'')+(c.tTrip?` · away ${fmtT(S.t-c.tTrip)}`:''):'no bin'; }
}
// ---------------- callouts
const CALL=[['stereo','Row-following stereo (navigation)'],['c_zedLo','Depth: ZED X stereo, low, 35° ahead-outboard'],['c_zedHi','Depth: ZED X stereo, high'],['c_hdrT','Colour: 8 MP HDR, oblique view'],['c_stem','Colour: 8 MP HDR stem camera, 40° down'],['c_low','Colour: global shutter, under the canopy'],['c_wrist','Depth: wrist stereo, 4–100 cm'],['lidar','Safety LiDAR'],['gnss','RTK GNSS'],['sorter','Grading: 2 colour cameras over spinning rollers'],['cab','Wheel drive and steer electronics'],['hmi','HMI and e-stop'],
  ['filler','Soft filler: padded spiral into the bin'],['spreader','Turning padded spreader, 5 cm over the pile'],['batt','Sill battery 12.3 kWh LFP (each side)'],['podbatt','Pod battery drawer 5.1 kWh (×4)'],['charge','Charge inlet: 22 kW AC at the depot'],
  ['power','Power cabinet: BMS, DC/DC, 6 kW inverter, compute'],['air','Compressor + 6 L tank (blade cylinders)'],['chute','Industry: chute and sock to the crate'],['gate','Gate flaps open for fresh fruit'],['landing','Landing-belt lip: hanging cobots set fruit down'],['lip2','Funnel: standing cobots set fruit down'],['lowbelt','Low belt (tube and drop)'],['elev','Cup elevator'],['carLidar','Carrier LiDAR'],
  ['u_car','Height carriage: rack and pinion on the mast'],['u_slide','In/out slide under the base'],['u_base','Cobot base, J1'],['u_hand','Hand D: 3 fingers, fingertip cameras, pneumatic cutter'],['u_sock','Braked sock to the belt'],
  ['h_cut','Cutting finger: swings 170° off the deck onto the stem'],['h_blade','Bypass blade on the V: pneumatic, 128 N at the stem'],['h_fing','Finger A: fingertip camera, 26 N pad, self-locking screw'],
  ['h_cam','Head camera, ToF, LED ring'],['h_ft','Six-axis F/T sensor on the J6 flange'],['h_funnel','Catch funnel (pick and drop) → sock'],['h_valve','3/2 valve for the blade cylinder']];
const DETAIL_CO=['spreader','podbatt','charge','power','air'];   // shown only in their own views
const coEls={}; { const box=$('callouts'); for(const [k,t] of CALL){ const d=document.createElement('div'); d.className=k.startsWith('c_')?'co cam':'co'; d.innerHTML=`<i></i><span>${t}</span>`; box.appendChild(d); coEls[k]=d; } }
const sockAnchor=new THREE.Object3D(); H.add(sockAnchor);
function unitAnchors(){ const u=U[0]; if(!u) return; const set=(k,obj,x,y,z)=>{ let o=ANCH[k]; if(!o||o.parent!==obj){ if(o&&o.parent) o.parent.remove(o); o=new THREE.Object3D(); obj.add(o); ANCH[k]=o; } o.position.set(x,y,z); };
  set('u_car',u.V.car,u.e*(MAST_X-0.02),0.1,u.s*(MAST_Z+0.1)); set('u_slide',u.V.slide,0,0.0,u.s*0.1); set('u_base',u.V.fr[0],0,0,0.06); set('u_hand',u.V.handG,0,-0.06,0.05);
  const hu=follow.u||u, r=hu.V.hd.root; for(const [k,n] of [['h_cut','a_cut'],['h_blade','a_blade'],['h_fing','a_fing'],['h_cam','a_cam'],['h_ft','a_ft'],['h_funnel','a_funnel'],['h_valve','a_valve'],['c_wrist','a_wrist']]) ANCH[k]=r.getObjectByName(n);
  ANCH.u_sock=sockAnchor; coEls.u_base.querySelector('span').textContent=`${COBOTS[COBOT].name} base, J1`; }
const _v=new THREE.Vector3();
function updateCallouts(){ const r=canvas.getBoundingClientRect(), showC=$('callout').checked, showK=$('camlab').checked;
  if(U[0]&&DELIV!=='carry'){ const p=sockCurve(U[0],0.5); sockAnchor.position.set(p[0],p[1],p[2]); }
  for(const [k] of CALL){ const el=coEls[k], o=ANCH[k]; if(!o||(k==='u_sock'&&DELIV==='carry')||(follow.only?!follow.only.includes(k):DETAIL_CO.includes(k))){ el.style.display='none'; continue; }
    const isCam=k.startsWith('c_'); if(isCam?!showK:!showC){ el.style.display='none'; continue; }
    o.getWorldPosition(_v); const dist=_v.distanceTo(camera.position); _v.project(camera);
    const close=follow.kind==='hand'; const hk=k.startsWith('h_')||k==='c_wrist'; if(hk&&((k==='h_funnel'&&DELIV!=='drop')||(k==='h_valve'&&!XRAY))){ el.style.display='none'; continue; }
    const on=_v.z<1&&Math.abs(_v.x)<0.97&&Math.abs(_v.y)<0.95&&(hk?(close&&dist<0.9):isCam?(follow.only?follow.only.includes(k):(!close&&dist<9)):(k.startsWith('u_')?(!close&&dist<5):(!close&&dist<(k==='carLidar'?30:14))));
    const px=(_v.x+1)/2*r.width, py=(1-_v.y)/2*r.height, ie=$('inset'); const under=ie.style.display==='block'&&px<ie.offsetWidth+24&&py>r.height-ie.offsetHeight-24;
    el.style.display=on&&!under?'flex':'none'; if(on&&!under) el.style.transform=`translate(${(px-4).toFixed(1)}px,${(py-4).toFixed(1)}px)`; } }

// ---------------- notes and the design sheet
const EOAT_NOTE={direct:'Hand D on the ISO 50 flange: a six-axis F/T sensor, a short adapter and the ⌀104 mm housing put the fruit centre 200 mm out (1.35 kg in all). The cobot makes the last 100 mm itself at 0.3 m/s along a nearly level approach, J6 keeps the deck and cutter on top, and J6 is also the roll joint for twist and pull — no extra axis on the hand. The slide puts the base about 0.5 m from the fruit when it can.',
  tele:'A three-section telescope (400 mm retracted with the hand, +300 mm stroke at 1 m/s, 3.1 kg in all) makes the last 300 mm, so the arm itself stays further from the canopy. In this compact layout that is a poor trade: it costs payload (1.9 kg of the 5 kg left) and reach — the wrist sits ≈ 0.7 m back from the fruit, close to the side wall — so fewer picks can be planned and more need a yawed approach.'};
const DV_NOTE={carry:'The hand keeps its grip and sets the fruit down: hanging cobots on the outboard lip of the landing belt (1.95 m), standing cobots in a funnel on the side elevator (1.0 m), so neither tier reaches through the other’s band. Only one cobot at a time can use a set-down point, so cobots queue for it — the slowest of the three.',
  tube:'A foam cup on the wrist and a braked 1.25 m fabric sock hanging from it to a brush inlet below: the low belt for standing cobots (then the cup elevator), the landing-belt lip for hanging ones. After the cut the wrist flips the fruit into the cup (0.25 s) and lets go. Gravity only works downhill, so the cup must sit above the inlet and within one sock length of it; otherwise the arm moves there first (a planned, checked move).',
  drop:'The hand lets go where it picked: fingers B and C open, finger A tips 25° and the fruit rolls about 40 mm off its pad into a padded catch funnel slung under the fingers, then down the braked sock. No flip and no carry, so it is the fastest; the funnel hangs 140 mm below the hand, so a cut succeeds 15 % less often when a neighbour sits within 85 mm, and the planner checks the funnel against the machine as well.'};
const ARMS_NOTE={8:'Per side: two lift columns in the side wall, each with a standing cobot (base 0.82–1.50 m) for fruit below 1.55 m and a hanging cobot (base 2.25–2.95 m) above. Front and rear cobots split the window at the machine centre. Every move is planned and checked against the machine and against the paths the other three cobots on that side have reserved.',
  6:'Per side: a standing cobot on each column below 1.55 m, and one hanging cobot on the front column for everything above. The single upper cobot sees every upper fruit as the machine passes, but it is the bottleneck: slow the crawl.',
  4:'Per side: one standing cobot on each column, each carriage running the full 0.82–2.95 m. Every cobot covers every height; the machine has to crawl slowly.'};
function sheet(){ const n=U.length, M=COBOTS[COBOT], E=EOATS[EOAT];
  const parts=[['Portal frame, bridge, roof, shells',380,1.7],['4 swerve modules (hub + steer motor)',4*42,0.25],['LFP 45 kWh: 2 sill packs (low) + 4 pod drawers',2*82+4*40,0.4],
    [`Masts, racks, ${n} carriages and slides`,4*28+n*14,1.8],[`${n} × ${M.name} (${M.mass} kg)`,n*M.mass,U.length?mean(U.map(u=>u.hang?2.45:(n===4?1.5:1.05))):1.5],[`${n} × ${E.name.toLowerCase()} (${E.mass} kg)`,n*E.mass,1.8],
    ['Belts, elevators, sorter',110,1.5],['Power cabinet, compute, compressor, HMI',95,1.5],['Sensors and lights',25,3.2]];
  const tot=parts.reduce((a,p)=>a+p[1],0), cog=parts.reduce((a,p)=>a+p[1]*p[2],0)/tot;
  const tipL=Math.atan(WHEEL_Z/cog)*180/Math.PI, tipX=Math.atan(TOWER_X/cog)*180/Math.PI;
  const mc=M.mass+E.mass+14, F=mc*(9.81+AZ), Tq=F*0.025, Pz=F*VZ;
  const pw=[['Cobots, planning peak (all moving)',n*0.27],['Carriage and slide axes, peak',n*0.11],['Swerve drives, crab turn',1.3],['Belts, sorter, filler, hoist',0.5],['Compute (3 × Jetson AGX Orin), 28 cameras, sensors',0.45],['Hands and compressor',0.33],['Work lights',0.42]];
  const P=pw.reduce((a,p)=>a+p[1],0), cyc=mean(S.cyc);
  const rows=[];
  rows.push(['<b>Mass</b>','']); parts.forEach(p=>rows.push([p[0],Math.round(p[1])+' kg'])); rows.push(['Total, without a carrier',Math.round(tot)+' kg','tot']);
  rows.push(['Centre of mass height',cog.toFixed(2)+' m']); rows.push(['Static tip angle, sideways / lengthways',`${tipL.toFixed(0)}° / ${tipX.toFixed(0)}°`]); rows.push(['Wheel load, each',(tot*9.81/4000).toFixed(1)+' kN']);
  rows.push(['<b>Axes</b>','']);
  rows.push(['Payload used: hand + fruit (0.25 kg) of 5 kg',`<span class="${E.mass+0.25<=5?'ok':'bad'}">${(E.mass+0.25).toFixed(2)} kg</span>`]);
  rows.push([`Height carriage, ${mc.toFixed(0)} kg at ${AZ} m/s²`,`${F.toFixed(0)} N, ${Tq.toFixed(1)} N·m on a Ø50 pinion, ${Pz.toFixed(0)} W at ${VZ} m/s`]);
  rows.push([`In/out slide, ${(mc-4).toFixed(0)} kg at ${AY} m/s²`,`${((mc-4)*AY).toFixed(0)} N, ${Math.round((SLIDE_Z1-SLIDE_Z0)*1000)} mm stroke`]);
  rows.push(['<b>Power</b>','']); pw.forEach(p=>rows.push([p[0],p[1].toFixed(2)+' kW'])); rows.push(['Peak, everything at once',P.toFixed(1)+' kW','tot']); rows.push(['Average draw this run',BATT.avg.toFixed(2)+' kW']);
  rows.push(['Battery, usable of nominal',(BATT.nom*BATT.use).toFixed(1)+' of '+BATT.nom.toFixed(1)+' kWh']); rows.push(['Shift at the average draw',(BATT.nom*BATT.use/BATT.avg).toFixed(1)+' h']);
  rows.push(['Shift at a steady 5 kW / at 80 % capacity',`${(BATT.nom*BATT.use/5).toFixed(1)} h / ${(0.8*BATT.nom*BATT.use/5).toFixed(1)} h`]);
  rows.push(['<b>Footprint and cost</b>','']); rows.push(['Length × width stowed × height',`${M_LEN.toFixed(2)} × ${(2*STOW_W).toFixed(2)} × ${(ROOF_Y+0.2).toFixed(2)} m`]);
  rows.push(['Headland needed',headNeed().toFixed(2)+' m']);
  rows.push([`${n} cobots at list price`,M.price?`${(n*M.price).toLocaleString('en-GB')} € excl. VAT`:'price on request']);
  rows.push(['Capacity at the mean cycle',cyc?`${(n/cyc).toFixed(2)} fruit/s`:'–']);
  rows.push(['<b>Collision audit (this run)</b>','']); rows.push(['Closest arm-to-arm approach',S.minAA<9?(S.minAA*100).toFixed(1)+' cm':'–']); rows.push(['Arm-to-machine contacts',String(S.hitsAM||0)]);
  $('sheet').innerHTML=rows.map(r=>`<tr${r[2]?' class="tot"':''}><td>${r[0]}</td><td>${r[1]}</td></tr>`).join(''); }
function basisText(){ $('basis').textContent=`Orchard: four 62 m alleys at 3.1 m in tall spindle; fruit height N(1.50 m, 0.66 m), depth σ 0.16 m, 45 fruit per metre per face (≈ 57 t/ha at 195 g); detection ${P_DETECT*100} %. Each face is picked from its own alley. Every pick is planned with damped-least-squares IK on the real DH chain (position + tool axis, J6 free): the carriage sets the base 0.30 m below (standing) or above (hanging) the fruit, the slide sets the stand-off, and the approach comes nearly level (10° up), so a hanging fruit's stem lies along hand D's cutter side. A plan is rejected when the wrist centre falls within ${HD_MIN*100} cm of J1's axis (shoulder singularity), |sin q5| < ${SIN5_MIN} (wrist singularity), the elbow is nearly straight, or the elbow, links, wrist or tool enter the pods, masts, tunnel or sorter (boxes plus 5 cm). Yawing the approach up to 34° is the second fix after the slide. Joint moves at 180°/s, TCP ≤ 1 m/s, carriage ${VZ} m/s, slide ${VY} m/s. Hand D: look ${T_LOOK} s, grasp ${T_GRASP} s, stem check ${T_CHECK} s; stem seen ${P_STEM*100} % → seat ${T_SEAT} s, throat beam breaks ${P_CUT*100} % → cut ${T_CUT} s, otherwise a ±8° search (${T_SEARCH} s); stem hidden or not found → twist and pull: 10 mm pull, J6 rolls 70° (${T_ROLL} s, detaches ${P_ROLL*100} %, stalk kept ${K_ROLL*100} %). Every joint move is sampled every 0.08 rad and each sample turned into capsules (links, hand, carriage and slide); a move is accepted only if no capsule comes within 2 cm of the machine (side wall at |z| 0.76 m, columns, pods, elevator, funnel, belts, ground) and none comes within 5 cm of the capsules the other cobots on that side have reserved for what they are doing. Reservations shrink as a move proceeds. While a cobot tracks a fruit or sets one down, every IK step is checked again; if it would touch anything the pick is given up. A cobot whose way is blocked parks at the end of its stroke; the longest-waiting cobot has right of way. Every pick must also have a clear way back out. The fabric socks, branches and leaves are not collision-checked. Carriers 1.5 m/s on open ground, 0.5 m/s near bins, wheels steer 90° in ${T_STEER} s, hoist ${T_HOIST} s. Industry share ${IND_SHARE*100} %.`; }
function turnInfo(){ const need=headNeed(), ok=HEAD_W>=need-1e-6; $('f-need').innerHTML=need.toFixed(2)+'<small>m</small>'; $('f-need').parentElement.classList.toggle('goal',ok);
  $('f-wid').innerHTML=(2*STOW_W).toFixed(2)+'<small>m</small>';
  $('turn-note').innerHTML=`Nothing rotates. The machine drives out until its trailing end clears the last tree's canopy (${CANOPY_OH} m past the end post) by 0.15 m, turns its four swerve wheels 90°, crabs ${ROW} m and drives into the next alley the other way. It needs ${need.toFixed(2)} m of headland; this headland is ${HEAD_W.toFixed(1)} m — <span class="${ok?'ok':'bad'}">${ok?'the turn fits with '+((HEAD_W-need)*100).toFixed(0)+' cm to spare':'too narrow: the machine stops at the row end'}</span>. The carriers use the same lane (${(XH-ROW_END+CAR_HX).toFixed(2)} m deep) and the field road.`; }
{ const ol=$('turn-steps'); TURN_STEPS.forEach(t=>{ const li=document.createElement('li'); li.textContent=t; ol.appendChild(li); }); }
$('hand-note').textContent=`Hand D, as in the gripper study, on every cobot. It cuts whenever the stem can be seen and reached (${P_STEM*100} % of fruit): the cutting finger swings off the deck in ${T_SEAT} s, the throat beam must break before the valve may fire, and the pneumatic bypass blade (⌀16 × 20 cylinder, 2 : 1 purchase, 6 bar) puts about ${HCALC.Fb.toFixed(0)} N on the stem — ${(HCALC.Fb/60).toFixed(1)}× the 60 N a 3 mm stem needs — and cuts ${HCALC.cutH.toFixed(0)} mm above the cavity rim, so the stub sits below the shoulders and cannot puncture the neighbours in the bin. When the stem is hidden, too short or bent over the shoulder, the hand twists and pulls instead: 10 mm of pull, then J6 rolls the hand 70° with the grip raised to 32 N (${HCALC.gripMargin.toFixed(1)}× the stem torque); ${K_ROLL*100} % of twisted fruit keep their stalk. Each cut uses ${HCALC.air.toFixed(0)} cm³ of free air.`;
$('power-note').textContent=`45.1 kWh of LFP on a 51.2 V bus, all of it low: a 12.3 kWh sill pack along each side under the low belt, between the wheels (16 × 230 Ah prismatic cells), and a 5.1 kWh drawer pack in each corner pod (16 × 100 Ah). 90 % is used: 40.6 kWh. The load model sums what is running (cobots moving, working or holding; carriages; hands and compressor; drive, belts, filler, compute; lights at night). In this model a day of picking with eight cobots draws about 2.6 kW, so a full pack lasts about 15 h. It is sized for a steady 5 kW (slopes, wet ground, night lights, a hot compressor): 8.1 h on a new pack and 6.5 h at 80 % capacity late in its life, so the 6–8 h target holds either way. It charges at the depot in about 2 h on 22 kW AC. The carriers have their own 10 kWh packs.`;
$('car-note').textContent=`Each carrier (${CAR_L} × ${(2*CAR_HW).toFixed(2)} × ${CAR_H} m) carries one bin of ${BIN_CAP.toLocaleString('en-GB')} fruit and an industry crate of ${CRATE_CAP}. The filling one sits in the machine's 1.40 m tunnel, so machine plus carrier is only ${M_LEN} m long; the other follows ${GAP} m behind. When the bin or crate is full the filler spiral nests into the deck, the hoist lowers the bin, the crate sock rolls up, the full carrier drives forward out through the unpicked alley, and the standby docks from behind; up to ${FILL_BUF} fruit wait in the throats meanwhile. A docked carrier lifts its empty bin 0.45 m up round the filler spiral and lowers it as it fills. The full one crabs down the headland lane to the field road, drops bin and crate in a depot bay, picks up an empty pair, drives the road to the other end and comes back into the alley behind the machine — a one-way loop, so nothing ever has to pass anything in a 3.1 m alley.`;

// ---------------- controls
function readRadios(){ COBOT=document.querySelector('input[name=cob]:checked').value; EOAT=document.querySelector('input[name=eoat]:checked').value; DELIV=document.querySelector('input[name=dv]:checked').value; ARMS=+document.querySelector('input[name=arms]:checked').value; }
function applyConfig(){ readRadios(); for(const u of U){ if(u.fi>=0) A.busy[u.fi]=false; }
  for(let i=0;i<NA;i++) A.unr[i]=0; buildUnits(); if(S.stowed) for(const u of U) setPhase(u,'stowed',0);
  unitAnchors(); buildCellUI(); $('n-units').textContent=U.length; $('eoat-note').textContent=EOAT_NOTE[EOAT]; $('dv-note').textContent=DV_NOTE[DELIV]; $('arms-note').textContent=ARMS_NOTE[ARMS];
  S.planTry=S.planOK=S.yawed=0; S.cyc=[]; S.dv=[]; sheet(); }
document.querySelectorAll('input[name=cob],input[name=eoat],input[name=dv]').forEach(r=>r.addEventListener('change',applyConfig));
document.querySelectorAll('input[name=arms]').forEach(r=>r.addEventListener('change',()=>{ applyConfig(); const v={4:20,6:25,8:35}[ARMS]; $('crawl').value=v; $('crawl').dispatchEvent(new Event('input')); }));
$('play').addEventListener('click',()=>{ S.playing=!S.playing; if(S.playing&&S.banner){ hideBanner(); if(S.blockDone) resetAll(); } $('play').textContent=S.playing?'Pause':'Play'; });
document.querySelectorAll('input[name=ts]').forEach(r=>r.addEventListener('change',()=>{ S.ts=+r.value; }));
$('crawl').addEventListener('input',e=>{ S.crawl=e.target.value/3600; $('crawl-o').textContent=e.target.value+' m/h'; });
$('headw').addEventListener('input',e=>{ HEAD_W=+e.target.value; $('headw-o').textContent=HEAD_W.toFixed(1)+' m'; buildHeadlands(); depotReset(); turnInfo(); if(S.banner&&!S.blockDone&&HEAD_W>=headNeed()-1e-6){ hideBanner(); S.playing=true; $('play').textContent='Pause'; } });
$('swapnow').addEventListener('click',()=>{ if(canSwap()){ startSwap('a partly filled bin (manual)'); } else logEvent('Swap refused: no carrier standing by yet'); });
$('jumpend').addEventListener('click',()=>{ if(S.turn){ logEvent('Already turning'); return; } if(S.swap){ logEvent('Wait for the carrier swap to finish'); return; } jumpToEnd(); });
$('reset').addEventListener('click',()=>resetAll());
const TRAV_NOTE={cont:'The machine never stops: the depth and HDR colour cameras on the leading corner towers map the fruit ahead, the roof-edge and under-canopy cameras add views from above and below, and each cobot picks fruit that will stay in its window long enough, tracking them as they slide past. The crawl slider sets the speed.',
  sg:'The machine steps 2 m (one window), stops, scans for 1.5 s, and the cobots pick everything they can reach while it stands; it steps on once no cobot has had a fruit for 1.5 s. The crawl slider has no effect; the average speed comes out of the picking. In the simulation this bins about 20 % less fruit per second than a continuous crawl at the same share picked (see the project notes).'};
document.querySelectorAll('input[name=trav]').forEach(r=>r.addEventListener('change',()=>{ S.sg=r.value==='sg'&&r.checked; S.sgPh=null; S.sgV=0; for(const u of U){ u.nextTry=0; } $('trav-note').textContent=TRAV_NOTE[S.sg?'sg':'cont']; logEvent(S.sg?'Travel: stop → scan → act':'Travel: continuous crawl'); }));
$('trav-note').textContent=TRAV_NOTE.cont;
$('ghost').addEventListener('change',e=>{ foliage.forEach(f=>{ f.material.transparent=e.target.checked; f.material.opacity=e.target.checked?0.16:1; f.material.depthWrite=!e.target.checked; f.castShadow=!e.target.checked; f.material.needsUpdate=true; }); });
$('fov').addEventListener('change',e=>setFov(e.target.checked));
$('farrow').addEventListener('change',e=>{ FARHIDE=e.target.checked; for(let i=0;i<NA;i++) if(!A.near[i]) setApple(i,A.state[i]!==1); apples.instanceMatrix.needsUpdate=true; });
function jumpToEnd(t){ const tgt=t!=null?t:S.rowEndX-2.5; if(DIR*S.hx>=tgt) return; for(const u of U){ if(u.fi>=0){ A.busy[u.fi]=false; u.fi=-1; } if(u.hold){ u.hold=false; } setPhase(u,'idle',0); }
  const dx=DIR*tgt-S.hx; S.hx=DIR*tgt; S.skipPass=true; passFruit(); S.skipPass=false;
  for(const c of CARS){ if(c.mode==='join'&&Math.abs(c.z-S.hz)<1e-3) c.x=clamp(c.x+dx,-XH,XH); }
  logEvent('Jumped to 2.5 m before the row end (skipped fruit not counted)'); }
// night shift
const night={lights:[]};
{ for(const x of [0.5,-0.5]) for(const s of [1,-1]){ const L=new THREE.SpotLight(C(0xfff0d8),0,8,0.95,0.6,1.5); L.position.set(x,ROOF_Y,s*0.6); H.add(L); const t=new THREE.Object3D(); t.position.set(x*1.5,1.2,s*1.8); H.add(t); L.target=t; L.visible=false; night.lights.push(L); }
  for(const c of CARS) for(const sx of [1,-1]){ const L=new THREE.SpotLight(C(0xfff4e0),0,9,0.6,0.5,1.5); L.position.set(sx*0.9,1.2,0); c.g.add(L); const t=new THREE.Object3D(); t.position.set(sx*5,0,0); c.g.add(t); L.target=t; L.visible=false; night.lights.push(L); } }
function applyNight(on){ S.night=on; skyUni.top.value=C(on?0x0b1522:0x6f9fc8); skyUni.mid.value=C(on?0x1b2a3a:0xbfd6e4); skyUni.bot.value=C(on?0x121a14:0xe4e8e2);
  scene.fog.color=C(on?0x121c26:0xc4d6e0); sun.intensity=on?0.05:2.2; hemi.intensity=on?0.06:0.55; renderer.toneMappingExposure=on?1.25:1.0;
  for(const m of GLOW) m.emissiveIntensity=on?3.2:(m===MAT.beacon?0.8:1.1); for(const L of night.lights){ L.intensity=7; L.visible=on; } }
$('night').addEventListener('change',e=>applyNight(e.target.checked));

// ---------------- camera views
let follow={kind:'H'}, lastFollow=null;
const VIEWS={ over:{p:[4.2,4.6,1.1],t:[-0.3,1.5,0]}, side:{p:[0.6,1.9,3.3],t:[0,1.5,0.9]}, alley:{p:[6.5,1.9,0.05],t:[-1,1.4,0]}, top:{p:[0,13,0.01],t:[0,0,0]} };
function hs(){ return DIR; }
function focusUnit(){ return U.find(u=>u.s>0&&!u.hang)||U[0]; }
// the hand view follows a cobot that is about to pick (or picking), preferring a standing one on the camera side
function handUnit(){ const busy=U.filter(u=>['move','look','insert','grasp','check','seat','cut','roll'].includes(u.phase)); return busy.find(u=>!u.hang)||busy[0]||focusUnit(); }
function followPos(){ if(follow.kind==='hand'){ const u=follow.u; return u&&u.tcp?H.localToWorld(new THREE.Vector3(...u.tcp)):H.position.clone(); }
  if(follow.kind==='cobot'){ const u=follow.u; return H.localToWorld(new THREE.Vector3(u.bx,u.yb,u.s*u.zb)); }
  if(follow.kind==='car'){ return tripCar().g.position.clone(); } if(follow.kind==='fixed') return follow.pos.clone(); return H.position.clone(); }
function tripCar(){ return CARS.find(c=>c.mode==='legs'&&c.role==='trip')||CARS.find(c=>c.mode==='join'&&c.role!=='standby')||CARS.find(c=>c!==S.active)||CARS[0]; }
// the filler hangs inside the raised bin: in the filler view the bin and crate walls are drawn see-through
function seeThroughBins(on){ for(const m of [MAT.binSide,MAT.binDark,crateMat,crateDark]){ m.transparent=on; m.opacity=on?0.22:1; m.depthWrite=!on; m.needsUpdate=true; } }
function setGhost(on){ const el=$('ghost'); if(el.checked!==on){ el.checked=on; el.dispatchEvent(new Event('change')); } }
function setView(v,uu){ H.position.set(S.hx,0,S.hz); H.updateMatrixWorld(true); controls.minDistance=v==='hand'?0.12:0.5; const sd=hs(); const wasBatt=!!(follow.only&&(follow.only.includes('batt')||follow.only.includes('c_zedLo'))); if(follow.only&&follow.only.includes('c_zedLo')&&v!=='cams'){ $('fov').checked=false; setFov(false); } if(v==='cobot'||v==='hand') setGhost(true); else if(follow.kind==='cobot'||follow.kind==='hand'||wasBatt) setGhost(false); seeThroughBins(v==='filler');
  if(VIEWS[v]){ const V=VIEWS[v]; follow={kind:'H'}; camera.position.copy(H.position).add(new THREE.Vector3(V.p[0]*sd,V.p[1],V.p[2])); controls.target.copy(H.position).add(new THREE.Vector3(V.t[0]*sd,V.t[1],V.t[2])); }
  else if(v==='sorter'){ follow={kind:'H'}; camera.position.copy(H.position).add(new THREE.Vector3(1.25,2.55,-1.05)); controls.target.copy(H.position).add(new THREE.Vector3(0.12,1.45,0)); }
  else if(v==='cobot'){ const u=focusUnit(); follow={kind:'cobot',u}; const b=H.localToWorld(new THREE.Vector3(u.bx,u.yb,u.s*u.zb)); camera.position.copy(b).add(new THREE.Vector3(u.e*1.9,0.55,u.s*0.2)); controls.target.copy(b).add(new THREE.Vector3(0,0.3,u.s*0.3)); }
  else if(v==='hand'){ const u=uu||handUnit(); follow={kind:'hand',u}; unitAnchors(); const h=followPos(), e=u.V.fr[6].matrix.elements;
    // from the alley side: behind the hand and off to the side away from its column, a little above — clear of the canopy
    let zx=e[8], zz=e[10]; const l=Math.hypot(zx,zz)||1; zx/=l; zz/=l; let sx=zz, sz=-zx; if(sx*u.e<0){ sx=-sx; sz=-sz; }
    camera.position.copy(h).add(new THREE.Vector3(-zx*0.26+sx*0.2,0.12,-zz*0.26+sz*0.2)); controls.target.copy(h).add(new THREE.Vector3(-zx*0.03,0.01,-zz*0.03)); }
  else if(v==='cams'){ setGhost(true); const fx=DIR; follow={kind:'H',only:['c_zedLo','c_zedHi','c_hdrT','c_stem','c_low','stereo','lidar']}; $('fov').checked=true; setFov(true);
    camera.position.copy(H.position).add(new THREE.Vector3(fx*3.3,2.25,0.1)); controls.target.copy(H.position).add(new THREE.Vector3(fx*0.75,1.65,0.8)); }
  else if(v==='filler'){ follow={kind:'H',only:['filler','spreader','gate','chute']}; camera.position.copy(H.position).add(new THREE.Vector3(-1.3,1.1,0.42)); controls.target.copy(H.position).add(new THREE.Vector3(SP_AX-0.08,0.98,0)); }
  else if(v==='batt'){ setGhost(true); follow={kind:'H',only:['batt','podbatt','charge','power','air','cab']}; camera.position.copy(H.position).add(new THREE.Vector3(1.55,0.85,1.45)); controls.target.copy(H.position).add(new THREE.Vector3(-0.15,0.3,0.88)); }
  else if(v==='carrier'){ follow={kind:'car'}; const c=tripCar().g.position; camera.position.set(c.x-4.0*Math.sign(c.x||1),7.0,c.z+3.2); controls.target.set(c.x,0.6,c.z); }
  else if(v==='depot'){ const sx=DIR, x=sx*(ROW_END-6.5); follow={kind:'fixed',pos:new THREE.Vector3(x,0.4,DEPOT_Z)}; camera.position.set(x-sx*6.5,6.5,DEPOT_Z-8); controls.target.copy(follow.pos); }
  else if(v==='turn'){ const sx=S.turn?S.turn.sx:DIR, z=S.hz+ROW/2; follow={kind:'fixed',pos:new THREE.Vector3(sx*(ROW_END+1.2),0.8,z)}; camera.position.set(sx*(ROW_END-5.5),9.5,z-8.5); controls.target.copy(follow.pos); }
  controls.update(); lastFollow=followPos(); }
$('views').addEventListener('click',e=>{ const b=e.target.closest('button'); if(b) setView(b.dataset.v); });
$('sortview').addEventListener('click',()=>setView('sorter'));
$('fillview').addEventListener('click',()=>setView('filler')); $('battview').addEventListener('click',()=>setView('batt'));
$('handview').addEventListener('click',()=>{ const r=$('ts025'); r.checked=true; S.ts=0.25; setView('hand'); });
$('xray').addEventListener('change',e=>setXray(e.target.checked));
function resize(){ const r=canvas.parentElement.getBoundingClientRect(); renderer.setSize(r.width,r.height,false); camera.aspect=r.width/Math.max(1,r.height); camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(canvas.parentElement); resize();

// ================================================================== reset, boot, loop
function resetAll(){ for(let g=0;g<NG;g++){ G.state[g]=0; G.stemS[g]=1; setG(g,true); } buildAlley(0); FL.L=0; FL.car=null; FL.spin=0; BATT.e=BATT.nom*BATT.use; BATT.avg=2.6;
  Object.assign(S,{flagged:0,t:0,hz:ZK(0),turn:null,stowed:false,swap:null,swapWhy:null,sockTarget:1,bufF:0,bufI:0,bufMax:0,binned:0,binnedTot:0,indTot:0,log:[],lat:[],latMax:0,picked:0,passed:0,passPicked:0,fails:0,attempts:0,
    planTry:0,planOK:0,yawed:0,rolls:0,cutsOK:0,events:[],trips:[],swaps:[],turns:[],binsOut:0,flows:[],sorter:[],pp:0,cyc:[],dv:[],relocs:0,releases:0,banner:0,blockDone:false,steer:0,spin:0,minAA:9,hitsAM:0,auditT:0,lostWhy:{},sortF:0,sortI:0,lost:0,planBusy:0,waits:0,bufF:0,bufI:0,hidden:0,searches:0,rollOK:0,stalkCut:0,stalkKept:0,stalkLost:0,night:$('night').checked});
  S.hx=START_X(); S.rowEndX=rowEndX(); S.sgPh=null; S.sgV=0; S.sgStops=0; S.sgDwells=[]; hideBanner(); S.playing=true; $('play').textContent='Pause';
  for(const c of CARS){ for(const o of [c.bin,c.crate]) if(o&&o.parent) o.parent.remove(o); c.bin=c.crate=null; c.legs=[]; c.leg=null; c.v=0; c.lift=1; c.hoist=0; c.steer=0; c.tTrip=0; }
  depotReset();
  const a=CARS[0], b=CARS[1]; carAttach(a,makeBin(),makeCrate()); carAttach(b,makeBin(),makeCrate()); a.mode='docked'; a.role='active'; S.active=a; FL.car=a; a.x=S.hx; a.z=S.hz;
  b.mode='join'; b.role='return'; b.x=-DIR*XH; b.z=ROAD_Z; b.tTrip=0;
  SOCKS.crate=0; applyConfig(); renderLog(); logEvent(`Start: alley 1 of ${N_ALLEY}, ${U.length} cobots`); }
// ---------------- hand inspector: a second camera that sees only layer 1 (hand, fruit, stem, spur), following one hand
const insCam=new THREE.PerspectiveCamera(32,1.3,0.01,6); insCam.layers.set(1); let insU=null, insT=0;
scene.traverse(o=>{ if(o.isLight) o.layers.enable(1); });
const INS_PH=['move','look','insert','grasp','check','seat','cut','search','roll','retract','release','place','flip','carry','reloc'];
function inspUnit(){ if(follow.kind==='hand'&&follow.u) return follow.u;
  if(insU&&U.includes(insU)&&(INS_PH.includes(insU.phase)||S.t-insT<1.2)){ if(INS_PH.includes(insU.phase)) insT=S.t; return insU; }
  const c=U.filter(u=>['look','insert','grasp'].includes(u.phase)); insU=c.find(u=>!u.hang)||c[0]||insU||U[0]; insT=S.t; return insU; }
const _ip=new THREE.Vector3(), _it=new THREE.Vector3();
function renderInset(){ const el=$('inset'); if(!$('insp').checked||!U.length){ el.style.display='none'; return; }
  const r=canvas.getBoundingClientRect(), big=follow.kind==='hand', w=Math.round(big?Math.min(520,r.width*0.42):Math.min(330,Math.max(180,r.width*0.3))), hh=Math.round(w*0.76); el.style.display='block'; el.style.width=w+'px'; el.style.height=hh+'px';
  const u=inspUnit(), e=u.V.fr[6].matrix.elements, L=toolLen(u.ext); let zx=e[8], zz=e[10]; const l=Math.hypot(zx,zz)||1; zx/=l; zz/=l; let sx=zz, sz=-zx; if(sx*u.e<0){ sx=-sx; sz=-sz; }
  _it.set(e[12]+e[8]*(L-0.03),e[13]+e[9]*(L-0.03)+0.012,e[14]+e[10]*(L-0.03)); H.localToWorld(_it); _ip.copy(_it).add(new THREE.Vector3(sx*0.3+zx*0.07,0.14,sz*0.3+zz*0.07));
  insCam.position.copy(_ip); insCam.lookAt(_it); insCam.aspect=w/hh; insCam.updateProjectionMatrix();
  $('inset-lab').textContent=`Hand D · ${u.lab} · ${PH[u.phase]||u.phase}${u.stemMode==='cut'?' · stem cut':(u.stemMode==='full'?' · twisted off, stalk on':(u.stemMode==='none'?' · twisted off, no stalk':''))}`;
  const H0=r.height, pr=renderer.getPixelRatio(); renderer.setScissorTest(true); renderer.setViewport(12,12,w,hh); renderer.setScissor(12,12,w,hh);
  const bg=scene.background; scene.background=null; const au=renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate=false;
  renderer.setClearColor(S.night?0x1b2530:0xe9ede6,1); renderer.clear(); renderer.render(scene,insCam);
  scene.background=bg; renderer.shadowMap.autoUpdate=au; renderer.setScissorTest(false); renderer.setViewport(0,0,r.width,H0); }
function frame(now){
  if(window.__simHold){ last=now; requestAnimationFrame(frame); return; }
  const rdt=Math.min(0.1,(now-last)/1000); last=now;
  if(S.playing&&!S.banner){ let sim=rdt*S.ts; while(sim>0){ const h=Math.min(0.04,sim); step(h); sim-=h; } }
  H.position.set(S.hx,0,S.hz); for(const w of WHEELS){ w.sg.rotation.y=S.steer; w.sp.rotation.z=-S.spin/WHEEL_R; }
  for(const c of CARS) placeCar(c);
  poseUnits(); updateSocks(); setSocks();
  const bs=(S.playing&&!S.banner?rdt*S.ts:0)*BELT_V; BELTS.forEach(b=>b.step(bs)); ROLLERS.forEach(r=>{ r.rotation.y-=bs*SORT_V/BELT_V/0.017; });
  FLAPS.forEach((g,i)=>{ g.rotation.x=(i===0?-1:1)*smooth(Math.min(1,flapOpen*2))*1.2; });
  let nf=0,ni=0; for(const f of S.flows){ const ind=f.ind, m=ind?flowMesh.ind:flowMesh.fresh, idx=ind?ni++:nf++; if(idx>=FLOW_MAX||!f.pos) continue; dummy.position.set(f.pos[0],f.pos[1],f.pos[2]); dummy.rotation.set(0,0,0); dummy.scale.set(1,1,1); dummy.updateMatrix(); m.setMatrixAt(idx,dummy.matrix); }
  flowMesh.fresh.count=Math.min(nf,FLOW_MAX); flowMesh.ind.count=Math.min(ni,FLOW_MAX); flowMesh.fresh.instanceMatrix.needsUpdate=true; flowMesh.ind.instanceMatrix.needsUpdate=true;
  const fp=followPos(); if(window.__camTween){ lastFollow=fp; } else if(lastFollow){ const k=follow.kind==='hand'?0.25:(follow.kind==='cobot'?0.2:1); const d=fp.clone().sub(lastFollow).multiplyScalar(k); if(d.lengthSq()>0){ camera.position.add(d); controls.target.add(d); lastFollow.add(d); } } else lastFollow=fp;
  const sp=follow.kind==='fixed'?follow.pos:(follow.kind==='car'?fp:H.position); sun.position.set(sp.x+SUN_DIR.x*30,SUN_DIR.y*30,sp.z+SUN_DIR.z*30); sun.target.position.set(sp.x,0,sp.z);
  if(window.__beforeRender) window.__beforeRender(); controls.update(); renderer.render(scene,camera); renderInset(); updateCallouts();
  if(++uiTick%6===0) updateUI(); if(uiTick%120===0) sheet();
  if(!guarded){ frames++; acc+=rdt; if(frames===150){ guarded=true; if(acc/frames>0.04){ foliage.forEach(f=>f.castShadow=false); renderer.setPixelRatio(1); resize(); } } }
  requestAnimationFrame(frame); }
let last=performance.now(), frames=0, acc=0, guarded=false, uiTick=0;
turnInfo(); basisText(); resetAll(); setView('over');
requestAnimationFrame(frame);


window.__E={S,U,CARS,A,G,FL,BATT,TURN_STEPS,PH,setView,setGhost,setFov,applyNight,scene,renderer,sun,hemi,skyUni,H,camera,controls,SUN_DIR,jumpTo:jumpToEnd,followPos,resetAll,step,poseUnits,
 follow:()=>follow, setFollow:f=>{follow=f}, get ALLEY(){return ALLEY}, get DIR(){return DIR}, get HEAD_W(){return HEAD_W}, N_ALLEY, ZK, ROW_X0, ROW_X1, ROW_END, ROAD_Z, DEPOT_Z, BIN_CAP, CRATE_CAP, ROW};
window.dispatchEvent(new Event('sim-ready'));
})();

};
