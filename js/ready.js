/* ============ RENDER: CAMPFIRE ============ */
function renderCampfire(){
  let n=0; CAMPFIRE.forEach((grp,gi)=>grp.items.forEach((_,ii)=>{if(campfireDone[gi+"-"+ii])n++;}));
  const v=document.getElementById("verdict");
  let cls,big,sub;
  if(n>=19){cls="ready";big="Campfire ready";sub="Pick up your guitar and play for people. You have earned it.";}
  else if(n>=15){cls="almost";big="Almost there";sub="Focus your practice on the unchecked items for a few more days.";}
  else{cls="keep";big="Keep going";sub="You are closer than you think. Give the weak spots another week, then check again.";}
  v.className="verdict "+cls;
  v.innerHTML=`<div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">${n} of 19 checked</div><div class="big">${big}</div><div style="font-size:13.5px;color:#444;margin-top:4px;line-height:1.45">${sub}</div>`;
  document.getElementById("checklist").innerHTML=CAMPFIRE.map((grp,gi)=>{
    let h=`<div class="grouplbl">${grp.g}</div><div class="cklist">`;
    grp.items.forEach((it,ii)=>{const id=gi+"-"+ii;const on=!!campfireDone[id];
      h+=`<label class="${on?'on':''}"><input type="checkbox" ${on?'checked':''} onchange="toggleCk('${id}')"><span>${it}</span></label>`;});
    return h+"</div>";
  }).join("");
}
function toggleCk(id){campfireDone[id]=!campfireDone[id];LS.set("ccf_campfire",campfireDone);renderCampfire();}
