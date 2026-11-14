/* The clips viewer: one clip per screen, swipe or scroll to move on. Nothing plays until you tap, only the clip on
   screen is loaded, and the feed ends. Video comes straight from the address of the clip itself (no platform scripts,
   no cookies, no referrer); the player library is fetched from this site, and only when a clip is first played. */
(function () {
  var BASE = document.body.dataset.base || "";
  var viewer = null, scroller = null, observer = null, panels = [], lastFocus = null, hlsLoading = null, muted = false;
  var PLAY = '<svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="#fff"/></svg>';
  var PAUSE = '<svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="#fff"/></svg>';

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function all(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }
  function when(sec) {
    var d = new Date(sec * 1000);
    return window.tallyClock ? window.tallyClock(d) : d.toLocaleString();
  }
  function playable() {
    return all(document, ".clip").filter(function (li) { return !li.hidden && li.dataset.kind !== "link"; });
  }

  document.addEventListener("click", function (ev) {
    var card = ev.target.closest(".clip button.clip-card");
    if (!card) return;
    var items = playable();
    open(items, items.indexOf(card.closest(".clip")));
  });

  function loadHls() {
    if (window.Hls) return Promise.resolve(window.Hls);
    if (!hlsLoading) {
      hlsLoading = new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.src = BASE + "vendor/hls.min.js";
        s.onload = function () { resolve(window.Hls); };
        s.onerror = function () { hlsLoading = null; reject(new Error("player missing")); };
        document.head.appendChild(s);
      });
    }
    return hlsLoading;
  }

  function setState(p, state) {
    p.state = state;
    p.stage.dataset.state = state;
    p.toggle.setAttribute("aria-label", state === "playing" ? "Pause clip" : state === "loading" ? "Loading clip" : "Play clip");
    p.icon.innerHTML = state === "playing" ? PAUSE : PLAY;
    p.status.textContent = state === "loading" ? "Loading…" : "";
  }

  function unload(p) {
    p.video.pause();
    if (p.hls) { p.hls.destroy(); p.hls = null; }
    if (p.video.getAttribute("src")) { p.video.removeAttribute("src"); p.video.load(); }
    p.bar.style.width = "0";
    setState(p, "idle");
  }

  function fail(p) {
    unload(p);
    p.status.textContent = "";
    p.error.hidden = false;
  }

  function attach(p) {
    var d = p.li.dataset, v = p.video;
    if (d.kind === "mp4" || v.canPlayType("application/vnd.apple.mpegurl")) {  // Safari plays HLS itself
      v.src = d.src;
      return Promise.resolve();
    }
    return loadHls().then(function (Hls) {
      if (!Hls.isSupported()) throw new Error("no support");
      p.hls = new Hls({xhrSetup: function (x) { x.withCredentials = false; }, maxBufferLength: 20});
      p.hls.on(Hls.Events.ERROR, function (e, data) { if (data.fatal) fail(p); });
      p.hls.loadSource(d.src);
      p.hls.attachMedia(v);
    });
  }

  function toggle(p) {
    if (p.state === "idle") {
      p.error.hidden = true;
      setState(p, "loading");
      attach(p).then(function () { return p.video.play(); }).catch(function () { fail(p); });
    } else if (p.state === "loading") {
      return;
    } else if (p.video.paused) {
      p.video.play();
    } else {
      p.video.pause();
    }
  }

  function makePanel(li, i) {
    var d = li.dataset, p = {li: li, state: "idle", hls: null};
    var sec = el("section", "v-panel");
    sec.setAttribute("aria-label", d.name + ": " + d.text.slice(0, 80));
    var stage = el("div", "v-stage");
    var w = parseInt(d.w, 10), h = parseInt(d.h, 10);
    if (w && h) stage.style.aspectRatio = w + " / " + h;
    var v = document.createElement("video");
    v.setAttribute("playsinline", "");
    v.preload = "none";
    v.crossOrigin = "anonymous";
    v.referrerPolicy = "no-referrer";
    v.muted = muted;
    if (d.poster) v.poster = BASE + d.poster;
    v.setAttribute("aria-label", d.alt || ("Clip from " + d.name));
    var btn = el("button", "v-toggle");
    btn.type = "button";
    var icon = el("span", "v-ic");
    btn.appendChild(icon);
    var status = el("span", "v-status");
    status.setAttribute("role", "status");
    var bar = el("div", "v-bar"), fill = el("i");
    bar.appendChild(fill);
    bar.setAttribute("aria-hidden", "true");
    var error = el("p", "v-error");
    error.hidden = true;
    error.appendChild(document.createTextNode("This clip couldn’t be played here. "));
    var openIt = el("a", null, "Open it on " + d.platform);
    openIt.href = d.url; openIt.target = "_blank"; openIt.rel = "noopener noreferrer";
    error.appendChild(openIt);

    var info = el("div", "v-info");
    var fold = el("button", "v-fold");
    fold.type = "button";
    fold.addEventListener("click", function () { setFolded(!folded); });
    info.appendChild(fold);
    info.appendChild(el("p", "v-name", d.name + " · " + d.platform + " · " + when(d.t)));
    if (d.text) info.appendChild(el("p", "v-text", d.text));
    var links = el("p", "v-links");
    if (d.story) {
      var m = el("a", "v-story", "Matches story: " + d.storyTitle);
      m.href = BASE + "story/" + d.story + ".html";
      links.appendChild(m);
    }
    var o = el("a", "v-open", "Open on " + d.platform);
    o.href = d.url; o.target = "_blank"; o.rel = "noopener noreferrer";
    links.appendChild(o);
    info.appendChild(links);
    info.appendChild(el("p", "v-note", "Not checked by us. Check who posted it and look for a second source."));

    stage.appendChild(v); stage.appendChild(btn); stage.appendChild(status); stage.appendChild(error);
    stage.appendChild(info); stage.appendChild(bar);
    sec.appendChild(stage);
    p.el = sec; p.stage = stage; p.video = v; p.toggle = btn; p.icon = icon; p.status = status; p.bar = fill; p.error = error;
    btn.addEventListener("click", function () { toggle(p); });
    v.addEventListener("play", function () { setState(p, "playing"); });
    v.addEventListener("playing", function () { setState(p, "playing"); });
    v.addEventListener("pause", function () { if (p.state !== "idle") { p.stage.dataset.state = "paused"; p.icon.innerHTML = PLAY; p.toggle.setAttribute("aria-label", "Play clip"); } });
    v.addEventListener("ended", function () { p.stage.dataset.state = "ended"; p.icon.innerHTML = PLAY; p.toggle.setAttribute("aria-label", "Replay clip"); v.currentTime = 0; });
    v.addEventListener("error", function () { if (v.getAttribute("src")) fail(p); });
    v.addEventListener("timeupdate", function () { if (v.duration) fill.style.width = (100 * v.currentTime / v.duration).toFixed(1) + "%"; });
    setState(p, "idle");
    return p;
  }

  var folded = false;
  try { folded = localStorage.getItem("tally.clipInfoFolded") === "1"; } catch (err) {}

  function setFolded(on) {
    folded = on;
    try { localStorage.setItem("tally.clipInfoFolded", on ? "1" : "0"); } catch (err) {}
    paintFold();
  }

  function paintFold() {
    if (!viewer) return;
    viewer.classList.toggle("info-off", folded);
    all(viewer, ".v-fold").forEach(function (b) {
      b.textContent = folded ? "Show details" : "Hide details";
      b.setAttribute("aria-expanded", folded ? "false" : "true");
    });
  }

  function current() {
    var best = null, top = Infinity;
    panels.forEach(function (p) {
      var d = Math.abs(p.el.getBoundingClientRect().top);
      if (d < top) { top = d; best = p; }
    });
    return best;
  }

  function go(delta) {
    var cur = current(), i = panels.indexOf(cur) + delta;
    var targets = all(scroller, ".v-panel, .v-end");
    if (i >= 0 && i < targets.length) targets[i].scrollIntoView({block: "start"});
  }

  function open(items, index) {
    if (!items.length) return;
    close(true);
    lastFocus = document.activeElement;
    viewer = el("div", "viewer");
    viewer.setAttribute("role", "dialog");
    viewer.setAttribute("aria-modal", "true");
    viewer.setAttribute("aria-label", "Clips");
    scroller = el("div", "v-scroll");
    scroller.tabIndex = -1;
    panels = items.map(makePanel);
    panels.forEach(function (p) { scroller.appendChild(p.el); });
    var end = el("section", "v-end");
    end.appendChild(el("p", null, "That’s every clip from the accounts you follow in this update."));
    var back = el("button", "btn", "Back to the page");
    back.type = "button";
    back.addEventListener("click", function () { close(); });
    end.appendChild(back);
    scroller.appendChild(end);
    var controls = el("div", "v-controls");
    var closeBtn = el("button", "v-close", "Close");
    closeBtn.type = "button";
    closeBtn.addEventListener("click", function () { close(); });
    var prev = el("button", "v-step v-prev", "Previous");
    prev.type = "button"; prev.setAttribute("aria-label", "Previous clip");
    prev.addEventListener("click", function () { go(-1); });
    var pos = el("span", "v-pos");
    pos.setAttribute("role", "status"); pos.setAttribute("aria-live", "polite");
    var next = el("button", "v-step v-next", "Next");
    next.type = "button"; next.setAttribute("aria-label", "Next clip");
    next.addEventListener("click", function () { go(1); });
    var mute = el("button", "v-sound", muted ? "Unmute" : "Mute");
    mute.type = "button";
    mute.addEventListener("click", function () {
      muted = !muted;
      panels.forEach(function (q) { q.video.muted = muted; });
      mute.textContent = muted ? "Unmute" : "Mute";
    });
    [closeBtn, prev, pos, next, mute].forEach(function (n) { controls.appendChild(n); });
    var hint = el("p", "v-hint", window.matchMedia("(pointer: coarse)").matches ? "Swipe up for the next clip" : "Press the down arrow for the next clip");
    var refreshPos = function () {
      var endTop = end.getBoundingClientRect().top;
      var i = panels.indexOf(current());
      pos.textContent = endTop < window.innerHeight * 0.5 ? "End" : (i + 1) + " of " + panels.length;
      if (scroller.scrollTop > 12) hint.hidden = true;
    };
    var queued = false;
    scroller.addEventListener("scroll", function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; refreshPos(); });
    }, {passive: true});
    viewer.appendChild(scroller); viewer.appendChild(hint); viewer.appendChild(controls);
    document.body.appendChild(viewer);
    paintFold();
    document.documentElement.classList.add("viewing");
    if ("IntersectionObserver" in window) {  // only the clip on screen stays loaded
      observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) return;
          var p = panels.filter(function (q) { return q.el === e.target; })[0];
          if (p && p.state !== "idle") unload(p);
        });
      }, {root: scroller, threshold: 0.4});
      panels.forEach(function (p) { observer.observe(p.el); });
    }
    panels[Math.max(index, 0)].el.scrollIntoView({block: "start"});
    refreshPos();
    setTimeout(function () { hint.hidden = true; }, 7000);
    closeBtn.focus();
    document.addEventListener("keydown", onKey);
    try { if (!(history.state && history.state.tallyClip)) history.pushState({tallyClip: 1}, ""); } catch (err) {}  // so Back closes the viewer
  }

  /* closing from a button goes Back one entry; the popstate that follows does the closing, so Back and Close behave the same */
  function close(quiet) {
    if (!viewer) return;
    try { if (!quiet && history.state && history.state.tallyClip) { history.back(); return; } } catch (err) {}
    shut(quiet);
  }
  window.addEventListener("popstate", function () {
    if (viewer && !(history.state && history.state.tallyClip)) shut(false);
  });

  function shut(quiet) {
    if (!viewer) return;
    document.removeEventListener("keydown", onKey);
    if (observer) { observer.disconnect(); observer = null; }
    panels.forEach(unload);
    viewer.remove();
    viewer = scroller = null;
    panels = [];
    document.documentElement.classList.remove("viewing");
    if (!quiet && lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function onKey(ev) {
    if (!viewer) return;
    if (ev.key === "Escape") { ev.preventDefault(); close(); return; }
    var tag = (ev.target.tagName || "").toLowerCase();
    if (ev.key === "ArrowDown" || ev.key === "PageDown") { ev.preventDefault(); go(1); return; }
    if (ev.key === "ArrowUp" || ev.key === "PageUp") { ev.preventDefault(); go(-1); return; }
    if ((ev.key === " " || ev.key === "k") && tag !== "button" && tag !== "a") {
      ev.preventDefault();
      var cur = current();
      if (cur) toggle(cur);
      return;
    }
    if (ev.key === "Tab") {  // keep focus inside the viewer
      var f = all(viewer, "button, a[href]").filter(function (n) { return n.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    }
  }
})();
