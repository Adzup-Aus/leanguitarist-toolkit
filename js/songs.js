/* ============ RENDER: SONGS ============ */
let songFilter={genre:"All", q:"", chords:0, strum:"All", setOnly:false};
const GENRES=["All","Rock","Pop","Folk & Acoustic","Country","Campfire Classics"];
function renderGenreChips(){
  document.getElementById("genreChips").innerHTML=GENRES.map(g=>
    `<button class="chip ${songFilter.genre===g?'on red':''}" onclick="songFilter.genre='${g}';renderGenreChips();renderSongs()">${g}</button>`).join("");
}
function renderFilterChips(){
  const fc=document.getElementById("filterChips");
  const cc=[[0,"Any chords"],[2,"2 chords"],[3,"3 chords"]];
  let h=cc.map(([n,l])=>`<button class="chip ${songFilter.chords===n?'on':''}" onclick="songFilter.chords=${n};renderFilterChips();renderSongs()">${l}</button>`).join("");
  h+=`<button class="chip ${songFilter.setOnly?'on':''}" onclick="songFilter.setOnly=!songFilter.setOnly;renderFilterChips();renderSongs()">&#9733; Setlist (${setlist.length})</button>`;
  fc.innerHTML=h;
}
function filteredSongs(){
  return SONGS.filter(s=>{
    if(songFilter.genre!=="All"&&s.genre!==songFilter.genre)return false;
    if(songFilter.chords&&s.chordCount!==songFilter.chords)return false;
    if(songFilter.setOnly&&!setlist.includes(songKey(s)))return false;
    if(songFilter.q){const q=songFilter.q.toLowerCase();if(!(s.title.toLowerCase().includes(q)||s.artist.toLowerCase().includes(q)))return false;}
    return true;
  });
}
function renderSongs(){
  const list=filteredSongs();
  document.getElementById("songCount").textContent=list.length+" song"+(list.length===1?"":"s");
  const el=document.getElementById("songList");
  if(!list.length){el.innerHTML=`<div class="empty">No songs match. Try clearing a filter.</div>`;return;}
  el.innerHTML=list.map(s=>{
    const k=songKey(s), starred=setlist.includes(k);
    const badges=s.chords.map(c=>`<span class="chordbadge">${c}</span>`).join("");
    const lyr="https://www.google.com/search?q="+encodeURIComponent(s.title+" "+s.artist+" chords lyrics");
    return `<div class="song">
      <button class="play" data-k="${encodeURIComponent(k)}" onclick="toggleSong(this,'${encodeURIComponent(k)}')" aria-label="Play">${PLAY_SVG}</button>
      <div class="meta">
        <div class="t">${esc(s.title)}</div>
        <div class="a">${esc(s.artist)}</div>
        <div class="row2">${badges}<button class="strumtag" onclick="goPattern('${s.strum}')">${s.strum} strum</button></div>
        <div style="margin-top:6px"><a class="lyriclink" href="${lyr}" target="_blank" rel="noopener">Find chords &amp; lyrics &#8599;</a></div>
      </div>
      <div class="acts"><button class="star ${starred?'on':''}" onclick="toggleStar('${encodeURIComponent(k)}',this)" aria-label="Star">&#9733;</button></div>
    </div>`;
  }).join("");
}
function songStepsFor(s){
  const pat=PATTERNS.find(p=>p.id===s.strum)||PATTERNS[0];
  const chords=s.progression.split("-").map(x=>x.trim());
  let steps=[]; chords.forEach(ch=>pat.steps.forEach(d=>steps.push({dir:d,chord:CHORDS[ch]?ch:"G"})));
  return steps;
}
function toggleSong(btn,encK){
  const k=decodeURIComponent(encK);
  const playingThis=(seq.id==="song:"+k);
  document.querySelectorAll(".play.playing").forEach(b=>{b.classList.remove("playing");b.innerHTML=PLAY_SVG;});
  if(playingThis){seqStop();return;}
  const s=SONGS.find(x=>songKey(x)===k); if(!s)return;
  btn.classList.add("playing"); btn.innerHTML=STOP_SVG;
  seqStart("song:"+k, songStepsFor(s), 92, null);
}
function toggleStar(encK,btn){
  const k=decodeURIComponent(encK); const i=setlist.indexOf(k);
  if(i>=0){setlist.splice(i,1);btn.classList.remove("on");toast("Removed from setlist");}
  else{setlist.push(k);btn.classList.add("on");toast("Added to setlist ★");}
  LS.set("ccf_setlist",setlist); renderFilterChips();
  if(songFilter.setOnly)renderSongs();
}
