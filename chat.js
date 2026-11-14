/* The Ask page. It sends your question to the helper running on this computer (chat_server.py) and shows what comes back:
   the answer, then the stories it came from in the same rows the News page uses (who covered each one is copied from the data).
   Nothing here talks to any other server. Text from the helper is always inserted as text, never as HTML.
   Opening and closing a row is handled by app.js, the same as on the News page. */
(function () {
  var root = document.getElementById("ask");
  if (!root) return;
  var $ = function (id) { return document.getElementById(id); };
  var form = $("askForm"), input = $("askQ"), go = $("askGo"), stop = $("askStop"), status = $("askStatus"),
      off = $("askOff"), out = $("askOut"), text = $("askText"), by = $("askBy"), srcBox = $("askSources"), ex = $("askEx"),
      more = $("askMore"), writeBtn = $("askWrite"), writeText = $("askWriteText"), writeBy = $("askWriteBy");
  var base = document.body.getAttribute("data-base") || "";
  /* "Your own computer": this Mac by name, its address on your Wi-Fi (how a phone reaches it), or its .local name. A hosted copy is none of these. */
  var h = location.hostname;
  var local = h === "localhost" || /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
              /^169\.254\./.test(h) || /^[\w-]+(\.[\w-]+)*\.local$/.test(h);
  var touch = window.matchMedia && matchMedia("(pointer: coarse)").matches;  /* a phone or tablet: do not pop the keyboard up on its own */
  var api = location.protocol + "//" + location.hostname + ":" + root.getAttribute("data-port");
  var SIDE = {left: "Left", center: "Center", right: "Right"}, LEANS = ["left", "center", "right"];
  var showFirst = false, ctl = null, timer = null, t0 = 0, label = "", answer = "", writeAns = "", n = 0, mode = "", model = "", note = "", lastQ = "";
  var HINT = writeBy.textContent;

  function el(tag, cls, txt) {
    var x = document.createElement(tag);
    if (cls) x.className = cls;
    if (txt != null) x.textContent = txt;
    return x;
  }
  function svg(tag, attrs) {
    var x = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (var k in attrs) x.setAttribute(k, attrs[k]);
    return x;
  }
  function safe(u) { return /^https?:\/\//i.test(u || "") ? u : null; }
  function say(t) { status.textContent = t || ""; status.classList.remove("bad"); }
  function bad(t) { status.textContent = t; status.classList.add("bad"); }
  function offline(title, body, cmd) {
    off.hidden = false;
    off.textContent = "";
    off.appendChild(el("h2", null, title));
    off.appendChild(el("p", "muted-note", body));
    if (cmd) off.appendChild(el("pre", "ask-cmd", cmd));
  }
  function busy(on) {
    go.hidden = on; stop.hidden = !on; input.disabled = on;
    if (on) { t0 = Date.now(); timer = setInterval(tick, 1000); } else { clearInterval(timer); }
  }
  function tick() {
    var s = Math.round((Date.now() - t0) / 1000);
    status.textContent = label + (label ? " " : "") + "(" + s + " s)";
  }
  /* "3 h ago" for a feed time like 2026-11-23T14:14:40Z (the same wording chat.py uses) */
  function ago(iso) {
    var t = Date.parse(iso);
    if (isNaN(t)) return "at an unknown time";
    var s = Math.max(0, Math.round((Date.now() - t) / 1000));
    return s < 90 ? "just now" : s < 3600 ? Math.floor(s / 60) + " min ago" : s < 172800 ? Math.floor(s / 3600) + " h ago" : Math.floor(s / 86400) + " d ago";
  }
  function modelName() { return model.replace(/[-_]Q\d.*$/, "").replace(/-/g, " ") || "the model"; }

  /* the one line under the answer: who wrote it, or that it was counted */
  function caption(done) {
    var t;
    if (mode === "list") t = "Counted from today's stories by code, not written by a model." + (note ? " " + note : "");
    else if (mode === "summary") t = "Summary written earlier by " + modelName() + " from the outlets' own excerpts, so it can be wrong. The headlines below are the outlets' own.";
    else if (mode === "none") t = "Try a person, place or event in the news, or ask which stories a side missed.";
    else t = "Written by " + modelName() + " from the stories below, and not checked. It can be wrong, so look at the headlines." + (done ? " Took " + Math.round((Date.now() - t0) / 1000) + " s." : "");
    by.textContent = t;
  }

  /* the answer, with [1] turned into a link that opens the row it points at. Only numbers of rows shown are linked. */
  function paint(target, str) {
    target.textContent = "";
    str.split(/(\[\d\])/).forEach(function (part) {
      var m = /^\[(\d)\]$/.exec(part);
      if (m && +m[1] >= 1 && +m[1] <= n) {
        var a = el("a", "cite", part);
        a.href = "#s-ask" + m[1];
        target.appendChild(a);
      } else if (part) target.appendChild(document.createTextNode(part));
    });
  }
  function citeClick(ev) {
    var a = ev.target.closest && ev.target.closest("a.cite");
    if (!a) return;
    ev.preventDefault();
    var head = document.querySelector(a.getAttribute("href") + " .s-head");
    if (head && head.getAttribute("aria-expanded") !== "true") head.click();
    if (head) head.scrollIntoView({block: "nearest"});
  }
  text.addEventListener("click", citeClick);
  writeText.addEventListener("click", citeClick);

  /* one story row, built the way the News page builds it (build.py render_story), so it looks and behaves the same */
  function row(s) {
    var c = s.counts, art = el("article", "story"); art.id = "s-ask" + s.n;
    var head = el("button", "s-head"); head.type = "button"; head.setAttribute("aria-expanded", "false"); head.setAttribute("aria-controls", "p-ask" + s.n);
    var main = el("span", "s-main"), title = el("span", "s-title");
    title.appendChild(el("span", "ask-n", "[" + s.n + "]")); title.appendChild(document.createTextNode(s.label));
    main.appendChild(title);
    if (showFirst && s.first && s.first.at) {  /* who published first, as a line under the title, so it reads without opening the row */
      var fl = el("span", "s-flag"); fl.appendChild(el("span", "s-ago", "First reported " + ago(s.first.at) + " by " + s.first.outlet + " (" + s.first.side + ")"));
      main.appendChild(fl);
    }
    head.appendChild(main);
    var sum = el("span", "s-sum"), bar = el("span", "bar");
    bar.setAttribute("role", "img");
    bar.setAttribute("aria-label", "Outlets covering this story: left " + c.left + ", center " + c.center + ", right " + c.right);
    var gap = function (l) { if ((s.not_covered_by || []).indexOf(l) >= 0) { var g = el("span", "seg-gap lean-" + l); g.setAttribute("aria-hidden", "true"); bar.appendChild(g); } };
    gap("left");
    LEANS.forEach(function (l) { if (c[l]) { var g = el("span", "seg lean-" + l); g.style.flexGrow = c[l]; bar.appendChild(g); } });
    gap("right");
    var count = el("span", "s-count"); count.appendChild(el("b", "n-total", String(s.outlets))); count.appendChild(document.createTextNode(" ")); count.appendChild(el("span", "w", "outlets"));
    sum.appendChild(bar); sum.appendChild(count); head.appendChild(sum);
    var chev = svg("svg", {"class": "chev", viewBox: "0 0 24 24", "aria-hidden": "true"}); chev.appendChild(svg("path", {d: "m7 10 5 5 5-5"})); head.appendChild(chev);
    var h3 = el("h3"); h3.appendChild(head); art.appendChild(h3);

    var panel = el("div", "s-panel"); panel.id = "p-ask" + s.n; panel.hidden = true;
    var legend = el("p", "legend");
    LEANS.forEach(function (l) {
      var k = el("span", "k lean-" + l); k.appendChild(document.createElement("i")); k.appendChild(document.createTextNode(SIDE[l] + " "));
      k.appendChild(el("b", null, String(c[l]))); legend.appendChild(k);
    });
    panel.appendChild(legend);
    var meta = el("p", "meta");
    if (s.not_covered_by && s.not_covered_by.length) meta.appendChild(el("span", "badge gap", "Not covered by: " + s.not_covered_by.join(" and ")));
    if (/^story\/[\w.-]+\.html$/.test(s.page || "")) { var sp = el("a", "sp", "Story page"); sp.href = base + s.page; meta.appendChild(sp); }
    panel.appendChild(meta);
    var groups = el("div", "groups");
    LEANS.forEach(function (l) {
      var g = el("section", "group lean-" + l), h4 = el("h4");
      h4.appendChild(document.createElement("i")); h4.appendChild(document.createTextNode(SIDE[l])); h4.appendChild(el("span", "n", String(c[l]))); g.appendChild(h4);
      var list = s.by_side[l] || [];
      if (!list.length) g.appendChild(el("p", "none", "No coverage from this side."));
      else {
        var ul = el("ul");
        list.forEach(function (r) {
          var li = el("li"), u = safe(r.url), hl;
          if (u) { hl = el("a", "hl", r.headline); hl.href = u; hl.target = "_blank"; hl.rel = "noopener"; } else hl = el("span", "hl", r.headline);
          li.appendChild(hl); li.appendChild(el("span", "src", r.outlet)); ul.appendChild(li);
        });
        g.appendChild(ul);
      }
      groups.appendChild(g);
    });
    panel.appendChild(groups); art.appendChild(panel);
    return art;
  }

  function handle(ev) {
    if (ev.type === "sources") {
      mode = ev.mode; model = ev.model || ""; note = ev.note || ""; n = ev.stories.length; showFirst = !!ev.show_first;
      srcBox.textContent = ""; ev.stories.forEach(function (s) { srcBox.appendChild(row(s)); });
      out.hidden = false; caption(false); more.hidden = !ev.can_write;
      label = mode === "list" || mode === "none" || mode === "summary" ? "" : "Reading " + n + (n === 1 ? " story" : " stories");
    } else if (ev.type === "status") { label = ev.text; tick(); }
    else if (ev.type === "text") { if (mode === "match" || mode === "overview") label = "Writing"; answer += ev.text; paint(text, answer); }
    else if (ev.type === "error") { bad(ev.text); }
  }
  function handleWrite(ev) {
    if (ev.type === "status") { label = ev.text; tick(); }
    else if (ev.type === "text") { label = "Writing"; writeAns += ev.text; paint(writeText, writeAns); }
    else if (ev.type === "error") { bad(ev.text); }
  }

  /* One request, two kinds: a question (write false), or "compare how each side worded it" for the last question (write true).
     The second adds only the model's text under the answer; the rows already on the page stay as they are. */
  function run(q, write) {
    if (ctl) return;
    if (write) { writeAns = ""; writeText.textContent = ""; writeBtn.hidden = true; writeBy.textContent = ""; label = "Reading the story"; }
    else {
      q = q.trim();
      if (!q) return;
      lastQ = q; answer = ""; writeAns = ""; n = 0; text.textContent = ""; by.textContent = ""; srcBox.textContent = ""; out.hidden = true; ex.hidden = true;
      more.hidden = true; writeText.textContent = ""; writeBy.textContent = HINT; writeBtn.hidden = false;
      label = "Finding the stories";
    }
    ctl = new AbortController(); busy(true); tick();
    if (touch) { input.blur(); status.scrollIntoView({block: "center", behavior: "smooth"}); }  /* close the keyboard so the answer is in view */
    var failed = false;
    fetch(api + "/api/chat", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({question: lastQ, write: !!write}), signal: ctl.signal})
      .then(function (r) {
        if (!r.ok) return r.json().then(function (j) { failed = true; bad(j.error || "The helper could not answer."); });
        var reader = r.body.getReader(), dec = new TextDecoder(), buf = "";
        function pump() {
          return reader.read().then(function (x) {
            if (x.done) return;
            buf += dec.decode(x.value, {stream: true});
            var lines = buf.split("\n"); buf = lines.pop();
            lines.forEach(function (l) { if (l.trim()) { try { var ev = JSON.parse(l); if (ev.type === "error") failed = true; (write ? handleWrite : handle)(ev); } catch (e) {} } });
            return pump();
          });
        }
        return pump();
      })
      .then(function () {
        if (failed) return;
        say("");
        if (write) writeBy.textContent = "Written by " + modelName() + " from the top story's headlines, and not checked. It can be wrong. Took " + Math.round((Date.now() - t0) / 1000) + " s.";
        else caption(true);
      })
      .catch(function (e) {
        if (e && e.name === "AbortError") say("Stopped.");
        else if (touch) { bad("Lost the connection. A phone pauses a page when you switch apps or the screen locks, so stay on this page while it answers. Then ask again."); }
        else { bad("Lost contact with the helper. Is ./chat.sh still running?"); }
      })
      .then(function () { if (write && !writeAns) { writeBtn.hidden = false; writeBy.textContent = HINT; } busy(false); ctl = null; if (!touch) input.focus(); });
  }
  function ask(q) { run(q, false); }

  form.addEventListener("submit", function (ev) { ev.preventDefault(); ask(input.value); });
  stop.addEventListener("click", function () { if (ctl) ctl.abort(); });
  writeBtn.addEventListener("click", function () { run(lastQ, true); });

  /* a few ways in: a lookup, today's top story by name, and the overview. Shown until the first question. */
  function examples() {
    var qs = ["Which stories did the left miss?"];
    fetch(base + "data/latest.json").then(function (r) { return r.json(); }).then(function (d) {
      var s = (d.stories || [])[0];
      var parts = s ? (s.label || "").split(/\s*·\s*/).filter(Boolean).slice(0, 2) : [];
      if (parts.length) qs.push("What is the news on " + parts.join(" and ") + "?");
    }).catch(function () {}).then(function () {
      qs.push("What are the main stories right now?");
      qs.forEach(function (q) {
        var b = el("button", null, q); b.type = "button";
        b.addEventListener("click", function () { input.value = q; ask(q); });
        ex.appendChild(b);
      });
      ex.hidden = false;
    });
  }

  function start() {
    if (!local) {
      offline("Ask runs on your own computer",
        "The model runs on the computer that builds this site, so this copy cannot answer questions. Run your own copy (see \"Run your own\" in the footer), install the model, and open this page there.");
      return;
    }
    say("Checking the helper…");
    fetch(api + "/api/status").then(function (r) { return r.json(); }).then(function (s) {
      if (!s.installed) {
        offline("The model is not installed yet",
          "Ask needs llama.cpp and the model file in the tools folder, the same two files the summaries use. The README's section on summaries written on your own computer shows how.");
        say("");
        return;
      }
      say("");
      input.disabled = false; go.disabled = false; if (!touch) input.focus(); examples();
    }).catch(function () {
      offline("The helper is not running",
        "On the computer that runs this site, start it in Terminal in the project folder, then reload this page. To use it from a phone, start it with --lan. It loads the model on your first question and unloads it after a quiet spell.", "./chat.sh --lan");
      say("");
    });
  }
  start();
})();
