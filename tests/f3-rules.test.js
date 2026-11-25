/* F3 rule examples: the streak and the campfire-ready score.
   Run: node tests/f3-rules.test.js   (the examples are listed in the PRD, section 5a)
   The app file needs a page, so the browser parts are given empty stand-ins here. */
global.window={addEventListener(){}}; global.document={addEventListener(){}};
global.localStorage={removeItem(){}};
const R=require("../js/practice-log.js");
let fails=0;
function eq(name,got,want){
  const ok=JSON.stringify(got)===JSON.stringify(want);
  if(!ok) fails++;
  console.log((ok?"pass ":"FAIL ")+name+(ok?"":"  got "+JSON.stringify(got)+" want "+JSON.stringify(want)));
}
/* days: {"2026-11-23":minutes} ; ticks: ["2026-11-23"] */
function T(mins,ticks){ const e=[]; Object.entries(mins||{}).forEach(([d,m])=>e.push({d,k:"timer",s:m*60})); (ticks||[]).forEach(d=>e.push({d,k:"tick",s:0})); return R.plDayTotals(e); }
const S=(t,today)=>{ const s=R.plStreak(t,today); return {days:s.days,rest:s.restDays,left:s.restLeft}; };

/* 25 Nov 2026 is a Wednesday; the week runs Mon 23 to Sun 29 Nov. */
eq("dates: Wed is weekday 3, week starts Mon 23", [R.plWeekday("2026-11-25"),R.plWeekStart("2026-11-25"),R.plWeekStart("2026-11-23"),R.plWeekStart("2026-11-29")],[3,"2026-11-23","2026-11-23","2026-11-23"]);

eq("1. nothing logged: streak 0, 2 rest days", S(T(),"2026-11-25"), {days:0,rest:[],left:2});
eq("2. practised Mon and Tue, not yet today: streak 2, 2 rest days left", S(T({"2026-11-23":10,"2026-11-24":12}),"2026-11-25"), {days:2,rest:[],left:2});
eq("3. ...and 10 minutes today: streak 3", S(T({"2026-11-23":10,"2026-11-24":12,"2026-11-25":10}),"2026-11-25"), {days:3,rest:[],left:2});
eq("4. under 1 minute does not count, a plan tick does", S(T({"2026-11-24":0.5},["2026-11-23"]),"2026-11-25"), {days:1,rest:["2026-11-24"],left:1});
/* last week Mon 16 to Sun 22 Nov */
eq("5. last week Mon-Fri, rest Sat+Sun, this week Mon+Tue: streak 7, 2 rest days left this week",
  S(T({"2026-11-16":10,"2026-11-17":10,"2026-11-18":10,"2026-11-19":10,"2026-11-20":10,"2026-11-23":10,"2026-11-24":10}),"2026-11-25"),
  {days:7,rest:["2026-11-21","2026-11-22"],left:2});
eq("6. this week Mon practised, Tue off: streak 1, 1 rest day left",
  S(T({"2026-11-23":10}),"2026-11-25"), {days:1,rest:["2026-11-24"],left:1});
eq("7. practised last Thu, off Fri Sat Sun (3 in one week): streak ends, 0",
  S(T({"2026-11-19":10}),"2026-11-23"), {days:0,rest:[],left:2});
eq("8. practised last Thu, off Fri+Sat, practised Sun: streak 2 (Fri, Sat rest)",
  S(T({"2026-11-19":10,"2026-11-22":10}),"2026-11-23"), {days:2,rest:["2026-11-20","2026-11-21"],left:2});
eq("9. off Mon+Tue this week after practising last Sun: streak 1, no rest days left",
  S(T({"2026-11-22":15}),"2026-11-25"), {days:1,rest:["2026-11-23","2026-11-24"],left:0});
eq("10. off Mon, Tue, Wed after last Sun, today Thu: streak ends, 0",
  S(T({"2026-11-22":15}),"2026-11-26"), {days:0,rest:[],left:2});
eq("11. ...then practise Thu: a new streak of 1, Mon-Wed belong to the old one, 2 rest days left",
  S(T({"2026-11-22":15,"2026-11-26":10}),"2026-11-26"), {days:1,rest:[],left:2});
eq("12. across three weeks: 2 days off last week and 1 the week before are rest days; streak 10",
  S(T({"2026-11-12":10,"2026-11-13":10,"2026-11-14":10,"2026-11-16":10,"2026-11-17":10,"2026-11-18":10,"2026-11-20":10,"2026-11-22":10,"2026-11-23":10,"2026-11-24":10}),"2026-11-24"),
  {days:10,rest:["2026-11-15","2026-11-19","2026-11-21"],left:2});
eq("12b. 3 days off in last week's Mon-Sun (16, 19, 21) ends it at the third: streak 6",
  S(T({"2026-11-17":10,"2026-11-18":10,"2026-11-20":10,"2026-11-22":10,"2026-11-23":10,"2026-11-24":10}),"2026-11-24"),
  {days:6,rest:["2026-11-19","2026-11-21"],left:2});

/* minutes */
const tm=T({"2026-11-23":12.5,"2026-11-24":10,"2026-11-25":5},["2026-11-24"]);
eq("13. minutes: this week Mon-Sun", R.plWeekMinutes(tm,"2026-11-25").map(x=>x.min), [13,10,5,0,0,0,0]);
eq("14. two timer runs on one day add up", R.plWeekMinutes(R.plDayTotals([{d:"2026-11-25",k:"timer",s:300},{d:"2026-11-25",k:"timer",s:420}]),"2026-11-25")[2].min, 12);
eq("15. minutes in the last 7 days", R.plMinutesLast(T({"2026-11-18":20,"2026-11-19":30,"2026-11-25":10}),"2026-11-25",7), 40);

/* score: checklist 60, plan 20, last 7 days' practice 20 (70 minutes = full) */
eq("16. score: nothing yet", R.plScore(0,0,0), {total:0,campfire:0,plan:0,practice:0});
eq("17. score: 14 of 19 skills, 9 of 21 days, 45 minutes", R.plScore(14,9,45), {total:66,campfire:44,plan:9,practice:13});
eq("18. score: everything done and 10 minutes a day", R.plScore(19,21,70), {total:100,campfire:60,plan:20,practice:20});
eq("19. score: more than 70 minutes still counts 20", R.plScore(19,21,300).total, 100);
eq("20. score: all checked but no practice this week", R.plScore(19,21,0).total, 80);

console.log(fails?fails+" failed":"all passed");
process.exit(fails?1:0);
