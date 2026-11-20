/* ============ RENDER: PRACTICE ============ */
function renderPractice(){
  const done=Object.values(practiceDone).filter(Boolean).length;
  document.getElementById("progText").textContent=done+" of 21 days";
  document.getElementById("progBar").style.width=(done/21*100)+"%";
  let todayIdx=-1; for(let d=1;d<=21;d++){if(!practiceDone[d]){todayIdx=d;break;}}
  const tb=document.getElementById("todayBox");
  if(todayIdx>0){const t=PRACTICE[todayIdx-1];
    tb.innerHTML=`<div class="card today"><div class="k" style="color:var(--red);font-weight:700;font-size:11px;letter-spacing:.08em;text-transform:uppercase">Day ${todayIdx} &middot; today's focus</div>
    <div style="font-family:var(--serif);font-size:20px;margin:3px 0 2px">${t[0]}</div>
    <div style="color:var(--muted);font-size:13.5px;line-height:1.45">${t[1]}</div></div>`;
  } else { tb.innerHTML=`<div class="card today" style="text-align:center"><div style="font-family:var(--serif);font-size:22px;color:var(--green)">All 21 days done. You made it. &#127881;</div></div>`; }
  const weeks=[["Week 1","Your first two chords and first songs",0,7],["Week 2","The fourth chord and your full catalog",7,14],["Week 3","Performance ready",14,21]];
  document.getElementById("practiceList").innerHTML=weeks.map(([wl,ws,a,b])=>{
    let h=`<div class="weeklbl">${wl} <span style="font-family:var(--sans);font-size:12px;color:var(--muted);font-weight:400">${ws}</span></div>`;
    for(let d=a+1;d<=b;d++){const t=PRACTICE[d-1];const done=!!practiceDone[d];
      h+=`<div class="day ${done?'done':''}" onclick="toggleDay(${d})"><div class="num">${d}</div>
        <div style="flex:1"><div class="focus">${t[0]}</div><div class="what">${t[1]}</div></div>
        <div class="check">${done?'&#10003;':''}</div></div>`;}
    return h;
  }).join("");
}
function toggleDay(d){practiceDone[d]=!practiceDone[d];if(practiceDone[d]&&typeof notePractised==="function")notePractised();LS.set("ccf_practice",practiceDone);renderPractice();}
function resetPractice(){practiceDone={};LS.set("ccf_practice",practiceDone);renderPractice();toast("Tracker reset");}
