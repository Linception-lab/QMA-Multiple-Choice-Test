/* ============================================================
   QM-Auditor Prüfungstrainer – App-Logik
   Nachgebaut aus dem Excel/VBA-Makro "QMA_Fragen".
   Läuft komplett lokal im Browser (kein Server nötig),
   Persistenz über localStorage. Funktioniert offline und
   direkt per Doppelklick auf index.html (auch auf dem iPhone
   über die "Dateien"-App), genauso wie über GitHub Pages.
   ============================================================ */

(function () {
  "use strict";

  var DATA = window.QMA_DATA;
  var TESTS = DATA.tests; // [{id, name, sheet}]
  var QUESTIONS = DATA.questions; // [{uid, id, testId, testName, question, questionRef, answers:[{text, correct, ref}]}]

  var STORAGE = {
    failed: "qma_failed_v1",
    lastPos: "qma_lastpos_v1",
    results: "qma_results_v1",
  };

  // ---------------------------------------------------------
  // Persistenz
  // ---------------------------------------------------------

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* Speicher voll oder gesperrt – App funktioniert trotzdem weiter */
    }
  }

  var failedSet = new Set(readJSON(STORAGE.failed, []));
  var lastPos = readJSON(STORAGE.lastPos, {}); // {testId: uid}
  var results = readJSON(STORAGE.results, {}); // {testId: [{date, percent}]}

  function persistFailed() {
    writeJSON(STORAGE.failed, Array.from(failedSet));
  }
  function persistLastPos() {
    writeJSON(STORAGE.lastPos, lastPos);
  }
  function persistResults() {
    writeJSON(STORAGE.results, results);
  }

  function addResult(testKey, percent) {
    if (!results[testKey]) results[testKey] = [];
    results[testKey].push({ date: new Date().toISOString(), percent: percent });
    if (results[testKey].length > 20) results[testKey].shift();
    persistResults();
  }

  function lastResult(testKey) {
    var arr = results[testKey];
    if (!arr || !arr.length) return null;
    return arr[arr.length - 1];
  }

  // ---------------------------------------------------------
  // Daten-Helfer
  // ---------------------------------------------------------

  function byUid(uid) {
    return QUESTIONS.find(function (q) {
      return q.uid === uid;
    });
  }

  function questionsForTest(testId) {
    return QUESTIONS.filter(function (q) {
      return q.testId === testId;
    });
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function fmtTime(totalSeconds) {
    var s = Math.max(0, Math.round(totalSeconds));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ":" + (r < 10 ? "0" : "") + r;
  }

  // ---------------------------------------------------------
  // App-Zustand
  // ---------------------------------------------------------

  var state = {
    screen: "home", // home | question | result
    queue: [], // Array von uid
    index: 0,
    testKey: null, // numerische testId, "all" oder "wiederholung"
    testLabel: "",
    resumeMode: false, // true = "normal", merkt sich Position
    examMode: false,
    examMinutes: 40,
    examDeadline: null, // Timestamp
    examElapsedStart: null,
    timerHandle: null,
    sessionAnswered: 0,
    sessionCorrect: 0,
    sessionWrong: 0,
    selections: {}, // answerIndex -> bool, aktuelle Frage
    checked: false,
    pendingCount: 20,
  };

  var root = document.getElementById("app");

  // ---------------------------------------------------------
  // Home-Bildschirm
  // ---------------------------------------------------------

  function totalQuestionCount() {
    return QUESTIONS.length;
  }

  function renderHome() {
    stopTimer();
    state.screen = "home";

    var failedCount = failedSet.size;

    var catRows = TESTS.map(function (t, i) {
      var count = questionsForTest(t.id).length;
      var lr = lastResult(String(t.id));
      var badge = lr
        ? '<span class="row-badge ' +
          (lr.percent >= 60 ? "ok" : "bad") +
          '">' +
          lr.percent +
          "%</span>"
        : "";
      return (
        '<button class="cat-row" data-cat="' +
        t.id +
        '">' +
        '<span class="cat-index">' +
        String(i + 1).padStart(2, "0") +
        "</span>" +
        '<span class="row-main">' +
        '<span class="row-title">' +
        escapeHtml(t.name) +
        "</span>" +
        '<span class="row-sub">' +
        count +
        " Fragen</span>" +
        "</span>" +
        badge +
        '<span class="row-chevron">›</span>' +
        "</button>"
      );
    }).join("");

    var allLr = lastResult("all");
    var allBadge = allLr
      ? '<span class="row-badge ' +
        (allLr.percent >= 60 ? "ok" : "bad") +
        '">' +
        allLr.percent +
        "%</span>"
      : "";

    root.innerHTML =
      '<div class="home">' +
      '<div class="home-hero">' +
      '<div class="eyebrow">QM-Auditor · Prüfungstrainer</div>' +
      "<h1>Fragen üben</h1>" +
      "<p>" +
      totalQuestionCount() +
      " Fragen in " +
      TESTS.length +
      " Themen · GMP-Auditor Weiterbildung</p>" +
      "</div>" +
      '<div class="search-box">' +
      '<span class="search-icon">⌕</span>' +
      '<input id="searchInput" type="search" placeholder="Fragen durchsuchen …" autocomplete="off" />' +
      "</div>" +
      '<div id="searchResults"></div>' +
      '<div class="section-label">Sonderlisten</div>' +
      '<button class="special-row" data-cat="all">' +
      '<span class="row-main">' +
      '<span class="row-title">Alle Tests</span>' +
      '<span class="row-sub">' +
      totalQuestionCount() +
      " Fragen aus allen Themen</span>" +
      "</span>" +
      allBadge +
      '<span class="row-chevron">›</span>' +
      "</button>" +
      '<button class="special-row" data-cat="wiederholung">' +
      '<span class="row-main">' +
      '<span class="row-title">Wiederholung</span>' +
      '<span class="row-sub">Falsch beantwortete Fragen</span>' +
      "</span>" +
      '<span class="row-badge ' +
      (failedCount > 0 ? "bad" : "neutral") +
      '">' +
      failedCount +
      "</span>" +
      '<span class="row-chevron">›</span>' +
      "</button>" +
      '<div class="section-label">Themen</div>' +
      catRows +
      '<div class="footer-links">' +
      '<button id="btnClearFailed">Falsche Fragen zurücksetzen</button>' +
      '<button id="btnClearPos">Gespeicherte Position löschen</button>' +
      '<button id="btnClearResults">Ergebnisverlauf löschen</button>' +
      "</div>" +
      "</div>" +
      '<div id="modusSheet"></div>';

    document.getElementById("searchInput").addEventListener("input", onSearchInput);

    Array.prototype.forEach.call(document.querySelectorAll(".cat-row, .special-row"), function (el) {
      el.addEventListener("click", function () {
        openModusPanel(el.getAttribute("data-cat"));
      });
    });

    document.getElementById("btnClearFailed").addEventListener("click", function () {
      if (confirm("Alle als falsch markierten Fragen aus der Wiederholungsliste entfernen?")) {
        failedSet.clear();
        persistFailed();
        renderHome();
      }
    });
    document.getElementById("btnClearPos").addEventListener("click", function () {
      if (confirm("Gespeicherte Fortschritts-Positionen für alle Themen löschen?")) {
        lastPos = {};
        persistLastPos();
        renderHome();
      }
    });
    document.getElementById("btnClearResults").addEventListener("click", function () {
      if (confirm("Gespeicherten Ergebnisverlauf (Prüfungssimulationen) löschen?")) {
        results = {};
        persistResults();
        renderHome();
      }
    });
  }

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ---------- Suche ----------

  var searchDebounce = null;

  function onSearchInput(e) {
    var q = e.target.value.trim();
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(function () {
      renderSearchResults(q);
    }, 150);
  }

  function searchQuestions(q) {
    if (q.length < 2) return [];
    var needle = q.toLowerCase();
    return QUESTIONS.filter(function (quest) {
      var hay = quest.id + " " + quest.question + " " + quest.answers.map(function (a) { return a.text; }).join(" ");
      return hay.toLowerCase().indexOf(needle) !== -1;
    });
  }

  function renderSearchResults(q) {
    var box = document.getElementById("searchResults");
    if (!box) return;
    if (q.length < 2) {
      box.innerHTML = "";
      return;
    }
    var found = searchQuestions(q);
    if (found.length === 0) {
      box.innerHTML =
        '<div class="search-results"><div class="search-results-count">Treffer: 0 – keine Frage gefunden</div></div>';
      return;
    }
    var rows = found
      .slice(0, 40)
      .map(function (quest) {
        return (
          '<button class="search-result-row" data-uid="' +
          quest.uid +
          '">' +
          '<span class="sr-id">' +
          escapeHtml(quest.id) +
          "</span>" +
          escapeHtml(quest.question) +
          '<span class="sr-meta">' +
          escapeHtml(quest.testName) +
          "</span>" +
          "</button>"
        );
      })
      .join("");
    box.innerHTML =
      '<div class="search-results"><div class="search-results-count">Treffer: ' +
      found.length +
      "</div>" +
      rows +
      "</div>";

    var foundUids = found.map(function (f) {
      return f.uid;
    });
    Array.prototype.forEach.call(box.querySelectorAll(".search-result-row"), function (el) {
      el.addEventListener("click", function () {
        var uid = parseInt(el.getAttribute("data-uid"), 10);
        startSession({
          queue: foundUids,
          startUid: uid,
          testKey: "search",
          testLabel: "Suchergebnisse",
          resumeMode: false,
          examMode: false,
        });
      });
    });
  }

  // ---------- Modus-Auswahl (Bottom-Sheet) ----------

  function openModusPanel(catKey) {
    var isSpecial = catKey === "all" || catKey === "wiederholung";
    var label, count;
    if (catKey === "all") {
      label = "Alle Tests";
      count = totalQuestionCount();
    } else if (catKey === "wiederholung") {
      label = "Wiederholung";
      count = failedSet.size;
    } else {
      var t = TESTS.find(function (x) {
        return String(x.id) === String(catKey);
      });
      label = t.name;
      count = questionsForTest(t.id).length;
    }

    if (catKey === "wiederholung" && count === 0) {
      alert("Es sind aktuell keine falsch beantworteten Fragen gespeichert.");
      return;
    }

    var mode = "normal";
    var examOn = false;
    var randomCount = Math.min(20, count);
    var minutes = 40;

    renderModus();

    function renderModus() {
      var sheet = document.getElementById("modusSheet");
      sheet.innerHTML =
        '<div class="modus-overlay">' +
        '<div class="modus-panel-wrap">' +
        '<div class="modus-panel">' +
        '<div class="section-label" style="margin-top:0">' +
        escapeHtml(label) +
        " · " +
        count +
        " Fragen</div>" +
        '<div class="segmented" id="segMode">' +
        '<button data-v="normal" class="' +
        (mode === "normal" ? "active" : "") +
        '">Normal</button>' +
        '<button data-v="zufall" class="' +
        (mode === "zufall" ? "active" : "") +
        '">Zufällig</button>' +
        "</div>" +
        (mode === "zufall"
          ? '<div class="field-row"><div><div class="field-label">Anzahl Fragen</div><div class="field-hint">max. ' +
            count +
            "</div></div><input type=\"number\" class=\"number-input\" id=\"randomCount\" value=\"" +
            randomCount +
            '" min="1" max="' +
            count +
            '" /></div>'
          : '<div class="field-row"><div><div class="field-label">Fortsetzen</div><div class="field-hint">Beginnt an der zuletzt bearbeiteten Frage</div></div></div>') +
        '<div class="field-row">' +
        '<div><div class="field-label">Prüfungssimulation</div><div class="field-hint">Zeitlimit, Stempel-Ergebnis am Ende, wird im Verlauf gespeichert</div></div>' +
        '<div class="switch ' +
        (examOn ? "on" : "") +
        '" id="examSwitch"></div>' +
        "</div>" +
        (examOn
          ? '<div class="field-row"><div class="field-label">Zeitlimit (Minuten)</div><input type="number" class="number-input" id="examMinutes" value="' +
            minutes +
            '" min="1" max="180" /></div>'
          : "") +
        '<button class="start-btn" id="btnStart">Test starten →</button>' +
        "</div></div></div>";

      document.querySelectorAll("#segMode button").forEach(function (b) {
        b.addEventListener("click", function () {
          mode = b.getAttribute("data-v");
          renderModus();
        });
      });
      var rc = document.getElementById("randomCount");
      if (rc)
        rc.addEventListener("input", function () {
          randomCount = parseInt(rc.value, 10) || 1;
        });
      var em = document.getElementById("examMinutes");
      if (em)
        em.addEventListener("input", function () {
          minutes = parseInt(em.value, 10) || 1;
        });
      document.getElementById("examSwitch").addEventListener("click", function () {
        examOn = !examOn;
        if (examOn) mode = "zufall";
        renderModus();
      });
      document.getElementById("btnStart").addEventListener("click", function () {
        launch();
      });

      var overlay = sheet.querySelector(".modus-overlay");
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) {
          sheet.innerHTML = "";
        }
      });
    }

    function launch() {
      var pool;
      if (catKey === "all") pool = QUESTIONS.slice();
      else if (catKey === "wiederholung")
        pool = QUESTIONS.filter(function (q) {
          return failedSet.has(q.uid);
        });
      else pool = questionsForTest(parseInt(catKey, 10));

      var queue;
      var resumeMode = false;

      if (mode === "zufall") {
        var n = Math.max(1, Math.min(randomCount, pool.length));
        queue = shuffle(pool)
          .slice(0, n)
          .map(function (q) {
            return q.uid;
          });
      } else {
        queue = pool.map(function (q) {
          return q.uid;
        });
        resumeMode = true;
      }

      document.getElementById("modusSheet").innerHTML = "";

      var startUid = null;
      if (resumeMode && lastPos[catKey]) {
        var idx = queue.indexOf(lastPos[catKey]);
        if (idx > -1) startUid = lastPos[catKey];
      }

      startSession({
        queue: queue,
        startUid: startUid,
        testKey: catKey,
        testLabel: label,
        resumeMode: resumeMode,
        examMode: examOn,
        examMinutes: minutes,
      });
    }
  }

  // ---------------------------------------------------------
  // Test-Session
  // ---------------------------------------------------------

  function startSession(opts) {
    state.queue = opts.queue;
    state.testKey = opts.testKey;
    state.testLabel = opts.testLabel;
    state.resumeMode = !!opts.resumeMode;
    state.examMode = !!opts.examMode;
    state.examMinutes = opts.examMinutes || 40;
    state.sessionAnswered = 0;
    state.sessionCorrect = 0;
    state.sessionWrong = 0;
    state.index = 0;

    if (opts.startUid != null) {
      var i = state.queue.indexOf(opts.startUid);
      if (i > -1) state.index = i;
    }

    if (state.examMode) {
      state.examDeadline = Date.now() + state.examMinutes * 60 * 1000;
      startTimer();
    } else {
      state.examDeadline = null;
      stopTimer();
    }

    state.screen = "question";
    renderQuestion();
  }

  function currentQuestion() {
    return byUid(state.queue[state.index]);
  }

  function startTimer() {
    stopTimer();
    state.timerHandle = setInterval(function () {
      updateTimerChip();
      if (state.examMode && Date.now() >= state.examDeadline) {
        finishSession();
      }
    }, 1000);
  }

  function stopTimer() {
    if (state.timerHandle) {
      clearInterval(state.timerHandle);
      state.timerHandle = null;
    }
  }

  function updateTimerChip() {
    var chip = document.getElementById("timerChip");
    if (!chip) return;
    var remaining = (state.examDeadline - Date.now()) / 1000;
    chip.textContent = "⏱ " + fmtTime(remaining);
    chip.classList.toggle("low", remaining < 60);
  }

  // ---------------------------------------------------------
  // Fragen-Bildschirm
  // ---------------------------------------------------------

  function renderQuestion() {
    var q = currentQuestion();
    state.selections = {};
    state.checked = false;

    if (!q) {
      renderQuestionShell('<div class="empty-state">Keine Fragen in dieser Auswahl.</div>');
      return;
    }

    if (state.resumeMode) {
      lastPos[state.testKey] = q.uid;
      persistLastPos();
    }

    paintQuestion();
  }

  function paintQuestion() {
    var q = currentQuestion();
    if (!q) return;

    var answersHtml = q.answers
      .map(function (a, i) {
        var sel = !!state.selections[i];
        return (
          '<button class="answer-row' +
          (sel ? " selected" : "") +
          (state.checked ? " locked" : "") +
          '" data-i="' +
          i +
          '" ' +
          (state.checked ? "disabled" : "") +
          ">" +
          '<span class="box">' +
          (sel ? "✓" : "") +
          "</span>" +
          '<span class="a-text">' +
          escapeHtml(a.text) +
          (state.checked && a.ref ? '<span class="a-ref">' + escapeHtml(a.ref) + "</span>" : "") +
          "</span>" +
          "</button>"
        );
      })
      .join("");

    var body =
      '<div class="stats-strip">' +
      "<span>Gesamt: <b>" +
      state.queue.length +
      "</b></span>" +
      "<span>Beantwortet: <b>" +
      state.sessionAnswered +
      "</b></span>" +
      "<span>Richtig: <b>" +
      state.sessionCorrect +
      "</b></span>" +
      "<span>Falsch: <b>" +
      state.sessionWrong +
      "</b></span>" +
      "</div>" +
      (state.examMode
        ? '<span class="timer-chip" id="timerChip">⏱ ' + fmtTime((state.examDeadline - Date.now()) / 1000) + "</span>"
        : "") +
      '<div class="q-card" id="qCard">' +
      '<span class="q-id-tag">' +
      escapeHtml(q.id) +
      "</span>" +
      '<p class="q-text">' +
      escapeHtml(q.question) +
      "</p>" +
      (q.questionRef ? '<div class="q-ref">' + escapeHtml(q.questionRef) + "</div>" : "") +
      '<div class="answers" id="answersBox">' +
      answersHtml +
      "</div>" +
      '<div id="resultBanner"></div>' +
      '<div id="hintMsg"></div>' +
      "</div>";

    renderQuestionShell(body);

    Array.prototype.forEach.call(document.querySelectorAll(".answer-row"), function (el) {
      el.addEventListener("click", function () {
        if (state.checked) return;
        var i = parseInt(el.getAttribute("data-i"), 10);
        state.selections[i] = !state.selections[i];
        paintQuestion();
      });
    });

    updateActionBar();
  }

  function renderQuestionShell(bodyHtml) {
    var q = currentQuestion();
    var progressPct = state.queue.length ? Math.round(((state.index + 1) / state.queue.length) * 100) : 0;

    root.innerHTML =
      '<div class="topbar">' +
      '<div class="topbar-row">' +
      '<button class="topbar-back" id="btnHome">‹ Themen</button>' +
      '<div class="topbar-title">' +
      escapeHtml(state.testLabel) +
      "</div>" +
      '<div class="topbar-progress">' +
      (state.queue.length ? state.index + 1 + " / " + state.queue.length : "0 / 0") +
      "</div>" +
      "</div>" +
      "</div>" +
      '<div class="progress-track"><div class="progress-fill" style="width:' +
      progressPct +
      '%"></div></div>' +
      '<div class="question-wrap">' +
      bodyHtml +
      "</div>" +
      '<div class="action-bar" id="actionBar">' +
      '<div class="action-bar-inner">' +
      '<button class="btn btn-ghost" id="btnPrev">‹ Zurück</button>' +
      '<button class="btn btn-primary" id="btnEval">Auflösung</button>' +
      '<button class="btn btn-ghost" id="btnNext">Weiter ›</button>' +
      "</div></div>";

    document.getElementById("btnHome").addEventListener("click", function () {
      if (confirm("Zurück zur Themenübersicht? Der Testfortschritt dieser Sitzung geht verloren.")) {
        renderHome();
      }
    });
    document.getElementById("btnPrev").addEventListener("click", goPrev);
    document.getElementById("btnNext").addEventListener("click", goNext);
    document.getElementById("btnEval").addEventListener("click", onEvaluate);
  }

  function updateActionBar() {
    var evalBtn = document.getElementById("btnEval");
    var prevBtn = document.getElementById("btnPrev");
    if (!evalBtn) return;
    evalBtn.textContent = state.checked ? "Ausgewertet ✓" : "Auflösung";
    evalBtn.disabled = state.checked;
    prevBtn.disabled = state.index === 0;
  }

  function onEvaluate() {
    var q = currentQuestion();
    if (!q) return;

    var anySelected = q.answers.some(function (a, i) {
      return !!state.selections[i];
    });
    var hint = document.getElementById("hintMsg");
    if (!anySelected) {
      if (hint) hint.innerHTML = '<div class="hint-msg">Bitte mindestens eine Auswahl treffen.</div>';
      return;
    }
    if (hint) hint.innerHTML = "";

    state.checked = true;
    var wrongCount = 0;
    q.answers.forEach(function (a, i) {
      var sel = !!state.selections[i];
      if (sel !== a.correct) wrongCount++;
    });

    var isCorrect = wrongCount === 0;
    state.sessionAnswered++;
    if (isCorrect) {
      state.sessionCorrect++;
      failedSet.delete(q.uid);
    } else {
      state.sessionWrong++;
      failedSet.add(q.uid);
    }
    persistFailed();

    paintQuestionEvaluated(isCorrect);
  }

  function paintQuestionEvaluated(isCorrect) {
    var q = currentQuestion();

    Array.prototype.forEach.call(document.querySelectorAll(".answer-row"), function (el) {
      var i = parseInt(el.getAttribute("data-i"), 10);
      var a = q.answers[i];
      var sel = !!state.selections[i];
      el.classList.remove("selected");
      el.classList.add(sel === a.correct ? "eval-correct" : "eval-wrong");
      if (a.ref) {
        var textEl = el.querySelector(".a-text");
        if (textEl && !textEl.querySelector(".a-ref")) {
          var refEl = document.createElement("span");
          refEl.className = "a-ref";
          refEl.textContent = a.ref;
          textEl.appendChild(refEl);
        }
      }
    });

    var banner = document.getElementById("resultBanner");
    if (banner) {
      banner.innerHTML =
        '<div class="result-banner ' +
        (isCorrect ? "richtig" : "falsch") +
        '">' +
        '<div><div class="rb-text">' +
        (isCorrect ? "RICHTIG" : "FALSCH") +
        "</div>" +
        (q.questionRef ? '<div class="rb-ref">' + escapeHtml(q.questionRef) + "</div>" : "") +
        "</div></div>";
    }

    var card = document.getElementById("qCard");
    if (card) {
      var stamp = document.createElement("div");
      stamp.className = "stamp-sm " + (isCorrect ? "richtig" : "falsch");
      stamp.textContent = isCorrect ? "RICHTIG" : "FALSCH";
      card.appendChild(stamp);
    }

    updateActionBar();
  }

  function goPrev() {
    if (state.index > 0) {
      state.index--;
      renderQuestion();
    }
  }

  function goNext() {
    if (state.index < state.queue.length - 1) {
      state.index++;
      renderQuestion();
    } else {
      finishSession();
    }
  }

  // ---------------------------------------------------------
  // Ergebnis-Bildschirm
  // ---------------------------------------------------------

  function finishSession() {
    stopTimer();
    var answered = state.sessionAnswered;
    var percent = answered > 0 ? Math.round((state.sessionCorrect / answered) * 100) : 0;

    if (state.examMode) {
      addResult(String(state.testKey), percent);
    }

    state.screen = "result";
    var pass = percent >= 60;

    root.innerHTML =
      '<div class="topbar"><div class="topbar-row">' +
      '<button class="topbar-back" id="btnHome">‹ Themen</button>' +
      '<div class="topbar-title">Ergebnis</div><div></div></div></div>' +
      '<div class="result-screen">' +
      '<div class="eyebrow">' +
      escapeHtml(state.testLabel) +
      "</div>" +
      '<div class="stamp-lg ' +
      (pass ? "pass" : "fail") +
      '"><div class="pct">' +
      percent +
      '%</div><div class="label">' +
      (pass ? "Bestanden" : "Nicht bestanden") +
      "</div></div>" +
      "<h2>" +
      (answered > 0 ? "Test abgeschlossen" : "Keine Frage beantwortet") +
      "</h2>" +
      "<p>" +
      state.queue.length +
      " Fragen vorgelegt · " +
      answered +
      " beantwortet</p>" +
      '<div class="result-stats">' +
      '<div class="result-stat"><div class="n">' +
      state.sessionCorrect +
      '</div><div class="l">Richtig</div></div>' +
      '<div class="result-stat"><div class="n">' +
      state.sessionWrong +
      '</div><div class="l">Falsch</div></div>' +
      '<div class="result-stat"><div class="n">' +
      (state.queue.length - answered) +
      '</div><div class="l">Offen</div></div>' +
      "</div>" +
      '<div class="result-actions">' +
      '<button class="start-btn" id="btnBackHome">Zurück zur Übersicht</button>' +
      (failedSet.size > 0
        ? '<button class="btn btn-ghost" id="btnReview" style="padding:13px;">Falsche Fragen wiederholen (' +
          failedSet.size +
          ")</button>"
        : "") +
      "</div></div>";

    document.getElementById("btnHome").addEventListener("click", renderHome);
    document.getElementById("btnBackHome").addEventListener("click", renderHome);
    var reviewBtn = document.getElementById("btnReview");
    if (reviewBtn) {
      reviewBtn.addEventListener("click", function () {
        renderHome();
        openModusPanel("wiederholung");
      });
    }
  }

  // ---------------------------------------------------------
  // Start
  // ---------------------------------------------------------

  renderHome();
})();
