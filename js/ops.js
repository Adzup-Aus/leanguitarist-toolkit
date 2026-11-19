/* Internal error log and running-cost log (App Build Principles, principle 7 and
   section 5: 5a runtime cost calculator, 5b error logs).
   Players never see either. Both are kept in memory and written to the browser
   console, and every error is also sent to the server (Supabase table
   public.app_errors, insert only; read by the team in Supabase), batched and capped
   per page load. Costs stay in memory: every call today is on Supabase's free plan.
   Loaded first, so it also catches errors thrown while the other files load.

   From the browser console (team only):
     LGOps.errors          every error caught this session
     LGOps.costs           every logged call this session
     LGOps.costSummary()   per-run cost, rolling total, daily/weekly/monthly projection
     LGOps.copyLog()       both logs as one code-fenced block, copied to the clipboard */
(function(){
  "use strict";
  const MAX_ENTRIES = 200;
  const startedAt = Date.now();

  /* Prices in US$ per unit, in one place, so a cheaper service reprices everything.
     Supabase is on its free plan, so its calls cost nothing today. */
  const PRICES = {
    "supabase:call": 0
  };

  const errors = [];
  const costs = [];

  /* Strip anything that looks like a key, token or password before it is kept. */
  function scrub(value){
    let s;
    if (typeof value === "string") s = value;
    else { try { s = JSON.stringify(value); } catch (_) { s = String(value); } }
    if (s === undefined) return undefined;
    return s
      .replace(/sb_(publishable|secret)_[A-Za-z0-9_\-]+/g, "sb_$1_[removed]")
      .replace(/eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g, "[token removed]")
      .replace(/("?(?:access_token|refresh_token|apikey|api_key|password|token|authorization)"?\s*[:=]\s*)"?[^",&\s}]+"?/gi, "$1\"[removed]\"")
      .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [removed]");
  }

  function keep(list, entry){
    list.push(entry);
    if (list.length > MAX_ENTRIES) list.shift();
  }

  /* task: the action that failed, in plain words. err: the Error or message.
     context: the request and response that matter (scrubbed before it is kept). */
  function logError(task, err, context){
    const e = err || {};
    const entry = {
      at: new Date().toISOString(),
      task: String(task || "unknown"),
      error: scrub(e.message || e.error_description || e.error || String(err)),
      stack: e.stack ? scrub(e.stack) : undefined,
      context: context === undefined ? undefined : scrub(context),
      page: location.pathname + location.hash
    };
    keep(errors, entry);
    try { console.warn("[LG ops] error:", entry.task, entry); } catch (_) {}
    try { queueSend(entry); } catch (_) {}
    return entry;
  }

  /* task: what the call was for. service: a key in PRICES. units: how many. */
  function logCost(task, service, units){
    const n = typeof units === "number" ? units : 1;
    const price = PRICES[service] || 0;
    const entry = { at: new Date().toISOString(), task: String(task), service: String(service), units: n, cost: price * n };
    keep(costs, entry);
    try { console.debug("[LG ops] cost:", entry.task, entry); } catch (_) {}
    return entry;
  }

  function costSummary(){
    const total = costs.reduce((a, c) => a + c.cost, 0);
    const hours = Math.max((Date.now() - startedAt) / 3600000, 1 / 60);
    const perHour = total / hours;
    const byTask = {};
    costs.forEach(c => {
      const t = byTask[c.task] || (byTask[c.task] = { runs: 0, cost: 0 });
      t.runs++; t.cost += c.cost;
    });
    Object.keys(byTask).forEach(k => { byTask[k].perRun = byTask[k].cost / byTask[k].runs; });
    return {
      currency: "USD",
      since: new Date(startedAt).toISOString(),
      runs: costs.length,
      rollingTotal: total,
      perTask: byTask,
      projected: { daily: perHour * 24, weekly: perHour * 24 * 7, monthly: perHour * 24 * 30 },
      prices: Object.assign({}, PRICES)
    };
  }

  function copyLog(){
    const text = "```json\n" + JSON.stringify({
      app: "Lean Guitarist toolkit",
      copiedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      errors: errors,
      cost: costSummary()
    }, null, 2) + "\n```";
    try { if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {}); } catch (_) {}
    return text;
  }

  /* Send errors to the server: batched every 5 seconds, at most 20 per page load,
     the same error only once. Uses the app's public key, which may only add rows.
     A failed send is dropped quietly so it can never cause more errors. */
  const SEND_MAX = 20;
  const outbox = [];
  const seen = new Set();
  let sent = 0, sendTimer = null;
  function queueSend(entry){
    const key = entry.task + "|" + entry.error;
    if (seen.has(key) || sent + outbox.length >= SEND_MAX) return;
    seen.add(key);
    outbox.push({
      app: "LEA112",
      task: String(entry.task).slice(0, 200),
      error: String(((entry.error || "") + (entry.stack ? "\n" + entry.stack : ""))).slice(0, 4000),
      context: entry.context === undefined ? null : String(entry.context).slice(0, 4000),
      page: String(entry.page || "").slice(0, 500),
      agent: String(navigator.userAgent || "").slice(0, 300)
    });
    if (!sendTimer) sendTimer = setTimeout(flushSend, 5000);
  }
  function flushSend(){
    sendTimer = null;
    if (!outbox.length) return;
    let url, key;
    try { url = SUPABASE_URL; key = SUPABASE_ANON_KEY; } catch (_) { return; }
    const rows = outbox.splice(0, outbox.length);
    sent += rows.length;
    try {
      fetch(url + "/rest/v1/app_errors", {
        method: "POST", keepalive: true,
        headers: { "apikey": key, "Content-Type": "application/json", "Prefer": "return=minimal" },
        body: JSON.stringify(rows)
      }).catch(() => {});
    } catch (_) {}
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && outbox.length) flushSend(); });

  window.addEventListener("error", (ev) => {
    logError("uncaught error", ev.error || ev.message, { file: ev.filename, line: ev.lineno, col: ev.colno });
  });
  window.addEventListener("unhandledrejection", (ev) => {
    logError("unhandled promise", ev.reason);
  });

  window.LGOps = { PRICES, errors, costs, logError, logCost, costSummary, copyLog };
})();
