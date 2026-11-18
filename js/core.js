/* Shared state and storage, toast, audio and sequencer, shared render helpers,
   tab navigation, and the Supabase sign-in and sync code. Loaded after data.js. */
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

/* ============ SUPABASE SYNC (optional login) ============ */
/* PASTE YOUR TWO SUPABASE VALUES BELOW. Until you do, login stays hidden and the app works as normal. */
const SUPABASE_URL="https://xoyatbnihfnbovnstewu.supabase.co";
const SUPABASE_ANON_KEY="sb_publishable_GYbkCWBZGaTBjsRzyVhwgA_xPHX-jPD";
const SYNC_ON = SUPABASE_URL.indexOf("__")<0 && SUPABASE_ANON_KEY.indexOf("__")<0 && !!(window.supabase && window.supabase.createClient);
/* EMAIL GATE SWITCH.
   false = the toolkit opens straight away for everyone (current setting).
   true  = visitors must sign in with a 6-digit email code before anything shows.
   Turning this back on also needs the Supabase project running and custom SMTP set up. */
const GATE_ON = false;

let sb=null, sbUser=null, syncTimer=null, pendingEmail="";

/* Internal error and running-cost logs (js/ops.js). Players never see these. */
function opsErr(task,e,ctx){ try{ if(window.LGOps) LGOps.logError(task,e,ctx); }catch(_){} }
function opsCost(task){ try{ if(window.LGOps) LGOps.logCost(task,"supabase:call",1); }catch(_){} }

function gatherProgress(){return {practice:practiceDone, campfire:campfireDone, setlist:setlist, mysongs:mySongs};}
function applyProgress(pr){ if(!pr)return;
  if(pr.practice)practiceDone=pr.practice;
  if(pr.campfire)campfireDone=pr.campfire;
  if(Array.isArray(pr.setlist))setlist=pr.setlist;
  if(Array.isArray(pr.mysongs))mySongs=pr.mysongs;
  LS.set("ccf_practice",practiceDone); LS.set("ccf_campfire",campfireDone); LS.set("ccf_setlist",setlist); LS.set("ccf_mysongs",mySongs);
}
function mergeProgress(a,b){
  const m={setlist:Array.from(new Set([...(a.setlist||[]),...(b.setlist||[])]))};
  const _ms={}; [...(a.mysongs||[]),...(b.mysongs||[])].forEach(s=>{_ms[s.id]=s;}); m.mysongs=Object.values(_ms);
  ["practice","campfire"].forEach(k=>{const o={}; const src=Object.assign({},a[k],b[k]);
    Object.keys(src).forEach(key=>{o[key]=!!((a[k]&&a[k][key])||(b[k]&&b[k][key]));}); m[k]=o;});
  return m;
}
function reRenderAll(){ renderSongs(); renderFilterChips(); renderPractice(); renderCampfire(); renderSongbook(); }
function onLocalWrite(k){ if(SYNC_ON && sbUser) scheduleSync(); }
function scheduleSync(){ if(syncTimer)clearTimeout(syncTimer); syncTimer=setTimeout(pushProgress,1200); }
async function pushProgress(){ if(!SYNC_ON||!sbUser)return;
  opsCost("save progress");
  try{ await sb.from("progress").upsert({user_id:sbUser.id, data:gatherProgress(), updated_at:new Date().toISOString()},{onConflict:"user_id"}); }catch(e){ opsErr("save progress",e); }
}
async function pullAndMerge(){ if(!SYNC_ON||!sbUser)return;
  opsCost("load progress");
  try{ const {data}=await sb.from("progress").select("data").eq("user_id",sbUser.id).maybeSingle();
    const remote=(data&&data.data)?data.data:{practice:{},campfire:{},setlist:[]};
    applyProgress(mergeProgress(remote, gatherProgress())); reRenderAll(); await pushProgress();
  }catch(e){ opsErr("load progress",e); }
}
function initSupabase(){
  if(!GATE_ON){ hideGate(); const _b=document.getElementById("acctBtn"); if(_b)_b.style.display="none"; return; }
  if(!SYNC_ON){ const b=document.getElementById("acctBtn"); if(b)b.style.display="none"; return; }
  showGate();
  try{ sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{
      persistSession:true, autoRefreshToken:true, detectSessionInUrl:true, flowType:"implicit"
    }});
    sb.auth.getSession().then(({data})=>{ sbUser=data.session?data.session.user:null; renderAcct(); enforceGate(); if(sbUser)pullAndMerge(); })
      .catch(err=>{ console.error("[auth] getSession failed",err); opsErr("sign-in: get session",err); enforceGate(); });
    sb.auth.onAuthStateChange((_e,session)=>{ sbUser=session?session.user:null; renderAcct(); enforceGate(); if(sbUser)pullAndMerge(); });
  }catch(e){
    console.error("[auth] createClient failed",e);
    opsErr("sign-in: create client",e);
    const b=document.getElementById("acctBtn"); if(b)b.style.display="none";
    sb=null; showGateError("Sign-in is temporarily unavailable. Please reload the page.");
  }
}
/* Replaces the gate form when sign-in cannot work at all, so people get a real
   message instead of a button that silently fails. */
function showGateError(msg){
  const b=document.getElementById("gateBody"); if(!b)return;
  b.innerHTML='<p style="font-size:13.5px;line-height:1.5;color:#b00">'+esc(msg)+'</p>';
}
/* Surfaces the real reason a sign-in step failed (rate limit, mail delivery,
   rejected key) instead of collapsing everything into one generic message. */
function authErr(e,fallback){
  console.error("[auth]",e);
  opsErr("sign-in: "+fallback,e);
  const m=e&&(e.message||e.error_description||e.error);
  return m?String(m):fallback;
}
function openAcct(){ document.getElementById("acctModal").classList.add("show"); renderAcct(); }
function closeAcct(){ document.getElementById("acctModal").classList.remove("show"); }
function renderAcct(){
  const body=document.getElementById("acctBody"); if(!body)return;
  const btn=document.getElementById("acctBtn");
  if(sbUser){ if(btn)btn.classList.add("in");
    body.innerHTML='<p>Signed in as <b>'+esc(sbUser.email||"")+'</b>. Your tracker, checklist and setlist now sync to any device you sign in on.</p><button class="btn ghost" onclick="signOut()">Sign out</button>';
  } else { if(btn)btn.classList.remove("in");
    body.innerHTML='<p>Save your progress and pick up on any device. Pop in your email and we\'ll send a 6-digit code. No password to remember.</p>'+
      '<input id="acctEmail" class="search" type="email" autocomplete="email" placeholder="you@email.com" style="margin-bottom:10px">'+
      '<button class="btn" id="sendBtn" onclick="sendCode()" style="width:100%;justify-content:center">Send me a code</button>'+
      '<div id="codeArea"></div>';
  }
}
async function sendCode(){
  const em=(document.getElementById("acctEmail").value||"").trim();
  if(!em||em.indexOf("@")<0){ toast("Enter your email"); return; }
  if(!sb){ toast("Sign-in unavailable, please reload"); return; }
  pendingEmail=em; const b=document.getElementById("sendBtn"); b.textContent="Sending..."; b.disabled=true;
  opsCost("sign-in: send code");
  try{ const {error}=await sb.auth.signInWithOtp({email:em,options:{emailRedirectTo:window.location.origin+window.location.pathname}}); if(error)throw error;
    document.getElementById("codeArea").innerHTML='<p style="margin-top:14px">We sent a code to <b>'+esc(em)+'</b>. Enter it below.</p>'+
      '<input id="acctCode" class="search" inputmode="numeric" autocomplete="one-time-code" placeholder="6-digit code" style="margin-bottom:10px">'+
      '<button class="btn" onclick="verifyCode()" style="width:100%;justify-content:center">Verify and sign in</button>';
  }catch(e){ toast(authErr(e,"Could not send code, try again")); b.textContent="Send me a code"; b.disabled=false; }
}
/* A code minted by the Magic Link template verifies as type "magiclink", one
   from the OTP template as "email". Try both so either template works. */
async function verifyOtpToken(code){
  let last=null;
  for(const type of ["email","magiclink"]){
    opsCost("sign-in: verify code");
    const {error}=await sb.auth.verifyOtp({email:pendingEmail, token:code, type:type});
    if(!error) return;
    last=error;
  }
  throw last;
}
async function verifyCode(){
  const code=(document.getElementById("acctCode").value||"").replace(/\s+/g,"");
  if(!code){ toast("Enter the code"); return; }
  if(!sb){ toast("Sign-in unavailable, please reload"); return; }
  try{ await verifyOtpToken(code);
    toast("Signed in ✓"); closeAcct();
  }catch(e){ toast(authErr(e,"Wrong or expired code")); }
}
async function signOut(){ try{ await sb.auth.signOut(); }catch(e){} sbUser=null; renderAcct(); toast("Signed out"); }

function showGate(){ const g=document.getElementById("loginGate"); if(g){ g.style.display="flex"; if(!g.dataset.init){ renderGate(); g.dataset.init="1"; } } }
function hideGate(){ const g=document.getElementById("loginGate"); if(g) g.style.display="none"; }
function enforceGate(){ if(!GATE_ON){ hideGate(); return; } if(!SYNC_ON) return; if(sbUser) hideGate(); else showGate(); }
function renderGate(){
  const b=document.getElementById("gateBody"); if(!b)return;
  b.innerHTML='<input id="gateEmail" class="search" type="email" autocomplete="email" placeholder="you@email.com" style="margin-bottom:10px">'+
    '<button class="btn" id="gateSend" onclick="gateSendCode()" style="width:100%;justify-content:center">Send me a code</button>'+
    '<div id="gateCodeArea"></div>';
}
async function gateSendCode(){
  const em=(document.getElementById("gateEmail").value||"").trim();
  if(!em||em.indexOf("@")<0){ toast("Enter your email"); return; }
  if(!sb){ toast("Sign-in unavailable, please reload"); return; }
  pendingEmail=em; const b=document.getElementById("gateSend"); b.textContent="Sending..."; b.disabled=true;
  opsCost("sign-in: send code");
  try{ const {error}=await sb.auth.signInWithOtp({email:em,options:{emailRedirectTo:window.location.origin+window.location.pathname}}); if(error)throw error;
    document.getElementById("gateCodeArea").innerHTML='<p style="margin-top:14px;font-size:13.5px;color:#33302c">We sent a code to <b>'+esc(em)+'</b>. Enter it below.</p>'+
      '<input id="gateCode" class="search" inputmode="numeric" autocomplete="one-time-code" placeholder="Enter your code" style="margin-bottom:10px">'+
      '<button class="btn" onclick="gateVerify()" style="width:100%;justify-content:center">Verify and sign in</button>';
  }catch(e){ toast(authErr(e,"Could not send code, try again")); b.textContent="Send me a code"; b.disabled=false; }
}
async function gateVerify(){
  const code=(document.getElementById("gateCode").value||"").replace(/\s+/g,""); if(!code){ toast("Enter the code"); return; }
  if(!sb){ toast("Sign-in unavailable, please reload"); return; }
  try{ await verifyOtpToken(code); toast("Signed in ✓"); }
  catch(e){ toast(authErr(e,"Wrong or expired code")); }
}
