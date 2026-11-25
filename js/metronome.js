/* F5: the metronome, with tap tempo and an optional strum along.
   Opened with openMetronome() (the one-line hook is the "Metronome" button in
   index.html, Chords tab). Timing comes from LGClock in js/clock.js.
   Settings stay on this device (lg_metro), not in the synced progress. */
(function(){
  const MIN = 40, MAX = 200, KEY = "lg_metro";
  const saved = LS.get(KEY, {});
  const st = {
    bpm: clampBpm(saved.bpm || 80),
    beats: [2,3,4,6].includes(saved.beats) ? saved.beats : 4,
    accent: saved.accent !== false,
    strum: saved.strum || "",            // a PATTERNS id, or "" for clicks only
    chord: CHORD_ORDER.includes(saved.chord) ? saved.chord : "G",
    taps: []
  };
  let clock = null, built = false;

  function clampBpm(n){ return Math.min(MAX, Math.max(MIN, Math.round(Number(n) || 80))); }
  function save(){ LS.set(KEY, { bpm: st.bpm, beats: st.beats, accent: st.accent, strum: st.strum, chord: st.chord }); }
  function pattern(){ return PATTERNS.find(p => p.id === st.strum) || null; }
  const $ = id => document.getElementById(id);

  function getClock(){
    if (clock) return clock;
    clock = LGClock.create({
      bpm: st.bpm, beatsPerBar: st.beats, subdivision: st.strum ? 2 : 1,
      onSchedule(t){
        if (t.sub === 0) LGClock.click(t.time, t.beat === 0 && st.accent ? "accent" : "beat");
        const p = pattern();
        if (p) {
          const step = p.steps[t.index % p.steps.length];
          if (step === "D") strum(st.chord, "down", t.time, 0.7);
          else if (step === "U") strum(st.chord, "up", t.time, 0.6);
          else if (step === "x") chuck(t.time);
        }
      },
      onTick(t){
        if (t.sub !== 0) return;
        document.querySelectorAll("#mBeats i").forEach((el, i) => {
          el.classList.toggle("on", i === t.beat);
          el.classList.toggle("first", i === t.beat && i === 0 && st.accent);
        });
      }
    });
    return clock;
  }

  function build(){
    if (built) return; built = true;
    const m = document.createElement("div");
    m.id = "metroModal"; m.className = "modal f5-metro";
    m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true"); m.setAttribute("aria-labelledby", "metroTitle");
    m.innerHTML = `<div class="sheet">
      <div class="f5-head"><div><div class="k">Keep the beat</div><h3 id="metroTitle">Metronome</h3></div>
        <button class="iconbtn" aria-label="Close the metronome" onclick="closeMetronome()">&#10005;</button></div>
      <div class="f5-bpm">
        <button class="f5-step" id="mMinus" aria-label="Slower">&minus;</button>
        <div><div class="f5-big" id="mBpm" aria-live="polite">${st.bpm}</div><div class="f5-unit">beats a minute</div></div>
        <button class="f5-step" id="mPlus" aria-label="Faster">+</button>
      </div>
      <input type="range" class="f5-slider" id="mSlider" min="${MIN}" max="${MAX}" step="1" value="${st.bpm}" aria-label="Tempo, beats a minute">
      <div class="f5-beats" id="mBeats" aria-hidden="true"></div>
      <div class="f5-row"><button class="btn f5-play" id="mPlay" aria-label="Play">${PLAY_SVG}<span>Play</span></button>
        <button class="btn blue f5-tap" id="mTap">Tap tempo</button></div>
      <div class="f5-tapnote" id="mTapNote">Tap the blue button 4 times on the beat to set the speed.</div>
      <div class="f5-label">Beats in a bar</div>
      <div class="chips f5-chips" id="mBar"></div>
      <label class="f5-toggle"><input type="checkbox" id="mAccent" aria-label="Louder first beat" ${st.accent ? "checked" : ""}> Louder first beat</label>
      <div class="f5-label">Strum along</div>
      <div class="chips f5-chips" id="mStrum"></div>
      <div class="chips f5-chips" id="mChord"></div>
    </div>`;
    document.body.appendChild(m);
    m.addEventListener("click", e => { if (e.target === m) closeMetronome(); });

    holdRepeat($("mMinus"), () => setBpm(st.bpm - 1));
    holdRepeat($("mPlus"), () => setBpm(st.bpm + 1));
    $("mSlider").addEventListener("input", e => setBpm(e.target.value));
    $("mPlay").addEventListener("click", toggle);
    $("mTap").addEventListener("pointerdown", e => { e.preventDefault(); tap(); });
    $("mTap").addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tap(); } });
    $("mAccent").addEventListener("change", e => { st.accent = e.target.checked; save(); });
    renderChips();
  }

  function renderChips(){
    $("mBar").innerHTML = [2,3,4,6].map(n => `<button class="chip ${n === st.beats ? "on" : ""}" data-n="${n}">${n}</button>`).join("");
    $("mBar").querySelectorAll("button").forEach(b => b.onclick = () => { st.beats = +b.dataset.n; if (clock) clock.setBeatsPerBar(st.beats); save(); renderChips(); });
    $("mStrum").innerHTML = `<button class="chip ${!st.strum ? "on" : ""}" data-p="">Clicks only</button>` +
      PATTERNS.map(p => `<button class="chip ${p.id === st.strum ? "on" : ""}" data-p="${p.id}">${p.name.replace(/^The /, "")}</button>`).join("");
    $("mStrum").querySelectorAll("button").forEach(b => b.onclick = () => setStrum(b.dataset.p));
    $("mChord").style.display = st.strum ? "" : "none";
    $("mChord").innerHTML = CHORD_ORDER.map(c => `<button class="chip ${c === st.chord ? "on red" : ""}" data-c="${c}">${c}</button>`).join("");
    $("mChord").querySelectorAll("button").forEach(b => b.onclick = () => { st.chord = b.dataset.c; save(); renderChips(); });
    $("mBeats").innerHTML = Array.from({ length: st.beats }, () => "<i></i>").join("");
  }

  function setStrum(id){
    const was = clock && clock.running;
    st.strum = id; save();
    if (clock) { clock.stop(); clock = null; }   // the strum needs eighth notes: start a fresh clock in time
    renderChips();
    if (was) start();
  }
  function setBpm(n){
    st.bpm = clampBpm(n);
    $("mBpm").textContent = st.bpm; $("mSlider").value = st.bpm;
    if (clock) clock.setBpm(st.bpm);
    save();
  }
  function tap(){
    const now = performance.now();
    if (st.taps.length && now - st.taps[st.taps.length - 1] > 2000) st.taps = [];
    st.taps.push(now); if (st.taps.length > 6) st.taps.shift();
    const n = st.taps.length;
    if (n < 2) { $("mTapNote").textContent = "Keep tapping on the beat..."; return; }
    const gaps = []; for (let i = 1; i < n; i++) gaps.push(st.taps[i] - st.taps[i - 1]);
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const bpm = 60000 / avg;
    setBpm(bpm);
    $("mTapNote").textContent = bpm < MIN ? "That's slower than " + MIN + ", so it's set to " + MIN + "." :
      bpm > MAX ? "That's faster than " + MAX + ", so it's set to " + MAX + "." :
      n < 4 ? "Set to " + st.bpm + ". Tap a few more times to fine-tune." : "Set to " + st.bpm + " from your taps.";
  }
  function holdRepeat(btn, fn){
    let h = null, r = null;
    const stopRep = () => { clearTimeout(h); clearInterval(r); h = r = null; };
    btn.addEventListener("pointerdown", e => { e.preventDefault(); fn(); h = setTimeout(() => { r = setInterval(fn, 70); }, 420); });
    ["pointerup", "pointerleave", "pointercancel"].forEach(ev => btn.addEventListener(ev, stopRep));
    btn.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } });
  }

  function start(){
    seqStop();   // stop any strum pattern playing elsewhere
    getClock().start();
    $("mPlay").innerHTML = STOP_SVG + "<span>Stop</span>"; $("mPlay").setAttribute("aria-label", "Stop"); $("mPlay").classList.add("playing");
  }
  function stop(){
    if (clock) clock.stop();
    if (built) { $("mPlay").innerHTML = PLAY_SVG + "<span>Play</span>"; $("mPlay").setAttribute("aria-label", "Play"); $("mPlay").classList.remove("playing");
      document.querySelectorAll("#mBeats i").forEach(el => el.classList.remove("on", "first")); }
  }
  function toggle(){ (clock && clock.running) ? stop() : start(); }

  window.openMetronome = function(){ build(); $("metroModal").classList.add("show"); $("mPlay").focus({ preventScroll: true }); };
  window.closeMetronome = function(){ stop(); const m = $("metroModal"); if (m) m.classList.remove("show"); };
  document.addEventListener("keydown", e => { if (e.key === "Escape" && $("metroModal") && $("metroModal").classList.contains("show")) closeMetronome(); });
  window.LGMetronome = { open: window.openMetronome, close: window.closeMetronome, get clock(){ return clock; }, state: st };
})();
