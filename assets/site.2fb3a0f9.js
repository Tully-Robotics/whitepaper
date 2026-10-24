(function(){
"use strict";
const $=id=>document.getElementById(id);
const fmt=(x,d=0)=>isFinite(x)?x.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'–';
const eur=x=>(x<0?'−':'')+Math.round(Math.abs(x)).toLocaleString('en-US')+' €';
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------- navigation: progress line and current section
const prog=$('wp-prog'), tocA=[...document.querySelectorAll('#wp-toc a')];
function onScroll(){ const h=document.documentElement; const p=h.scrollTop/(h.scrollHeight-h.clientHeight); prog.style.width=(p*100).toFixed(2)+'%'; scrollyTick(); }
addEventListener('scroll',onScroll,{passive:true});
const secs=tocA.map(a=>document.querySelector(a.getAttribute('href'))).filter(Boolean);
const so=new IntersectionObserver(es=>{ for(const e of es){ if(e.isIntersecting){ const id='#'+e.target.id; tocA.forEach(a=>a.classList.toggle('cur',a.getAttribute('href')===id)); } } },{rootMargin:'-45% 0px -50% 0px'});
secs.forEach(s=>so.observe(s));
// reveal: only blocks that start below the fold get the short rise
const ro=new IntersectionObserver(es=>{ for(const e of es){ if(e.isIntersecting){ e.target.classList.remove('pre'); ro.unobserve(e.target); } } },{rootMargin:'0px 0px -8% 0px'});
if(!reduced) document.querySelectorAll('.rv').forEach(el=>{ if(el.getBoundingClientRect().top>innerHeight){ el.classList.add('pre'); ro.observe(el); } });

// ---------------- problem teaser: a looping clip from the simulation; still frame for reduced motion, paused off screen
(function(){ const v=$('wp-teaser'); if(!v) return;
  if(reduced){ v.removeAttribute('autoplay'); v.pause(); v.controls=true; return; }
  const io=new IntersectionObserver(es=>{ for(const e of es){ if(e.isIntersecting){ const p=v.play(); if(p&&p.catch) p.catch(()=>{}); } else v.pause(); } },{threshold:0.15}); io.observe(v); })();
// ---------------- calculator (white-paper model for apples) and the live comparison with an assisted platform
// yield calibrated so the default plan reproduces the white paper's 227,909 € revenue; maintenance = 10 % of the system cost
const CW={mass:0.155,yield:51.87751,days:133,op:6251,maint:0.10};
const PLAN={arms:8,sec:5.6,hrs:20,price:5576,cost:260000};
const AP={sys:0.9,hrs:10,tday:7,dha:7.4,price:6195};
function setPlan(){ $('wp-c-arms').value=PLAN.arms; $('wp-c-sec').value=PLAN.sec; $('wp-c-hrs').value=PLAN.hrs; $('wp-c-price').value=PLAN.price; $('wp-c-cost').value=PLAN.cost; calc(); }
function calc(){ const n=+$('wp-c-arms').value, s=+$('wp-c-sec').value, h=+$('wp-c-hrs').value, pr=+$('wp-c-price').value, cost=+$('wp-c-cost').value;
  $('wp-o-arms').textContent=n; $('wp-o-sec').textContent=s.toFixed(1)+' s'; $('wp-o-hrs').textContent=h+' h'; $('wp-o-price').textContent=eur(pr);
  $('wp-o-cost').textContent=eur(cost);
  const sys=s/n, tday=h*3600/sys*CW.mass/1000, dha=CW.yield/tday, ha=CW.days/dha, rev=ha*pr, mt=cost*CW.maint, gp=rev-CW.op-mt, mg=gp/rev, be=gp>0?cost/gp:Infinity;
  const tag=(good,txt)=>`<span class="vs ${good?'good':'bad'}">${txt}</span>`;
  const o=[[fmt(ha,0)+' ha','worked per season',`<span class="vs">${CW.days} operating days</span>`],
    [eur(rev),'revenue per season',''],
    [eur(CW.op),'operation cost per season','<span class="vs">support, transport, energy</span>'],
    [eur(mt),'maintenance and machine','<span class="vs">10 % of the system cost</span>'],
    [eur(gp),'gross profit per season',tag(mg>=0.5,fmt(mg*100,0)+' % gross margin')],
    [isFinite(be)?fmt(be,1)+' seasons':'–','to break even per robot',tag(be<=2,'10+ years of service')]];
  $('wp-calc-out').innerHTML=o.map(x=>`<div><b>${x[0]}</b><span>${x[1]}</span>${x[2]}</div>`).join('');
  const R=[['Harvesting speed, whole system',AP.sys,sys,v=>fmt(v,2)+' s',1],['Operating hours per day',AP.hrs,h,v=>fmt(v,0)+' h',0],
    ['Harvested per day',AP.tday,tday,v=>fmt(v,1)+' t',0],['Days per hectare',AP.dha,dha,v=>fmt(v,1),1],['Cost per hectare to the farmer',AP.price,pr,v=>eur(v),1]];
  $('wp-bf').innerHTML=R.map(([t,a,b,f,lo])=>{ const mx=Math.max(a,b), better=lo?b<a:b>a;
    return `<div class="bf-r" role="row"><div class="bf-a" role="cell"><b>${f(a)}</b><i style="width:${(a/mx*100).toFixed(1)}%"></i></div><span class="bf-t" role="rowheader">${t}${lo?'<small>lower is better</small>':''}</span><div class="bf-b${better?'':' worse'}" role="cell"><i style="width:${(b/mx*100).toFixed(1)}%"></i><b>${f(b)}</b></div></div>`; }).join(''); }
['wp-c-arms','wp-c-sec','wp-c-hrs','wp-c-price','wp-c-cost'].forEach(id=>$(id).addEventListener('input',calc));
$('wp-calc-reset').addEventListener('click',setPlan);
setPlan();
// ---------------- allocation
(function(){ const A=[['Team and salaries',64,'var(--accent)'],['Prototyping and field testing',16,'var(--leaf)'],['External services',10,'var(--sky)'],['Company operations',8,'var(--muted)']];
  $('wp-stack').innerHTML=A.map(a=>`<i style="width:${a[1]}%;background:${a[2]}">${a[1]} %</i>`).join('');
  $('wp-alloc').innerHTML=A.map(a=>`<span><i style="background:${a[2]}"></i>${a[0]}</span>`).join(''); })();

// ---------------- competition: who has tried, apples and other fruits on two log-style scales
(function(){ const root=$('wp-mat'); if(!root) return; const det=$('wp-mat-d');
  const C={
    tully:{n:'Tully',crop:'Apples',a:'Mobile platform with off-the-shelf cobots on four rails; stem cutting; finished work sold as a service',s:'Vision pipelines and simulation built; first physical prototype in the coming thinning season'},
    ffr:{n:'FFRobotics',crop:'Apples',a:'Mobile platform with several telescopic arms and mechanical gripping; on-board conveyance; harvesting focus',s:'Field tested; experts and insiders report limited financial resources and limited performance'},
    tevel:{n:'Tevel',crop:'Apples and other tree fruit',a:'Picking drones flying from a mobile platform; selective harvesting by suction, fruit delivered into on-board bins',s:'Reported orchard deployments, for example apples for Unifrutti in Chile (2023); experts state limited compatibility with apple orchards'},
    abundant:{n:'Abundant Robotics',crop:'Apples',a:'Dedicated harvesting machine with computer vision, vacuum picking and fruit conveyance',s:'Closed in 2021 after too little commercial traction and unsuccessful fundraising'},
    afarm:{n:'Advanced Farm',crop:'Strawberries, then apples',a:'Mobile platform with robotic arms and suction gripping; on-board conveyance and bin filling',s:'Over $34M raised; CNH bought its assets and IP in 2025 after it failed to show commercialisation'},
    croo:{n:'Harvest CROO',crop:'Strawberries',a:'Autonomous harvester for field-grown strawberries',s:'2025 field trials reported harvesting speeds comparable to human pickers in a commercial operation'},
    agrobot:{n:'Agrobot',crop:'Strawberries',a:'Large platform with up to 24 independent picking arms, fruit perception and selective stem cutting',s:'Platform built; developing manipulation, navigation, vehicle and outdoor reliability at the same time proved hard (founder interview)'},
    picker:{n:'Picker Agrobotics',crop:'Avocado and citrus',a:'Flexible hollow arms on existing machinery; cut the stem and pass the fruit through the arm into the bin',s:'Four generations tested in orchards; customer pilots planned from January 2027'}
  };
  // stages on a log-style axis: each band wider than the one before
  const ST=['Research','Prototype','Field pilots','Scale-up','Commercial'];
  const B=[0,.2,.4,.6,.8,1].map(t=>(Math.pow(4,t)-1)/3*100);
  // [key, position %, row, closed]
  const SETS=[['Apples, the largest market',[['tully',18,0],['ffr',29,0],['abundant',34,1,1],['tevel',40,0],['afarm',47,1,1]]],
              ['Other fruits',[['picker',20,0],['agrobot',34,1],['tevel',40,0],['afarm',48,2,1],['croo',72,0]]]];
  let sel=null;
  function show(k){ sel=k; const c=C[k]; root.querySelectorAll('button.mc').forEach(b=>b.setAttribute('aria-pressed',b.dataset.k===k?'true':'false'));
    det.hidden=false; det.innerHTML=`<table><caption>${c.n} · ${c.crop}</caption><thead><tr><th scope="col">Approach</th><th scope="col">Status</th></tr></thead><tbody><tr><td>${c.a}</td><td>${c.s}</td></tr></tbody></table>`; }
  const stage=x=>{ for(let i=ST.length-1;i>=0;i--) if(x>=B[i]) return ST[i]; return ST[0]; };
  let idx=0;
  root.innerHTML=SETS.map(([lab,S])=>{ const rows=1+Math.max(...S.map(s=>s[2]));
    return `<div class="sc"><h5>${lab}</h5><div class="sc-lane" style="--rows:${rows}">${S.map(([k,x,r,dead])=>`<button type="button" class="mc${k==='tully'?' us':''}${dead?' dead':''}" data-k="${k}" data-st="${stage(x)}" aria-pressed="false" style="--x:${x}%;--r:${r};--d:${(idx++)*120}ms;--tx:-${x<12?15:x>80?85:50}%">${k==='tully'?'TULLY<i>.</i>':C[k].n}${dead?'<small>closed</small>':''}</button>`).join('')}</div>
      <div class="sc-bar">${ST.map((t,i)=>`<span style="width:${(B[i+1]-B[i]).toFixed(2)}%">${t}</span>`).join('')}<i class="sc-fill"></i></div></div>`; }).join('');
  root.querySelectorAll('button.mc').forEach(b=>b.addEventListener('click',()=>show(b.dataset.k)));
  const io=new IntersectionObserver(es=>{ for(const e of es){ if(e.isIntersecting){ root.classList.add('go'); io.disconnect(); } } },{threshold:0.35});
  if(reduced) root.classList.add('go'); else io.observe(root); })();

// =====================================================================================
// live diagrams
const DEFS=`<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="ah" d="M0 0L10 5L0 10z"/></marker><marker id="ahw" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="ahw" d="M0 0L10 5L0 10z"/></marker></defs>`;
const N=(id,x,y,w,h,t,s,c='')=>`<g class="nd ${c}" id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7"/>`+(s!=null?`<text class="t" x="${x+w/2}" y="${y+h/2-2}">${t}</text><text class="s" id="${id}-s" x="${x+w/2}" y="${y+h/2+12}">${s}</text>`:`<text class="t" x="${x+w/2}" y="${y+h/2+4.5}">${t}</text>`)+'</g>';
const L=(d,c='')=>`<path class="ar ${c}" d="${d}" marker-end="url(#${c.includes('fb')?'ahw':'ah'})"/>`;
const svg=(vb,body)=>`<svg class="dg" viewBox="${vb}" preserveAspectRatio="xMidYMid meet" role="img">${DEFS}${body}</svg>`;
let root=null; const q=id=>root&&root.querySelector('#'+id);
const on=(id,c,v)=>{ const e=q(id); if(e) e.classList.toggle(c,!!v); };
const tx=(id,t)=>{ const e=q(id); if(e&&e.textContent!==t) e.textContent=t; };
const BUSY=u=>!['idle','stow','stowed','wait'].includes(u.phase);
const PHN={idle:'f-idle',stow:'f-idle',stowed:'f-idle',wait:'f-idle',move:'f-tr',reloc:'f-tr',look:'f-ap',insert:'f-ap',grasp:'f-gr',check:'f-ve',seat:'f-se',search:'f-se',cut:'f-cu',retract:'f-re',release:'f-rl',place:'f-rl',flip:'f-rl',carry:'f-rl'};
const PHNUM={'f-idle':'·','f-tr':'1','f-ap':'2','f-gr':'3','f-ve':'4','f-se':'5','f-cu':'5','f-fl':'5','f-re':'6','f-rl':'7'};
const TURN0=['Pick out the row end','Stow the cobots','Drive out past the canopy','Steer the wheels 90°','Crab one row (3.1 m)','Steer back','Drive into the next alley','Unstow and pick'];
const KV=(items)=>items.map(([id,l])=>`<div><b id="${id}">–</b><span>${l}</span></div>`).join('');
let last={att:0,attT:-9}, pulse=0;
function rate60(S){ let n=0; for(let i=S.log.length-1;i>=0&&S.log[i]>S.t-60;i--) n++; return n/Math.min(60,Math.max(1,S.t)); }
function chips(y){ let s=`<text class="gl" x="20" y="${y-6}">all eight arms</text>`; for(let i=0;i<8;i++){ const x=20+i*46; s+=`<g class="chip" id="ch${i}"><rect x="${x}" y="${y}" width="42" height="22" rx="4"/><text x="${x+21}" y="${y+15}" id="ch${i}-t">–</text></g>`; } return s; }
function updChips(E,me){ E.U.slice(0,8).forEach((u,i)=>{ on('ch'+i,'busy',BUSY(u)); on('ch'+i,'me',u===me); tx('ch'+i+'-t',u.lab+' '+(PHNUM[PHN[u.phase]]||'·')); }); }
function followed(E){ const f=E.follow(); if(f.kind==='hand'&&f.u) return f.u; return E.U.find(BUSY)||E.U[0]; }

const D={
 sys:{t:'System at a glance',s:'stages light up as data moves through',
  build(){ const T=[['s0','Sensing & acquisition','8 canopy cameras · 32 in the hands'],['s1','Fruit detection','segmentation · depth · tracking'],['s2','World model','one state model of every apple'],['s3','Coordination','targets leased to arms'],['s4','Unit control ×8','IK · servoing · grasp'],['s5','Actuation','arms · rails · fruit line · base']];
    let b=''; T.forEach((t,i)=>{ b+=N(t[0],20,6+i*46,250,38,t[1],t[2]); if(i<5) b+=L(`M145 ${44+i*46} L145 ${52+i*46}`); });
    b+=`<g class="nd" id="s6"><rect x="284" y="6" width="98" height="268" rx="7"/><text class="t" x="333" y="30">Safety layer</text>`+['E-stops','certified scanner','force limits','watchdogs','TwinSAFE','independent of','the software'].map((l,i)=>`<text class="s" x="333" y="${58+i*24}">${l}</text>`).join('')+'</g>';
    b+=L('M284 252 L272 252','fb')+chips(304); return svg('0 0 400 332',b); },
  kv:[['k1','arms busy'],['k2','apples picked'],['k3','apples binned'],['k4','into bins, per s']],
  upd(E){ const S=E.S, busy=E.U.filter(BUSY).length; pulse=(pulse+1)%6; for(let i=0;i<4;i++) on('s'+i,'flow',i===pulse%4);
    if(S.attempts!==last.att){ last.att=S.attempts; last.attT=performance.now(); } on('s3','on',performance.now()-last.attT<700);
    on('s4','on',busy>0); on('s5','on',busy>0); tx('s2-s',`${fmt(S.picked)} picked · ${fmt(S.attempts)} attempts`); tx('s3-s',`${busy} of 8 arms with a target`);
    updChips(E,null); tx2('k1',busy+' / 8'); tx2('k2',fmt(S.picked)); tx2('k3',fmt(S.binnedTot)); tx2('k4',fmt(rate60(S),2)); }},
 map:{t:'Where the machine is',s:'live position in a 4-alley block, not to scale',
  build(){ return svg('0 0 400 168',`<g id="mapg"></g>`); },
  kv:[['k1','alley'],['k2','to the row end'],['k3','crawl speed'],['k4','travel']],
  upd(E){ const g=q('mapg'); if(!g) return; const S=E.S, xm=E.ROW_END+E.HEAD_W+3, z0=E.DEPOT_Z-1.2, z1=E.ZK(E.N_ALLEY-1)+E.ROW/2+1.2;
    const X=x=>14+(x+xm)/(2*xm)*372, Y=z=>8+(z-z0)/(z1-z0)*150;
    let s=`<line class="map-road" x1="${X(-xm)}" x2="${X(xm)}" y1="${Y(E.ROAD_Z)}" y2="${Y(E.ROAD_Z)}"/><text class="map-l" x="${X(-xm)+2}" y="${Y(E.ROAD_Z)-4}">field road and staging</text>`;
    for(let k=0;k<E.N_ALLEY;k++){ const zc=E.ZK(k); s+=`<rect class="${k<E.ALLEY?'map-done':'map-alley'}" x="${X(E.ROW_X0)}" y="${Y(zc-1.1)}" width="${X(E.ROW_X1)-X(E.ROW_X0)}" height="${Y(zc+1.1)-Y(zc-1.1)}" rx="2"/><text class="map-l" x="${X(E.ROW_X0)-3}" y="${Y(zc)+3}" text-anchor="end">${k+1}</text>`; }
    for(let k=0;k<=E.N_ALLEY;k++){ const z=E.ZK(k)-E.ROW/2; s+=`<line class="map-row" x1="${X(E.ROW_X0)}" x2="${X(E.ROW_X1)}" y1="${Y(z)}" y2="${Y(z)}"/>`; }
    for(const c of E.CARS){ if(c.mode==='docked') continue; s+=`<g class="badge"><circle cx="${X(c.x)}" cy="${Y(c.z)}" r="7"/><text x="${X(c.x)}" y="${Y(c.z)+3.5}">${c.name}</text></g>`; }
    const mx=X(S.hx), my=Y(S.hz), w=Math.max(8,X(1)-X(0))*1.9, h=Math.max(10,Y(1)-Y(0))*2.0;
    s+=`<rect class="map-m" x="${mx-w/2}" y="${my-h/2}" width="${w}" height="${h}" rx="2"/><path class="ar" d="M${mx+E.DIR*(w/2+3)} ${my} L${mx+E.DIR*(w/2+15)} ${my}" marker-end="url(#ah)"/>`;
    g.innerHTML=s;
    tx2('k1',`${E.ALLEY+1} / ${E.N_ALLEY}`); tx2('k2',S.turn?'turning':fmt(Math.max(0,S.rowEndX-E.DIR*S.hx),1)+' m'); tx2('k3',S.turn?fmt(S.turn.v*3600,0)+' m/h':fmt(+$('crawl').value,0)+' m/h'); tx2('k4',S.turn?'headland':(S.sgPh?'stop-go':'continuous')); }},
 perc:{t:'Perception pipeline',s:'one frame every 50–100 ms, eight cameras',
  build(){ const T=[['p0','Cameras','6 colour · 2 depth · wrist'],['p1','Segmentation','apple · stem · branch · leaf'],['p2','Tracking','stable ID per apple'],['p3','Characteristics','colour · size · defects'],['p4','Orientation','stem–calyx axis'],['p5','Selection gates','pick · industrial · next pass · skip'],['p6','Planning','approach vector · arm lease'],['p7','Control','visual servoing 30–60 Hz']];
    let b=''; T.forEach((t,i)=>{ b+=N(t[0],16,4+i*40,236,34,t[1],t[2]); if(i<7) b+=L(`M134 ${38+i*40} L134 ${44+i*40}`); });
    b+=`<g class="nd" id="pm"><rect x="270" y="84" width="114" height="154" rx="7"/><text class="t" x="327" y="106">State model</text>`+['apple ID','3D position','colour, size','stem axis','grade','approach'].map((l,i)=>`<text class="s" x="327" y="${128+i*18}">${l}</text>`).join('')+'</g>';
    for(const i of [2,3,4,5]) b+=L(`M252 ${21+i*40} L270 ${21+i*40}`);
    b+=`<circle class="dot" id="pdot" cx="134" cy="10" r="5"/>`; return svg('0 0 400 326',b); },
  kv:[['k1','apples picked'],['k2','pick attempts'],['k3','plans solved'],['k4','arms approaching']],
  upd(E){ const S=E.S, d=q('pdot'); const ph=(performance.now()%1600)/1600; if(d){ d.setAttribute('cy',(20+ph*290).toFixed(1)); }
    if(S.attempts!==last.att){ last.att=S.attempts; last.attT=performance.now(); }
    const ap=E.U.filter(u=>u.phase==='look'||u.phase==='insert').length;
    on('p5','flow',ph>0.6&&ph<0.75); on('p6','on',performance.now()-last.attT<800); on('p7','on',ap>0); on('p2','flow',ph>0.2&&ph<0.35); on('pm','flow',ph>0.2&&ph<0.7);
    tx2('k1',fmt(S.picked)); tx2('k2',fmt(S.attempts)); tx2('k3',S.planTry?fmt(S.planOK/S.planTry*100,0)+' %':'–'); tx2('k4',ap+' / 8'); }},
 fsm:{t:'Pick cycle of one arm',s:'highlight: the arm the camera follows',
  build(){ let b='';
    b+=N('f-idle',30,4,190,30,'Idle · waiting for a target');
    b+=N('f-tr',30,46,190,36,'1  Transit','to a 15–25 cm standoff')+L('M125 34 L125 46');
    b+=N('f-ap',30,94,190,36,'2  Approach','visual servoing')+L('M125 82 L125 94');
    b+=N('f-gr',30,142,190,36,'3  Grip','finger force check')+L('M125 130 L125 142');
    b+=N('f-ve',30,190,190,36,'4  Verify','colour of the hidden side')+L('M125 178 L125 190');
    b+=`<rect class="grp" x="18" y="236" width="366" height="94" rx="9"/><text class="gl" x="28" y="251">5  DETACH: CUT ONLY, NO TWIST AND PULL</text>`;
    b+=N('f-se',30,260,112,36,'Seat stem','in the V throat')+L('M85 226 L85 260');
    b+=N('f-cu',156,260,86,36,'Cut','guarded scissor')+L('M142 278 L156 278');
    b+=N('f-fl',260,260,112,36,'Skip & flag','hard case','fail')+`<path class="ar fb" d="M95 296 Q95 318 190 318 Q300 318 300 300" marker-end="url(#ah)"/><text class="gl" x="150" y="314">no seat / cut fails</text>`+L('M242 270 L260 270','fb');
    b+=N('f-re',30,344,190,36,'6  Retract','clear the branches')+L('M178 296 L178 344')+L('M316 296 L316 334 L208 334 L208 344','fb');
    b+=N('f-rl',30,392,190,36,'7  Release','into the soft tube')+L('M125 380 L125 392');
    b+=`<path class="ar" d="M30 410 L12 410 L12 19 L30 19" marker-end="url(#ah)"/>`;
    b+=N('f-bo',258,94,126,40,'Back off','retry once','fail')+L('M220 112 L258 112','fb')+L('M220 158 L240 158 L240 128 L258 128','fb');
    b+=N('f-lv',258,190,126,36,'Leave on tree','for the next pass','fail')+L('M220 208 L258 208','fb');
    b+=chips(452); return svg('0 0 400 480',b); },
  kv:[['k1','arm in view'],['k2','cuts'],['k3','flagged hard cases'],['k4','pick success']],
  upd(E,focus){ const S=E.S, u=followed(E); let id=PHN[u.phase]||'f-idle'; if(id==='f-re'&&u.flagged) id='f-fl';
    for(const k of ['f-idle','f-tr','f-ap','f-gr','f-ve','f-se','f-cu','f-re','f-rl']){ on(k,'on',k===id); on(k,'dim',focus==='detach'&&!['f-se','f-cu'].includes(k)&&k!==id); }
    on('f-fl','fail',id!=='f-fl'); on('f-fl','on',id==='f-fl');
    for(const k of ['f-bo','f-lv']) on(k,'dim',focus==='detach');
    tx('f-se-s',u.phase==='search'?'searching ±8°':'in the V throat'); updChips(E,u);
    const tot=S.picked+S.fails;
    tx2('k1',`${u.lab} · ${u.flagged&&u.phase==='retract'?'skip + flag':(E.PH[u.phase]||u.phase)}`); tx2('k2',fmt(S.cutsOK)); tx2('k3',fmt(S.flagged||0)); tx2('k4',tot?fmt(S.picked/tot*100,1)+' %':'–'); }},
 path:{t:'From hand to bin',s:'live fruit counts along the line',
  build(){ let b='';
    b+=N('p-h',110,4,180,36,'Hands ×8','')+L('M200 40 L200 50');
    b+=N('p-t',110,50,180,36,'Soft tubes','')+L('M200 86 L200 96');
    b+=N('p-b',110,96,180,36,'Buffer belt','')+L('M200 132 L200 142');
    b+=N('p-s',110,142,180,36,'360° sorter','')+L('M170 178 L110 204')+L('M230 178 L290 204');
    b+=N('p-pr',24,204,172,36,'Premium','spiral filler, gentle drop');
    b+=N('p-in',204,204,172,36,'Industrial','side container');
    b+=L('M110 240 L110 250')+L('M290 240 L290 250');
    b+=`<g class="nd" id="p-bin"><rect x="24" y="250" width="172" height="62" rx="7"/><text class="t" x="110" y="270">Premium bin</text><rect class="fillbar" x="40" y="280" width="140" height="12" rx="3"/><rect class="fill" id="p-binf" x="40" y="280" width="0" height="12" rx="3"/><text class="s" id="p-bin-s" x="110" y="306">–</text></g>`;
    b+=`<g class="nd" id="p-cr"><rect x="204" y="250" width="172" height="62" rx="7"/><text class="t" x="290" y="270">Industrial crate</text><rect class="fillbar" x="220" y="280" width="140" height="12" rx="3"/><rect class="fill ind" id="p-crf" x="220" y="280" width="0" height="12" rx="3"/><text class="s" id="p-cr-s" x="290" y="306">–</text></g>`;
    return svg('0 0 400 318',b); },
  kv:[['k1','apples binned'],['k2','in transit now'],['k3','industrial share'],['k4','bin swaps']],
  upd(E){ const S=E.S; let tube=0,belt=0,sort=0; for(const f of S.flows){ if(f.done) continue; if(f.stage==='sock') tube++; else if(f.stage==='sort') sort++; else belt++; }
    const hands=E.U.filter(u=>['grasp','check','seat','cut','roll','retract','release','search'].includes(u.phase)).length;
    tx('p-h-s',hands+' holding fruit'); tx('p-t-s',tube+' falling'); tx('p-b-s',belt+' on the belts'); tx('p-s-s',sort+' being graded'); tx('p-pr-s',S.swap?'bin swap: '+S.bufF+' wait in the throat':S.bufF+' waiting · spiral filler'); tx('p-in-s',S.bufI+' waiting');
    on('p-h','on',hands>0); on('p-t','on',tube>0); on('p-b','on',belt>0); on('p-s','on',sort>0); on('p-pr','flow',S.bufF>0); on('p-in','flow',S.bufI>0);
    const c=S.active, bf=c&&c.bin?c.bin.userData.fill/E.BIN_CAP:0, cf=c&&c.crate?c.crate.userData.fill/E.CRATE_CAP:0;
    const bw=q('p-binf'), cw=q('p-crf'); if(bw) bw.setAttribute('width',(140*Math.min(1,bf)).toFixed(1)); if(cw) cw.setAttribute('width',(140*Math.min(1,cf)).toFixed(1));
    tx('p-bin-s',S.swap?'swapping bins':`${fmt(bf*100,0)} % · ${fmt(c&&c.bin?c.bin.userData.fill:0)} apples`); tx('p-cr-s',`${fmt(cf*100,0)} % · ${fmt(c&&c.crate?c.crate.userData.fill:0)} apples`);
    tx2('k1',fmt(S.binnedTot)); tx2('k2',fmt(tube+belt+sort)); tx2('k3',S.binnedTot?fmt(S.indTot/S.binnedTot*100,0)+' %':'–'); tx2('k4',fmt(S.swaps.length)); }},
 cars:{t:'Bin units',s:'each badge is one autonomous bin unit',
  build(){ let b='';
    b+=N('c-d',18,16,166,46,'Docked','filling under the master');
    b+=N('c-t',216,16,166,46,'To staging','swap the full bin');
    b+=N('c-r',216,138,166,46,'Returning','back into the alley');
    b+=N('c-s',18,138,166,46,'Standby','following the master');
    b+=L('M184 39 L216 39')+L('M299 62 L299 138')+L('M216 161 L184 161')+L('M101 138 L101 62');
    b+=`<g id="c-bdg"></g><text class="gl" id="c-l0" x="18" y="214">–</text><text class="gl" id="c-l1" x="18" y="234">–</text>`;
    return svg('0 0 400 246',b); },
  kv:[['k1','active bin'],['k2','swaps so far'],['k3','last swap stop'],['k4','apples binned']],
  upd(E){ const S=E.S, pos={'c-d':[176,18],'c-t':[374,18],'c-r':[374,140],'c-s':[176,140]}, seen={};
    let bg=''; E.CARS.forEach((c,i)=>{ const n=c.mode==='docked'?'c-d':c.role==='standby'||c.mode==='idle'?'c-s':c.mode==='legs'?'c-t':'c-r'; seen[n]=1; const p=pos[n]; bg+=`<g class="badge"><circle cx="${p[0]-i*24}" cy="${p[1]+8}" r="10"/><text x="${p[0]-i*24}" y="${p[1]+11.5}">${c.name}</text></g>`;
      const fill=c.bin?Math.round(c.bin.userData.fill/E.BIN_CAP*100)+' %':'empty'; tx('c-l'+i,`Unit ${c.name}: ${c.txt||c.mode} · bin ${fill}`); });
    const g=q('c-bdg'); if(g) g.innerHTML=bg; for(const k in pos) on(k,'on',!!seen[k]);
    const a=S.active; tx2('k1',a&&a.bin?fmt(a.bin.userData.fill/E.BIN_CAP*100,0)+' %':'swapping'); tx2('k2',fmt(S.swaps.length)); tx2('k3',S.swaps.length?fmt(S.swaps[S.swaps.length-1],0)+' s':'–'); tx2('k4',fmt(S.binnedTot)); }},
 turn:{t:'Row-end turn',s:'steps of the headland manoeuvre',
  build(){ let b=''; TURN0.forEach((t,i)=>{ b+=`<g class="nd" id="t${i}"><rect x="20" y="${4+i*36}" width="360" height="30" rx="7"/><text class="s" x="40" y="${23+i*36}" style="text-anchor:middle">${i+1}</text><text class="t" id="t${i}-t" x="60" y="${23.5+i*36}" style="text-anchor:start">${t}</text></g>`; }); return svg('0 0 400 296',b); },
  kv:[['k1','status'],['k2','time in the turn'],['k3','last turn'],['k4','alley']],
  upd(E){ const S=E.S, st=S.turn?S.turn.step:0; for(let i=0;i<8;i++){ on('t'+i,'on',st===i+1); on('t'+i,'done',st>i+1); if(E.TURN_STEPS) tx('t'+i+'-t',E.TURN_STEPS[i]); }
    tx2('k1',S.turn?'turning':'picking'); tx2('k2',S.turn?fmt(S.t-S.turn.t0,0)+' s':'–'); tx2('k3',S.turns.length?fmt(S.turns[S.turns.length-1],0)+' s':'–'); tx2('k4',`${E.ALLEY+1} / ${E.N_ALLEY}`); }},
 energy:{t:'Energy',s:'live load by consumer',
  build(){ return `<div class="ebars" id="ebars"></div>`; },
  kv:[['k1','battery'],['k2','drawing now'],['k3','average draw'],['k4','runtime left']],
  upd(E){ const B=E.BATT, el=q('ebars'); if(!el) return; const NM={cobots:'Cobots',carriages:'Height carriages',hands:'Hands, valves, air',drive:'Drive and steering',fruit:'Belts, sorter, filler',compute:'Compute and sensors',lights:'Work lights'};
    const P=B.parts||{}, mx=Math.max(1.5,...Object.values(P)); const soc=B.e/(B.nom*B.use);
    el.innerHTML=`<div class="eb"><span>Battery</span><div class="tr"><i class="bt" style="width:${(soc*100).toFixed(1)}%"></i></div><span class="v">${fmt(soc*100,0)} %</span></div>`+Object.keys(NM).filter(k=>P[k]!=null).map(k=>`<div class="eb"><span>${NM[k]}</span><div class="tr"><i style="width:${(P[k]/mx*100).toFixed(1)}%"></i></div><span class="v">${fmt(P[k],2)} kW</span></div>`).join('');
    tx2('k1',fmt(soc*100,0)+' %'); tx2('k2',fmt(B.draw,2)+' kW'); tx2('k3',fmt(B.avg,2)+' kW'); tx2('k4',fmt(B.e/Math.max(0.3,B.avg),1)+' h'); }}
};
function tx2(id,t){ const e=$(id); if(e&&e.textContent!==t) e.textContent=t; }
let curD=null;
function showDiag(key){ if(curD===key) return; curD=key; const d=D[key]; $('wp-dtitle').textContent=d.t; $('wp-dsub').textContent=d.s; $('wp-dview').innerHTML=d.build(); root=$('wp-dview'); $('wp-dkv').innerHTML=KV(d.kv); }

// =====================================================================================
// scrolly: steps, scenes, simulation
const SCN=[
  {d:'sys'},{d:'map'},{d:'perc'},{d:'fsm'},{d:'fsm',focus:'detach'},{d:'path'},{d:'cars'},{d:'turn'},{d:'energy'}];
const steps=[...document.querySelectorAll('#wp-steps .st')], dots=$('wp-dots'), NS=steps.length;
dots.innerHTML=steps.map((s,i)=>`<button type="button" aria-label="Step ${i+1}"></button>`).join('')+`<span id="wp-stepn">1 / ${NS}</span>`;
const dotB=[...dots.querySelectorAll('button')];
dotB.forEach((b,i)=>b.addEventListener('click',()=>{ const tr=$('wp-steps-track'), top=$('wp-scrolly').getBoundingClientRect().top+scrollY; const span=tr.offsetHeight; scrollTo({top:top+span*(i+0.5)/NS-innerHeight*0.0,behavior:reduced?'auto':'smooth'}); }));
let cur=-1;
function scrollyTick(){ const sc=$('wp-scrolly'); if(!sc) return; const r=sc.getBoundingClientRect(), span=$('wp-steps-track').offsetHeight; const p=(-r.top)/span; const i=Math.max(0,Math.min(NS-1,Math.floor(p*NS))); if(i!==cur) setStep(i);
  if(!booted&&r.top<innerHeight*1.6&&r.bottom>-innerHeight) boot(); }
function setStep(i){ cur=i; steps.forEach((s,k)=>s.classList.toggle('on',k===i)); dotB.forEach((b,k)=>b.classList.toggle('on',k===i)); $('wp-stepn').textContent=`${i+1} / ${NS}`; showDiag(SCN[i].d); if(E&&warm) enter(i); }
showDiag('sys'); dotB[0].classList.add('on');

let E=null, booted=false, warm=false, tween=null, orbiting=false;
const URLS=['build/three.min.js','examples/js/controls/OrbitControls.js','examples/js/geometries/RoundedBoxGeometry.js','examples/js/environments/RoomEnvironment.js','examples/js/utils/BufferGeometryUtils.js'].map(p=>'vendor/three-0.128.0/'+p);
const load=u=>new Promise((res,rej)=>{ const s=document.createElement('script'); s.src=u; s.onload=res; s.onerror=rej; document.head.appendChild(s); });
async function boot(){ booted=true; const pl=$('wp-poster-l'); pl.textContent='Loading the simulation…';
  try{ for(const u of URLS) await load(u); }catch(e){ pl.textContent='The simulation could not load in this browser. The renderings below show the same model.'; return; }
  addEventListener('sim-ready',ready,{once:true}); try{ window.__runSim(); }catch(e){ pl.textContent='The simulation could not start in this browser.'; console.error(e); } }
function setChk(id,v){ const e=$(id); if(e&&e.checked!==!!v){ e.checked=!!v; e.dispatchEvent(new Event('change')); } }
function ready(){ E=window.__E; for(const id of ['callout','camlab','insp']) setChk(id,false);
  E.controls.enableZoom=false; E.controls.enablePan=false; if(matchMedia('(pointer: coarse)').matches) E.controls.enabled=false; E.controls.autoRotateSpeed=0.55;
  const cv=E.renderer.domElement; cv.style.touchAction='pan-y'; E.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5)); const r=cv.parentElement.getBoundingClientRect(); E.renderer.setSize(r.width,r.height,false);
  $('wp-poster-l').textContent='Starting the orchard…'; window.__simHold=true; E.jumpTo(-8); let n=0;
  (function warmup(){ for(let k=0;k<60;k++) E.step(0.04); n++; if(n<28) requestAnimationFrame(warmup); else { E.poseUnits(); warm=true; window.__simHold=false; $('wp-poster').classList.add('gone'); enter(cur<0?0:cur,true); hold(); } })(); }
// studio: only the machine and its docked bin unit, on a seamless floor
const st={prev:new Map(),floor:null,on:false};
function studio(v){ if(!E||st.on===v) return; st.on=v; const S=E.scene;
  if(v){ if(!st.floor){ st.floor=new THREE.Mesh(new THREE.PlaneGeometry(400,400),new THREE.MeshStandardMaterial({color:new THREE.Color(0xcdcfcb).convertSRGBToLinear(),roughness:0.92,metalness:0})); st.floor.rotation.x=-Math.PI/2; st.floor.position.y=0.0005; st.floor.receiveShadow=true; S.add(st.floor); }
    const hp=E.H.position; for(const c of S.children){ if(c===st.floor||c===E.H||c.isLight||c===E.sun.target) continue; let keep=false; for(const car of E.CARS) if(car.g===c&&Math.hypot(c.position.x-hp.x,c.position.z-hp.z)<1.0) keep=true; if(c.geometry&&c.geometry.type==='SphereGeometry'&&c.material&&c.material.uniforms) keep=true; if(!st.prev.has(c)) st.prev.set(c,c.visible); c.visible=keep; }
    st.floor.visible=true; E.skyUni.top.value=new THREE.Color(0xc9d0d4).convertSRGBToLinear(); E.skyUni.mid.value=new THREE.Color(0xecedea).convertSRGBToLinear(); E.skyUni.bot.value=new THREE.Color(0xecedea).convertSRGBToLinear(); E.scene.fog.color=new THREE.Color(0xecedea).convertSRGBToLinear(); E.scene.fog.near=14; E.scene.fog.far=42; E.hemi.intensity=0.7; }
  else { for(const [c,vv] of st.prev) c.visible=vv; st.prev.clear(); if(st.floor) st.floor.visible=false; E.skyUni.top.value=new THREE.Color(0x6f9fc8).convertSRGBToLinear(); E.skyUni.mid.value=new THREE.Color(0xbfd6e4).convertSRGBToLinear(); E.skyUni.bot.value=new THREE.Color(0xe4e8e2).convertSRGBToLinear(); E.scene.fog.color=new THREE.Color(0xc4d6e0).convertSRGBToLinear(); E.scene.fog.near=45; E.scene.fog.far=115; E.hemi.intensity=0.55; } }
function camGo(fn){ const p0=E.camera.position.clone(), t0=E.controls.target.clone(); fn(); E.controls.update(); if(reduced) return; const p1=E.camera.position.clone(), t1=E.controls.target.clone(), f0=E.followPos().clone();
  E.camera.position.copy(p0); E.controls.target.copy(t0); tween={p0,t0,p1,t1,f0,s:performance.now(),dur:1100}; window.__camTween=true; }
window.__beforeRender=function(){ if(!tween) return; const k=Math.min(1,(performance.now()-tween.s)/tween.dur), e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2, d=E.followPos().clone().sub(tween.f0);
  E.camera.position.lerpVectors(tween.p0,tween.p1.clone().add(d),e); E.controls.target.lerpVectors(tween.t0,tween.t1.clone().add(d),e); if(k>=1){ tween=null; window.__camTween=false; } };
function place(c,t){ const C=E.H.localToWorld(new THREE.Vector3(...c)), T=E.H.localToWorld(new THREE.Vector3(...t)); E.camera.position.copy(C); E.controls.target.copy(T); }
function ts(v){ E.S.ts=v; }
function base(){ E.controls.autoRotate=false; setChk('xray',false); if(E.S.night) setChk('night',false); }
function enter(i,first){ if(!E||!warm) return; const S=E.S; if(S.banner||S.blockDone){ E.resetAll(); E.jumpTo(-8); }
  base(); studio(i===0);
  switch(i){
    case 0: ts(1); camGo(()=>{ E.setView('over'); place([6.6*E.DIR,2.3,5.4],[0,1.45,0]); }); E.controls.autoRotate=true; break;
    case 1: ts(6); camGo(()=>E.setView('over')); break;
    case 2: ts(2); camGo(()=>E.setView('cams')); break;
    case 3: ts(0.5); camGo(()=>E.setView('hand')); break;
    case 4: ts(0.3); setChk('xray',true); camGo(()=>E.setView('hand')); break;
    case 5: ts(2); camGo(()=>E.setView('filler')); break;
    case 6: ts(6); if(!S.swap&&!S.turn) { const b=$('swapnow'); if(b) b.click(); } camGo(()=>E.setView('carrier')); break;
    case 7: ts(5); if(!S.turn){ if(E.ALLEY>=E.N_ALLEY-1){ E.resetAll(); } E.jumpTo(S.rowEndX+0.01); } camGo(()=>E.setView('turn')); break;
    case 8: ts(2); setChk('night',true); camGo(()=>E.setView('over')); break; } }
// hold the simulation while the stage is off screen
let visible=false; const vo=new IntersectionObserver(es=>{ visible=es[0].isIntersecting; hold(); },{threshold:0}); vo.observe($('wp-scrolly'));
function hold(){ if(E&&warm) window.__simHold=!visible; }
// 4 Hz: diagrams, status strip, keep the hand view on a working arm
let idleSince=0;
setInterval(()=>{ if(!E||!warm||!visible) return; const S=E.S, d=SCN[cur<0?0:cur];
  try{ D[d.d].upd(E,d.focus); }catch(e){}
  const m=Math.floor(S.t/60), s=Math.floor(S.t%60);
  $('wp-status').innerHTML=`<span class="sim">Simulation model</span><span>t <b>${m}:${String(s).padStart(2,'0')}</b></span><span>alley <b>${E.ALLEY+1}/${E.N_ALLEY}</b></span><span><b>${fmt(S.binnedTot)}</b> apples binned</span><span><b>${fmt(rate60(S),2)}</b>/s</span><span>${S.ts<1?'slow motion '+S.ts+'×':S.ts+'× speed'}</span>`;
  if(cur===3||cur===4){ const f=E.follow(); const u=f.kind==='hand'?f.u:null; if(u&&!BUSY(u)){ if(!idleSince) idleSince=performance.now(); else if(performance.now()-idleSince>2500&&!tween){ idleSince=0; camGo(()=>E.setView('hand')); } } else idleSince=0; }
  if(S.banner&&!S.turn){ E.resetAll(); E.jumpTo(-8); }
},250);
onScroll();
})();
