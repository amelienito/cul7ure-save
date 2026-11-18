#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Récupération des articles de cul7ure.fr à partir de la Wayback Machine
(et, en option, du site actuel).

Trois commandes, à lancer une par une :
  python3 cul7ure_recup.py inventaire    -> liste tout ce que la Wayback Machine connaît
  python3 cul7ure_recup.py telecharger   -> télécharge chaque article (version propre la plus récente)
  python3 cul7ure_recup.py vivant        -> tente de copier les pages encore servies par le site actuel

Rien n'est exécuté ni ouvert : on enregistre seulement le HTML brut dans le
dossier cul7ure_archive/, à côté de ce fichier. Si le script est interrompu,
on le relance et il reprend où il s'est arrêté.
"""
import csv
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

DOMAIN = "cul7ure.fr"
# Les captures plus récentes que cette date sont évitées (domaine racheté en octobre 2025).
CUTOFF = "20250901"
PAUSE = 2.0  # secondes entre deux requêtes, pour ne pas surcharger la Wayback Machine
SECTIONS = {"parentheses", "portraits", "dossiers", "chroniques", "chroniques-dalbum", "interviews"}
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 "
      "(KHTML, like Gecko) Version/17.0 Safari/605.1.15")
SPAM = re.compile(r"casino|bookmaker|plinko|hors arjel|paris sportif", re.I)

ICI = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ICI, "cul7ure_archive")
BRUT = os.path.join(OUT, "wayback_html")
JSONS = os.path.join(OUT, "wayback_json")
VIVANT = os.path.join(OUT, "site_actuel")


def get(url, tries=5, timeout=60):
    """Télécharge une URL. Réessaie avec une pause croissante si le serveur est débordé."""
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(10 * (i + 1))
                continue
            return e.code, b""
        except Exception:
            time.sleep(5 * (i + 1))
    return 0, b""


def norm_path(url):
    """URL -> chemin simple, sans http/www/paramètres/slash final."""
    p = urllib.parse.unquote(urllib.parse.urlparse(url).path)
    return re.sub(r"/+$", "", p) or "/"


def est_article(path):
    parts = [x for x in path.split("/") if x]
    if "page" in parts or "feed" in parts or "amp" in parts:
        return False
    if len(parts) == 2 and parts[0] in SECTIONS:
        return True
    if len(parts) >= 3 and re.fullmatch(r"20\d\d", parts[0]) and re.fullmatch(r"\d\d", parts[1]):
        return True
    return False


def nom_fichier(path):
    return re.sub(r"[^\w\-]+", "_", path.strip("/").replace("/", "__")) or "accueil"


def titre_de(body):
    m = re.search(rb"<title[^>]*>(.*?)</title>", body[:200000], re.I | re.S)
    return html.unescape(m.group(1).decode("utf-8", "replace")).strip() if m else ""


def charger_inventaire():
    chemin = os.path.join(OUT, "inventaire.json")
    if not os.path.exists(chemin):
        print("Lance d'abord : python3 cul7ure_recup.py inventaire")
        sys.exit(1)
    with open(chemin, encoding="utf-8") as f:
        return json.load(f)


def inventaire():
    os.makedirs(OUT, exist_ok=True)
    q = urllib.parse.urlencode({
        "url": DOMAIN, "matchType": "domain", "output": "json",
        "fl": "original,timestamp,mimetype,statuscode",
        "filter": "statuscode:200", "collapse": "digest"})
    print("Interrogation de la Wayback Machine (ça peut prendre une ou deux minutes)...")
    code, body = get("https://web.archive.org/cdx/search/cdx?" + q, timeout=180)
    if code != 200 or not body:
        print("Échec (code %s). Réessaie dans quelques minutes." % code)
        sys.exit(1)
    rows = json.loads(body.decode("utf-8"))[1:]
    with open(os.path.join(OUT, "inventaire.json"), "w", encoding="utf-8") as f:
        json.dump(rows, f)

    articles = {}
    for original, ts, mime, _ in rows:
        if "html" in mime:
            p = norm_path(original)
            if est_article(p):
                articles.setdefault(p, []).append(ts)
    with open(os.path.join(OUT, "inventaire_articles.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["chemin", "nb_captures", "premiere_capture", "derniere_capture"])
        for p, l in sorted(articles.items()):
            w.writerow([p, len(l), min(l), max(l)])

    par = {}
    for p in articles:
        k = p.split("/")[1]
        par[k] = par.get(k, 0) + 1
    nb_json = len({o for o, _, m, _ in rows if "json" in m and "wp-json/wp/v2/posts" in o})
    print("\nPages d'articles trouvées : %d" % len(articles))
    for k, n in sorted(par.items(), key=lambda x: -x[1]):
        print("  %-20s %d" % (k, n))
    print("Fichiers JSON de l'API WordPress archivés : %d" % nb_json)
    print("\nListe détaillée : %s" % os.path.join(OUT, "inventaire_articles.csv"))
    print("Étape suivante : python3 cul7ure_recup.py telecharger")


def telecharger():
    rows = charger_inventaire()
    os.makedirs(BRUT, exist_ok=True)
    os.makedirs(JSONS, exist_ok=True)

    caps, jsons = {}, {}
    for original, ts, mime, _ in rows:
        if "html" in mime:
            p = norm_path(original)
            if est_article(p):
                caps.setdefault(p, {})[ts] = original
        elif "json" in mime and "wp-json/wp/v2/posts" in original:
            jsons.setdefault(original, set()).add(ts)

    index_path = os.path.join(OUT, "index_telechargements.csv")
    nouveau = not os.path.exists(index_path)
    idx = open(index_path, "a", newline="", encoding="utf-8")
    w = csv.writer(idx)
    if nouveau:
        w.writerow(["chemin", "titre", "capture_utilisee", "url_wayback", "octets",
                    "mentions_spam", "remarque"])

    total = len(caps)
    print("Téléchargement de %d articles (environ %d minutes)..." % (total, total * 2 * PAUSE // 60 + 1))
    for i, (p, d) in enumerate(sorted(caps.items()), 1):
        dest = os.path.join(BRUT, nom_fichier(p) + ".html")
        if os.path.exists(dest):
            continue
        tous = sorted(d)
        avant = sorted([t for t in tous if t < CUTOFF], reverse=True)
        apres = [t for t in tous if t >= CUTOFF]
        meilleur = None
        for ts in (avant + apres)[:3]:
            url = "https://web.archive.org/web/%sid_/%s" % (ts, d[ts])
            code, body = get(url)
            time.sleep(PAUSE)
            if code != 200 or len(body) < 500:
                continue
            n = len(SPAM.findall(body.decode("utf-8", "replace")))
            if meilleur is None or n < meilleur[2]:
                meilleur = (ts, body, n, url)
            if n < 3:
                break
        if meilleur is None:
            w.writerow([p, "", "", "", 0, 0, "ECHEC : aucune capture lisible"])
            idx.flush()
            print("[%d/%d] ECHEC %s" % (i, total, p))
            continue
        ts, body, n, url = meilleur
        with open(dest, "wb") as f:
            f.write(body)
        remarque = "ATTENTION : spam détecté, à vérifier" if n >= 3 else ""
        if ts >= CUTOFF:
            remarque = (remarque + " capture récente").strip()
        w.writerow([p, titre_de(body), ts, url, len(body), n, remarque])
        idx.flush()
        print("[%d/%d] %s (%s)" % (i, total, p, ts))
    idx.close()

    print("\nJSON de l'API WordPress : %d fichiers" % len(jsons))
    with open(os.path.join(JSONS, "_index.txt"), "w", encoding="utf-8") as ix:
        for k, (orig, tss) in enumerate(sorted(jsons.items()), 1):
            avant = [t for t in tss if t < CUTOFF]
            ts = max(avant) if avant else min(tss)
            dest = os.path.join(JSONS, "%03d.json" % k)
            ix.write("%03d.json\t%s\t%s\n" % (k, ts, orig))
            if os.path.exists(dest):
                continue
            code, body = get("https://web.archive.org/web/%sid_/%s" % (ts, orig))
            time.sleep(PAUSE)
            if code == 200 and body:
                with open(dest, "wb") as f:
                    f.write(body)
    print("Terminé. Résultats dans : %s" % OUT)
    print("Ouvre index_telechargements.csv pour voir ce qui a été récupéré (et les lignes ATTENTION / ECHEC).")


def vivant():
    """Copie brute (sans rien exécuter) des pages que le site actuel sert encore."""
    os.makedirs(VIVANT, exist_ok=True)
    base = "https://" + DOMAIN
    a_voir = [base + c for c in ["/sitemap_index.xml", "/wp-sitemap.xml", "/sitemap.xml", "/post-sitemap.xml"]]
    vus, pages = set(), set()
    while a_voir:
        u = a_voir.pop(0)
        if u in vus:
            continue
        vus.add(u)
        code, body = get(u, tries=2)
        time.sleep(PAUSE)
        print("%s -> code %s, %d octets" % (u, code, len(body)))
        if code != 200:
            continue
        with open(os.path.join(VIVANT, "sitemap_" + nom_fichier(urllib.parse.urlparse(u).path) + ".xml"), "wb") as f:
            f.write(body)
        for loc in re.findall(r"<loc>\s*(.*?)\s*</loc>", body.decode("utf-8", "replace"), re.S):
            loc = html.unescape(loc)
            host = urllib.parse.urlparse(loc).netloc.lower()
            if not (host == DOMAIN or host.endswith("." + DOMAIN)):
                continue  # on ne suit jamais un lien vers un autre site
            if loc.endswith(".xml"):
                a_voir.append(loc)
            else:
                pages.add(loc)
    cibles = sorted(l for l in pages if est_article(norm_path(l)))
    if not pages:
        print("\nAucun sitemap lisible : le site bloque peut-être les robots. Envoie-moi ce résultat.")
        return
    print("\n%d pages dans les sitemaps, dont %d articles probables." % (len(pages), len(cibles)))
    with open(os.path.join(VIVANT, "_toutes_les_urls.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(sorted(pages)))
    for i, l in enumerate(cibles, 1):
        dest = os.path.join(VIVANT, nom_fichier(norm_path(l)) + ".html")
        if os.path.exists(dest):
            continue
        code, body = get(l, tries=2)
        time.sleep(PAUSE)
        if code == 200 and body:
            with open(dest, "wb") as f:
                f.write(body)
            print("[%d/%d] %s" % (i, len(cibles), l))
        else:
            print("[%d/%d] code %s : %s" % (i, len(cibles), code, l))
    print("Terminé. Résultats dans : %s" % VIVANT)


if __name__ == "__main__":
    commandes = {"inventaire": inventaire, "telecharger": telecharger, "vivant": vivant}
    if len(sys.argv) != 2 or sys.argv[1] not in commandes:
        print(__doc__)
        sys.exit(1)
    commandes[sys.argv[1]]()
