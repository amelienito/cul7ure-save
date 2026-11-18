# Cul7ure · les archives

Le site de Florian et Amélien pour relire les 247 articles de Cul7ure sauvés de la Wayback Machine, et choisir ceux du livre.

**Le site :** https://amelienito.github.io/cul7ure-save

## Comment on s'en sert

- **Accueil** : ton prochain article à relire, un bouton « Commencer la relecture », où vous en êtes tous les deux, et trois raccourcis (voter, le livre, les problèmes).
- **Un article** : le texte s'ouvre directement sur le site. On le corrige là (gras pour les artistes, italique pour les œuvres, intertitres, citations, guillemets « » automatiques), et **le Google Doc se met à jour tout seul**. Puis « C'est relu », un vote pour le livre, une note pour l'autre, et « Article suivant ».
- **Articles** : la liste, avec « Ma liste » ou « Tous », « À relire » ou « Relus », et une recherche.
- **Le livre** : les articles retenus (oui + oui) dans l'ordre de parution avec une estimation des pages, et ceux à discuter.
- **Chiffres** : les graphiques, pour fouiller.

La relecture est **croisée** : Florian relit les textes d'Amélien, Amélien ceux de Florian, et les autres plumes sont partagées à nombre de mots égal (environ 167 000 mots chacun). Une plume entière va à la même personne.

## Sécurité des textes

- Chaque enregistrement réécrit le Google Doc : son **historique des versions** (Fichier → Historique des versions) garde tout, au cas où.
- Si un Doc a été modifié ailleurs entre-temps (dans Google Docs, ou par l'autre), le site le voit et demande quelle version garder.
- Un Doc qui contient une image ou un tableau n'est jamais réécrit par le site : il s'affiche en lecture seule.

## Brancher le site (une fois, sur ordinateur)

Tout est expliqué sur le site : **Réglages → Installer le script**. En résumé :

1. Copier `outils/script-google.gs` dans un nouveau projet sur [script.google.com](https://script.google.com).
2. Lancer la fonction `installer` et accepter les autorisations. Elle crée le Sheet de suivi dans le dossier Drive « Cul7ure - Archives », retrouve le lien de chaque Doc et affiche un **code d'accès**.
3. Déployer en **Application Web** (Exécuter en tant que : Moi · Qui a accès : Tout le monde).
4. Sur le site : Réglages → coller l'URL de l'application Web et le code.
5. Réglages → **Inviter l'autre** : copie un lien qui branche le site d'un coup pour l'autre.

L'URL peut aussi aller dans `config.js` (champ `script`). Le code d'accès, lui, ne va jamais dans le dépôt : il est public.

Si le script change plus tard : Déployer → Gérer les déploiements → crayon → Version : « Nouvelle version » → Déployer. L'URL ne change pas.

## Le dossier `outils/`

- `script-google.gs` : le script Google (le Sheet de suivi, les liens des Docs, la lecture et l'écriture du texte).
- `cul7ure_recup.py` : l'inventaire et le téléchargement des captures de la Wayback Machine.
- `cul7ure_extraire.py` : la transformation des pages en documents Word (un par article) et le fichier de suivi.

`data/articles.js` contient l'instantané du 18/11/2026 (titres, dates, plumes, extraits, noms cités, alertes, répartition de la relecture). Le site l'affiche tant qu'il n'est pas branché.
