/* Cul7ure · les archives
   Quatre vues : Accueil (ce qu'il te reste à faire), Articles (la liste), Article (on lit, on corrige, on vote),
   Le livre (le sommaire). Les chiffres sont à part.
   Données : data/articles.js (instantané), puis le script Google (outils/script-google.gs) qui lit et écrit
   le Sheet de suivi et le texte des Google Docs. */
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
  var MOTS_PAR_PAGE = 320, MOTS_PAR_MIN = 250, PAGE = 40;
  var TAGS = {
    introuvable: { st: "critical", o: 0, court: "Jamais archivé", txt: "<b>Jamais archivé.</b> La Wayback Machine n’a jamais enregistré cet article. Seule piste : les archives du web de la BnF.", regler: false },
    spam: { st: "critical", o: 1, court: "Spam possible", txt: "<b>Spam possible.</b> Des mots de casino traînent peut-être dans le texte : cherche-les et supprime-les." },
    video: { st: "serious", o: 2, court: "Vidéo à retranscrire", txt: "<b>Interview vidéo.</b> Le texte ne contient que l’intro et le lien YouTube : il faut retranscrire l’interview ici." },
    auteur: { st: "warn", o: 3, court: "Auteur à retrouver", txt: "<b>Auteur inconnu.</b> L’article était signé « Anonyme » sur le site. Qui l’a écrit ?" },
    date: { st: "warn", o: 4, court: "Date à retrouver", txt: "<b>Date inconnue.</b> L’archive ne donne pas la date de parution." },
    court: { st: "info", o: 5, court: "Texte très court", txt: "<b>Texte très court.</b> C’est peut-être une annonce, ou un contenu parti en PDF (Osmose)." },
    v2020: { st: "info", o: 6, court: "Ancienne version", txt: "<b>Ancienne version (2020).</b> Récupéré depuis l’ancienne maquette du site : compare avec l’archive pour vérifier qu’il ne manque rien." },
    guillemets: { st: "info", o: 7, court: "Guillemets à vérifier", txt: "<b>Guillemets à vérifier.</b> Des guillemets droits sont restés en nombre impair : le bouton « Guillemets » de la barre d’outils les corrige." },
    autre: { st: "info", o: 8, court: "Remarque", txt: "<b>Remarque.</b>" }
  };
  var LV_LAB = { "": "pas encore voté", oui: "oui", peut: "peut-être", non: "non" };
  var LIVRE = {
    dedans: { lab: "Retenus", one: "Retenu", cls: "c-in", r: 0 },
    discuter: { lab: "À discuter", one: "À discuter", cls: "c-disc", r: 1 },
    attente: { lab: "Il manque un vote", one: "Il manque un vote", cls: "c-wait", r: 2 },
    ecarte: { lab: "Refusés", one: "Refusé", cls: "c-out", r: 3 }
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
      else if (k === "html") el.innerHTML = attrs[k];
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
  function s(tag, attrs) { var el = document.createElementNS(SVGNS, tag); for (var k in attrs || {}) el.setAttribute(k, attrs[k]); return el; }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fold(t) { return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "'"); }
  function rubOf(name) { for (var i = 0; i < RUBS.length; i++) if (fold(RUBS[i].k) === fold(name)) return RUBS[i]; return AUTRE; }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
  function plur(n, one, many) { return nf.format(n) + " " + (n > 1 ? (many || one + "s") : one); }
  function moisAn(d) { if (!d) return "date inconnue"; var p = d.split("-"); return MOIS[+p[1] - 1] + " " + p[0]; }
  function pad(n) { return ("0" + n).slice(-2); }
  function nowStr() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function hhmm() { var d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function parseStamp(t) {
    var m = String(t || "").match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : null;
  }
  function relTime(t) {
    var d = typeof t === "number" ? new Date(t) : parseStamp(t);
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
  function link(id) { return "#/a/" + encodeURIComponent(id); }
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
  function iLink() { return svgFrom('<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M9 3h4v4M13 3L7.5 8.5M11 9.5V13H3V5h3.5"/></svg>'); }
  function iCheck() { return svgFrom('<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.3l2.2 2.2 4.8-5"/></svg>'); }

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
  function byDate(x, y) { var a = x.date || "9999", b = y.date || "9999"; return a < b ? -1 : a > b ? 1 : 0; }
  function fromSnap() { return SNAP.map(function (a) { return prepare(Object.assign({}, a)); }).sort(byDate); }
  var ALL = fromSnap();
  function byId(id) { for (var i = 0; i < ALL.length; i++) if (ALL[i].id === id) return ALL[i]; return null; }
  function arts() { return ALL.filter(function (a) { return !a.manquant; }); }

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
    return out.sort(byDate);
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
  var REMOTE = {}, lastLoad = 0;
  function other(q) { return q === "Florian" ? "Amélien" : "Florian"; }
  function myKey() { return cfg.qui === "Florian" ? "livreF" : cfg.qui === "Amélien" ? "livreA" : ""; }
  function otherKey() { return cfg.qui === "Florian" ? "livreA" : "livreF"; }

  // lien d'invitation : #cle=…&script=…&qui=…
  function invitation() {
    var p = new URLSearchParams(location.hash.replace(/^#\/?\??/, ""));
    if (!p.get("cle")) return false;
    cfg.code = p.get("cle").trim().toLowerCase(); ls("code", cfg.code);
    if (p.get("script")) { cfg.script = p.get("script"); ls("script", cfg.script); }
    if (QUI.indexOf(p.get("qui")) >= 0) { cfg.qui = p.get("qui"); ls("qui", cfg.qui); }
    history.replaceState(null, "", location.pathname + location.search + "#/");
    setTimeout(function () { toast(cfg.qui ? "C’est branché. Salut " + cfg.qui + " !" : "C’est branché."); }, 500);
    return true;
  }

  // ------------------------------------------------------------------ le script Google
  var API = {
    on: function () { return !!(cfg.script && cfg.code); },
    check: function (r) {
      return r.text().then(function (t) {
        var d;
        try { d = JSON.parse(t); } catch (e) { throw new Error("Le script ne renvoie pas les données. Vérifie que « Qui a accès » est sur « Tout le monde »."); }
        if (!d.ok) {
          var er = new Error(d.erreur === "CODE_FAUX" ? "Code d’accès refusé." : d.erreur || "Erreur du script");
          er.code = d.erreur === "CODE_FAUX";
          throw er;
        }
        return d;
      });
    },
    net: function (e) {
      if (e && e.name === "TypeError") throw new Error("Impossible de joindre le script. Vérifie ta connexion.");
      throw e;
    },
    get: function (action, extra) {
      var q = new URLSearchParams(Object.assign({ code: cfg.code, _: Date.now() }, extra || {}));
      if (action) q.set("action", action);
      return fetch(cfg.script + "?" + q.toString(), { cache: "no-store" }).then(API.check, API.net);
    },
    post: function (body, keep) {
      body = Object.assign({ code: cfg.code, qui: cfg.qui }, body);
      return fetch(cfg.script, { method: "POST", body: JSON.stringify(body), keepalive: !!keep }).then(API.check, API.net);
    }
  };

  function setSync(state, txt) {
    $("syncDot").className = "dot" + (state ? " " + state : "");
    $("syncTxt").textContent = txt;
    $("syncDot").parentNode.title = txt;
    var w = $("whoBtn");
    w.textContent = cfg.qui || "Qui es-tu ?";
    w.classList.toggle("on", !!cfg.qui);
  }

  var W = { pending: {}, before: {}, timer: 0, busy: false };
  function hasPending() { return W.busy || Object.keys(W.pending).length > 0; }

  function load(action) {
    if (!API.on()) { setSync("", "Pas encore branché"); return Promise.resolve(null); }
    if (hasPending() && !action) { setTimeout(function () { load(); }, 1500); return Promise.resolve(null); }
    setSync("busy", action === "liens" ? "Recherche des Docs…" : "Mise à jour…");
    return API.get(action).then(function (d) {
      ALL = mergeRemote(d.articles || []);
      REMOTE = { sheet: d.sheet || "", liensMaj: d.liensMaj || "", liens: d.liens || REMOTE.liens };
      lastLoad = Date.now();
      setSync("on", "À jour · " + hhmm());
      render();
      return d;
    }).catch(function (e) {
      setSync("err", e.code ? "Code d’accès refusé" : "Script injoignable");
      console.warn("Cul7ure :", e);
      throw e;
    });
  }

  // ------------------------------------------------------------------ enregistrer le suivi (relu, votes, notes…)
  function needConnect() {
    toast("Pour enregistrer, il faut d’abord brancher le site sur Google.", { action: { label: "Brancher", fn: function () { openSettings(true); } } });
  }
  function save(a, champs, opt) {
    opt = opt || {};
    if (!API.on()) { needConnect(); return false; }
    if (!cfg.qui) { askWho(function () { save(a, champs, opt); }); return false; }
    var p = W.pending[a.id] || (W.pending[a.id] = {});
    var b = W.before[a.id] || (W.before[a.id] = {});
    Object.keys(champs).forEach(function (k) { if (!(k in b)) b[k] = a[k]; p[k] = champs[k]; a[k] = champs[k]; });
    if ("statut" in champs) { if (!("reluLe" in b)) b.reluLe = a.reluLe; a.reluLe = champs.statut === "relu" ? nowStr() : ""; }
    a.maj = nowStr(); a.majPar = cfg.qui;
    prepare(a);
    if (!opt.noRender) render();
    if (opt.msg) toast(opt.msg, opt.undo ? { action: { label: "Annuler", fn: opt.undo } } : null);
    clearTimeout(W.timer);
    W.timer = setTimeout(flush, opt.now ? 0 : 600);
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
    API.post({ modifs: ids.map(function (id) { return { id: id, champs: toSheet(sent[id]) }; }) }, keep).then(function (d) {
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
      if (keep) { setSync("err", "À vérifier"); lastLoad = 0; return; }
      Object.keys(befores).forEach(function (id) {
        var a = byId(id);
        if (!a) return;
        Object.keys(befores[id]).forEach(function (k) { if (!(W.pending[id] && k in W.pending[id])) a[k] = befores[id][k]; });
        prepare(a);
      });
      setSync("err", "Pas enregistré");
      toast("Pas enregistré : " + e.message, { err: true, ms: 9000, action: { label: "Réessayer", fn: function () {
        Object.keys(sent).forEach(function (id) { var a = byId(id); if (a) save(a, sent[id], { now: true, noRender: true }); });
        render();
      } } });
    }).finally(function () { W.busy = false; render(); });
  }

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

  function myQueue() {
    if (!cfg.qui) return [];
    return ALL.filter(function (a) { return !a.manquant && a.rel === cfg.qui && a.statut !== "relu"; })
      .sort(function (x, y) {
        if ((x.statut === "cours") !== (y.statut === "cours")) return x.statut === "cours" ? -1 : 1;
        return byDate(x, y);
      });
  }
  function voteSeg(a) {
    var k = myKey();
    return h("div", { class: "seg", role: "group", "aria-label": "Ton vote pour le livre" },
      [["oui", "Oui"], ["peut", "Peut-être"], ["non", "Non"]].map(function (o) {
        var on = a[k] === o[0];
        return h("button", { type: "button", "aria-pressed": on ? "true" : "false", onclick: function (e) {
          e.preventDefault(); e.stopPropagation();
          var prev = a[k], ch = {};
          ch[k] = on ? "" : o[0];
          save(a, ch, { msg: on ? "Vote retiré" : "Ton vote : " + LV_LAB[o[0]], undo: function () { var u = {}; u[k] = prev; save(a, u); } });
        } }, o[1]);
      }));
  }
  function statusChip(a) {
    if (a.manquant) return h("span", { class: "chip" }, icon("critical", 15), "Jamais archivé");
    var who = a.rel ? (a.rel === cfg.qui ? "toi" : a.rel) : "";
    if (a.statut === "relu") return h("span", { class: "chip good" }, icon("good", 15), "Relu" + (who ? " par " + who : ""));
    if (a.statut === "cours") return h("span", { class: "chip cours" }, icon("cours", 15), "En cours" + (who ? " · " + who : ""));
    return h("span", { class: "chip" }, icon("todo", 15), "À relire" + (who ? " · " + who : ""));
  }

  // ------------------------------------------------------------------ navigation
  var V = { name: "", id: "", q: new URLSearchParams() }, CTX = [], NAVS = 0;
  function parseHash() {
    var hs = location.hash.replace(/^#/, "");
    var parts = hs.split("?"), path = parts[0] || "/", q = new URLSearchParams(parts[1] || "");
    if (path.indexOf("/a/") === 0) return { name: "article", id: decodeURIComponent(path.slice(3)), q: q };
    if (path === "/articles") return { name: "list", q: q };
    if (path === "/livre") return { name: "livre", q: q };
    if (path === "/chiffres") return { name: "chiffres", q: q };
    return { name: "home", q: q };
  }
  function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
  function route() {
    if (/(^#|&|\?)cle=/.test(location.hash) && invitation() && STARTED) { load().catch(function () {}); }
    var nv = parseHash();
    if (V.name === "article" && (nv.name !== "article" || nv.id !== V.id)) leaveArticle();
    var same = nv.name === V.name && nv.id === V.id;
    V = nv; NAVS++;
    document.body.classList.toggle("in-article", V.name === "article");
    document.querySelectorAll("#nav a").forEach(function (a) {
      var on = a.dataset.v === (V.name === "article" ? "list" : V.name);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    render(true);
    if (!same) window.scrollTo(0, 0);
  }
  function render(full) {
    hideTip();
    if (V.name === "article" && ED && ED.id === V.id && (!full || ED.dirty)) { renderSide(); renderProbs(); return; }
    if (V.name === "list" && !full && document.activeElement && document.activeElement.id === "q") { renderItems(); return; }
    var root = clear($("view"));
    if (V.name === "article") viewArticle(root, V.id);
    else if (V.name === "list") viewList(root);
    else if (V.name === "livre") viewLivre(root);
    else if (V.name === "chiffres") viewChiffres(root);
    else viewHome(root);
  }
  function openWith(ids) { return function () { CTX = ids.slice(); }; }

  // ------------------------------------------------------------------ accueil
  function viewHome(root) {
    if (!API.on()) {
      var w = h("section", { class: "welcome" },
        h("h1", { class: "page", text: "Les archives de Cul7ure" }),
        h("p", { class: "lead", html: "Ici, Florian et Amélien relisent les <b>247 articles</b> sauvés et choisissent ceux du livre. On corrige le texte <b>directement sur le site</b> : le Google Doc de l’article se met à jour tout seul." }),
        h("div", { class: "steps3" },
          h("div", {}, h("b", {}, h("span", { class: "num", text: "1" }), "Relire"), h("p", { text: "Chacun a sa liste : tu relis les textes de l’autre et une partie des autres plumes. Tu corriges, puis tu dis « C’est relu »." })),
          h("div", {}, h("b", {}, h("span", { class: "num", text: "2" }), "Voter"), h("p", { text: "Pour chaque article : oui, peut-être ou non pour le livre. Il est retenu quand vous dites oui tous les deux." })),
          h("div", {}, h("b", {}, h("span", { class: "num", text: "3" }), "Régler les problèmes"), h("p", { text: "Quelques articles sont incomplets : interviews vidéo à retranscrire, auteurs à retrouver…" }))),
        h("div", { class: "card" },
          h("h2", { class: "sec", text: "Pour commencer : brancher le site sur Google" }),
          h("p", { class: "hint", text: "À faire une seule fois, par Amélien, sur ordinateur (environ 10 minutes). Ensuite, Florian n’aura qu’à ouvrir le lien que tu lui enverras." }),
          h("button", { class: "btn main big", type: "button", text: "Brancher le site", onclick: function () { openSettings(true); } }),
          h("p", { class: "small", style: "margin-top:14px", text: "Tu as reçu un lien de l’autre ? Ouvre-le simplement : tout se branche tout seul." }),
          h("a", { class: "lnk", href: "#/articles", text: "En attendant, parcourir les articles" })));
      root.appendChild(w);
      return;
    }
    if (!cfg.qui) {
      root.appendChild(h("section", { class: "welcome" },
        h("h1", { class: "page", text: "Qui es-tu ?" }),
        h("p", { class: "lead", text: "Pour te montrer ta liste de relecture et enregistrer tes votes à ton nom." }),
        h("div", { class: "whoPick" }, QUI.map(function (q) { return h("button", { type: "button", text: q, onclick: function () { setQui(q); } }); }))));
      return;
    }
    var o = other(cfg.qui);
    var mine = arts().filter(function (a) { return a.rel === cfg.qui; });
    var relu = mine.filter(function (a) { return a.statut === "relu"; }).length;
    var q = myQueue(), first = q[0];
    root.appendChild(h("h1", { class: "page", text: "Salut " + cfg.qui + "." }));
    root.appendChild(h("p", { class: "lead", html: "Ta mission : relire tes <b>" + nf.format(mine.length) + " articles</b> (les textes d’" + esc(o) + " et une partie des autres plumes), puis dire lesquels tu veux dans le livre. Tu corriges directement ici." }));
    var hero = h("section", { class: "hero-next" });
    if (first) {
      hero.appendChild(h("div", { class: "k", text: first.statut === "cours" ? "À reprendre" : "Ton prochain article" }));
      hero.appendChild(h("div", { class: "t", text: first.titre }));
      hero.appendChild(h("div", { class: "m", text: [first.rub, moisAn(first.date), "écrit par " + (first.auteur || "auteur inconnu"), "≈ " + minLecture(first) + " min de lecture"].join(" · ") }));
      hero.appendChild(h("div", { class: "row" },
        h("a", { class: "btn main big", href: link(first.id), onclick: openWith(q.map(function (a) { return a.id; })) }, first.statut === "cours" ? "Reprendre la relecture →" : "Commencer la relecture →"),
        h("a", { class: "lnk", href: "#/articles?vue=moi&etat=arelire", text: "Voir toute ma liste (" + q.length + ")" })));
    } else {
      hero.appendChild(h("div", { class: "k", text: "Bravo" }));
      hero.appendChild(h("div", { class: "t", text: mine.length ? "Tu as relu tous tes articles." : "Aucun article ne t’est attribué." }));
      hero.appendChild(h("div", { class: "m", text: "Il reste peut-être des votes pour le livre, juste en dessous." }));
    }
    root.appendChild(hero);
    var prog = h("section", { class: "card prog", "aria-label": "Avancement" });
    [cfg.qui, o].forEach(function (qq) {
      var m = arts().filter(function (a) { return a.rel === qq; });
      var r = m.filter(function (a) { return a.statut === "relu"; }).length, c = m.filter(function (a) { return a.statut === "cours"; }).length;
      prog.appendChild(h("div", { class: "row" },
        h("b", { text: qq === cfg.qui ? "Toi" : qq }),
        h("div", { class: "bar", role: "progressbar", "aria-label": "Relecture de " + qq, "aria-valuemin": 0, "aria-valuemax": m.length, "aria-valuenow": r },
          h("i", { style: "width:" + (m.length ? r / m.length * 100 : 0) + "%" }), h("i", { class: "l", style: "width:" + (m.length ? c / m.length * 100 : 0) + "%" })),
        h("span", { class: "tab", text: r + " / " + m.length + " relus" })));
    });
    root.appendChild(prog);
    var k = myKey(), A = arts();
    var sans = A.filter(function (a) { return !a[k]; }).length;
    var disc = A.filter(function (a) { return a.livre === "discuter"; }).length;
    var ret = A.filter(function (a) { return a.livre === "dedans"; });
    var nProb = ALL.filter(function (a) { return a.tags.length; }).length;
    root.appendChild(h("section", { class: "tiles" },
      h("button", { class: "tile", type: "button", onclick: openTri },
        h("span", { class: "n tab", text: nf.format(sans) }),
        h("div", {}, h("b", { text: "Voter pour le livre" }), h("span", { text: sans ? (sans > 1 ? "articles attendent ton vote. Le titre et l’extrait suffisent souvent." : "article attend ton vote.") : "Tous tes votes sont faits." })),
        h("span", { class: "go", text: "→" })),
      disc ? h("a", { class: "tile", href: "#/livre" },
        h("span", { class: "n tab", text: nf.format(disc) }),
        h("div", {}, h("b", { text: "À discuter avec " + o }), h("span", { text: "articles où vos votes ne sont pas d’accord." })),
        h("span", { class: "go", text: "→" }))
        : h("a", { class: "tile", href: "#/livre" },
          h("span", { class: "n tab", text: nf.format(ret.length) }),
          h("div", {}, h("b", { text: "Le livre" }), h("span", { text: "articles retenus pour l’instant (≈ " + nf.format(ret.reduce(function (t, a) { return t + pages(a.mots); }, 0)) + " pages)." })),
          h("span", { class: "go", text: "→" })),
      h("a", { class: "tile", href: "#/articles?vue=tous&pb=1" },
        h("span", { class: "n tab", text: nf.format(nProb) }),
        h("div", {}, h("b", { text: "Problèmes à régler" }), h("span", { text: "interviews à retranscrire, auteurs à retrouver… quand tu as un moment." })),
        h("span", { class: "go", text: "→" }))));
    if (q.length > 1) {
      var ul = h("ul", { class: "nextlist" });
      q.slice(1, 6).forEach(function (a) {
        ul.appendChild(h("li", {}, h("a", { href: link(a.id), onclick: openWith(q.map(function (x) { return x.id; })) }, h("b", { text: a.titre }), h("span", { text: moisAn(a.date) }))));
      });
      root.appendChild(h("section", { class: "card", style: "margin-top:16px" }, h("h2", { class: "sec", text: "Ensuite dans ta liste" }), ul));
    }
  }

  // ------------------------------------------------------------------ liste des articles
  function listParams() {
    var q = V.q;
    return {
      q: q.get("q") || "", vue: q.get("vue") || (cfg.qui ? "moi" : "tous"), etat: q.get("etat") || "tout",
      rub: q.get("rub") || "", livre: q.get("livre") || "", pb: q.get("pb") === "1",
      annee: q.get("annee") || "", auteur: q.get("auteur") || "", nom: q.get("nom") || ""
    };
  }
  function setParam(k, v) {
    var p = new URLSearchParams(V.q.toString());
    if (v) p.set(k, v); else p.delete(k);
    V.q = p;
    var str = p.toString();
    history.replaceState(null, "", "#/articles" + (str ? "?" + str : ""));
    SHOWN = PAGE;
  }
  function filterList(p, except) {
    var words = fold(p.q).split(/\s+/).filter(Boolean);
    return ALL.filter(function (a) {
      for (var i = 0; i < words.length; i++) if (a._q.indexOf(words[i]) < 0) return false;
      if (except !== "vue" && p.vue === "moi" && a.rel !== cfg.qui) return false;
      if (except !== "etat") {
        if (p.etat === "arelire" && (a.manquant || a.statut === "relu")) return false;
        if (p.etat === "relus" && a.statut !== "relu") return false;
      }
      if (p.rub && a.rubK !== p.rub) return false;
      if (p.livre === "sansmoi") { if (a.manquant || !myKey() || a[myKey()]) return false; }
      else if (p.livre && a.livre !== p.livre) return false;
      if (p.pb && !a.tags.length) return false;
      if (p.annee && a.annee !== p.annee) return false;
      if (p.auteur && (a.auteur || "(non signé)") !== p.auteur) return false;
      if (p.nom && (a.noms || []).indexOf(p.nom) < 0) return false;
      return true;
    });
  }
  var SHOWN = PAGE;
  function viewList(root) {
    var p = listParams();
    root.appendChild(h("h1", { class: "page", text: "Articles" }));
    var f = h("div", { class: "filters" });
    var search = h("input", { id: "q", type: "search", placeholder: "Chercher un titre, un artiste, un auteur…", autocomplete: "off", "aria-label": "Chercher" });
    search.value = p.q;
    var qT;
    search.addEventListener("input", function () { clearTimeout(qT); qT = setTimeout(function () { setParam("q", search.value.trim()); renderItems(); }, 150); });
    f.appendChild(h("label", { class: "search" }, svgFrom('<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="7" cy="7" r="4.8"/><path d="M10.6 10.6L14 14"/></svg>'), search));
    function seg(key, opts, val, label) {
      return h("div", { class: "seg", role: "group", "aria-label": label }, opts.map(function (o) {
        return h("button", { type: "button", "aria-pressed": val === o[0] ? "true" : "false", onclick: function () { setParam(key, o[0]); render(true); } }, o[1]);
      }));
    }
    if (cfg.qui) {
      f.appendChild(seg("vue", [["moi", "Ma liste (" + filterList(Object.assign({}, p, { vue: "moi" }), "etat").length + ")"], ["tous", "Tous (" + filterList(Object.assign({}, p, { vue: "tous" }), "etat").length + ")"]], p.vue, "Quels articles"));
    }
    f.appendChild(seg("etat", [["arelire", "À relire"], ["relus", "Relus"], ["tout", "Tout"]], p.etat, "Relecture"));
    root.appendChild(f);
    // filtres secondaires
    function sel(key, first, opts, val) {
      var el = h("select", { class: "sel" + (val ? " on" : ""), "aria-label": first }, h("option", { value: "", text: first }), opts.map(function (o) { return h("option", { value: o[0], text: o[1] }); }));
      el.value = val;
      el.addEventListener("change", function () { setParam(key, el.value); render(true); });
      return el;
    }
    var aus = {}, ys = {};
    ALL.forEach(function (a) { if (!a.manquant) { var k = a.auteur || "(non signé)"; aus[k] = (aus[k] || 0) + 1; } if (a.annee) ys[a.annee] = 1; });
    var more = h("details", { class: "more" }, h("summary", { text: "Plus de filtres" }), h("div", { class: "in" },
      sel("rub", "Toutes les rubriques", RUBS.map(function (r) { return [r.k, r.k]; }), p.rub),
      sel("livre", "Livre : tout", [["dedans", "Retenus"], ["discuter", "À discuter"], ["attente", "Il manque un vote"], ["ecarte", "Refusés"]].concat(cfg.qui ? [["sansmoi", "Sans mon vote"]] : []), p.livre),
      sel("annee", "Toutes les années", Object.keys(ys).sort().map(function (y) { return [y, y]; }), p.annee),
      sel("auteur", "Toutes les plumes", Object.keys(aus).sort(function (x, y) { return aus[y] - aus[x] || x.localeCompare(y, "fr"); }).map(function (k) { return [k, k + " (" + aus[k] + ")"]; }), p.auteur),
      h("button", { class: "btn sm " + (p.pb ? "main" : "ghost"), type: "button", text: p.pb ? "Avec un problème ✓" : "Avec un problème", onclick: function () { setParam("pb", p.pb ? "" : "1"); render(true); } })));
    if (p.rub || p.livre || p.annee || p.auteur || p.pb) more.open = true;
    root.appendChild(more);
    var act = h("div", { class: "actf", id: "actf" });
    function tag(label, key) { act.appendChild(h("span", { class: "tagx" }, label, h("button", { type: "button", "aria-label": "Retirer " + label, text: "×", onclick: function () { setParam(key, ""); render(true); } }))); }
    if (p.nom) tag("Cite " + p.nom, "nom");
    if (p.annee) tag(p.annee, "annee");
    if (p.auteur) tag("Par " + p.auteur, "auteur");
    if (p.pb) tag("Avec un problème", "pb");
    if (p.livre) tag(p.livre === "sansmoi" ? "Sans mon vote" : LIVRE[p.livre] ? LIVRE[p.livre].lab : p.livre, "livre");
    if (p.rub) tag(p.rub, "rub");
    root.appendChild(act);
    root.appendChild(h("p", { class: "count", id: "count" }));
    root.appendChild(h("div", { class: "items", id: "items" }));
    root.appendChild(h("div", { class: "more-btn", id: "moreBtn" }));
    renderItems();
  }
  function renderItems() {
    var p = listParams();
    var list = filterList(p);
    var ids = list.map(function (a) { return a.id; });
    var c = clear($("count"));
    c.appendChild(h("b", { class: "tab", text: nf.format(list.length) }));
    c.appendChild(document.createTextNode(list.length > 1 ? " articles" : " article"));
    var box = clear($("items"));
    if (!list.length) box.appendChild(h("p", { class: "empty", text: "Aucun article ne correspond." }));
    list.slice(0, SHOWN).forEach(function (a) {
      var r = rubOf(a.rub);
      var tg = h("span", { class: "tg" }, statusChip(a));
      if (a.livre && a.livre !== "attente") tg.appendChild(h("span", { class: "chip" + (a.livre === "dedans" ? " in" : "") }, h("i", { class: "sw " + LIVRE[a.livre].cls }), LIVRE[a.livre].one));
      if (a.tags.length && a.tags[0] !== "introuvable") tg.appendChild(h("span", { class: "chip" }, icon(TAGS[a.tags[0]].st, 15), TAGS[a.tags[0]].court));
      box.appendChild(h("a", { class: "it", href: link(a.id), onclick: openWith(ids) },
        icon(a.manquant ? "critical" : a.statut === "relu" ? "good" : a.statut === "cours" ? "cours" : "todo", 20),
        h("div", {}, h("div", { class: "t", text: a.titre }),
          h("div", { class: "m" }, h("span", { class: "sw", style: "background:" + r.hex + ";margin-right:6px" }), [a.rub, moisAn(a.date), "par " + (a.auteur || "?")].join(" · "))),
        tg));
    });
    var mb = clear($("moreBtn"));
    if (list.length > SHOWN) {
      mb.appendChild(h("span", { text: nf.format(SHOWN) + " sur " + nf.format(list.length) }));
      mb.appendChild(h("button", { class: "btn ghost sm", type: "button", text: "Voir " + Math.min(PAGE, list.length - SHOWN) + " de plus", onclick: function () { SHOWN += PAGE; renderItems(); } }));
    }
  }

  // ------------------------------------------------------------------ article : lire, corriger, voter
  var ED = null, DOCS = {};
  function ctxFor(a) {
    if (CTX.indexOf(a.id) >= 0) return CTX;
    var q = myQueue().map(function (x) { return x.id; });
    if (q.indexOf(a.id) >= 0) return q;
    return ALL.map(function (x) { return x.id; });
  }
  function viewArticle(root, id) {
    var a = byId(id);
    if (!a) {
      root.appendChild(h("div", { class: "empty" }, "Cet article n’existe pas. ", h("a", { class: "lnk", href: "#/articles", text: "Retour aux articles" })));
      return;
    }
    var ctx = ctxFor(a), i = ctx.indexOf(id);
    var prev = i > 0 ? ctx[i - 1] : "", next = i >= 0 && i < ctx.length - 1 ? ctx[i + 1] : "";
    ED = { id: id, state: "loading", hash: "", dirty: false, ver: 0, saving: false, conflict: false, saveErr: "", savedAt: 0, next: next, ctx: ctx };
    root.appendChild(h("div", { class: "art-top" },
      h("button", { class: "btn ghost sm", type: "button", text: "← Retour", onclick: function () { if (NAVS > 1) history.back(); else go("#/articles"); } }),
      h("span", { class: "pos tab", text: i >= 0 ? (i + 1) + " / " + ctx.length : "" }),
      h("a", { class: "navbtn", href: prev ? link(prev) : "#", "aria-label": "Article précédent", "aria-disabled": prev ? null : "true", text: "‹" }),
      h("a", { class: "navbtn", href: next ? link(next) : "#", "aria-label": "Article suivant", "aria-disabled": next ? null : "true", text: "›" })));
    var r = rubOf(a.rub);
    var paper = h("article", { class: "paper" },
      h("div", { class: "art-meta" },
        h("span", { class: "rb" }, h("span", { class: "sw", style: "background:" + r.hex }), a.rub || "—"),
        h("span", { text: moisAn(a.date) }), h("span", { text: "par " + (a.auteur || "auteur inconnu") }),
        a.mots ? h("span", { class: "tab", text: nf.format(a.mots) + " mots" }) : null),
      h("div", { id: "probs" }),
      h("div", { id: "edwrap" }));
    root.appendChild(h("div", { class: "art-grid" }, paper, h("aside", { class: "side", id: "side", "aria-label": "Relecture et vote" })));
    root.appendChild(h("div", { class: "actbar", id: "actbar" }));
    renderProbs(); renderSide(); renderEd();
    if (API.on() && cfg.qui && !a.manquant && a.rel === cfg.qui && a.statut === "") save(a, { statut: "cours" }, { noRender: true });
    loadDoc(false);
  }
  function loadDoc(force) {
    if (!ED) return;
    var id = ED.id, a = byId(id);
    if (!API.on() || a.manquant) { ED.state = a.manquant ? "manquant" : "off"; renderEd(); return; }
    var cache = DOCS[id];
    if (cache && !force) useDoc(cache);
    else { ED.state = "loading"; renderEd(); }
    API.get("doc", { id: id }).then(function (d) {
      DOCS[id] = d;
      if (!ED || ED.id !== id || ED.dirty) return;
      var changed = ED.hash && ED.hash !== d.hash;
      if (!cache || changed || force) useDoc(d);
      if (changed && !force) toast("Texte mis à jour depuis le Google Doc.");
      prefetch(ED.next);
    }).catch(function (e) {
      if (!ED || ED.id !== id) return;
      if (cache && !force) return;
      ED.state = "err"; ED.err = e.message; renderEd();
    });
  }
  function prefetch(id) {
    if (!id || DOCS[id] || !API.on()) return;
    var a = byId(id);
    if (!a || a.manquant) return;
    API.get("doc", { id: id }).then(function (d) { DOCS[id] = d; }).catch(function () {});
  }
  function useDoc(d) {
    ED.hash = d.hash; ED.blocs = d.blocs; ED.state = d.complexe ? "ro" : "ok"; ED.dirty = false; ED.conflict = false;
    renderEd(); renderSave();
  }
  function leaveArticle() {
    if (!ED) return;
    var e = ED;
    ED = null;
    if (e.dirty && e.state === "ok") {
      var el = $("ed");
      var blocs = el ? htmlToBlocs(el) : null;
      if (!blocs || !blocs.length || JSON.stringify(blocs) === e.base) return;
      var a = byId(e.id);
      API.post({ action: "ecrireDoc", id: e.id, blocs: blocs, hash: e.hash }).then(function (d) {
        DOCS[e.id] = { blocs: blocs, hash: d.hash, complexe: false };
        if (d.ligne && a) { applyRow(a, d.ligne); prepare(a); }
        toast("Corrections de « " + (a ? a.titre : "l’article") + " » enregistrées.");
      }).catch(function (er) {
        toast("Les corrections de « " + (a ? a.titre : "l’article") + " » ne sont pas enregistrées : " + (er.message === "CONFLIT" ? "le Doc a changé entre-temps." : er.message), { err: true, ms: 10000, action: { label: "Y retourner", fn: function () { go(link(e.id)); } } });
      });
    }
  }

  // --- le texte : blocs <-> éditeur
  function runsTo(el, runs) {
    (runs || []).forEach(function (r) {
      var parts = String(r[0]).split(/\u000b|\r|\n/);
      var node = document.createDocumentFragment();
      parts.forEach(function (pt, i) { if (i) node.appendChild(h("br")); if (pt) node.appendChild(document.createTextNode(pt)); });
      var f = r[1] || "";
      if (f.indexOf("i") >= 0) { var ii = h("i"); ii.appendChild(node); node = ii; }
      if (f.indexOf("b") >= 0) { var bb = h("b"); bb.appendChild(node); node = bb; }
      if (r[2]) { var aa = h("a", { href: r[2], target: "_blank", rel: "noopener" }); aa.appendChild(node); node = aa; }
      el.appendChild(node);
    });
  }
  function blocsToDom(blocs, root) {
    var ul = null;
    blocs.forEach(function (b) {
      if (b.t === "li") {
        if (!ul) { ul = h("ul"); root.appendChild(ul); }
        var li = h("li"); runsTo(li, b.r); ul.appendChild(li);
        return;
      }
      ul = null;
      var tag = { h1: "h1", h2: "h2", h3: "h3", q: "blockquote" }[b.t] || "p";
      var el = h(tag, { class: [b.t === "sig" ? "sig" : b.t === "n" ? "note" : "", b.c ? "c" : ""].join(" ").trim() || null });
      runsTo(el, b.r);
      root.appendChild(el);
    });
  }
  var BLOCK = { P: 1, DIV: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, BLOCKQUOTE: 1, UL: 1, OL: 1, LI: 1, SECTION: 1, ARTICLE: 1 };
  function nbsp(t) {
    // on garde les espaces insécables de la typographie française, on retire les autres
    return t.replace(/ /g, function (m, off, str) {
      var av = str[off - 1], ap = str[off + 1];
      return av === "«" || ap === "»" || /[;:!?%€]/.test(ap || "") ? m : " ";
    }).replace(/​/g, "");
  }
  function htmlToBlocs(root) {
    var out = [];
    function collect(node, st, runs) {
      node.childNodes.forEach(function (n) {
        if (n.nodeType === 3) { pushRun(runs, n.nodeValue.replace(/[\r\n]+/g, " "), st); return; }
        if (n.nodeType !== 1) return;
        var tg = n.tagName;
        if (tg === "BR") { pushRun(runs, "\n", st); return; }
        var fw = n.style && n.style.fontWeight, fs = n.style && n.style.fontStyle;
        var s2 = {
          b: st.b || tg === "B" || tg === "STRONG" || fw === "bold" || +fw >= 600,
          i: st.i || tg === "I" || tg === "EM" || fs === "italic",
          a: tg === "A" ? (n.getAttribute("href") || "") : st.a
        };
        if (BLOCK[tg]) pushRun(runs, " ", st);
        collect(n, s2, runs);
      });
    }
    function pushRun(runs, text, st) {
      if (!text) return;
      var f = (st.b ? "b" : "") + (st.i ? "i" : ""), a = /^https?:\/\//.test(st.a || "") ? st.a : "";
      var last = runs[runs.length - 1];
      if (last && last[1] === f && last[2] === a) last[0] += text; else runs.push([text, f, a]);
    }
    function clean(runs) {
      runs.forEach(function (r) { r[0] = nbsp(r[0]).replace(/[ \t]+/g, " "); });
      if (runs.length) { runs[0][0] = runs[0][0].replace(/^[\s\n]+/, ""); var l = runs[runs.length - 1]; l[0] = l[0].replace(/[\s\n]+$/, ""); }
      return runs.filter(function (r) { return r[0].length; });
    }
    function block(el, t, extra) {
      var runs = clean(collectRuns(el));
      if (!runs.length) return;
      var b = { t: t, r: runs };
      if (extra) Object.assign(b, extra);
      out.push(b);
    }
    function collectRuns(el) { var runs = []; collect(el, { b: false, i: false, a: "" }, runs); return runs; }
    function walk(parent) {
      var inline = null;
      function flushInline() { if (inline) { block(inline, "p"); inline = null; } }
      parent.childNodes.forEach(function (n) {
        if (n.nodeType === 1 && BLOCK[n.tagName]) {
          flushInline();
          var tg = n.tagName, cls = n.className || "";
          var hasBlockChild = Array.prototype.some.call(n.children, function (c) { return BLOCK[c.tagName] && c.tagName !== "LI"; });
          if ((tg === "UL" || tg === "OL")) { Array.prototype.forEach.call(n.children, function (li) { block(li, "li"); }); return; }
          if (hasBlockChild && tg === "BLOCKQUOTE") { Array.prototype.forEach.call(n.children, function (ch) { block(ch, "q"); }); return; }
          if (hasBlockChild && (tg === "DIV" || tg === "SECTION" || tg === "ARTICLE")) { walk(n); return; }
          var c = /\bc\b/.test(cls) ? { c: 1 } : null;
          if (tg === "H1") block(n, "h1", c);
          else if (tg === "H2") block(n, "h2", c);
          else if (tg === "H3" || tg === "H4" || tg === "H5" || tg === "H6") block(n, "h3", c);
          else if (tg === "BLOCKQUOTE") block(n, "q");
          else if (tg === "LI") block(n, "li");
          else if (/\bsig\b/.test(cls)) block(n, "sig");
          else if (/\bnote\b/.test(cls)) block(n, "n");
          else block(n, "p", c);
        } else {
          if (n.nodeType === 3 && !n.nodeValue.trim() && !inline) return;
          if (!inline) inline = h("span");
          inline.appendChild(n.cloneNode(true));
        }
      });
      flushInline();
    }
    walk(root);
    return out;
  }
  function quoteCount(el) { return (el.textContent.match(/["“”]/g) || []).length; }
  function fixQuotes(root) {
    var n = 0;
    root.querySelectorAll("p,h1,h2,h3,blockquote,li").forEach(function (bl) {
      var open = false;
      var tw = document.createTreeWalker(bl, NodeFilter.SHOW_TEXT);
      var node;
      while ((node = tw.nextNode())) {
        var v = node.nodeValue, out = "";
        for (var i = 0; i < v.length; i++) {
          var ch = v[i];
          if (ch === "“" || (ch === '"' && !open)) { out += "« "; open = true; n++; }
          else if (ch === "”" || (ch === '"' && open)) { out += " »"; open = false; n++; }
          else out += ch;
        }
        out = out.replace(/« [  ]+/g, "« ").replace(/[  ]+ »/g, " »");
        if (out !== v) node.nodeValue = out;
      }
    });
    return n;
  }
  function renderEd() {
    var box = $("edwrap");
    if (!box || !ED) return;
    clear(box);
    var a = byId(ED.id);
    if (ED.state === "manquant") {
      box.appendChild(h("div", { class: "msg", text: "Cet article n’a jamais été archivé : il n’y a pas de texte à relire." }));
      return;
    }
    if (ED.state === "off") {
      box.appendChild(h("div", { class: "msg" }, "Pour lire et corriger le texte ici, il faut d’abord brancher le site sur Google (une fois, par Amélien).",
        h("div", { class: "acts" }, h("button", { class: "btn main sm", type: "button", text: "Brancher le site", onclick: function () { openSettings(true); } }))));
      box.appendChild(h("h2", { style: "font-size:26px;margin:18px 0 8px", text: a.titre }));
      if (a.extrait) box.appendChild(h("p", { class: "extract", text: a.extrait + (a.extrait.length >= 318 ? "…" : "") }));
      return;
    }
    if (ED.state === "loading") {
      box.appendChild(h("p", { class: "small", style: "margin:4px 0 14px", text: "Chargement du texte depuis le Google Doc…" }));
      var sk = h("div", { class: "skel" });
      [60, 100, 96, 100, 88, 100, 70].forEach(function (w) { sk.appendChild(h("i", { style: "width:" + w + "%" })); });
      box.appendChild(sk);
      return;
    }
    if (ED.state === "err") {
      var m = ED.err, txt, acts = [];
      if (m === "PAS_DE_DOC") {
        txt = "Le site n’a pas encore trouvé le Google Doc de cet article dans le dossier Drive.";
        acts.push(h("button", { class: "btn main sm", type: "button", text: "Chercher les Docs maintenant", onclick: function () { liensNow().then(function () { loadDoc(true); }); } }));
        acts.push(h("a", { class: "btn ghost sm", href: "https://drive.google.com/drive/search?q=" + encodeURIComponent('"' + (a.doc || a.titre) + '"'), target: "_blank", rel: "noopener" }, iLink(), "Chercher dans Drive"));
      } else if (m === "DOCX") {
        txt = "Ce fichier est resté au format Word dans le Drive, le site ne peut pas l’écrire. Ouvre-le, puis Fichier → Enregistrer au format Google Docs. Ensuite, clique « Chercher les Docs » dans les Réglages.";
        if (a.gdoc) acts.push(h("a", { class: "btn ghost sm", href: a.gdoc, target: "_blank", rel: "noopener" }, iLink(), "Ouvrir le fichier"));
      } else {
        txt = "Impossible de lire le Google Doc : " + m;
        acts.push(h("button", { class: "btn ghost sm", type: "button", text: "Réessayer", onclick: function () { loadDoc(true); } }));
      }
      box.appendChild(h("div", { class: "msg" }, txt, h("div", { class: "acts" }, acts)));
      return;
    }
    if (ED.state === "ro") {
      box.appendChild(h("div", { class: "msg" }, "Ce Doc contient une image ou un tableau. Pour ne rien casser, le site le montre sans le modifier : corrige-le dans Google Docs.",
        h("div", { class: "acts" }, a.gdoc ? h("a", { class: "btn main sm", href: a.gdoc, target: "_blank", rel: "noopener" }, iLink(), "Ouvrir dans Google Docs") : null)));
      var ro = h("div", { class: "ed" });
      blocsToDom(ED.blocs || [], ro);
      box.appendChild(ro);
      return;
    }
    // l'éditeur
    var ed = h("div", { class: "ed", id: "ed", contenteditable: "true", spellcheck: "true", lang: "fr", role: "textbox", "aria-multiline": "true", "aria-label": "Texte de l’article" });
    blocsToDom(ED.blocs || [], ed);
    var qBtn = h("button", { type: "button", title: "Remplace les guillemets anglais par « »" });
    function updQ() {
      var n = quoteCount(ed);
      clear(qBtn).appendChild(document.createTextNode(n ? "« » Corriger " + n + " guillemet" + (n > 1 ? "s" : "") : "« » Guillemets OK"));
      qBtn.classList.toggle("warnq", n > 0);
    }
    qBtn.addEventListener("pointerdown", function (e) { e.preventDefault(); });
    qBtn.addEventListener("click", function () { var n = fixQuotes(ed); if (n) { markDirty(); toast(plur(n, "guillemet") + " corrigé" + (n > 1 ? "s" : "") + "."); } updQ(); });
    function tbBtn(label, cls, title, fn) {
      var b = h("button", { type: "button", class: cls || null, title: title, text: label });
      b.addEventListener("pointerdown", function (e) { e.preventDefault(); });
      b.addEventListener("click", function () { ed.focus(); fn(); markDirty(); updQ(); });
      return b;
    }
    function ex(c, v) { document.execCommand(c, false, v); }
    var tb = h("div", { class: "tb", role: "toolbar", "aria-label": "Mise en forme" },
      tbBtn("Gras", "b", "Gras : noms d’artistes, de groupes, de labels (Cmd+B)", function () { ex("bold"); }),
      tbBtn("Italique", "i", "Italique : titres d’albums, de morceaux, de films… (Cmd+I)", function () { ex("italic"); }),
      h("span", { class: "sep" }),
      tbBtn("Intertitre", "", "Transformer le paragraphe en intertitre", function () { ex("formatBlock", "<h2>"); }),
      tbBtn("Citation", "", "Mettre une phrase en avant", function () { ex("formatBlock", "<blockquote>"); }),
      tbBtn("Texte normal", "", "Revenir à un paragraphe normal", function () { ex("formatBlock", "<p>"); }),
      tbBtn("Lien", "", "Ajouter un lien sur le texte sélectionné", function () {
        var sel = window.getSelection(), rg = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
        if (!rg || rg.collapsed) { toast("Sélectionne d’abord les mots à transformer en lien."); return; }
        var u = window.prompt("Adresse du lien :", "https://");
        ed.focus(); sel.removeAllRanges(); sel.addRange(rg);
        if (u && /^https?:\/\/.+/.test(u)) ex("createLink", u);
      }),
      h("span", { class: "sep" }), qBtn,
      h("span", { class: "sep" }),
      tbBtn("Annuler", "", "Annuler la dernière modification (Cmd+Z)", function () { ex("undo"); }));
    try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch (e) { /* ancien navigateur */ }
    ed.addEventListener("input", function () { markDirty(); clearTimeout(ed._q); ed._q = setTimeout(updQ, 400); });
    ed.addEventListener("keydown", function (e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "S")) { e.preventDefault(); saveDoc(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '"') {
        e.preventDefault();
        var sel = window.getSelection(), before = "";
        if (sel.rangeCount) { var r0 = sel.getRangeAt(0); if (r0.startContainer.nodeType === 3) before = r0.startContainer.nodeValue.slice(0, r0.startOffset).slice(-1); }
        ex("insertText", !before || /[\s(\[« —–-]/.test(before) ? "« " : " »");
      } else if (e.key === "'") { e.preventDefault(); ex("insertText", "’"); }
    });
    ed.addEventListener("paste", function (e) {
      var t = (e.clipboardData || window.clipboardData).getData("text/plain");
      if (!t) return;
      e.preventDefault();
      var paras = t.replace(/\r/g, "").split(/\n\s*\n/);
      if (paras.length === 1) ex("insertText", t.replace(/\n/g, " "));
      else ex("insertHTML", paras.map(function (p) { return "<p>" + esc(p.trim()).replace(/\n/g, "<br>") + "</p>"; }).join(""));
    });
    box.appendChild(tb);
    box.appendChild(ed);
    ED.base = JSON.stringify(htmlToBlocs(ed));
    updQ();
  }
  function markDirty() {
    if (!ED) return;
    if (!ED.dirty) { ED.dirty = true; renderSave(); }
    ED.ver++;
    ED.saveErr = "";
    clearTimeout(ED.auto);
    ED.auto = setTimeout(function () { saveDoc(); }, 8000);
  }
  function saveDoc(force) {
    if (!ED || ED.state !== "ok") return Promise.resolve(false);
    if (ED.saving) { ED.again = true; return ED.saving; }
    if (!ED.dirty && !force) return Promise.resolve(true);
    if (!cfg.qui) { askWho(function () { saveDoc(force); }); return Promise.resolve(false); }
    var el = $("ed"), blocs = htmlToBlocs(el), json = JSON.stringify(blocs);
    if (!blocs.length) { toast("Le texte est vide : rien n’a été enregistré.", { err: true }); return Promise.resolve(false); }
    if (json === ED.base && !force) { ED.dirty = false; clearTimeout(ED.auto); renderSave(); return Promise.resolve(true); }
    var e = ED, ver = e.ver, id = e.id;
    clearTimeout(e.auto);
    e.saving = API.post({ action: "ecrireDoc", id: id, blocs: blocs, hash: e.hash, force: !!force }).then(function (d) {
      e.hash = d.hash; e.conflict = false; e.saveErr = ""; e.savedAt = Date.now(); e.base = json;
      if (e.ver === ver) e.dirty = false;
      DOCS[id] = { blocs: blocs, hash: d.hash, complexe: false };
      var a = byId(id);
      if (d.ligne && a) { applyRow(a, d.ligne); prepare(a); }
      return true;
    }).catch(function (er) {
      if (er.message === "CONFLIT") e.conflict = true;
      else if (er.message === "COMPLEXE") { e.state = "ro"; renderEd(); }
      else e.saveErr = er.message;
      return false;
    }).finally(function () {
      e.saving = false;
      if (ED === e) { renderSave(); if (e.again) { e.again = false; saveDoc(); } }
    });
    renderSave();
    return e.saving;
  }
  function saveLine(compact) {
    var cls = "save", ic = null, txt = "", act = null;
    if (!ED || ED.state === "loading") { txt = compact ? "" : "Chargement…"; }
    else if (ED.state !== "ok") { txt = ED.state === "ro" ? "Lecture seule" : ""; }
    else if (ED.saving) { ic = icon("cours", 18); txt = "Enregistrement dans le Doc…"; }
    else if (ED.conflict) { cls += " err"; ic = icon("warn", 18); txt = "Le Doc a changé ailleurs"; }
    else if (ED.saveErr) { cls += " err"; ic = icon("critical", 18); txt = "Pas enregistré"; act = h("button", { class: "lnk", type: "button", text: "Réessayer", onclick: function () { saveDoc(); } }); }
    else if (ED.dirty) { cls += " dirty"; ic = icon("warn", 18); txt = compact ? "Pas encore enregistré" : "Modifications pas encore enregistrées"; act = h("button", { class: "btn main sm", type: "button", text: "Enregistrer", onclick: function () { saveDoc(); } }); }
    else { ic = icon("good", 18); txt = ED.savedAt ? "Enregistré dans le Doc " + relTime(ED.savedAt) : (compact ? "Texte à jour" : "Le texte est à jour avec le Google Doc"); }
    return h("div", { class: cls }, ic, h("span", { text: txt }), act);
  }
  function renderSave() {
    var s1 = $("saveState");
    if (s1) { clear(s1).appendChild(saveLine(false)); renderConflict(); }
    renderActbar();
  }
  function renderConflict() {
    var c = $("conflict");
    if (!c) return;
    clear(c);
    if (!ED || !ED.conflict) { c.hidden = true; return; }
    c.hidden = false;
    c.appendChild(h("div", { class: "conf" },
      "Quelqu’un a modifié ce texte (ici ou dans Google Docs) depuis que tu l’as ouvert. Que veux-tu garder ?",
      h("div", { class: "acts" },
        h("button", { class: "btn ghost sm", type: "button", text: "Recharger son texte", onclick: function () { ED.dirty = false; ED.conflict = false; loadDoc(true); } }),
        h("button", { class: "btn main sm", type: "button", text: "Garder ma version", onclick: function () { saveDoc(true); } }))));
  }
  function renderActbar() {
    var bar = $("actbar");
    if (!bar || !ED) return;
    var a = byId(ED.id);
    clear(bar);
    bar.appendChild(saveLine(true));
    if (a.manquant) return;
    if (a.statut !== "relu") bar.appendChild(h("button", { class: "btn good", type: "button", onclick: onRelu }, iCheck(), "C’est relu"));
    else if (ED.next) bar.appendChild(h("a", { class: "btn main", href: link(ED.next) }, "Suivant →"));
  }
  function onRelu() {
    if (!ED) return;
    var id = ED.id, a = byId(id);
    if (!API.on()) { needConnect(); return; }
    var p = ED.dirty ? saveDoc() : Promise.resolve(true);
    p.then(function (ok) {
      if (ok === false && ED && ED.id === id && ED.dirty) { toast("Le texte n’est pas enregistré : règle ça avant de dire que c’est relu.", { err: true, ms: 6000 }); return; }
      var prev = a.statut;
      save(a, { statut: "relu" }, { msg: "Relu ✓", undo: function () { save(a, { statut: prev || "cours" }); } });
      if (ED && ED.id === id && myKey() && !a[myKey()]) {
        ED.askVote = true; renderSide();
        var vb = $("voteBox");
        if (vb && window.innerWidth < 980) vb.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }
  function renderProbs() {
    var box = $("probs");
    if (!box || !ED || busyIn(box)) return;
    var a = byId(ED.id);
    clear(box);
    a.tags.forEach(function (t) {
      var m = TAGS[t];
      var txt = m.txt;
      if (t === "autre") txt += " " + esc(a.alertes.filter(function (r) { return tagOf(r, a) === "autre"; }).join(" ; "));
      var acts = h("div", { class: "acts" });
      if (API.on() && t === "auteur") {
        var inp = h("input", { class: "inp", type: "text", placeholder: "Prénom ou pseudo de l’auteur", "aria-label": "Auteur de l’article" });
        var ok = function () {
          var v = inp.value.trim();
          if (v) save(a, { auteur: v, alertes: a.alertes.filter(function (r) { return tagOf(r, a) !== "auteur"; }) }, { msg: "Auteur : " + v });
        };
        inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); ok(); } });
        acts.appendChild(inp);
        acts.appendChild(h("button", { class: "btn main sm", type: "button", text: "Enregistrer", onclick: ok }));
      } else if (API.on() && m.regler !== false) {
        if (t === "v2020" && a.src) acts.appendChild(h("a", { class: "btn ghost sm", href: a.src, target: "_blank", rel: "noopener" }, iLink(), "Voir l’archive"));
        acts.appendChild(h("button", { class: "btn ghost sm", type: "button", onclick: function () {
          var avant = a.alertes.slice();
          save(a, { alertes: a.alertes.filter(function (r) { return tagOf(r, a) !== t; }) }, { msg: "Problème réglé ✓", undo: function () { save(a, { alertes: avant }); } });
        } }, iCheck(), "C’est réglé"));
      }
      box.appendChild(h("div", { class: "prob " + m.st }, icon(m.st, 20), h("div", {}, h("div", { html: txt }), acts.childNodes.length ? acts : null)));
    });
  }
  function busyIn(box) {
    var ae = document.activeElement;
    return !!(ae && box.contains(ae) && /^(TEXTAREA|INPUT|SELECT)$/.test(ae.tagName));
  }
  function renderSide() {
    var box = $("side");
    if (!box || !ED) return;
    if (busyIn(box)) { renderSave(); return; }
    var a = byId(ED.id), k = myKey(), ok = otherKey(), o = cfg.qui ? other(cfg.qui) : "";
    clear(box);
    // relecture
    var who = a.rel ? (a.rel === cfg.qui ? "toi" : a.rel) : "";
    var st;
    if (a.manquant) st = h("div", { class: "st" }, icon("critical", 22), h("div", {}, "Jamais archivé", h("small", { text: "Rien à relire." })));
    else if (a.statut === "relu") st = h("div", { class: "st" }, icon("good", 22), h("div", {}, "Relu" + (a.rel ? " par " + a.rel : ""), h("small", { text: a.reluLe ? relTime(a.reluLe) : "" })));
    else if (a.statut === "cours") st = h("div", { class: "st" }, icon("cours", 22), h("div", {}, "En cours de relecture", h("small", { text: who ? "par " + who : "" })));
    else st = h("div", { class: "st" }, icon("todo", 22), h("div", {}, "À relire", h("small", { text: who ? "par " + who : "Personne n’est désigné" })));
    var b1 = h("section", { class: "box" }, h("h3", { text: "La relecture" }), st);
    if (!a.manquant) {
      if (a.statut !== "relu") b1.appendChild(h("button", { class: "btn good big wide", type: "button", onclick: onRelu }, iCheck(), "C’est relu"));
      else {
        if (ED.next) b1.appendChild(h("a", { class: "btn main big wide", href: link(ED.next) }, "Article suivant →"));
        b1.appendChild(h("button", { class: "lnk", type: "button", style: "margin-top:10px", text: "Remettre à relire", onclick: function () { save(a, { statut: "cours" }, { msg: "Remis à relire" }); } }));
      }
      b1.appendChild(h("div", { id: "saveState", style: "margin-top:12px" }));
      b1.appendChild(h("div", { id: "conflict", hidden: true }));
    }
    box.appendChild(b1);
    // livre
    if (!a.manquant) {
      var b2 = h("section", { class: "box" + (ED.askVote && k && !a[k] ? " hl" : ""), id: "voteBox" }, h("h3", { text: "Pour le livre" }));
      if (k) {
        b2.appendChild(h("p", { style: "margin-bottom:10px", text: "Tu le veux dans le livre ?" }));
        b2.appendChild(voteSeg(a));
        b2.appendChild(h("p", { class: "small", style: "margin-top:10px", text: o + " : " + LV_LAB[a[ok]] + (a.livre && a.livre !== "attente" ? " → " + LIVRE[a.livre].one.toLowerCase() : "") }));
      } else {
        b2.appendChild(h("p", { text: "Florian : " + LV_LAB[a.livreF] + " · Amélien : " + LV_LAB[a.livreA] }));
        b2.appendChild(h("button", { class: "lnk", type: "button", style: "margin-top:8px", text: "Dis qui tu es pour voter", onclick: function () { askWho(); } }));
      }
      box.appendChild(b2);
    }
    // notes
    var b3 = h("section", { class: "box" }, h("h3", { text: "Notes pour vous deux" }));
    if (API.on()) {
      var ta = h("textarea", { class: "notes", placeholder: "Une remarque pour " + (o || "l’autre") + ", une idée pour le livre…", "aria-label": "Notes" });
      ta.value = a.notes || "";
      ta.addEventListener("blur", function () { if (ta.value.trim() !== (a.notes || "").trim()) save(a, { notes: ta.value.trim() }, { msg: "Note enregistrée", noRender: true }); });
      b3.appendChild(ta);
    } else b3.appendChild(h("p", { text: a.notes || "Aucune note." }));
    box.appendChild(b3);
    // plus
    var plus = h("details", { class: "box" }, h("summary", { text: "Plus d’options" }));
    var links = h("div", { class: "links" });
    if (a.gdoc) links.appendChild(h("a", { class: "lnk", href: a.gdoc, target: "_blank", rel: "noopener", text: "Ouvrir dans Google Docs" }));
    if (a.src) links.appendChild(h("a", { class: "lnk", href: a.src, target: "_blank", rel: "noopener", text: a.manquant ? "Tenter la Wayback Machine" : "Voir l’archive d’origine" }));
    if (API.on() && !a.manquant) {
      var sel = h("select", { class: "sel", "aria-label": "Relecteur" }, [["", "Pas de relecteur"], ["Florian", "Relu par : Florian"], ["Amélien", "Relu par : Amélien"]].map(function (x) { return h("option", { value: x[0], text: x[1] }); }));
      sel.value = a.rel || "";
      sel.addEventListener("change", function () { var prev = a.rel; save(a, { rel: sel.value }, { msg: sel.value ? "Confié à " + sel.value : "Plus de relecteur", undo: function () { save(a, { rel: prev }); } }); });
      links.appendChild(h("p", { class: "small", style: "margin-top:6px", text: "Changer de relecteur :" }));
      links.appendChild(sel);
    }
    var faits = [a.mots ? nf.format(a.mots) + " mots, ≈ " + plur(pages(a.mots), "page") : "", a.cit ? plur(a.cit, "citation") : "", a.vid ? plur(a.vid, "vidéo") : "", a.maj && a.majPar ? "Dernière action : " + a.majPar + ", " + relTime(a.maj) : ""].filter(Boolean);
    if (faits.length) links.appendChild(h("p", { class: "small", style: "margin-top:6px", text: faits.join(" · ") }));
    plus.appendChild(links);
    box.appendChild(plus);
    // règles
    box.appendChild(h("details", { class: "box" }, h("summary", { text: "Les règles Cul7ure" }),
      h("ul", { class: "rules", html: "<li><b>Gras</b> : artistes, groupes, collectifs, labels.</li><li><i>Italique</i> : titres d’albums, de morceaux, de films, de livres.</li><li>Guillemets français « » (jamais “ ”) : tape \" et le site les met tout seul.</li><li>Des <b>intertitres</b> pour découper, des <b>citations</b> pour les phrases fortes.</li><li>Chronique : pas de track-by-track. Portrait : un vrai angle. Dossier : un sujet précis. Parenthèse : plus court, plus léger.</li>" })));
    renderSave();
  }

  // ------------------------------------------------------------------ le livre
  function viewLivre(root) {
    var A = arts(), k = myKey();
    var c = { dedans: [], discuter: [], attente: [], ecarte: [] };
    A.forEach(function (a) { if (c[a.livre]) c[a.livre].push(a); });
    var pg = c.dedans.reduce(function (t, a) { return t + pages(a.mots); }, 0);
    root.appendChild(h("h1", { class: "page", text: "Le livre" }));
    root.appendChild(h("p", { class: "lead", html: "Chacun vote oui, peut-être ou non pour chaque article. Il est <b>retenu</b> quand vous dites oui tous les deux, <b>refusé</b> quand c’est non pour les deux, et <b>à discuter</b> si vos votes diffèrent. Le sommaire suit l’ordre de parution." }));
    var subs = { dedans: "oui + oui · ≈ " + nf.format(pg) + " pages", discuter: "vos votes diffèrent", attente: k ? nf.format(A.filter(function (a) { return !a[k]; }).length) + " sans ton vote" : "l’un de vous n’a pas voté", ecarte: "non + non" };
    var bs = h("div", { class: "bstats" });
    ["dedans", "discuter", "attente", "ecarte"].forEach(function (key) {
      bs.appendChild(h("a", { class: "bstat", href: "#/articles?vue=tous&livre=" + key },
        h("div", { class: "n tab" }, h("i", { class: LIVRE[key].cls }), nf.format(c[key].length)), h("div", { class: "x" }, h("b", { text: LIVRE[key].lab }), " · " + subs[key])));
    });
    root.appendChild(bs);
    if (k) {
      var sans = A.filter(function (a) { return !a[k]; }).length;
      if (sans) root.appendChild(h("div", { style: "margin:-4px 0 18px" }, h("button", { class: "btn main", type: "button", onclick: openTri }, "Voter (" + nf.format(sans) + " sans ton vote)")));
    }
    var dl = h("ul", { class: "blist" });
    if (!c.discuter.length) dl.appendChild(h("li", {}, h("p", { class: "small", text: "Aucun désaccord pour l’instant." })));
    var dIds = c.discuter.map(function (a) { return a.id; });
    c.discuter.forEach(function (a) {
      dl.appendChild(h("li", {},
        h("a", { href: link(a.id), onclick: openWith(dIds), text: a.titre }),
        h("div", { class: "bm", text: moisAn(a.date) + " · Florian : " + LV_LAB[a.livreF] + " · Amélien : " + LV_LAB[a.livreA] }),
        k && API.on() ? voteSeg(a) : null));
    });
    var toc = h("ul", { class: "toc" });
    if (!c.dedans.length) toc.appendChild(h("li", {}, h("p", { class: "small", text: "Le sommaire se remplit quand vous votez oui tous les deux." })));
    var page = 1, annee = null, parAn = {}, tIds = c.dedans.map(function (a) { return a.id; });
    c.dedans.forEach(function (a) { parAn[a.annee] = (parAn[a.annee] || 0) + 1; });
    c.dedans.forEach(function (a) {
      if (a.annee !== annee) { annee = a.annee; toc.appendChild(h("li", { class: "ty" }, annee || "Sans date", h("span", { text: plur(parAn[a.annee], "article") }))); }
      toc.appendChild(h("li", { class: "itm" }, h("a", { href: link(a.id), onclick: openWith(tIds) }, h("b", { text: a.titre }), " · " + (a.auteur || "?")), h("span", { text: "p. " + page })));
      page += pages(a.mots);
    });
    root.appendChild(h("div", { class: "bcols" },
      h("section", { class: "card" }, h("h2", { class: "sec", text: "À discuter" }), h("p", { class: "hint", text: "Vos votes diffèrent : à trancher ensemble." }), dl),
      h("section", { class: "card" }, h("h2", { class: "sec", text: "Le sommaire" }), h("p", { class: "hint", text: "Les articles retenus, dans l’ordre de parution, avec une estimation des pages." }), toc)));
  }

  // ------------------------------------------------------------------ chiffres
  var tip = $("tip");
  function showTip(x, y, title, rows) {
    clear(tip);
    tip.appendChild(h("div", { class: "tt", text: title }));
    rows.forEach(function (r) { tip.appendChild(h("div", { class: "tr" }, r.c ? h("i", { style: "background:" + r.c }) : null, h("b", { text: r.v }), h("span", { text: r.l }))); });
    tip.classList.add("on");
    var w = tip.offsetWidth, hh = tip.offsetHeight;
    tip.style.left = Math.min(window.innerWidth - w - 10, Math.max(10, x + 14)) + "px";
    tip.style.top = (y - hh - 12 < 8 ? y + 16 : y - hh - 12) + "px";
  }
  function hideTip() { tip.classList.remove("on"); }
  function viewChiffres(root) {
    var A = arts();
    var mots = A.reduce(function (t, a) { return t + (a.mots || 0); }, 0);
    var plumes = {};
    A.forEach(function (a) { if (a.auteur) plumes[a.auteur] = 1; });
    var relu = A.filter(function (a) { return a.statut === "relu"; }).length;
    root.appendChild(h("h1", { class: "page", text: "Les archives en chiffres" }));
    root.appendChild(h("p", { class: "lead", text: "Pour le plaisir de fouiller. Un clic sur un graphique ouvre les articles concernés." }));
    var k = h("div", { class: "kpis" });
    [["Articles", nf.format(A.length), "+ " + (ALL.length - A.length) + " jamais archivés"], ["Mots", nfc.format(mots), "≈ " + nf.format(Math.round(mots / MOTS_PAR_PAGE)) + " pages si on gardait tout"],
      ["Plumes", nf.format(Object.keys(plumes).length), "auteurs et autrices"], ["Relus", nf.format(relu) + " / " + nf.format(A.length), pct(relu, A.length) + " % de la relecture"]]
      .forEach(function (x) { k.appendChild(h("div", { class: "kpi" }, h("div", { class: "l", text: x[0] }), h("div", { class: "v tab", text: x[1] }), h("div", { class: "d", text: x[2] }))); });
    root.appendChild(k);
    var g = h("div", { class: "grid2" });
    var t1 = h("div", { class: "chart" }), lg1 = h("div", { class: "legend" });
    g.appendChild(h("section", { class: "card s8" }, h("h2", { class: "sec", text: "Publications dans le temps" }), h("p", { class: "hint", text: "Articles par trimestre, par rubrique." }), t1, lg1));
    var seg = h("div", { class: "segbar" }), lg2 = h("div", { class: "legend" });
    g.appendChild(h("section", { class: "card s4" }, h("h2", { class: "sec", text: "Rubriques" }), h("p", { class: "hint", text: "La part de chaque rubrique." }), seg, lg2));
    var au = h("div", { class: "hbars" });
    g.appendChild(h("section", { class: "card s6" }, h("h2", { class: "sec", text: "Les plumes" }), h("p", { class: "hint", text: "Articles par auteur ou autrice." }), au));
    var nm = h("div", { class: "names" });
    g.appendChild(h("section", { class: "card s6" }, h("h2", { class: "sec", text: "Les noms qui reviennent" }), h("p", { class: "hint", text: "Artistes, groupes et labels écrits en gras, comptés une fois par article." }), nm));
    root.appendChild(g);
    requestAnimationFrame(function () { drawTimeline(t1, lg1, A); drawRubs(seg, lg2, A); drawAuthors(au, A); drawNames(nm, A); });
  }
  function toList(p) { var q = new URLSearchParams(Object.assign({ vue: "tous" }, p)); go("#/articles?" + q.toString()); }
  function quarters(A) {
    var ks = A.filter(function (a) { return a.trim; }).map(function (a) { return a.trim; }).sort();
    if (!ks.length) return [];
    var y0 = +ks[0].slice(0, 4), q0 = +ks[0].slice(-1), y1 = +ks[ks.length - 1].slice(0, 4), q1 = +ks[ks.length - 1].slice(-1), out = [];
    for (var y = y0; y <= y1; y++) for (var q = 1; q <= 4; q++) { if ((y === y0 && q < q0) || (y === y1 && q > q1)) continue; out.push(y + "-T" + q); }
    return out;
  }
  function drawTimeline(box, lg, A) {
    var qs = quarters(A), data = {};
    qs.forEach(function (q) { data[q] = {}; });
    A.forEach(function (a) { if (data[a.trim]) data[a.trim][a.rubK] = (data[a.trim][a.rubK] || 0) + 1; });
    var series = RUBS.concat(A.some(function (a) { return a.rubK === AUTRE.k; }) ? [AUTRE] : []);
    var W = Math.max(320, box.clientWidth || 700), H = 230, padL = 30, padR = 6, padT = 10, padB = 26, pw = W - padL - padR, ph = H - padT - padB, max = 0;
    qs.forEach(function (q) { var t = 0; for (var k in data[q]) t += data[q][k]; if (t > max) max = t; });
    var ymax = max <= 5 ? 5 : [10, 15, 20, 25, 30, 40, 50].filter(function (v) { return v >= max; })[0] || Math.ceil(max / 10) * 10, unit = ph / ymax;
    var svg = s("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Articles publiés par trimestre et par rubrique" });
    var ax = s("g", { class: "axis" }), step = ymax <= 10 ? 5 : ymax <= 30 ? 10 : 20;
    for (var t = 0; t <= ymax; t += step) {
      var y = padT + ph - t * unit;
      ax.appendChild(s("line", { x1: padL, x2: W - padR, y1: y, y2: y, class: t === 0 ? "bl" : "gl" }));
      var tx = s("text", { x: padL - 8, y: y + 4, "text-anchor": "end", class: "tab" }); tx.textContent = t; ax.appendChild(tx);
    }
    svg.appendChild(ax);
    var band = pw / qs.length, bw = Math.max(3, Math.min(24, band * 0.72));
    qs.forEach(function (q, i) {
      var x = padL + i * band + (band - bw) / 2, g = s("g", { class: "col" }), y0 = padT + ph, tot = 0, segs = [];
      series.forEach(function (r) { var v = data[q][r.k] || 0; if (v) segs.push([r, v]); tot += v; });
      segs.forEach(function (sg, j) {
        var hgt = sg[1] * unit, top = y0 - hgt, last = j === segs.length - 1, hh = Math.max(0.5, hgt - (last ? 0 : 2)), yy = last ? top : top + 2, rr = last ? Math.min(4, hh, bw / 2) : 0;
        var d = "M" + x + "," + (yy + hh) + "V" + (yy + rr) + (rr ? "Q" + x + "," + yy + " " + (x + rr) + "," + yy : "") + "H" + (x + bw - rr) + (rr ? "Q" + (x + bw) + "," + yy + " " + (x + bw) + "," + (yy + rr) : "") + "V" + (yy + hh) + "Z";
        g.appendChild(s("path", { d: d, fill: sg[0].hex, class: "seg" }));
        y0 = top;
      });
      if (q.slice(-1) === "1") { var lx = s("text", { x: padL + i * band + band * 2, y: H - 6, "text-anchor": "middle" }); lx.textContent = q.slice(0, 4); ax.appendChild(lx); }
      var hit = s("rect", { x: padL + i * band, y: padT, width: band, height: ph, class: "hit", tabindex: "0", role: "button", "aria-label": "T" + q.slice(-1) + " " + q.slice(0, 4) + " : " + plur(tot, "article") });
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
      hit.addEventListener("click", function () { toList({ annee: q.slice(0, 4) }); });
      svg.appendChild(g); svg.appendChild(hit);
    });
    svg.insertBefore(ax, svg.firstChild);
    box.appendChild(svg);
    series.forEach(function (r) { lg.appendChild(h("span", {}, h("span", { class: "sw", style: "background:" + r.hex }), r.k)); });
  }
  function drawRubs(bar, lg, A) {
    var c = {};
    A.forEach(function (a) { c[a.rubK] = (c[a.rubK] || 0) + 1; });
    var series = RUBS.concat(c[AUTRE.k] ? [AUTRE] : []).filter(function (r) { return c[r.k]; }), wpx = bar.clientWidth || 360;
    series.forEach(function (r) {
      var share = c[r.k] / A.length, label = Math.round(share * 100) + " %";
      bar.appendChild(h("button", { type: "button", style: "flex:" + c[r.k] + " 1 0;background:" + r.hex, title: r.k + " : " + c[r.k] + " articles", "aria-label": r.k + " : " + c[r.k] + " articles", onclick: function () { toList({ rub: r.k }); } }, share * wpx > label.length * 7.5 + 16 ? label : ""));
      lg.appendChild(h("span", {}, h("span", { class: "sw", style: "background:" + r.hex }), r.k + " ", h("b", { class: "tab", text: c[r.k] })));
    });
  }
  function drawAuthors(box, A) {
    var c = {};
    A.forEach(function (a) { var k = a.auteur || "(non signé)"; c[k] = (c[k] || 0) + 1; });
    var keys = Object.keys(c).sort(function (x, y) { return c[y] - c[x] || x.localeCompare(y, "fr"); }), top = keys.slice(0, 12), rest = keys.slice(12);
    var max = Math.max.apply(null, top.map(function (k) { return c[k]; }).concat([1]));
    top.forEach(function (name) {
      box.appendChild(h("button", { class: "hb", type: "button", title: name + " : " + plur(c[name], "article"), onclick: function () { toList({ auteur: name }); } },
        h("span", { class: "nm", text: name }), h("span", { class: "bw" }, h("span", { class: "br", style: "width:calc((100% - 34px) * " + (c[name] / max) + ")" }), h("span", { class: "vl tab", text: c[name] }))));
    });
    if (rest.length) box.appendChild(h("p", { class: "small", text: "+ " + rest.length + " autres plumes, " + plur(rest.reduce(function (t, k) { return t + c[k]; }, 0), "article") + " à elles toutes." }));
  }
  function drawNames(box, A) {
    var c = {};
    A.forEach(function (a) { (a.noms || []).forEach(function (n) { c[n] = (c[n] || 0) + 1; }); });
    Object.keys(c).filter(function (k) { return c[k] > 1; }).sort(function (x, y) { return c[y] - c[x] || x.localeCompare(y, "fr"); }).slice(0, 40).forEach(function (k) {
      box.appendChild(h("button", { class: "name", type: "button", onclick: function () { toList({ nom: k }); } }, k, h("b", { class: "tab", text: c[k] })));
    });
  }

  // ------------------------------------------------------------------ voter vite
  var T = null, tri = $("tri");
  function openTri() {
    if (!cfg.qui) { askWho(openTri); return; }
    if (!API.on()) { needConnect(); return; }
    var k = myKey();
    var queue = arts().filter(function (a) { return !a[k]; });
    T = { queue: queue, i: 0, hist: [], fait: { oui: 0, peut: 0, non: 0 } };
    renderTri();
    if (tri.showModal) tri.showModal(); else tri.setAttribute("open", "");
  }
  function triVote(v) {
    if (!T || T.i >= T.queue.length) return;
    var a = T.queue[T.i], k = myKey(), card = tri.querySelector(".tcard");
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
    var body = clear($("triBody")), n = T.queue.length, p = clear($("triP"));
    p.appendChild(h("b", { class: "tab", text: nf.format(Math.min(T.i + 1, n)) }));
    p.appendChild(document.createTextNode(" / " + nf.format(n) + " · tu le veux dans le livre ?"));
    $("triBar").style.width = (n ? T.i / n * 100 : 100) + "%";
    if (T.i >= n) {
      body.appendChild(h("div", { class: "tri-done" },
        h("h4", { text: n ? "C’est fini pour l’instant." : "Rien à voter." }),
        h("p", { text: n ? nf.format(T.fait.oui) + " oui · " + nf.format(T.fait.peut) + " peut-être · " + nf.format(T.fait.non) + " non. Tes votes sont enregistrés." : "Tu as déjà voté pour tous les articles." }),
        h("div", { style: "display:flex;gap:8px;justify-content:center" },
          T.hist.length ? h("button", { class: "btn ghost", type: "button", text: "Revenir au dernier", onclick: triUndo }) : null,
          h("button", { class: "btn main", type: "button", text: "Fermer", onclick: function () { tri.close(); } }))));
      return;
    }
    var a = T.queue[T.i], r = rubOf(a.rub), ok = otherKey();
    var card = h("article", { class: "tcard" },
      h("span", { class: "rbar", style: "background:" + r.hex }),
      h("div", { class: "meta" }, h("span", { class: "rb" }, h("span", { class: "sw", style: "background:" + r.hex + ";margin-right:6px" }), a.rub || "—"), h("span", { text: moisAn(a.date) }), h("span", { text: nf.format(a.mots || 0) + " mots" })),
      h("h4", { text: a.titre }),
      h("div", { class: "by", text: "par " + (a.auteur || "auteur inconnu") }),
      a.extrait ? h("p", { class: "extract", text: a.extrait + (a.extrait.length >= 318 ? "…" : "") }) : null,
      a.noms && a.noms.length ? h("div", { class: "names" }, a.noms.slice(0, 8).map(function (nm) { return h("span", { class: "name solo", text: nm }); })) : null,
      a[ok] ? h("div", { class: "other", text: other(cfg.qui) + " a voté : " + LV_LAB[a[ok]] }) : null,
      h("div", { class: "lk2" }, h("button", { class: "lnk", type: "button", text: "Lire l’article en entier", onclick: function () { var ids = T.queue.map(function (x) { return x.id; }); tri.close(); CTX = ids; go(link(a.id)); } })));
    var x0 = null, y0 = null, dx = 0, dy = 0;
    card.addEventListener("pointerdown", function (e) { if (e.target.closest("a,button")) return; x0 = e.clientX; y0 = e.clientY; dx = dy = 0; card.style.transition = "none"; });
    card.addEventListener("pointermove", function (e) { if (x0 == null) return; dx = e.clientX - x0; dy = e.clientY - y0; if (Math.abs(dx) > 8 || dy > 8) card.style.transform = "translate(" + dx + "px," + Math.max(0, dy) + "px) rotate(" + dx / 40 + "deg)"; });
    function end() { if (x0 == null) return; x0 = null; card.style.transition = ""; card.style.transform = ""; if (dx > 90) triVote("oui"); else if (dx < -90) triVote("non"); else if (dy > 90) triVote("peut"); }
    card.addEventListener("pointerup", end);
    card.addEventListener("pointercancel", end);
    body.appendChild(card);
    body.appendChild(h("div", { class: "tri-btns" },
      h("button", { type: "button", onclick: function () { triVote("non"); } }, "Non", h("small", { text: "← ou 1" })),
      h("button", { type: "button", class: "p", onclick: function () { triVote("peut"); } }, "Peut-être", h("small", { text: "↓ ou 2" })),
      h("button", { type: "button", class: "o", onclick: function () { triVote("oui"); } }, "Oui", h("small", { text: "→ ou 3" }))));
    body.appendChild(h("div", { class: "tri-foot" },
      h("button", { class: "lnk", type: "button", text: "Annuler le dernier", disabled: T.hist.length ? null : true, onclick: triUndo }),
      h("span", { class: "small", text: "Glisse la carte, ou utilise les flèches." }),
      h("button", { class: "lnk", type: "button", text: "Passer", onclick: function () { triVote(""); } })));
  }
  tri.addEventListener("keydown", function (e) {
    if (!T) return;
    var map = { ArrowRight: "oui", "3": "oui", ArrowLeft: "non", "1": "non", ArrowDown: "peut", "2": "peut" };
    if (map[e.key]) { e.preventDefault(); triVote(map[e.key]); }
    else if (e.key === " ") { e.preventDefault(); triVote(""); }
    else if (e.key === "Backspace") { e.preventDefault(); triUndo(); }
  });
  tri.addEventListener("close", function () { T = null; flush(); render(); });

  // ------------------------------------------------------------------ qui es-tu
  var whoCb = null;
  function setQui(q) {
    cfg.qui = q; ls("qui", q);
    setSync($("syncDot").className.replace("dot", "").trim(), $("syncTxt").textContent);
    if ($("dlgWho").open) $("dlgWho").close();
    render(true);
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
  function openSettings(install) {
    $("scriptUrl").value = cfg.script; $("codeIn").value = cfg.code;
    $("dlgErr").hidden = true; $("dlgOk").hidden = true;
    $("dlgMore").hidden = !API.on();
    $("install").open = install === true || (!API.on() && !CONF.script);
    $("inviteWho").textContent = cfg.qui ? other(cfg.qui) : "l’autre";
    $("dlgSave").textContent = API.on() ? "Enregistrer" : "Brancher";
    var os = $("openSheet");
    os.hidden = !REMOTE.sheet; if (REMOTE.sheet) os.href = REMOTE.sheet;
    $("liensInfo").textContent = "Le script les retrouve tout seul toutes les heures" + (REMOTE.liensMaj ? " (dernière fois " + relTime(REMOTE.liensMaj) + ")" : "") + ". " +
      nf.format(ALL.filter(function (a) { return a.gdoc; }).length) + " articles ont leur Doc.";
    if (!scriptText) fetch("outils/script-google.gs").then(function (r) { return r.ok ? r.text() : ""; }).then(function (t) { scriptText = t; }).catch(function () {});
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
  }
  function dlgMsg(id, txt) { $("dlgErr").hidden = true; $("dlgOk").hidden = true; var el = $(id); el.textContent = txt; el.hidden = !txt; }
  $("settings").addEventListener("click", function () { openSettings(false); });
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
      setTimeout(function () { dlg.close(); if (!cfg.qui) askWho(); render(true); }, 900);
    }, function (e) {
      cfg.script = old.script; cfg.code = old.code;
      dlgMsg("dlgErr", e.message);
      setSync(old.code ? "err" : "", old.code ? "Script injoignable" : "Pas encore branché");
    });
  });
  $("dlgClear").addEventListener("click", function () {
    ls("script", null); ls("code", null);
    cfg.script = CONF.script || ""; cfg.code = "";
    ALL = fromSnap(); REMOTE = {}; lastLoad = 0; DOCS = {};
    dlg.close(); setSync("", "Pas encore branché"); render(true);
    toast("Débranché.");
  });
  $("invite").addEventListener("click", function () {
    var q = new URLSearchParams({ cle: cfg.code });
    if (cfg.script !== CONF.script) q.set("script", cfg.script);
    if (cfg.qui) q.set("qui", other(cfg.qui));
    copier(location.origin + location.pathname + "#" + q.toString(), "Lien copié. Envoie-le à " + (cfg.qui ? other(cfg.qui) : "l’autre") + " en privé.");
  });
  function liensNow() {
    toast("Recherche des Docs dans le Drive… (jusqu’à une minute)", { ms: 60000 });
    return load("liens").then(function (d) {
      var l = d && d.liens;
      toast(l ? nf.format(l.trouves) + " Docs retrouvés" + (l.manquants ? ", " + nf.format(l.manquants) + " introuvables dans le dossier" : "") + "." : "Liens à jour.", { ms: 5000 });
    }, function (e) { toast("Échec : " + e.message, { err: true, ms: 8000 }); });
  }
  $("liensNow").addEventListener("click", function () { dlg.close(); liensNow(); });
  $("copyScript").addEventListener("click", function () {
    if (scriptText) copier(scriptText, "Script copié. Colle-le dans script.google.com.");
    else window.open("https://raw.githubusercontent.com/amelienito/cul7ure-save/main/outils/script-google.gs", "_blank", "noopener");
  });
  function copier(txt, msg) {
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast(msg, { ms: 4500 }); }, function () { window.prompt("Copie ceci :", txt); });
  }
  document.querySelectorAll("dialog [data-close]").forEach(function (b) { b.addEventListener("click", function () { b.closest("dialog").close(); }); });

  // ------------------------------------------------------------------ branchements
  window.addEventListener("hashchange", route);
  window.addEventListener("scroll", hideTip, { passive: true });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      if (Object.keys(W.pending).length) flush(true);
      if (ED && ED.dirty) saveDoc();
      return;
    }
    if (V.name === "article" && ED && !ED.dirty && (ED.state === "ok" || ED.state === "ro")) loadDoc(false);
    if (API.on() && Date.now() - lastLoad > 45000) load().catch(function () {});
  });
  window.addEventListener("beforeunload", function (e) {
    if (Object.keys(W.pending).length) flush(true);
    if (ED && ED.dirty) { e.preventDefault(); e.returnValue = ""; }
  });
  setInterval(function () {
    if (document.visibilityState === "visible" && API.on() && !tri.open && !(ED && ED.dirty) && Date.now() - lastLoad > 170000) load().catch(function () {});
  }, 30000);

  var STARTED = false;
  setSync("", API.on() ? "Mise à jour…" : "Pas encore branché");
  route();
  STARTED = true;
  load().catch(function (e) { if (e.code) { openSettings(false); dlgMsg("dlgErr", "Le code d’accès a été refusé : vérifie-le."); } });
})();
