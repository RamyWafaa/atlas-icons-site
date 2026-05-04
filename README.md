# Atlas Icons — website

Source for [iconsatlas.com](https://iconsatlas.com), a free open-source icon library showcase. 7,980 icons across 41 packs, all MIT-licensed and ready to drop into any project as a webfont, in React, Vue, Flutter, or React Native.

The icons themselves live in the upstream repo: [Vectopus/Atlas-icons-font](https://github.com/Vectopus/Atlas-icons-font). This repo is just the website that puts a search-and-copy interface on top.

## Stack

Static HTML, hand-written CSS, vanilla JavaScript. No build step. No npm dependencies at runtime. Deploys as plain files behind nginx.

```
index.html               main page
assets/css/site.css      site styles
assets/js/app.js         search, filter, copy, modal logic
assets/data/icons.json   manifest of all 7,980 icons (generated)
scripts/build-manifest.py regenerates icons.json from vendor/
vendor/atlas-icons-font/ git clone of upstream icon repo (MIT)
```

## Build

The only "build" is regenerating the manifest after pulling new icons:

```bash
git submodule update --remote vendor/atlas-icons-font  # if using submodule
# or just `git -C vendor/atlas-icons-font pull` if cloned directly
python3 scripts/build-manifest.py
```

That writes `assets/data/icons.json` with one record per icon: name, class, pack, codepoint.

## Deploy

Deployed as static files behind nginx on the Photogen VPS (`148.230.91.193`). See `docs/DEPLOY.md` (if added) for the nginx config + Let's Encrypt setup.

## Add a new pack

1. Add the pack folder to `vendor/atlas-icons-font/packs/<name>/` (style.css + fonts/) upstream first.
2. `python3 scripts/build-manifest.py` to regenerate icons.json.
3. Commit + push. Redeploy by pulling on the VPS.

## License

MIT, same as the upstream icon set. © Ramy Wafaa.
