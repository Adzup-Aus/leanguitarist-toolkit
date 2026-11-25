/* F3: the Home screen, the Tools screen and the progress card at the top of the
   Progress tab (the Campfire Ready checklist). Numbers come from js/practice-log.js.
   renderHome() redraws all three; it is cheap and is called after any change. */

const HM_DAYS=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const HM_MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
const HM_TIMER_MIN=10;

function hmPlanDay(){ for(let d=1;d<=21;d++){ if(!practiceDone[d]) return d; } return 0; }
function hmStreakLine(st){
  if(st.days===0) return st.practisedToday?"":"Practise today to start one";
  if(!st.practisedToday && st.restLeft===0) return "No rest days left this week";
  return st.restLeft===1?"1 rest day left this week":st.restLeft+" rest days left this week";
}
function hmTimerRunning(){ return typeof timerOn!=="undefined" && timerOn; }
function hmClockText(){ return (typeof fmt==="function" && typeof timerLeft!=="undefined") ? fmt(Math.max(0,timerLeft)) : ""; }

function hmWeekChart(week,today){
  const W=300,H=128,base=100,top=16,bw=28,gap=(W-24-7*bw)/6;
  const max=Math.max(20,...week.map(x=>x.min));
  let s=`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Minutes practised each day this week">`;
  week.forEach((p,i)=>{
    const x=20+i*(bw+gap), h=p.min?Math.max(3,(p.min/max)*(base-top)):0, isToday=p.d===today;
    const lbl=HM_DAYS[i].slice(0,1);
    if(p.min) s+=`<rect x="${x}" y="${base-h}" width="${bw}" height="${h}" rx="4" fill="${isToday?'#d30e0f':'#048c0d'}"/>`+
      `<text x="${x+bw/2}" y="${base-h-4}" font-size="10" text-anchor="middle" fill="#141414" font-weight="700">${p.min}</text>`;
    else s+=`<rect x="${x}" y="${base-2}" width="${bw}" height="2" rx="1" fill="${p.future?'#efeae3':'#e3ddd6'}"/>`;
    s+=`<text x="${x+bw/2}" y="${base+16}" font-size="11" text-anchor="middle" fill="${isToday?'#d30e0f':'#6b6258'}" font-weight="${isToday?700:400}">${lbl}</text>`;
  });
  return s+`</svg>`;
}

function renderHome(){
  const box=document.getElementById("t-home"); if(!box) return;
  const S=plSummary(), now=new Date(), wd=(now.getDay()+6)%7;
  const pd=hmPlanDay(), t=pd?PRACTICE[pd-1]:null, running=hmTimerRunning();
  const weekMin=S.week.reduce((a,x)=>a+x.min,0);
  const signedIn=plSignedIn(), canSign=typeof SYNC_ON!=="undefined" && SYNC_ON;
  box.innerHTML=`
    <div class="tabhead"><div class="k">${HM_DAYS[wd]} ${now.getDate()} ${HM_MONTHS[now.getMonth()]}</div>
      <h2>${t?`Day ${pd}: ${esc(t[0])}`:"All 21 days done"}</h2></div>
    <div class="card hm-today">
      <div class="k">Today's practice${t?` &middot; day ${pd} of 21`:""}</div>
      <p>${t?esc(t[1]):"Play anything you love. Keep the streak going with 10 minutes a day."}</p>
      <div class="hm-timer">
        <div class="hm-clock" id="hmClock" aria-live="off">${running?hmClockText():HM_TIMER_MIN+":00"}</div>
        <button class="btn" id="hmTimerBtn" onclick="hmTimer()">${running?"Pause":"Start "+HM_TIMER_MIN+" minutes"}</button>
      </div>
      ${t?`<button class="btn ghost hm-tick" onclick="hmTickToday(${pd})">&#10003; Tick day ${pd} done</button>`:""}
    </div>
    <div class="hm-stats">
      <button class="hm-stat" onclick="switchTab('ready')"><b>${S.streak.days}</b><span>day streak</span><small>${hmStreakLine(S.streak)}</small></button>
      <button class="hm-stat" onclick="switchTab('ready')"><b>${S.score.total}</b><span>campfire-ready score</span><small>out of 100</small></button>
      <button class="hm-stat" onclick="switchTab('ready')"><b>${weekMin}</b><span>minutes this week</span><small>Monday to Sunday</small></button>
    </div>
    <div class="card hm-week"><b>This week: ${weekMin} minute${weekMin===1?"":"s"}</b>${hmWeekChart(S.week,S.today)}
      <p class="hm-note">Minutes come from the practice timer here and on the Fingers screen.</p></div>
    ${signedIn?"":(canSign?`<button class="rmcard" type="button" onclick="openAcct()"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5zm0 2c-4.4 0-9 2.2-9 5v1h18v-1c0-2.8-4.6-5-9-5z"/></svg><span><b>Your practice is saved on this device</b><small>Sign in to keep it on every device. Free for students.</small></span></button>`:"")}`;
  renderProgressCard(S);
}

/* The timer here is the same practice timer as on the Fingers screen (js/fingers.js). */
function hmTimer(){
  if(hmTimerRunning()){ stopTimer(); renderHome(); return; }
  if(!(typeof timerLeft!=="undefined" && timerLeft>0 && timerLeft<timerTotal && timerTotal===HM_TIMER_MIN*60)) setTimer(HM_TIMER_MIN);
  startTimer(); renderHome();
}
function homeTimerTick(){
  const c=document.getElementById("hmClock"); if(c) c.textContent=hmClockText();
}
function hmTickToday(d){ if(!practiceDone[d]) toggleDay(d); toast("Day "+d+" ticked. Nice work"); }

function renderTools(){
  const box=document.getElementById("toolList"); if(!box) return;
  box.innerHTML=TABS.filter(t=>t.parent==="tools").map(t=>
    `<button class="hm-tool" onclick="switchTab('${t.id}')"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${t.icon}</svg><span><b>${esc(t.label)}</b><small>${esc(t.desc||"")}</small></span></button>`).join("");
}

/* Top of the Progress tab: the score with its parts, the streak and 5 weeks of days. */
function renderProgressCard(S){
  const ready=document.getElementById("t-ready"); if(!ready) return;
  let box=document.getElementById("f3Progress");
  if(!box){ box=document.createElement("div"); box.id="f3Progress"; const v=document.getElementById("verdict"); ready.insertBefore(box,v); }
  S=S||plSummary();
  const sc=S.score, st=S.streak, rest={}; st.restDays.forEach(d=>rest[d]=1);
  const start=plAddDays(plWeekStart(S.today),-28); let cells="";
  for(let i=0;i<35;i++){
    const d=plAddDays(start,i), x=S.totals[d]||{secs:0,ticks:0}, m=Math.round(x.secs/60);
    let cls="", tip=d;
    if(d>S.today){ cls="fut"; tip+=": still to come"; }
    else if(plPractised(S.totals,d)){ cls=m>=20?"l3":m>=10?"l2":"l1"; tip+=": "+(m?m+" min":"plan day ticked"); }
    else if(rest[d]){ cls="rest"; tip+=": rest day, streak kept"; }
    else tip+=": no practice";
    if(d===S.today) cls+=" today";
    cells+=`<i class="${cls}" title="${tip}"></i>`;
  }
  box.innerHTML=`
    <div class="card hm-score">
      <div class="k">Campfire-ready score</div>
      <div class="hm-big">${sc.total}<small>/100</small></div>
      <div class="bar"><i style="width:${sc.total}%"></i></div>
      <div class="hm-parts">
        <span><b>${sc.campfire}</b> of 60 &middot; ${S.campfire} of 19 campfire skills ticked</span>
        <span><b>${sc.plan}</b> of 20 &middot; ${S.plan} of 21 plan days done</span>
        <span><b>${sc.practice}</b> of 20 &middot; ${S.min7} of 70 minutes in the last 7 days</span>
      </div>
    </div>
    <div class="card hm-cal">
      <b>${st.days} day streak${st.days?` &middot; ${hmStreakLine(st).toLowerCase()}`:""}</b>
      <div class="hm-calhead">${HM_DAYS.map(x=>`<span>${x.slice(0,1)}</span>`).join("")}</div>
      <div class="hm-grid" aria-label="Practice over the last 5 weeks">${cells}</div>
      <div class="hm-legend"><span><i class="l2"></i>practised</span><span><i class="rest"></i>rest day, streak kept</span><span><i></i>no practice</span></div>
      <p class="hm-note">A day counts when you practise at least 1 minute on the timer or tick a day of the 21-day plan. Each week, Monday to Sunday, up to 2 days off are rest days and keep your streak going; a third day off ends it.</p>
    </div>`;
}

/* js/core.js switchTab() calls this after a tab is shown. */
function onTabShown(id){ if(id==="home"||id==="ready") renderHome(); else if(id==="tools") renderTools(); }
