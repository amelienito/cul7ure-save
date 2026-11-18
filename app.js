/* Cul7ure · tableau de bord des archives
   Données : data/articles.js (instantané) + le Google Sheet de suivi publié en CSV (config.js).
   Le Sheet a le dernier mot : ce qui y est coché ou corrigé remplace l'instantané. */
(function () {
  "use strict";

  // ------------------------------------------------------------------ réglages
  var RUBS = [
    { k: "Chroniques", hex: "#9085e9" },
    { k: "Dossiers", hex: "#199e70" },
    { k: "Interviews", hex: "#d95926" },
    { k: "Parenthèses", hex: "#3987e5" },
    { k: "Portraits", hex: "#d55181" }
  ];
  var AUTRE = { k: "Autres", hex: "#6f6c99" };
  var MOTS_PAR_PAGE = 320;
  var TAGS = {
    introuvable: { one: "Introuvable dans l’archive", lab: "Introuvables dans l’archive", ds: "Cités par d’autres articles mais jamais archivés : piste BnF", st: "critical", o: 0 },
    spam: { one: "Spam possible", lab: "Spam possible", ds: "Des mots de casino traînent dans le texte", st: "critical", o: 1 },
    video: { one: "Interview vidéo à retranscrire", lab: "Interviews vidéo à retranscrire", ds: "Le texte ne contient que l’intro et le lien YouTube", st: "serious", o: 2 },
    auteur: { one: "Plume à retrouver", lab: "Plume à retrouver", ds: "Signé « Anonyme » sur le site", st: "warn", o: 3 },
    date: { one: "Date à retrouver", lab: "Date à retrouver", ds: "Pas de date dans l’archive", st: "warn", o: 4 },
    court: { one: "Texte très court", lab: "Textes très courts", ds: "Annonces, ou contenus partis en PDF (Osmose)", st: "info", o: 5 },
    v2020: { one: "Version 2020 à vérifier", lab: "Versions 2020 à vérifier", ds: "Récupérées depuis l’ancienne maquette du site", st: "info", o: 6 },
    guillemets: { one: "Guillemets à vérifier", lab: "Guillemets à vérifier", ds: "Guillemets droits en nombre impair", st: "info", o: 7 },
    autre: { one: "Remarque dans le Sheet", lab: "Autres remarques", ds: "Voir la colonne Alertes du Sheet", st: "info", o: 8 }
  };
  var STATUTS = [
    ["", "Tous les statuts"],
    ["aRelire", "Pas encore relus à deux"],
    ["aRelireF", "À relire par Florian"],
    ["aRelireA", "À relire par Amélien"],
    ["relus", "Relus par vous deux"]
  ];
  var LIVRE_STATUTS = [
    ["livreOui", "Livre : oui"],
    ["livrePeut", "Livre : peut-être"],
    ["livreNon", "Livre : non"],
    ["livreVide", "Livre : pas encore décidé"]
  ];

  var nf = new Intl.NumberFormat("fr-FR");
  var nfc = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });
  var MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

  // ------------------------------------------------------------------ outils
  function $(id) { return document.getElementById(id); }
  function h(tag, attrs) {
    var el = document.createElement(tag), k;
    if (attrs) for (k in attrs) {
      if (attrs[k] == null || attrs[k] === false) continue;
      if (k === "class") el.className = attrs[k];
      else if (k === "text") el.textContent = attrs[k];
      else if (k === "style") el.setAttribute("style", attrs[k]);
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), attrs[k]);
      else el.setAttribute(k, attrs[k] === true ? "" : attrs[k]);
    }
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(el, x); }); return; }
    el.appendChild(typeof c === "object" ? c : document.createTextNode(String(c)));
  }
  var SVGNS = "http://www.w3.org/2000/svg";
  function s(tag, attrs) {
    var el = document.createElementNS(SVGNS, tag);
    for (var k in attrs || {}) el.setAttribute(k, attrs[k]);
    return el;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function fold(t) {
    return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "'");
  }
  function rubOf(name) {
    for (var i = 0; i < RUBS.length; i++) if (fold(RUBS[i].k) === fold(name)) return RUBS[i];
    return AUTRE;
  }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
  function dateFr(d) {
    if (!d) return "—";
    var p = d.split("-");
    return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : d;
  }
  function moisAn(d) {
    if (!d) return "";
    var p = d.split("-");
    return MOIS[+p[1] - 1] + " " + p[0];
  }
  function icon(st, size) {
    size = size || 20;
    var col = { critical: "#d03b3b", serious: "#ec835a", warn: "#fab219", info: "#9396C9", good: "#0ca30c" }[st];
    var svg = s("svg", { viewBox: "0 0 20 20", width: size, height: size, class: "ic", "aria-hidden": "true" });
    if (st === "critical") {
      svg.appendChild(s("path", { d: "M6.6 2h6.8L18 6.6v6.8L13.4 18H6.6L2 13.4V6.6z", fill: col }));
      svg.appendChild(s("path", { d: "M10 5.8v5.2M10 13.9v.1", stroke: "#fff", "stroke-width": "2", "stroke-linecap": "round" }));
    } else if (st === "serious") {
      svg.appendChild(s("path", { d: "M10 2.3l8.2 14.6H1.8z", fill: col, "stroke-linejoin": "round" }));
      svg.appendChild(s("path", { d: "M10 7.6v4.2M10 14.4v.1", stroke: "#0b0b0b", "stroke-width": "1.9", "stroke-linecap": "round" }));
    } else if (st === "warn") {
      svg.appendChild(s("circle", { cx: 10, cy: 10, r: 8.2, fill: col }));
      svg.appendChild(s("path", { d: "M10 5.6v5.4M10 13.9v.1", stroke: "#0b0b0b", "stroke-width": "2", "stroke-linecap": "round" }));
    } else if (st === "good") {
      svg.appendChild(s("circle", { cx: 10, cy: 10, r: 8.2, fill: col }));
      svg.appendChild(s("path", { d: "M6.2 10.2l2.5 2.5 5.1-5.3", stroke: "#fff", "stroke-width": "2", fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" }));
    } else {
      svg.appendChild(s("circle", { cx: 10, cy: 10, r: 7.6, fill: "none", stroke: col, "stroke-width": "1.6" }));
      svg.appendChild(s("path", { d: "M10 9v5M10 6.1v.1", stroke: col, "stroke-width": "1.9", "stroke-linecap": "round" }));
    }
    return svg;
  }
  var ICON_LINK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M9 3h4v4M13 3L7.5 8.5M11 9.5V13H3V5h3.5"/></svg>';
  function svgFrom(str) { var t = document.createElement("template"); t.innerHTML = str; return t.content.firstChild; }

  // ------------------------------------------------------------------ données
  function classify(a) {
    var tags = [];
    (a.alertes || []).forEach(function (raw) {
      var l = fold(raw), t;
      if (l.indexOf("introuvable") >= 0) t = "introuvable";
      else if (l.indexOf("spam") >= 0) t = "spam";
      else if (l.indexOf("tres court") >= 0) t = a.vid > 0 ? "video" : "court";
      else if (l.indexOf("auteur") >= 0) t = "auteur";
      else if (l.indexOf("date") >= 0) t = "date";
      else if (l.indexOf("ancienne") >= 0 || l.indexOf("2020") >= 0) t = "v2020";
      else if (l.indexOf("guillemet") >= 0) t = "guillemets";
      else t = "autre";
      if (tags.indexOf(t) < 0) tags.push(t);
    });
    if (!a.manquant && !a.auteur && tags.indexOf("auteur") < 0) tags.push("auteur");
    tags.sort(function (x, y) { return TAGS[x].o - TAGS[y].o; });
    return tags;
  }
  function prepare(a) {
    a.annee = a.date ? a.date.slice(0, 4) : "";
    a.trim = a.date ? a.annee + "-T" + (Math.floor((+a.date.slice(5, 7) - 1) / 3) + 1) : "";
    a.rubK = rubOf(a.rub).k;
    a.tags = classify(a);
    a.relF = !!a.relF; a.relA = !!a.relA;
    a._q = fold([a.titre, a.auteur, a.rub, (a.noms || []).join(" "), a.extrait, a.notes].join(" "));
    return a;
  }
  var SNAP = (window.CUL7URE_DATA && window.CUL7URE_DATA.articles) || [];
  var ALL = SNAP.map(function (a) { return prepare(Object.assign({}, a)); });
  var HAS_LIVRE = false;

  // ------------------------------------------------------------------ lecture du Google Sheet
  function parseCSV(text) {
    var rows = [], row = [], f = "", q = false, i, c;
    text = text.replace(/^﻿/, "");
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(f); f = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(f); rows.push(row); row = []; f = "";
      } else f += c;
    }
    if (f || row.length) { row.push(f); rows.push(row); }
    return rows;
  }
  function vrai(v) { return /^(true|vrai|oui|x|✓|✔|✅|1|ok|fait|yes|relu)$/i.test(String(v || "").trim()); }
  function cleSrc(src) {
    var m = String(src || "").match(/cul7ure\.fr\/(.+?)\/?(?:[?#].*)?$/);
    return m ? m[1].replace(/^\/+|\/+$/g, "") : "";
  }
  function fromSheet(rows) {
    var hi = -1, i;
    for (i = 0; i < Math.min(rows.length, 10); i++) {
      if (rows[i].some(function (c) { return fold(c).indexOf("titre") >= 0; })) { hi = i; break; }
    }
    if (hi < 0) throw new Error("Pas de colonne « Titre » dans le Sheet.");
    var H = rows[hi].map(function (c) { return fold(c).trim(); });
    function col(test) { for (var j = 0; j < H.length; j++) if (H[j] && test(H[j])) return j; return -1; }
    var C = {
      date: col(function (x) { return x === "date" || x.indexOf("date") === 0; }),
      rub: col(function (x) { return x.indexOf("rubrique") >= 0; }),
      auteur: col(function (x) { return x.indexOf("auteur") >= 0 || x.indexOf("plume") >= 0 || x.indexOf("autrice") >= 0; }),
      titre: col(function (x) { return x.indexOf("titre") >= 0; }),
      mots: col(function (x) { return x === "mots" || x.indexOf("mots") === 0; }),
      alertes: col(function (x) { return x.indexOf("alerte") >= 0; }),
      relF: col(function (x) { return x.indexOf("florian") >= 0; }),
      relA: col(function (x) { return x.indexOf("amelien") >= 0; }),
      src: col(function (x) { return x.indexOf("source") >= 0 || x.indexOf("archive") >= 0; }),
      notes: col(function (x) { return x.indexOf("note") >= 0 || x.indexOf("remarque") >= 0 || x.indexOf("commentaire") >= 0; }),
      livre: col(function (x) { return x.indexOf("livre") >= 0; })
    };
    var body = rows.slice(hi + 1).filter(function (r) { return C.titre >= 0 && String(r[C.titre] || "").trim(); });
    // colonne de lien Google Doc : un en-tête avec « doc » ou « lien » dont les cellules sont des adresses
    C.gdoc = -1;
    H.forEach(function (x, j) {
      if (C.gdoc >= 0 || j === C.src) return;
      if (x.indexOf("doc") >= 0 || x.indexOf("lien") >= 0 || x.indexOf("drive") >= 0) {
        if (body.some(function (r) { return /^https?:\/\//.test(String(r[j] || "").trim()); })) C.gdoc = j;
      }
    });
    var byId = {}, byT = {};
    SNAP.forEach(function (a) { if (a.id) byId[a.id] = a; byT[fold(a.titre).replace(/[^a-z0-9]/g, "")] = a; });
    var get = function (r, k) { return C[k] >= 0 ? String(r[C[k]] || "").trim() : ""; };
    var livreVu = false;
    var out = body.map(function (r) {
      var key = cleSrc(get(r, "src"));
      var base = byId[key] || byT[fold(get(r, "titre")).replace(/[^a-z0-9]/g, "")] || {};
      var a = Object.assign({}, base);
      a.id = a.id || key || get(r, "titre");
      if (C.date >= 0) a.date = get(r, "date") || a.date || "";
      if (C.rub >= 0) a.rub = get(r, "rub") || a.rub || "";
      if (C.auteur >= 0) a.auteur = get(r, "auteur");
      a.titre = get(r, "titre");
      if (C.mots >= 0) a.mots = parseInt(get(r, "mots").replace(/\D/g, ""), 10) || a.mots || 0;
      if (C.alertes >= 0) a.alertes = get(r, "alertes").split(/\s*;\s*/).filter(Boolean);
      if (C.src >= 0 && get(r, "src")) a.src = get(r, "src");
      a.relF = vrai(get(r, "relF")); a.relA = vrai(get(r, "relA"));
      a.gdoc = C.gdoc >= 0 ? String(r[C.gdoc] || "").trim() : "";
      a.notes = get(r, "notes");
      if (C.livre >= 0) {
        livreVu = true;
        var l = fold(get(r, "livre"));
        a.livre = !l ? "" : (l.indexOf("peut") >= 0 || l.indexOf("?") >= 0) ? "peut" : (/^(non|no|x non|false|faux)$/.test(l) ? "non" : (vrai(l) || l.indexOf("oui") >= 0 ? "oui" : "peut"));
      }
      if (base.manquant == null) a.manquant = (a.alertes || []).some(function (x) { return fold(x).indexOf("introuvable") >= 0; });
      // le Sheet a été corrigé ? on ne garde la date que si elle a la forme AAAA-MM-JJ
      if (a.date && !/^\d{4}-\d{2}-\d{2}$/.test(a.date)) {
        var m = a.date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        a.date = m ? m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2) : "";
      }
      return prepare(a);
    });
    if (!out.length) throw new Error("Le Sheet ne contient aucun article.");
    HAS_LIVRE = livreVu;
    return out;
  }

  var cfg = Object.assign({ sheetCsv: "", sheetEdit: "" }, window.CUL7URE_CONFIG || {});
  try {
    var ls = localStorage.getItem("cul7ure.sheetCsv"), le = localStorage.getItem("cul7ure.sheetEdit");
    if (ls) cfg.sheetCsv = ls;
    if (le) cfg.sheetEdit = le;
  } catch (e) { /* stockage indisponible : on garde config.js */ }
  var lastLoad = 0;

  function setSync(state, txt) {
    $("syncDot").className = "dot" + (state === "on" ? " on" : state === "err" ? " err" : "");
    $("syncTxt").textContent = txt;
    $("refresh").hidden = !cfg.sheetCsv;
    var open = $("openSheet");
    open.hidden = !cfg.sheetEdit;
    if (cfg.sheetEdit) open.href = cfg.sheetEdit;
    $("settings").lastChild.textContent = cfg.sheetCsv ? "Réglages" : "Brancher le Sheet";
  }
  function loadSheet() {
    if (!cfg.sheetCsv) { setSync("", "Instantané du 18/11/2026"); return Promise.resolve(); }
    $("grid").classList.add("loading");
    setSync("", "Lecture du Google Sheet…");
    var url = cfg.sheetCsv + (cfg.sheetCsv.indexOf("?") >= 0 ? "&" : "?") + "_=" + Date.now();
    return fetch(url, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("Le Sheet répond " + r.status); return r.text(); })
      .then(function (t) {
        if (/^\s*</.test(t)) throw new Error("L’adresse ne renvoie pas un CSV : vérifie « Publier sur le Web » au format .csv.");
        ALL = fromSheet(parseCSV(t));
        lastLoad = Date.now();
        var d = new Date();
        setSync("on", "Google Sheet · " + ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2));
      })
      .catch(function (e) {
        setSync("err", "Sheet injoignable · instantané affiché");
        console.warn("Cul7ure :", e);
        throw e;
      })
      .finally(function () { $("grid").classList.remove("loading"); render(); });
  }

  // ------------------------------------------------------------------ filtres
  var S = { q: "", rubs: [], auteur: "", annee: "", statut: "", alerte: "", nom: "", sort: "date", dir: 1, open: "" };
  function readHash() {
    var p = new URLSearchParams(location.hash.slice(1));
    S.q = p.get("q") || "";
    S.rubs = (p.get("r") || "").split(",").filter(Boolean);
    S.auteur = p.get("a") || ""; S.annee = p.get("y") || ""; S.statut = p.get("s") || "";
    S.alerte = p.get("al") || ""; S.nom = p.get("n") || "";
    if (p.get("tri")) { S.sort = p.get("tri").replace(/^-/, ""); S.dir = p.get("tri")[0] === "-" ? -1 : 1; }
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (S.q) p.set("q", S.q);
    if (S.rubs.length) p.set("r", S.rubs.join(","));
    if (S.auteur) p.set("a", S.auteur);
    if (S.annee) p.set("y", S.annee);
    if (S.statut) p.set("s", S.statut);
    if (S.alerte) p.set("al", S.alerte);
    if (S.nom) p.set("n", S.nom);
    if (S.sort !== "date" || S.dir !== 1) p.set("tri", (S.dir < 0 ? "-" : "") + S.sort);
    var str = p.toString();
    history.replaceState(null, "", str ? "#" + str : location.pathname + location.search);
  }
  function match(a, except) {
    if (except !== "q" && S.q) {
      var words = fold(S.q).split(/\s+/).filter(Boolean);
      for (var i = 0; i < words.length; i++) if (a._q.indexOf(words[i]) < 0) return false;
    }
    if (except !== "rubs" && S.rubs.length && S.rubs.indexOf(a.rubK) < 0) return false;
    if (except !== "auteur" && S.auteur && (a.auteur || "(non signé)") !== S.auteur) return false;
    if (except !== "annee" && S.annee && a.annee !== S.annee) return false;
    if (except !== "alerte" && S.alerte && a.tags.indexOf(S.alerte) < 0) return false;
    if (except !== "nom" && S.nom && (a.noms || []).indexOf(S.nom) < 0) return false;
    if (except !== "statut" && S.statut) {
      if (a.manquant) return false;
      switch (S.statut) {
        case "aRelire": if (a.relF && a.relA) return false; break;
        case "aRelireF": if (a.relF) return false; break;
        case "aRelireA": if (a.relA) return false; break;
        case "relus": if (!(a.relF && a.relA)) return false; break;
        case "livreOui": if (a.livre !== "oui") return false; break;
        case "livrePeut": if (a.livre !== "peut") return false; break;
        case "livreNon": if (a.livre !== "non") return false; break;
        case "livreVide": if (a.livre) return false; break;
      }
    }
    return true;
  }
  function filtered(except) { return ALL.filter(function (a) { return match(a, except); }); }
  function setF(k, v) { S[k] = v; S.open = ""; writeHash(); render(); }
  function toggleRub(k) {
    var i = S.rubs.indexOf(k);
    if (i >= 0) S.rubs.splice(i, 1); else S.rubs.push(k);
    S.open = ""; writeHash(); render();
  }
  function resetAll() {
    S.q = ""; S.rubs = []; S.auteur = ""; S.annee = ""; S.statut = ""; S.alerte = ""; S.nom = ""; S.open = "";
    $("q").value = ""; writeHash(); render();
  }

  // ------------------------------------------------------------------ bulle d'info
  var tip = $("tip");
  function showTip(x, y, title, rows) {
    clear(tip);
    tip.appendChild(h("div", { class: "tt", text: title }));
    rows.forEach(function (r) {
      tip.appendChild(h("div", { class: "tr" },
        r.c ? h("i", { style: "background:" + r.c }) : null,
        h("b", { text: r.v }), h("span", { text: r.l })));
    });
    tip.classList.add("on");
    var w = tip.offsetWidth, hh = tip.offsetHeight;
    var left = Math.min(window.innerWidth - w - 10, Math.max(10, x + 14));
    var top = y - hh - 12 < 8 ? y + 16 : y - hh - 12;
    tip.style.left = left + "px"; tip.style.top = top + "px";
  }
  function hideTip() { tip.classList.remove("on"); }

  // ------------------------------------------------------------------ rendu
  function renderFilters() {
    var chips = clear($("rubChips"));
    RUBS.forEach(function (r) {
      chips.appendChild(h("button", {
        class: "chip", type: "button", "aria-pressed": S.rubs.indexOf(r.k) >= 0 ? "true" : "false",
        onclick: function () { toggleRub(r.k); }
      }, h("span", { class: "sw", style: "background:" + r.hex }), r.k));
    });
    // plumes
    var aus = {};
    ALL.forEach(function (a) { if (!a.manquant) { var k = a.auteur || "(non signé)"; aus[k] = (aus[k] || 0) + 1; } });
    var fa = clear($("fAuteur"));
    fa.appendChild(h("option", { value: "", text: "Toutes les plumes" }));
    Object.keys(aus).sort(function (x, y) { return aus[y] - aus[x] || x.localeCompare(y, "fr"); })
      .forEach(function (k) { fa.appendChild(h("option", { value: k, text: k + " (" + aus[k] + ")" })); });
    fa.value = S.auteur; fa.classList.toggle("on", !!S.auteur);
    // années
    var ys = {};
    ALL.forEach(function (a) { if (a.annee) ys[a.annee] = 1; });
    var fy = clear($("fAnnee"));
    fy.appendChild(h("option", { value: "", text: "Toutes les années" }));
    Object.keys(ys).sort().forEach(function (y) { fy.appendChild(h("option", { value: y, text: y })); });
    fy.value = S.annee; fy.classList.toggle("on", !!S.annee);
    // statut
    var fs = clear($("fStatut"));
    STATUTS.concat(HAS_LIVRE ? LIVRE_STATUTS : []).forEach(function (o) { fs.appendChild(h("option", { value: o[0], text: o[1] })); });
    fs.value = S.statut; fs.classList.toggle("on", !!S.statut);
    // filtres actifs hors menus
    var act = clear($("active"));
    function tag(label, onx) {
      act.appendChild(h("span", { class: "tagx" }, label,
        h("button", { type: "button", "aria-label": "Retirer le filtre " + label, onclick: onx, text: "×" })));
    }
    if (S.nom) tag("Cite " + S.nom, function () { setF("nom", ""); });
    if (S.alerte) tag(TAGS[S.alerte] ? TAGS[S.alerte].lab : S.alerte, function () { setF("alerte", ""); });
    if (S.q || S.rubs.length || S.auteur || S.annee || S.statut || S.alerte || S.nom) {
      act.appendChild(h("button", { class: "reset", type: "button", onclick: resetAll, text: "Tout réafficher" }));
    }
  }

  function renderKpis(list) {
    var arts = list.filter(function (a) { return !a.manquant; });
    var manq = list.length - arts.length;
    var mots = arts.reduce(function (t, a) { return t + (a.mots || 0); }, 0);
    var plumes = {};
    arts.forEach(function (a) { if (a.auteur) plumes[a.auteur] = 1; });
    var ys = {}, best = ["", 0];
    arts.forEach(function (a) { if (a.annee) { ys[a.annee] = (ys[a.annee] || 0) + 1; if (ys[a.annee] > best[1]) best = [a.annee, ys[a.annee]]; } });
    var yk = Object.keys(ys).sort();
    var todo = list.filter(function (a) { return a.tags.length; }).length;
    var k = clear($("kpis"));
    function tile(l, v, d, cls, extra) {
      k.appendChild(h("div", { class: "kpi" + (cls ? " " + cls : "") },
        h("div", { class: "l", text: l }), h("div", { class: "v" }, extra, v), h("div", { class: "d", text: d })));
    }
    tile("Articles", nf.format(arts.length), manq ? "+ " + manq + " introuvable" + (manq > 1 ? "s" : "") : "tous récupérés");
    tile("Mots", nfc.format(mots), "≈ " + nf.format(Math.round(mots / MOTS_PAR_PAGE)) + " pages de livre");
    tile("Plumes", nf.format(Object.keys(plumes).length), "auteurs et autrices");
    var span = yk.length ? (+yk[yk.length - 1] - +yk[0] + 1) : 0;
    tile("Période", span ? span + (span > 1 ? " ans" : " an") : "—",
      yk.length ? (yk[0] === yk[yk.length - 1] ? yk[0] : yk[0] + " → " + yk[yk.length - 1]) + (best[1] ? " · pic en " + best[0] + " (" + best[1] + ")" : "") : "");
    tile("À traiter", nf.format(todo), todo ? "articles avec une alerte" : "rien à signaler", "warn", todo ? icon("serious", 22) : icon("good", 22));
  }

  function renderRelecture(list) {
    var arts = list.filter(function (a) { return !a.manquant; });
    var n = arts.length;
    var f = arts.filter(function (a) { return a.relF; }).length;
    var am = arts.filter(function (a) { return a.relA; }).length;
    var both = arts.filter(function (a) { return a.relF && a.relA; }).length;
    var bn = clear($("bothNum"));
    bn.appendChild(document.createTextNode(nf.format(both)));
    bn.appendChild(h("small", { text: "/ " + nf.format(n) }));
    $("bothLab").textContent = both === n && n ? "tout est relu par vous deux. Champagne." : "relus par vous deux (" + pct(both, n) + " %)";
    var m = clear($("meters"));
    function meter(label, v, tot) {
      m.appendChild(h("div", { class: "meter" },
        h("div", { class: "row" }, h("b", { text: label }), h("span", { class: "tab", text: nf.format(v) + " / " + nf.format(tot) + " · " + pct(v, tot) + " %" })),
        h("div", { class: "track", role: "progressbar", "aria-label": label, "aria-valuemin": 0, "aria-valuemax": tot, "aria-valuenow": v },
          h("div", { class: "fill", style: "width:" + (tot ? v / tot * 100 : 0) + "%" }))));
    }
    meter("Relu par Florian", f, n);
    meter("Relu par Amélien", am, n);
    if (HAS_LIVRE) {
      var oui = arts.filter(function (a) { return a.livre === "oui"; }).length;
      var peut = arts.filter(function (a) { return a.livre === "peut"; }).length;
      var non = arts.filter(function (a) { return a.livre === "non"; }).length;
      meter("Tri pour le livre (décidés)", oui + peut + non, n);
      m.appendChild(h("div", { class: "hint", style: "font-size:12.5px;color:var(--muted)", text: oui + " oui · " + peut + " peut-être · " + non + " non" }));
    }
    $("livreTip").hidden = HAS_LIVRE;
    $("relHint").textContent = cfg.sheetCsv
      ? "Lu dans le Google Sheet : ce que vous cochez là-bas apparaît ici à chaque visite."
      : "Coche « Relu par Florian » et « Relu par Amélien » dans le Google Sheet, puis branche-le (en haut à droite).";
    var rp = clear($("rubprog"));
    rp.appendChild(h("div", { class: "r hd" }, h("span", { text: "Rubrique" }), h("span", { text: "Florian" }), h("span", { text: "Amélien" }), h("span", { class: "c", text: "Art." })));
    RUBS.forEach(function (r) {
      var sub = arts.filter(function (a) { return a.rubK === r.k; });
      if (!sub.length) return;
      var sf = sub.filter(function (a) { return a.relF; }).length, sa = sub.filter(function (a) { return a.relA; }).length;
      rp.appendChild(h("div", { class: "r" },
        h("span", { class: "n" }, h("span", { class: "sw", style: "background:" + r.hex }), r.k),
        h("span", { class: "t", title: "Florian : " + sf + " / " + sub.length }, h("i", { style: "width:" + sf / sub.length * 100 + "%" })),
        h("span", { class: "t", title: "Amélien : " + sa + " / " + sub.length }, h("i", { style: "width:" + sa / sub.length * 100 + "%" })),
        h("span", { class: "c tab", text: sub.length })));
    });
  }

  function renderTodo() {
    var list = filtered("alerte");
    var c = {};
    list.forEach(function (a) { a.tags.forEach(function (t) { c[t] = (c[t] || 0) + 1; }); });
    if (S.alerte && !c[S.alerte]) c[S.alerte] = 0;
    var box = clear($("todo"));
    var keys = Object.keys(c).sort(function (x, y) { return TAGS[x].o - TAGS[y].o; });
    if (!keys.length) {
      box.appendChild(h("div", { class: "td" }, icon("good"), h("div", {}, h("div", { class: "lb", text: "Rien à signaler" }), h("div", { class: "ds", text: "Aucune alerte dans cette sélection." })), h("span")));
      return;
    }
    keys.forEach(function (t) {
      var m = TAGS[t];
      box.appendChild(h("button", {
        class: "td" + (S.alerte === t ? " on" : ""), type: "button", "aria-pressed": S.alerte === t ? "true" : "false",
        onclick: function () { setF("alerte", S.alerte === t ? "" : t); }
      }, icon(m.st), h("div", {}, h("div", { class: "lb", text: m.lab }), h("div", { class: "ds", text: m.ds })), h("span", { class: "nb tab", text: c[t] })));
    });
  }

  function quarters() {
    var ks = ALL.filter(function (a) { return a.trim; }).map(function (a) { return a.trim; }).sort();
    if (!ks.length) return [];
    var y0 = +ks[0].slice(0, 4), q0 = +ks[0].slice(-1), y1 = +ks[ks.length - 1].slice(0, 4), q1 = +ks[ks.length - 1].slice(-1);
    var out = [];
    for (var y = y0; y <= y1; y++) for (var q = 1; q <= 4; q++) {
      if ((y === y0 && q < q0) || (y === y1 && q > q1)) continue;
      out.push(y + "-T" + q);
    }
    return out;
  }
  function niceMax(v) {
    if (v <= 5) return 5;
    var steps = [5, 10, 15, 20, 25, 30, 40, 50, 60, 80, 100];
    for (var i = 0; i < steps.length; i++) if (steps[i] >= v) return steps[i];
    return Math.ceil(v / 50) * 50;
  }
  function renderTimeline() {
    var box = clear($("timeline"));
    var qs = quarters();
    var list = filtered("annee").filter(function (a) { return a.trim && !a.manquant; });
    var data = {};
    qs.forEach(function (q) { data[q] = {}; });
    list.forEach(function (a) { if (data[a.trim]) data[a.trim][a.rubK] = (data[a.trim][a.rubK] || 0) + 1; });
    var series = RUBS.concat(list.some(function (a) { return a.rubK === AUTRE.k; }) ? [AUTRE] : []);
    var W = Math.max(320, box.clientWidth || 700), H = 230, padL = 30, padR = 6, padT = 10, padB = 26;
    var pw = W - padL - padR, ph = H - padT - padB;
    var max = 0;
    qs.forEach(function (q) { var t = 0; for (var k in data[q]) t += data[q][k]; if (t > max) max = t; });
    var ymax = niceMax(max || 1), unit = ph / ymax;
    var svg = s("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Articles publiés par trimestre et par rubrique" });
    var ax = s("g", { class: "axis" });
    var step = ymax <= 10 ? 5 : ymax <= 30 ? 10 : 20;
    for (var t = 0; t <= ymax; t += step) {
      var y = padT + ph - t * unit;
      ax.appendChild(s("line", { x1: padL, x2: W - padR, y1: y, y2: y, class: t === 0 ? "bl" : "gl" }));
      var tx = s("text", { x: padL - 8, y: y + 4, "text-anchor": "end", class: "tab" }); tx.textContent = t; ax.appendChild(tx);
    }
    svg.appendChild(ax);
    var band = pw / qs.length, bw = Math.max(3, Math.min(24, band * 0.72));
    qs.forEach(function (q, i) {
      var x = padL + i * band + (band - bw) / 2;
      var g = s("g", { class: "col" + (S.annee && q.slice(0, 4) !== S.annee ? " dim" : "") });
      var y0 = padT + ph, tot = 0, segs = [];
      series.forEach(function (r) { var v = data[q][r.k] || 0; if (v) segs.push([r, v]); tot += v; });
      segs.forEach(function (sg, j) {
        var hgt = sg[1] * unit, top = y0 - hgt, last = j === segs.length - 1;
        var hh = Math.max(0.5, hgt - (last ? 0 : 2)), yy = last ? top : top + 2;
        var rr = last ? Math.min(4, hh, bw / 2) : 0;
        var d = "M" + x + "," + (yy + hh) + "V" + (yy + rr) + (rr ? "Q" + x + "," + yy + " " + (x + rr) + "," + yy : "") +
          "H" + (x + bw - rr) + (rr ? "Q" + (x + bw) + "," + yy + " " + (x + bw) + "," + (yy + rr) : "") + "V" + (yy + hh) + "Z";
        g.appendChild(s("path", { d: d, fill: sg[0].hex, class: "seg" }));
        y0 = top;
      });
      if (q.slice(-1) === "1" || i === 0) {
        var lx = s("text", { x: padL + i * band + (q.slice(-1) === "1" ? band * 2 : band / 2), y: H - 6, "text-anchor": "middle" });
        lx.textContent = q.slice(0, 4);
        if (q.slice(-1) === "1" || qs.length < 30) ax.appendChild(lx);
      }
      var hit = s("rect", { x: padL + i * band, y: padT, width: band, height: ph, class: "hit", tabindex: "0", role: "button",
        "aria-label": "T" + q.slice(-1) + " " + q.slice(0, 4) + " : " + tot + " article" + (tot > 1 ? "s" : "") });
      function tipAt(ev) {
        var rows = segs.slice().reverse().map(function (sg) { return { c: sg[0].hex, v: sg[1], l: sg[0].k }; });
        rows.push({ v: tot, l: "au total" });
        var bx = ev && ev.clientX != null ? [ev.clientX, ev.clientY] : (function () { var b = hit.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 3]; })();
        showTip(bx[0], bx[1], "T" + q.slice(-1) + " " + q.slice(0, 4), tot ? rows : [{ v: 0, l: "article" }]);
        g.classList.add("hov");
      }
      hit.addEventListener("pointermove", tipAt);
      hit.addEventListener("focus", function () { tipAt(null); });
      hit.addEventListener("pointerleave", function () { hideTip(); g.classList.remove("hov"); });
      hit.addEventListener("blur", function () { hideTip(); g.classList.remove("hov"); });
      function pick() { hideTip(); setF("annee", S.annee === q.slice(0, 4) ? "" : q.slice(0, 4)); }
      hit.addEventListener("click", pick);
      hit.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
      svg.appendChild(g);
      svg.appendChild(hit);
    });
    svg.insertBefore(ax, svg.firstChild);
    box.appendChild(svg);
    var lg = clear($("tlLegend"));
    series.forEach(function (r) { lg.appendChild(h("span", {}, h("span", { class: "sw", style: "background:" + r.hex }), r.k)); });
    // les chiffres, par année
    var years = {};
    list.forEach(function (a) { years[a.annee] = years[a.annee] || {}; years[a.annee][a.rubK] = (years[a.annee][a.rubK] || 0) + 1; });
    var tb = h("table", { class: "mini tab" });
    tb.appendChild(h("tr", {}, h("th", { text: "Année" }), series.map(function (r) { return h("th", { text: r.k }); }), h("th", { text: "Total" })));
    Object.keys(years).sort().forEach(function (y) {
      var tot = 0;
      tb.appendChild(h("tr", {}, h("td", { text: y }), series.map(function (r) { var v = years[y][r.k] || 0; tot += v; return h("td", { text: v || "·" }); }), h("td", { text: tot })));
    });
    clear($("tlTable")).appendChild(tb);
  }

  function renderRubriques() {
    var list = filtered("rubs").filter(function (a) { return !a.manquant; });
    var c = {}, mots = {}, both = {};
    list.forEach(function (a) { c[a.rubK] = (c[a.rubK] || 0) + 1; mots[a.rubK] = (mots[a.rubK] || 0) + (a.mots || 0); if (a.relF && a.relA) both[a.rubK] = (both[a.rubK] || 0) + 1; });
    var series = RUBS.concat(c[AUTRE.k] ? [AUTRE] : []).filter(function (r) { return c[r.k]; });
    var tot = list.length;
    var bar = clear($("segbar"));
    var wpx = bar.clientWidth || 360;
    series.forEach(function (r) {
      var share = c[r.k] / tot, label = Math.round(share * 100) + " %";
      var fits = share * wpx > label.length * 7.5 + 16;
      var b = h("button", {
        type: "button", class: S.rubs.length && S.rubs.indexOf(r.k) < 0 ? "off" : "",
        style: "flex:" + c[r.k] + " 1 0;background:" + r.hex,
        "aria-label": r.k + " : " + c[r.k] + " articles, " + label, "aria-pressed": S.rubs.indexOf(r.k) >= 0 ? "true" : "false",
        onclick: function () { hideTip(); toggleRub(r.k); }
      }, fits ? label : "");
      function tp(ev) { var bb = b.getBoundingClientRect(); showTip(ev && ev.clientX != null ? ev.clientX : bb.left + bb.width / 2, bb.top, r.k, [{ c: r.hex, v: c[r.k], l: "articles · " + label }, { v: nfc.format(mots[r.k]), l: "mots" }]); }
      b.addEventListener("pointermove", tp); b.addEventListener("focus", function () { tp(null); });
      b.addEventListener("pointerleave", hideTip); b.addEventListener("blur", hideTip);
      bar.appendChild(b);
    });
    var lg = clear($("segLegend"));
    series.forEach(function (r) { lg.appendChild(h("span", {}, h("span", { class: "sw", style: "background:" + r.hex }), r.k + " ", h("b", { class: "tab", text: c[r.k] }))); });
    var tb = h("table", { class: "mini tab" });
    tb.appendChild(h("tr", {}, h("th", { text: "Rubrique" }), h("th", { text: "Articles" }), h("th", { text: "Mots / art." }), h("th", { text: "Relus à deux" })));
    series.forEach(function (r) {
      tb.appendChild(h("tr", {}, h("td", {}, h("span", { class: "sw", style: "background:" + r.hex + ";margin-right:7px" }), r.k),
        h("td", { text: c[r.k] }), h("td", { text: nf.format(Math.round(mots[r.k] / c[r.k])) }), h("td", { text: (both[r.k] || 0) })));
    });
    clear($("rubWords")).appendChild(tb);
  }

  function renderAuthors() {
    var list = filtered("auteur").filter(function (a) { return !a.manquant; });
    var c = {}, mots = {};
    list.forEach(function (a) { var k = a.auteur || "(non signé)"; c[k] = (c[k] || 0) + 1; mots[k] = (mots[k] || 0) + (a.mots || 0); });
    var keys = Object.keys(c).sort(function (x, y) { return c[y] - c[x] || x.localeCompare(y, "fr"); });
    var TOP = 12, top = keys.slice(0, TOP);
    if (S.auteur && top.indexOf(S.auteur) < 0 && c[S.auteur]) top.push(S.auteur);
    var rest = keys.filter(function (k) { return top.indexOf(k) < 0; });
    var max = Math.max.apply(null, top.map(function (k) { return c[k]; }).concat([1]));
    var box = clear($("authors"));
    function row(name, v, clickable) {
      var w = v / max * 100;
      var el = h(clickable ? "button" : "div", {
        class: "hb" + (S.auteur === name ? " on" : ""), type: clickable ? "button" : null,
        title: clickable ? name + " : " + v + " article" + (v > 1 ? "s" : "") + ", " + nf.format(mots[name] || 0) + " mots" : null,
        onclick: clickable ? function () { setF("auteur", S.auteur === name ? "" : name); } : null
      }, h("span", { class: "nm", text: name }),
        h("span", { class: "bw" }, h("span", { class: "bar", style: "width:calc((100% - 34px) * " + (w / 100) + ")" }), h("span", { class: "vl tab", text: v })));
      box.appendChild(el);
    }
    top.forEach(function (k) { row(k, c[k], true); });
    if (rest.length) {
      var nr = rest.reduce(function (t, k) { return t + c[k]; }, 0);
      box.appendChild(h("p", { class: "restline", text: "+ " + rest.length + " autres plumes, " + nr + " article" + (nr > 1 ? "s" : "") + " à elles toutes (détail dans « Voir tous les chiffres »)." }));
    }
    var tb = h("table", { class: "mini tab" });
    tb.appendChild(h("tr", {}, h("th", { text: "Plume" }), h("th", { text: "Articles" }), h("th", { text: "Mots" })));
    keys.forEach(function (k) { tb.appendChild(h("tr", {}, h("td", { text: k }), h("td", { text: c[k] }), h("td", { text: nf.format(mots[k]) }))); });
    clear($("auTable")).appendChild(tb);
  }

  function renderNames() {
    var list = filtered("nom");
    var c = {};
    list.forEach(function (a) { (a.noms || []).forEach(function (n) { c[n] = (c[n] || 0) + 1; }); });
    var keys = Object.keys(c).filter(function (k) { return c[k] > 1 || k === S.nom; })
      .sort(function (x, y) { return c[y] - c[x] || x.localeCompare(y, "fr"); }).slice(0, 40);
    if (S.nom && keys.indexOf(S.nom) < 0) keys.unshift(S.nom);
    var box = clear($("names"));
    if (!keys.length) { box.appendChild(h("p", { class: "hint", text: "Pas de nom qui revient dans cette sélection." })); return; }
    keys.forEach(function (k) {
      box.appendChild(h("button", {
        class: "name" + (S.nom === k ? " on" : ""), type: "button", "aria-pressed": S.nom === k ? "true" : "false",
        onclick: function () { setF("nom", S.nom === k ? "" : k); }
      }, k, h("b", { class: "tab", text: c[k] || 0 })));
    });
  }

  function sortList(list) {
    var k = S.sort, d = S.dir;
    return list.slice().sort(function (x, y) {
      var a, b;
      if (k === "mots") { a = x.mots || 0; b = y.mots || 0; }
      else if (k === "relu") { a = (x.relF ? 1 : 0) + (x.relA ? 1 : 0); b = (y.relF ? 1 : 0) + (y.relA ? 1 : 0); }
      else if (k === "alertes") { a = x.tags.length ? TAGS[x.tags[0]].o : 99; b = y.tags.length ? TAGS[y.tags[0]].o : 99; }
      else if (k === "date") { a = x.date || "9999"; b = y.date || "9999"; }
      else { a = fold(x[k === "rub" ? "rubK" : k]); b = fold(y[k === "rub" ? "rubK" : k]); }
      return (a < b ? -1 : a > b ? 1 : fold(x.titre) < fold(y.titre) ? -1 : 1) * d;
    });
  }
  function relPill(on, who) {
    return h("span", { class: "rv" + (on ? " ok" : ""), title: (on ? "Relu par " : "Pas encore relu par ") + who },
      on ? svgFrom('<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.3l2.2 2.2 4.8-5"/></svg>') : null, who[0]);
  }
  function detailRow(a) {
    var r = rubOf(a.rub);
    var left = h("div", {},
      a.extrait ? h("p", { class: "ex", text: "« " + (a.extrait.length >= 318 ? a.extrait.slice(0, a.extrait.lastIndexOf(" ")).replace(/[,;:.\s]+$/, "") + "… »" : a.extrait.trim() + " »") }) : h("p", { class: "ex", text: a.manquant ? "Cet article n’a jamais été archivé par la Wayback Machine." : "Pas d’extrait." }),
      a.notes ? h("div", {}, h("div", { class: "dl", text: "Notes du Sheet" }), h("p", { class: "facts", text: a.notes })) : null,
      a.tags.length ? h("div", {}, h("div", { class: "dl", text: "Alertes" }), a.tags.map(function (t) { return h("div", { class: "alertline" }, icon(TAGS[t].st, 18), TAGS[t].one); })) : null,
      a.noms && a.noms.length ? h("div", {}, h("div", { class: "dl", text: "Noms cités en gras" }),
        h("div", { class: "names" }, a.noms.slice(0, 24).map(function (n) {
          return h("button", { class: "name" + (S.nom === n ? " on" : ""), type: "button", onclick: function (e) { e.stopPropagation(); setF("nom", n); }, text: n });
        }))) : null);
    var drive = "https://drive.google.com/drive/search?q=" + encodeURIComponent('title:"' + a.titre.replace(/"/g, "") + '"');
    var right = h("div", { class: "links" },
      h("div", { class: "facts" },
        h("div", {}, h("b", { text: a.auteur || "Plume inconnue" }), a.date ? " · " + moisAn(a.date) : ""),
        h("div", {}, h("span", { class: "sw", style: "background:" + r.hex + ";margin-right:6px" }), a.rub || "—", a.mots ? " · " + nf.format(a.mots) + " mots" : ""),
        (a.cit || a.img || a.vid) ? h("div", { text: [a.cit ? a.cit + " citation" + (a.cit > 1 ? "s" : "") : "", a.img ? a.img + " image" + (a.img > 1 ? "s" : "") : "", a.vid ? a.vid + " vidéo" + (a.vid > 1 ? "s" : "") : ""].filter(Boolean).join(" · ") }) : null,
        HAS_LIVRE ? h("div", { text: "Livre : " + ({ oui: "oui", peut: "peut-être", non: "non" }[a.livre] || "pas encore décidé") }) : null),
      a.gdoc ? h("a", { class: "lk", href: a.gdoc, target: "_blank", rel: "noopener" }, svgFrom(ICON_LINK), "Ouvrir le Google Doc")
        : (!a.manquant ? h("a", { class: "lk", href: drive, target: "_blank", rel: "noopener", title: "Cherche le document dans ton Google Drive" }, svgFrom(ICON_LINK), "Trouver le doc dans Drive") : null),
      a.src ? h("a", { class: "lk", href: a.src, target: "_blank", rel: "noopener" }, svgFrom(ICON_LINK), a.manquant ? "Tenter la Wayback Machine" : "Lire l’archive en ligne") : null,
      a.doc ? h("button", { class: "lk", type: "button", onclick: function (e) {
        e.stopPropagation();
        var b = e.currentTarget;
        (navigator.clipboard ? navigator.clipboard.writeText(a.doc) : Promise.reject()).then(function () { b.lastChild.textContent = "Nom copié"; }, function () { b.lastChild.textContent = a.doc; });
      } }, svgFrom('<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5V3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/></svg>'), h("span", { text: "Copier le nom du doc" })) : null);
    return h("tr", { class: "det" }, h("td", { colspan: 7 }, h("div", { class: "detail" }, left, right)));
  }
  function renderTable(list) {
    var tb = clear($("tbody"));
    var rows = sortList(list);
    $("empty").hidden = rows.length > 0;
    document.querySelectorAll("#tbl th").forEach(function (th) {
      if (th.dataset.k === S.sort) th.setAttribute("aria-sort", S.dir > 0 ? "ascending" : "descending"); else th.removeAttribute("aria-sort");
      var b = th.querySelector("button");
      b.textContent = b.textContent.replace(/ [↑↓]$/, "") + (th.dataset.k === S.sort ? (S.dir > 0 ? " ↑" : " ↓") : "");
    });
    var frag = document.createDocumentFragment();
    rows.forEach(function (a) {
      var r = rubOf(a.rub), open = S.open === a.id;
      var topSt = a.tags.length ? TAGS[a.tags[0]].st : "";
      var prClass = (topSt === "critical" || topSt === "serious" || topSt === "warn") ? " pr-" + topSt : "";
      var titleCell = h("div", { class: "ti" + (a.manquant ? " miss" : "") });
      if (topSt === "critical" || topSt === "serious") {
        var mic = icon(topSt, 15); mic.classList.add("mini-ic"); mic.setAttribute("title", TAGS[a.tags[0]].one);
        titleCell.appendChild(mic);
      }
      titleCell.appendChild(document.createTextNode(a.titre));
      var tr = h("tr", { class: "a" + prClass + (open ? " open" : ""), tabindex: "0", "aria-expanded": open ? "true" : "false" },
        h("td", { class: "dt tab", text: dateFr(a.date) }),
        h("td", {}, titleCell),
        h("td", { class: "hm" }, h("span", { class: "rb" }, h("span", { class: "sw", style: "background:" + r.hex }), a.rub || "—")),
        h("td", { class: "au hm", text: a.auteur || "—" }),
        h("td", { class: "mo tab hm", text: a.mots ? nf.format(a.mots) : "—" }),
        h("td", {}, a.manquant ? h("span", { class: "miss", text: "—" }) : h("span", { class: "rl" }, relPill(a.relF, "Florian"), relPill(a.relA, "Amélien"))),
        h("td", { class: "hm" }, h("span", { class: "al" }, a.tags.map(function (t) { var ic = icon(TAGS[t].st, 18); var w = h("span", { title: TAGS[t].one }); w.appendChild(ic); return w; }))));
      function toggle() { S.open = S.open === a.id ? "" : a.id; renderTable(filtered()); }
      tr.addEventListener("click", toggle);
      tr.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
      frag.appendChild(tr);
      if (open) frag.appendChild(detailRow(a));
    });
    tb.appendChild(frag);
  }

  function render() {
    var list = filtered();
    renderFilters();
    var arts = list.filter(function (a) { return !a.manquant; }).length;
    var total = ALL.filter(function (a) { return !a.manquant; }).length;
    var cnt = clear($("count"));
    cnt.appendChild(h("b", { class: "tab", text: nf.format(arts) }));
    cnt.appendChild(document.createTextNode(arts === total ? " articles" : " sur " + nf.format(total) + " articles"));
    var totalMots = ALL.reduce(function (t, a) { return t + (a.mots || 0); }, 0);
    $("heroSub").textContent = nf.format(total) + " articles et " + nf.format(totalMots) + " mots récupérés après la fermeture du site. Ici, on trie, on relit, on prépare le livre.";
    renderKpis(list);
    renderRelecture(list);
    renderTodo();
    renderTimeline();
    renderRubriques();
    renderAuthors();
    renderNames();
    renderTable(list);
    $("footData").textContent = cfg.sheetCsv ? "Données : le Google Sheet de suivi, complété par l’instantané du 18/11/2026." : "Données : instantané du 18/11/2026.";
  }

  // ------------------------------------------------------------------ branchements
  var qT;
  $("q").addEventListener("input", function (e) { clearTimeout(qT); var v = e.target.value; qT = setTimeout(function () { setF("q", v.trim()); }, 160); });
  $("fAuteur").addEventListener("change", function (e) { setF("auteur", e.target.value); });
  $("fAnnee").addEventListener("change", function (e) { setF("annee", e.target.value); });
  $("fStatut").addEventListener("change", function (e) { setF("statut", e.target.value); });
  document.querySelectorAll("[data-reset]").forEach(function (b) { b.addEventListener("click", resetAll); });
  document.querySelectorAll("#tbl th button").forEach(function (b) {
    b.addEventListener("click", function () {
      var k = b.parentNode.dataset.k;
      if (S.sort === k) S.dir = -S.dir; else { S.sort = k; S.dir = (k === "mots" || k === "relu" || k === "alertes") ? -1 : 1; if (k === "alertes") S.dir = 1; }
      writeHash(); renderTable(filtered());
    });
  });
  var rT;
  window.addEventListener("resize", function () { clearTimeout(rT); rT = setTimeout(function () { renderTimeline(); renderRubriques(); }, 120); });
  window.addEventListener("scroll", hideTip, { passive: true });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && cfg.sheetCsv && Date.now() - lastLoad > 60000) loadSheet().catch(function () {});
  });
  $("refresh").addEventListener("click", function () { loadSheet().catch(function () {}); });

  var dlg = $("dlg");
  $("settings").addEventListener("click", function () {
    $("csvUrl").value = cfg.sheetCsv; $("editUrl").value = cfg.sheetEdit; $("dlgErr").hidden = true;
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
  });
  $("dlgCancel").addEventListener("click", function () { dlg.close(); });
  $("dlgClear").addEventListener("click", function () {
    try { localStorage.removeItem("cul7ure.sheetCsv"); localStorage.removeItem("cul7ure.sheetEdit"); } catch (e) {}
    cfg = Object.assign({ sheetCsv: "", sheetEdit: "" }, window.CUL7URE_CONFIG || {});
    ALL = SNAP.map(function (a) { return prepare(Object.assign({}, a)); }); HAS_LIVRE = false;
    dlg.close(); setSync("", "Instantané du 18/11/2026"); render();
    if (cfg.sheetCsv) loadSheet().catch(function () {});
  });
  $("dlgSave").addEventListener("click", function () {
    var u = $("csvUrl").value.trim(), e = $("editUrl").value.trim();
    if (u && !/^https:\/\/docs\.google\.com\/spreadsheets\//.test(u)) {
      $("dlgErr").textContent = "Il faut l’adresse d’un Google Sheet (elle commence par https://docs.google.com/spreadsheets/).";
      $("dlgErr").hidden = false; return;
    }
    if (u && /\/edit/.test(u) && !/output=csv|format=csv/.test(u)) {
      $("dlgErr").textContent = "Ça, c’est l’adresse normale du Sheet. Il faut celle de « Publier sur le Web », au format .csv (elle se termine par output=csv).";
      $("dlgErr").hidden = false; return;
    }
    cfg.sheetCsv = u; cfg.sheetEdit = e;
    try { localStorage.setItem("cul7ure.sheetCsv", u); localStorage.setItem("cul7ure.sheetEdit", e); } catch (er) {}
    loadSheet().then(function () { dlg.close(); }, function (er) {
      $("dlgErr").textContent = "Impossible de lire ce Sheet : " + er.message;
      $("dlgErr").hidden = false;
    });
  });

  readHash();
  if (S.q) $("q").value = S.q;
  setSync("", "Instantané du 18/11/2026");
  render();
  loadSheet().catch(function () {});
})();
