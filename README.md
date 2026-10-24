# CuteBoii's Mannequin

## Project layout

- `index.html` — app shell and import map.
- `css/app.css` — all application styling.
- `js/app.js` — Three.js scene, UI, mannequin, posing, props, persistence, and app orchestration.
- `js/translations.js` — Thai UI dictionary and dynamic status-message translations.
- `js/welcome.js` — independent bilingual welcome window.
- `js/language-select.js` — first-visit language picker; remembers the choice and reloads once.
- `js/config.js` — external human-model URLs and model-name safety filter.

## Run locally

Because the app uses JavaScript modules and an import map, open it through a local HTTP server rather than directly as `file://`. From this folder, run:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`. It also works on static hosting as long as the folder structure is preserved.

## Deployment notes

- Keep all paths and filenames intact when uploading.
- The app loads Three.js from jsDelivr and the optional human model from an external repository, so those features require network access.
- The model URL currently uses a moving `@master` reference; pin it to a reviewed commit before a long-term public release.
- The DB Heavent font is externally hosted; confirm its licence and Thai glyph coverage before public launch.
- This refactor separates stable modules while preserving the existing application logic. It improves maintainability; it is not a claim that all runtime bottlenecks have been profiled or eliminated.
