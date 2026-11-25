/* F7 play-along: the app's own drum and bass loop under a library song's chords, with a speed
   slider. Everything is made in the browser with Web Audio (uses ensureAudio, ctx, master and
   noiseBuf from core.js). No recording, melody or lyrics: only the song's chord progression and
   its strum style from js/data.js. Each chord lasts one bar of 4 beats, as on the Songs tab.

   Timing: a look-ahead scheduler on the audio clock, eighth-note steps. It sits behind a small
   clock interface (start/stop/setBpm/onTick) so F5's shared clock (js/clock.js, LGClock) can
   replace it: paClock() uses window.LGClock when it offers that interface. */

/* ---------- clock (fallback until js/clock.js lands) ---------- */
const PAFallbackClock=(function(){
  let timer=null, bpm=80, sub=2, next=0, step=0, subs=[];
  const AHEAD=0.12, EVERY=25;
  function stepDur(){ return 60/bpm/sub; }
  function pump(){
    while(next < ctx.currentTime+AHEAD){
      const t=next, s=step;
      subs.slice().forEach(fn=>{ try{ fn(t,s); }catch(e){ if(window.LGOps&&LGOps.logError) LGOps.logError("playalong tick",e); } });
      next+=stepDur(); step++;
    }
  }
  return {
    start(o){ o=o||{}; ensureAudio(); this.stop(); bpm=o.bpm||bpm; sub=o.subdivision||2; step=0; next=ctx.currentTime+0.08; pump(); timer=setInterval(pump,EVERY); },
    stop(){ if(timer) clearInterval(timer); timer=null; },
    setBpm(n){ bpm=n; },
    isRunning(){ return !!timer; },
    onTick(fn){ subs.push(fn); return ()=>{ subs=subs.filter(f=>f!==fn); }; }
  };
})();
function paClock(){
  const c=window.LGClock;
  if(c&&typeof c.start==="function"&&typeof c.stop==="function"&&typeof c.onTick==="function"&&typeof c.setBpm==="function") return c;
  return PAFallbackClock;
}

/* ---------- sounds ---------- */
function paKick(t,v){
  const o=ctx.createOscillator(), g=ctx.createGain(); o.type="sine";
  o.frequency.setValueAtTime(150,t); o.frequency.exponentialRampToValueAtTime(45,t+0.12);
  g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.9*v,t+0.004); g.gain.exponentialRampToValueAtTime(0.001,t+0.32);
  o.connect(g).connect(paBus.drums); o.start(t); o.stop(t+0.34);
}
function paNoise(t,dur,type,freq,q,vol){
  const s=ctx.createBufferSource(); s.buffer=noiseBuf;
  const f=ctx.createBiquadFilter(); f.type=type; f.frequency.value=freq; f.Q.value=q;
  const g=ctx.createGain(); g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(0.001,t+dur);
  s.connect(f).connect(g).connect(paBus.drums); s.start(t); s.stop(t+Math.min(dur+0.02,0.2));
}
function paSnare(t,v){
  paNoise(t,0.16,"highpass",1400,0.7,0.42*v);
  const o=ctx.createOscillator(), g=ctx.createGain(); o.type="triangle"; o.frequency.setValueAtTime(190,t);
  g.gain.setValueAtTime(0.25*v,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.08);
  o.connect(g).connect(paBus.drums); o.start(t); o.stop(t+0.1);
}
function paRim(t,v){ paNoise(t,0.05,"bandpass",2200,3,0.5*v); }
function paHat(t,v){ paNoise(t,0.045,"highpass",7000,0.8,0.16*v); }
function paShaker(t,v){ paNoise(t,0.07,"bandpass",5200,1.2,0.12*v); }
function paCount(t,hi){
  const o=ctx.createOscillator(), g=ctx.createGain(); o.type="square"; o.frequency.value=hi?1500:1000;
  g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.18,t+0.002); g.gain.exponentialRampToValueAtTime(0.001,t+0.05);
  o.connect(g).connect(paBus.click); o.start(t); o.stop(t+0.06);
}
const PA_NOTE={C:0,"C#":1,Db:1,D:2,"D#":3,Eb:3,E:4,F:5,"F#":6,Gb:6,G:7,"G#":8,Ab:8,A:9,"A#":10,Bb:10,B:11};
function paRootFreq(chord,fifth){
  const m=/^([A-G][#b]?)/.exec(chord||"G"); let n=m?PA_NOTE[m[1]]:7; if(fifth) n+=7;
  /* bass range E1 (41 Hz) to D#2 */
  let semis=((n-4)%12+12)%12; return 41.2*Math.pow(2,semis/12);
}
function paBass(t,chord,dur,fifth,v){
  const f=paRootFreq(chord,fifth);
  const o=ctx.createOscillator(); o.type="sawtooth"; o.frequency.value=f;
  const o2=ctx.createOscillator(); o2.type="sine"; o2.frequency.value=f;
  const lp=ctx.createBiquadFilter(); lp.type="lowpass"; lp.frequency.setValueAtTime(700,t); lp.frequency.exponentialRampToValueAtTime(220,t+dur); lp.Q.value=2;
  const g=ctx.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.32*v,t+0.01); g.gain.setValueAtTime(0.3*v,t+dur*0.7); g.gain.exponentialRampToValueAtTime(0.001,t+dur);
  o.connect(lp); o2.connect(lp); lp.connect(g).connect(paBus.bass);
  o.start(t); o2.start(t); o.stop(t+dur+0.02); o2.stop(t+dur+0.02);
}

/* ---------- grooves, one per strum style: 8 eighth-note steps per bar ----------
   k kick, s snare, r rim, h hat, z shaker; bass: R root, F fifth, - rest; length in steps */
const PA_GROOVES={
  Rock:  {k:"x---x-x-", s:"--x---x-", h:"xxxxxxxx", bass:"RRRRRRRR", blen:1},
  Basic: {k:"x---x---", s:"--x---x-", h:"x-x-x-x-", bass:"R---F---", blen:3},
  Folk:  {k:"x---x---", r:"--x---x-", z:"xxxxxxxx", bass:"R---F---", blen:2},
  Ballad:{k:"x-----x-", s:"----x---", h:"x-x-x-x-", bass:"R-----F-", blen:5},
  Island:{k:"----x---", r:"----x---", h:"-x-x-x-x", bass:"R--R-R--", blen:1.5},
  Percussive:{k:"x---x---", s:"--x---x-", h:"x-x-x-x-", bass:"R---R---", blen:2}
};

/* ---------- state ---------- */
let paBus=null;
let pa={open:false,song:null,chords:[],groove:null,pat:null,bpm:80,playing:false,unsub:null,parts:{drums:true,bass:true,guide:true},countIn:true,uiTimers:[]};
function paBuses(){
  if(paBus) return; ensureAudio();
  paBus={drums:ctx.createGain(),bass:ctx.createGain(),guide:ctx.createGain(),click:ctx.createGain()};
  paBus.drums.gain.value=0.75; paBus.bass.gain.value=0.9; paBus.guide.gain.value=0.55; paBus.click.gain.value=0.8;
  Object.values(paBus).forEach(b=>b.connect(master));
}
function paSetParts(){ if(!paBus) return; const r=ctx.currentTime;
  paBus.drums.gain.setTargetAtTime(pa.parts.drums?0.75:0,r,0.02);
  paBus.bass.gain.setTargetAtTime(pa.parts.bass?0.9:0,r,0.02);
  paBus.guide.gain.setTargetAtTime(pa.parts.guide?0.55:0,r,0.02);
}

/* the guide strum: the song's own strum pattern, quietly, on the guide bus */
function paGuide(t,chord,dir){
  const sh=(CHORDS[chord]||CHORDS.G).shape; let f=chordFreqs(sh); if(dir==="U") f=f.slice().reverse();
  const save=master; master=paBus.guide; /* pluck() connects to master */
  try{ f.forEach((fr,i)=>pluck(fr,t+i*0.012,dir==="U"?0.7:0.9)); } finally { master=save; }
}

/* one eighth-note step of the loop */
function paTick(t,step){
  const COUNT=pa.countIn?8:0; /* a one-bar count-in: 4 clicks */
  if(step<COUNT){ if(step%2===0){ paCount(t,step===0); paUi(t,{count:4-step/2}); } return; }
  const s=step-COUNT, i=s%8, bar=Math.floor(s/8), ci=bar%pa.chords.length, chord=pa.chords[ci];
  const g=pa.groove, sd=60/pa.bpm/2;
  if(g.k&&g.k[i]==="x") paKick(t,i===0?1:0.85);
  if(g.s&&g.s[i]==="x") paSnare(t,1);
  if(g.r&&g.r[i]==="x") paRim(t,1);
  if(g.h&&g.h[i]==="x") paHat(t,i%2?0.7:1);
  if(g.z&&g.z[i]==="x") paShaker(t,i%2?0.7:1);
  const b=g.bass[i]; if(b==="R"||b==="F") paBass(t,chord,sd*g.blen*0.95,b==="F",i===0?1:0.85);
  const d=pa.pat.steps[i]; if(d==="D"||d==="U") paGuide(t,chord,d);
  if(i%2===0) paUi(t,{ci:ci,beat:i/2,bar:bar});
}

/* draw at the moment the step sounds */
function paUi(t,info){
  const ms=Math.max(0,(t-ctx.currentTime)*1000);
  const h=setTimeout(()=>{ pa.uiTimers=pa.uiTimers.filter(x=>x!==h); paDraw(info); },ms);
  pa.uiTimers.push(h);
}
function paDraw(info){
  if(!pa.open) return;
  const st=document.getElementById("paStatus");
  if(info.count!=null){ if(st) st.textContent="Count-in: "+info.count; paMark(-1,-1); return; }
  if(st) st.textContent="Bar "+(info.bar+1)+"  ·  next: "+pa.chords[(info.ci+1)%pa.chords.length];
  paMark(info.ci,info.beat);
}
function paMark(ci,beat){
  document.querySelectorAll("#paChords .pach").forEach((el,i)=>el.classList.toggle("now",i===ci));
  document.querySelectorAll("#paBeats span").forEach((el,i)=>el.classList.toggle("on",i===beat));
}

/* ---------- controls ---------- */
function paPlay(){
  if(pa.playing) return;
  seqStop(); document.querySelectorAll(".play.playing").forEach(b=>{b.classList.remove("playing");b.innerHTML=PLAY_SVG;});
  paBuses(); paSetParts();
  const clk=paClock(); pa.unsub=clk.onTick(paTick); clk.start({bpm:pa.bpm,subdivision:2});
  pa.playing=true; paButtons();
}
function paStop(){
  const clk=paClock(); if(pa.unsub){ pa.unsub(); pa.unsub=null; } if(pa.playing) clk.stop();
  pa.uiTimers.forEach(clearTimeout); pa.uiTimers=[];
  pa.playing=false; paButtons(); paMark(-1,-1);
  const st=document.getElementById("paStatus"); if(st) st.textContent="Stopped";
}
function paToggle(){ pa.playing?paStop():paPlay(); }
function paButtons(){ const b=document.getElementById("paGo"); if(b){ b.innerHTML=pa.playing?STOP_SVG+" Stop":PLAY_SVG+" Play along"; b.classList.toggle("playing",pa.playing); } }
function paSpeed(v){ pa.bpm=+v; const o=document.getElementById("paBpm"); if(o) o.textContent=v; if(pa.playing) paClock().setBpm(pa.bpm); }
function paPart(k,btn){ pa.parts[k]=!pa.parts[k]; btn.classList.toggle("on",pa.parts[k]); paSetParts(); }
function paCountToggle(btn){ pa.countIn=!pa.countIn; btn.classList.toggle("on",pa.countIn); }

function openPlayAlong(encK){
  const k=decodeURIComponent(encK); const s=SONGS.find(x=>songKey(x)===k); if(!s) return;
  if(pa.playing) paStop();
  pa.song=s; pa.chords=s.progression.split("-").map(x=>x.trim()).filter(Boolean);
  pa.pat=PATTERNS.find(p=>p.id===s.strum)||PATTERNS[0];
  pa.groove=PA_GROOVES[s.strum]||PA_GROOVES.Basic;
  let ov=document.getElementById("paOverlay");
  if(!ov){ ov=document.createElement("div"); ov.id="paOverlay"; ov.className="paov"; ov.setAttribute("role","dialog"); ov.setAttribute("aria-modal","true");
    ov.addEventListener("click",e=>{ if(e.target===ov) closePlayAlong(); }); document.body.appendChild(ov); }
  const uniq=[...new Set(pa.chords)];
  const list=uniq.length>1? uniq.slice(0,-1).join(", ")+" and "+uniq[uniq.length-1] : uniq[0];
  ov.innerHTML='<div class="pacard">'
    +'<div class="patop"><div><div class="pak">Play along</div><h3>'+esc(s.title)+'</h3><div class="paa">'+esc(s.artist)+' &middot; '+esc(pa.pat.name||s.strum)+' feel</div></div>'
    +'<button class="paclose" onclick="closePlayAlong()" aria-label="Close">&times;</button></div>'
    +'<div class="pachords" id="paChords">'+pa.chords.map(c=>'<button class="pach" onclick="showChordPop(\''+esc(c)+'\')">'+esc(c)+'</button>').join("")+'</div>'
    +'<div class="pabeats" id="paBeats"><span>1</span><span>2</span><span>3</span><span>4</span></div>'
    +'<div class="pastatus" id="paStatus">One chord per bar of 4 beats. Strum along when the count-in ends.</div>'
    +'<button class="btn pago" id="paGo" onclick="paToggle()"></button>'
    +'<div class="patempo"><span>Slow</span><input type="range" min="50" max="140" step="1" value="'+pa.bpm+'" oninput="paSpeed(this.value)" aria-label="Speed"><span>Fast</span><b><span id="paBpm">'+pa.bpm+'</span> bpm</b></div>'
    +'<div class="paparts">'
      +'<button class="chip '+(pa.parts.drums?'on':'')+'" onclick="paPart(\'drums\',this)">Drums</button>'
      +'<button class="chip '+(pa.parts.bass?'on':'')+'" onclick="paPart(\'bass\',this)">Bass</button>'
      +'<button class="chip '+(pa.parts.guide?'on':'')+'" onclick="paPart(\'guide\',this)">Guide chords</button>'
      +'<button class="chip '+(pa.countIn?'on':'')+'" onclick="paCountToggle(this)">Count-in</button>'
    +'</div>'
    +'<div class="panote">A backing loop made by the app, arranged for '+esc(list)+'. Turn off Guide chords to play the chords yourself.</div>'
    +'</div>';
  paButtons(); pa.open=true; ov.classList.add("show");
}
function closePlayAlong(){ paStop(); pa.open=false; const ov=document.getElementById("paOverlay"); if(ov) ov.classList.remove("show"); }
document.addEventListener("keydown",e=>{ if(pa.open&&e.key==="Escape") closePlayAlong(); });
document.addEventListener("visibilitychange",()=>{ if(document.hidden&&pa.playing) paStop(); });
