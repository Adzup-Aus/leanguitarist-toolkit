/* Shared state and storage, toast, audio and sequencer, shared render helpers,
   tab navigation. Loaded after data.js. Sign-in and sync live in js/account.js. */
/* ============ STATE / STORAGE ============ */
const LS={get:(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch(e){return d}},
          set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){} if(typeof k==="string"&&k.indexOf("ccf_")===0&&typeof onLocalWrite==="function"){onLocalWrite(k);}}};
let setlist=LS.get("ccf_setlist",[]);
let mySongs=LS.get("ccf_mysongs",[]);
let sbState={view:"list"}; let sbPopChord="";
let practiceDone=LS.get("ccf_practice",{});
let campfireDone=LS.get("ccf_campfire",{});
let selectedStrumChord="G";

const songKey=s=>s.title+"|"+s.artist+"|"+s.genre;
function toast(msg){const t=document.getElementById("toast");t.textContent=msg;t.classList.add("show");clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove("show"),1400);}

/* ============ AUDIO ============ */
let ctx, master, noiseBuf;
function ensureAudio(){
  if(ctx) { if(ctx.state==="suspended") ctx.resume(); return; }
  const AC=window.AudioContext||window.webkitAudioContext;
  ctx=new AC();
  master=ctx.createGain(); master.gain.value=0.85; master.connect(ctx.destination);
  const len=ctx.sampleRate*0.2; noiseBuf=ctx.createBuffer(1,len,ctx.sampleRate);
  const d=noiseBuf.getChannelData(0); for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
}
function chordFreqs(shape){const f=[];shape.forEach((fr,i)=>{if(fr!==null)f.push(OPEN[i]*Math.pow(2,fr/12));});return f;}
function pluck(freq,time,vel){
  const o=ctx.createOscillator(); o.type="triangle"; o.frequency.value=freq;
  const o2=ctx.createOscillator(); o2.type="sine"; o2.frequency.value=freq*2; o2.detune.value=4;
  const g=ctx.createGain(); const g2=ctx.createGain();
  g.gain.setValueAtTime(0,time); g.gain.linearRampToValueAtTime(0.16*vel,time+0.006);
  g.gain.exponentialRampToValueAtTime(0.0008,time+1.4);
  g2.gain.setValueAtTime(0,time); g2.gain.linearRampToValueAtTime(0.05*vel,time+0.006);
  g2.gain.exponentialRampToValueAtTime(0.0006,time+0.7);
  o.connect(g).connect(master); o2.connect(g2).connect(master);
  o.start(time);o.stop(time+1.45); o2.start(time);o2.stop(time+0.75);
}
function strum(chord,dir,time,vel){
  ensureAudio(); time=time||ctx.currentTime; vel=vel||1;
  const sh=(CHORDS[chord]||CHORDS.G).shape; let f=chordFreqs(sh); if(dir==="up")f=f.slice().reverse();
  f.forEach((fr,i)=>pluck(fr,time+i*0.013,vel*(dir==="up"?0.8:1)));
}
function chuck(time){
  ensureAudio(); time=time||ctx.currentTime;
  const s=ctx.createBufferSource(); s.buffer=noiseBuf;
  const bp=ctx.createBiquadFilter(); bp.type="bandpass"; bp.frequency.value=320; bp.Q.value=1.2;
  const g=ctx.createGain(); g.gain.setValueAtTime(0.14,time); g.gain.exponentialRampToValueAtTime(0.001,time+0.09);
  s.connect(bp).connect(g).connect(master); s.start(time); s.stop(time+0.12);
}

/* sequencer */
let seq={on:false,t:null,i:0,steps:[],bpm:90,hl:null,id:null};
function seqStop(){ if(seq.t)clearTimeout(seq.t); if(seq.hl)seq.hl(-1); const id=seq.id; seq={on:false,t:null,i:0,steps:[],bpm:90,hl:null,id:null}; return id; }
function seqStart(id,steps,bpm,hl){
  seqStop(); ensureAudio(); seq.on=true; seq.id=id; seq.steps=steps; seq.bpm=bpm; seq.hl=hl; seq.i=0;
  const tick=()=>{
    if(!seq.on)return;
    const st=seq.steps[seq.i%seq.steps.length];
    const t=ctx.currentTime+0.03;
    if(st.dir==="D")strum(st.chord,"down",t);
    else if(st.dir==="U")strum(st.chord,"up",t,0.85);
    else if(st.dir==="x")chuck(t);
    if(seq.hl)seq.hl(seq.i%seq.steps.length);
    seq.i++;
    seq.t=setTimeout(tick,(60/seq.bpm/2)*1000);
  };
  tick();
}

/* shared render helpers (chord box, escaping, play/stop icons) */
function chordSVG(shape){
  const W=126,H=150,x0=20,dx=17,y0=30,dy=26,frets=4;
  let s=`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
  s+=`<rect x="${x0}" y="${y0}" width="${dx*5}" height="${dy*frets}" fill="#fff"/>`;
  for(let f=0;f<=frets;f++){const y=y0+f*dy;s+=`<line x1="${x0}" y1="${y}" x2="${x0+dx*5}" y2="${y}" stroke="#cbb89a" stroke-width="${f===0?4:1.4}"/>`;}
  for(let i=0;i<6;i++){const x=x0+i*dx;s+=`<line x1="${x}" y1="${y0}" x2="${x}" y2="${y0+dy*frets}" stroke="#b9a98c" stroke-width="1.4"/>`;}
  for(let i=0;i<6;i++){const x=x0+i*dx,v=shape[i];
    if(v===null)s+=`<text x="${x}" y="${y0-7}" text-anchor="middle" font-size="13" fill="#b6ada0" font-family="Open Sans">x</text>`;
    else if(v===0)s+=`<circle cx="${x}" cy="${y0-11}" r="4.5" fill="none" stroke="#555" stroke-width="1.4"/>`;
  }
  for(let i=0;i<6;i++){const v=shape[i];if(v&&v>0){const x=x0+i*dx,y=y0+(v-0.5)*dy;s+=`<circle cx="${x}" cy="${y}" r="7.5" fill="#d30e0f"/>`;}}
  s+=`</svg>`; return s;
}
function esc(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
const PLAY_SVG=`<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
const STOP_SVG=`<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`;

/* ============ NAV ============ */
const TABS=[
 {id:"chords",label:"Chords",icon:`<path d="M6 3v13.5a3 3 0 1 0 2 2.8V8h9V5H8V3z"/>`},
 {id:"songs",label:"Songs",icon:`<path d="M4 6h13v2H4zm0 5h13v2H4zm0 5h9v2H4zM19 5v8.2a2.6 2.6 0 1 0 1.6 2.4V5z"/>`},
 {id:"songbook",label:"Songbook",icon:`<path d="M4 4h7a2 2 0 0 1 2 2v13a2 2 0 0 0-2-1.5H4zM20 4h-7a2 2 0 0 0-2 2v13a2 2 0 0 1 2-1.5h7z"/>`},
 {id:"strum",label:"Strum",icon:`<path d="M4 7h2v10H4zm4 2h2v6H8zm4-3h2v12h-2zm4 4h2v4h-2zm4-2h2v8h-2z"/>`},
 {id:"practice",label:"Practice",icon:`<path d="M19 3h-4.2A3 3 0 0 0 9.2 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm-7 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm-1.3 14.7l-3-3 1.4-1.4 1.6 1.6 3.9-3.9 1.4 1.4z"/>`},
 {id:"fingers",label:"Fingers",icon:`<path d="M9 11V4.5a1.5 1.5 0 0 1 3 0V10h1V2.5a1.5 1.5 0 0 1 3 0V11l2 1v6a4 4 0 0 1-4 4h-3a5 5 0 0 1-4.5-2.8L4 14s1-1.4 2.6-.6L8 14V5.5a1.5 1.5 0 0 1 3 0"/>`},
 {id:"ready",label:"Ready",icon:`<path d="M12 2l2.2 5.5L20 8l-4 4 1 6-5-2.8L7 18l1-6-4-4 5.8-.5z"/>`}
];
function renderNav(){
  document.getElementById("nav").innerHTML=TABS.map(t=>
    `<button id="nav-${t.id}" onclick="switchTab('${t.id}')"><svg viewBox="0 0 24 24" fill="currentColor">${t.icon}</svg><span>${t.label}</span></button>`).join("");
}
function switchTab(id){
  seqStop(); if(sbState&&sbState.timer){clearInterval(sbState.timer);sbState.scroll=false;} document.querySelectorAll(".play.playing,[id^='patbtn-'].playing").forEach(b=>{b.classList.remove("playing");b.innerHTML=PLAY_SVG;});
  document.querySelectorAll(".tab").forEach(s=>s.classList.remove("active"));
  document.getElementById("t-"+id).classList.add("active");
  TABS.forEach(t=>document.getElementById("nav-"+t.id).classList.toggle("on",t.id===id));
  window.scrollTo({top:0,behavior:"instant"});
}

