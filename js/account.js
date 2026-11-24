/* F1: optional sign-in and synced progress.
   The app always opens without signing in. A player who signs in with the
   emailed 6-digit code is checked against the buyer list (public.access, one
   row per buyer email, filled from Baserow by n8n). A buyer's progress on this
   device is merged into their account (public.progress) and kept in step on
   every device. Anyone not on the list gets a friendly note and is signed out.
   Loaded after the tab scripts (it re-renders them) and before main.js. */

/* Pinned: sb_publishable_ keys require supabase-js >= 2.111.0 (index.html loads 2.112.4). */
const SUPABASE_URL="https://xoyatbnihfnbovnstewu.supabase.co";
const SUPABASE_ANON_KEY="sb_publishable_GYbkCWBZGaTBjsRzyVhwgA_xPHX-jPD";
const SYNC_ON = !!(window.supabase && window.supabase.createClient);

let sb=null, sbUser=null, accessOk=false, syncTimer=null, pendingEmail="";
let sessionRun=null, sessionRunFor="", verifying=false, applying=false, lastPull=0;
/* syncBase: the progress this tab last agreed with the account (kept per tab, so
   another open tab moving on can never make this tab's older copy look like an
   un-tick). optedOut: the player chose to carry on signed out after a sign-out
   that could not finish; background session refreshes are then ignored. */
let syncBase=null, syncBaseFor="", optedOut=false;

/* Internal error and running-cost logs (js/ops.js). Players never see these. */
function opsErr(task,e,ctx){ try{ if(window.LGOps) LGOps.logError(task,e,ctx); }catch(_){} }
function opsCost(task){ try{ if(window.LGOps) LGOps.logCost(task,"supabase:call",1); }catch(_){} }

/* ============ PROGRESS: gather, merge, save ============ */
function gatherProgress(){return {practice:practiceDone, campfire:campfireDone, setlist:setlist, mysongs:mySongs};}
function applyProgress(pr){ if(!pr)return;
  if(pr.practice)practiceDone=pr.practice;
  if(pr.campfire)campfireDone=pr.campfire;
  if(Array.isArray(pr.setlist))setlist=pr.setlist;
  if(Array.isArray(pr.mysongs))mySongs=pr.mysongs;
  applying=true;
  try{ LS.set("ccf_practice",practiceDone); LS.set("ccf_campfire",campfireDone); LS.set("ccf_setlist",setlist); LS.set("ccf_mysongs",mySongs); }
  finally{ applying=false; }
}
/* Three-way merge. base = the progress this device last agreed with the account.
   What this device changed since then (a tick, an untick, a Reset, a song added,
   edited or removed) wins; everything else comes from the account. With no base
   yet (first sign-in on this device) every tick, setlist song and own song on
   either side is kept, so two devices with different ticks keep both. */
function mergeProgress3(base,local,remote){
  base=base||{}; local=local||{}; remote=remote||{};
  const m={};
  ["practice","campfire"].forEach(k=>{
    const b=base[k]||{}, l=local[k]||{}, r=remote[k]||{}, o={};
    new Set([...Object.keys(b),...Object.keys(l),...Object.keys(r)]).forEach(key=>{
      const lv=!!l[key], bv=!!b[key];
      if(lv!==bv ? lv : !!r[key]) o[key]=true;
    });
    m[k]=o;
  });
  const bl=base.setlist||[], ll=local.setlist||[], rl=remote.setlist||[];
  const added=ll.filter(x=>!bl.includes(x)), removed=bl.filter(x=>!ll.includes(x));
  m.setlist=[...rl.filter(x=>!removed.includes(x)), ...added.filter(x=>!rl.includes(x))];
  const byId=arr=>{const o={}; (arr||[]).forEach(x=>{ if(x&&x.id!=null) o[x.id]=x; }); return o;};
  const bs=byId(base.mysongs), ls=byId(local.mysongs), rs=byId(remote.mysongs), out={};
  Object.keys(rs).forEach(id=>{ if(!(id in bs && !(id in ls))) out[id]=rs[id]; });
  Object.keys(ls).forEach(id=>{ if(!(id in bs) || JSON.stringify(ls[id])!==JSON.stringify(bs[id])) out[id]=ls[id]; });
  m.mysongs=Object.values(out);
  return m;
}
function countProgress(p){
  const on=o=>Object.values(o||{}).filter(Boolean).length;
  return {days:on(p.practice), skills:on(p.campfire), setlist:(p.setlist||[]).length, mysongs:(p.mysongs||[]).length};
}
function reRenderAll(){ renderSongs(); renderFilterChips(); renderPractice(); renderCampfire(); renderSongbook(); }
/* Called by LS.set (core.js) after every local save. */
function onLocalWrite(k){ if(SYNC_ON && sbUser && accessOk && !applying) scheduleSync(); }
function scheduleSync(){ if(syncTimer)clearTimeout(syncTimer); syncTimer=setTimeout(()=>{ syncTimer=null; syncNow(); },1200); }
/* One sync at a time on this device. */
let syncChain=Promise.resolve(true);
function syncNow(){ const run=syncChain.then(doSync,doSync); syncChain=run.catch(()=>false); return run; }
/* Sends any save that is still waiting, and waits for one already running. */
async function flushSync(){
  if(syncTimer){ clearTimeout(syncTimer); syncTimer=null; return await syncNow(); }
  return await syncChain;
}
/* Reads the account row, merges this device into it and writes it back only if
   no other device wrote in between (the row's updated_at must still match);
   otherwise reads again. A failed read never overwrites the account. */
async function doSync(){
  if(!sb||!sbUser||!accessOk) return false;
  const uid=sbUser.id, baseKey="lg_sync_base:"+uid;
  if(syncBaseFor!==uid){ syncBase=LS.get(baseKey,null); syncBaseFor=uid; }
  lastPull=Date.now();
  for(let attempt=0; attempt<4; attempt++){
    opsCost("load progress");
    let row;
    try{
      const {data,error}=await sb.from("progress").select("data,updated_at").eq("user_id",uid).maybeSingle();
      if(error) throw error;
      row=data;
    }catch(e){ opsErr("load progress",e); return false; }
    if(!sbUser||sbUser.id!==uid) return false;
    const snap=JSON.parse(JSON.stringify(gatherProgress()));
    const merged=mergeProgress3(syncBase, snap, (row&&row.data)||{});
    const stamp=new Date().toISOString();
    opsCost("save progress");
    let res;
    try{
      if(row){
        let q=sb.from("progress").update({data:merged, updated_at:stamp}).eq("user_id",uid);
        q=row.updated_at==null ? q.is("updated_at",null) : q.eq("updated_at",row.updated_at);
        res=await q.select("user_id");
      } else {
        res=await sb.from("progress").insert({user_id:uid, data:merged, updated_at:stamp}).select("user_id");
      }
    }catch(e){ res={error:e}; }
    if(res.error){
      if(!row && res.error.code==="23505") continue; /* another device made the row first */
      opsErr("save progress",res.error); return false;
    }
    if(!res.data||!res.data.length) continue; /* another device saved first: read again */
    syncBase=JSON.parse(JSON.stringify(merged)); LS.set(baseKey,merged); /* a copy: the live progress objects change as the player ticks */
    /* Keep anything ticked on this device while the save was on its way. */
    const now=gatherProgress();
    applyProgress(JSON.stringify(now)===JSON.stringify(snap) ? merged : mergeProgress3(snap, now, merged));
    reRenderAll();
    return true;
  }
  opsErr("save progress",new Error("Another device kept saving at the same moment; will try again on the next change"));
  return false;
}

/* ============ SESSION: buyer check, then sync ============ */
/* Runs once per signed-in user. Result status: "ok" (buyer, progress merged),
   "notbuyer" (signed out again), or "error" (could not check or load; retried later). */
function startSession(user){
  if(sessionRun && sessionRunFor===user.id) return sessionRun;
  sessionRunFor=user.id;
  const run=(async()=>{
    const before=countProgress(gatherProgress());
    const email=String(user.email||"").trim().toLowerCase();
    opsCost("sign-in: buyer check");
    let res;
    try{ res=await sb.from("access").select("email").eq("email",email).maybeSingle(); }catch(e){ res={error:e}; }
    if(res.error){ opsErr("sign-in: buyer check",res.error); return {status:"error",email}; }
    if(!res.data){ const out=await localSignOut(true); return {status:"notbuyer",email,signOutFailed:!out}; }
    accessOk=true;
    const ok=await syncNow();
    if(!ok){ accessOk=false; return {status:"error",email}; }
    renderAcctBtn();
    if(typeof rmFlushPractice==="function") rmFlushPractice(); /* F2: a practice time saved while offline */
    return {status:"ok",email,before};
  })();
  sessionRun=run;
  run.then(r=>{ if(r.status!=="ok" && sessionRun===run){ sessionRun=null; sessionRunFor=""; } });
  return run;
}
/* Signs out this device only. Returns false if the stored session is still there.
   force: stop using the account on this page even then (no syncing, account
   button shows signed out); the next start runs the buyer check again. */
async function localSignOut(force){
  let error=null;
  try{ if(sb){ const r=await sb.auth.signOut({scope:"local"}); error=r&&r.error; } }catch(e){ error=e; }
  if(error){
    opsErr("sign out",error);
    let still=true;
    try{ const {data}=await sb.auth.getSession(); still=!!(data&&data.session); }catch(_){}
    if(still && !force){ renderAcctBtn(); return false; }
    if(still){ optedOut=true; clearSignedIn(); return false; }
  }
  clearSignedIn();
  return true;
}
function clearSignedIn(){
  if(syncTimer){ clearTimeout(syncTimer); syncTimer=null; }
  syncBase=null; syncBaseFor="";
  sbUser=null; accessOk=false; sessionRun=null; sessionRunFor="";
  renderAcctBtn();
}

function initSupabase(){
  if(!SYNC_ON){ renderAcctBtn(); return; }
  try{
    sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{
      persistSession:true, autoRefreshToken:true, detectSessionInUrl:true, flowType:"implicit"
    }});
  }catch(e){ console.error("[auth] createClient failed",e); opsErr("sign-in: create client",e); sb=null; renderAcctBtn(); return; }
  renderAcctBtn();
  /* supabase-js asks that no other Supabase call is awaited inside this callback,
     so the work runs on the next tick. */
  sb.auth.onAuthStateChange((event,session)=>{
    const user=session?session.user:null;
    setTimeout(()=>onAuthChange(event,user),0);
  });
  document.addEventListener("visibilitychange",onVisible);
  window.addEventListener("online",recoverStoredSession);
}
function onAuthChange(event,user){
  if(!user){
    sbUser=null; accessOk=false; sessionRun=null; sessionRunFor=""; renderAcctBtn();
    if(event==="INITIAL_SESSION"||event==="SIGNED_OUT") requireSignin();
    if(event==="INITIAL_SESSION") recoverStoredSession(); /* started offline with an expired token */
    return;
  }
  if(optedOut && !verifying) return; /* stays signed out on this page */
  sbUser=user; renderAcctBtn();
  if(verifying) return; /* verifyCode() runs the session and shows the result */
  startSession(user).then(r=>{
    if(r.status==="notbuyer") showSignin("notbuyer",r);
    else if(r.status==="ok" && gateOpen() && document.getElementById("loginGate").dataset.screen==="offline") showSignin("account");
  });
}
/* A signed-in device that starts offline after its access token expired: supabase-js
   cannot refresh it, reports no session, but keeps the stored session. Once back
   online, pick the stored session up again (getSession refreshes it). supabase-js
   remembers a failed refresh for 60 seconds, so this tries again every 20 seconds
   while the device is online and the stored session is still waiting. */
let recoverTimer=null;
function recoverStoredSession(){
  if(recoverTimer){ clearTimeout(recoverTimer); recoverTimer=null; }
  if(!sb||sbUser||optedOut||verifying||!hasStoredSession()) return;
  const again=()=>{ if(!recoverTimer) recoverTimer=setTimeout(()=>{ recoverTimer=null; if(navigator.onLine!==false) recoverStoredSession(); },20000); };
  sb.auth.getSession().then(({data,error})=>{
    const u=data&&data.session&&data.session.user;
    if(u){ if(!sbUser) onAuthChange("RECOVERED",u); return; }
    if(hasStoredSession()) again(); /* the refresh could not reach the server yet */
    else requireSignin();            /* the server refused the session and it was removed */
  }).catch(e=>{ opsErr("sign-in: recover session",e); again(); });
}
/* Back on the tab: save anything waiting, or pick up ticks made on another device. */
function onVisible(){
  if(sb && !sbUser && document.visibilityState!=="hidden") recoverStoredSession();
  if(!sb||!sbUser) return;
  if(document.visibilityState==="hidden"){
    if(syncTimer){ clearTimeout(syncTimer); syncTimer=null; syncNow(); }
    return;
  }
  if(Date.now()-lastPull<20000) return;
  if(accessOk) syncNow();
  else if(!sessionRun && !verifying) startSession(sbUser).then(r=>{ if(r.status==="notbuyer") showSignin("notbuyer",r); });
}

/* ============ SCREENS ============ */
function renderAcctBtn(){
  const b=document.getElementById("acctBtn"); if(!b) return;
  b.style.display=sb?"":"none";
  const inn=!!(sbUser&&accessOk);
  b.classList.toggle("in",inn);
  b.setAttribute("aria-label",inn?"Your account":"Sign in to save your progress");
}
/* Signed in but the purchase check could not run (offline, or it failed): the
   account button shows that screen, not the email form. */
function openAcct(){
  if(sbUser&&accessOk) showSignin("account");
  else if(sbUser) showSignin("checkerror",{email:sbUser.email});
  else if(!mustSignIn()&&hasStoredSession()){ showSignin("offline"); recoverStoredSession(); }
  else showSignin("signin");
}
/* A stored session on this device (supabase-js keeps it while a token refresh
   fails for lack of a connection, and removes it on sign-out or when the server
   refuses it). */
function hasStoredSession(){
  try{
    const k=(sb&&sb.auth&&sb.auth.storageKey)||"sb-xoyatbnihfnbovnstewu-auth-token";
    const v=JSON.parse(localStorage.getItem(k)||"null");
    return !!(v&&(v.refresh_token||(v.currentSession&&v.currentSession.refresh_token)));
  }catch(_){ return false; }
}
/* The gate: the app needs a signed-in buyer. A device with a stored session keeps
   working offline: sbUser is set from the stored session even when the buyer check
   cannot run, and when the access token expired while offline (sbUser is then null)
   the stored session still counts until a connection is back. A page that chose to
   stop using a session it could not sign out of (optedOut) is gated. If the sign-in
   library did not load (sb is null) the app stays open. */
function mustSignIn(){ return !!sb && !sbUser && (optedOut || !hasStoredSession()); }
function gateOpen(){ const g=document.getElementById("loginGate"); return !!g && g.style.display==="flex"; }
/* Screens a signed-out player may be on. Anything else open (account, reminders,
   saved, purchase-check error) belongs to a session that has ended, for example
   after signing out in another tab, and is replaced by the sign-in form. */
const SIGNED_OUT_SCREENS=["signin","code","notbuyer"];
function requireSignin(){
  if(!mustSignIn()) return;
  const g=document.getElementById("loginGate");
  if(!gateOpen() || SIGNED_OUT_SCREENS.indexOf(g&&g.dataset.screen)<0) showSignin("signin");
}
function closeSignin(){
  if(mustSignIn()){ showSignin("signin"); return; }
  const g=document.getElementById("loginGate"); if(g) g.style.display="none";
}
function siBtn(label,onclick,cls,id){ return '<button type="'+(onclick?"button":"submit")+'" class="btn'+(cls?" "+cls:"")+' sibtn"'+(id?' id="'+id+'"':'')+(onclick?' onclick="'+onclick+'"':'')+'>'+label+'</button>'; }
function showSignin(screen,info){
  const g=document.getElementById("loginGate"), b=document.getElementById("siBody"); if(!g||!b) return;
  info=info||{};
  const em=esc(String(info.email||pendingEmail||""));
  let h="";
  if(screen==="signin"){
    h='<div class="k">Free for Lean Guitarist students</div>'+
      '<h2 class="gateh" id="siTitle">Your progress and your coach, on every device</h2>'+
      '<p class="gatep">Pop in the email you bought with. We\'ll send a 6-digit code. No password to remember.</p>'+
      '<form onsubmit="sendCode();return false">'+
      '<input id="siEmail" class="search" type="email" autocomplete="email" inputmode="email" placeholder="you@email.com" aria-label="Email" value="'+em+'">'+
      '<p class="sismall siprivacy">We use your email to sign you in and save your progress. See our <a href="https://leanguitarist.com/privacy-policy" target="_blank" rel="noopener">Privacy policy</a>.</p>'+
      siBtn("Send me a code","", "", "siSend")+'</form>'+
      '<p class="sismall">Anything you already ticked on this device moves into your account when you sign in.</p>';
  } else if(screen==="code"){
    h='<div class="k">Check your email</div>'+
      '<h2 class="gateh" id="siTitle">Enter the code we sent</h2>'+
      '<p class="gatep">Sent to <b>'+em+'</b> from Lean Guitarist.</p>'+
      '<form onsubmit="verifyCode();return false">'+
      '<input id="siCode" class="search sicode" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="6-digit code" aria-label="6-digit code">'+
      siBtn("Sign in","","","siVerify")+'</form>'+
      siBtn("Send a new code","sendCode(true)","ghost","siResend")+
      '<button type="button" class="silink" onclick="showSignin(\'signin\')">Use a different email</button>';
  } else if(screen==="moved"){
    const c=info.before||{days:0,skills:0,setlist:0,mysongs:0};
    const total=CAMPFIRE.reduce((n,grp)=>n+grp.items.length,0);
    h='<div class="k">Signed in as '+em+'</div>'+
      '<h2 class="gateh" id="siTitle">We saved what was on this phone</h2>'+
      '<p class="gatep">It\'s now in your account and on any device you sign in on.</p>'+
      '<div class="silist">'+
      '<div><span>Practice days ticked</span><b>'+c.days+' of 21</b></div>'+
      '<div><span>Campfire skills ticked</span><b>'+c.skills+' of '+total+'</b></div>'+
      '<div><span>Songs in your setlist</span><b>'+c.setlist+'</b></div>'+
      '<div><span>Your own song sheets</span><b>'+c.mysongs+'</b></div></div>'+
      siBtn("Back to the app","closeSignin()");
  } else if(screen==="notbuyer"){
    h='<div class="k">For Lean Guitarist students</div>'+
      '<h2 class="gateh" id="siTitle">This email isn\'t on our buyer list</h2>'+
      '<p class="gatep">We couldn\'t find a Lean Guitarist purchase for <b>'+em+'</b>. If you bought with a different email, try that one.</p>'+
      '<p class="gatep">If you bought recently, wait an hour and try again. If it still doesn\'t work, contact us at info@leanguitarist.com.</p>'+
      siBtn("Try another email","showSignin('signin')")+
      '<a class="btn ghost sibtn" href="https://leanguitarist.com" target="_blank" rel="noopener">Visit leanguitarist.com</a>'+
      (info.signOutFailed?'<p class="sismall">We couldn\'t finish signing you out on this device. Nothing will be saved to this email, and we\'ll try again next time.</p>':'');
  } else if(screen==="checkerror"){
    h='<div class="k">Signed in as '+em+'</div>'+
      '<h2 class="gateh" id="siTitle">We couldn\'t check your purchase just now</h2>'+
      '<p class="gatep">Please check your connection and try again. Your progress on this device is safe.</p>'+
      siBtn("Try again","retryCheck()","","siRetry")+
      siBtn("Back to the app","closeSignin()","ghost")+
      siBtn("Sign out","signOutAndClose()","ghost");
  } else if(screen==="offline"){
    /* Signed in on this device, but the session can't be refreshed until the
       connection is back (see recoverStoredSession). */
    h='<div class="k">Signed in</div>'+
      '<h2 class="gateh" id="siTitle">You\'re offline</h2>'+
      '<p class="gatep">Keep practising. Your progress saves on this device and goes to your account when you\'re back online.</p>'+
      siBtn("Back to the app","closeSignin()");
  } else if(screen==="account"){
    h='<div class="k">Signed in</div>'+
      '<h2 class="gateh" id="siTitle">Your progress is saved</h2>'+
      '<p class="gatep">Signed in as <b>'+esc(String((sbUser&&sbUser.email)||""))+'</b>. Your practice tracker, campfire checklist, setlist and own songs save to your account and show on every device you sign in on.</p>'+
      siBtn("Back to the app","closeSignin()")+
      siBtn("Practice reminder by email","openReminders()","ghost")+
      siBtn("Sign out","signOut()","ghost");
  }
  b.innerHTML=h;
  g.dataset.screen=screen;
  if(screen==="notbuyer") pendingEmail="";
  g.style.display="flex";
  const first=b.querySelector("input")||b.querySelector("button");
  if(first){ try{ first.focus({preventScroll:true}); }catch(_){} }
}

/* ============ SIGN-IN STEPS ============ */
/* Surfaces the real reason a step failed (rate limit, mail delivery, rejected
   key) instead of one generic message. */
function authErr(e,fallback){
  console.error("[auth]",e);
  opsErr("sign-in: "+fallback,e);
  const m=e&&(e.message||e.error_description||e.error);
  return m?String(m):fallback;
}
async function sendCode(resend){
  const input=document.getElementById("siEmail");
  const em=(resend?pendingEmail:(input?input.value:"")).trim();
  if(!em||em.indexOf("@")<0){ toast("Enter your email"); return; }
  if(!sb){ toast("Sign-in unavailable, please reload"); return; }
  const b=document.getElementById(resend?"siResend":"siSend"); const label=b?b.textContent:"";
  if(b){ b.textContent="Sending..."; b.disabled=true; }
  opsCost("sign-in: send code");
  try{
    const {error}=await sb.auth.signInWithOtp({email:em,options:{emailRedirectTo:window.location.origin+window.location.pathname}});
    if(error) throw error;
    pendingEmail=em;
    if(resend){ toast("New code sent"); if(b){ b.textContent=label; b.disabled=false; } }
    else showSignin("code",{email:em});
  }catch(e){ toast(authErr(e,"Could not send code, try again")); if(b){ b.textContent=label; b.disabled=false; } }
}
/* A code minted by the Magic Link template verifies as type "magiclink", one
   from the OTP template as "email". Try both so either template works. */
async function verifyOtpToken(code){
  let last=null;
  for(const type of ["email","magiclink"]){
    opsCost("sign-in: verify code");
    const {data,error}=await sb.auth.verifyOtp({email:pendingEmail, token:code, type:type});
    if(!error && data && data.session) return data.session;
    last=error||new Error("No session returned");
  }
  throw last;
}
async function verifyCode(){
  const input=document.getElementById("siCode");
  const code=(input?input.value:"").replace(/\s+/g,"");
  if(!code){ toast("Enter the code"); return; }
  if(!sb){ toast("Sign-in unavailable, please reload"); return; }
  const b=document.getElementById("siVerify"); if(b){ b.textContent="Checking..."; b.disabled=true; }
  verifying=true; optedOut=false;
  let session=null;
  try{ session=await verifyOtpToken(code); }
  catch(e){ verifying=false; toast(authErr(e,"Wrong or expired code")); if(b){ b.textContent="Sign in"; b.disabled=false; } return; }
  try{
    sbUser=session.user; renderAcctBtn();
    await showSessionResult(session.user);
  }finally{ verifying=false; }
}
async function showSessionResult(user){
  const r=await startSession(user);
  if(r.status==="ok") showSignin("moved",r);
  else if(r.status==="notbuyer") showSignin("notbuyer",r);
  else showSignin("checkerror",r);
}
async function retryCheck(){
  if(!sbUser){ showSignin("signin"); return; }
  const b=document.getElementById("siRetry"); if(b){ b.textContent="Checking..."; b.disabled=true; }
  verifying=true;
  try{ await showSessionResult(sbUser); }finally{ verifying=false; }
}
async function signOutAndClose(){
  const out=await localSignOut(true);
  closeSignin();
  if(!out) toast("Couldn't finish signing out. We'll try again next time");
}
async function signOut(){
  const saved=await flushSync();
  if(!(await localSignOut())){ toast("Couldn't sign out. Please try again"); return; }
  closeSignin();
  toast(saved?"Signed out. Your progress stays on this device":"Signed out. Your latest changes are only on this device");
}
