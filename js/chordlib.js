/* F5: the chord library. Every chord diagram in the app is drawn here, with the
   finger number (1 index, 2 middle, 3 ring, 4 little) inside each dot.

   chordShape(name)    -> { frets, fingers, barre, kind, base, note } or null
                          frets: low E to high E, null = don't play, 0 = open
                          kind: "open" (from CHORD_LIB), "barre" (a moveable shape
                          worked out for any root, for example G# after a capo or
                          transpose) or "near" (the closest simple chord)
   chordDiagram(name)  -> the SVG diagram (or a short note if the name can't be read)
   chordFingerLines(name) -> "1 index on the B string, 1st fret" lines, as HTML
   chordPopBody(name)  -> diagram plus finger lines, for a pop-up
   hearChord(name)     -> plays the shape in the diagram
   openChordDetail(name) / closeChordDetail()
*/
const CHORD_LIB = {
  /* in the course */
  G:    { frets:[3,2,0,0,0,3],          fingers:[2,1,0,0,0,3], group:"course" },
  C:    { frets:[null,3,2,0,1,0],       fingers:[0,3,2,0,1,0], group:"course" },
  D:    { frets:[null,null,0,2,3,2],    fingers:[0,0,0,1,3,2], group:"course" },
  Em:   { frets:[0,2,2,0,0,0],          fingers:[0,2,3,0,0,0], group:"course" },
  /* next up */
  Am:   { frets:[null,0,2,2,1,0],       fingers:[0,0,2,3,1,0] },
  E:    { frets:[0,2,2,1,0,0],          fingers:[0,2,3,1,0,0] },
  A:    { frets:[null,0,2,2,2,0],       fingers:[0,0,1,2,3,0] },
  Dm:   { frets:[null,null,0,2,3,1],    fingers:[0,0,0,2,3,1] },
  F:    { frets:[1,3,3,2,1,1],          fingers:[1,3,4,2,1,1], barre:{ fret:1, from:0, to:5 } },
  G7:   { frets:[3,2,0,0,0,1],          fingers:[3,2,0,0,0,1] },
  C7:   { frets:[null,3,2,3,1,0],       fingers:[0,3,2,4,1,0] },
  D7:   { frets:[null,null,0,2,1,2],    fingers:[0,0,0,2,1,3] },
  E7:   { frets:[0,2,0,1,0,0],          fingers:[0,2,0,1,0,0] },
  A7:   { frets:[null,0,2,0,2,0],       fingers:[0,0,2,0,3,0] },
  B7:   { frets:[null,2,1,2,0,2],       fingers:[0,2,1,3,0,4] },
  Am7:  { frets:[null,0,2,0,1,0],       fingers:[0,0,2,0,1,0] },
  Em7:  { frets:[0,2,2,0,3,0],          fingers:[0,2,3,0,4,0] },
  Dm7:  { frets:[null,null,0,2,1,1],    fingers:[0,0,0,2,1,1], barre:{ fret:1, from:4, to:5 } },
  Cmaj7:{ frets:[null,3,2,0,0,0],       fingers:[0,3,2,0,0,0] },
  Fmaj7:{ frets:[null,null,3,2,1,0],    fingers:[0,0,3,2,1,0] },
  Cadd9:{ frets:[null,3,2,0,3,3],       fingers:[0,2,1,0,3,4] },
  Asus2:{ frets:[null,0,2,2,0,0],       fingers:[0,0,1,2,0,0] },
  Asus4:{ frets:[null,0,2,2,3,0],       fingers:[0,0,1,2,3,0] },
  Dsus2:{ frets:[null,null,0,2,3,0],    fingers:[0,0,0,1,3,0] },
  Dsus4:{ frets:[null,null,0,2,3,3],    fingers:[0,0,0,1,2,3] },
  Bm:   { frets:[null,2,4,4,3,2],       fingers:[0,1,3,4,2,1], barre:{ fret:2, from:1, to:5 } }
};
const CHORD_LIB_NEXT = ["Am","E","A","Dm","F","G7","C7","D7","E7","A7","B7","Am7","Em7","Dm7","Cmaj7","Fmaj7","Cadd9","Asus2","Asus4","Dsus2","Dsus4","Bm"];

/* Moveable barre shapes. r = the fret of the root note on the low E string
   (E shape) or the A string (A shape); the index finger lies flat at fret r. */
const BARRE_E = {
  "":   { f:[0,2,2,1,0,0], n:[1,3,4,2,1,1] },
  m:    { f:[0,2,2,0,0,0], n:[1,3,4,1,1,1] },
  "7":  { f:[0,2,0,1,0,0], n:[1,3,1,2,1,1] },
  m7:   { f:[0,2,0,0,0,0], n:[1,3,1,1,1,1] },
  sus4: { f:[0,2,2,2,0,0], n:[1,2,3,4,1,1] }
};
const BARRE_A = {
  "":   { f:[null,0,2,2,2,0], n:[0,1,2,3,4,1] },
  m:    { f:[null,0,2,2,1,0], n:[0,1,3,4,2,1] },
  "7":  { f:[null,0,2,0,2,0], n:[0,1,3,1,4,1] },
  m7:   { f:[null,0,2,0,1,0], n:[0,1,3,1,2,1] },
  maj7: { f:[null,0,2,1,2,0], n:[0,1,3,2,4,1] },
  sus2: { f:[null,0,2,2,0,0], n:[0,1,3,4,1,1] },
  sus4: { f:[null,0,2,2,3,0], n:[0,1,2,3,4,1] }
};
const STRING_NAMES = ["low E","A","D","G","B","high E"];
const FINGER_NAMES = { 1:"index", 2:"middle", 3:"ring", 4:"little" };
const NOTE_IX = { C:0,"C#":1,D:2,"D#":3,E:4,F:5,"F#":6,G:7,"G#":8,A:9,"A#":10,B:11 };
const FLAT_TO_SHARP = { Db:"C#", Eb:"D#", Gb:"F#", Ab:"G#", Bb:"A#", Cb:"B", Fb:"E", "E#":"F", "B#":"C" };
const QUALITY_ALIAS = { "":"", M:"", maj:"", major:"", m:"m", min:"m", minor:"m", "-":"m",
  "7":"7", dom7:"7", m7:"m7", min7:"m7", "-7":"m7", maj7:"maj7", M7:"maj7", "Δ":"maj7", "Δ7":"maj7",
  sus:"sus4", sus4:"sus4", sus2:"sus2" };

function chordParse(name){
  const m = String(name || "").trim().match(/^([A-G])([#b]?)([^/]*)(?:\/([A-G][#b]?))?$/);
  if (!m) return null;
  let root = m[1] + (m[2] || ""); root = FLAT_TO_SHARP[root] || root;
  let bass = m[4] || ""; bass = FLAT_TO_SHARP[bass] || bass;
  return { root, suffix: m[3] || "", bass, ix: NOTE_IX[root] };
}
function ord(n){ const s = ["th","st","nd","rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

function barreShape(root, q){
  const ix = NOTE_IX[root]; if (ix === undefined) return null;
  const opts = [];
  if (BARRE_E[q]) opts.push({ r: (ix - 4 + 12) % 12, t: BARRE_E[q], from: 0 });
  if (BARRE_A[q]) opts.push({ r: (ix - 9 + 12) % 12, t: BARRE_A[q], from: 1 });
  const ok = opts.filter(o => o.r >= 1).sort((a, b) => a.r - b.r);
  if (!ok.length) return null;
  const o = ok[0];
  const frets = o.t.f.map(v => v === null ? null : v + o.r);
  // the barre covers the strings the index finger holds down at fret r
  let to = o.from; o.t.n.forEach((n, i) => { if (n === 1 && frets[i] === o.r) to = i; });
  return { frets, fingers: o.t.n.slice(), barre: { fret: o.r, from: o.from, to } };
}

function chordShape(name){
  const p = chordParse(name); if (!p) return null;
  const label = p.root + p.suffix;
  let note = "";
  if (p.bass) note = "Play " + esc(label) + ". The " + esc(p.bass) + " in the bass is a nice extra, not needed.";
  // 1. a stored open shape, under the name as written or with sharps
  const lib = CHORD_LIB[label] || CHORD_LIB[String(name).split("/")[0]];
  if (lib) return Object.assign({ kind: "open", note }, lib);
  // 2. a moveable barre shape for any root
  const q = QUALITY_ALIAS[p.suffix];
  if (q !== undefined) {
    const b = barreShape(p.root, q);
    if (b) return Object.assign({ kind: "barre", note: note || "A moveable barre shape. Your index finger lies flat across the strings at the " + ord(b.barre.fret) + " fret." }, b);
  }
  // 3. the closest simple chord (for example C9 or Cdim): its major or minor chord
  const simple = /^(m(?!aj)|min|dim|-)/.test(p.suffix) ? "m" : "";
  const near = CHORD_LIB[p.root + simple] || barreShape(p.root, simple);
  if (near) return Object.assign({ kind: "near", note: "No diagram for " + esc(name) + " yet. Play " + esc(p.root + simple) + " instead: it fits in most songs." }, near);
  return null;
}

function chordDiagram(name){
  const sh = chordShape(name);
  if (!sh) return '<div class="sbnote">Moveable/barre shape. Use the pattern shown for its open cousin, moved up the neck.</div>';
  const W = 126, H = 150, x0 = 24, dx = 16.5, y0 = 30, dy = 26, rows = 4;
  const fretted = sh.frets.filter(v => v && v > 0);
  const top = fretted.length ? Math.max(...fretted) : 0;
  const base = top > rows ? Math.min(...fretted) : 1;
  const Y = f => y0 + (f - base + 0.5) * dy, X = i => x0 + i * dx;
  let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + esc(String(name)) + ' chord diagram with finger numbers">';
  s += '<rect x="' + x0 + '" y="' + y0 + '" width="' + dx * 5 + '" height="' + dy * rows + '" fill="#fff"/>';
  for (let f = 0; f <= rows; f++) { const y = y0 + f * dy; s += '<line x1="' + x0 + '" y1="' + y + '" x2="' + (x0 + dx * 5) + '" y2="' + y + '" stroke="#cbb89a" stroke-width="' + (f === 0 && base === 1 ? 4 : 1.4) + '"/>'; }
  for (let i = 0; i < 6; i++) s += '<line x1="' + X(i) + '" y1="' + y0 + '" x2="' + X(i) + '" y2="' + (y0 + dy * rows) + '" stroke="#b9a98c" stroke-width="1.4"/>';
  if (base > 1) s += '<text x="' + (x0 - 6) + '" y="' + (Y(base) + 4) + '" text-anchor="end" font-size="11" font-weight="700" fill="#6b6258" font-family="Open Sans">' + base + 'fr</text>';
  for (let i = 0; i < 6; i++) { const v = sh.frets[i];
    if (v === null) s += '<text x="' + X(i) + '" y="' + (y0 - 7) + '" text-anchor="middle" font-size="13" fill="#b6ada0" font-family="Open Sans">x</text>';
    else if (v === 0) s += '<circle cx="' + X(i) + '" cy="' + (y0 - 11) + '" r="4.5" fill="none" stroke="#555" stroke-width="1.4"/>';
  }
  const b = sh.barre;
  if (b) s += '<rect x="' + (X(b.from) - 8) + '" y="' + (Y(b.fret) - 8) + '" width="' + (X(b.to) - X(b.from) + 16) + '" height="16" rx="8" fill="#d30e0f"/>';
  for (let i = 0; i < 6; i++) { const v = sh.frets[i]; if (!(v > 0)) continue;
    const n = sh.fingers[i];
    const onBarre = b && v === b.fret && i >= b.from && i <= b.to && n === 1;
    if (onBarre && i !== b.from) continue;   // one number for the whole barre, at its low end
    if (!onBarre) s += '<circle cx="' + X(i) + '" cy="' + Y(v) + '" r="8" fill="#d30e0f"/>';
    if (n) s += '<text x="' + X(i) + '" y="' + (Y(v) + 3.6) + '" text-anchor="middle" font-size="10.5" font-weight="700" fill="#fff" font-family="Open Sans">' + n + '</text>';
  }
  return s + '</svg>';
}

function chordFingerLines(name){
  const sh = chordShape(name); if (!sh) return "";
  const lines = [];
  for (let n = 1; n <= 4; n++) {
    const strs = []; sh.frets.forEach((v, i) => { if (v > 0 && sh.fingers[i] === n) strs.push(i); });
    if (!strs.length) continue;
    const b = sh.barre;
    if (n === 1 && b && strs.length > 1) {
      const across = b.from === 0 && b.to === 5 ? "all six strings" : "the " + STRING_NAMES[b.from] + " to " + STRING_NAMES[b.to] + " strings";
      lines.push("<b>1</b> index flat across " + across + " at the " + ord(b.fret) + " fret (a barre)");
      continue;
    }
    strs.forEach(i => lines.push("<b>" + n + "</b> " + FINGER_NAMES[n] + " on the " + STRING_NAMES[i] + " string, " + ord(sh.frets[i]) + " fret"));
  }
  const muted = sh.frets.map((v, i) => v === null ? STRING_NAMES[i] : null).filter(Boolean);
  if (muted.length) lines.push("Don't play the " + listJoin(muted) + " string" + (muted.length > 1 ? "s" : "") + " (x)");
  return lines.map(l => "<div>" + l + "</div>").join("");
}
function listJoin(a){ return a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]; }

function chordPopBody(name){
  const sh = chordShape(name);
  if (!sh) return chordDiagram(name);
  return chordDiagram(name) + '<div class="f5-fingers">' + chordFingerLines(name) + '</div>' +
    (sh.note ? '<div class="sbnote f5-shapenote">' + sh.note + '</div>' : "") +
    '<div class="f5-legend">1 index · 2 middle · 3 ring · 4 little</div>';
}

function hearChord(name){
  const sh = chordShape(name);
  if (!sh) { if (typeof playChordName === "function") playChordName(name); return; }
  ensureAudio(); const t = ctx.currentTime;
  chordFreqs(sh.frets).forEach((f, i) => pluck(f, t + i * 0.018, 0.9));
}

function openChordDetail(name){
  let pop = document.getElementById("chordDetail");
  if (!pop) {
    pop = document.createElement("div"); pop.id = "chordDetail"; pop.className = "sbpop f5-chordpop";
    pop.setAttribute("role", "dialog"); pop.setAttribute("aria-modal", "true");
    pop.addEventListener("click", e => { if (e.target === pop) closeChordDetail(); });
    document.body.appendChild(pop);
  }
  pop.dataset.chord = name;
  pop.innerHTML = '<div class="card"><h3>' + esc(name) + '</h3>' + chordPopBody(name) +
    '<div style="margin-top:10px"><button class="btn" onclick="hearChord(document.getElementById(\'chordDetail\').dataset.chord)">Hear it</button> <button class="btn ghost" onclick="closeChordDetail()">Close</button></div></div>';
  pop.classList.add("show");
}
function closeChordDetail(){ const pop = document.getElementById("chordDetail"); if (pop) pop.classList.remove("show"); }
document.addEventListener("keydown", e => { if (e.key === "Escape") closeChordDetail(); });
