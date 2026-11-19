/* F2: email practice reminders.
   A signed-in buyer picks a time, the days and whether to skip a day they have
   already practised; the settings are saved to their own row in
   public.reminders with this device's time zone. The n8n job
   "LEA112 | App - practice reminders (every 15 min)" sends the email through
   Resend and logs it on the buyer's GHL contact. Email only, no texts.
   The app also records the last time the player practised (a tick in the
   practice tracker or campfire checklist, or starting the practice timer), which
   the "skip it if I've already practised" switch needs.
   Loaded after account.js (uses sb, sbUser, accessOk, showSignin). */

const RM_TIMES=["07:00","12:30","18:00","19:30","21:00"];
const RM_DAYS=[[1,"Mon"],[2,"Tue"],[3,"Wed"],[4,"Thu"],[5,"Fri"],[6,"Sat"],[7,"Sun"]];
const RM_DEFAULT={enabled:true, remind_at:"19:30", days:[1,2,3,4,5,7], skip_if_practised:true};
let rmState=null, rmSaving=false, rmLoadedFor="";
let rmLastPractice=0, rmPracticeTimer=null;

function rmZone(){
  try{ const z=Intl.DateTimeFormat().resolvedOptions().timeZone; if(z) return String(z); }catch(_){}
  return "UTC";
}
/* "19:30" -> "7:30 pm" */
function rmLabel(hm){
  const [h,m]=String(hm).split(":").map(Number);
  return ((h%12)||12)+":"+String(m||0).padStart(2,"0")+(h<12?" am":" pm");
}
function rmHM(t){ const p=String(t||"").split(":"); return p.length>=2 ? p[0].padStart(2,"0")+":"+p[1].padStart(2,"0") : ""; }
function rmSignedIn(){ return !!(typeof sb!=="undefined" && sb && sbUser && accessOk); }

/* The line about today's practice, the same one the email uses. */
function rmTodayLine(){
  for(let d=1; d<=21; d++){ if(!practiceDone[d]){ const t=PRACTICE[d-1]; return "Day "+d+" is ready: "+t[0]+". Ten minutes is plenty."; } }
  return "All 21 days are done. Pick a song you love and play it through twice.";
}
function rmSubject(hm){
  const first=rmFirstName();
  const when=Number(String(hm).split(":")[0])>=16 ? "tonight" : "today";
  return first ? "10 minutes "+when+", "+first+"?" : "10 minutes "+when+"?";
}
let rmFirst="";
function rmFirstName(){ return rmFirst; }

/* ============ THE SCREEN ============ */
async function openReminders(){
  if(!rmSignedIn()){ toast("Sign in to set a reminder"); showSignin("signin"); return; }
  rmState=null; renderReminders(true);
  const uid=sbUser.id;
  try{
    opsCost("reminders: load");
    const [r,a]=await Promise.all([
      sb.from("reminders").select("enabled,remind_at,days,time_zone,skip_if_practised").eq("user_id",uid).maybeSingle(),
      sb.from("access").select("first_name").eq("email",String(sbUser.email||"").trim().toLowerCase()).maybeSingle()
    ]);
    if(r.error) throw r.error;
    if(!sbUser||sbUser.id!==uid) return;
    rmFirst=(a&&a.data&&a.data.first_name)?String(a.data.first_name).trim().split(/\s+/)[0]:"";
    const row=r.data;
    rmLoadedFor=uid;
    rmState=row ? {enabled:!!row.enabled, remind_at:rmHM(row.remind_at)||"19:30",
                   days:(row.days||[]).map(Number), skip_if_practised:!!row.skip_if_practised, saved:true, savedOn:!!row.enabled}
                : {...RM_DEFAULT, days:[...RM_DEFAULT.days], saved:false, savedOn:false};
  }catch(e){
    opsErr("reminders: load",e);
    rmState={error:true};
  }
  renderReminders();
}
function renderReminders(loading){
  const g=document.getElementById("loginGate"), b=document.getElementById("siBody"); if(!g||!b) return;
  let h='<div class="k">Practice reminder &middot; by email</div>'+
        '<h2 class="gateh" id="siTitle">When should we nudge you?</h2>';
  if(loading){
    h+='<p class="gatep">Loading your reminder...</p>';
  } else if(!rmState||rmState.error){
    h+='<p class="gatep">We couldn\'t load your reminder just now. Please check your connection and try again.</p>'+
       siBtn("Try again","openReminders()")+siBtn("Back to the app","closeSignin()","ghost");
  } else {
    const s=rmState, custom=RM_TIMES.indexOf(s.remind_at)<0;
    h+='<div class="rmrow"><span id="rmOnLbl">Email me a practice reminder</span>'+
       '<button type="button" class="rmsw" role="switch" aria-checked="'+s.enabled+'" aria-labelledby="rmOnLbl" onclick="rmToggle(\'enabled\')"></button></div>'+
       '<div class="rmbody'+(s.enabled?'':' off')+'">'+
       '<div class="rmlbl">Time</div><div class="chips rmchips">'+
       RM_TIMES.map(t=>'<button type="button" class="chip'+(s.remind_at===t?' on':'')+'" aria-pressed="'+(s.remind_at===t)+'" onclick="rmSetTime(\''+t+'\')">'+rmLabel(t)+'</button>').join("")+
       '<label class="chip rmother'+(custom?' on':'')+'">Other <input type="time" id="rmTime" step="300" value="'+(custom?esc(s.remind_at):"")+'" onchange="rmSetTime(this.value)" aria-label="Pick another time"></label></div>'+
       '<div class="rmlbl">Days</div><div class="chips rmchips">'+
       RM_DAYS.map(([n,l])=>{ const on=s.days.indexOf(n)>=0; return '<button type="button" class="chip'+(on?' on':'')+'" aria-pressed="'+on+'" onclick="rmToggleDay('+n+')">'+l+'</button>'; }).join("")+'</div>'+
       '<div class="rmrow"><span id="rmSkipLbl">Skip it if I\'ve already practised that day</span>'+
       '<button type="button" class="rmsw" role="switch" aria-checked="'+s.skip_if_practised+'" aria-labelledby="rmSkipLbl" onclick="rmToggle(\'skip_if_practised\')"></button></div>'+
       '<div class="rmmail"><div class="rmlbl">The email you\'ll get</div>'+
       '<p><b>From:</b> Lean Guitarist</p><p><b>Subject:</b> '+esc(rmSubject(s.remind_at))+'</p>'+
       '<p class="rmmut">'+esc(rmTodayLine())+'</p></div>'+
       '<p class="sismall rmnote">Sent to <b>'+esc(String(sbUser.email||""))+'</b> at '+rmLabel(s.remind_at)+' your time ('+esc(rmZone())+'), give or take 15 minutes. Practice counts when you tick a day or a campfire skill, or start the practice timer, while signed in.</p>'+
       '</div>'+
       siBtn(rmSaving?"Saving...":"Save reminder","rmSave()","","rmSaveBtn")+
       siBtn("Back to the app","closeSignin()","ghost")+
       '<p class="sismall">Email only. Turn it off here any time.</p>';
  }
  b.innerHTML=h;
  g.style.display="flex";
  const sv=document.getElementById("rmSaveBtn"); if(sv&&rmSaving) sv.disabled=true;
}
function rmSetTime(t){ const hm=rmHM(t); if(!rmState||!hm) return; rmState.remind_at=hm; renderReminders(); }
function rmToggleDay(n){
  if(!rmState) return;
  const i=rmState.days.indexOf(n);
  if(i>=0) rmState.days.splice(i,1); else rmState.days.push(n);
  rmState.days.sort((a,b)=>a-b);
  renderReminders();
}
function rmToggle(k){ if(!rmState) return; rmState[k]=!rmState[k]; renderReminders(); }
async function rmSave(){
  if(!rmState||rmSaving) return;
  if(!rmSignedIn()||sbUser.id!==rmLoadedFor){ toast("Please sign in again"); showSignin("signin"); return; }
  if(rmState.enabled && !rmState.days.length){ toast("Pick at least one day"); return; }
  rmSaving=true; renderReminders();
  const row={user_id:sbUser.id, enabled:rmState.enabled, remind_at:rmState.remind_at, days:rmState.days,
             time_zone:rmZone(), skip_if_practised:rmState.skip_if_practised};
  try{
    opsCost("reminders: save");
    const {error}=await sb.from("reminders").upsert(row,{onConflict:"user_id"});
    if(error) throw error;
    const wasOn=rmState.savedOn;
    rmState.saved=true; rmState.savedOn=rmState.enabled;
    rmSaving=false;
    closeSignin();
    toast(rmState.enabled ? "Saved. We'll email you at "+rmLabel(rmState.remind_at) : (wasOn ? "Reminders are off" : "Saved. Reminders are off"));
  }catch(e){
    rmSaving=false;
    opsErr("reminders: save",e);
    renderReminders();
    toast("Couldn't save your reminder. Please try again");
  }
}

/* ============ "PRACTISED TODAY" ============ */
/* Called on a tick (not an un-tick) and when the practice timer starts. Saves at
   most once every 10 minutes; the server stamps its own clock. */
function notePractised(){
  if(!rmSignedIn()) return;
  if(Date.now()-rmLastPractice<10*60*1000) return;
  if(rmPracticeTimer) return;
  rmPracticeTimer=setTimeout(rmSendPractice,1500);
}
async function rmSendPractice(){
  rmPracticeTimer=null;
  if(!rmSignedIn()) return;
  const uid=sbUser.id;
  try{
    opsCost("reminders: practised");
    const {error}=await sb.from("reminders").upsert({user_id:uid, last_practised_at:new Date().toISOString()},{onConflict:"user_id"});
    if(error) throw error;
    rmLastPractice=Date.now();
  }catch(e){ opsErr("reminders: practised",e); }
}
