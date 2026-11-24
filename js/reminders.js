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
let rmState=null, rmSaving=false, rmLoadedFor="", rmScreen=0;
let rmPracticeBusy=false;

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
  rmState=null; rmSaving=false; const screen=++rmScreen; renderReminders(true);
  const uid=sbUser.id;
  try{
    opsCost("reminders: load");
    const [r,a]=await Promise.all([
      sb.from("reminders").select("enabled,remind_at,days,time_zone,skip_if_practised,saved").eq("user_id",uid).maybeSingle(),
      sb.from("access").select("first_name").eq("email",String(sbUser.email||"").trim().toLowerCase()).maybeSingle()
    ]);
    if(r.error) throw r.error;
    if(!sbUser||sbUser.id!==uid||screen!==rmScreen) return;
    rmFirst=(a&&a.data&&a.data.first_name)?String(a.data.first_name).trim().split(/\s+/)[0]:"";
    const row=r.data;
    rmLoadedFor=uid;
    /* A saved reminder keeps the time zone it was saved with until the player
       chooses this device's zone. A new one, or a row made only by the practised
       signal (never saved from this screen), starts from the defaults and this
       device's zone. */
    const saved=!!(row && row.saved);
    rmState=saved ? {enabled:!!row.enabled, remind_at:rmHM(row.remind_at)||"19:30",
                   days:(row.days||[]).map(Number), skip_if_practised:!!row.skip_if_practised, zone:row.time_zone||rmZone(), savedOn:!!row.enabled}
                : {...RM_DEFAULT, days:[...RM_DEFAULT.days], zone:rmZone(), savedOn:false};
  }catch(e){
    opsErr("reminders: load",e);
    if(screen!==rmScreen) return;
    rmState={error:true};
  }
  renderReminders();
}
function renderReminders(loading){
  const g=document.getElementById("loginGate"), b=document.getElementById("siBody"); if(!g||!b) return;
  g.dataset.screen="reminders";
  let h='<div class="k">Practice reminder &middot; by email</div>'+
        '<h2 class="gateh" id="siTitle">When should we nudge you?</h2>';
  if(loading){
    h+='<p class="gatep">Loading your reminder...</p>';
  } else if(!rmState||rmState.error){
    h+='<p class="gatep">We couldn\'t load your reminder just now. Please check your connection and try again.</p>'+
       siBtn("Try again","openReminders()")+siBtn("Back to the app","closeSignin()","ghost");
  } else {
    const s=rmState, custom=RM_TIMES.indexOf(s.remind_at)<0, dz=rmZone(), dis=rmSaving?" disabled":"";
    h+='<div class="rmrow"><span id="rmOnLbl">Email me a practice reminder</span>'+
       '<button type="button" class="rmsw" role="switch" aria-checked="'+s.enabled+'" aria-labelledby="rmOnLbl" onclick="rmToggle(\'enabled\')"'+dis+'></button></div>'+
       '<div class="rmbody'+(s.enabled?'':' off')+'">'+
       '<div class="rmlbl">Time</div><div class="chips rmchips">'+
       RM_TIMES.map(t=>'<button type="button" class="chip'+(s.remind_at===t?' on':'')+'" aria-pressed="'+(s.remind_at===t)+'" onclick="rmSetTime(\''+t+'\')"'+dis+'>'+rmLabel(t)+'</button>').join("")+
       '<label class="chip rmother'+(custom?' on':'')+'">Other <input type="time" id="rmTime" step="300" value="'+(custom?esc(s.remind_at):"")+'" onchange="rmSetTime(this.value)" aria-label="Pick another time"'+dis+'></label></div>'+
       '<div class="rmlbl">Days</div><div class="chips rmchips">'+
       RM_DAYS.map(([n,l])=>{ const on=s.days.indexOf(n)>=0; return '<button type="button" class="chip'+(on?' on':'')+'" aria-pressed="'+on+'" onclick="rmToggleDay('+n+')"'+dis+'>'+l+'</button>'; }).join("")+'</div>'+
       '<div class="rmrow"><span id="rmSkipLbl">Skip it if I\'ve already practised that day</span>'+
       '<button type="button" class="rmsw" role="switch" aria-checked="'+s.skip_if_practised+'" aria-labelledby="rmSkipLbl" onclick="rmToggle(\'skip_if_practised\')"'+dis+'></button></div>'+
       '<div class="rmmail"><div class="rmlbl">The email you\'ll get</div>'+
       '<p><b>From:</b> Lean Guitarist</p><p><b>Subject:</b> '+esc(rmSubject(s.remind_at))+'</p>'+
       '<p class="rmmut">'+esc(rmTodayLine())+'</p></div>'+
       '<p class="sismall rmnote">Sent to <b>'+esc(String(sbUser.email||""))+'</b> at '+rmLabel(s.remind_at)+' '+esc(s.zone)+' time, give or take 15 minutes. Practice counts when you tick a day or a campfire skill, or start the practice timer, while signed in.</p>'+
       (s.zone!==dz ? '<p class="sismall rmnote">This reminder uses '+esc(s.zone)+' time. This device is on '+esc(dz)+' time. '+
         '<button type="button" class="silink" onclick="rmUseDeviceZone()"'+dis+'>Use '+esc(dz)+' time</button></p>' : '')+
       '</div>'+
       siBtn(rmSaving?"Saving...":"Save reminder","rmSave()","","rmSaveBtn")+
       siBtn("Back to the app","closeSignin()","ghost")+
       '<p class="sismall">Email only. Turn it off here any time.</p>';
  }
  b.innerHTML=h;
  g.style.display="flex";
  const sv=document.getElementById("rmSaveBtn"); if(sv&&rmSaving) sv.disabled=true;
}
function rmUseDeviceZone(){ if(!rmState||rmSaving) return; rmState.zone=rmZone(); renderReminders(); }
function rmSetTime(t){ const hm=rmHM(t); if(!rmState||rmSaving||!hm) return; rmState.remind_at=hm; renderReminders(); }
function rmToggleDay(n){
  if(!rmState||rmSaving) return;
  const i=rmState.days.indexOf(n);
  if(i>=0) rmState.days.splice(i,1); else rmState.days.push(n);
  rmState.days.sort((a,b)=>a-b);
  renderReminders();
}
function rmToggle(k){ if(!rmState||rmSaving) return; rmState[k]=!rmState[k]; renderReminders(); }
async function rmSave(){
  if(!rmState||rmSaving) return;
  if(!rmSignedIn()||sbUser.id!==rmLoadedFor){ toast("Please sign in again"); showSignin("signin"); return; }
  if(rmState.enabled && !rmState.days.length){ toast("Pick at least one day"); return; }
  const screen=rmScreen, wasOn=rmState.savedOn;
  const row={user_id:sbUser.id, enabled:rmState.enabled, remind_at:rmState.remind_at, days:[...rmState.days],
             time_zone:rmState.zone||rmZone(), skip_if_practised:rmState.skip_if_practised, saved:true};
  rmSaving=true; renderReminders();
  try{
    opsCost("reminders: save");
    const {error}=await sb.from("reminders").upsert(row,{onConflict:"user_id"});
    if(error) throw error;
    rmSaving=false;
    if(screen!==rmScreen) return;
    rmState.savedOn=row.enabled;
    closeSignin();
    toast(row.enabled ? "Saved. We'll email you at "+rmLabel(row.remind_at) : (wasOn ? "Reminders are off" : "Saved. Reminders are off"));
  }catch(e){
    rmSaving=false;
    opsErr("reminders: save",e);
    if(screen!==rmScreen) return;
    renderReminders();
    toast("Couldn't save your reminder. Please try again");
  }
}

/* ============ "PRACTISED TODAY" ============ */
/* Called on a tick (not an un-tick) and when the practice timer starts. The time
   of the practice is kept on this device first (per account), then sent at once;
   if the network drops or the page closes before it lands, it is sent with its
   own time later (see rmRetryLater, and on this player's next session start). The server keeps it
   within the last 24 hours and never moves it backwards. */
function rmPendingKey(uid){ return "lg_rm_practice:"+uid; }
function notePractised(){
  if(!rmSignedIn()) return;
  const uid=sbUser.id, at=new Date().toISOString();
  LS.set(rmPendingKey(uid),at);
  rmFlushPractice();
}
let rmRetryTimer=null, rmRetryWait=0;
/* A practice time that could not be sent is tried again when the connection
   comes back, when the app comes back into view, and on a timer (30 seconds,
   doubling up to 10 minutes) while the same player stays signed in. */
function rmRetryLater(){
  if(rmRetryTimer) return;
  rmRetryWait=Math.min(rmRetryWait ? rmRetryWait*2 : 30000, 600000);
  rmRetryTimer=setTimeout(()=>{ rmRetryTimer=null; rmFlushPractice(); }, rmRetryWait);
}
window.addEventListener("online",()=>rmFlushPractice());
document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="visible") rmFlushPractice(); });
async function rmFlushPractice(){
  if(!rmSignedIn()||rmPracticeBusy) return;
  const uid=sbUser.id, key=rmPendingKey(uid), at=LS.get(key,null);
  if(!at) return;
  rmPracticeBusy=true;
  try{
    opsCost("reminders: practised");
    const {error}=await sb.from("reminders").upsert({user_id:uid, last_practised_at:at},{onConflict:"user_id"});
    if(error) throw error;
    if(LS.get(key,null)===at){ try{ localStorage.removeItem(key); }catch(_){} }
    rmRetryWait=0; if(rmRetryTimer){ clearTimeout(rmRetryTimer); rmRetryTimer=null; }
  }catch(e){ opsErr("reminders: practised",e); rmRetryLater(); }
  finally{ rmPracticeBusy=false; }
  /* A practice that came in while this one was on its way. */
  const next=LS.get(key,null);
  if(next && next!==at && rmSignedIn() && sbUser.id===uid) rmFlushPractice();
}
