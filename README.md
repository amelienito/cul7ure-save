# Cul7ure · les archives

Le tableau de bord de Florian et Amélien pour relire les 247 articles de Cul7ure sauvés de la Wayback Machine, et choisir ceux qui iront dans le livre.

**Le site :** https://amelienito.github.io/cul7ure-save

## Comment on s'en sert

- **Mon espace** (en haut) : ta liste de relecture. « Ouvrir le Doc » ouvre le bon Google Doc et le passe « en cours ». Quand tu reviens sur le site, une barre te demande si c'est relu, et propose le suivant.
- **Le tri rapide** : une carte par article, et trois boutons (Non, Peut-être, Oui). On peut aussi glisser la carte, ou utiliser les flèches du clavier. Chacun vote de son côté.
- **Le livre** : un article y entre quand vous votez oui tous les deux. Les désaccords vont dans « À discuter ». Le sommaire suit l'ordre de parution, avec une estimation des pages.
- **Les articles** : la liste complète, filtrable. Un clic sur un article permet d'ouvrir son Doc, de changer le statut de la relecture ou le relecteur, de voter, d'écrire une note, de régler une alerte ou de donner une plume aux articles non signés.

La relecture est **croisée** : Florian relit les textes d'Amélien, Amélien ceux de Florian, et les autres plumes sont partagées à nombre de mots égal (environ 167 000 mots chacun). Une plume entière va à la même personne. La répartition se change article par article.

## Brancher le site sur le Sheet (une fois, sur ordinateur)

Tout est expliqué sur le site : **Réglages → Installer le script**. En résumé :

1. Copier `outils/script-google.gs` dans un nouveau projet sur [script.google.com](https://script.google.com).
2. Lancer la fonction `installer` et accepter les autorisations. Elle crée le Sheet « Cul7ure · Suivi des archives » dans le dossier Drive « Cul7ure - Archives », retrouve le lien de chaque Doc et affiche un **code d'accès**.
3. Déployer en **Application Web** (Exécuter en tant que : Moi · Qui a accès : Tout le monde).
4. Sur le site : Réglages → coller l'URL de l'application Web et le code.
5. Réglages → **Inviter l'autre** : copie un lien qui branche le site d'un coup pour l'autre.

Pour éviter de recoller l'URL à chaque fois, on peut la mettre dans `config.js` (champ `script`). Le code d'accès, lui, ne va jamais dans le dépôt : il est public.

Le Sheet reste utilisable à la main (menus déroulants, couleurs, filtres). Le site le relit toutes les trois minutes et à chaque retour sur l'onglet.

## Le dossier `outils/`

- `script-google.gs` : le script Google qui crée le Sheet, retrouve les liens des Docs (toutes les heures) et permet au site de lire et d'écrire.
- `cul7ure_recup.py` : l'inventaire et le téléchargement des captures de la Wayback Machine.
- `cul7ure_extraire.py` : la transformation des pages en documents Word (un par article) et le fichier de suivi.

`data/articles.js` contient l'instantané du 18/11/2026 : titres, dates, plumes, extraits, noms cités, alertes et la répartition de la relecture. Le site l'affiche tant qu'il n'est pas branché.
