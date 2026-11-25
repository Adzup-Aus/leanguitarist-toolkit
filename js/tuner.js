/* F4: the guitar and bass tuner. Listens through js/mic.js; the notes are worked
   out here on the device and nothing is recorded or sent. Without the microphone
   ("Not now", switched off, blocked) it is a tap tuner: tap a string to hear its note.

   Entry point: openTuner() (also LGTuner.open()), and the address #tuner. */
(function(root){
  const INSTRUMENTS={
    guitar:{label:"Guitar",minHz:60,maxHz:500,strings:[
      {n:"E",o:2,f:82.41,name:"low E"},{n:"A",o:2,f:110.00,name:"A"},{n:"D",o:3,f:146.83,name:"D"},
      {n:"G",o:3,f:196.00,name:"G"},{n:"B",o:3,f:246.94,name:"B"},{n:"E",o:4,f:329.63,name:"high E"}]},
    bass:{label:"Bass",minHz:30,maxHz:250,strings:[
      {n:"E",o:1,f:41.20,name:"E"},{n:"A",o:1,f:55.00,name:"A"},{n:"D",o:2,f:73.42,name:"D"},{n:"G",o:2,f:98.00,name:"G"}]}
  };
  const NOTE_NAMES=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const IN_TUNE=5;            // cents either side that count as in tune
  const HOLD_MS=500;          // in tune this long, and the string gets its tick

  /* ---------- pitch detection (YIN), pure so it can be tested on its own ---------- */
  function detectPitch(buf,sr,minHz,maxHz){
    let n=buf.length, x=buf;
    /* Halve the sample rate for low notes: four times less work, same accuracy. */
    if(sr>=32000){
      const h=n>>1, y=new Float32Array(h);
      for(let i=0;i<h;i++) y[i]=(x[2*i]+x[2*i+1])*0.5;
      x=y; n=h; sr=sr/2;
    }
    /* Soften the high partials (two gentle low-pass passes): a real string's
       overtones run slightly sharp and would pull the reading up. */
    const k=Math.exp(-2*Math.PI*Math.min(sr*0.4,maxHz*2.5)/sr), y2=new Float32Array(n);
    let p1=0,p2=0;
    for(let i=0;i<n;i++){ p1=(1-k)*x[i]+k*p1; p2=(1-k)*p1+k*p2; y2[i]=p2; }
    x=y2;
    let rms=0; for(let i=0;i<n;i++) rms+=x[i]*x[i]; rms=Math.sqrt(rms/n);
    if(rms<0.006) return null;
    const tauMin=Math.max(2,Math.floor(sr/maxHz));
    const tauMax=Math.min(Math.ceil(sr/minHz),Math.floor(n/2));
    const W=n-tauMax-1;
    const d=new Float32Array(tauMax+2);
    for(let tau=1;tau<=tauMax+1;tau++){
      let s=0; for(let i=0;i<W;i++){ const v=x[i]-x[i+tau]; s+=v*v; } d[tau]=s;
    }
    /* cumulative mean normalised difference */
    const c=new Float32Array(tauMax+2); c[0]=1; let run=0;
    for(let tau=1;tau<=tauMax+1;tau++){ run+=d[tau]; c[tau]=run>0?d[tau]*tau/run:1; }
    /* The first clear dip is the note's period. "Clear" is measured against the
       deepest dip, so a slightly weaker first dip is not skipped for a later one
       (that would read the note an octave low). */
    let best=1; for(let t=tauMin;t<=tauMax;t++) if(c[t]<best) best=c[t];
    if(best>0.3) return null;
    const thr=Math.max(0.15,best+0.12);
    let tau=-1;
    for(let t=tauMin;t<=tauMax;t++){
      if(c[t]<thr){ while(t+1<=tauMax&&c[t+1]<c[t]) t++; tau=t; break; }
    }
    if(tau<0) return null;
    let better=tau;
    if(tau>1&&tau<tauMax+1){
      const a=c[tau-1],b=c[tau],e=c[tau+1],den=a+e-2*b;
      if(den!==0) better=tau+0.5*(a-e)/den;
    }
    return {freq:sr/better,clarity:1-c[tau],rms};
  }
  const centsOff=(f,ref)=>1200*Math.log2(f/ref);
  function noteOf(f){
    const m=Math.round(69+12*Math.log2(f/440));
    return {n:NOTE_NAMES[((m%12)+12)%12],o:Math.floor(m/12)-1};
  }
  function nearestString(f,strings){
    let best=0,bd=Infinity;
    strings.forEach((s,i)=>{ const d=Math.abs(centsOff(f,s.f)); if(d<bd){bd=d;best=i;} });
    return best;
  }

  const api={detectPitch,centsOff,noteOf,nearestString,INSTRUMENTS};
  if(typeof module!=="undefined"&&module.exports){ module.exports=api; }
  if(typeof document==="undefined") return;

  /* ---------- the screen ---------- */
  const INST_KEY="lg_tuner_inst";
  const st={open:false,inst:"guitar",auto:true,target:0,done:{},input:null,listening:false,paused:false,
    raf:0,lastRun:0,starting:false,startId:0,msg:"",goodAt:0,peak:0,peakAt:0,prevLvl:0,hist:[],lastHeard:0,inTuneSince:0,mutedUntil:0,pushed:false,opener:null,buf:null,shown:null};
  try{ const v=localStorage.getItem(INST_KEY); if(v&&INSTRUMENTS[v]) st.inst=v; }catch(e){}
  const $=id=>document.getElementById(id);
  const strings=()=>INSTRUMENTS[st.inst].strings;

  const MIC_SVG='<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-6a3.5 3.5 0 0 0-7 0v6A3.5 3.5 0 0 0 12 15zm6-3.5a6 6 0 0 1-12 0H4a8 8 0 0 0 7 7.9V22h2v-2.6a8 8 0 0 0 7-7.9z"/></svg>';
  function gaugeSvg(){
    let ticks="";
    for(let c=-50;c<=50;c+=10){
      const a=(c*1.2-90)*Math.PI/180, r1=c%50===0?66:72, r2=80;
      ticks+='<line x1="'+(100+r1*Math.cos(a)).toFixed(1)+'" y1="'+(100+r1*Math.sin(a)).toFixed(1)+'" x2="'+(100+r2*Math.cos(a)).toFixed(1)+'" y2="'+(100+r2*Math.sin(a)).toFixed(1)+'"/>';
    }
    const zone=(c)=>{const a=(c*1.2-90)*Math.PI/180;return (100+80*Math.cos(a)).toFixed(1)+' '+(100+80*Math.sin(a)).toFixed(1);};
    return '<svg class="tngauge" viewBox="0 0 200 112" aria-hidden="true">'+
      '<path class="tnzone" d="M100 100 L'+zone(-IN_TUNE)+' A80 80 0 0 1 '+zone(IN_TUNE)+' Z"/>'+
      '<g class="tnticks">'+ticks+'</g>'+
      '<text x="26" y="108" class="tnlbl">low</text><text x="174" y="108" class="tnlbl" text-anchor="end">high</text>'+
      '<g id="tnNeedle" class="tnneedle"><line x1="100" y1="100" x2="100" y2="26"/></g><circle cx="100" cy="100" r="6" class="tnhub"/></svg>';
  }
  function build(){
    let el=$("tunerView"); if(el) return el;
    el=document.createElement("div"); el.id="tunerView"; el.className="tnview";
    el.setAttribute("role","dialog"); el.setAttribute("aria-modal","true"); el.setAttribute("aria-labelledby","tnTitle");
    el.innerHTML='<div class="tnwrap">'+
      '<div class="tnbar"><button type="button" class="tnback" onclick="closeTuner()" aria-label="Close the tuner"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15.4 5.4 14 4l-8 8 8 8 1.4-1.4L8.8 12z"/></svg>Back</button>'+
        '<h2 id="tnTitle" tabindex="-1">Tuner</h2>'+
        '<button type="button" class="tnpriv" onclick="LGMic.openPrivacy()" aria-label="Microphone and privacy settings">'+MIC_SVG+'</button></div>'+
      '<div class="tninst" id="tnInst" role="group" aria-label="Instrument"></div>'+
      '<div class="tnmeter card">'+
        '<div class="tnnote" id="tnNoteBox"><span id="tnNote">E</span><sub id="tnOct">2</sub></div>'+
        gaugeSvg()+
        '<div class="tncents" id="tnCents">&nbsp;</div>'+
        '<div class="tnhint" id="tnHint" aria-live="polite"></div>'+
      '</div>'+
      '<div class="tnstrings" id="tnStrings" role="group" aria-label="Strings"></div>'+
      '<div class="tnmode" id="tnMode"></div>'+
      '<p class="tnfoot">Sound stays on this device. Nothing is recorded, saved or sent. <button type="button" class="tnlink" onclick="LGMic.openPrivacy()">Privacy settings</button></p>'+
      '</div>';
    el.addEventListener("keydown",e=>{ if(e.key==="Escape"&&!document.querySelector("#micSheet.show")) closeTuner(); });
    document.body.appendChild(el);
    return el;
  }
  function renderInst(){
    $("tnInst").innerHTML=Object.keys(INSTRUMENTS).map(k=>
      '<button type="button" class="chip'+(k===st.inst?" on":"")+'" aria-pressed="'+(k===st.inst)+'" onclick="LGTuner.setInst(\''+k+'\')">'+INSTRUMENTS[k].label+'</button>').join("")+
      '<button type="button" class="chip'+(st.auto?" on red":"")+'" aria-pressed="'+st.auto+'" onclick="LGTuner.setAuto()" title="Finds the string you play">Auto</button>';
  }
  function renderStrings(){
    const list=strings();
    $("tnStrings").className="tnstrings n"+list.length;
    $("tnStrings").innerHTML=list.map((s,i)=>{
      const cls="tnstr"+(i===st.target?" on":"")+(st.done[st.inst+i]?" done":"");
      const label=(st.done[st.inst+i]?"In tune: ":"")+s.name+" string, "+s.n+s.o+(st.listening?"":", tap to hear it");
      return '<button type="button" class="'+cls+'" id="tnS'+i+'" aria-label="'+label+'" onclick="LGTuner.pick('+i+')"><b>'+(i===list.length-1&&st.inst==="guitar"?"e":s.n)+'</b><small>'+(list.length-i)+'</small></button>';
    }).join("");
  }
  function renderMode(msg){
    if(msg!==undefined) st.msg=msg; msg=st.msg;   // the last message stays until the next renderAll
    const ms=LGMic.state();
    let h;
    if(st.listening){
      h='<div class="tnlisten"><i class="tndot" aria-hidden="true"></i><span>Listening. Play one string at a time.</span></div>'+
        '<button type="button" class="btn ghost tnmbtn" onclick="LGTuner.stopListening()">Stop listening</button>';
    } else {
      const why=msg||(st.paused?"Paused while you were away.":
        ms==="off"?"The microphone is off in your privacy settings.":
        ms==="blocked"?"Your browser is blocking the microphone.":
        ms==="unsupported"?"This browser can't share the microphone.":"");
      h='<p class="tntap">'+(why?'<b>'+why+'</b> ':'')+'Tap a string to hear its note, then turn the peg until your string sounds the same.</p>'+
        (ms==="unsupported"?'':'<button type="button" class="btn tnmbtn" onclick="LGTuner.listen()"'+(st.starting?' disabled':'')+'>'+MIC_SVG+(st.starting?'Starting...':st.paused?'Listen again':'Use the microphone')+'</button>');
    }
    $("tnMode").innerHTML=h;
  }
  function showTarget(){
    const s=strings()[st.target];
    $("tnNote").textContent=st.inst==="guitar"&&st.target===5?"e":s.n; $("tnOct").textContent=s.o;
  }
  function setNeedle(c,state){
    const n=$("tnNeedle"); if(!n) return;
    const cl=Math.max(-50,Math.min(50,c||0));
    n.style.transform="rotate("+(cl*1.2).toFixed(1)+"deg)";
    const box=$("tunerView"); box.classList.toggle("tnidle",state==="idle"); box.classList.toggle("tngood",state==="good");
  }
  function hint(text){ const h=$("tnHint"); if(h&&h.textContent!==text) h.textContent=text; }
  function idleHint(){
    if(st.listening){
      const left=strings().map((s,i)=>i).filter(i=>!st.done[st.inst+i]);
      if(!left.length) hint("All "+strings().length+" strings in tune. Nice work!");
      else hint(st.auto?"Play one string and let it ring.":"Play the "+strings()[st.target].name+" string and let it ring.");
    } else hint("Tap a string to hear it.");
    $("tnCents").innerHTML="&nbsp;"; setNeedle(0,"idle");
  }
  function renderAll(msg){ renderInst(); renderStrings(); renderMode(msg||""); showTarget(); idleHint(); }

  /* ---------- reference notes (tap mode, and tapping a string while listening) ---------- */
  function playNote(f){
    if(typeof ensureAudio!=="function") return;
    ensureAudio();
    const t=ctx.currentTime+0.02, dur=2.6, out=ctx.createGain();
    out.gain.setValueAtTime(0,t); out.gain.linearRampToValueAtTime(0.5,t+0.01); out.gain.exponentialRampToValueAtTime(0.001,t+dur);
    out.connect(master);
    /* Strong upper harmonics, so a bass note is heard on a phone speaker too. */
    [[1,0.5],[2,0.32],[3,0.18],[4,0.1]].forEach(([h,a])=>{
      const o=ctx.createOscillator(), g=ctx.createGain(); o.type=h===1?"triangle":"sine"; o.frequency.value=f*h;
      g.gain.value=a; o.connect(g).connect(out); o.start(t); o.stop(t+dur+0.05);
    });
    st.mutedUntil=performance.now()+(dur+0.3)*1000;   // don't tune to our own note
  }

  /* ---------- listening ---------- */
  async function listen(){
    /* Start the sound engine inside the tap itself: iPhones allow it only there. */
    if(typeof ensureAudio==="function") try{ensureAudio()}catch(e){}
    if(st.starting||st.listening) return;
    st.starting=true;
    try{ await startListening(); } finally { st.starting=false; if(st.open&&!st.listening) renderMode(); }
  }
  async function startListening(){
    st.paused=false;
    const ok=await LGMic.ask({title:"Let the tuner hear your guitar",
      text:"Play a string and the tuner shows whether it's too low, too high or in tune."});
    if(!st.open) return;
    if(!ok){ renderAll(); return; }
    const my=++st.startId;
    /* Opened without a tap (the #tuner address): the sound engine may wait for
       one. Check before the microphone is opened, and give it a tap to start. */
    if(typeof ensureAudio==="function"){
      ensureAudio();
      if(ctx.state!=="running") await Promise.race([ctx.resume().catch(()=>{}),new Promise(r=>setTimeout(r,400))]);
      if(my!==st.startId||!st.open) return;
      if(ctx.state!=="running"){ st.paused=true; renderAll("Tap to start listening."); return; }
    }
    let inp;
    try{
      inp=await LGMic.open({fftSize:8192,onEnd:reason=>{
        if(st.input!==inp) return;
        st.input=null; st.listening=false; cancelAnimationFrame(st.raf);
        if(!st.open) return;
        st.paused=reason==="hidden";
        renderAll(reason==="ended"?"The microphone stopped.":"");
      }});
    }catch(e){
      if(my!==st.startId||!st.open) return;
      if(e&&e.name==="AbortError"){ st.paused=true; renderAll(); return; }
      if(window.LGOps&&LGOps.logError) try{LGOps.logError("tuner",e)}catch(_){}
      renderAll(LGMic.state()==="blocked"||LGMic.state()==="off"?"":"The microphone didn't start.");
      return;
    }
    if(my!==st.startId||!st.open){ inp.close(); return; }   // closed or stopped while starting
    st.input=inp;
    st.buf=new Float32Array(st.input.analyser.fftSize);
    st.listening=true; st.auto=true; st.hist=[]; st.lastHeard=0; st.inTuneSince=0;
    renderAll(); loop();
  }
  function stopListening(msg){
    st.startId++;                         // a start still in progress is dropped
    cancelAnimationFrame(st.raf);
    if(st.input){ st.input.close(); st.input=null; }
    st.listening=false;
    if(st.open) renderAll(msg);
  }
  function loop(){
    st.raf=requestAnimationFrame(loop);
    const now=performance.now();
    if(now-st.lastRun<45) return; st.lastRun=now;
    if(!st.input||!st.input.read(st.buf)) return;
    if(now<st.mutedUntil){ idleHint(); return; }
    const inst=INSTRUMENTS[st.inst];
    const buf=st.inst==="guitar"?st.buf.subarray(st.buf.length-4096):st.buf;
    const r=detectPitch(buf,st.input.sampleRate,inst.minHz,inst.maxHz);
    /* Loudness of the current pluck; its quiet dying tail (where room hum can
       take over) is not read as a new note. */
    const lvl=r?r.rms:0;
    if(r){
      if(lvl>st.peak||lvl>st.prevLvl*1.6||now-st.peakAt>4000){ st.peak=lvl; st.peakAt=now; }   // a new pluck
      st.prevLvl=lvl;
    }
    if(r&&r.clarity>0.75&&lvl>=st.peak*0.18) heard(r.freq,now);
    else if(now-st.lastHeard>1200){ st.hist=[]; st.inTuneSince=0; idleHint(); }
  }
  function median(a){ const s=a.slice().sort((x,y)=>x-y); return s[s.length>>1]; }
  function heard(f,now){
    /* a new note (more than half a semitone from the last ones) starts afresh */
    if(st.hist.length&&Math.abs(centsOff(f,median(st.hist)))>50){ st.hist=[]; st.inTuneSince=0; }
    st.hist.push(f); if(st.hist.length>5) st.hist.shift();
    st.lastHeard=now;
    if(st.hist.length<2) return;
    const fm=median(st.hist), list=strings();
    if(st.auto){
      const i=nearestString(fm,list);
      if(i!==st.target){ st.target=i; st.inTuneSince=0; renderStrings(); showTarget(); }
    }
    const s=list[st.target], c=centsOff(fm,s.f), a=Math.abs(c);
    $("tnCents").textContent=(a<0.5?"0":(c>0?"+":"−")+a.toFixed(0))+" cents";
    let txt, good=a<=IN_TUNE;
    if(a>150){
      const nn=noteOf(fm);
      txt="That's "+nn.n+nn.o+". "+(c<0?"Tighten":"Loosen")+" the "+s.name+" string a lot"+(st.auto?"":", or tap Auto")+".";
    }
    else if(good) txt="In tune!";
    else if(a<=20) txt=c<0?"A little low. Tighten slowly.":"A little high. Loosen slowly.";
    else txt=c<0?"Too low. Tighten the string (tune up).":"Too high. Loosen the string (tune down).";
    if(good){
      /* half a second of unbroken in-tune readings (a gap over 250 ms starts again) */
      if(!st.inTuneSince||now-st.goodAt>250) st.inTuneSince=now;
      st.goodAt=now;
      if(now-st.inTuneSince>=HOLD_MS&&!st.done[st.inst+st.target]){
        st.done[st.inst+st.target]=true; renderStrings();
        const next=list.map((x,i)=>i).find(i=>!st.done[st.inst+i]);
        if(next===undefined) txt="All "+list.length+" strings in tune. Nice work!";
        else txt=s.name.charAt(0).toUpperCase()+s.name.slice(1)+" string in tune. Next: the "+list[next].name+" string"+(st.auto?".":" (tap it, or tap Auto).");
        st.shown=txt; st.shownUntil=now+1800;
      }
    } else st.inTuneSince=0;
    if(st.shown&&now<st.shownUntil) txt=st.shown;
    hint(txt); setNeedle(c,good?"good":"");
  }

  /* ---------- actions ---------- */
  function pick(i){
    st.target=i; st.auto=false; st.inTuneSince=0; st.hist=[];
    renderInst(); renderStrings(); showTarget();
    playNote(strings()[i].f);
    hint(st.listening?"Playing the "+strings()[i].name+" string's note. Now play your string.":"Playing "+strings()[i].name+". Turn the peg until your string sounds the same.");
    $("tnCents").innerHTML="&nbsp;"; setNeedle(0,"idle");
  }
  function setInst(k){
    if(!INSTRUMENTS[k]) return; st.inst=k; st.target=0; st.hist=[];
    try{localStorage.setItem(INST_KEY,k)}catch(e){}
    renderAll();
  }
  function setAuto(){ st.auto=!st.auto; st.hist=[]; renderInst(); idleHint(); }

  function openTuner(){
    if(typeof seqStop==="function") try{seqStop()}catch(e){}
    if(typeof paStop==="function"&&typeof pa!=="undefined"&&pa.playing) try{paStop()}catch(e){}   // F7 play-along: the tuner must not hear it
    const el=build(); st.open=true; st.opener=document.activeElement;
    st.done={}; st.hist=[]; st.paused=false; st.inTuneSince=0; st.shown=null;   // a fresh tuning each time
    el.classList.add("show"); document.documentElement.classList.add("tnlock");
    if(location.hash!=="#tuner"){ try{history.pushState({tuner:1},"","#tuner"); st.pushed=true;}catch(e){} }
    renderAll();
    $("tnTitle").focus({preventScroll:true});
    const ms=LGMic.state();
    if(ms==="ready"||ms==="ask") listen();
  }
  function closeTuner(fromHistory){
    if(!st.open) return;
    st.open=false; stopListening();
    if(LGMic.cancel) LGMic.cancel();      // a permission or privacy screen it opened goes too
    const el=$("tunerView"); if(el) el.classList.remove("show");
    document.documentElement.classList.remove("tnlock");
    if(!fromHistory&&location.hash==="#tuner"){
      if(st.pushed) history.back(); else try{history.replaceState(null,"",location.pathname+location.search)}catch(e){}
    }
    st.pushed=false;
    if(st.opener&&st.opener.focus) try{st.opener.focus({preventScroll:true})}catch(e){}
  }
  window.addEventListener("popstate",()=>{ if(st.open&&location.hash!=="#tuner") closeTuner(true); });
  window.addEventListener("hashchange",()=>{ if(!st.open&&location.hash==="#tuner") openTuner(); });
  LGMic.onChange(()=>{ if(st.open&&!st.listening) renderMode(); });

  Object.assign(api,{open:openTuner,close:closeTuner,listen,stopListening:()=>stopListening(),pick,setInst,setAuto});
  root.LGTuner=api; root.openTuner=openTuner; root.closeTuner=()=>closeTuner(false);
  if(location.hash==="#tuner") setTimeout(openTuner,0);
})(typeof window!=="undefined"?window:globalThis);
