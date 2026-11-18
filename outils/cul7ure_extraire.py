#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Cul7ure : transforme les pages téléchargées depuis la Wayback Machine en
UN DOCUMENT WORD PAR ARTICLE, rangés par rubrique, prêts à être glissés dans
Google Drive (où ils deviennent des Google Docs), + un tableau de suivi.

Commande :
  python3 cul7ure_extraire.py

Résultats (dans cul7ure_archive/) :
  Cul7ure - Archives/<Rubrique>/<date> - <titre>.docx   un document par article
  suivi_cul7ure.csv        tableau de suivi (à importer dans Google Sheets)
  images_a_recuperer.txt   images citées dans les articles (pour plus tard)
  doublons_ecartes.txt     pages en double qui n'ont pas été gardées
Rien n'est exécuté : le HTML est seulement lu comme du texte.
Aucune bibliothèque à installer (Python standard uniquement).
"""
import csv
import gzip
import html
import os
import re
import sys
import unicodedata
import zipfile
from html.parser import HTMLParser

ICI = os.path.dirname(os.path.abspath(__file__))
if os.path.isdir(os.path.join(ICI, "cul7ure_archive", "wayback_html")):
    OUT = os.path.join(ICI, "cul7ure_archive")
elif os.path.isdir(os.path.join(ICI, "wayback_html")):
    OUT = ICI
else:
    OUT = os.path.join(ICI, "cul7ure_archive")
SRC = os.path.join(OUT, "wayback_html")
RACINE = os.path.join(OUT, "Cul7ure - Archives")

MOIS = {"janvier": 1, "février": 2, "fevrier": 2, "mars": 3, "avril": 4, "mai": 5, "juin": 6,
        "juillet": 7, "août": 8, "aout": 8, "septembre": 9, "octobre": 10, "novembre": 11,
        "décembre": 12, "decembre": 12, "january": 1, "february": 2, "march": 3, "april": 4,
        "may": 5, "june": 6, "july": 7, "august": 8, "september": 9, "october": 10,
        "november": 11, "december": 12}
NOMS_MOIS = ["", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août",
             "Septembre", "Octobre", "Novembre", "Décembre"]
RUBRIQUES = {"chroniques": "Chroniques", "chroniques d'album": "Chroniques",
             "chroniques d’album": "Chroniques", "chroniques-dalbum": "Chroniques",
             "dossiers": "Dossiers", "interviews": "Interviews", "parenthèses": "Parenthèses",
             "parentheses": "Parenthèses", "portraits": "Portraits"}
AUTEURS = {"florian7c": "Florian Garcia", "anonyme": "", "admin": "", "admin7894": ""}
SPAM = re.compile(r"casino|bookmaker|plinko|hors arjel|paris sportif", re.I)
INVISIBLES = re.compile("[​‌‍⁠﻿­]")
XML_INTERDIT = re.compile("[\x00-\x08\x0b\x0c\x0e-\x1f]")


# ---------------------------------------------------------------- lecture

def lire(chemin):
    b = open(chemin, "rb").read()
    if b[:2] == b"\x1f\x8b":  # certaines captures sont restées compressées
        try:
            b = gzip.decompress(b)
        except Exception:
            pass
    return b.decode("utf-8", "replace")


def propre(fragment):
    s = re.sub(r"<[^>]+>", "", fragment or "")
    s = INVISIBLES.sub("", html.unescape(s))
    return re.sub(r"\s+", " ", s).strip()


def date_iso(brut):
    s = propre(brut).lower()
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return "%s-%s-%s" % m.groups()
    m = re.search(r"(\d{1,2})(?:er)?\s+([a-zéûèô]+),?\s+(\d{4})", s)
    if m and m.group(2) in MOIS:
        return "%s-%02d-%02d" % (m.group(3), MOIS[m.group(2)], int(m.group(1)))
    m = re.search(r"([a-zéûèô]+)\s+(\d{1,2}),?\s+(\d{4})", s)
    if m and m.group(1) in MOIS:
        return "%s-%02d-%02d" % (m.group(3), MOIS[m.group(1)], int(m.group(2)))
    return ""


def rubrique_propre(nom, chemin):
    r = RUBRIQUES.get(propre(nom).lower())
    if not r:
        r = RUBRIQUES.get(chemin.strip("/").split("/")[0], "Autres")
    return r


def auteur_propre(nom):
    n = propre(nom)
    return AUTEURS.get(n.lower(), n)


def extraire(t):
    """Repère titre, auteur, date, rubrique, image et le HTML du corps de l'article.
    Le site a connu trois habillages successifs : A (2022-2025), B (2021), C (2020)."""
    if "blog-post single-post" in t and 'class="post-inner"' in t:
        i = t.find('class="post-inner"')
        z = t[i:]
        g = lambda rx: (re.search(rx, z, re.S) or [None, ""])[1]
        titre = propre(g(r'class="post-title"[^>]*>(.*?)</h\d>'))
        date = date_iso(g(r'class="post-date"[^>]*>(.*?)</'))
        auteur = auteur_propre(g(r'class="author-link"[^>]*>(.*?)</a>'))
        rub = g(r'class="cat-links"[^>]*>.*?<a [^>]*>(.*?)</a>')
        pid = (re.search(r'id="post-(\d+)" class="blog-post single-post', t) or [None, ""])[1]
        h = t.find("post-title", i)
        debut = t.find("</div>", t.find("</h", h)) + len("</div>")
        fins = [p for p in (t.find('<div class="swp_social_panel', debut),
                            t.find('<div class="swp-content-locator', debut),
                            t.find('<div class="post-entry-footer', debut),
                            t.find('<div class="post-navigation', debut)) if p != -1]
        fin = min(fins) if fins else len(t)
        tete = t[:t.find('class="content-section"')] if 'class="content-section"' in t else ""
        imgs = [s for s in re.findall(r'<img[^>]+src="([^"]+wp-content/uploads[^"]+)"', tete)
                if "cropped-" not in s and "logo" not in s.lower()]
        return dict(gabarit="A", titre=titre, date=date, auteur=auteur, rub=rub, pid=pid,
                    image=imgs[-1] if imgs else "", corps=t[debut:fin])
    if '<div class="entry-content"' in t:
        i = t.find('<div class="entry-content"')
        av = t[:i]
        last = lambda rx: (re.findall(rx, av, re.S) or [""])[-1]
        titre = propre(last(r'class="entry-title"[^>]*>(.*?)</h\d>'))
        date = date_iso(last(r'entry-date published" datetime="([^"]+)"'))
        auteur = auteur_propre(last(r'class="author vcard"><a[^>]*>(.*?)</a>'))
        bloc_cat = last(r'class="post-cats-list"[^>]*>(.*?)</div>')
        rub = (re.findall(r'<a [^>]*>(.*?)</a>', bloc_cat) or [""])[0]
        pid = (re.search(r'<article id="post-(\d+)"', t) or [None, ""])[1]
        vignette = av[av.rfind('class="post-thumbnail"'):] if 'class="post-thumbnail"' in av else ""
        imgs = re.findall(r'<img[^>]+src="([^"]+wp-content/uploads[^"]+)"', vignette)
        debut = t.find(">", i) + 1
        fins = [p for p in (t.find("<!-- .entry-content -->", debut),
                            t.find('<footer class="entry-footer"', debut)) if p != -1]
        fin = min(fins) if fins else len(t)
        return dict(gabarit="B", titre=titre, date=date, auteur=auteur, rub=rub, pid=pid,
                    image=imgs[0] if imgs else "", corps=t[debut:fin])
    if 'class="article-area__content"' in t:
        i = t.find('class="article-area__content"')
        titre = propre((re.search(r'class="article-caption__title"[^>]*>(.*?)</h1>', t, re.S) or [None, ""])[1])
        cap = propre((re.search(r'class="article-area__caption"[^>]*>(.*?)</div>', t, re.S) or [None, ""])[1])
        m = re.search(r"le (.+?) par (.+?) dans (.+)$", cap)
        date, auteur, rub = (date_iso(m.group(1)), auteur_propre(m.group(2)), m.group(3)) if m else ("", "", "")
        vign = (re.search(r'class="article-caption__thumbnail".*?<img[^>]+src="([^"]+)"', t, re.S) or [None, ""])[1]
        debut = t.find(">", i) + 1
        fins = [p for p in (t.find('<meta itemprop="author"', debut), t.find("</article>", debut)) if p != -1]
        fin = min(fins) if fins else len(t)
        return dict(gabarit="C", titre=titre, date=date, auteur=auteur, rub=rub, pid="",
                    image=vign, corps=t[debut:fin])
    return None


# ---------------------------------------------------------------- HTML -> paragraphes

class Paragraphes(HTMLParser):
    """Découpe le corps de l'article en paragraphes typés, avec gras / italique / liens."""
    BLOCS = {"p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "figcaption", "div", "figure",
             "section", "ul", "ol", "tr", "table", "pre", "blockquote", "cite", "hr"}
    MUETS = {"script", "style", "noscript", "svg", "button", "form", "select", "textarea"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocs = []
        self.cour = None
        self.gras = self.ital = self.muet = 0
        self.titre = self.legende = self.source = self.citation = self.liste = 0
        self.liens = []
        self.centre = []

    def _type(self):
        if self.titre:
            return "h2" if self.titre <= 2 else "h3"
        if self.legende:
            return "legende"
        if self.citation:
            return "citation"
        if self.liste:
            return "li"
        return "p"

    def _clore(self):
        b = self.cour
        self.cour = None
        if not b:
            return
        runs = [r for r in b["runs"] if r[0]]
        while runs and not runs[0][0].strip(" \n\t "):
            runs.pop(0)
        while runs and not runs[-1][0].strip(" \n\t "):
            runs.pop()
        if not runs:
            return
        runs[0][0] = runs[0][0].lstrip(" \n\t")
        runs[-1][0] = runs[-1][0].rstrip(" \n\t")
        b["runs"] = runs
        self.blocs.append(b)

    def _texte(self, s):
        if self.cour is None:
            if not s.strip():
                return
            self.cour = {"type": self._type(), "centre": bool(self.centre and self.centre[-1]),
                         "runs": []}
            s = s.lstrip()
        runs = self.cour["runs"]
        if runs and runs[-1][0].endswith((" ", "\n")) and s.startswith(" "):
            s = s.lstrip(" ")
        fmt = (self.gras > 0, self.ital > 0, self.liens[-1] if self.liens else "")
        if runs and tuple(runs[-1][1:]) == fmt:
            runs[-1][0] += s
        else:
            runs.append([s, fmt[0], fmt[1], fmt[2]])

    def _special(self, type_, **kw):
        self._clore()
        d = {"type": type_, "centre": False, "runs": []}
        d.update(kw)
        self.blocs.append(d)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in self.MUETS:
            self.muet += 1
            return
        if self.muet:
            return
        classe = a.get("class") or ""
        if tag in self.BLOCS:
            self._clore()
            if tag in ("p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "figcaption", "cite"):
                self.centre.append("has-text-align-center" in classe or "center" in (a.get("style") or ""))
            if tag[0] == "h" and tag[1:].isdigit():
                self.titre = int(tag[1])
            elif tag == "figcaption":
                self.legende += 1
            elif tag == "blockquote":
                self.citation += 1
            elif tag == "li":
                self.liste += 1
            elif tag == "cite" and self.citation:
                self.source += 1
        elif tag == "br":
            if self.cour:
                self._texte("\n")
        elif tag in ("strong", "b"):
            self.gras += 1
        elif tag in ("em", "i"):
            self.ital += 1
        elif tag == "a":
            self.liens.append(a.get("href") or "")
        elif tag == "img":
            src = a.get("data-src") or a.get("data-lazy-src") or a.get("src") or ""
            if src and not src.startswith("data:") and "gravatar" not in src and "s.w.org" not in src:
                self._special("image", src=src, alt=a.get("alt") or "")
        elif tag == "iframe":
            src = a.get("src") or a.get("data-src") or ""
            if src:
                self._special("video", src=src, alt=a.get("title") or "")

    def handle_endtag(self, tag):
        if tag in self.MUETS:
            self.muet = max(0, self.muet - 1)
            return
        if self.muet:
            return
        if tag in self.BLOCS:
            self._clore()
            if tag in ("p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "figcaption", "cite") and self.centre:
                self.centre.pop()
            if tag[0] == "h" and tag[1:].isdigit():
                self.titre = 0
            elif tag == "figcaption":
                self.legende = max(0, self.legende - 1)
            elif tag == "blockquote":
                self.citation = max(0, self.citation - 1)
            elif tag == "li":
                self.liste = max(0, self.liste - 1)
            elif tag == "cite":
                self.source = max(0, self.source - 1)
        elif tag in ("strong", "b"):
            self.gras = max(0, self.gras - 1)
        elif tag in ("em", "i"):
            self.ital = max(0, self.ital - 1)
        elif tag == "a" and self.liens:
            self.liens.pop()

    def handle_data(self, data):
        if self.muet:
            return
        s = INVISIBLES.sub("", data)
        s = re.sub(r"[ \t\r\n]+", " ", s)
        if s:
            self._texte(s)

    def resultat(self):
        self._clore()
        return self.blocs


# ---------------------------------------------------------------- règles éditoriales

def guillemets(runs):
    """« » à la française (espaces insécables). Retourne (runs, nb de corrections, alerte)."""
    texte = "".join(r[0] for r in runs)
    droits = texte.count('"')
    convertir = droits % 2 == 0
    seq, n, ouvert = [], 0, False
    for r in runs:
        fmt = tuple(r[1:])
        for c in r[0]:
            if c == "“":
                c, n = "«", n + 1
            elif c == "”":
                c, n = "»", n + 1
            elif c == '"' and convertir:
                c, n, ouvert = ("»" if ouvert else "«"), n + 1, not ouvert
            seq.append((c, fmt))
    res = []
    for c, f in seq:
        if c == "»":
            while res and res[-1][0] in "  ":
                res.pop()
            res.append((" ", f))
            res.append(("»", f))
            continue
        if c in "  " and len(res) >= 2 and res[-1][0] == " " and res[-2][0] == "«":
            continue
        res.append((c, f))
        if c == "«":
            res.append((" ", f))
    out = []
    for c, f in res:
        if out and tuple(out[-1][1:]) == f:
            out[-1][0] += c
        else:
            out.append([c, f[0], f[1], f[2]])
    if out:
        out[0][0] = out[0][0].lstrip("  ") if out[0][0].lstrip("  ") else out[0][0]
    return out, n, (droits % 2 == 1)


def lien_utile(href):
    """Les liens vers cul7ure.fr pointent désormais vers un site de casino :
    on les redirige vers l'archive de la Wayback Machine."""
    if not href or href.startswith(("#", "mailto:", "javascript:")):
        return href if href and href.startswith("mailto:") else ""
    if re.match(r"https?://(www\.)?cul7ure\.fr", href):
        return "https://web.archive.org/web/2024/" + href
    if href.startswith("/"):
        return "https://web.archive.org/web/2024/https://cul7ure.fr" + href
    m = re.match(r"https?://(?:www\.)?youtube\.com/embed/([\w-]+)", href)
    if m:
        return "https://www.youtube.com/watch?v=" + m.group(1)
    return href


def nom_image(src):
    return urllib_unquote(src.split("?")[0].rstrip("/").split("/")[-1])


def urllib_unquote(s):
    try:
        from urllib.parse import unquote
        return unquote(s)
    except Exception:
        return s


# ---------------------------------------------------------------- écriture .docx

def x(s):
    s = XML_INTERDIT.sub("", s)
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


STYLES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="both"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="0" w:after="240"/><w:jc w:val="left"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="34"/><w:szCs w:val="34"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="320" w:after="160"/><w:jc w:val="left"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="27"/><w:szCs w:val="27"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:jc w:val="left"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Signature"><w:name w:val="Signature"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:spacing w:after="360"/><w:jc w:val="center"/></w:pPr><w:rPr><w:i/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="120" w:after="120"/><w:ind w:left="567" w:right="567"/><w:jc w:val="center"/></w:pPr><w:rPr><w:i/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Note"><w:name w:val="Note"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:jc w:val="left"/></w:pPr><w:rPr><w:i/><w:color w:val="808080"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="1155CC"/><w:u w:val="single"/></w:rPr></w:style>
</w:styles>"""

ENTETE_DOC = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
              '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
              'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>')
FIN_DOC = ('<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" '
           'w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>'
           '</w:body></w:document>')


class Docx:
    def __init__(self):
        self.paras = []
        self.liens = []

    def para(self, runs, style="Normal", centre=False, retrait=False):
        ppr = ""
        if style != "Normal":
            ppr += '<w:pStyle w:val="%s"/>' % style
        if retrait:
            ppr += '<w:ind w:left="360" w:hanging="360"/>'
        if centre:
            ppr += '<w:jc w:val="center"/>'
        xml = "<w:p>" + ("<w:pPr>%s</w:pPr>" % ppr if ppr else "")
        for texte, gras, ital, href in runs:
            rpr = ("<w:b/>" if gras else "") + ("<w:i/>" if ital else "")
            if href:
                rpr = '<w:rStyle w:val="Hyperlink"/>' + rpr
            morceaux = []
            for k, ligne in enumerate(texte.split("\n")):
                if k:
                    morceaux.append("<w:br/>")
                if ligne:
                    morceaux.append('<w:t xml:space="preserve">%s</w:t>' % x(ligne))
            r = "<w:r>%s%s</w:r>" % ("<w:rPr>%s</w:rPr>" % rpr if rpr else "", "".join(morceaux))
            if href:
                self.liens.append(href)
                r = '<w:hyperlink r:id="rIdL%d">%s</w:hyperlink>' % (len(self.liens), r)
            xml += r
        self.paras.append(xml + "</w:p>")

    def enregistrer(self, chemin, titre, auteur):
        rels = ['<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
                '<Relationship Id="rIdT" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>']
        for k, h in enumerate(self.liens, 1):
            rels.append('<Relationship Id="rIdL%d" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="%s" TargetMode="External"/>' % (k, x(h)))
        with zipfile.ZipFile(chemin, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("[Content_Types].xml",
                       '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                       '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                       '<Default Extension="xml" ContentType="application/xml"/>'
                       '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
                       '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
                       '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>'
                       '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>')
            z.writestr("_rels/.rels",
                       '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                       '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
                       '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>')
            z.writestr("docProps/core.xml",
                       '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
                       'xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>%s</dc:title><dc:creator>%s</dc:creator></cp:coreProperties>' % (x(titre), x(auteur or "Cul7ure")))
            z.writestr("word/_rels/document.xml.rels",
                       '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">%s</Relationships>' % "".join(rels))
            z.writestr("word/styles.xml", STYLES)
            z.writestr("word/settings.xml",
                       '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                       '<w:compat><w:doNotExpandShiftReturn/></w:compat></w:settings>')
            z.writestr("word/document.xml", ENTETE_DOC + "".join(self.paras) + FIN_DOC)


# ---------------------------------------------------------------- programme

def cle_titre(titre):
    s = unicodedata.normalize("NFKD", titre.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "", s)


def nom_fichier(date, titre):
    t = INVISIBLES.sub("", titre)
    t = re.sub(r'[\\/:*?"<>|\n\r\t]+', " ", t).replace(" ", " ")
    t = re.sub(r"\s+", " ", t).strip(" .")[:110].strip(" .")
    return unicodedata.normalize("NFC", "%s - %s" % (date or "sans date", t or "sans titre"))


def date_capture(ts):
    return "%s/%s/%s" % (ts[6:8], ts[4:6], ts[0:4]) if len(ts) >= 8 else ""


def main():
    if not os.path.isdir(SRC):
        print("Dossier introuvable : %s\nLance d'abord les commandes inventaire et telecharger." % SRC)
        sys.exit(1)

    index = {}
    p_index = os.path.join(OUT, "index_telechargements.csv")
    if os.path.exists(p_index):
        for r in csv.DictReader(open(p_index, encoding="utf-8")):
            index[r["chemin"].strip("/")] = r

    fichiers = sorted(f for f in os.listdir(SRC) if f.endswith(".html"))
    articles, pages_liste, illisibles = [], 0, []
    slugs_vus, liens_internes = set(), {}
    for nom in fichiers:
        slug = nom[:-5]
        chemin = slug.replace("__", "/")
        if re.match(r"\d{4}__", slug):
            pages_liste += 1
            continue
        t = lire(os.path.join(SRC, nom))
        slugs_vus.add(chemin.split("/")[-1])
        a = extraire(t)
        if a is None or not a["titre"]:
            illisibles.append(chemin)
            continue
        a["chemin"] = chemin
        blocs = Paragraphes()
        blocs.feed(a["corps"])
        a["blocs"] = blocs.resultat()
        texte = " ".join("".join(r[0] for r in b["runs"]) for b in a["blocs"])
        a["mots"] = len(re.findall(r"\w+", texte))
        a["spam"] = len(SPAM.findall(texte))
        for b in a["blocs"]:
            for r in b["runs"]:
                m = re.match(r"https?://(?:www\.)?cul7ure\.fr/([^?#]+?)/?$", r[3] or "")
                if m and not re.match(r"(wp-|author|category|tag|page|feed)", m.group(1)):
                    dernier = m.group(1).split("/")[-1]
                    if dernier and not dernier.isdigit() and m.group(1).strip("/") not in RUBRIQUES:
                        liens_internes.setdefault(dernier, (m.group(1), r[0].strip(), a["titre"]))
        articles.append(a)

    # doublons : même article publié sous deux adresses / deux habillages
    rang = {"A": 0, "B": 1, "C": 2}
    articles.sort(key=lambda a: (rang[a["gabarit"]], -a["mots"]))
    gardes, doublons, vus_t, vus_id = [], [], {}, {}
    for a in articles:
        k = cle_titre(a["titre"])
        double = vus_t.get(k) or (vus_id.get(a["pid"]) if a["pid"] else None)
        if double:
            doublons.append((double["chemin"], a["chemin"]))
            if not double["date"] and a["date"]:
                double["date"] = a["date"]
            if not double["auteur"] and a["auteur"]:
                double["auteur"] = a["auteur"]
            continue
        vus_t[k] = a
        if a["pid"]:
            vus_id[a["pid"]] = a
        gardes.append(a)
    gardes.sort(key=lambda a: (a["date"] or "9999", a["titre"]))

    os.makedirs(RACINE, exist_ok=True)
    lignes, images, noms_pris = [], [], set()
    total_corrections = 0
    for num, a in enumerate(gardes, 1):
        rub = rubrique_propre(a["rub"], a["chemin"])
        alertes, corrections = [], 0
        d = Docx()
        titre_runs, n, _ = guillemets([[a["titre"], False, False, ""]])
        titre = titre_runs[0][0] if titre_runs else a["titre"]
        corrections += n
        d.para([[titre, False, False, ""]], "Heading1")
        an, mo = (a["date"][:4], int(a["date"][5:7])) if a["date"] else ("", 0)
        quand = ("%s %s" % (NOMS_MOIS[mo], an)) if mo else "[date à vérifier]"
        qui = a["auteur"] or "[auteur à vérifier]"
        d.para([["Par %s, %s" % (qui, quand), False, False, ""]], "Signature")
        if not a["auteur"]:
            alertes.append("auteur à retrouver")
        if not a["date"]:
            alertes.append("date à retrouver")
        if a["image"]:
            d.para([["[Image à la une : %s]" % nom_image(a["image"]), False, False, ""]], "Note")
            images.append((a["titre"], a["image"]))
        for b in a["blocs"]:
            if b["type"] == "image":
                d.para([["[Image : %s]" % nom_image(b["src"]), False, False, ""]], "Note")
                images.append((a["titre"], b["src"]))
                continue
            if b["type"] == "video":
                src = lien_utile(b["src"])
                quoi = "Vidéo YouTube" if "youtu" in src else "Contenu intégré"
                d.para([["[%s : %s]" % (quoi, b["alt"] or src), False, False, src]], "Note")
                continue
            runs = [[r[0], r[1], r[2], lien_utile(r[3])] for r in b["runs"]]
            runs, n, impair = guillemets(runs)
            corrections += n
            if impair:
                alertes.append("guillemets droits à vérifier")
            if b["type"] in ("h2", "h3"):
                d.para(runs, "Heading2" if b["type"] == "h2" else "Heading3", b["centre"])
            elif b["type"] == "citation":
                d.para(runs, "Quote")
            elif b["type"] == "legende":
                d.para([["Légende : ", False, False, ""]] + runs, "Note")
            elif b["type"] == "li":
                d.para([["– ", False, False, ""]] + runs, retrait=True)
            else:
                d.para(runs, "Normal", b["centre"])
        info = index.get(a["chemin"], {})
        source = info.get("url_wayback") or "https://web.archive.org/web/2024/https://cul7ure.fr/%s/" % a["chemin"]
        d.para([["Source : ", False, False, ""], ["cul7ure.fr/%s" % a["chemin"], False, False, source],
                [" — archive Wayback Machine du %s" % date_capture(info.get("capture_utilisee", "")), False, False, ""]], "Note")
        if a["mots"] < 150:
            alertes.append("texte très court")
        if a["spam"] >= 2:
            alertes.append("spam possible")
        if a["gabarit"] == "C":
            alertes.append("ancienne version (2020)")

        dossier = os.path.join(RACINE, rub)
        os.makedirs(dossier, exist_ok=True)
        base = nom_fichier(a["date"], titre)
        nom, k = base, 2
        while (rub, nom.lower()) in noms_pris:
            nom, k = "%s (%d)" % (base, k), k + 1
        noms_pris.add((rub, nom.lower()))
        d.enregistrer(os.path.join(dossier, nom + ".docx"), titre, a["auteur"])
        total_corrections += corrections
        lignes.append([num, rub, a["date"], titre.replace(" ", " "), a["auteur"], a["mots"], nom, source,
                       "TRUE", "FALSE", "FALSE", "FALSE", "FALSE", " ; ".join(dict.fromkeys(alertes)),
                       ("%d guillemets passés en « »" % corrections) if corrections else ""])

    # articles cités dans d'autres articles mais absents de l'archive
    manquants = [(v[0], v[1], v[2]) for s, v in sorted(liens_internes.items()) if s not in slugs_vus]
    for chemin, texte_lien, cite_dans in manquants:
        lignes.append([len(lignes) + 1, rubrique_propre("", chemin), "", texte_lien or chemin, "", 0, "",
                       "https://web.archive.org/web/2024/https://cul7ure.fr/%s/" % chemin.strip("/"),
                       "FALSE", "FALSE", "FALSE", "FALSE", "FALSE",
                       "introuvable dans l'archive (cité dans « %s »)" % cite_dans, ""])

    with open(os.path.join(OUT, "suivi_cul7ure.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["N°", "Rubrique", "Date", "Titre", "Auteur", "Mots", "Nom du Google Doc",
                    "Source (archive)", "Téléchargé", "Sur Google Docs", "Contenu vérifié",
                    "Relu par Florian", "Relu par Amélien", "Alertes", "Corrections automatiques"])
        w.writerows(lignes)
    with open(os.path.join(OUT, "images_a_recuperer.txt"), "w", encoding="utf-8") as f:
        for titre, src in images:
            if "wp-content/uploads" in src:
                pleine = re.sub(r"-\d+x\d+(\.\w+)$", r"\1", src.split("?")[0])
                f.write("%s\t%s\t%s\n" % (titre, pleine, src))
    with open(os.path.join(OUT, "doublons_ecartes.txt"), "w", encoding="utf-8") as f:
        f.write("Version gardée\tVersion écartée\n")
        for g, e in doublons:
            f.write("%s\t%s\n" % (g, e))

    par = {}
    for l in lignes[:len(gardes)]:
        par[l[1]] = par.get(l[1], 0) + 1
    print("Articles uniques : %d  (doublons écartés : %d, pages de liste ignorées : %d)"
          % (len(gardes), len(doublons), pages_liste))
    for r, n in sorted(par.items()):
        print("  %-12s %d" % (r, n))
    if illisibles:
        print("Pages illisibles : %d -> %s" % (len(illisibles), ", ".join(illisibles)))
    print("Articles avec alerte : %d" % sum(1 for l in lignes[:len(gardes)] if l[13]))
    print("Guillemets corrigés automatiquement : %d" % total_corrections)
    print("Articles cités mais absents de l'archive : %d" % len(manquants))
    print("\nDocuments : %s" % RACINE)
    print("Tableau de suivi : %s" % os.path.join(OUT, "suivi_cul7ure.csv"))


if __name__ == "__main__":
    main()
