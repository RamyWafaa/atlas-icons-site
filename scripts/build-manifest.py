#!/usr/bin/env python3
"""Build manifest, per-pack HTML pages, and sitemap for iconsatlas.com.

Outputs:
  - assets/data/icons.json           — full icon manifest with SVG path data
  - pack/<pack>/index.html           — one indexable page per pack (41 of them)
  - sitemap.xml                      — sitemap with home + 41 pack URLs

Run from repo root:
    python3 scripts/build-manifest.py
"""
import json
import os
import re
import sys
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACKS_DIR = os.path.join(ROOT, "vendor", "atlas-icons-font", "packs")
JSON_OUT = os.path.join(ROOT, "assets", "data", "icons.json")
PACK_OUT_DIR = os.path.join(ROOT, "pack")
SITEMAP_OUT = os.path.join(ROOT, "sitemap.xml")
TEMPLATE_HTML = os.path.join(ROOT, "index.html")

CLASS_RX = re.compile(
    r"\.(at-[a-z0-9-]+):before\s*\{[^}]*content:\s*[\"']\\?([0-9a-fA-F]{3,6})[\"']",
    re.MULTILINE,
)
GLYPH_RX = re.compile(
    r'<glyph\s+(?=[^>]*unicode="&#x([0-9a-fA-F]+);")'
    r'(?=[^>]*\sd="([^"]*)")'
    r'(?:[^>]*?\shoriz-adv-x="(\d+)")?',
    re.MULTILINE,
)
FONT_DEFAULT_ADVANCE_RX = re.compile(r'<font[^>]*horiz-adv-x="(\d+)"')


def parse_pack_glyphs(pack_name):
    svg_path = os.path.join(PACKS_DIR, pack_name, "fonts", f"{pack_name}.svg")
    if not os.path.isfile(svg_path):
        return {}, 1024
    with open(svg_path, encoding="utf-8") as f:
        content = f.read()
    default_advance_match = FONT_DEFAULT_ADVANCE_RX.search(content)
    default_advance = int(default_advance_match.group(1)) if default_advance_match else 1024
    glyphs = {}
    for m in GLYPH_RX.finditer(content):
        cp = m.group(1).lower()
        d = m.group(2)
        w = int(m.group(3)) if m.group(3) else default_advance
        if d:
            glyphs[cp] = {"d": d, "w": w}
    return glyphs, default_advance


def pretty(pack):
    return pack.replace("-", " ").title()


def build_manifest(packs):
    icons = []
    pack_counts = {}
    pack_advance = {}
    missing = 0
    for pack in packs:
        css_path = os.path.join(PACKS_DIR, pack, "style.css")
        if not os.path.isfile(css_path):
            continue
        with open(css_path, encoding="utf-8") as f:
            css = f.read()
        glyphs, default_advance = parse_pack_glyphs(pack)
        pack_advance[pack] = default_advance
        for class_name, codepoint in CLASS_RX.findall(css):
            cp = codepoint.lower()
            entry = {
                "n": class_name[3:].replace("-", " "),
                "c": class_name,
                "p": pack,
                "u": cp,
            }
            g = glyphs.get(cp)
            if g:
                entry["d"] = g["d"]
                entry["w"] = g["w"]
            else:
                missing += 1
            icons.append(entry)
        pack_counts[pack] = sum(1 for i in icons if i["p"] == pack)
    os.makedirs(os.path.dirname(JSON_OUT), exist_ok=True)
    with open(JSON_OUT, "w", encoding="utf-8") as f:
        json.dump(
            {
                "icons": icons,
                "packs": pack_counts,
                "packAdvance": pack_advance,
                "total": len(icons),
                "viewBox": "0 0 1024 1024",
                "flipTransform": "translate(0, 960) scale(1, -1)",
            },
            f,
            separators=(",", ":"),
        )
    print(f"Wrote {len(icons)} icons across {len(pack_counts)} packs ({missing} missing SVG path) to {JSON_OUT}")
    print(f"  size: {os.path.getsize(JSON_OUT) / 1024:.1f} KB")
    return icons, pack_counts


# Per-pack page builder ----------------------------------------------------

# Template tokens we replace in index.html for each per-pack page. The home
# index.html acts as the template; we run targeted str.replace on these
# unique substrings. Keep in sync with index.html when those lines change.
TEMPLATE_TOKENS = {
    "title": "<title>Atlas Icons — 7,980 free open-source icons by GetIllustrations</title>",
    "description_meta": '<meta name="description" content="7,980 hand-crafted open-source icons across 41 packs. Made by GetIllustrations exclusively for the Vectoricons.net marketplace. MIT licensed.">',
    "canonical": '<link rel="canonical" href="https://iconsatlas.com/">',
    "og_title": '<meta property="og:title" content="Atlas Icons — 7,980 hand-crafted open-source icons">',
    "og_description": '<meta property="og:description" content="MIT-licensed icon library by GetIllustrations. 41 packs, webfont + React + Vue + Flutter + React Native. Free forever.">',
    "og_url": '<meta property="og:url" content="https://iconsatlas.com/">',
    "schema_block": "<script type=\"application/ld+json\">",  # marker; we replace whole block via different strategy below
    "app_script": '<script src="assets/js/app.js"></script>',
}


def render_pack_page(template, pack, count, total, all_packs):
    pname = pretty(pack)
    title = f"{pname} Icons — {count} Free SVG & Webfont Icons · Atlas Icons"
    if len(title) > 70:
        title = f"{pname} Icons — {count} Free Icons · Atlas Icons"
    desc = (
        f"Browse {count} free {pname.lower()} icons by Atlas Icons. Download as SVG, "
        f"or use as a webfont, in React, Vue, Flutter, or React Native. MIT licensed."
    )
    if len(desc) > 160:
        desc = (
            f"Browse {count} free {pname.lower()} icons. Download SVG, use as webfont "
            f"or in React/Vue/Flutter. MIT licensed."
        )
    canonical = f"https://iconsatlas.com/pack/{pack}/"
    og_title = f"{pname} Icons — {count} free SVG icons · Atlas Icons"

    html = template

    html = html.replace(
        TEMPLATE_TOKENS["title"],
        f"<title>{title}</title>",
    )
    html = html.replace(
        TEMPLATE_TOKENS["description_meta"],
        f'<meta name="description" content="{desc}">',
    )
    html = html.replace(
        TEMPLATE_TOKENS["canonical"],
        f'<link rel="canonical" href="{canonical}">\n  <base href="/">',
    )
    html = html.replace(
        TEMPLATE_TOKENS["og_title"],
        f'<meta property="og:title" content="{og_title}">',
    )
    html = html.replace(
        TEMPLATE_TOKENS["og_description"],
        f'<meta property="og:description" content="{desc}">',
    )
    html = html.replace(
        TEMPLATE_TOKENS["og_url"],
        f'<meta property="og:url" content="{canonical}">',
    )

    # Append a CollectionPage JSON-LD before the existing SoftwareApplication block
    pack_schema = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": f"{pname} Icons",
        "description": desc,
        "url": canonical,
        "isPartOf": {"@type": "WebSite", "name": "Atlas Icons", "url": "https://iconsatlas.com/"},
        "publisher": {"@type": "Organization", "name": "GetIllustrations", "url": "https://getillustrations.com"},
        "mainEntity": {
            "@type": "ItemList",
            "numberOfItems": count,
            "name": f"{count} {pname.lower()} icons",
        },
        "license": "https://opensource.org/licenses/MIT",
    }
    extra_schema = (
        '<script type="application/ld+json">'
        + json.dumps(pack_schema, separators=(",", ":"))
        + "</script>\n  "
    )
    html = html.replace(
        '<script type="application/ld+json">',
        extra_schema + '<script type="application/ld+json">',
        1,
    )

    # Inline state hand-off: app.js reads window.__INITIAL_PACK to pre-set the filter
    html = html.replace(
        TEMPLATE_TOKENS["app_script"],
        f'<script>window.__INITIAL_PACK={json.dumps(pack)};</script>\n  <script src="assets/js/app.js"></script>',
    )

    return html


def write_pack_pages(template, pack_counts, total):
    all_packs = sorted(pack_counts.keys())
    written = 0
    for pack in all_packs:
        count = pack_counts[pack]
        page = render_pack_page(template, pack, count, total, all_packs)
        out_dir = os.path.join(PACK_OUT_DIR, pack)
        os.makedirs(out_dir, exist_ok=True)
        with open(os.path.join(out_dir, "index.html"), "w", encoding="utf-8") as f:
            f.write(page)
        written += 1
    print(f"Wrote {written} per-pack pages to {PACK_OUT_DIR}/")


# Sitemap ------------------------------------------------------------------

def write_sitemap(pack_counts):
    base = "https://iconsatlas.com"
    today = date.today().isoformat()
    lines = ['<?xml version="1.0" encoding="UTF-8"?>']
    lines.append('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    lines.append("  <url>")
    lines.append(f"    <loc>{base}/</loc>")
    lines.append(f"    <lastmod>{today}</lastmod>")
    lines.append("    <changefreq>weekly</changefreq>")
    lines.append("    <priority>1.0</priority>")
    lines.append("  </url>")
    for pack in sorted(pack_counts.keys()):
        lines.append("  <url>")
        lines.append(f"    <loc>{base}/pack/{pack}/</loc>")
        lines.append(f"    <lastmod>{today}</lastmod>")
        lines.append("    <changefreq>monthly</changefreq>")
        lines.append("    <priority>0.8</priority>")
        lines.append("  </url>")
    lines.append("</urlset>")
    with open(SITEMAP_OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print(f"Wrote sitemap with {1 + len(pack_counts)} URLs to {SITEMAP_OUT}")


# ------------------------------------------------------------------------

def main() -> int:
    if not os.path.isdir(PACKS_DIR):
        sys.stderr.write(f"packs dir not found: {PACKS_DIR}\n")
        return 1

    packs = [p for p in sorted(os.listdir(PACKS_DIR)) if os.path.isdir(os.path.join(PACKS_DIR, p))]
    icons, pack_counts = build_manifest(packs)

    if not os.path.isfile(TEMPLATE_HTML):
        sys.stderr.write(f"Template not found: {TEMPLATE_HTML}\n")
        return 1
    with open(TEMPLATE_HTML, encoding="utf-8") as f:
        template = f.read()

    # Update the static crawlable pack-link block in index.html. We keep this
    # block in the home page so search engines discover every pack URL on
    # first crawl, even before any JS executes. Block lives between the
    # `<!-- BEGIN PACK_LINKS -->` and `<!-- END PACK_LINKS -->` markers.
    pack_links_html = "\n".join(
        f'      <li><a href="/pack/{p}/">{pretty(p)} <span>{pack_counts[p]}</span></a></li>'
        for p in sorted(pack_counts.keys())
    )
    new_block = (
        "<!-- BEGIN PACK_LINKS -->\n"
        + pack_links_html
        + "\n      <!-- END PACK_LINKS -->"
    )
    template_with_links = re.sub(
        r"<!-- BEGIN PACK_LINKS -->.*?<!-- END PACK_LINKS -->",
        new_block,
        template,
        count=1,
        flags=re.DOTALL,
    )
    if template_with_links != template:
        with open(TEMPLATE_HTML, "w", encoding="utf-8") as f:
            f.write(template_with_links)
        template = template_with_links
        print(f"Updated PACK_LINKS block in {TEMPLATE_HTML} ({len(pack_counts)} entries)")
    # Sanity check that the template has the tokens we expect
    missing_tokens = [k for k, v in TEMPLATE_TOKENS.items() if v not in template]
    if missing_tokens:
        sys.stderr.write(
            "WARNING: template tokens missing: "
            + ", ".join(missing_tokens)
            + "\n  Per-pack pages will be incomplete. Update TEMPLATE_TOKENS in this script.\n"
        )

    write_pack_pages(template, pack_counts, len(icons))
    write_sitemap(pack_counts)
    return 0


if __name__ == "__main__":
    sys.exit(main())
