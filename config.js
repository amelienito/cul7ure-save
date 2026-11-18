/*
  Réglages du tableau de bord Cul7ure.

  sheetCsv  : l'adresse « publiée sur le Web » du Google Sheet de suivi, au format CSV.
              Dans Google Sheets : Fichier → Partager → Publier sur le Web →
              choisir l'onglet du suivi + « Valeurs séparées par des virgules (.csv) » → Publier,
              puis copier l'adresse ici, entre les guillemets.
              Tant que c'est vide, le site affiche l'instantané du 18/11/2026 (data/articles.js).

  sheetEdit : (facultatif) l'adresse normale du Google Sheet, pour le bouton « Ouvrir le Sheet ».
*/
window.CUL7URE_CONFIG = {
  sheetCsv: "",
  sheetEdit: ""
};
