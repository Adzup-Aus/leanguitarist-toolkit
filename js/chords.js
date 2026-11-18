/* ============ RENDER: CHORDS ============ */
function renderChords(){
  const g=document.getElementById("chordGrid");
  g.innerHTML=CHORD_ORDER.map(name=>`<div class="card chordcard">
    <h3>${name}</h3><div class="role">${CHORDS[name].role}</div>
    ${chordSVG(CHORDS[name].shape)}
    <div><button class="btn" style="margin-top:8px" onclick="strum('${name}','down');flash(this)">Hear ${name}</button></div>
  </div>`).join("");
}
function flash(btn){btn.style.background="#a40b0c";setTimeout(()=>btn.style.background="",180);}
