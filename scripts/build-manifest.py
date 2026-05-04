#!/usr/bin/env python3
"""Build icons.json from vendor/atlas-icons-font/packs/*/style.css.

Run from repo root: `python3 scripts/build-manifest.py`
Outputs: assets/data/icons.json
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACKS_DIR = os.path.join(ROOT, "vendor", "atlas-icons-font", "packs")
OUT_PATH = os.path.join(ROOT, "assets", "data", "icons.json")

# .at-arrow-down-thin:before { ... content: "\e906"; }
RX = re.compile(
    r"\.(at-[a-z0-9-]+):before\s*\{[^}]*content:\s*[\"']\\?([0-9a-fA-F]{3,6})[\"']",
    re.MULTILINE,
)


def main() -> int:
    if not os.path.isdir(PACKS_DIR):
        sys.stderr.write(f"packs dir not found: {PACKS_DIR}\n")
        return 1
    icons = []
    pack_counts = {}
    for pack in sorted(os.listdir(PACKS_DIR)):
        css_path = os.path.join(PACKS_DIR, pack, "style.css")
        if not os.path.isfile(css_path):
            continue
        with open(css_path, encoding="utf-8") as f:
            content = f.read()
        matches = RX.findall(content)
        for class_name, codepoint in matches:
            icons.append(
                {
                    "n": class_name[3:].replace("-", " "),  # display name
                    "c": class_name,                         # css class
                    "p": pack,                               # pack
                    "u": codepoint.lower(),                  # unicode codepoint
                }
            )
        pack_counts[pack] = len(matches)

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(
            {"icons": icons, "packs": pack_counts, "total": len(icons)},
            f,
            separators=(",", ":"),
        )
    print(f"Wrote {len(icons)} icons across {len(pack_counts)} packs to {OUT_PATH}")
    print(f"Output size: {os.path.getsize(OUT_PATH) / 1024:.1f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
