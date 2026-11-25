/* F4: the microphone, shared by every tool that listens (the tuner now; the live
   coach F8, record F10 and chord check F12 later). Sound is processed on the
   device only: this file never records, stores or sends audio anywhere.

   Interface (window.LGMic):
     LGMic.state()            -> "ask" | "notnow" | "ready" | "off" | "blocked" | "unsupported"
     LGMic.ask(opts)          -> Promise<boolean>. Shows our permission screen (opts.title,
                                 opts.text say what the tool listens for), then the browser's
                                 own prompt. Resolves true once the microphone may be used.
                                 Resolves true at once when it already may. "Not now" -> false.
     LGMic.open(opts)         -> Promise<input>. Needs state "ready" (call ask first).
                                 opts.fftSize (default 4096), opts.onEnd(reason) when the input
                                 stops by itself ("hidden", "off", "ended").
                                 input = { ctx, analyser, sampleRate, read(Float32Array), close() }
     LGMic.openPrivacy()      -> shows the microphone and privacy settings.
     LGMic.onChange(fn)       -> fn(state) whenever the state changes.

   The only thing kept is the player's choice, on this device (localStorage
   "lg_mic"; not synced, not sent). */
(function(){
  const KEY="lg_mic";
  const POLICY="https://leanguitarist.com/privacy-policy";
  let browserPerm="prompt";          // "granted" | "denied" | "prompt", from the Permissions API where it exists
  let stream=null;                   // one shared stream for every open input
  const inputs=new Set();
  const listeners=[];
  let sheetResolve=null;

  const supported=()=>!!(window.isSecureContext!==false&&navigator.mediaDevices&&navigator.mediaDevices.getUserMedia);
  const pref=()=>{try{return localStorage.getItem(KEY)||""}catch(e){return ""}};
  const setPref=v=>{try{localStorage.setItem(KEY,v)}catch(e){} emit();};

  function state(){
    if(!supported()) return "unsupported";
    const p=pref();
    if(p==="off") return "off";
    if(browserPerm==="denied") return "blocked";
    if(p==="yes") return "ready";
    if(p==="notnow") return "notnow";
    return "ask";
  }
  function emit(){ const s=state(); listeners.slice().forEach(fn=>{try{fn(s)}catch(e){}}); }
  function onChange(fn){ listeners.push(fn); }

  /* The Permissions API tells us when the browser already allows or blocks the
     microphone (not every browser supports the "microphone" name; then we learn
     it from getUserMedia). */
  try{
    if(navigator.permissions&&navigator.permissions.query){
      navigator.permissions.query({name:"microphone"}).then(st=>{
        browserPerm=st.state; emit();
        st.onchange=()=>{ browserPerm=st.state; if(st.state!=="granted") stopAll("off"); emit(); };
      }).catch(()=>{});
    }
  }catch(e){}

  function audioCtx(){
    if(typeof ensureAudio==="function"){ ensureAudio(); if(typeof ctx!=="undefined"&&ctx) return ctx; }
    if(!audioCtx._own){ const AC=window.AudioContext||window.webkitAudioContext; audioCtx._own=new AC(); }
    if(audioCtx._own.state==="suspended") audioCtx._own.resume();
    return audioCtx._own;
  }

  /* Raw sound for measuring: the phone's voice clean-up would bend the notes. */
  const CONSTRAINTS={audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false};

  async function getStream(){
    if(stream&&stream.getAudioTracks().some(t=>t.readyState==="live")) return stream;
    let s;
    try{ s=await navigator.mediaDevices.getUserMedia(CONSTRAINTS); }
    catch(e){
      /* Some browsers refuse the clean-up switches; retry with defaults. */
      if(e&&(e.name==="OverconstrainedError"||e.name==="TypeError")) s=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
      else throw e;
    }
    stream=s; browserPerm="granted";
    s.getAudioTracks().forEach(t=>{ t.onended=()=>{ if(stream===s) stopAll("ended"); }; });
    return s;
  }
  function stopStream(){
    if(stream){ stream.getTracks().forEach(t=>{try{t.stop()}catch(e){}}); stream=null; }
  }
  function stopAll(reason){
    const list=[...inputs]; inputs.clear();
    list.forEach(i=>{ i._dead=true; try{i._src.disconnect()}catch(e){} if(i._onEnd){try{i._onEnd(reason)}catch(e){}} });
    stopStream();
  }

  async function open(opts){
    opts=opts||{};
    if(state()!=="ready") throw new Error("microphone-not-ready");
    const c=audioCtx();
    let s;
    try{ s=await getStream(); }
    catch(e){ const n=e&&e.name; if(n==="NotAllowedError"||n==="SecurityError"){ browserPerm="denied"; emit(); } throw e; }
    const src=c.createMediaStreamSource(s);
    const an=c.createAnalyser(); an.fftSize=opts.fftSize||4096; an.smoothingTimeConstant=0;
    src.connect(an);                      // never connected to the speakers
    const input={ctx:c,analyser:an,sampleRate:c.sampleRate,_src:src,_onEnd:opts.onEnd,_dead:false,
      read(buf){ if(input._dead) return false; an.getFloatTimeDomainData(buf); return true; },
      close(){ if(input._dead) return; input._dead=true; inputs.delete(input); try{src.disconnect()}catch(e){} if(!inputs.size) stopStream(); }};
    inputs.add(input);
    return input;
  }

  /* Leaving the app (another tab, the home screen) switches the microphone off,
     so the phone's "microphone in use" light never stays on behind the player. */
  document.addEventListener("visibilitychange",()=>{ if(document.hidden&&inputs.size) stopAll("hidden"); });

  /* ---------- the screens ---------- */
  function sheet(){
    let el=document.getElementById("micSheet");
    if(el) return el;
    el=document.createElement("div"); el.id="micSheet"; el.className="micsheet";
    el.innerHTML='<div class="micbox" role="dialog" aria-modal="true" aria-labelledby="micTitle"><div id="micBody"></div></div>';
    el.addEventListener("click",e=>{ if(e.target===el) closeSheet(false); });
    el.addEventListener("keydown",e=>{ if(e.key==="Escape"){ e.stopPropagation(); closeSheet(false); } });
    document.body.appendChild(el);
    return el;
  }
  function showSheet(html){
    const el=sheet(); document.getElementById("micBody").innerHTML=html; el.classList.add("show");
    const t=document.getElementById("micTitle"); if(t){ t.setAttribute("tabindex","-1"); t.focus({preventScroll:true}); }
  }
  function closeSheet(result){
    const el=document.getElementById("micSheet"); if(el) el.classList.remove("show");
    const r=sheetResolve; sheetResolve=null; if(r) r(result);
  }
  const MIC_SVG='<svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-6a3.5 3.5 0 0 0-7 0v6A3.5 3.5 0 0 0 12 15zm6-3.5a6 6 0 0 1-12 0H4a8 8 0 0 0 7 7.9V22h2v-2.6a8 8 0 0 0 7-7.9z"/></svg>';
  const STAYS='<ul class="micpoints">'+
    '<li><b>Sound stays on this device.</b> Your phone or computer works out the notes itself.</li>'+
    '<li><b>Nothing is recorded, saved or uploaded.</b> No sound goes to us, to an AI or anywhere else.</li>'+
    '<li><b>It only listens while the tool is open,</b> and stops when you close it or leave the app.</li></ul>';

  function blockedHelp(){
    return '<p class="micsmall">Your browser is blocking the microphone for this app. To allow it: on an iPhone, tap <b>aA</b> (or the page menu) in the address bar, then <b>Website Settings</b>, <b>Microphone</b>, <b>Allow</b>. In Chrome, tap the icon left of the web address, then <b>Permissions</b>, <b>Microphone</b>. Then come back and try again.</p>';
  }

  function permScreen(opts,err){
    const st=state();
    const title=opts.title||"Let the app hear your guitar";
    const text=opts.text||"The app listens to the notes you play so it can help you on the spot.";
    let h='<div class="micicon">'+MIC_SVG+'</div><div class="mick">Microphone</div>'+
      '<h2 class="mich" id="micTitle">'+title+'</h2><p class="micp">'+text+'</p>'+STAYS;
    if(err==="blocked"||st==="blocked") h+=blockedHelp()+'<button type="button" class="btn micbtn" onclick="LGMic._allow()">Try again</button>';
    else if(err==="nomic") h+='<p class="micsmall micerr">We couldn\'t find a microphone on this device. Plug one in or try your phone.</p><button type="button" class="btn micbtn" onclick="LGMic._allow()">Try again</button>';
    else if(err) h+='<p class="micsmall micerr">The microphone didn\'t start. Close other apps that use it, then try again.</p><button type="button" class="btn micbtn" onclick="LGMic._allow()">Try again</button>';
    else h+='<button type="button" class="btn micbtn" id="micAllow" onclick="LGMic._allow()">Allow microphone</button>'+
      '<p class="micsmall">Your browser will ask next. Tap <b>Allow</b> there too.</p>';
    h+='<button type="button" class="btn ghost micbtn" onclick="LGMic._notNow()">Not now</button>'+
      '<button type="button" class="miclink" onclick="LGMic.openPrivacy()">Privacy settings</button>';
    showSheet(h);
  }
  let lastOpts={};
  function ask(opts){
    opts=opts||{}; lastOpts=opts;
    const st=state();
    if(st==="ready") return Promise.resolve(true);
    if(st==="unsupported"){
      showSheet('<div class="micicon">'+MIC_SVG+'</div><h2 class="mich" id="micTitle">Listening isn\'t available here</h2>'+
        '<p class="micp">This browser can\'t share the microphone with the app. Try Safari on an iPhone, or Chrome. Tap mode still works: tap a string to hear its note.</p>'+
        '<button type="button" class="btn micbtn" onclick="LGMic._notNow()">OK</button>');
      return new Promise(r=>{ sheetResolve=r; });
    }
    if(sheetResolve){ const r=sheetResolve; sheetResolve=null; r(false); }
    permScreen(opts);
    return new Promise(r=>{ sheetResolve=r; });
  }
  async function allow(){
    const b=document.getElementById("micAllow"); if(b){ b.disabled=true; b.textContent="Waiting for your browser..."; }
    try{
      audioCtx();                         // inside the tap, so the sound engine may start on iPhone
      await getStream();
      setPref("yes");
      if(!inputs.size) stopStream();      // open() takes it again; the browser remembers the yes
      closeSheet(true);
    }catch(e){
      const n=e&&e.name;
      if(n==="NotAllowedError"||n==="SecurityError"||n==="PermissionDeniedError"){ browserPerm="denied"; emit(); permScreen(lastOpts,"blocked"); }
      else if(n==="NotFoundError"||n==="DevicesNotFoundError") permScreen(lastOpts,"nomic");
      else permScreen(lastOpts,"failed");
      if(window.LGOps&&LGOps.logError) try{LGOps.logError("mic",e)}catch(_){}
    }
  }
  function notNow(){ if(pref()!=="off") setPref("notnow"); closeSheet(false); }

  function privacyScreen(){
    const st=state();
    const on=st==="ready"||(pref()==="yes");
    let status;
    if(st==="unsupported") status="This browser can't share the microphone with the app.";
    else if(st==="blocked") status="Your browser is blocking the microphone for this app.";
    else if(on) status="On. Tools listen only while they are open.";
    else status="Off. The tuner plays each string's note for you to tune by ear.";
    let h='<div class="mick">Settings</div><h2 class="mich" id="micTitle">Microphone and privacy</h2>'+
      '<div class="microw"><span><b>Use the microphone</b><small>'+status+'</small></span>'+
      (st==="unsupported"?'':'<button type="button" class="micsw" role="switch" aria-checked="'+(on&&st!=="blocked")+'" aria-label="Use the microphone" onclick="LGMic._toggle()"></button>')+'</div>'+
      (st==="blocked"?blockedHelp():'')+
      '<h3 class="mich3">What happens to the sound</h3>'+STAYS+
      '<h3 class="mich3">What is kept</h3><p class="micp">Only your choice on this switch, on this device.</p>'+
      '<h3 class="mich3">Camera</h3><p class="micp">Not used. If camera features come later, each will be its own choice, off until you turn it on.</p>'+
      '<p class="micsmall">Turning this off stops the app listening. To remove the browser\'s own permission too, use your browser\'s settings for this website. See our <a href="'+POLICY+'" target="_blank" rel="noopener">Privacy policy</a>.</p>'+
      '<button type="button" class="btn micbtn" onclick="LGMic._closePrivacy()">Done</button>';
    showSheet(h);
  }
  let privacyReturn=null;
  function openPrivacy(){
    /* Opened from the permission screen: come back to it afterwards. */
    privacyReturn=sheetResolve?lastOpts:null;
    privacyScreen();
  }
  async function toggle(){
    const st=state();
    if(st==="ready"||pref()==="yes"&&st!=="blocked"){ setPref("off"); stopAll("off"); privacyScreen(); return; }
    try{ audioCtx(); await getStream(); setPref("yes"); if(!inputs.size) stopStream(); }
    catch(e){ const n=e&&e.name; if(n==="NotAllowedError"||n==="SecurityError"){ browserPerm="denied"; } setPref("notnow"); }
    privacyScreen();
  }
  function closePrivacy(){
    if(privacyReturn&&sheetResolve){
      const o=privacyReturn; privacyReturn=null;
      if(state()==="ready") closeSheet(true); else permScreen(o);
      return;
    }
    closeSheet(state()==="ready");
  }

  window.LGMic={state,ask,open,openPrivacy,onChange,
    _allow:allow,_notNow:notNow,_toggle:toggle,_closePrivacy:closePrivacy};
})();
