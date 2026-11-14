/* The Latest page: every headline from the last few days, searchable. The list is read from data/headlines.json and
   drawn here, in this browser. Nothing is sent anywhere. The switches in Settings apply (window.tallyAllowed). */
(function () {
  var page = document.getElementById("latest");
  if (!page) return;
  var BASE = document.body.getAttribute("data-base") || "";
  var PAGE = 100, LEANS = {left: "Left", center: "Center", right: "Right"}, TOPICS = ["us", "world", "tech"];
  var q = document.getElementById("lq"), list = document.getElementById("llist"), more = document.getElementById("lmore");
  var status = document.getElementById("lstatus"), chips = document.getElementById("ltopics");
  var data = null, hay = [], view = [], shown = 0, topic = "", hidden = 0, timer = null;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  var ALNUM = /[\p{L}\p{N}]/u;
  function terms(s) {  // words, or "an exact phrase"; a word ending in * matches anything that starts with it (elon*)
    var out = [], re = /"([^"]+)"|(\S+)/g, m;
    while ((m = re.exec(s.toLowerCase()))) {
      var t = m[1] || m[2], prefix = false;
      if (!m[1] && t.length > 1 && t.charAt(t.length - 1) === "*") { prefix = true; t = t.slice(0, -1); }
      if (t) out.push({t: t, prefix: prefix});
    }
    return out;
  }
  function find(h, term, from) {  // the next place `term` appears as whole word(s) in h, or -1. "elon" is not in "felon" or "belong".
    var t = term.t, i = h.indexOf(t, from || 0);
    while (i >= 0) {
      var end = i + t.length;
      var before = !ALNUM.test(t.charAt(0)) || i === 0 || !ALNUM.test(h.charAt(i - 1));
      var plural = h.charAt(end) === "s" && (end + 1 >= h.length || !ALNUM.test(h.charAt(end + 1)));  // felon finds felons
      var after = term.prefix || !ALNUM.test(t.charAt(t.length - 1)) || end >= h.length || !ALNUM.test(h.charAt(end)) || plural;
      if (before && after) return i;
      i = h.indexOf(t, i + 1);
    }
    return -1;
  }
  function dayLabel(d) {
    var today = new Date(), y = new Date(today.getTime() - 86400000);
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === y.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], {weekday: "long", month: "long", day: "numeric"});
  }
  function mark(parent, text, ts) {  // the matched words highlighted, without ever building HTML from the headline
    var low = text.toLowerCase(), spans = [];
    if (low.length === text.length) {
      ts.forEach(function (term) {
        for (var i = find(low, term); i >= 0; i = find(low, term, i + 1)) {
          var end = i + term.t.length;
          if (term.prefix) while (end < low.length && ALNUM.test(low.charAt(end))) end++;  // highlight the whole word it matched
          else if (low.charAt(end) === "s" && !ALNUM.test(low.charAt(end + 1) || " ")) end++;
          spans.push([i, end]);
        }
      });
    }
    spans.sort(function (a, b) { return a[0] - b[0]; });
    var at = 0;
    spans.forEach(function (s) {
      if (s[1] <= at) return;
      var from = Math.max(s[0], at);
      if (from > at) parent.appendChild(document.createTextNode(text.slice(at, from)));
      parent.appendChild(el("mark", null, text.slice(from, s[1])));
      at = s[1];
    });
    if (at < text.length) parent.appendChild(document.createTextNode(text.slice(at)));
  }
  function drawRows(from, to, ts) {
    var prev = from ? new Date(view[from - 1][0] * 1000).toDateString() : "";
    for (var i = from; i < to; i++) {
      var it = view[i], when = new Date(it[0] * 1000), src = data.sources[it[1]];
      if (when.toDateString() !== prev) { prev = when.toDateString(); list.appendChild(el("li", "lt-day", dayLabel(when))); }
      var li = el("li", "lt-row");
      var meta = el("div", "lt-meta");
      meta.appendChild(el("time", null, when.toLocaleTimeString([], {hour: "numeric", minute: "2-digit"})));
      var pill = el("span", "pill lean-" + src[1]); pill.appendChild(document.createElement("i")); pill.appendChild(document.createTextNode(LEANS[src[1]]));
      meta.appendChild(pill);
      meta.appendChild(el("span", "lt-src", src[0]));
      li.appendChild(meta);
      var a = el("a", "hl"); a.href = it[4]; a.target = "_blank"; a.rel = "noopener noreferrer";
      mark(a, it[3], ts);
      li.appendChild(a);
      if (it[5]) {
        var s = el("a", "lt-story", "See how it was covered"); s.href = BASE + "story/" + it[5] + ".html";
        li.appendChild(s);
      }
      list.appendChild(li);
    }
  }
  function run(push) {
    if (!data) return;
    var ts = terms(q.value), allowedTotal = 0;
    hidden = 0;
    view = [];
    for (var i = 0; i < data.items.length; i++) {
      var it = data.items[i];
      if (topic !== "" && String(it[2]) !== topic) continue;
      if (ts.length) { var h = hay[i]; if (!ts.every(function (term) { return find(h, term) >= 0; })) continue; }
      allowedTotal++;
      var src = data.sources[it[1]];
      if (!window.tallyAllowed || window.tallyAllowed(src[1], "a:" + src[0])) view.push(it); else hidden++;
    }
    list.textContent = "";
    shown = Math.min(PAGE, view.length);
    drawRows(0, shown, ts);
    more.hidden = shown >= view.length;
    more.textContent = "Show " + Math.min(PAGE, view.length - shown) + " more";
    var what = ts.length ? " matching " + q.value.trim() : "";
    var msg = view.length ? (view.length.toLocaleString() + " headline" + (view.length === 1 ? "" : "s") + what + ", newest first") : "No headlines" + what + " in the last " + data.days + " days";
    if (hidden) msg += ". " + hidden.toLocaleString() + " more " + (hidden === 1 ? "is" : "are") + " hidden by your Settings";
    status.textContent = msg + ".";
    try {  // typing keeps one entry up to date; pressing Enter adds one, so Back returns to the previous search
      var u = new URL(location.href), had = u.search;
      if (q.value.trim()) u.searchParams.set("q", q.value.trim()); else u.searchParams.delete("q");
      if (push && u.search !== had) history.pushState(null, "", u); else history.replaceState(null, "", u);
    } catch (err) {}
  }
  window.addEventListener("popstate", function () {
    try { q.value = new URLSearchParams(location.search).get("q") || ""; } catch (err) {}
    run(false);
  });
  function loadMore() {
    var to = Math.min(shown + PAGE, view.length);
    drawRows(shown, to, terms(q.value));
    shown = to;
    more.hidden = shown >= view.length;
    more.textContent = "Show " + Math.min(PAGE, view.length - shown) + " more";
  }
  more.addEventListener("click", loadMore);
  if ("IntersectionObserver" in window) {  // reaching the end of the list loads the next page; the button stays as the fallback
    var io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting && !more.hidden) { loadMore(); io.unobserve(more); io.observe(more); }
    }, {rootMargin: "400px"});
    io.observe(more);
  }
  q.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(run, 150); });
  document.getElementById("lform").addEventListener("submit", function (ev) { ev.preventDefault(); run(true); });
  chips.addEventListener("click", function (ev) {
    var b = ev.target.closest("button"); if (!b) return;
    topic = b.getAttribute("data-topic");
    Array.prototype.forEach.call(chips.querySelectorAll("button"), function (o) { o.setAttribute("aria-pressed", o === b ? "true" : "false"); });
    run();
  });

  try { var start = new URLSearchParams(location.search).get("q"); if (start) q.value = start; } catch (err) {}
  fetch(BASE + "data/headlines.json").then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).then(function (d) {
    data = d;
    hay = d.items.map(function (it) { return (it[3] + " " + d.sources[it[1]][0]).toLowerCase(); });
    run();
  }).catch(function () {
    status.textContent = "Could not load the headlines. Reload the page, or use the archive.";
  });
})();
