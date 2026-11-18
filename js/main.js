/* ============ INIT ============ */
document.getElementById("search").addEventListener("input",e=>{songFilter.q=e.target.value;renderSongs();});
renderNav(); renderChords(); renderGenreChips(); renderFilterChips(); renderSongs();
renderStrumChord(); renderPatterns(); renderPractice(); renderFinger(); renderCampfire(); renderSongbook();
initSupabase();
if("serviceWorker" in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));}
