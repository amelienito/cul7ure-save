/* Maquettes de l'accueil : les données (instantané + Sheet en lecture seule) et la barre pour passer de l'une à l'autre.
   Rien ici n'écrit dans le Sheet ni dans les Docs. */
window.MQ = (function () {
  "use strict";
  var CONF = window.CUL7URE_CONFIG || {};
  var SNAP = (window.CUL7URE_DATA && window.CUL7URE_DATA.articles) || [];
  var MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  var MOIS_L = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  var RUBS = { Chroniques: "#9085e9", Dossiers: "#2FB884", Interviews: "#E8743B", "Parenthèses": "#4C9BF0", Portraits: "#E0609A" };
  var QUI = ["Florian", "Amélien"];
  var nf = new Intl.NumberFormat("fr-FR");
  function ls(k) { try { return localStorage.getItem("cul7ure." + k); } catch (e) { return null; } }
  var qui = QUI.indexOf(ls("qui")) >= 0 ? ls("qui") : "Amélien";
  var script = ls("script") || CONF.script, code = ls("code") || CONF.code;
  function other(q) { return q === "Florian" ? "Amélien" : "Florian"; }
  function lv(v) { v = String(v || "").toLowerCase(); return v === "oui" ? "oui" : v.indexOf("peut") === 0 ? "peut" : v === "non" ? "non" : ""; }
  function st(v) { v = String(v || "").toLowerCase(); return v === "relu" ? "relu" : v.indexOf("cours") >= 0 ? "cours" : ""; }
  function byDate(x, y) { var a = x.date || "9999", b = y.date || "9999"; return a < b ? -1 : a > b ? 1 : 0; }
  function moisAn(d) { if (!d) return "date inconnue"; var p = d.split("-"); return MOIS[+p[1] - 1] + " " + p[0]; }
  function moisAnL(d) { if (!d) return "date inconnue"; var p = d.split("-"); return MOIS_L[+p[1] - 1] + " " + p[0]; }
  function plur(n, one, many) { return nf.format(n) + " " + (n > 1 ? (many || one + "s") : one); }
  function finir(list, live) {
    list.sort(byDate);
    var page = 1;
    list.forEach(function (a, i) {
      a.n = i + 1;
      a.pages = Math.max(1, Math.round((a.mots || 0) / 320));
      a.annee = a.date ? a.date.slice(0, 4) : "";
      a.livre = a.livreF === "oui" && a.livreA === "oui" ? "dedans" : a.livreF === "non" && a.livreA === "non" ? "ecarte" : a.livreF && a.livreA ? "discuter" : "attente";
      a.etat = a.livre === "dedans" ? "retenu" : a.livre === "ecarte" ? "ecarte" : a.statut === "relu" ? "relu" : a.statut === "cours" ? "cours" : "arelire";
      a.mien = a.rel === qui;
      a.couleur = RUBS[a.rub] || "#8E9A96";
      if (a.livre !== "ecarte") { a.p0 = page; page += a.pages; } else a.p0 = 0;
    });
    var file = list.filter(function (a) { return a.mien && a.statut !== "relu"; }).sort(function (x, y) {
      if ((x.statut === "cours") !== (y.statut === "cours")) return x.statut === "cours" ? -1 : 1;
      return byDate(x, y);
    });
    var k = qui === "Florian" ? "livreF" : "livreA";
    var R = {
      live: live, qui: qui, autre: other(qui), arts: list, file: file, prochain: file[0] || null,
      pages: page - 1,
      mes: list.filter(function (a) { return a.mien; }),
      siens: list.filter(function (a) { return a.rel === other(qui); }),
      sansVote: list.filter(function (a) { return !a[k]; }).length,
      retenus: list.filter(function (a) { return a.livre === "dedans"; }),
      relus: list.filter(function (a) { return a.statut === "relu"; })
    };
    R.mesRelus = R.mes.filter(function (a) { return a.statut === "relu"; }).length;
    R.siensRelus = R.siens.filter(function (a) { return a.statut === "relu"; }).length;
    return R;
  }
  function charger() {
    var base = SNAP.filter(function (a) { return !a.web && !a.manquant; }).map(function (a) { return Object.assign({ statut: "", livreF: "", livreA: "" }, a); });
    var par = {};
    base.forEach(function (a) { par[a.id] = a; });
    if (!script || !code) return Promise.resolve(finir(base, false));
    return fetch(script + "?code=" + encodeURIComponent(code) + "&_=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) throw new Error(d.erreur);
        (d.articles || []).forEach(function (r) {
          var a = par[r.id];
          if (!a) return;
          if (QUI.indexOf(r.rel) >= 0) a.rel = r.rel;
          a.statut = st(r.statut); a.livreF = lv(r.livreF); a.livreA = lv(r.livreA);
          if (r.titre) a.titre = r.titre;
          if (r.auteur) a.auteur = r.auteur;
          if (r.mots) a.mots = +r.mots || a.mots;
        });
        return finir(base, true);
      })
      .catch(function () { return finir(base, false); });
  }
  function lien(id) { return "../#/a/" + encodeURIComponent(id); }
  // la barre en bas : passer d'une maquette à l'autre
  function barre(cur) {
    var b = document.createElement("nav");
    b.className = "mq-barre";
    b.setAttribute("aria-label", "Maquettes");
    b.innerHTML = '<span>Maquettes</span>' + ["a", "b", "c"].map(function (x) {
      return '<a href="' + x + '.html"' + (x === cur ? ' aria-current="page"' : "") + ">" + x.toUpperCase() + "</a>";
    }).join("") + '<a class="mq-site" href="../">Le site</a>';
    document.body.appendChild(b);
    var s = document.createElement("style");
    s.textContent = ".mq-barre{position:fixed;left:50%;bottom:calc(14px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:999;display:flex;align-items:center;gap:4px;padding:5px 5px 5px 14px;border-radius:999px;background:rgba(8,10,10,.86);border:1px solid rgba(255,255,255,.2);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);font:600 13px/1 'Mona Sans',system-ui,sans-serif;color:rgba(255,255,255,.6);box-shadow:0 10px 30px rgba(0,0,0,.4)}" +
      ".mq-barre a{min-width:34px;height:30px;padding:0 10px;border-radius:999px;display:grid;place-items:center;color:#fff;text-decoration:none;white-space:nowrap}" +
      ".mq-barre a:hover{background:rgba(255,255,255,.1)}.mq-barre a[aria-current]{background:#fff;color:#000}.mq-barre .mq-site{color:rgba(255,255,255,.7);font-weight:500}" +
      ".mq-barre span{margin-right:4px;white-space:nowrap}";
    document.head.appendChild(s);
  }
  // l'info-bulle commune
  var tip;
  function bulle(x, y, html) {
    if (!tip) { tip = document.createElement("div"); tip.className = "mq-tip"; document.body.appendChild(tip); }
    if (html == null) { tip.classList.remove("on"); return; }
    tip.innerHTML = html;
    tip.classList.add("on");
    var w = tip.offsetWidth, h = tip.offsetHeight;
    var l = Math.min(Math.max(10, x + 16), window.innerWidth - w - 10), t = y + 18;
    if (t + h > window.innerHeight - 10) t = y - h - 14;
    tip.style.left = l + "px"; tip.style.top = t + "px";
  }
  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var ETATS = { arelire: "à relire", cours: "en cours", relu: "relu", retenu: "retenu pour le livre", ecarte: "écarté" };
  return { charger: charger, lien: lien, barre: barre, bulle: bulle, esc: esc, moisAn: moisAn, moisAnL: moisAnL, plur: plur, nf: nf, RUBS: RUBS, ETATS: ETATS, qui: qui };
})();
