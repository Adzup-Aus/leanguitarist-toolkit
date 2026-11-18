/* ============ SONGBOOK ============ */
function parseSheet(body){
  const secs=[]; let cur={label:null,lines:[]};
  (body||"").split(/\r?\n/).forEach(line=>{
    const sm=line.match(/^\s*\{\s*(?:c:|comment:)?\s*([^}]*?)\s*\}\s*$/i);
    if(sm){ if(cur.label!==null||cur.lines.length) secs.push(cur); cur={label:sm[1],lines:[]}; return; }
    if(line.trim()===""){ cur.lines.push(null); return; }
    const segs=[]; let chord=null, buf="";
    for(let i=0;i<line.length;){
      if(line[i]==="["){ const e=line.indexOf("]",i); if(e>i){ segs.push({chord:chord,text:buf}); buf=""; chord=line.slice(i+1,e); i=e+1; continue; } }
      buf+=line[i++];
    }
    segs.push({chord:chord,text:buf});
    cur.lines.push(segs);
  });
  if(cur.label!==null||cur.lines.length) secs.push(cur);
  return secs;
}
function transposeChord(ch,n){ if(!n) return ch; const m=ch.match(/^([A-G])([#b]?)(.*)$/); if(!m) return ch; let root=m[1]+(m[2]||""); if(SB_FLATS[root])root=SB_FLATS[root]; let i=SB_SCALE.indexOf(root); if(i<0) return ch; i=(i+n+120)%12; return SB_SCALE[i]+(m[3]||""); }
function chordNoteFreqs(name){ const m=name.match(/^([A-G][#b]?)(.*)$/); if(!m) return []; let root=m[1]; if(SB_FLATS[root])root=SB_FLATS[root]; const suf=m[2]||""; let ri=SB_SCALE.indexOf(root); if(ri<0) return []; const base=130.81*Math.pow(2,ri/12); let ints=[0,4,7]; if(/^m(?!aj)/i.test(suf)) ints=[0,3,7]; if(/dim/i.test(suf)) ints=[0,3,6]; if(/sus2/i.test(suf)) ints=[0,2,7]; if(/sus4/i.test(suf)) ints=[0,5,7]; if(/7/.test(suf)) ints=ints.concat(/maj7/i.test(suf)?11:10); return ints.map(iv=>base*Math.pow(2,iv/12)).concat(base*2); }
function playChordName(name){ ensureAudio(); const t=ctx.currentTime; chordNoteFreqs(name).forEach((f,i)=>pluck(f,t+i*0.013,0.9)); }

function renderSongbook(){
  const el=document.getElementById("sbList"); if(!el) return;
  let h='<div class="sbsectlbl">Ready to play (public domain)</div>';
  SB_SONGS.forEach((s,i)=>{ h+='<button class="sbcard" onclick="openPD('+i+')"><div><div class="t">'+esc(s.title)+'</div><div class="a">'+esc(s.author||"")+'</div></div><span class="k">'+esc(s.key||"")+'</span></button>'; });
  el.innerHTML=h;
}
function openPD(i){ openSheet("pd",i); }
function openMy(i){ openSheet("my",i); }
function sbSong(){ return sbState.kind==="pd"? SB_SONGS[sbState.idx] : mySongs[sbState.idx]; }
function sbBack(){ if(sbState.timer)clearInterval(sbState.timer); sbState={view:"list"}; document.getElementById("sbSheet").style.display="none"; document.getElementById("sbListWrap").style.display="block"; }
function openSheet(kind,idx){
  sbState={view:"sheet",kind:kind,idx:idx,transpose:0,capo:0,font:16,scroll:false,timer:null,speed:2};
  document.getElementById("sbListWrap").style.display="none";
  document.getElementById("sbSheet").style.display="block";
  renderSheet(); window.scrollTo({top:0,behavior:"instant"});
}
function renderSheet(){
  const s=sbSong(); if(!s){ sbBack(); return; }
  const ug="https://www.google.com/search?q="+encodeURIComponent(s.title+" chords ultimate guitar");
  const yt="https://www.youtube.com/results?search_query="+encodeURIComponent(s.title+" guitar tutorial");
  const del = sbState.kind==="my" ? '<button class="tool" style="color:var(--red)" onclick="deleteMySong()">Delete</button>' : "";
  document.getElementById("sbSheet").innerHTML =
    '<div class="sheettop">'
    +'<button class="btn ghost" style="padding:7px 11px;font-size:13px" onclick="sbBack()">&#8592; Songbook</button>'
    +'<div style="font-family:var(--serif);font-size:22px;margin:8px 0 0">'+esc(s.title)+'</div>'
    +'<div style="color:var(--muted);font-size:12.5px">'+esc(s.author||"")+' &middot; Key of '+esc(s.key||"")+'</div>'
    +'<div class="sheettools">'
      +'<span class="tool">Key <button onclick="sbTranspose(-1)">&#8722;</button><b id="sbTr">0</b><button onclick="sbTranspose(1)">+</button></span>'
      +'<span class="tool">Capo <button onclick="sbCapo(-1)">&#8722;</button><b id="sbCp">0</b><button onclick="sbCapo(1)">+</button></span>'
      +'<span class="tool">Size <button onclick="sbFont(-1)">&#8722;</button><button onclick="sbFont(1)">+</button></span>'
      +'<button class="tool" id="sbScroll" onclick="sbScrollToggle()">&#9654; Auto-scroll</button>'+del
    +'</div>'
    +'<div class="sheettools"><a class="lyriclink" href="'+ug+'" target="_blank" rel="noopener">More versions &#8599;</a> <a class="lyriclink" href="'+yt+'" target="_blank" rel="noopener">YouTube &#8599;</a></div>'
    +'</div>'
    +'<div id="sbCapoBanner"></div>'
    +'<div class="sheet" id="sheetBody" style="font-size:'+sbState.font+'px"></div>';
  renderSheetBody();
}
function renderSheetBody(){
  const s=sbSong(); if(!s) return; const t=sbState.transpose - sbState.capo;
  let html="";
  parseSheet(s.body).forEach(sec=>{
    html+='<div class="sec">';
    if(sec.label) html+='<div class="seclbl">'+esc(sec.label)+'</div>';
    sec.lines.forEach(ln=>{
      if(ln===null){ html+='<div class="blank"></div>'; return; }
      html+='<div class="ln">'+ln.map(seg=>{
        const ch=seg.chord?transposeChord(seg.chord,t):null;
        const c=ch?'<button class="chip-ch" data-ch="'+esc(ch)+'" onclick="showChordPopEl(this)">'+esc(ch)+'</button>':'<span class="chip-ch empty">.</span>';
        return '<span class="seg"><span class="segch">'+c+'</span>'+esc(seg.text)+'</span>';
      }).join("")+'</div>';
    });
    html+='</div>';
  });
  document.getElementById("sheetBody").innerHTML=html;
  document.getElementById("sbCapoBanner").innerHTML = sbState.capo>0 ? '<div class="sbnote" style="border-color:#f3cfcf;background:#fff6f5;color:var(--red);font-weight:600">Put a capo on fret '+sbState.capo+', then play these shapes.</div>' : "";
  const tr=document.getElementById("sbTr"); if(tr) tr.textContent=(sbState.transpose>0?"+":"")+sbState.transpose;
  const cp=document.getElementById("sbCp"); if(cp) cp.textContent=sbState.capo;
}
function sbTranspose(d){ sbState.transpose=Math.max(-6,Math.min(6,sbState.transpose+d)); renderSheetBody(); }
function sbCapo(d){ sbState.capo=Math.max(0,Math.min(7,sbState.capo+d)); renderSheetBody(); }
function sbFont(d){ sbState.font=Math.max(12,Math.min(28,sbState.font+d)); document.getElementById("sheetBody").style.fontSize=sbState.font+"px"; }
function sbScrollToggle(){ sbState.scroll=!sbState.scroll; const b=document.getElementById("sbScroll"); if(sbState.scroll){ b.innerHTML="&#10073;&#10073; Stop"; sbState.timer=setInterval(()=>{ window.scrollBy(0,1); },30); } else { b.innerHTML="&#9654; Auto-scroll"; clearInterval(sbState.timer); } }
function showChordPopEl(el){ showChordPop(el.getAttribute("data-ch")); }
function showChordPop(name){
  sbPopChord=name;
  let pop=document.getElementById("sbPop");
  if(!pop){ pop=document.createElement("div"); pop.id="sbPop"; pop.className="sbpop"; pop.addEventListener("click",e=>{ if(e.target===pop) closeChordPop(); }); document.body.appendChild(pop); }
  const shape=sbShape(name);
  const dia = shape ? chordSVG(shape) : '<div class="sbnote">Moveable/barre shape. Use the pattern shown for its open cousin, moved up the neck.</div>';
  pop.innerHTML='<div class="card"><h3>'+esc(name)+'</h3>'+dia+'<div style="margin-top:6px"><button class="btn" onclick="playChordName(sbPopChord)">Hear it</button> <button class="btn ghost" onclick="closeChordPop()">Close</button></div></div>';
  pop.classList.add("show");
}
function closeChordPop(){ const pop=document.getElementById("sbPop"); if(pop) pop.classList.remove("show"); }
function openAddSong(){
  document.getElementById("sbListWrap").style.display="none";
  const sh=document.getElementById("sbSheet"); sh.style.display="block";
  sh.innerHTML='<div class="sheettop"><button class="btn ghost" style="padding:7px 11px;font-size:13px" onclick="sbBack()">&#8592; Songbook</button><div style="font-family:var(--serif);font-size:22px;margin:8px 0 0">Add your own song</div></div>'
   +'<div class="card"><p style="font-size:13px;color:var(--muted);margin:0 0 10px;line-height:1.5">Put chords in square brackets, right before the word they land on. Everything saves privately to your account.</p>'
   +'<input id="myTitle" class="search" placeholder="Song title" style="margin-bottom:8px">'
   +'<input id="myKey" class="search" placeholder="Key, optional (e.g. G)" style="margin-bottom:8px">'
   +'<textarea id="myBody" class="search" style="height:220px;font-family:monospace;line-height:1.6;resize:vertical" placeholder="[G]This is how you [C]type a line&#10;[G]Chord in brackets, [D]then the words"></textarea>'
   +'<div style="margin-top:10px"><button class="btn" onclick="saveMySong()">Save song</button> <button class="btn ghost" onclick="sbBack()">Cancel</button></div>'
   +'<div class="sbnote">Your content, your responsibility. It stays private to your account and never shows to other users. Remove it any time with Delete.</div></div>';
  window.scrollTo({top:0,behavior:"instant"});
}
function saveMySong(){
  const title=(document.getElementById("myTitle").value||"").trim();
  const body=(document.getElementById("myBody").value||"").trim();
  const key=(document.getElementById("myKey").value||"").trim();
  if(!title||!body){ toast("Add a title and the song"); return; }
  mySongs.push({id:"s"+Date.now(), title:title, author:"My song", key:key, body:body}); LS.set("ccf_mysongs",mySongs);
  renderSongbook(); toast("Song saved \u2713"); openSheet("my", mySongs.length-1);
}
function deleteMySong(){ if(sbState.kind!=="my")return; mySongs.splice(sbState.idx,1); LS.set("ccf_mysongs",mySongs); renderSongbook(); sbBack(); toast("Song removed"); }
