#!/usr/bin/env python3
"""Build icons.json (metadata + SVG path data) from vendor/atlas-icons-font/.

For each icon:
  - n: display name
  - c: CSS class name
  - p: pack name (slug)
  - u: unicode codepoint (hex)
  - d: SVG path `d` attribute extracted from the SVG font glyph
  - w: horiz-adv-x for that glyph (icon width in em units, defaults to pack default)

The SVG paths come from `vendor/atlas-icons-font/packs/<pack>/fonts/<pack>.svg`
which is an SVG-font file (one <glyph> per icon). We rebuild a real SVG
client-side using `viewBox="0 0 1024 1024"` plus a flip transform.

Run from repo root:
    python3 scripts/build-manifest.py

Output: assets/data/icons.json (~3-5 MB; gzips ~600 KB-1 MB).
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACKS_DIR = os.path.join(ROOT, "vendor", "atlas-icons-font", "packs")
OUT_PATH = os.path.join(ROOT, "assets", "data", "icons.json")

# Class declarations in pack/style.css:
#   .at-arrow-down-thin:before { ... content: "\e906"; }
CLASS_RX = re.compile(
    r"\.(at-[a-z0-9-]+):before\s*\{[^}]*content:\s*[\"']\\?([0-9a-fA-F]{3,6})[\"']",
    re.MULTILINE,
)

# Glyph entries in pack/fonts/<pack>.svg:
#   <glyph unicode="&#xe900;" glyph-name="..." horiz-adv-x="1024" d="M..." />
# horiz-adv-x is optional (defaults to font's outer horiz-adv-x).
GLYPH_RX = re.compile(
    r'<glyph\s+(?=[^>]*unicode="&#x([0-9a-fA-F]+);")'
    r'(?=[^>]*\sd="([^"]*)")'
    r'(?:[^>]*?\shoriz-adv-x="(\d+)")?',
    re.MULTILINE,
)

FONT_DEFAULT_ADVANCE_RX = re.compile(r'<font[^>]*horiz-adv-x="(\d+)"')


def parse_pack_glyphs(pack_name):
    """Return dict of codepoint(lower hex) -> {d, w}."""
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
        if d:  # skip empty/missing glyphs
            glyphs[cp] = {"d": d, "w": w}
    return glyphs, default_advance


def main() -> int:
    if not os.path.isdir(PACKS_DIR):
        sys.stderr.write(f"packs dir not found: {PACKS_DIR}\n")
        return 1
    icons = []
    pack_counts = {}
    pack_advance = {}
    missing_svg_count = 0

    for pack in sorted(os.listdir(PACKS_DIR)):
        css_path = os.path.join(PACKS_DIR, pack, "style.css")
        if not os.path.isfile(css_path):
            continue
        with open(css_path, encoding="utf-8") as f:
            css = f.read()

        glyphs, default_advance = parse_pack_glyphs(pack)
        pack_advance[pack] = default_advance

        for class_name, codepoint in CLASS_RX.findall(css):
            cp = codepoint.lower()
            glyph = glyphs.get(cp)
            entry = {
                "n": class_name[3:].replace("-", " "),
                "c": class_name,
                "p": pack,
                "u": cp,
            }
            if glyph:
                entry["d"] = glyph["d"]
                entry["w"] = glyph["w"]
            else:
                missing_svg_count += 1
            icons.append(entry)
        pack_counts[pack] = sum(1 for i in icons if i["p"] == pack)

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
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
    print(f"Wrote {len(icons)} icons across {len(pack_counts)} packs to {OUT_PATH}")
    print(f"  with SVG path: {len(icons) - missing_svg_count}")
    print(f"  missing SVG path: {missing_svg_count}")
    print(f"Output size: {os.path.getsize(OUT_PATH) / 1024:.1f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
