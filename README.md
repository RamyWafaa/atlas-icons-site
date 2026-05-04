# Atlas Icons — website

Source for **[iconsatlas.com](https://iconsatlas.com)** — the official showcase site for **Atlas Icons**, a free open-source icon library by **GetIllustrations** for the **Vectoricons.net** marketplace.

7,980 hand-crafted icons across 41 packs, in three stroke weights (thin, regular, bold). MIT licensed, free for commercial use, no attribution required.

> The icons themselves live in the upstream font repo: [Vectopus/Atlas-icons-font](https://github.com/Vectopus/Atlas-icons-font). This repo is just the website that puts a search-and-copy interface on top.

---

## What's on the site

- **Live icon browser** with sidebar pack filter, weight filter (Thin / Regular / Bold / All), and instant token-based search
- **Modal customizer** per icon — pick color, size, stroke variant, then **Download SVG** or **Copy SVG**
- **6 distribution formats**: Webfont, React, Vue, Flutter, React Native, Source SVGs
- **Atlas Icons Figma plugin** — featured at the bottom of the frameworks section
- **41 indexable per-pack pages** (`/pack/<name>/`) — each with unique title, description, canonical, and CollectionPage JSON-LD schema
- **Vectoricons.net marketplace section** highlighting the broader paid offerings
- **9-question FAQ** with FAQPage JSON-LD schema (eligible for Google rich results)
- **Contact** via `hello@getillustrations.com`

---

## Stack

Pure static. Vanilla HTML, hand-written CSS, vanilla JavaScript. **No build step**, no Tailwind, no React, no Node runtime. Deploys as plain files behind nginx.

| Layer | What |
|---|---|
| Markup | Semantic HTML5, single `<h1>`, every section has its own `<h2>` |
| Styling | One `assets/css/site.css` file. Bricolage Grotesque from Google Fonts. Lime `#CCEA4A` accent (the GetIllustrations brand color). |
| Scripting | One `assets/js/app.js` file. Vanilla. **Zero `innerHTML`** — all DOM via `createElement` + `textContent`. No dynamic code execution. |
| Data | One `assets/data/icons.json` (~9.4 MB raw, ~1.5 MB gzipped) with name, class, pack, codepoint, and SVG path data per icon |
| Manifest builder | One `scripts/build-manifest.py` (Python 3, no third-party deps). Generates icons.json + 41 per-pack pages + sitemap.xml |
| Source icons | `vendor/atlas-icons-font/` — checked-in copy of the upstream MIT-licensed font repo |

---

## Repo layout

```
atlas-icons-site/
├── index.html                    main page (template for per-pack pages)
├── assets/
│   ├── css/site.css              all styles
│   ├── js/app.js                 search · filter · modal · download · copy
│   ├── data/icons.json           generated manifest with 7,980 icons + SVG paths
│   └── img/{logo,favicon}.svg    brand assets
├── pack/
│   └── <pack-name>/index.html    one indexable page per pack (41 of them)
├── scripts/
│   └── build-manifest.py         regenerates icons.json + per-pack HTML + sitemap
├── vendor/
│   └── atlas-icons-font/         git clone of the upstream icon font repo
├── sitemap.xml                   42 URLs (home + 41 packs)
├── robots.txt
└── README.md                     this file
```

---

## Build

The only "build" is regenerating the manifest after pulling new icons:

```bash
# Sync upstream icons (manual — vendor is plain files, not a submodule)
git clone --depth 1 https://github.com/Vectopus/Atlas-icons-font.git /tmp/atlas-fresh
rsync -av --delete /tmp/atlas-fresh/ vendor/atlas-icons-font/
rm -rf vendor/atlas-icons-font/.git /tmp/atlas-fresh

# Regenerate manifest + per-pack pages + sitemap
python3 scripts/build-manifest.py
```

Output:
- `assets/data/icons.json` — full icon manifest with extracted SVG paths
- `pack/<name>/index.html` × 41 — per-pack indexable pages with their own metadata
- `sitemap.xml` — home + 41 pack URLs
- The `<!-- BEGIN PACK_LINKS -->` block in `index.html` — static crawlable pack list

---

## Deploy

The site is deployed on the **Photogen VPS** (`148.230.91.193`, Hostinger) alongside the Photogen application. Static files served by nginx behind a Let's Encrypt cert.

```bash
# Push changes
git push origin main

# VPS — pull
ssh root@194.113.64.13 "ssh root@148.230.91.193 'cd /var/www/iconsatlas && git pull --ff-only origin main'"
```

No build, no service restart, no nginx reload — static files are picked up immediately.

**SSL/HSTS** — Let's Encrypt cert auto-renews via Certbot's systemd timer. HSTS header (`max-age=31536000; includeSubDomains`) means once a browser visits successfully, it locks HTTPS for a year.

---

## Security posture

The site has no backend, no database, no user input persisted server-side, no third-party scripts beyond Google Fonts. The XSS surface is small. Everything below is by design:

- **No `innerHTML`** anywhere in `app.js`. Verified at every commit. All dynamic DOM uses `document.createElement()` + `textContent`. URL-hash query is set as `<input>.value` (auto-escaped).
- **No dynamic code execution**. No inline event handlers. Static `<script src="…">` only.
- **JSON-LD scripts are static text** in HTML — no server templating, no user input.
- **All inline SVGs** (Figma logo, brand mark) are static and trusted.
- **CSP** enforced by nginx (see below). Only allows scripts/styles from `'self'` and Google Fonts.
- **HTTPS only** — HSTS preload-eligible (`max-age=31536000; includeSubDomains`). HTTP requests 301-redirect to HTTPS.
- **Standard security headers**: `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(), microphone=(), camera=()`.
- **No `<form>`** that posts anywhere. The contact "form" is a `mailto:` link.
- **No login, no cookies, no localStorage of sensitive data**.
- **The vendor `atlas-icons-font` directory is a clean copy** of `Vectopus/Atlas-icons-font`. The compromised `Vectopus/Atlas-Icons` (full-stack repo) is **NOT used** — see security memory in the parent project for the malware advisory.

### nginx CSP header

Production nginx config sends:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'unsafe-inline';
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data:;
  connect-src 'self';
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
  upgrade-insecure-requests;
```

`'unsafe-inline'` for `script-src` is required because the JSON-LD blocks are inline. They are static text with no user-supplied data, so the practical XSS risk is zero.

---

## Add a new icon pack

1. Add the pack folder to `vendor/atlas-icons-font/packs/<name>/` (with `style.css` + `fonts/`) upstream first.
2. Sync vendor locally (see Build above).
3. `python3 scripts/build-manifest.py` regenerates everything.
4. Commit + push. Pull on the VPS.

---

## Brand

| Asset | Value |
|---|---|
| Brand color | Lime `#CCEA4A` (the GetIllustrations signature) |
| Display font | Bricolage Grotesque (Google Fonts) |
| Body font | Bricolage Grotesque |
| Mono | System monospace stack |
| Logo | `assets/img/logo.svg` (also used as favicon) |

---

## Credits

- **Atlas Icons** is by [Vectopus](https://github.com/Vectopus) / [Ramy Wafaa](https://github.com/RamyWafaa).
- The icon source font lives at [Vectopus/Atlas-icons-font](https://github.com/Vectopus/Atlas-icons-font).
- This website is part of the [GetIllustrations](https://getillustrations.com) ecosystem, made exclusively for the [Vectoricons.net](https://vectoricons.net) marketplace.
- Hand-drawn illustrations and premium custom icon packs by GetIllustrations are at [getillustrations.com](https://getillustrations.com).

---

## License

MIT © 2026 Ramy Wafaa. Same license as the upstream Atlas Icons font set. Use freely in commercial and personal projects, no attribution required.

---

## Contact

- Email: **hello@getillustrations.com**
- Issues (icons): [github.com/Vectopus/Atlas-icons-font/issues](https://github.com/Vectopus/Atlas-icons-font/issues)
- Issues (this site): [github.com/RamyWafaa/atlas-icons-site/issues](https://github.com/RamyWafaa/atlas-icons-site/issues)
