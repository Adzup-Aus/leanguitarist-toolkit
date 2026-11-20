/* ============ RENDER: FINGERS ============ */
function renderFinger(){
  document.getElementById("fingerAcc").innerHTML=FINGER.map((f,i)=>`<div class="acc ${f.open?'open':''}" id="acc-${i}">
    <button onclick="document.getElementById('acc-${i}').classList.toggle('open')">${f.q}<span class="chev">&#9662;</span></button>
    <div class="body">${f.html}</div></div>`).join("");
}
let timerTotal=15*60, timerLeft=15*60, timerOn=false, timerH=null;
function fmt(s){const m=Math.floor(s/60),x=s%60;return m+":"+String(x).padStart(2,"0");}
function setTimer(min){timerTotal=min*60;timerLeft=timerTotal;stopTimer();document.getElementById("clock").textContent=fmt(timerLeft);}
function toggleTimer(){timerOn?stopTimer():startTimer();}
function startTimer(){ensureAudio();timerOn=true;if(typeof notePractised==="function")notePractised();document.getElementById("timerBtn").textContent="Pause";
  timerH=setInterval(()=>{timerLeft--;document.getElementById("clock").textContent=fmt(Math.max(0,timerLeft));
    if(timerLeft<=0){stopTimer();timerLeft=timerTotal;document.getElementById("clock").textContent=fmt(timerLeft);beep();toast("Time. Put the guitar down. ✓");}},1000);}
function stopTimer(){timerOn=false;if(timerH)clearInterval(timerH);document.getElementById("timerBtn").textContent="Start";}
function beep(){ensureAudio();const t=ctx.currentTime;[660,880].forEach((f,i)=>{const o=ctx.createOscillator();o.type="sine";o.frequency.value=f;const g=ctx.createGain();g.gain.setValueAtTime(0,t+i*0.18);g.gain.linearRampToValueAtTime(0.2,t+i*0.18+0.02);g.gain.exponentialRampToValueAtTime(0.001,t+i*0.18+0.16);o.connect(g).connect(master);o.start(t+i*0.18);o.stop(t+i*0.18+0.18);});}
