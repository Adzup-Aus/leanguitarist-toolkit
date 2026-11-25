/* F3: the practice log, the streak and the campfire-ready score.
   Every practice entry (a run of the practice timer, a 21-day plan day ticked done)
   is kept on this device first ("lg_plog"), then sent to the Supabase table
   public.practice_log when the player is signed in and on the buyer list. The
   streak and the score are worked out here from those entries; the rules are in
   docs/001-app-next-version-prd.md, section 5a, and tests/f3-rules.test.js checks
   them. Loaded after account.js and reminders.js, before home.js. */

/* ============ THE RULES (pure: no page, no storage) ============ */
const PL_REST_DAYS=2;          /* rest days allowed in each Monday-to-Sunday week */
const PL_MIN_SECONDS=60;       /* a day counts with at least 1 minute on the timer, or a plan day ticked */
const PL_WEEK_TARGET_MIN=70;   /* 10 minutes a day: full marks for practice in the score */
const PL_CAMPFIRE_ITEMS=19, PL_PLAN_DAYS=21;

function plYmd(dt){ return dt.getFullYear()+"-"+String(dt.getMonth()+1).padStart(2,"0")+"-"+String(dt.getDate()).padStart(2,"0"); }
function plAddDays(ymd,n){ const p=ymd.split("-").map(Number); return new Date(Date.UTC(p[0],p[1]-1,p[2])+n*86400000).toISOString().slice(0,10); }
function plWeekday(ymd){ const p=ymd.split("-").map(Number); const w=new Date(Date.UTC(p[0],p[1]-1,p[2])).getUTCDay(); return w===0?7:w; } /* 1 Monday ... 7 Sunday */
function plWeekStart(ymd){ return plAddDays(ymd,1-plWeekday(ymd)); }

/* entries: [{d:"YYYY-MM-DD", k:kind, s:seconds}] -> {day:{secs,ticks}} */
function plDayTotals(entries){
  const t={};
  (entries||[]).forEach(e=>{ if(!e||!e.d) return; const x=t[e.d]||(t[e.d]={secs:0,ticks:0});
    if(e.k==="tick") x.ticks++; else x.secs+=Math.max(0,Number(e.s)||0); });
  return t;
}
function plPractised(totals,day){ const x=totals[day]; return !!x && (x.ticks>0 || x.secs>=PL_MIN_SECONDS); }

/* The streak. Walks back from today. A practised day adds 1. A day without practice
   is a rest day while its Monday-to-Sunday week has had no more than 2 of them inside
   the streak; the third ends the streak. Today never counts against it (the day is
   not over). Rest days only count between practised days of the streak or after its
   latest practised day, never before its first one. */
function plStreak(totals,today){
  const days=Object.keys(totals).filter(d=>plPractised(totals,d)).sort();
  const out={days:0,restDays:[],restLeft:PL_REST_DAYS,practisedToday:plPractised(totals,today),start:null};
  if(!days.length) return out;
  const first=days[0], missed={}; let pendingRest=[], d=today;
  if(out.practisedToday){ out.days=1; out.start=today; }
  d=plAddDays(today,-1);
  while(d>=first){
    if(plPractised(totals,d)){ out.days++; out.start=d; out.restDays=out.restDays.concat(pendingRest); pendingRest=[]; }
    else{ const w=plWeekStart(d); missed[w]=(missed[w]||0)+1; if(missed[w]>PL_REST_DAYS) break; pendingRest.push(d); }
    d=plAddDays(d,-1);
  }
  /* rest days after the latest practised day (this week, before today) also count */
  if(out.days>0){
    const latest=out.practisedToday?today:days.filter(x=>x<today).pop();
    out.restDays=out.restDays.filter(x=>x>=out.start);
    for(let x=plAddDays(today,-1); x>latest; x=plAddDays(x,-1)) if(out.restDays.indexOf(x)<0) out.restDays.push(x);
  } else out.restDays=[];
  out.restDays.sort();
  const wk=plWeekStart(today);
  const usedThisWeek=out.restDays.filter(x=>x>=wk && x<today).length;
  out.restLeft=out.days>0 ? Math.max(0,PL_REST_DAYS-usedThisWeek) : PL_REST_DAYS;
  return out;
}

/* Minutes for each day Monday to Sunday of today's week. */
function plWeekMinutes(totals,today){
  const wk=plWeekStart(today), out=[];
  for(let i=0;i<7;i++){ const d=plAddDays(wk,i); out.push({d, min:Math.round(((totals[d]||{}).secs||0)/60), future:d>today}); }
  return out;
}
/* Minutes this week, Monday to Sunday: the week's seconds, rounded once. */
function plWeekTotal(totals,today){
  const wk=plWeekStart(today); let s=0; for(let i=0;i<7;i++) s+=((totals[plAddDays(wk,i)]||{}).secs||0); return Math.round(s/60);
}
/* Minutes in the last n days, today included. */
function plMinutesLast(totals,today,n){
  let s=0; for(let i=0;i<n;i++){ s+=((totals[plAddDays(today,-i)]||{}).secs||0); } return Math.round(s/60);
}
/* The campfire-ready score, 0 to 100: the campfire checklist is 60 points, the
   21-day plan 20 points, and the last 7 days' practice 20 points (70 minutes or
   more is full marks). */
/* Each part is rounded on its own and the total is their sum, so the lines under
   the score always add up to it. */
function plScore(campfireTicked,planDaysTicked,minutes7){
  const c=Math.min(Math.max(campfireTicked,0),PL_CAMPFIRE_ITEMS)/PL_CAMPFIRE_ITEMS*60;
  const p=Math.min(Math.max(planDaysTicked,0),PL_PLAN_DAYS)/PL_PLAN_DAYS*20;
  const m=Math.min(Math.max(minutes7,0),PL_WEEK_TARGET_MIN)/PL_WEEK_TARGET_MIN*20;
  const parts={campfire:Math.round(c), plan:Math.round(p), practice:Math.round(m)};
  return {total:parts.campfire+parts.plan+parts.practice, campfire:parts.campfire, plan:parts.plan, practice:parts.practice};
}

if(typeof module!=="undefined" && module.exports){
  module.exports={plYmd,plAddDays,plWeekday,plWeekStart,plDayTotals,plPractised,plStreak,plWeekMinutes,plWeekTotal,plMinutesLast,plScore};
}

/* ============ THE LOG ON THIS DEVICE ============ */
/* Each entry: {id, d (the device's date), k (kind), s (seconds), r (plan day or null),
   at (when, ISO), u (the account it belongs to, or null when signed out),
   st (0 waiting to send, 1 sent, 2 refused by the server and kept on this device only)}.
   An entry made while signed out joins the account of the next player who signs in
   on this device, as the ticks do (F1). */
const PL_KEY="lg_plog", PL_RUN_KEY="lg_plog_run";
const PL_KINDS=["timer","tick","routine","drill","metronome","playalong","tuner","song"];
function plStore(){ return (typeof LS!=="undefined") ? LS : {get:(k,d)=>d,set:()=>{}}; }
function plLoad(){ const a=plStore().get(PL_KEY,[]); return Array.isArray(a)?a:[]; }
function plSave(a){ plStore().set(PL_KEY,a); }
function plSrvKey(uid){ return "lg_plog_srv:"+uid; }
function plUuid(){
  try{ if(window.crypto&&crypto.randomUUID) return crypto.randomUUID(); }catch(_){}
  const b=new Uint8Array(16); try{ crypto.getRandomValues(b); }catch(_){ for(let i=0;i<16;i++) b[i]=Math.floor(Math.random()*256); }
  b[6]=(b[6]&15)|64; b[8]=(b[8]&63)|128; const h=[...b].map(x=>x.toString(16).padStart(2,"0")).join("");
  return h.slice(0,8)+"-"+h.slice(8,12)+"-"+h.slice(12,16)+"-"+h.slice(16,20)+"-"+h.slice(20);
}
function plSignedIn(){ return !!(typeof sb!=="undefined" && sb && typeof sbUser!=="undefined" && sbUser && typeof accessOk!=="undefined" && accessOk); }
function plToday(){ return plYmd(new Date()); }
function plChanged(){ if(typeof renderHome==="function") renderHome(); }

/* Adds one entry. kind: one of PL_KINDS; seconds: 1 to 21600 (0 for a tick);
   routineDay: 1 to 21 or null. For other features too (metronome, routine, play-along). */
function plAdd(kind,seconds,routineDay,id,day,owner){
  if(PL_KINDS.indexOf(kind)<0) return null;
  let s=Math.round(Number(seconds)||0);
  if(kind!=="tick" && s<1) return null;
  s=Math.min(Math.max(s,0),21600);
  const r=(routineDay>=1&&routineDay<=21)?Math.round(routineDay):null;
  const e={id:id||plUuid(), d:day||plToday(), k:kind, s:kind==="tick"?0:s, r, at:new Date().toISOString(), u:owner!==undefined?owner:(plSignedIn()?sbUser.id:null), st:0};
  const a=plLoad(); if(a.some(x=>x.id===e.id)) return null;
  a.push(e); plSave(plPrune(a)); plChanged(); plSync(); return e;
}
/* A 21-day plan day ticked done counts as practice on the day it is ticked (once a
   day per plan day). An un-tick does not take back that day's practice. */
function plPlanTick(day,on){
  if(on){ const t=plToday(); if(!plViewEntries().some(e=>e.k==="tick"&&e.r===day&&e.d===t)) plAdd("tick",0,day); }
  plChanged();
}
function plPrune(a){ const old=plAddDays(plToday(),-400); return a.filter(e=>e.d>=old || e.st===0); }

/* What the page shows: signed in, this account's entries (from this device and the
   server); signed out, everything kept on this device. */
function plViewEntries(){
  const local=plLoad(), seen={}, out=[];
  const uid=plSignedIn()?sbUser.id:null;
  local.forEach(e=>{ if(uid && e.u && e.u!==uid) return; seen[e.id]=1; out.push(e); });
  if(uid){ const srv=plStore().get(plSrvKey(uid),[]); (Array.isArray(srv)?srv:[]).forEach(e=>{ if(!seen[e.id]){ seen[e.id]=1; out.push(e); } }); }
  return out;
}
function plSummary(){
  const today=plToday(), totals=plDayTotals(plViewEntries());
  let cf=0; if(typeof CAMPFIRE!=="undefined") CAMPFIRE.forEach((g,gi)=>g.items.forEach((_,ii)=>{ if(campfireDone[gi+"-"+ii]) cf++; }));
  let plan=0; for(let d=1;d<=21;d++) if(typeof practiceDone!=="undefined" && practiceDone[d]) plan++;
  const min7=plMinutesLast(totals,today,7);
  return {today, totals, streak:plStreak(totals,today), week:plWeekMinutes(totals,today), weekMin:plWeekTotal(totals,today), min7,
    campfire:cf, plan, score:plScore(cf,plan,min7)};
}

/* ============ THE PRACTICE TIMER ============ */
/* js/fingers.js calls these. While a run goes on, its seconds so far are kept on the
   device under its own key ("lg_plog_run:<id>") with the account it started under and
   a heartbeat, so a page closed mid-session still logs what was done. It is written
   with localStorage directly (not LS.set). Another tab or the next start logs a run
   only when its heartbeat is over 3 minutes old (a hidden tab can be held back up to
   a minute), and plAdd() never logs the same run id twice. */
const PL_RUN_PREFIX="lg_plog_run:", PL_RUN_STALE_MS=180000;
let plRunId=null;
function plRunGet(id){ try{ return JSON.parse(localStorage.getItem(PL_RUN_PREFIX+id)); }catch(_){ return null; } }
function plRunPut(run){ try{ localStorage.setItem(PL_RUN_PREFIX+run.id,JSON.stringify(run)); }catch(_){} }
function plRunDrop(id){ try{ localStorage.removeItem(PL_RUN_PREFIX+id); }catch(_){} }
function plTimerStart(){
  const run={id:plUuid(), d:plToday(), s:0, u:plSignedIn()?sbUser.id:null, hb:Date.now()};
  plRunId=run.id; plRunPut(run);
}
/* counted: the seconds this run has counted so far (from the clock). */
function plTick(counted){
  if(!plRunId) return;
  const run=plRunGet(plRunId)||{id:plRunId, d:plToday(), s:0, u:plSignedIn()?sbUser.id:null};
  run.s=Math.max(run.s||0, Math.round(Number(counted)||0)); run.hb=Date.now(); plRunPut(run);
  if(typeof homeTimerTick==="function") homeTimerTick();
}
function plTimerStop(){
  const id=plRunId; plRunId=null; if(!id){ plChanged(); return; }
  const run=plRunGet(id); plRunDrop(id);
  if(run && run.s>0) plAdd("timer",run.s,null,run.id,run.d,run.u===undefined?null:run.u);
  else plChanged();
}
function plRecoverRuns(){ /* runs left by a page that was closed while its timer ran */
  const now=Date.now(), found=[];
  try{ for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k && k.indexOf(PL_RUN_PREFIX)===0) found.push(k.slice(PL_RUN_PREFIX.length)); } }catch(_){ return; }
  found.forEach(id=>{
    if(id===plRunId) return;
    const run=plRunGet(id);
    if(!run){ plRunDrop(id); return; }
    if(now-(run.hb||0)<PL_RUN_STALE_MS) return; /* still running in another tab */
    plRunDrop(id);
    if(run.s>0) plAdd("timer",run.s,null,run.id,run.d,run.u===undefined?null:run.u);
  });
}
setTimeout(plRecoverRuns,0);

/* ============ SENDING TO THE ACCOUNT ============ */
let plBusy=false, plAgain=false, plRetryTimer=null, plRetryWait=0, plLastPull=0;
const PL_PERMANENT=["22008","23514","22P02","22007","23502"]; /* a row the server will never take */
function plOpsErr(task,e){ try{ if(window.LGOps) LGOps.logError(task,e); }catch(_){} }
function plOpsCost(task){ try{ if(window.LGOps) LGOps.logCost(task,"supabase:call",1); }catch(_){} }
function plRow(e){ return {id:e.id, user_id:e.u, day:e.d, kind:e.k, seconds:e.s, routine_day:e.r, logged_at:e.at}; }
/* Every request belongs to the account the sync started for; it stops when that changes. */
function plStill(uid){ return plSignedIn() && sbUser.id===uid; }
function plMark(ids,st){ const set={}; ids.forEach(i=>set[i]=1); const a=plLoad(); a.forEach(e=>{ if(set[e.id]) e.st=st; }); plSave(a); }

async function plSync(){
  if(!plSignedIn()) return;
  if(plBusy){ plAgain=true; return; }
  plBusy=true; plAgain=false;
  const uid=sbUser.id;
  try{
    /* entries made while signed out join this account */
    const a=plLoad(); let moved=false; a.forEach(e=>{ if(!e.u){ e.u=uid; moved=true; } }); if(moved) plSave(a);
    const waiting=plLoad().filter(e=>e.u===uid && e.st===0);
    for(let i=0;i<waiting.length;i+=50){
      if(!plStill(uid)) return;
      const batch=waiting.slice(i,i+50);
      plOpsCost("practice log: send");
      const {error}=await sb.from("practice_log").upsert(batch.map(plRow),{onConflict:"id",ignoreDuplicates:true});
      if(!error){ plMark(batch.map(e=>e.id),1); continue; }
      if(PL_PERMANENT.indexOf(String(error.code))<0) throw error;
      for(const e of batch){ /* find the row the server refuses; keep it on this device only */
        if(!plStill(uid)) return;
        const r=await sb.from("practice_log").upsert([plRow(e)],{onConflict:"id",ignoreDuplicates:true});
        if(!r.error) plMark([e.id],1);
        else if(PL_PERMANENT.indexOf(String(r.error.code))>=0){ plMark([e.id],2); plOpsErr("practice log: refused",r.error); }
        else throw r.error;
      }
    }
    if(!plStill(uid)) return;
    /* read back this account's entries from the last 400 days (every device) */
    const from=plAddDays(plToday(),-400), rows=[];
    for(let off=0; off<20000; off+=1000){
      if(!plStill(uid)) return;
      plOpsCost("practice log: read");
      const {data,error}=await sb.from("practice_log").select("id,day,kind,seconds,routine_day").gte("day",from).order("day").order("id").range(off,off+999);
      if(error) throw error;
      (data||[]).forEach(x=>rows.push({id:x.id,d:x.day,k:x.kind,s:x.seconds,r:x.routine_day}));
      if(!data || data.length<1000) break;
    }
    if(!plStill(uid)) return;
    plStore().set(plSrvKey(uid),rows); plLastPull=Date.now();
    plRetryWait=0; if(plRetryTimer){ clearTimeout(plRetryTimer); plRetryTimer=null; }
    plChanged();
  }catch(e){
    plOpsErr("practice log: sync",e);
    if(!plRetryTimer){ plRetryWait=Math.min(plRetryWait?plRetryWait*2:30000,600000); plRetryTimer=setTimeout(()=>{ plRetryTimer=null; plSync(); },plRetryWait); }
  }finally{
    plBusy=false;
    if(plAgain) plSync();
  }
}
window.addEventListener("online",()=>plSync());
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState!=="visible") return;
  plChanged(); /* a new day may have started */
  if(Date.now()-plLastPull>20000) plSync();
});
