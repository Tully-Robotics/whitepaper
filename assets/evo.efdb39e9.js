// The roadmap's three stages in the cards under the timeline, and large in #lab. The cards play short loops recorded from the
// simulation model (scripts/record-stages.mjs): the thinning robot (the machine's base and arms among young fruitlets), the
// harvesting system (the same machine with its fruit line and bin carriers) and the fleet in the neighbouring blocks.
// A click opens the lab: the live model itself, moved out from behind the page (story.js, window.__lab), to orbit and zoom,
// by day or by night, one stage at a time. Without a live model (no WebGL, reduced motion, still loading) the lab plays the loop.
(function(){
"use strict";
const evo=document.getElementById('evo'), lab=document.getElementById('lab');
if(!evo||!lab) return;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------- the cards: each loop plays while it is on screen
const vids=[...evo.querySelectorAll('.mini video')];
const io=!reduced&&window.IntersectionObserver&&new IntersectionObserver(es=>{ for(const e of es){
  if(e.isIntersecting&&!lab.open){ e.target.play().catch(()=>{}); } else e.target.pause(); } },{threshold:.2});
if(io) vids.forEach(v=>io.observe(v));
evo.addEventListener('click',e=>{ const b=e.target.closest('.mini'); if(b) open(b.dataset.stage); });

// ---------------- the lab
const tabs=[...lab.querySelectorAll('[role=tab]')], view=lab.querySelector('.view'), ctl=lab.querySelector('.ctl'),
  note=lab.querySelector('.note'), kit=lab.querySelector('.kitl'), hint=lab.querySelector('.hint');
const TEXT={
  thin:{kit:[['Base'],['Arms']],note:'Spring. The machine with its base and arms only, working along the row among young fruitlets. Thinning needs no fruit line and no bin, so this is the shortest way to market.'},
  harvest:{kit:[['Base'],['Arms'],['Fruit line','new'],['Bin carriers','new']],note:'Autumn. The same base and arms, plus the fruit line with its on-board sorter, and the bin carriers that take each full bin to the depot and bring an empty one.'},
  fleet:{kit:[['Harvesters'],['Neighbouring blocks','new']],note:'From year 5. The same machines working the alleys of the neighbouring blocks, region by region.'},
};
const lab3d=()=>window.__lab;
let cur=null, live3d=false, night=false, speed=1.5;
function seg(label,opts,get,set){ const g=document.createElement('div'); g.className='grp';
  g.innerHTML=`<span>${label}</span><div class="seg" role="group" aria-label="${label}"></div>`; const box=g.lastChild;
  for(const [t,val] of opts){ const b=document.createElement('button'); b.type='button'; b.textContent=t; b.setAttribute('aria-pressed',String(get()===val));
    b.onclick=()=>{ set(val); [...box.children].forEach((c,k)=>c.setAttribute('aria-pressed',String(opts[k][1]===val))); }; box.append(b); }
  return g; }
function controls(){ ctl.textContent=''; if(!live3d) return;
  ctl.append(seg('Light',[['Day',false],['Night',true]],()=>night,x=>{ night=x; lab3d().night(x); }));
  ctl.append(seg('Speed',[['1×',1],['1.5×',1.5],['5×',5]],()=>speed,x=>{ speed=x; lab3d().speed(x); }));
  const b=document.createElement('button'); b.type='button'; b.className='btn'; b.textContent='Reset view'; b.onclick=()=>lab3d().stage(cur); ctl.append(b); }
// without the live model: the stage's loop, large
function loop(stage){ view.querySelectorAll('video').forEach(v=>v.remove());
  const src=evo.querySelector(`.mini[data-stage="${stage}"] video`), v=src.cloneNode(true); v.muted=true; v.loop=true; v.playsInline=true;
  if(reduced) v.controls=true; view.prepend(v); if(!reduced) v.play().catch(()=>{}); }
function show(stage){ cur=stage;
  tabs.forEach(t=>t.setAttribute('aria-selected',String(t.dataset.stage===stage)));
  kit.innerHTML=TEXT[stage].kit.map(([t,c])=>`<i${c?` class="${c}"`:''}>${t}</i>`).join('<b>+</b>'); note.textContent=TEXT[stage].note;
  if(!live3d&&lab3d()&&lab3d().ready()) live3d=lab3d().open(view,stage);
  if(live3d){ view.querySelectorAll('video').forEach(v=>v.remove()); lab3d().stage(stage); lab3d().night(night); lab3d().speed(speed); }
  else loop(stage);
  view.classList.toggle('live',live3d); hint.hidden=!live3d; controls(); }
function open(stage){ vids.forEach(v=>v.pause()); lab.showModal(); show(stage); }
tabs.forEach(t=>t.addEventListener('click',()=>show(t.dataset.stage)));
lab.querySelector('.x').addEventListener('click',()=>lab.close());
lab.addEventListener('click',e=>{ if(e.target===lab) lab.close(); });   // a click on the backdrop
lab.addEventListener('close',()=>{ if(live3d) lab3d().close(); live3d=false; view.querySelectorAll('video').forEach(v=>v.remove());
  if(io) vids.forEach(v=>{ io.unobserve(v); io.observe(v); }); });
})();
