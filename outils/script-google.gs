/**
 * Cul7ure · le script du suivi des archives
 * ------------------------------------------------------------------
 * Ce script fait trois choses :
 *   1. il crée le Google Sheet de suivi, rempli avec les 247 articles et la répartition de la relecture ;
 *   2. il retrouve le lien de chaque Google Doc dans le dossier Drive des archives (et le met à jour toutes les heures) ;
 *   3. il permet au site (amelienito.github.io/cul7ure-save) de lire et d'écrire dans ce Sheet,
 *      pour cocher « Relu », voter pour le livre ou laisser une note sans ouvrir le Sheet.
 *
 * Installation (une seule fois, sur ordinateur) :
 *   a. Colle tout ce fichier dans un nouveau projet sur script.google.com, puis enregistre (icône disquette).
 *   b. En haut, choisis la fonction « installer » et clique « Exécuter ». Google demande des autorisations :
 *      choisis ton compte, puis « Paramètres avancés » → « Accéder à Cul7ure (non sécurisé) » → « Autoriser ».
 *      (« Non sécurisé » veut juste dire que Google n'a pas vérifié ce script : c'est le tien.)
 *   c. Le journal d'exécution affiche l'adresse du Sheet et le CODE D'ACCÈS. Garde le code.
 *   d. « Déployer » → « Nouveau déploiement » → roue dentée → « Application Web ».
 *      Exécuter en tant que : Moi. Qui a accès : Tout le monde. → « Déployer », puis copie l'URL de l'application Web.
 *   e. Sur le site : « Réglages » → colle l'URL et le code.
 *
 * Si tu modifies ce script plus tard : « Déployer » → « Gérer les déploiements » → crayon →
 * Version : « Nouvelle version » → « Déployer ». L'URL ne change pas.
 */

// ---------------------------------------------------------------- réglages
var DOSSIER = "Cul7ure - Archives";   // le nom du dossier Drive où sont les Docs
var DONNEES = "https://raw.githubusercontent.com/amelienito/cul7ure-save/main/data/articles.js";
var NOM_DU_SHEET = "Cul7ure · Suivi des archives";
var ONGLET = "Suivi";

var COLONNES = [
  { k: "date", t: "Date", w: 92 },
  { k: "rub", t: "Rubrique", w: 100 },
  { k: "titre", t: "Titre", w: 380 },
  { k: "auteur", t: "Plume", w: 130 },
  { k: "mots", t: "Mots", w: 64 },
  { k: "rel", t: "Relecteur", w: 100 },
  { k: "statut", t: "Relecture", w: 100 },
  { k: "reluLe", t: "Relu le", w: 120 },
  { k: "livreF", t: "Livre · Florian", w: 110 },
  { k: "livreA", t: "Livre · Amélien", w: 110 },
  { k: "notes", t: "Notes", w: 300 },
  { k: "alertes", t: "Alertes", w: 220 },
  { k: "gdoc", t: "Lien du Doc", w: 160 },
  { k: "docModif", t: "Doc modifié le", w: 120 },
  { k: "src", t: "Archive", w: 140 },
  { k: "doc", t: "Nom du Doc", w: 200 },
  { k: "maj", t: "Dernière modif", w: 120 },
  { k: "majPar", t: "Modifié par", w: 100 },
  { k: "id", t: "ID", w: 160 }
];
var MODIFIABLES = ["rel", "statut", "livreF", "livreA", "notes", "auteur", "alertes"];
var LISTES = {
  rel: ["Florian", "Amélien"],
  statut: ["à relire", "en cours", "relu"],
  livreF: ["oui", "peut-être", "non"],
  livreA: ["oui", "peut-être", "non"]
};
var QUI = ["Florian", "Amélien"];

// ---------------------------------------------------------------- installation
function installer() {
  var props = PropertiesService.getScriptProperties();
  var ss = ouvrirSheet_(true);
  var sh = ss.getSheetByName(ONGLET);
  if (!sh) {
    sh = ss.getSheets()[0];
    if (sh.getLastRow() === 0 && sh.getLastColumn() === 0) sh.setName(ONGLET);
    else sh = ss.insertSheet(ONGLET);
  }
  var articles = telecharger_();
  var ajoutes = remplir_(sh, articles);
  mettreEnForme_(sh);

  var code = props.getProperty("CODE");
  if (!code) { code = fabriquerCode_(); props.setProperty("CODE", code); }

  var l = { trouves: 0, manquants: 0 };
  try { l = liens(); } catch (e) { Logger.log("⚠️ Liens des Docs : " + e.message); }

  var dejaLa = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === "liens"; });
  if (!dejaLa) ScriptApp.newTrigger("liens").timeBased().everyHours(1).create();

  Logger.log("✅ C'est installé.");
  Logger.log("Le Sheet : " + ss.getUrl());
  Logger.log(ajoutes + " article(s) ajouté(s) au Sheet.");
  Logger.log("Liens des Docs retrouvés : " + l.trouves + (l.manquants ? " · pas trouvés : " + l.manquants : ""));
  Logger.log("👉 TON CODE D'ACCÈS : " + code + "   (à coller sur le site, et à donner à Florian)");
  Logger.log("Étape suivante : Déployer → Nouveau déploiement → Application Web (Exécuter en tant que : Moi · Qui a accès : Tout le monde).");
}

/** Si le code a fuité : lance cette fonction, puis donne le nouveau code à Florian. */
function nouveauCodeAcces() {
  var code = fabriquerCode_();
  PropertiesService.getScriptProperties().setProperty("CODE", code);
  Logger.log("👉 NOUVEAU CODE D'ACCÈS : " + code);
}

function fabriquerCode_() {
  var L = "abcdefghjkmnpqrstuvwxyz23456789", c = "";
  for (var i = 0; i < 6; i++) c += L.charAt(Math.floor(Math.random() * L.length));
  return c;
}

function ouvrirSheet_(creer) {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty("SHEET_ID");
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { /* supprimé ? on en recrée un */ }
  }
  if (!creer) throw new Error("Le Sheet n'existe pas encore : lance « installer » dans l'éditeur du script.");
  var ss = SpreadsheetApp.create(NOM_DU_SHEET);
  props.setProperty("SHEET_ID", ss.getId());
  try {
    var dossier = trouverDossier_();
    if (dossier) DriveApp.getFileById(ss.getId()).moveTo(dossier);
  } catch (e) { /* il restera à la racine du Drive, ce n'est pas grave */ }
  return ss;
}

function telecharger_() {
  var r = UrlFetchApp.fetch(DONNEES, { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error("Impossible de lire les articles sur GitHub (erreur " + r.getResponseCode() + ").");
  var t = r.getContentText("UTF-8");
  return JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)).articles;
}

/** Repère les colonnes par leur titre (on peut donc les déplacer dans le Sheet) et ajoute celles qui manquent. */
function entetes_(sh) {
  var nc = sh.getLastColumn();
  var titres = nc ? sh.getRange(1, 1, 1, nc).getValues()[0].map(function (x) { return String(x).trim(); }) : [];
  var H = {};
  COLONNES.forEach(function (c) {
    var j = titres.indexOf(c.t);
    if (j < 0) {
      j = titres.length;
      sh.getRange(1, j + 1).setValue(c.t);
      titres.push(c.t);
    }
    H[c.k] = j;
  });
  return H;
}

function remplir_(sh, articles) {
  var H = entetes_(sh);
  var nc = sh.getLastColumn();
  var lr = sh.getLastRow();
  var connus = {};
  if (lr > 1) sh.getRange(2, H.id + 1, lr - 1, 1).getValues().forEach(function (r) { connus[String(r[0])] = true; });
  var lignes = articles.filter(function (a) { return a.id && !connus[a.id]; }).map(function (a) {
    var o = {
      id: a.id, date: a.date || "", rub: a.rub || "", titre: a.titre || "", auteur: a.auteur || "",
      mots: a.mots || 0, rel: a.rel || "", statut: "", reluLe: "", livreF: "", livreA: "", notes: "",
      alertes: (a.alertes || []).join(" ; "), gdoc: "", docModif: "", src: a.src || "", doc: a.doc || "", maj: "", majPar: ""
    };
    var ligne = [];
    for (var j = 0; j < nc; j++) ligne.push("");
    COLONNES.forEach(function (c) { ligne[H[c.k]] = o[c.k]; });
    return ligne;
  });
  if (!lignes.length) return 0;
  var debut = sh.getLastRow() + 1;
  if (sh.getMaxRows() < debut + lignes.length) sh.insertRowsAfter(sh.getMaxRows(), debut + lignes.length - sh.getMaxRows());
  // tout en texte brut (sinon Google transforme « 2017-04-26 » en date), sauf les mots
  sh.getRange(debut, 1, lignes.length, nc).setNumberFormat("@");
  sh.getRange(debut, H.mots + 1, lignes.length, 1).setNumberFormat("0");
  sh.getRange(debut, 1, lignes.length, nc).setValues(lignes);
  return lignes.length;
}

function mettreEnForme_(sh) {
  var H = entetes_(sh);
  var nc = sh.getLastColumn(), lr = Math.max(sh.getLastRow(), 2);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, nc).setFontWeight("bold").setBackground("#1A1746").setFontColor("#EEF0FF");
  COLONNES.forEach(function (c) { sh.setColumnWidth(H[c.k] + 1, c.w); });
  sh.getRange(2, H.titre + 1, lr - 1, 1).setFontWeight("bold");
  Object.keys(LISTES).forEach(function (k) {
    var regle = SpreadsheetApp.newDataValidation().requireValueInList(LISTES[k], true).setAllowInvalid(false).build();
    sh.getRange(2, H[k] + 1, lr - 1, 1).setDataValidation(regle);
  });
  // couleurs : relu en vert, en cours en jaune, votes oui/non
  var regles = [];
  function couleur(k, valeur, fond, texte) {
    regles.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(valeur)
      .setBackground(fond).setFontColor(texte).setRanges([sh.getRange(2, H[k] + 1, lr - 1, 1)]).build());
  }
  couleur("statut", "relu", "#D4F5D4", "#0B5D0B");
  couleur("statut", "en cours", "#FFF1C7", "#7A5300");
  ["livreF", "livreA"].forEach(function (k) {
    couleur(k, "oui", "#D4F5D4", "#0B5D0B");
    couleur(k, "peut-être", "#FFF1C7", "#7A5300");
    couleur(k, "non", "#FBE0E0", "#8A1F1F");
  });
  sh.setConditionalFormatRules(regles);
  if (!sh.getFilter()) sh.getRange(1, 1, lr, nc).createFilter();
}

// ---------------------------------------------------------------- liens des Docs
function trouverDossier_() {
  var it = DriveApp.getFoldersByName(DOSSIER), meilleur = null;
  while (it.hasNext()) {
    var f = it.next();
    if (f.isTrashed()) continue;
    if (!meilleur || f.getDateCreated() > meilleur.getDateCreated()) meilleur = f;
  }
  return meilleur;
}

function norm_(s) {
  return String(s || "").normalize("NFC").toLowerCase()
    .replace(/\.docx$/, "").replace(/[’‘`´]/g, "'").replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
}
function squelette_(s) {
  return norm_(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
}

function parcourir_(dossier, exacts, squelettes, profondeur) {
  var DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  var fichiers = dossier.getFiles();
  while (fichiers.hasNext()) {
    var f = fichiers.next();
    var type = f.getMimeType();
    if (type !== MimeType.GOOGLE_DOCS && type !== DOCX) continue;
    var maj = f.getLastUpdated(), cree = f.getDateCreated();
    var info = { url: f.getUrl(), gdoc: type === MimeType.GOOGLE_DOCS, maj: maj,
      // « modifié » seulement si quelqu'un y a touché après l'import (10 minutes de marge)
      touche: maj.getTime() - cree.getTime() > 10 * 60 * 1000 };
    [[exacts, norm_(f.getName())], [squelettes, squelette_(f.getName())]].forEach(function (p) {
      var avant = p[0][p[1]];
      // on préfère un Google Doc à un .docx, puis le plus récent
      if (!avant || (info.gdoc && !avant.gdoc) || (info.gdoc === avant.gdoc && info.maj > avant.maj)) p[0][p[1]] = info;
    });
  }
  if (profondeur < 3) {
    var sous = dossier.getFolders();
    while (sous.hasNext()) parcourir_(sous.next(), exacts, squelettes, profondeur + 1);
  }
}

/** Retrouve le lien de chaque Doc. Tourne toute seule toutes les heures, et depuis le site (« Actualiser les liens »). */
function liens() {
  var ss = ouvrirSheet_(false), sh = ss.getSheetByName(ONGLET);
  var dossier = trouverDossier_();
  if (!dossier) throw new Error("Dossier « " + DOSSIER + " » introuvable dans le Drive. Vérifie son nom tout en haut du script (variable DOSSIER).");
  var exacts = {}, squelettes = {};
  parcourir_(dossier, exacts, squelettes, 0);

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var H = entetes_(sh), lr = sh.getLastRow();
    if (lr < 2) return { trouves: 0, manquants: 0 };
    var n = lr - 1;
    var noms = sh.getRange(2, H.doc + 1, n, 1).getValues();
    var urls = sh.getRange(2, H.gdoc + 1, n, 1).getValues();
    var modifs = sh.getRange(2, H.docModif + 1, n, 1).getValues();
    var tz = Session.getScriptTimeZone(), ok = 0, ko = 0;
    for (var i = 0; i < n; i++) {
      var nom = noms[i][0];
      if (!nom) continue;
      var f = exacts[norm_(nom)] || squelettes[squelette_(nom)];
      if (!f) { ko++; continue; }
      ok++;
      urls[i][0] = f.url;
      modifs[i][0] = f.touche ? Utilities.formatDate(f.maj, tz, "yyyy-MM-dd HH:mm") : "";
    }
    sh.getRange(2, H.gdoc + 1, n, 1).setNumberFormat("@").setValues(urls);
    sh.getRange(2, H.docModif + 1, n, 1).setNumberFormat("@").setValues(modifs);
    PropertiesService.getScriptProperties().setProperty("LIENS_MAJ", Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm"));
    return { trouves: ok, manquants: ko };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------- le site lit et écrit ici
function doGet(e) {
  return repondre_(function () {
    var p = (e && e.parameter) || {};
    verifier_(p.code);
    if (p.action === "liens") {
      var r = liens();
      var d = lire_();
      d.liens = r;
      return d;
    }
    return lire_();
  });
}

function doPost(e) {
  return repondre_(function () {
    var b = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    verifier_(b.code);
    if (QUI.indexOf(b.qui) < 0) throw new Error("Le site doit dire qui tu es (Florian ou Amélien).");
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var sh = ouvrirSheet_(false).getSheetByName(ONGLET);
      var H = entetes_(sh);
      return { lignes: (b.modifs || []).map(function (m) { return modifier_(sh, H, m, b.qui); }) };
    } finally {
      lock.releaseLock();
    }
  });
}

function repondre_(fn) {
  var out;
  try { out = fn(); out.ok = true; }
  catch (err) { out = { ok: false, erreur: String((err && err.message) || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function verifier_(code) {
  var bon = PropertiesService.getScriptProperties().getProperty("CODE");
  if (!bon) throw new Error("Le script n'est pas encore installé : lance « installer » dans l'éditeur.");
  if (String(code || "").trim().toLowerCase() !== bon) throw new Error("CODE_FAUX");
}

function texte_(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, v.getHours() || v.getMinutes() ? "yyyy-MM-dd HH:mm" : "yyyy-MM-dd");
  return v == null ? "" : String(v);
}

function lire_() {
  var ss = ouvrirSheet_(false), sh = ss.getSheetByName(ONGLET);
  var H = entetes_(sh), lr = sh.getLastRow(), tz = Session.getScriptTimeZone();
  var lignes = lr > 1 ? sh.getRange(2, 1, lr - 1, sh.getLastColumn()).getValues() : [];
  var articles = [];
  lignes.forEach(function (r) {
    var id = texte_(r[H.id], tz).trim();
    if (!id) return;
    var o = {};
    COLONNES.forEach(function (c) { o[c.k] = c.k === "mots" ? (Number(r[H.mots]) || 0) : texte_(r[H[c.k]], tz).trim(); });
    articles.push(o);
  });
  return {
    articles: articles,
    sheet: ss.getUrl(),
    liensMaj: PropertiesService.getScriptProperties().getProperty("LIENS_MAJ") || "",
    lu: Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm")
  };
}

function propre_(k, v) {
  v = String(v == null ? "" : v).trim();
  if (k === "statut" && v === "à relire") v = "";
  if (LISTES[k] && v && LISTES[k].indexOf(v) < 0) throw new Error("Valeur « " + v + " » impossible pour " + k + ".");
  if (k === "notes" && v.length > 5000) v = v.slice(0, 5000);
  return v;
}

function modifier_(sh, H, m, qui) {
  var lr = sh.getLastRow(), tz = Session.getScriptTimeZone();
  var ids = sh.getRange(2, H.id + 1, lr - 1, 1).getValues();
  var ligne = -1;
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === m.id) { ligne = i + 2; break; }
  if (ligne < 0) throw new Error("Article introuvable dans le Sheet : " + m.id);
  var maintenant = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm");
  var champs = m.champs || {};
  Object.keys(champs).forEach(function (k) {
    if (MODIFIABLES.indexOf(k) < 0) return;
    var v = propre_(k, champs[k]);
    sh.getRange(ligne, H[k] + 1).setNumberFormat("@").setValue(v);
    if (k === "statut") sh.getRange(ligne, H.reluLe + 1).setNumberFormat("@").setValue(v === "relu" ? maintenant : "");
  });
  sh.getRange(ligne, H.maj + 1).setNumberFormat("@").setValue(maintenant);
  sh.getRange(ligne, H.majPar + 1).setValue(qui);
  var r = sh.getRange(ligne, 1, 1, sh.getLastColumn()).getValues()[0], o = {};
  COLONNES.forEach(function (c) { o[c.k] = c.k === "mots" ? (Number(r[H.mots]) || 0) : texte_(r[H[c.k]], tz).trim(); });
  return o;
}
