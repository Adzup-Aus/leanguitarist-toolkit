/* F5: the shared beat clock. Reused by the metronome (F5), the routine (F6),
   play-along (F7) and the live coach (F8).

   Timing is done by the Web Audio clock, not by setTimeout: a light timer
   (in a Web Worker where possible, so a busy page or a background tab does not
   slow it) wakes every 25 ms and books every tick that falls in the next
   120 ms at its exact audio time. Sounds are started at tick.time, so they land
   on the sample whatever the page is doing.

   const clock = LGClock.create({
     bpm: 90,            // beats a minute (20 to 300)
     beatsPerBar: 4,     // beats in a bar
     subdivision: 1,     // ticks per beat (2 = eighth notes, 4 = sixteenths)
     onSchedule(tick){}, // called ahead of time: start sounds at tick.time
     onTick(tick){}      // called on screen at about tick.time: move the lights
   });
   tick = { time,      // AudioContext time in seconds
            index,     // tick count since start (0, 1, 2 ...)
            beat,      // beat in the bar, 0 = first beat
            bar,       // bar count since start
            sub,       // tick within the beat, 0 = on the beat
            downbeat,  // true on beat 0, sub 0
            bpm }
   clock.start()                 starts about 60 ms from now; returns the first tick's time
   clock.stop()
   clock.setBpm(n)               takes effect from the next tick, with no jump
   clock.setBeatsPerBar(n), clock.setSubdivision(n)
   clock.running, clock.bpm, clock.beatsPerBar, clock.subdivision
   clock.context                 the AudioContext (the app's shared one from core.js)
   clock.secondsPerTick()
   clock.now()                   the AudioContext's current time
   clock.nearest(audioTime)      nearest booked tick: { tick, offset } (offset in
                                 seconds, negative = early), for measuring a strum
   LGClock.now()                 the shared AudioContext's current time
   LGClock.click(time, kind)     a metronome click at time: "accent", "beat" or "sub"
*/
(function(){
  const LOOKAHEAD = 0.12;   // seconds of ticks booked ahead
  const WAKE_MS = 25;       // how often the scheduler wakes
  const START_DELAY = 0.06; // first tick this far after start()
  const HISTORY = 128;      // booked ticks kept for nearest()

  function audioContext(){
    if (typeof ensureAudio === "function") { ensureAudio(); return ctx; }   // core.js shared context
    if (!audioContext._c) { const AC = window.AudioContext || window.webkitAudioContext; audioContext._c = new AC(); }
    if (audioContext._c.state === "suspended") audioContext._c.resume();
    return audioContext._c;
  }
  function outNode(c){ return (typeof master !== "undefined" && master && master.context === c) ? master : c.destination; }

  /* One wake-up timer shared by every clock. A worker's timer keeps running
     when the main thread is busy and is not slowed to 1 a second in a
     background tab; setInterval is the fallback. */
  const wakers = new Set(); let timer = null;
  function wakeAll(){ wakers.forEach(fn => { try { fn(); } catch (e) { if (window.LGOps && LGOps.logError) LGOps.logError("clock", e); } }); }
  function startTimer(){
    if (timer) return;
    try {
      const src = "let h=null;onmessage=e=>{clearInterval(h);h=null;if(e.data>0)h=setInterval(()=>postMessage(0),e.data);};";
      const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
      const w = new Worker(url); URL.revokeObjectURL(url);
      w.onmessage = wakeAll; w.postMessage(WAKE_MS);
      timer = { stop(){ w.postMessage(0); w.terminate(); } };
    } catch (e) {
      const h = setInterval(wakeAll, WAKE_MS);
      timer = { stop(){ clearInterval(h); } };
    }
  }
  function stopTimer(){ if (timer && !wakers.size) { timer.stop(); timer = null; } }

  function clamp(n, lo, hi, d){ n = Number(n); return isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; }

  function create(opts){
    opts = opts || {};
    const st = {
      bpm: clamp(opts.bpm, 20, 300, 90),
      beatsPerBar: Math.round(clamp(opts.beatsPerBar, 1, 16, 4)),
      subdivision: Math.round(clamp(opts.subdivision, 1, 8, 1)),
      running: false, next: 0, index: 0, beat: 0, sub: 0, bar: 0,
      queue: [], history: [], raf: 0
    };
    let c = null;   // the AudioContext, taken on start() so no sound is set up before a tap

    function spt(){ return 60 / st.bpm / st.subdivision; }
    function book(){
      if (!st.running) return;
      const until = c.currentTime + LOOKAHEAD;
      // If the page was frozen (phone locked, tab put to sleep), skip ahead
      // rather than play a burst of late clicks.
      if (st.next < c.currentTime - 0.05) {
        const skip = Math.ceil((c.currentTime - st.next) / spt());
        for (let i = 0; i < skip; i++) advance();
        st.next += skip * spt();
      }
      while (st.next < until) {
        const t = { time: st.next, index: st.index, beat: st.beat, bar: st.bar, sub: st.sub,
                    downbeat: st.beat === 0 && st.sub === 0, bpm: st.bpm };
        st.history.push(t); if (st.history.length > HISTORY) st.history.shift();
        if (opts.onSchedule) opts.onSchedule(t);
        if (opts.onTick) st.queue.push(t);
        advance();
        st.next += spt();
      }
    }
    function advance(){
      st.index++; st.sub++;
      if (st.sub >= st.subdivision) { st.sub = 0; st.beat++; if (st.beat >= st.beatsPerBar) { st.beat = 0; st.bar++; } }
    }
    function drain(){
      st.raf = 0;
      if (!st.running) return;
      const now = c.currentTime;
      while (st.queue.length && st.queue[0].time <= now + 0.008) { const t = st.queue.shift(); if (now - t.time < 0.25) opts.onTick(t); }
      st.raf = requestAnimationFrame(drain);
    }

    const clock = {
      get context(){ return c || (c = audioContext()); },
      get running(){ return st.running; },
      get bpm(){ return st.bpm; },
      get beatsPerBar(){ return st.beatsPerBar; },
      get subdivision(){ return st.subdivision; },
      secondsPerTick: spt,
      start(){
        if (st.running) clock.stop();
        c = audioContext();
        st.running = true; st.index = 0; st.beat = 0; st.sub = 0; st.bar = 0; st.queue = []; st.history = [];
        st.next = c.currentTime + START_DELAY;
        const first = st.next;
        wakers.add(book); startTimer(); book();
        if (opts.onTick) st.raf = requestAnimationFrame(drain);
        return first;
      },
      stop(){
        st.running = false; wakers.delete(book); stopTimer();
        if (st.raf) cancelAnimationFrame(st.raf); st.raf = 0; st.queue = [];
      },
      now(){ return (c || audioContext()).currentTime; },
      setBpm(n){ st.bpm = clamp(n, 20, 300, st.bpm); },
      setBeatsPerBar(n){ st.beatsPerBar = Math.round(clamp(n, 1, 16, st.beatsPerBar)); if (st.beat >= st.beatsPerBar) st.beat = 0; },
      setSubdivision(n){ st.subdivision = Math.round(clamp(n, 1, 8, st.subdivision)); st.sub = 0; },
      nearest(time){
        let best = null;
        for (const t of st.history) if (!best || Math.abs(t.time - time) < Math.abs(best.time - time)) best = t;
        return best ? { tick: best, offset: time - best.time } : null;
      }
    };
    return clock;
  }

  /* A short, sharp click. Accent is higher and louder. */
  function click(time, kind){
    const c = audioContext(); time = time || c.currentTime;
    const f = kind === "accent" ? 1760 : kind === "sub" ? 880 : 1175;
    const v = kind === "accent" ? 0.55 : kind === "sub" ? 0.16 : 0.38;
    const o = c.createOscillator(); o.type = "square"; o.frequency.value = f;
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = 2;
    const g = c.createGain();
    g.gain.setValueAtTime(0, time); g.gain.linearRampToValueAtTime(v, time + 0.0015);
    g.gain.exponentialRampToValueAtTime(0.0008, time + 0.045);
    o.connect(bp).connect(g).connect(outNode(c));
    o.start(time); o.stop(time + 0.06);
  }

  window.LGClock = { create, click, now(){ return audioContext().currentTime; } };
})();
