/* Cul7ure · tableau de bord des archives
   Données : data/articles.js (instantané + répartition de la relecture), puis le Google Sheet de suivi
   via le script Google (outils/script-google.gs) qui sait aussi écrire : le Sheet a le dernier mot. */
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
  var QUI = ["Florian", "Amélien"];
  var MOTS_PAR_PAGE = 320, MOTS_PAR_MIN = 250, PAGE = 30;
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
  var ST_LAB = { "": "À relire", cours: "En cours", relu: "Relu" };
  var LV_LAB = { "": "pas voté", oui: "oui", peut: "peut-être", non: "non" };
  var LIVRE = {
    dedans: { lab: "Retenus", one: "retenu", cls: "c-in", r: 0 },
    discuter: { lab: "À discuter", one: "à discuter", cls: "c-disc", r: 1 },
    attente: { lab: "Il manque un vote", one: "il manque un vote", cls: "c-wait", r: 2 },
    ecarte: { lab: "Refusés", one: "refusé", cls: "c-out", r: 3 }
  };

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
  function plur(n, one, many) { return nf.format(n) + " " + (n > 1 ? (many || one + "s") : one); }
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
  function pad(n) { return ("0" + n).slice(-2); }
  function nowStr() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function hhmm() { var d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function parseStamp(t) {
    var m = String(t || "").match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : null;
  }
  function relTime(t) {
    var d = parseStamp(t);
    if (!d) return "";
    var min = Math.round((Date.now() - d.getTime()) / 60000);
    if (min < 2) return "à l’instant";
    if (min < 60) return "il y a " + min + " min";
    if (min < 60 * 20) return "il y a " + Math.round(min / 60) + " h";
    var days = Math.round(min / 1440);
    if (days <= 1) return "hier";
    if (days < 7) return "il y a " + days + " jours";
    return "le " + pad(d.getDate()) + "/" + pad(d.getMonth() + 1);
  }
  function minLecture(a) { return Math.max(1, Math.round((a.mots || 0) / MOTS_PAR_MIN)); }
  function pages(mots) { return Math.max(1, Math.round((mots || 0) / MOTS_PAR_PAGE)); }

  function icon(st, size) {
    size = size || 20;
    var col = { critical: "#d03b3b", serious: "#ec835a", warn: "#fab219", info: "#A8ABDC", good: "#0ca30c", cours: "#C6B6FF", todo: "#6C6FA6" }[st];
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
    } else if (st === "cours") {
      svg.appendChild(s("circle", { cx: 10, cy: 10, r: 7.4, fill: "none", stroke: col, "stroke-width": "1.8" }));
      svg.appendChild(s("path", { d: "M10 2.6a7.4 7.4 0 0 1 0 14.8z", fill: col }));
    } else if (st === "todo") {
      svg.appendChild(s("circle", { cx: 10, cy: 10, r: 7.4, fill: "none", stroke: col, "stroke-width": "1.8", "stroke-dasharray": "3 2.4" }));
    } else {
      svg.appendChild(s("circle", { cx: 10, cy: 10, r: 7.6, fill: "none", stroke: col, "stroke-width": "1.6" }));
      svg.appendChild(s("path", { d: "M10 9v5M10 6.1v.1", stroke: col, "stroke-width": "1.9", "stroke-linecap": "round" }));
    }
    return svg;
  }
  function svgFrom(str) { var t = document.createElement("template"); t.innerHTML = str; return t.content.firstChild; }
  var I_LINK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M9 3h4v4M13 3L7.5 8.5M11 9.5V13H3V5h3.5"/></svg>';
  var I_CHECK = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.3l2.2 2.2 4.8-5"/></svg>';
  function iLink() { return svgFrom(I_LINK); }
  function iCheck() { return svgFrom(I_CHECK); }

  // ------------------------------------------------------------------ données
  function tagOf(raw, a) {
    var l = fold(raw);
    if (l.indexOf("introuvable") >= 0) return "introuvable";
    if (l.indexOf("spam") >= 0) return "spam";
    if (l.indexOf("tres court") >= 0) return a.vid > 0 ? "video" : "court";
    if (l.indexOf("auteur") >= 0 || l.indexOf("plume") >= 0) return "auteur";
    if (l.indexOf("date") >= 0) return "date";
    if (l.indexOf("ancienne") >= 0 || l.indexOf("2020") >= 0) return "v2020";
    if (l.indexOf("guillemet") >= 0) return "guillemets";
    return "autre";
  }
  function classify(a) {
    var tags = [];
    (a.alertes || []).forEach(function (raw) { var t = tagOf(raw, a); if (tags.indexOf(t) < 0) tags.push(t); });
    if (!a.manquant && !a.auteur && tags.indexOf("auteur") < 0) tags.push("auteur");
    tags.sort(function (x, y) { return TAGS[x].o - TAGS[y].o; });
    return tags;
  }
  function consensus(a) {
    if (a.manquant) return "";
    if (a.livreF === "oui" && a.livreA === "oui") return "dedans";
    if (a.livreF === "non" && a.livreA === "non") return "ecarte";
    if (a.livreF && a.livreA) return "discuter";
    return "attente";
  }
  function prepare(a) {
    a.rel = a.rel || ""; a.statut = a.statut || ""; a.reluLe = a.reluLe || "";
    a.livreF = a.livreF || ""; a.livreA = a.livreA || ""; a.notes = a.notes || "";
    a.alertes = a.alertes || [];
    a.annee = a.date ? a.date.slice(0, 4) : "";
    a.trim = a.date ? a.annee + "-T" + (Math.floor((+a.date.slice(5, 7) - 1) / 3) + 1) : "";
    a.rubK = rubOf(a.rub).k;
    a.tags = classify(a);
    a.livre = consensus(a);
    a._q = fold([a.titre, a.auteur, a.rub, (a.noms || []).join(" "), a.extrait, a.notes].join(" "));
    return a;
  }
  var SNAP = (window.CUL7URE_DATA && window.CUL7URE_DATA.articles) || [];
  var SNAP_BY = {};
  SNAP.forEach(function (a) { SNAP_BY[a.id] = a; });
  function fromSnap() { return SNAP.map(function (a) { return prepare(Object.assign({}, a)); }); }
  var ALL = fromSnap();
  function byId(id) { for (var i = 0; i < ALL.length; i++) if (ALL[i].id === id) return ALL[i]; return null; }

  function stIn(v) { v = fold(v); return v.indexOf("relu") === 0 ? "relu" : v.indexOf("cours") >= 0 ? "cours" : ""; }
  function lvIn(v) { v = fold(v).trim(); return v === "oui" ? "oui" : v.indexOf("peut") === 0 ? "peut" : v === "non" ? "non" : ""; }
  function applyRow(a, r) {
    a.id = r.id;
    if (r.date) {
      var m = String(r.date).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      a.date = /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : m ? m[3] + "-" + pad(m[2]) + "-" + pad(m[1]) : a.date;
    }
    if (r.rub) a.rub = r.rub;
    if (r.titre) a.titre = r.titre;
    a.auteur = r.auteur || "";
    if (r.mots) a.mots = +r.mots || a.mots;
    a.rel = QUI.indexOf(r.rel) >= 0 ? r.rel : "";
    a.statut = stIn(r.statut); a.reluLe = r.reluLe || "";
    a.livreF = lvIn(r.livreF); a.livreA = lvIn(r.livreA);
    a.notes = r.notes || "";
    a.alertes = String(r.alertes || "").split(/\s*;\s*/).filter(Boolean);
    a.gdoc = /^https?:\/\//.test(r.gdoc || "") ? r.gdoc : "";
    a.docModif = r.docModif || "";
    if (r.src) a.src = r.src;
    if (r.doc) a.doc = r.doc;
    a.maj = r.maj || ""; a.majPar = r.majPar || "";
    if (a.manquant == null) a.manquant = a.alertes.some(function (x) { return fold(x).indexOf("introuvable") >= 0; });
    return a;
  }
  function mergeRemote(rows) {
    var seen = {}, out = [];
    rows.forEach(function (r) {
      if (!r.id || seen[r.id]) return;
      seen[r.id] = true;
      out.push(prepare(applyRow(Object.assign({}, SNAP_BY[r.id] || {}), r)));
    });
    SNAP.forEach(function (a) { if (!seen[a.id]) out.push(prepare(Object.assign({}, a))); });
    out.sort(function (x, y) { return (x.date || "9999") < (y.date || "9999") ? -1 : (x.date || "9999") > (y.date || "9999") ? 1 : 0; });
    return out;
  }
  function toSheet(ch) {
    var o = {};
    Object.keys(ch).forEach(function (k) {
      var v = ch[k];
      if (k === "statut") v = { "": "", cours: "en cours", relu: "relu" }[v] || "";
      else if (k === "livreF" || k === "livreA") v = { "": "", oui: "oui", peut: "peut-être", non: "non" }[v] || "";
      else if (k === "alertes") v = (v || []).join(" ; ");
      o[k] = v;
    });
    return o;
  }

  // ------------------------------------------------------------------ réglages locaux
  function ls(k, v) {
    try {
      if (v === undefined) return localStorage.getItem("cul7ure." + k);
      if (v === null) localStorage.removeItem("cul7ure." + k); else localStorage.setItem("cul7ure." + k, v);
    } catch (e) { /* stockage indisponible */ }
    return null;
  }
  var CONF = window.CUL7URE_CONFIG || {};
  var cfg = { script: ls("script") || CONF.script || "", code: ls("code") || "", qui: ls("qui") || "" };
  if (QUI.indexOf(cfg.qui) < 0) cfg.qui = "";
  var REMOTE = {};
  var lastLoad = 0;

  // lien d'invitation : #cle=…&script=…&qui=…
  function invitation() {
    var p = new URLSearchParams(location.hash.slice(1));
    if (!p.get("cle")) return false;
    cfg.code = p.get("cle").trim().toLowerCase(); ls("code", cfg.code);
    if (p.get("script")) { cfg.script = p.get("script"); ls("script", cfg.script); }
    if (QUI.indexOf(p.get("qui")) >= 0) { cfg.qui = p.get("qui"); ls("qui", cfg.qui); }
    history.replaceState(null, "", location.pathname + location.search);
    setTimeout(function () { toast(cfg.qui ? "C’est branché. Salut " + cfg.qui + " !" : "C’est branché."); }, 600);
    return true;
  }
  invitation();

  function other(q) { return q === "Florian" ? "Amélien" : "Florian"; }
  function myKey() { return cfg.qui === "Florian" ? "livreF" : cfg.qui === "Amélien" ? "livreA" : ""; }

  // ------------------------------------------------------------------ le script Google
  var API = {
    on: function () { return !!(cfg.script && cfg.code); },
    check: function (r) {
      return r.text().then(function (t) {
        var d;
        try { d = JSON.parse(t); } catch (e) { throw new Error("Le script ne renvoie pas les données. Vérifie que « Qui a accès » est sur « Tout le monde ».") ; }
        if (!d.ok) {
          var er = new Error(d.erreur === "CODE_FAUX" ? "Code d’accès refusé." : d.erreur || "Erreur du script");
          er.code = d.erreur === "CODE_FAUX";
          throw er;
        }
        return d;
      });
    },
    net: function (e) {
      if (e && e.name === "TypeError") throw new Error("Impossible de joindre le script. Vérifie l’adresse et ta connexion.");
      throw e;
    },
    get: function (action) {
      var q = new URLSearchParams({ code: cfg.code, _: Date.now() });
      if (action) q.set("action", action);
      return fetch(cfg.script + "?" + q.toString(), { cache: "no-store" }).then(API.check, API.net);
    },
    post: function (modifs, keep) {
      return fetch(cfg.script, { method: "POST", body: JSON.stringify({ code: cfg.code, qui: cfg.qui, modifs: modifs }), keepalive: !!keep })
        .then(API.check, API.net);
    }
  };

  function setSync(state, txt) {
    $("syncDot").className = "dot" + (state ? " " + state : "");
    $("syncTxt").textContent = txt;
    $("refresh").hidden = !API.on();
    var w = $("whoBtn");
    w.textContent = cfg.qui || "Qui es-tu ?";
    w.classList.toggle("on", !!cfg.qui);
    w.title = cfg.qui ? "Changer de personne" : "";
    $("settings").querySelector("span").textContent = API.on() ? "Réglages" : "Brancher le Sheet";
  }

  var W = { pending: {}, before: {}, timer: 0, busy: false };
  function hasPending() { return W.busy || Object.keys(W.pending).length > 0; }

  function load(action) {
    if (!API.on()) { setSync("", "Instantané du 18/11/2026"); return Promise.resolve(null); }
    if (hasPending() && !action) { setTimeout(function () { load(); }, 1500); return Promise.resolve(null); }
    setSync("busy", action === "liens" ? "Recherche des Docs…" : "Lecture du Sheet…");
    if (!lastLoad) $("grid").classList.add("loading");
    return API.get(action).then(function (d) {
      ALL = mergeRemote(d.articles || []);
      REMOTE = { sheet: d.sheet || "", liensMaj: d.liensMaj || "", liens: d.liens || REMOTE.liens };
      lastLoad = Date.now();
      setSync("on", "Sheet · " + hhmm());
      checkRetour();
      safeRender();
      return d;
    }).catch(function (e) {
      setSync("err", e.code ? "Code d’accès refusé" : "Script injoignable · instantané");
      console.warn("Cul7ure :", e);
      throw e;
    }).finally(function () { $("grid").classList.remove("loading"); });
  }

  // ------------------------------------------------------------------ enregistrer (optimiste, par paquets)
  function needConnect() {
    toast("Pour enregistrer, branche d’abord le site sur le Sheet.", { action: { label: "Brancher", fn: openSettings } });
  }
  function save(a, champs, opt) {
    opt = opt || {};
    if (!API.on()) { needConnect(); return false; }
    if (!cfg.qui) { askWho(function () { save(a, champs, opt); }); return false; }
    var p = W.pending[a.id] || (W.pending[a.id] = {});
    var b = W.before[a.id] || (W.before[a.id] = {});
    Object.keys(champs).forEach(function (k) {
      if (!(k in b)) b[k] = a[k];
      p[k] = champs[k];
      a[k] = champs[k];
    });
    if ("statut" in champs) {
      if (!("reluLe" in b)) b.reluLe = a.reluLe;
      a.reluLe = champs.statut === "relu" ? nowStr() : "";
    }
    a.maj = nowStr(); a.majPar = cfg.qui;
    prepare(a);
    if (!opt.noRender) safeRender();
    if (opt.msg) toast(opt.msg, opt.undo ? { action: { label: "Annuler", fn: opt.undo } } : null);
    clearTimeout(W.timer);
    W.timer = setTimeout(flush, opt.now ? 0 : 650);
    return true;
  }
  function flush(keep) {
    clearTimeout(W.timer);
    if (W.busy) { W.timer = setTimeout(flush, 400); return; }
    var ids = Object.keys(W.pending);
    if (!ids.length) return;
    var sent = W.pending, befores = W.before;
    W.pending = {}; W.before = {}; W.busy = true;
    setSync("busy", "Enregistrement…");
    API.post(ids.map(function (id) { return { id: id, champs: toSheet(sent[id]) }; }), keep).then(function (d) {
      (d.lignes || []).forEach(function (r) {
        var a = byId(r.id);
        if (!a) return;
        applyRow(a, r);
        var p = W.pending[r.id];
        if (p) Object.keys(p).forEach(function (k) { a[k] = p[k]; });
        prepare(a);
      });
      setSync("on", "Enregistré · " + hhmm());
    }).catch(function (e) {
      if (keep) { setSync("err", "À vérifier"); lastLoad = 0; return; } // page en arrière-plan : on relira le Sheet au retour
      Object.keys(befores).forEach(function (id) {
        var a = byId(id);
        if (!a) return;
        Object.keys(befores[id]).forEach(function (k) { if (!(W.pending[id] && k in W.pending[id])) a[k] = befores[id][k]; });
        prepare(a);
      });
      setSync("err", e.code ? "Code d’accès refusé" : "Pas enregistré");
      toast("Pas enregistré : " + e.message, { err: true, ms: 9000, action: { label: "Réessayer", fn: function () {
        Object.keys(sent).forEach(function (id) { var a = byId(id); if (a) save(a, sent[id], { now: true, noRender: true }); });
        safeRender();
      } } });
    }).finally(function () { W.busy = false; safeRender(); });
  }

  // ------------------------------------------------------------------ petits messages
  var toastT;
  function toast(msg, o) {
    o = o || {};
    var t = clear($("toast"));
    t.className = "toast on" + (o.err ? " err" : "");
    t.appendChild(h("span", { text: msg }));
    if (o.action) t.appendChild(h("button", { type: "button", text: o.action.label, onclick: function () { t.classList.remove("on"); o.action.fn(); } }));
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove("on"); }, o.ms || (o.action ? 6000 : 2600));
  }

  // ------------------------------------------------------------------ retour d'un Doc
  function getOuvert() { try { return JSON.parse(ls("ouvert") || "null"); } catch (e) { return null; } }
  function setOuvert(o) { ls("ouvert", o ? JSON.stringify(o) : null); renderRetour(); }
  function checkRetour() {
    var o = getOuvert();
    if (!o) return;
    var a = byId(o.id);
    if (!a || Date.now() - o.t > 12 * 3600 * 1000 || (a.statut === "relu" && !o.fini)) ls("ouvert", null);
  }
  function docHref(a) {
    return a.gdoc || "https://drive.google.com/drive/search?q=" + encodeURIComponent('"' + (a.doc || a.titre).replace(/"/g, "") + '"');
  }
  function docLink(a, cls, label) {
    return h("a", {
      class: cls, href: docHref(a), target: "_blank", rel: "noopener",
      title: a.gdoc ? "Ouvre le Google Doc" : "Cherche le Doc dans ton Google Drive",
      onclick: function (e) { e.stopPropagation(); opened(a); }
    }, iLink(), label || (a.gdoc ? "Ouvrir le Doc" : "Trouver dans Drive"));
  }
  function opened(a) {
    if (!API.on() || !cfg.qui || a.manquant || (a.rel && a.rel !== cfg.qui)) return;
    if (a.statut === "") save(a, { statut: "cours" }, { noRender: true });
    setOuvert({ id: a.id, t: Date.now() });
    safeRender();
    flush();
  }
  function myQueue() {
    if (!cfg.qui) return [];
    return ALL.filter(function (a) { return !a.manquant && a.rel === cfg.qui && a.statut !== "relu"; })
      .sort(function (x, y) {
        if ((x.statut === "cours") !== (y.statut === "cours")) return x.statut === "cours" ? -1 : 1;
        return (x.date || "9999") < (y.date || "9999") ? -1 : 1;
      });
  }
  function voteSeg(a, compact) {
    var k = myKey();
    return h("div", { class: "seg", role: "group", "aria-label": "Ton vote pour le livre" },
      [["oui", "Oui"], ["peut", "Peut-être"], ["non", "Non"]].map(function (o) {
        var on = a[k] === o[0];
        return h("button", { type: "button", "aria-pressed": on ? "true" : "false", onclick: function (e) {
          e.stopPropagation();
          var prev = a[k];
          var ch = {}; ch[k] = on ? "" : o[0];
          save(a, ch, { msg: on ? "Vote retiré" : "Vote : " + LV_LAB[o[0]], undo: function () { var u = {}; u[k] = prev; save(a, u); } });
        } }, compact ? o[1] : o[1]);
      }));
  }
  function renderRetour() {
    var box = $("retour"), o = getOuvert(), a = o && byId(o.id);
    if (!o || !a || !cfg.qui) { box.hidden = true; return; }
    clear(box);
    box.hidden = false;
    box.appendChild(h("button", { class: "x", type: "button", "aria-label": "Fermer", text: "×", onclick: function () { setOuvert(null); } }));
    var next = myQueue().filter(function (x) { return x.id !== a.id; })[0];
    if (a.statut !== "relu") {
      box.appendChild(h("div", { class: "q" }, "Tu reviens de ", h("b", { text: "« " + a.titre + " »" }), ". C’est relu ?"));
      box.appendChild(h("div", { class: "r" },
        h("button", { class: "btn main sm", type: "button", onclick: function () {
          o.fini = true; ls("ouvert", JSON.stringify(o));
          save(a, { statut: "relu" }, { msg: "Relu ✓", undo: function () { save(a, { statut: "cours" }); } });
          renderRetour();
        } }, iCheck(), "Oui, c’est relu"),
        h("button", { class: "btn ghost sm", type: "button", text: "Pas encore", onclick: function () { setOuvert(null); toast("Il reste en cours dans ta liste."); } }),
        docLink(a, "btn ghost sm", "Rouvrir le Doc")));
    } else {
      box.appendChild(h("div", { class: "q" }, h("b", { text: "« " + a.titre + " »" }), " est relu. ", next ? "La suite ?" : "C’était le dernier de ta liste !"));
      box.appendChild(h("div", { class: "r" },
        next ? h("a", { class: "btn main sm", href: docHref(next), target: "_blank", rel: "noopener", onclick: function () { opened(next); } }, iLink(), "Suivant : " + (next.titre.length > 34 ? next.titre.slice(0, 32) + "…" : next.titre)) : null,
        h("button", { class: "btn ghost sm", type: "button", text: "Fermer", onclick: function () { setOuvert(null); } })));
    }
    if (myKey() && !a[myKey()] && API.on()) {
      box.appendChild(h("div", { class: "r" }, h("span", { class: "lab", text: "Pour le livre :" }), voteSeg(a)));
    }
  }

  // ------------------------------------------------------------------ filtres
  var STATUTS = [["", "Relecture : tout"], ["pasRelu", "Pas encore relus"], ["aRelire", "À relire"], ["cours", "En cours"], ["relu", "Relus"]];
  var S = { q: "", rubs: [], auteur: "", annee: "", rel: "", statut: "", livre: "", alerte: "", nom: "", sort: "date", dir: 1, open: "", shown: PAGE, tocAll: false };
  function readHash() {
    var p = new URLSearchParams(location.hash.slice(1));
    S.q = p.get("q") || "";
    S.rubs = (p.get("r") || "").split(",").filter(Boolean);
    S.auteur = p.get("a") || ""; S.annee = p.get("y") || "";
    S.rel = QUI.indexOf(p.get("rel")) >= 0 ? p.get("rel") : "";
    S.statut = p.get("s") || ""; S.livre = p.get("l") || "";
    S.alerte = p.get("al") || ""; S.nom = p.get("n") || "";
    if (p.get("tri")) { S.sort = p.get("tri").replace(/^-/, ""); S.dir = p.get("tri")[0] === "-" ? -1 : 1; }
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (S.q) p.set("q", S.q);
    if (S.rubs.length) p.set("r", S.rubs.join(","));
    if (S.auteur) p.set("a", S.auteur);
    if (S.annee) p.set("y", S.annee);
    if (S.rel) p.set("rel", S.rel);
    if (S.statut) p.set("s", S.statut);
    if (S.livre) p.set("l", S.livre);
    if (S.alerte) p.set("al", S.alerte);
    if (S.nom) p.set("n", S.nom);
    if (S.sort !== "date" || S.dir !== 1) p.set("tri", (S.dir < 0 ? "-" : "") + S.sort);
    var str = p.toString();
    history.replaceState(null, "", str ? "#" + str : location.pathname + location.search);
  }
  function anyFilter() { return !!(S.q || S.rubs.length || S.auteur || S.annee || S.rel || S.statut || S.livre || S.alerte || S.nom); }
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
    if (except !== "rel" && S.rel && a.rel !== S.rel) return false;
    if (except !== "statut" && S.statut) {
      if (a.manquant) return false;
      if (S.statut === "pasRelu" && a.statut === "relu") return false;
      if (S.statut === "aRelire" && a.statut !== "") return false;
      if (S.statut === "cours" && a.statut !== "cours") return false;
      if (S.statut === "relu" && a.statut !== "relu") return false;
    }
    if (except !== "livre" && S.livre) {
      if (a.manquant) return false;
      if (S.livre === "sansMoi") { if (!myKey() || a[myKey()]) return false; }
      else if (a.livre !== S.livre) return false;
    }
    return true;
  }
  function filtered(except) { return ALL.filter(function (a) { return match(a, except); }); }
  function setF(k, v) { S[k] = v; S.open = ""; S.shown = PAGE; writeHash(); render(); }
  function setMany(o, scrollTo) {
    Object.keys(o).forEach(function (k) { S[k] = o[k]; });
    S.open = ""; S.shown = PAGE;
    if ("q" in o) $("q").value = o.q;
    writeHash(); render();
    if (scrollTo) $(scrollTo).scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function toggleRub(k) {
    var i = S.rubs.indexOf(k);
    if (i >= 0) S.rubs.splice(i, 1); else S.rubs.push(k);
    S.open = ""; S.shown = PAGE; writeHash(); render();
  }
  function resetAll() {
    setMany({ q: "", rubs: [], auteur: "", annee: "", rel: "", statut: "", livre: "", alerte: "", nom: "" });
  }

  // ------------------------------------------------------------------ bulle d'info
  var tip = $("tip");
  function showTip(x, y, title, rows) {
    clear(tip);
    tip.appendChild(h("div", { class: "tt", text: title }));
    rows.forEach(function (r) {
      tip.appendChild(h("div", { class: "tr" }, r.c ? h("i", { style: "background:" + r.c }) : null, h("b", { text: r.v }), h("span", { text: r.l })));
    });
    tip.classList.add("on");
    var w = tip.offsetWidth, hh = tip.offsetHeight;
    tip.style.left = Math.min(window.innerWidth - w - 10, Math.max(10, x + 14)) + "px";
    tip.style.top = (y - hh - 12 < 8 ? y + 16 : y - hh - 12) + "px";
  }
  function hideTip() { tip.classList.remove("on"); }

  // ------------------------------------------------------------------ mon espace : les 3 étapes
  function stepHead(n, done, title, count) {
    return h("div", { class: "sh" },
      h("span", { class: "num" + (done ? " done" : ""), "aria-hidden": "true" }, done ? iCheck() : String(n)),
      h("h3", { text: title }),
      count != null ? h("span", { class: "cnt tab", text: count }) : null);
  }
  function bar(v, tot, label) {
    return h("div", { class: "bar2", role: "progressbar", "aria-label": label, "aria-valuemin": 0, "aria-valuemax": tot, "aria-valuenow": v },
      h("i", { class: "g", style: "width:" + (tot ? v / tot * 100 : 0) + "%" }));
  }
  var PROB_ORDRE = ["video", "auteur", "date", "v2020", "guillemets", "court", "spam", "autre", "introuvable"];
  var PROB_LAB = {
    video: ["interview vidéo à retranscrire", "interviews vidéo à retranscrire"],
    auteur: ["auteur à retrouver", "auteurs à retrouver"],
    date: ["date à retrouver", "dates à retrouver"],
    v2020: ["ancienne version à comparer", "anciennes versions à comparer"],
    guillemets: ["texte aux guillemets à vérifier", "textes aux guillemets à vérifier"],
    court: ["texte très court à compléter", "textes très courts à compléter"],
    spam: ["texte avec du spam", "textes avec du spam"],
    autre: ["remarque à voir", "remarques à voir"],
    introuvable: ["article jamais archivé (piste BnF)", "articles jamais archivés (piste BnF)"]
  };
  function renderMe() {
    var box = clear($("me"));
    if (!cfg.qui) {
      box.appendChild(h("div", { class: "hi" }, h("h2", { text: "Comment ça marche" }), h("span", { text: "Trois étapes, chacun de son côté." })));
      var g = h("div", { class: "how" });
      [["Relire", "Chacun a sa liste : tu relis les textes de l’autre, et une partie des autres plumes. On corrige dans le Google Doc, puis on dit ici que c’est relu."],
        ["Voter pour le livre", "Pour chaque article : oui, peut-être ou non. Un article va dans le livre quand vous dites oui tous les deux."],
        ["Régler les problèmes", "Quelques articles sont incomplets (interviews vidéo, auteur inconnu…). On les règle au fil de l’eau."]]
        .forEach(function (x, i) { g.appendChild(h("div", { class: "step" }, stepHead(i + 1, false, x[0]), h("p", { class: "sp", text: x[1] }))); });
      box.appendChild(g);
      box.appendChild(h("div", { class: "whoRow" }, h("b", { text: "Pour commencer, qui es-tu ?" }),
        QUI.map(function (q) { return h("button", { class: "btn main", type: "button", text: "Je suis " + q, onclick: function () { setQui(q); } }); })));
      return;
    }
    var o = other(cfg.qui);
    box.appendChild(h("div", { class: "hi" },
      h("h2", { text: "Salut " + cfg.qui + ", voilà ce qu’il te reste à faire." }),
      h("span", { text: "Tu relis les textes d’" + o + " et une partie des autres plumes. " + o + " relit les tiens." })));
    if (!API.on()) {
      box.appendChild(h("div", { class: "next", style: "margin:0 0 14px" },
        h("div", {}, h("div", { class: "k", text: "Pas encore branché" }), h("div", { class: "m", style: "font-size:14.5px;color:var(--soft)", text: "Tu vois ta liste, mais rien ne s’enregistre tant que le site n’est pas branché sur le Sheet." })),
        h("button", { class: "btn main", type: "button", text: "Brancher", onclick: openSettings })));
    }
    var steps = h("div", { class: "steps" });

    // 1. relire
    var mine = ALL.filter(function (a) { return !a.manquant && a.rel === cfg.qui; });
    var relu = mine.filter(function (a) { return a.statut === "relu"; }).length;
    var q = myQueue(), first = q[0];
    var s1 = h("section", { class: "step wide", "aria-label": "Étape 1 : relire tes articles" },
      stepHead(1, mine.length && !q.length, "Relire tes articles", nf.format(relu) + " / " + nf.format(mine.length) + " relus"),
      h("p", { class: "sp", text: "Ouvre le Doc, corrige les fautes et vérifie la mise en forme (guillemets « », artistes en gras, titres d’œuvres en italique). Puis reviens ici dire que c’est relu." }),
      bar(relu, mine.length, "Ta relecture"));
    if (first) {
      var ul = h("ul", { class: "queue" });
      q.slice(1, 5).forEach(function (a) {
        ul.appendChild(h("li", {},
          h("div", { class: "qt", title: a.titre }, a.statut === "cours" ? icon("cours", 14) : null, " ", a.titre, h("span", { class: "qm", text: moisAn(a.date) })),
          h("div", { class: "qa" },
            docLink(a, "mini-btn", "Doc"),
            h("button", { class: "mini-btn ok", type: "button", title: "Marquer relu", onclick: function () {
              var prev = a.statut;
              save(a, { statut: "relu" }, { msg: "« " + a.titre + " » relu ✓", undo: function () { save(a, { statut: prev }); } });
            } }, iCheck(), "Relu"))));
      });
      s1.appendChild(h("div", { class: "s1grid" },
        h("div", { class: "next" },
          h("div", {},
            h("div", { class: "k", text: first.statut === "cours" ? "À reprendre" : "Le prochain" }),
            h("div", { class: "t", text: first.titre }),
            h("div", { class: "m", text: [first.rub, moisAn(first.date), first.auteur, "≈ " + minLecture(first) + " min de lecture"].filter(Boolean).join(" · ") })),
          docLink(first, "btn main", first.statut === "cours" ? "Reprendre" : "Ouvrir le Doc")),
        h("div", {}, q.length > 1 ? h("div", { class: "k2", text: "Ensuite" }) : null, ul,
          h("button", { class: "lnk", type: "button", style: "margin-top:8px", text: "Voir toute ma liste (" + q.length + ")", onclick: function () { setMany({ rel: cfg.qui, statut: "pasRelu", livre: "", alerte: "" }, "articles"); } }))));
    } else {
      s1.appendChild(h("p", { class: "sp", text: mine.length ? "Tout est relu. Champagne." : "Aucun article ne t’est attribué." }));
    }
    steps.appendChild(s1);

    // 2. voter
    var k = myKey(), arts = ALL.filter(function (a) { return !a.manquant; });
    var sans = arts.filter(function (a) { return !a[k]; }).length;
    var retenus = arts.filter(function (a) { return a.livre === "dedans"; });
    var disc = arts.filter(function (a) { return a.livre === "discuter"; }).length;
    var pg = retenus.reduce(function (t, a) { return t + pages(a.mots); }, 0);
    var s2 = h("section", { class: "step", "aria-label": "Étape 2 : voter pour le livre" },
      stepHead(2, !sans, "Dire ce que tu veux dans le livre", nf.format(arts.length - sans) + " / " + nf.format(arts.length) + " votés"),
      h("p", { class: "sp", text: "Pour chaque article : oui, peut-être ou non. Pas besoin de relire en entier, le titre et l’extrait suffisent souvent. Un article est retenu quand vous dites oui tous les deux." }),
      bar(arts.length - sans, arts.length, "Tes votes"),
      h("div", { class: "row2" },
        sans ? h("button", { class: "btn main", type: "button", onclick: openTri }, "Voter (" + nf.format(sans) + " restants)") : h("span", { class: "sp", text: "Tous tes votes sont faits." })),
      h("div", { class: "facts2" },
        h("button", { class: "lnk", type: "button", text: "Retenus pour l’instant : " + nf.format(retenus.length) + " (≈ " + nf.format(pg) + " pages)", onclick: function () { $("livreCard").scrollIntoView({ behavior: "smooth", block: "start" }); } }),
        disc ? h("button", { class: "lnk", type: "button", text: "À discuter avec " + o + " : " + nf.format(disc), onclick: function () { setMany({ livre: "discuter", rel: "", statut: "", alerte: "" }, "articles"); } }) : null));
    steps.appendChild(s2);

    // 3. problèmes
    var c = {}, nProb = 0;
    arts.concat(ALL.filter(function (a) { return a.manquant; })).forEach(function (a) {
      if (a.tags.length) nProb++;
      a.tags.forEach(function (t) { c[t] = (c[t] || 0) + 1; });
    });
    var s3 = h("section", { class: "step", "aria-label": "Étape 3 : régler les problèmes" },
      stepHead(3, !nProb, "Régler les problèmes", plur(nProb, "article")),
      h("p", { class: "sp", text: "Des articles incomplets ou à vérifier. Pas de répartition : prends-en un quand tu as un moment, ouvre-le dans la liste et clique « C’est réglé »." }));
    var pl = h("ul", { class: "plist" });
    PROB_ORDRE.filter(function (t) { return c[t]; }).slice(0, 5).forEach(function (t) {
      pl.appendChild(h("li", {}, h("button", { type: "button", onclick: function () { setMany({ alerte: t, rel: "", statut: "", livre: "" }, "articles"); } },
        icon(TAGS[t].st, 18), h("span", {}, h("b", { class: "tab", text: c[t] }), " " + PROB_LAB[t][c[t] > 1 ? 1 : 0]), h("span", { class: "go", text: "Voir" }))));
    });
    if (nProb) s3.appendChild(pl); else s3.appendChild(h("p", { class: "sp", text: "Plus aucun problème. Bravo." }));
    steps.appendChild(s3);
    box.appendChild(steps);
  }

  // ------------------------------------------------------------------ filtres
  function renderFilters() {
    var chips = clear($("rubChips"));
    RUBS.forEach(function (r) {
      chips.appendChild(h("button", { class: "chip", type: "button", "aria-pressed": S.rubs.indexOf(r.k) >= 0 ? "true" : "false", onclick: function () { toggleRub(r.k); } },
        h("span", { class: "sw", style: "background:" + r.hex }), r.k));
    });
    function fill(id, opts, val) {
      var el = clear($(id));
      opts.forEach(function (o) { el.appendChild(h("option", { value: o[0], text: o[1] })); });
      el.value = val; el.classList.toggle("on", !!val);
    }
    fill("fRel", [["", "Relecteur : tous"], ["Florian", "Relecteur : Florian"], ["Amélien", "Relecteur : Amélien"]], S.rel);
    fill("fStatut", STATUTS, S.statut);
    fill("fLivre", [["", "Livre : tout"], ["dedans", "Retenus"], ["discuter", "À discuter"], ["attente", "Il manque un vote"], ["ecarte", "Refusés"]]
      .concat(cfg.qui ? [["sansMoi", "Sans mon vote"]] : []), S.livre);
    var aus = {};
    ALL.forEach(function (a) { if (!a.manquant) { var k = a.auteur || "(non signé)"; aus[k] = (aus[k] || 0) + 1; } });
    fill("fAuteur", [["", "Toutes les plumes"]].concat(Object.keys(aus).sort(function (x, y) { return aus[y] - aus[x] || x.localeCompare(y, "fr"); })
      .map(function (k) { return [k, k + " (" + aus[k] + ")"]; })), S.auteur);
    var ys = {};
    ALL.forEach(function (a) { if (a.annee) ys[a.annee] = 1; });
    fill("fAnnee", [["", "Toutes les années"]].concat(Object.keys(ys).sort().map(function (y) { return [y, y]; })), S.annee);
    var act = clear($("active"));
    function tag(label, onx) {
      act.appendChild(h("span", { class: "tagx" }, label, h("button", { type: "button", "aria-label": "Retirer le filtre " + label, onclick: onx, text: "×" })));
    }
    if (S.nom) tag("Cite " + S.nom, function () { setF("nom", ""); });
    if (S.alerte) tag(TAGS[S.alerte] ? TAGS[S.alerte].lab : S.alerte, function () { setF("alerte", ""); });
    if (anyFilter()) act.appendChild(h("button", { class: "reset", type: "button", onclick: resetAll, text: "Tout réafficher" }));
  }

  // ------------------------------------------------------------------ chiffres clés
  function renderKpis(list) {
    var arts = list.filter(function (a) { return !a.manquant; });
    var manq = list.length - arts.length;
    var mots = arts.reduce(function (t, a) { return t + (a.mots || 0); }, 0);
    var relu = arts.filter(function (a) { return a.statut === "relu"; }).length;
    var parQui = QUI.map(function (q) {
      var m = arts.filter(function (a) { return a.rel === q; });
      return q + " " + m.filter(function (a) { return a.statut === "relu"; }).length + "/" + m.length;
    });
    var dedans = arts.filter(function (a) { return a.livre === "dedans"; });
    var disc = arts.filter(function (a) { return a.livre === "discuter"; }).length;
    var todo = list.filter(function (a) { return a.tags.length; }).length;
    var k = clear($("kpis"));
    function tile(l, v, small, d, ic) {
      k.appendChild(h("div", { class: "kpi" },
        h("div", { class: "l", text: l }), h("div", { class: "v tab" }, ic, v, small ? h("small", { text: small }) : null), h("div", { class: "d", text: d })));
    }
    tile("Articles", nf.format(arts.length), "", manq ? "+ " + plur(manq, "introuvable") : "tous récupérés");
    tile("Relus", nf.format(relu), "/ " + nf.format(arts.length), parQui.join(" · "));
    tile("Retenus pour le livre", nf.format(dedans.length), "", "≈ " + nf.format(dedans.reduce(function (t, a) { return t + pages(a.mots); }, 0)) + " pages · " + nf.format(disc) + " à discuter");
    tile("Problèmes à régler", nf.format(todo), "", todo ? plur(todo, "article") + " concerné" + (todo > 1 ? "s" : "") : "rien à signaler", todo ? icon("serious", 22) : icon("good", 22));
    tile("Mots", nfc.format(mots), "", "≈ " + nf.format(Math.round(mots / MOTS_PAR_PAGE)) + " pages si on gardait tout");
  }

  // ------------------------------------------------------------------ à traiter
  function renderTodo() {
    var list = filtered("alerte"), c = {};
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
      box.appendChild(h("button", { class: "td" + (S.alerte === t ? " on" : ""), type: "button", "aria-pressed": S.alerte === t ? "true" : "false",
        onclick: function () { setF("alerte", S.alerte === t ? "" : t); if (S.alerte) $("articles").scrollIntoView({ behavior: "smooth", block: "start" }); }
      }, icon(m.st), h("div", {}, h("div", { class: "lb", text: m.lab }), h("div", { class: "ds", text: m.ds })), h("span", { class: "nb tab", text: c[t] })));
    });
  }

  // ------------------------------------------------------------------ la relecture
  function renderRelecture(list) {
    var arts = list.filter(function (a) { return !a.manquant; });
    var box = clear($("relWho"));
    QUI.forEach(function (q) {
      var m = arts.filter(function (a) { return a.rel === q; });
      var r = m.filter(function (a) { return a.statut === "relu"; }).length;
      var c = m.filter(function (a) { return a.statut === "cours"; }).length;
      box.appendChild(h("div", {},
        h("div", { class: "row" }, h("b", { text: q + (q === cfg.qui ? " (toi)" : "") }), h("span", { class: "tab", text: r + " / " + m.length + " relus" + (c ? " · " + c + " en cours" : "") })),
        h("div", { class: "bar2", role: "progressbar", "aria-label": "Relecture de " + q, "aria-valuemin": 0, "aria-valuemax": m.length, "aria-valuenow": r },
          h("i", { class: "g", style: "width:" + (m.length ? r / m.length * 100 : 0) + "%" }),
          h("i", { class: "l", style: "width:" + (m.length ? c / m.length * 100 : 0) + "%" }))));
    });
    // ce qui bouge
    var ev = [];
    arts.forEach(function (a) {
      if (a.statut === "relu" && a.reluLe) ev.push({ t: a.reluLe, a: a, k: "relu" });
      else if (a.docModif) ev.push({ t: a.docModif, a: a, k: "modif" });
    });
    ev.sort(function (x, y) { return x.t < y.t ? 1 : -1; });
    var feed = clear($("feed"));
    if (!ev.length) {
      feed.appendChild(h("li", {}, icon("todo", 18), h("p", { class: "empty-s", text: API.on() ? "Rien de relu pour l’instant. Le premier qui finit choisit le resto." : "L’activité apparaîtra ici une fois le site branché sur le Sheet." })));
      return;
    }
    ev.slice(0, 6).forEach(function (e) {
      var a = e.a;
      feed.appendChild(h("li", {}, icon(e.k === "relu" ? "good" : "cours", 18),
        h("div", {}, e.k === "relu" ? [h("b", { text: a.rel || a.majPar || "?" }), " a relu « " + a.titre + " »"] : ["Doc modifié : « " + a.titre + " »"],
          h("span", { text: " · " + relTime(e.t) }))));
    });
  }

  // ------------------------------------------------------------------ le livre
  function renderLivre() {
    var list = filtered("livre").filter(function (a) { return !a.manquant; });
    var c = { dedans: [], discuter: [], attente: [], ecarte: [] };
    list.forEach(function (a) { if (c[a.livre]) c[a.livre].push(a); });
    var k = myKey();
    var pg = c.dedans.reduce(function (t, a) { return t + pages(a.mots); }, 0);
    var sansMoi = k ? list.filter(function (a) { return !a[k]; }).length : 0;
    var bs = clear($("bstats"));
    var subs = {
      dedans: "oui + oui · ≈ " + nf.format(pg) + " pages",
      discuter: "vous n’êtes pas d’accord",
      attente: k ? "dont " + nf.format(sansMoi) + " sans ton vote" : "l’un de vous n’a pas voté",
      ecarte: "non + non"
    };
    ["dedans", "discuter", "attente", "ecarte"].forEach(function (key) {
      bs.appendChild(h("button", { class: "bstat" + (S.livre === key ? " on" : ""), type: "button", "aria-pressed": S.livre === key ? "true" : "false",
        onclick: function () { setF("livre", S.livre === key ? "" : key); }
      }, h("div", { class: "n tab" }, h("i", { class: LIVRE[key].cls }), nf.format(c[key].length)), h("div", { class: "x", text: LIVRE[key].lab + " · " + subs[key] })));
    });
    // par année
    var ys = {};
    list.forEach(function (a) {
      if (!a.annee) return;
      var y = ys[a.annee] || (ys[a.annee] = { dedans: 0, discuter: 0, attente: 0, ecarte: 0, t: 0, p: 0 });
      y[a.livre]++; y.t++;
      if (a.livre === "dedans") y.p += pages(a.mots);
    });
    var max = Math.max.apply(null, Object.keys(ys).map(function (y) { return ys[y].t; }).concat([1]));
    var yb = clear($("years"));
    Object.keys(ys).sort().forEach(function (y) {
      var d = ys[y];
      yb.appendChild(h("button", { class: "yr", type: "button", title: "Filtrer " + y, onclick: function () { setF("annee", S.annee === y ? "" : y); } },
        h("b", { class: "tab", text: y }),
        h("span", { class: "yb", style: "width:" + (d.t / max * 100) + "%" }, ["dedans", "discuter", "attente", "ecarte"].map(function (key) {
          return d[key] ? h("i", { class: LIVRE[key].cls, style: "flex:" + d[key] + " 1 0", title: LIVRE[key].lab + " : " + d[key] }) : null;
        })),
        h("span", { class: "yc tab", text: d.dedans + " / " + d.t + (d.p ? " · " + d.p + " p." : "") })));
    });
    var lg = clear($("yLegend"));
    ["dedans", "discuter", "attente", "ecarte"].forEach(function (key) { lg.appendChild(h("span", {}, h("i", { class: "sw " + LIVRE[key].cls }), LIVRE[key].lab)); });
    // à discuter
    var dl = clear($("discuter"));
    if (!c.discuter.length) dl.appendChild(h("li", {}, h("p", { class: "empty-s", text: "Aucun désaccord pour l’instant." })));
    c.discuter.slice(0, 8).forEach(function (a) {
      dl.appendChild(h("li", {},
        h("div", {}, h("div", { class: "bt", text: a.titre }),
          h("div", { class: "bm", text: moisAn(a.date) + " · Florian : " + LV_LAB[a.livreF] + " · Amélien : " + LV_LAB[a.livreA] })),
        k && API.on() ? voteSeg(a, true) : null));
    });
    if (c.discuter.length > 8) dl.appendChild(h("li", {}, h("button", { class: "lnk", type: "button", text: "Voir les " + c.discuter.length + " à discuter", onclick: function () { setMany({ livre: "discuter" }, "articles"); } })));
    // sommaire
    var toc = clear($("toc"));
    if (!c.dedans.length) {
      toc.appendChild(h("li", {}, h("p", { class: "empty-s", text: "Le sommaire se remplit quand vous votez oui tous les deux. Il suit l’ordre de parution." })));
      return;
    }
    var page = 1, annee = "", n = 0, lim = S.tocAll ? 1e9 : 24;
    var parAn = {};
    c.dedans.forEach(function (a) { parAn[a.annee] = (parAn[a.annee] || 0) + 1; });
    c.dedans.slice().sort(function (x, y) { return (x.date || "") < (y.date || "") ? -1 : 1; }).forEach(function (a) {
      if (n < lim) {
        if (a.annee !== annee) { annee = a.annee; toc.appendChild(h("li", { class: "ty" }, annee || "Sans date", h("span", { text: plur(parAn[a.annee], "article") }))); }
        toc.appendChild(h("li", { class: "it" }, h("div", {}, h("b", { text: a.titre }), " · " + (a.auteur || "?")), h("span", { text: "p. " + page })));
      }
      n++; page += pages(a.mots);
    });
    if (c.dedans.length > lim || S.tocAll) {
      toc.appendChild(h("li", { style: "margin-top:10px" }, h("button", { class: "lnk", type: "button", text: S.tocAll ? "Replier le sommaire" : "Voir tout le sommaire (" + c.dedans.length + ")", onclick: function () { S.tocAll = !S.tocAll; renderLivre(); } })));
    }
  }

  // ------------------------------------------------------------------ graphiques (exploration)
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
      if (q.slice(-1) === "1") {
        var lx = s("text", { x: padL + i * band + band * 2, y: H - 6, "text-anchor": "middle" });
        lx.textContent = q.slice(0, 4);
        ax.appendChild(lx);
      }
      var hit = s("rect", { x: padL + i * band, y: padT, width: band, height: ph, class: "hit", tabindex: "0", role: "button",
        "aria-label": "T" + q.slice(-1) + " " + q.slice(0, 4) + " : " + plur(tot, "article") });
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
    var c = {}, mots = {}, relu = {}, livre = {};
    list.forEach(function (a) {
      c[a.rubK] = (c[a.rubK] || 0) + 1; mots[a.rubK] = (mots[a.rubK] || 0) + (a.mots || 0);
      if (a.statut === "relu") relu[a.rubK] = (relu[a.rubK] || 0) + 1;
      if (a.livre === "dedans") livre[a.rubK] = (livre[a.rubK] || 0) + 1;
    });
    var series = RUBS.concat(c[AUTRE.k] ? [AUTRE] : []).filter(function (r) { return c[r.k]; });
    var tot = list.length;
    var bar = clear($("segbar"));
    var wpx = bar.clientWidth || 360;
    series.forEach(function (r) {
      var share = c[r.k] / tot, label = Math.round(share * 100) + " %";
      var fits = share * wpx > label.length * 7.5 + 16;
      var b = h("button", { type: "button", class: S.rubs.length && S.rubs.indexOf(r.k) < 0 ? "off" : "", style: "flex:" + c[r.k] + " 1 0;background:" + r.hex,
        "aria-label": r.k + " : " + c[r.k] + " articles, " + label, "aria-pressed": S.rubs.indexOf(r.k) >= 0 ? "true" : "false",
        onclick: function () { hideTip(); toggleRub(r.k); } }, fits ? label : "");
      function tp(ev) { var bb = b.getBoundingClientRect(); showTip(ev && ev.clientX != null ? ev.clientX : bb.left + bb.width / 2, bb.top, r.k, [{ c: r.hex, v: c[r.k], l: "articles · " + label }, { v: nfc.format(mots[r.k]), l: "mots" }]); }
      b.addEventListener("pointermove", tp); b.addEventListener("focus", function () { tp(null); });
      b.addEventListener("pointerleave", hideTip); b.addEventListener("blur", hideTip);
      bar.appendChild(b);
    });
    var lg = clear($("segLegend"));
    series.forEach(function (r) { lg.appendChild(h("span", {}, h("span", { class: "sw", style: "background:" + r.hex }), r.k + " ", h("b", { class: "tab", text: c[r.k] }))); });
    var tb = h("table", { class: "mini tab" });
    tb.appendChild(h("tr", {}, h("th", { text: "Rubrique" }), h("th", { text: "Articles" }), h("th", { text: "Mots / art." }), h("th", { text: "Relus" }), h("th", { text: "Livre" })));
    series.forEach(function (r) {
      tb.appendChild(h("tr", {}, h("td", {}, h("span", { class: "sw", style: "background:" + r.hex + ";margin-right:7px" }), r.k),
        h("td", { text: c[r.k] }), h("td", { text: nf.format(Math.round(mots[r.k] / c[r.k])) }), h("td", { text: relu[r.k] || 0 }), h("td", { text: livre[r.k] || 0 })));
    });
    clear($("rubWords")).appendChild(tb);
  }

  function renderAuthors() {
    var list = filtered("auteur").filter(function (a) { return !a.manquant; });
    var c = {}, mots = {};
    list.forEach(function (a) { var k = a.auteur || "(non signé)"; c[k] = (c[k] || 0) + 1; mots[k] = (mots[k] || 0) + (a.mots || 0); });
    var keys = Object.keys(c).sort(function (x, y) { return c[y] - c[x] || x.localeCompare(y, "fr"); });
    var top = keys.slice(0, 12);
    if (S.auteur && top.indexOf(S.auteur) < 0 && c[S.auteur]) top.push(S.auteur);
    var rest = keys.filter(function (k) { return top.indexOf(k) < 0; });
    var max = Math.max.apply(null, top.map(function (k) { return c[k]; }).concat([1]));
    var box = clear($("authors"));
    top.forEach(function (name) {
      var v = c[name];
      box.appendChild(h("button", { class: "hb" + (S.auteur === name ? " on" : ""), type: "button",
        title: name + " : " + plur(v, "article") + ", " + nf.format(mots[name] || 0) + " mots",
        onclick: function () { setF("auteur", S.auteur === name ? "" : name); }
      }, h("span", { class: "nm", text: name }),
        h("span", { class: "bw" }, h("span", { class: "bar", style: "width:calc((100% - 34px) * " + (v / max) + ")" }), h("span", { class: "vl tab", text: v }))));
    });
    if (rest.length) {
      var nr = rest.reduce(function (t, k) { return t + c[k]; }, 0);
      box.appendChild(h("p", { class: "restline", text: "+ " + rest.length + " autres plumes, " + plur(nr, "article") + " à elles toutes (détail dans « Voir tous les chiffres »)." }));
    }
    var tb = h("table", { class: "mini tab" });
    tb.appendChild(h("tr", {}, h("th", { text: "Plume" }), h("th", { text: "Articles" }), h("th", { text: "Mots" })));
    keys.forEach(function (k) { tb.appendChild(h("tr", {}, h("td", { text: k }), h("td", { text: c[k] }), h("td", { text: nf.format(mots[k]) }))); });
    clear($("auTable")).appendChild(tb);
  }

  function renderNames() {
    var list = filtered("nom"), c = {};
    list.forEach(function (a) { (a.noms || []).forEach(function (n) { c[n] = (c[n] || 0) + 1; }); });
    var keys = Object.keys(c).filter(function (k) { return c[k] > 1 || k === S.nom; })
      .sort(function (x, y) { return c[y] - c[x] || x.localeCompare(y, "fr"); }).slice(0, 40);
    if (S.nom && keys.indexOf(S.nom) < 0) keys.unshift(S.nom);
    var box = clear($("names"));
    if (!keys.length) { box.appendChild(h("p", { class: "hint", text: "Pas de nom qui revient dans cette sélection." })); return; }
    keys.forEach(function (k) {
      box.appendChild(h("button", { class: "name" + (S.nom === k ? " on" : ""), type: "button", "aria-pressed": S.nom === k ? "true" : "false",
        onclick: function () { setF("nom", S.nom === k ? "" : k); } }, k, h("b", { class: "tab", text: c[k] || 0 })));
    });
  }

  // ------------------------------------------------------------------ tableau des articles
  var ST_RANK = { relu: 2, cours: 1, "": 0 };
  function sortList(list) {
    var k = S.sort, d = S.dir;
    return list.slice().sort(function (x, y) {
      var a, b;
      if (k === "relu") { a = (x.manquant ? -1 : ST_RANK[x.statut]) + (x.rel || "~"); b = (y.manquant ? -1 : ST_RANK[y.statut]) + (y.rel || "~"); }
      else if (k === "livre") { a = x.livre ? LIVRE[x.livre].r : 9; b = y.livre ? LIVRE[y.livre].r : 9; }
      else if (k === "alertes") { a = x.tags.length ? TAGS[x.tags[0]].o : 99; b = y.tags.length ? TAGS[y.tags[0]].o : 99; }
      else if (k === "date") { a = x.date || "9999"; b = y.date || "9999"; }
      else { a = fold(x[k === "rub" ? "rubK" : k]); b = fold(y[k === "rub" ? "rubK" : k]); }
      return (a < b ? -1 : a > b ? 1 : fold(x.titre) < fold(y.titre) ? -1 : 1) * d;
    });
  }
  function relCell(a) {
    if (a.manquant) return h("span", { class: "miss", text: "—" });
    if (!a.rel) return h("span", { class: "miss", text: "personne" });
    var st = a.statut;
    return h("span", { class: "rst" + (st === "relu" ? " relu" : st === "cours" ? " cours" : ""),
      title: (st === "relu" ? "Relu par " + a.rel + (a.reluLe ? " le " + dateFr(a.reluLe.slice(0, 10)) : "") : st === "cours" ? "En cours chez " + a.rel : "À relire par " + a.rel) },
      icon(st === "relu" ? "good" : st === "cours" ? "cours" : "todo", 16), a.rel, h("small", { text: st === "relu" ? "relu" : st === "cours" ? "en cours" : "à relire" }));
  }
  function votesCell(a) {
    if (a.manquant || !a.livre) return h("span", { class: "miss", text: "—" });
    var txt = LIVRE[a.livre].lab.replace(/s$/, "");
    if (a.livre === "attente") txt = !a.livreF && !a.livreA ? "Pas encore voté" : "Il manque " + (!a.livreF ? "Florian" : "Amélien");
    return h("span", { class: "lv", title: "Florian : " + LV_LAB[a.livreF] + " · Amélien : " + LV_LAB[a.livreA] }, h("i", { class: "sw " + LIVRE[a.livre].cls }), txt);
  }
  function editing() {
    var el = document.activeElement;
    return !!(el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && el.closest && el.closest("#tbody"))));
  }
  var pendingRender = false;
  function safeRender() { if (editing()) { pendingRender = true; return; } render(); }

  function detailRow(a) {
    var r = rubOf(a.rub), k = myKey(), on = API.on();
    var left = h("div", {});
    left.appendChild(a.extrait
      ? h("p", { class: "ex", text: "« " + (a.extrait.length >= 318 ? a.extrait.slice(0, a.extrait.lastIndexOf(" ")).replace(/[,;:.\s]+$/, "") + "… »" : a.extrait.trim() + " »") })
      : h("p", { class: "ex", text: a.manquant ? "Cet article n’a jamais été archivé par la Wayback Machine." : "Pas d’extrait." }));
    // notes
    left.appendChild(h("div", { class: "dl", text: "Notes" }));
    if (on) {
      var ta = h("textarea", { class: "notes", placeholder: "Une remarque pour l’autre, une correction à faire, une idée pour le livre…", "aria-label": "Notes" });
      ta.value = a.notes || "";
      ta.addEventListener("click", function (e) { e.stopPropagation(); });
      ta.addEventListener("keydown", function (e) { e.stopPropagation(); });
      ta.addEventListener("blur", function () { if (ta.value.trim() !== (a.notes || "").trim()) save(a, { notes: ta.value.trim() }, { msg: "Note enregistrée" }); });
      left.appendChild(ta);
    } else {
      left.appendChild(h("p", { class: "facts", text: a.notes || "Aucune note. Branche le site sur le Sheet pour en écrire." }));
    }
    // alertes
    if (a.tags.length) {
      left.appendChild(h("div", { class: "dl", text: "Alertes" }));
      a.tags.forEach(function (t) {
        var line = h("div", { class: "alertline" }, icon(TAGS[t].st, 18), TAGS[t].one);
        if (on && t !== "introuvable" && t !== "auteur") {
          line.appendChild(h("button", { class: "mini-btn ok", type: "button", onclick: function (e) {
            e.stopPropagation();
            var avant = a.alertes.slice();
            save(a, { alertes: a.alertes.filter(function (raw) { return tagOf(raw, a) !== t; }) }, { msg: "Alerte réglée", undo: function () { save(a, { alertes: avant }); } });
          } }, iCheck(), "C’est réglé"));
        }
        left.appendChild(line);
        if (on && t === "auteur") {
          var inp = h("input", { class: "inp", type: "text", placeholder: "Qui l’a écrit ?", "aria-label": "Plume de l’article" });
          inp.addEventListener("click", function (e) { e.stopPropagation(); });
          function go() {
            var v = inp.value.trim();
            if (!v) return;
            save(a, { auteur: v, alertes: a.alertes.filter(function (raw) { return tagOf(raw, a) !== "auteur"; }) }, { msg: "Plume : " + v });
          }
          inp.addEventListener("keydown", function (e) { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); inp.blur(); go(); } });
          left.appendChild(h("div", { class: "inrow" }, inp, h("button", { class: "mini-btn", type: "button", text: "OK", onclick: function (e) { e.stopPropagation(); go(); } })));
        }
      });
    }
    if (a.noms && a.noms.length) {
      left.appendChild(h("div", { class: "dl", text: "Noms cités en gras" }));
      left.appendChild(h("div", { class: "names" }, a.noms.slice(0, 24).map(function (n) {
        return h("button", { class: "name solo" + (S.nom === n ? " on" : ""), type: "button", onclick: function (e) { e.stopPropagation(); setF("nom", n); }, text: n });
      })));
    }
    // colonne d'actions
    var right = h("div", { class: "acts" });
    if (!a.manquant) {
      right.appendChild(docLink(a, a.gdoc ? "btn main" : "btn ghost", a.gdoc ? "Ouvrir le Google Doc" : "Trouver le Doc dans Drive"));
      right.appendChild(h("div", { class: "dl", text: "Relecture" }));
      right.appendChild(h("div", { class: "seg", role: "group", "aria-label": "Relecture" }, [["", "À relire"], ["cours", "En cours"], ["relu", "Relu"]].map(function (o) {
        var p = a.statut === o[0];
        return h("button", { type: "button", class: o[0] === "relu" ? "g" : null, "aria-pressed": p ? "true" : "false", onclick: function (e) {
          e.stopPropagation();
          if (p) return;
          var prev = a.statut;
          save(a, { statut: o[0] }, { msg: ST_LAB[o[0]] + (o[0] === "relu" ? " ✓" : ""), undo: function () { save(a, { statut: prev }); } });
        } }, o[0] === "relu" ? iCheck() : null, o[1]);
      })));
      var sel = h("select", { class: "sel", "aria-label": "Relecteur", style: "margin-top:8px" },
        [["", "Personne"]].concat(QUI.map(function (q) { return [q, q]; })).map(function (o) { return h("option", { value: o[0], text: o[0] ? "Relecteur : " + o[1] : "Pas de relecteur" }); }));
      sel.value = a.rel || "";
      sel.addEventListener("click", function (e) { e.stopPropagation(); });
      sel.addEventListener("change", function (e) { var prev = a.rel; save(a, { rel: e.target.value }, { msg: e.target.value ? "Pour " + e.target.value : "Plus de relecteur", undo: function () { save(a, { rel: prev }); } }); });
      right.appendChild(h("div", {}, sel));
      right.appendChild(h("div", { class: "dl", text: "Livre" }));
      if (k) right.appendChild(voteSeg(a));
      right.appendChild(h("div", { class: "small", text: "Florian : " + LV_LAB[a.livreF] + " · Amélien : " + LV_LAB[a.livreA] + (a.livre ? " → " + LIVRE[a.livre].one : "") }));
      if (!k) right.appendChild(h("button", { class: "lnk", type: "button", text: "Dis qui tu es pour voter", style: "justify-self:start;margin-top:6px", onclick: function (e) { e.stopPropagation(); askWho(); } }));
    }
    right.appendChild(h("div", { class: "dl", text: "Infos" }));
    right.appendChild(h("div", { class: "facts" },
      h("div", {}, h("b", { text: a.auteur || "Plume inconnue" }), a.date ? " · " + moisAn(a.date) : ""),
      h("div", {}, h("span", { class: "sw", style: "background:" + r.hex + ";margin-right:6px" }), a.rub || "—", a.mots ? " · " + nf.format(a.mots) + " mots · ≈ " + plur(pages(a.mots), "page") : ""),
      (a.cit || a.img || a.vid) ? h("div", { text: [a.cit ? plur(a.cit, "citation") : "", a.img ? plur(a.img, "image") : "", a.vid ? plur(a.vid, "vidéo") : ""].filter(Boolean).join(" · ") }) : null,
      a.reluLe ? h("div", { text: "Relu " + relTime(a.reluLe) }) : null,
      a.docModif ? h("div", { text: "Doc modifié " + relTime(a.docModif) }) : null,
      a.maj && a.majPar ? h("div", { text: "Dernière action : " + a.majPar + ", " + relTime(a.maj) }) : null));
    if (a.src) right.appendChild(h("a", { class: "lnk", href: a.src, target: "_blank", rel: "noopener", style: "margin-top:8px;justify-self:start", onclick: function (e) { e.stopPropagation(); } }, a.manquant ? "Tenter la Wayback Machine" : "Lire l’archive en ligne"));
    var cell = h("td", { colspan: 7 }, h("div", { class: "detail" }, left, right));
    cell.addEventListener("click", function (e) { e.stopPropagation(); });
    return h("tr", { class: "det" }, cell);
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
    if (S.open) {
      var oi = rows.findIndex(function (a) { return a.id === S.open; });
      if (oi >= S.shown) S.shown = oi + 1;
    }
    var frag = document.createDocumentFragment();
    rows.slice(0, S.shown).forEach(function (a) {
      var r = rubOf(a.rub), open = S.open === a.id;
      var topSt = a.tags.length ? TAGS[a.tags[0]].st : "";
      var prClass = (topSt === "critical" || topSt === "serious" || topSt === "warn") ? " pr-" + topSt : "";
      var title = h("div", { class: "ti" + (a.manquant ? " miss" : "") });
      if (topSt === "critical" || topSt === "serious") { var mic = icon(topSt, 15); mic.setAttribute("aria-label", TAGS[a.tags[0]].one); title.appendChild(mic); }
      title.appendChild(document.createTextNode(a.titre));
      var tr = h("tr", { class: "a" + prClass + (open ? " open" : ""), tabindex: "0", "aria-expanded": open ? "true" : "false" },
        h("td", { class: "dt tab", text: dateFr(a.date) }),
        h("td", {}, title),
        h("td", { class: "hm" }, h("span", { class: "rb" }, h("span", { class: "sw", style: "background:" + r.hex }), a.rub || "—")),
        h("td", { class: "au hm", text: a.auteur || "—" }),
        h("td", {}, relCell(a)),
        h("td", { class: "hm" }, votesCell(a)),
        h("td", { class: "hm" }, h("span", { class: "al" }, a.tags.map(function (t) { var w = h("span", { title: TAGS[t].one }); w.appendChild(icon(TAGS[t].st, 18)); return w; }))));
      function toggle() { S.open = S.open === a.id ? "" : a.id; renderTable(filtered()); }
      tr.addEventListener("click", toggle);
      tr.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
      frag.appendChild(tr);
      if (open) frag.appendChild(detailRow(a));
    });
    tb.appendChild(frag);
    var pg = clear($("pager"));
    if (rows.length > S.shown) {
      pg.appendChild(h("span", { text: nf.format(S.shown) + " sur " + nf.format(rows.length) }));
      pg.appendChild(h("button", { class: "btn ghost sm", type: "button", text: "Afficher " + Math.min(PAGE, rows.length - S.shown) + " de plus", onclick: function () { S.shown += PAGE; renderTable(filtered()); } }));
      pg.appendChild(h("button", { class: "lnk", type: "button", text: "Tout afficher", onclick: function () { S.shown = rows.length; renderTable(filtered()); } }));
    }
  }

  function render() {
    pendingRender = false;
    var list = filtered();
    renderMe();
    renderFilters();
    var arts = list.filter(function (a) { return !a.manquant; }).length;
    var total = ALL.filter(function (a) { return !a.manquant; }).length;
    var cnt = clear($("count"));
    cnt.appendChild(h("b", { class: "tab", text: nf.format(arts) }));
    cnt.appendChild(document.createTextNode(arts === total ? " articles" : " sur " + nf.format(total) + " articles"));
    var totalMots = ALL.reduce(function (t, a) { return t + (a.mots || 0); }, 0);
    $("heroSub").textContent = nf.format(total) + " articles et " + nf.format(totalMots) + " mots récupérés après la fermeture du site. Ici, on relit, on vote, on prépare le livre.";
    renderKpis(list);
    renderTodo();
    renderRelecture(list);
    renderLivre();
    renderTable(list);
    renderTimeline();
    renderRubriques();
    renderAuthors();
    renderNames();
    renderRetour();
    $("footData").textContent = API.on() ? "Données : le Google Sheet de suivi" + (REMOTE.liensMaj ? " · liens des Docs vérifiés " + relTime(REMOTE.liensMaj) : "") + "." : "Données : instantané du 18/11/2026.";
  }

  // ------------------------------------------------------------------ tri rapide
  var T = null;
  var tri = $("tri");
  function openTri() {
    if (!cfg.qui) { askWho(openTri); return; }
    if (!API.on()) { needConnect(); return; }
    var k = myKey();
    var base = anyFilter() ? filtered() : ALL;
    var queue = base.filter(function (a) { return !a.manquant && !a[k]; }).sort(function (x, y) { return (x.date || "9999") < (y.date || "9999") ? -1 : 1; });
    T = { queue: queue, i: 0, hist: [], fait: { oui: 0, peut: 0, non: 0 }, sel: anyFilter() };
    renderTri();
    if (tri.showModal) tri.showModal(); else tri.setAttribute("open", "");
  }
  function triVote(v) {
    if (!T || T.i >= T.queue.length) return;
    var a = T.queue[T.i], k = myKey();
    var card = tri.querySelector(".tcard");
    T.hist.push({ i: T.i, a: a, prev: a[k], v: v });
    if (v) { var ch = {}; ch[k] = v; save(a, ch, { noRender: true }); T.fait[v]++; }
    T.i++;
    if (card && v) { card.classList.add("go-" + v); setTimeout(renderTri, 170); } else renderTri();
  }
  function triUndo() {
    if (!T || !T.hist.length) return;
    var last = T.hist.pop(), k = myKey();
    if (last.v) { var ch = {}; ch[k] = last.prev; save(last.a, ch, { noRender: true }); T.fait[last.v]--; }
    T.i = last.i;
    renderTri();
  }
  function renderTri() {
    var body = clear($("triBody"));
    var n = T.queue.length, k = myKey();
    $("triP").textContent = "";
    $("triP").appendChild(h("b", { class: "tab", text: nf.format(Math.min(T.i + 1, n)) }));
    $("triP").appendChild(document.createTextNode(" / " + nf.format(n) + " sans ton vote" + (T.sel ? " (dans ta sélection)" : "")));
    $("triBar").style.width = (n ? T.i / n * 100 : 100) + "%";
    if (T.i >= n) {
      body.appendChild(h("div", { class: "tri-done" },
        h("h4", { text: n ? "Tout est trié." : "Rien à trier ici." }),
        h("p", { text: n ? nf.format(T.fait.oui) + " oui · " + nf.format(T.fait.peut) + " peut-être · " + nf.format(T.fait.non) + " non. Tes votes sont enregistrés." : "Tu as déjà voté pour tous ces articles." }),
        h("div", { class: "act", style: "justify-content:center;display:flex;gap:8px" },
          T.hist.length ? h("button", { class: "btn ghost", type: "button", text: "Revenir au dernier", onclick: triUndo }) : null,
          h("button", { class: "btn main", type: "button", text: "Fermer", onclick: function () { tri.close(); } }))));
      return;
    }
    var a = T.queue[T.i], r = rubOf(a.rub), o = other(cfg.qui), ok = o === "Florian" ? "livreF" : "livreA";
    var card = h("article", { class: "tcard" },
      h("span", { class: "rbar", style: "background:" + r.hex }),
      h("div", { class: "meta" }, h("span", { class: "rb" }, h("span", { class: "sw", style: "background:" + r.hex }), a.rub || "—"), h("span", { text: moisAn(a.date) }), h("span", { text: nf.format(a.mots || 0) + " mots" })),
      h("h4", { text: a.titre }),
      h("div", { class: "by", text: "par " + (a.auteur || "plume inconnue") }),
      a.extrait ? h("p", { class: "ex", text: "« " + (a.extrait.length >= 318 ? a.extrait.slice(0, a.extrait.lastIndexOf(" ")).replace(/[,;:.\s]+$/, "") + "… »" : a.extrait.trim() + " »") }) : null,
      a.noms && a.noms.length ? h("div", { class: "names" }, a.noms.slice(0, 8).map(function (nm) { return h("span", { class: "name solo", text: nm }); })) : null,
      a[ok] ? h("div", { class: "other", text: o + " a voté : " + LV_LAB[a[ok]] }) : null,
      h("div", { class: "lk2" }, h("a", { class: "lnk", href: docHref(a), target: "_blank", rel: "noopener", text: a.gdoc ? "Ouvrir le Doc" : "Trouver le Doc" }), a.src ? h("a", { class: "lnk", href: a.src, target: "_blank", rel: "noopener", text: "L’archive" }) : null));
    // glisser : à droite oui, à gauche non, vers le bas peut-être
    var x0 = null, y0 = null, dx = 0, dy = 0;
    card.addEventListener("pointerdown", function (e) { if (e.target.closest("a")) return; x0 = e.clientX; y0 = e.clientY; dx = dy = 0; card.style.transition = "none"; });
    card.addEventListener("pointermove", function (e) {
      if (x0 == null) return;
      dx = e.clientX - x0; dy = e.clientY - y0;
      if (Math.abs(dx) > 8 || dy > 8) card.style.transform = "translate(" + dx + "px," + Math.max(0, dy) + "px) rotate(" + dx / 40 + "deg)";
    });
    function end() {
      if (x0 == null) return;
      x0 = null; card.style.transition = ""; card.style.transform = "";
      if (dx > 90) triVote("oui"); else if (dx < -90) triVote("non"); else if (dy > 90) triVote("peut");
    }
    card.addEventListener("pointerup", end);
    card.addEventListener("pointercancel", end);
    body.appendChild(card);
    body.appendChild(h("div", { class: "tri-btns" },
      h("button", { type: "button", onclick: function () { triVote("non"); } }, "Non", h("small", { text: "← ou 1" })),
      h("button", { type: "button", class: "p", onclick: function () { triVote("peut"); } }, "Peut-être", h("small", { text: "↓ ou 2" })),
      h("button", { type: "button", class: "o", onclick: function () { triVote("oui"); } }, "Oui", h("small", { text: "→ ou 3" }))));
    body.appendChild(h("div", { class: "tri-foot" },
      h("button", { class: "lnk", type: "button", text: "Annuler le dernier", disabled: T.hist.length ? null : true, onclick: triUndo }),
      h("span", { class: "small", style: "margin:0", text: "Glisse la carte, ou utilise les flèches." }),
      h("button", { class: "lnk", type: "button", text: "Passer", onclick: function () { triVote(""); } })));
  }
  tri.addEventListener("keydown", function (e) {
    if (!T) return;
    var map = { ArrowRight: "oui", "3": "oui", o: "oui", ArrowLeft: "non", "1": "non", n: "non", ArrowDown: "peut", "2": "peut", p: "peut" };
    if (map[e.key]) { e.preventDefault(); triVote(map[e.key]); }
    else if (e.key === " " || e.key === "s") { e.preventDefault(); triVote(""); }
    else if (e.key === "Backspace" || e.key === "z") { e.preventDefault(); triUndo(); }
  });
  tri.addEventListener("close", function () { T = null; flush(); render(); });

  // ------------------------------------------------------------------ qui es-tu
  var whoCb = null;
  function setQui(q) {
    cfg.qui = q; ls("qui", q);
    setSync($("syncDot").className.replace("dot", "").trim(), $("syncTxt").textContent);
    if ($("dlgWho").open) $("dlgWho").close();
    render();
    var cb = whoCb; whoCb = null;
    if (cb) cb();
  }
  function askWho(cb) {
    whoCb = cb || null;
    document.querySelectorAll("#whoPick button").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.qui === cfg.qui ? "true" : "false"); });
    var d = $("dlgWho");
    if (d.showModal) d.showModal(); else d.setAttribute("open", "");
  }
  document.querySelectorAll("#whoPick button").forEach(function (b) { b.addEventListener("click", function () { setQui(b.dataset.qui); }); });
  $("whoBtn").addEventListener("click", function () { askWho(); });

  // ------------------------------------------------------------------ réglages
  var dlg = $("dlg"), scriptText = "";
  function openSettings() {
    $("scriptUrl").value = cfg.script; $("codeIn").value = cfg.code;
    $("dlgErr").hidden = true; $("dlgOk").hidden = true;
    $("dlgMore").hidden = !API.on();
    $("install").open = !API.on() && !CONF.script;
    $("inviteWho").textContent = cfg.qui ? other(cfg.qui) : "l’autre";
    $("dlgSave").textContent = API.on() ? "Enregistrer" : "Brancher";
    var os = $("openSheet");
    os.hidden = !REMOTE.sheet; if (REMOTE.sheet) os.href = REMOTE.sheet;
    $("liensInfo").textContent = "Le script les retrouve tout seul toutes les heures" + (REMOTE.liensMaj ? " (dernière fois " + relTime(REMOTE.liensMaj) + ")" : "") + ". " +
      nf.format(ALL.filter(function (a) { return a.gdoc; }).length) + " Docs ont leur lien.";
    if (!scriptText) fetch("outils/script-google.gs").then(function (r) { return r.ok ? r.text() : ""; }).then(function (t) { scriptText = t; }).catch(function () {});
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
  }
  function dlgMsg(id, txt) { $("dlgErr").hidden = true; $("dlgOk").hidden = true; var el = $(id); el.textContent = txt; el.hidden = !txt; }
  $("settings").addEventListener("click", openSettings);
  $("dlgSave").addEventListener("click", function () {
    var u = $("scriptUrl").value.trim(), c = $("codeIn").value.trim().toLowerCase();
    if (!/^https:\/\/script\.google\.com\/(a\/[^/]+\/)?macros\/s\/[^/]+\/(exec|dev)/.test(u)) { dlgMsg("dlgErr", "Il faut l’URL de l’application Web du script : elle commence par https://script.google.com/macros/s/ et finit par /exec."); return; }
    if (!c) { dlgMsg("dlgErr", "Il manque le code d’accès (il est affiché dans le journal du script après « installer »)."); return; }
    var old = { script: cfg.script, code: cfg.code };
    cfg.script = u.replace(/\/dev$/, "/exec"); cfg.code = c;
    dlgMsg("dlgOk", "Connexion…");
    load().then(function (d) {
      ls("script", cfg.script === CONF.script ? null : cfg.script); ls("code", cfg.code);
      dlgMsg("dlgOk", "Branché ✓ " + plur((d && d.articles || []).length, "article") + " lus dans le Sheet.");
      $("dlgMore").hidden = false;
      var os = $("openSheet"); os.hidden = !REMOTE.sheet; if (REMOTE.sheet) os.href = REMOTE.sheet;
      if (!cfg.qui) setTimeout(function () { dlg.close(); askWho(); }, 900);
    }, function (e) {
      cfg.script = old.script; cfg.code = old.code;
      dlgMsg("dlgErr", e.message);
      setSync(old.code ? "err" : "", old.code ? "Script injoignable" : "Instantané du 18/11/2026");
    });
  });
  $("dlgClear").addEventListener("click", function () {
    ls("script", null); ls("code", null);
    cfg.script = CONF.script || ""; cfg.code = "";
    ALL = fromSnap(); REMOTE = {}; lastLoad = 0;
    dlg.close(); setSync("", "Instantané du 18/11/2026"); render();
    toast("Débranché : le site affiche l’instantané.");
  });
  $("invite").addEventListener("click", function () {
    var q = new URLSearchParams({ cle: cfg.code });
    if (cfg.script !== CONF.script) q.set("script", cfg.script);
    if (cfg.qui) q.set("qui", other(cfg.qui));
    var url = location.origin + location.pathname + "#" + q.toString();
    copier(url, "Lien copié. Envoie-le à " + (cfg.qui ? other(cfg.qui) : "l’autre") + " en privé.");
  });
  $("liensNow").addEventListener("click", function () {
    var b = $("liensNow");
    b.disabled = true; b.textContent = "Recherche dans le Drive… (jusqu’à une minute)";
    load("liens").then(function (d) {
      var l = d && d.liens;
      toast(l ? nf.format(l.trouves) + " Docs retrouvés" + (l.manquants ? ", " + nf.format(l.manquants) + " introuvables dans le dossier" : "") + "." : "Liens à jour.", { ms: 5000 });
      dlg.close();
    }, function (e) { toast("Échec : " + e.message, { err: true, ms: 8000 }); })
      .finally(function () { b.disabled = false; b.textContent = "Les retrouver maintenant"; });
  });
  $("copyScript").addEventListener("click", function () {
    if (scriptText) copier(scriptText, "Script copié. Colle-le dans script.google.com.");
    else window.open("https://raw.githubusercontent.com/amelienito/cul7ure-save/main/outils/script-google.gs", "_blank", "noopener");
  });
  function copier(txt, msg) {
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast(msg, { ms: 4500 }); }, function () {
      window.prompt("Copie ceci :", txt);
    });
  }
  document.querySelectorAll("dialog [data-close]").forEach(function (b) { b.addEventListener("click", function () { b.closest("dialog").close(); }); });

  // ------------------------------------------------------------------ branchements
  var qT;
  $("q").addEventListener("input", function (e) { clearTimeout(qT); var v = e.target.value; qT = setTimeout(function () { setF("q", v.trim()); }, 160); });
  $("fRel").addEventListener("change", function (e) { setF("rel", e.target.value); });
  $("fStatut").addEventListener("change", function (e) { setF("statut", e.target.value); });
  $("fLivre").addEventListener("change", function (e) { setF("livre", e.target.value); });
  $("fAuteur").addEventListener("change", function (e) { setF("auteur", e.target.value); });
  $("fAnnee").addEventListener("change", function (e) { setF("annee", e.target.value); });
  document.querySelectorAll("[data-reset]").forEach(function (b) { b.addEventListener("click", resetAll); });
  document.querySelectorAll("#livreCard [data-tri]").forEach(function (b) { b.addEventListener("click", openTri); });
  document.querySelectorAll("#tbl th button").forEach(function (b) {
    b.addEventListener("click", function () {
      var k = b.parentNode.dataset.k;
      if (S.sort === k) S.dir = -S.dir; else { S.sort = k; S.dir = k === "relu" ? -1 : 1; }
      writeHash(); renderTable(filtered());
    });
  });
  $("tbody").addEventListener("focusout", function () { setTimeout(function () { if (pendingRender && !editing()) render(); }, 50); });
  var rT;
  window.addEventListener("resize", function () { clearTimeout(rT); rT = setTimeout(function () { renderTimeline(); renderRubriques(); }, 120); });
  window.addEventListener("scroll", hideTip, { passive: true });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") { if (Object.keys(W.pending).length) flush(true); return; }
    renderRetour();
    if (API.on() && Date.now() - lastLoad > 45000) load().catch(function () {});
  });
  window.addEventListener("pagehide", function () { if (Object.keys(W.pending).length) flush(true); });
  setInterval(function () {
    if (document.visibilityState === "visible" && API.on() && !editing() && !(tri.open) && Date.now() - lastLoad > 170000) load().catch(function () {});
  }, 30000);
  $("refresh").addEventListener("click", function () { load().catch(function (e) { toast(e.message, { err: true }); }); });
  window.addEventListener("hashchange", function () {
    if (invitation()) { lastLoad = 0; setSync("", "Branchement…"); render(); load().catch(function (e) { toast(e.message, { err: true }); }); }
  });

  readHash();
  if (S.q) $("q").value = S.q;
  setSync("", "Instantané du 18/11/2026");
  render();
  load().catch(function (e) { if (e.code) { openSettings(); dlgMsg("dlgErr", "Le code d’accès a été refusé : vérifie-le."); } });
})();
