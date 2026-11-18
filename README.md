# Cul7ure · les archives

Le tableau de bord pour trier, relire et préparer le livre des 247 articles de Cul7ure (2017-2023), récupérés depuis la Wayback Machine après la fermeture du site.

**[Ouvrir le tableau de bord](https://amelienito.github.io/cul7ure-save/)**

On y trouve les chiffres clés, l'avancement de la relecture (Florian / Amélien), les articles à traiter (interviews vidéo à retranscrire, plumes à retrouver, articles introuvables…), les publications dans le temps, les rubriques, les plumes, les artistes les plus cités et la liste complète des articles, avec un extrait et des liens pour chacun. Chaque filtre se retrouve dans l'adresse de la page : on peut s'envoyer une vue précise.

## Brancher le Google Sheet de suivi

Le site lit le Sheet à chaque visite : ce que vous y cochez apparaît dans le tableau de bord.

1. Dans le Google Sheet : **Fichier → Partager → Publier sur le Web**.
2. Choisir l'onglet du suivi et **Valeurs séparées par des virgules (.csv)**, puis **Publier**.
3. Copier l'adresse obtenue dans `config.js` (ligne `sheetCsv`), sur GitHub : bouton crayon, coller, « Commit changes ».

Le bouton « Brancher le Sheet » du site fait la même chose, mais seulement dans le navigateur où on le règle.

Le site reconnaît ces colonnes par leur nom : Date, Rubrique, Auteur/Autrice, Titre, Mots, Alertes, Relu par Florian, Relu par Amélien, Source (archive). Il reconnaît aussi trois colonnes facultatives :

- **Livre** (oui / non / peut-être) : ajoute le suivi du tri pour le livre et les filtres correspondants ;
- **Lien Google Doc** (l'adresse du doc) : ajoute un bouton « Ouvrir le Google Doc » ;
- **Notes** : s'affiche sous l'extrait de l'article.

Les cases à cocher valent TRUE ou FALSE ; « oui », « x » ou « fait » marchent aussi.

## Les fichiers

- `index.html`, `app.js` : le site (aucune installation, aucune bibliothèque)
- `config.js` : l'adresse du Google Sheet
- `data/articles.js` : l'instantané du 18/11/2026 (titres, extraits, noms cités), utilisé tant que le Sheet n'est pas branché et pour compléter ce qu'il ne contient pas
- `outils/` : les deux scripts qui ont servi à récupérer les articles (`cul7ure_recup.py`) et à en faire un document Word par article (`cul7ure_extraire.py`)
