/* ============ RENDER: STRUM ============ */
function renderStrumChord(){
  document.getElementById("strumChord").innerHTML=CHORD_ORDER.map(c=>
    `<button class="chip ${selectedStrumChord===c?'on red':''}" onclick="selectedStrumChord='${c}';renderStrumChord()">${c}</button>`).join("");
}
const BEATLBL=["1","&","2","&","3","&","4","&"];
function renderPatterns(){
  document.getElementById("patternList").innerHTML=PATTERNS.map((p,idx)=>{
    const nums=BEATLBL.map(n=>`<span>${n}</span>`).join("");
    const cells=p.steps.map((d,i)=>{const cls=d==="D"?"d":d==="U"?"u":d==="x"?"x":"r";const lbl=d==="-"?"&middot;":d;return `<div class="beat ${cls}" data-p="${idx}" data-i="${i}">${lbl}</div>`;}).join("");
    return `<div class="card" id="pat-${p.id}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
        <div><h3 style="font-size:19px">${p.name}</h3><div style="color:var(--muted);font-size:12.5px;margin-top:1px">${p.sub}</div></div>
        <button class="play" id="patbtn-${idx}" onclick="togglePattern(${idx})">${PLAY_SVG}</button>
      </div>
      <div class="beatnums">${nums}</div>
      <div class="grid8">${cells}</div>
      <p style="font-size:13px;line-height:1.55;color:#33302c;margin:8px 0 6px">${p.desc}</p>
      <div class="pill" style="font-size:11.5px"><b>Best for:</b> ${p.best}</div>
      <div class="tempo"><span style="font-size:12px;color:var(--muted)">Slow</span>
        <input type="range" min="50" max="130" value="90" oninput="patTempo[${idx}]=+this.value;document.getElementById('bpm-${idx}').textContent=this.value">
        <span style="font-size:12px;color:var(--muted)">Fast</span>
        <span style="font-size:12px;font-weight:700;width:54px;text-align:right"><span id="bpm-${idx}">90</span> bpm</span></div>
    </div>`;
  }).join("");
}
let patTempo=PATTERNS.map(()=>90);
function togglePattern(idx){
  const p=PATTERNS[idx];
  const playingThis=(seq.id==="pat:"+idx);
  document.querySelectorAll('[id^="patbtn-"]').forEach(b=>{b.classList.remove("playing");b.innerHTML=PLAY_SVG;});
  document.querySelectorAll(".beat.hit").forEach(b=>b.classList.remove("hit"));
  if(playingThis){seqStop();return;}
  const btn=document.getElementById("patbtn-"+idx); btn.classList.add("playing"); btn.innerHTML=STOP_SVG;
  const steps=p.steps.map(d=>({dir:d,chord:selectedStrumChord}));
  seqStart("pat:"+idx, steps, patTempo[idx], (i)=>{
    document.querySelectorAll(`.beat[data-p="${idx}"]`).forEach(b=>b.classList.remove("hit"));
    if(i>=0){const c=document.querySelector(`.beat[data-p="${idx}"][data-i="${i}"]`);if(c)c.classList.add("hit");}
  });
}
function goPattern(id){
  switchTab("strum");
  const elp=document.getElementById("pat-"+id);
  if(elp){elp.scrollIntoView({behavior:"smooth",block:"center"});elp.style.transition="box-shadow .3s";elp.style.boxShadow="0 0 0 2px var(--red)";setTimeout(()=>elp.style.boxShadow="",1200);}
}
