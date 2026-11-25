/* ============ RENDER: CHORDS ============ */
/* The four course chords, then the chord library (F5). Diagrams and finger
   numbers come from js/chordlib.js. */
function renderChords(){
  const g=document.getElementById("chordGrid");
  g.innerHTML=CHORD_ORDER.map(name=>`<div class="card chordcard">
    <h3>${name}</h3><div class="role">${CHORDS[name].role}</div>
    <button class="f5-diabtn" onclick="openChordDetail('${name}')" aria-label="${name}, finger by finger">${chordDiagram(name)}</button>
    <div><button class="btn" style="margin-top:8px" onclick="strum('${name}','down');flash(this)">Hear ${name}</button></div>
  </div>`).join("");
  let lib=document.getElementById("chordLib");
  if(!lib){ lib=document.createElement("div"); lib.id="chordLib"; g.parentElement.appendChild(lib); }
  lib.innerHTML=`<div class="f5-legendcard">The number in each dot is the finger to use: <b>1</b> index · <b>2</b> middle · <b>3</b> ring · <b>4</b> little. Tap a chord to see it finger by finger.</div>
    <div class="tabhead f5-libhead"><div class="k">Chord library</div><h2>The next chords</h2>
    <p>For songs beyond the four. Tap one to see where each finger goes and hear it.</p></div>
    <div class="f5-libgrid">${CHORD_LIB_NEXT.map(n=>`<button class="f5-libtile" onclick="openChordDetail('${n}')">${chordDiagram(n)}<b>${n}</b></button>`).join("")}</div>`;
}
function flash(btn){btn.style.background="#a40b0c";setTimeout(()=>btn.style.background="",180);}
