# Cul7ure · les archives

Le site de Florian et Amélien pour relire les articles de Cul7ure sauvés de la Wayback Machine, choisir ceux du livre et préparer l'export pour la mise en page.

**Le site :** https://amelienito.github.io/cul7ure-save

## Comment on s'en sert

- **Accueil** : ton prochain article à relire, un bouton « Commencer la relecture », où vous en êtes tous les deux, et trois raccourcis (voter, le livre, les problèmes).
- **Un article** : le texte s'ouvre directement sur le site. On le corrige là (gras pour les artistes, italique pour les œuvres, intertitres, citations, guillemets « » automatiques), et **le Google Doc se met à jour tout seul**. Puis « C'est relu », un vote pour le livre, une note pour l'autre, et « Article suivant ».
- **Le correcteur** : dans l'article, le texte est souligné par type de remarque (règles Cul7ure, orthographe, grammaire, typographie, répétitions, formulation). Les **règles Cul7ure** : un artiste en gras à sa première mention seulement, les titres d'œuvres en italique (y compris un titre mis en gras par erreur). Le bouton « Appliquer les règles Cul7ure » corrige tout l'article d'un coup ; la liste des noms et des titres relevés dans les archives est dans `data/noms.js`. Un clic sur un mot souligné montre la phrase entière et, pour chaque correction possible, la phrase telle qu'elle deviendrait : on choisit celle qui garde le sens, ou « Je reformule » pour réécrire à la main. Les tournures lourdes et les répétitions n'ont de remplacement que quand il tient dans la phrase (synonymes de même genre et nombre). « Passer les remarques en revue » les enchaîne. L'orthographe, la grammaire et le style viennent de LanguageTool (le texte est envoyé à leur service en ligne) ; les répétitions proches, les phrases très longues et les tournures lourdes sont repérées sur place. Noms propres, gras, italiques et citations ne sont pas corrigés ; chacun a son dictionnaire. La catégorie « Pensé pour le web » repère ce qui n'a plus de sens sur papier (« cliquez ici », « ci-dessous », « le lien », adresses web, paragraphes qui n'étaient qu'un lien) et propose de supprimer la phrase, aperçu à l'appui.
- **Les liens et les clips** : les notes de travail ([Vidéo YouTube : …], images, sources) s'affichent comme de petites étiquettes qui ne coupent plus le texte. À l'export, les liens et les clips sortent du texte et partent dans une **sitographie** (à la fin du fichier, ou à la fin de chaque article) ; les liens vers d'autres articles de Cul7ure deviennent des « À lire aussi ».
- **Articles** : la liste, avec « Ma liste » ou « Tous », « À relire » ou « Relus », et une recherche.
- **Le livre** : les articles retenus (oui + oui) dans l'ordre de parution avec une estimation des pages, ceux à discuter, et **l'export RTF** pour InDesign ou Word : tout le livre en un fichier, ou un fichier par année, pour les retenus, les relus ou tous. Chaque élément a son style de paragraphe (Chapitre, Surtitre, Titre article, Signature, Intertitre, Sous-intertitre, Citation, Liste, Note de travail, Sitographie titre, Sitographie).
- **Chiffres** : les graphiques, pour fouiller.

Chacun **relit ses propres textes**, et les autres plumes sont partagées à nombre de mots égal (environ 162 500 mots chacun, 106 articles pour Florian et 119 pour Amélien). Une plume entière va à la même personne. La répartition se change article par article.

22 articles pensés pour le web sont **mis de côté** (interviews vidéo et audio, annonces d'Osmose et de PDF, événements, playlists, partenariats Groover) : ils ne comptent ni dans la relecture ni dans le livre. La liste est en bas de la page Articles, et le champ `web` de `data/articles.js` dit pourquoi.

## Sécurité des textes

- Chaque enregistrement réécrit le Google Doc : son **historique des versions** (Fichier → Historique des versions) garde tout, au cas où.
- Si un Doc a été modifié ailleurs entre-temps (dans Google Docs, ou par l'autre), le site le voit et demande quelle version garder.
- Un Doc qui contient une image ou un tableau n'est jamais réécrit par le site : il s'affiche en lecture seule.

## Brancher le site (une fois, sur ordinateur)

Tout est expliqué sur le site : **Réglages → Installer le script**. En résumé :

1. Copier `outils/script-google.gs` dans un nouveau projet sur [script.google.com](https://script.google.com).
2. Lancer la fonction `installer` et accepter les autorisations. Elle crée le Sheet de suivi dans le dossier Drive « Cul7ure - Archives », retrouve le lien de chaque Doc et affiche un **code d'accès**.
3. Déployer en **Application Web** (Exécuter en tant que : Moi · Qui a accès : Tout le monde).
4. Mettre l'URL de l'application Web et le code dans `config.js` (champs `script` et `code`). Le site est alors branché pour tout le monde, sans rien taper.

Le code est donc lisible par quiconque trouve ce dépôt : c'est un choix assumé pour que personne n'ait à le saisir. Pour le changer, lancer `nouveauCodeAcces` dans le script Google puis remplacer la valeur dans `config.js`.

Si le script change plus tard : Déployer → Gérer les déploiements → crayon → Version : « Nouvelle version » → Déployer. L'URL ne change pas.

## Le dossier `outils/`

- `script-google.gs` : le script Google (le Sheet de suivi, les liens des Docs, la lecture et l'écriture du texte).
- `cul7ure_recup.py` : l'inventaire et le téléchargement des captures de la Wayback Machine.
- `cul7ure_extraire.py` : la transformation des pages en documents Word (un par article) et le fichier de suivi.

`data/articles.js` contient l'instantané du 18/11/2026 (titres, dates, plumes, extraits, noms cités, alertes, répartition de la relecture). Le site l'affiche tant qu'il n'est pas branché.
